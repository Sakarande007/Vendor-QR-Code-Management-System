import { getConnection } from "../config/db.js";
import { query } from "../config/db.js";
import { incrementInvoiceSequence } from "../config/redis.js";
import { ApiError } from "../utils/ApiError.js";
import { writeAuditLog } from "../utils/auditHelper.js";
import { isAdmin } from "../utils/accessControl.js";
import {
  buildCursorPage,
  keysetWhereClauseByKey,
  parsePaginationQuery,
  sqlInlineLimit,
} from "../utils/pagination.js";
import {
  calculatePendingQty,
  determinePOStatusFromBalance,
  validatePOLineQty,
} from "../utils/poCalculations.js";
import { generateQR, clearQrCaches } from "./qrService.js";
import {
  invalidatePoDetail,
  invalidateVendorPoCaches,
  del,
  cacheKeys,
} from "./cacheService.js";
import {
  clearSubmitStatus,
  getSubmitStatus,
} from "./invoiceSubmitStatusService.js";
import {
  getMaterialUnitPriceMap,
  resolveInvoiceUnitPrice,
} from "../utils/materialPricing.js";

const INVOICEABLE_PO_STATUSES = ["open", "partially_invoiced"];

/**
 * @param {import('express').Request} req
 * @returns {string}
 */
function requireVendorCode(req) {
  if (!req.user?.vendorCode) {
    throw ApiError.forbidden("Vendor account is not linked to a vendor code");
  }
  return req.user.vendorCode;
}

/**
 * @param {Date|string} date
 * @returns {string} YYYYMMDD
 */
function toDateKey(date) {
  const d = date instanceof Date ? date : new Date(date);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}${m}${day}`;
}

/**
 * @param {string} dateStr YYYY-MM-DD or Date
 */
export function formatSqlDate(dateStr) {
  if (dateStr instanceof Date) {
    return dateStr.toISOString().slice(0, 10);
  }
  return String(dateStr).slice(0, 10);
}

/**
 * Thread-safe system invoice ID via Redis INCR.
 * Format: INV-{vendorCode}-{YYYYMMDD}-{6-digit-sequence}
 * @param {string} vendorCode
 * @param {Date|string} [date]
 * @returns {Promise<string>}
 */
export async function generateSystemInvoiceId(vendorCode, date = new Date()) {
  const dateKey = toDateKey(date);
  const seq = await incrementInvoiceSequence(vendorCode, dateKey);
  const padded = String(seq).padStart(6, "0");
  return `INV-${vendorCode}-${dateKey}-${padded}`;
}

/**
 * @param {import('mysql2/promise').PoolConnection|null} conn
 * @param {object[]} lines Input lines from client
 * @param {string} poNumber
 * @param {string} vendorCode
 * @param {string} poPlantCode
 * @param {boolean} forUpdate Use SELECT FOR UPDATE when conn provided
 * @returns {Promise<{ valid: boolean, errors: Array<{ field: string, message: string }>, poLines: object[]|null }>}
 */
export async function validateInvoiceLines(
  conn,
  lines,
  poNumber,
  vendorCode,
  poPlantCode,
  forUpdate = false,
  partialExistingQtyByLine = null
) {
  /** @type {Array<{ field: string, message: string }>} */
  const errors = [];

  if (!lines?.length) {
    return {
      valid: false,
      errors: [{ field: "lines", message: "At least one invoice line is required" }],
      poLines: null,
    };
  }

  const lockClause = forUpdate ? " FOR UPDATE" : "";
  const executor = conn ?? { execute: (...args) => query(...args) };

  const [poHeaders] = await executor.execute(
    `SELECT po_number, vendor_code, plant_code, status
     FROM po_headers
     WHERE po_number = ? AND vendor_code = ?${lockClause}`,
    [poNumber, vendorCode]
  );

  if (!poHeaders.length) {
    return {
      valid: false,
      errors: [{ field: "poNumber", message: "Purchase order not found for this vendor" }],
      poLines: null,
    };
  }

  const po = poHeaders[0];

  if (!INVOICEABLE_PO_STATUSES.includes(po.status)) {
    return {
      valid: false,
      errors: [
        {
          field: "poNumber",
          message: `PO status '${po.status}' is not eligible for invoicing`,
        },
      ],
      poLines: null,
    };
  }

  const [poLines] = await executor.execute(
    `SELECT line_no, material_code, ordered_qty, received_qty, pending_qty,
            COALESCE(dispatched_qty, 0) AS dispatched_qty,
            COALESCE(balance_qty, pending_qty, ordered_qty - received_qty) AS balance_qty,
            uom, storage_location_code, unit_price
     FROM po_lines
     WHERE po_number = ?${lockClause}`,
    [poNumber]
  );

  const poLineMap = new Map(poLines.map((pl) => [Number(pl.line_no), pl]));
  const usedLines = new Set();

  const validatedLines = [];

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    const prefix = `lines[${i}]`;

    if (usedLines.has(line.poLineNo)) {
      errors.push({
        field: `${prefix}.poLineNo`,
        message: "Duplicate PO line number in invoice",
      });
      continue;
    }
    usedLines.add(line.poLineNo);

    const poLine = poLineMap.get(Number(line.poLineNo));
    if (!poLine) {
      errors.push({
        field: `${prefix}.poLineNo`,
        message: `PO line ${line.poLineNo} does not exist`,
      });
      continue;
    }

    if (line.plantCode !== po.plant_code) {
      errors.push({
        field: `${prefix}.plantCode`,
        message: `Plant code must match PO plant (${po.plant_code})`,
      });
    }

    if (line.uom !== poLine.uom) {
      errors.push({
        field: `${prefix}.uom`,
        message: `UOM must match PO line UOM (${poLine.uom})`,
      });
    }

    const availableQty = Number(
      poLine.balance_qty ??
        poLine.pending_qty ??
        calculatePendingQty(poLine.ordered_qty, poLine.received_qty)
    );
    const targetQty = Number(line.invoiceQty);
    const existingOnInvoice =
      partialExistingQtyByLine?.get(Number(line.poLineNo)) ?? 0;
    const qtyToDispatch =
      partialExistingQtyByLine
        ? Math.round((targetQty - existingOnInvoice) * 1000) / 1000
        : targetQty;

    if (partialExistingQtyByLine && qtyToDispatch < 0) {
      errors.push({
        field: `${prefix}.invoiceQty`,
        message: `Cannot reduce invoiced quantity below ${existingOnInvoice}`,
      });
    } else {
      const qtyCheck = validatePOLineQty(qtyToDispatch, availableQty);

      if (!qtyCheck.valid) {
        errors.push({
          field: `${prefix}.invoiceQty`,
          message: qtyCheck.message ?? "Invalid invoice quantity",
        });
      }
    }

    validatedLines.push({
      poLineNo: line.poLineNo,
      materialCode: poLine.material_code,
      plantCode: line.plantCode,
      storageLocationCode: line.storageLocationCode ?? poLine.storage_location_code,
      invoiceQty: Number(line.invoiceQty),
      uom: poLine.uom,
      unitPrice: Number(poLine.unit_price ?? 0),
      poLine,
    });
  }

  if (poPlantCode && po.plant_code !== poPlantCode) {
    errors.push({ field: "poNumber", message: "PO plant mismatch" });
  }

  if (errors.length === 0 && validatedLines.length) {
    const priceMap = await getMaterialUnitPriceMap(
      validatedLines.map((line) => line.materialCode)
    );
    for (const line of validatedLines) {
      line.unitPrice = resolveInvoiceUnitPrice(
        priceMap.get(line.materialCode),
        line.unitPrice
      );
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    poLines: errors.length === 0 ? validatedLines : null,
  };
}

/**
 * @param {object} row
 */
function formatInvoiceSummary(row) {
  return {
    invoiceId: row.invoice_id,
    systemInvoiceId: row.system_invoice_id,
    invoiceNumber: row.invoice_number,
    vendorCode: row.vendor_code,
    vendorName: row.vendor_name ?? undefined,
    poNumber: row.po_number,
    invoiceDate: row.invoice_date,
    status: row.status,
    lineCount: Number(row.line_count ?? 0),
    qrGenerated: Boolean(row.qr_generated_at),
    qrGeneratedAt: row.qr_generated_at,
    submittedAt: row.submitted_at,
    rejectionReason: row.rejection_reason ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * @param {number} invoiceId
 */
export async function getInvoiceWithLines(invoiceId) {
  const [headers] = await query(
    `SELECT i.invoice_id, i.system_invoice_id, i.invoice_number, i.vendor_code,
            v.vendor_name, i.po_number, i.invoice_date, i.status, i.rejection_reason,
            i.qr_code_data, i.qr_generated_at, i.submitted_at, i.created_by,
            i.created_at, i.updated_at
     FROM invoices i
     LEFT JOIN vendors v ON v.vendor_code = i.vendor_code
     WHERE i.invoice_id = ?`,
    [invoiceId]
  );

  if (!headers.length) {
    throw ApiError.notFound("Invoice not found");
  }

  const [[lines], [qrRows]] = await Promise.all([
    query(
      `SELECT il.id, il.po_line_no, il.material_code, m.material_description,
            il.plant_code, il.storage_location_code, il.invoice_qty, il.uom,
            COALESCE(NULLIF(il.unit_price, 0), m.unit_price, 0) AS unit_price,
            pl.ordered_qty,
            COALESCE(pl.balance_qty, pl.pending_qty) AS balance_qty
     FROM invoice_lines il
     INNER JOIN materials m ON m.material_code = il.material_code
     INNER JOIN invoices i ON i.invoice_id = il.invoice_id
     INNER JOIN po_lines pl ON pl.po_number = i.po_number AND pl.line_no = il.po_line_no
     WHERE il.invoice_id = ?
     ORDER BY il.po_line_no`,
      [invoiceId]
    ),
    query(
      `SELECT qr_id, qr_data_encrypted, qr_data_hash, generated_at, scanned_count
     FROM qr_codes WHERE invoice_id = ?`,
      [invoiceId]
    ),
  ]);

  return {
    invoice: formatInvoiceSummary(headers[0]),
    lines: lines.map((l) => ({
      id: l.id,
      poLineNo: l.po_line_no,
      materialCode: l.material_code,
      materialDescription: l.material_description,
      plantCode: l.plant_code,
      storageLocationCode: l.storage_location_code,
      invoiceQty: Number(l.invoice_qty),
      uom: l.uom,
      unitPrice: Number(l.unit_price),
      orderedQty: Number(l.ordered_qty),
      balanceQty: Number(l.balance_qty),
    })),
    qr:
      qrRows.length > 0
        ? {
            qrId: qrRows[0].qr_id,
            qrDataEncrypted: qrRows[0].qr_data_encrypted,
            qrDataHash: qrRows[0].qr_data_hash,
            generatedAt: qrRows[0].generated_at,
            scannedCount: qrRows[0].scanned_count,
            qrCodeData: headers[0].qr_code_data,
          }
        : headers[0].qr_code_data
          ? { qrCodeData: headers[0].qr_code_data, generatedAt: headers[0].qr_generated_at }
          : null,
  };
}

/**
 * @param {string} vendorCode
 * @param {number} actorUserId
 * @param {object} body
 * @param {object} audit
 */
export async function createInvoiceDraftForVendor(vendorCode, actorUserId, body, audit) {
  const [dup] = await query(
    `SELECT invoice_id FROM invoices
     WHERE vendor_code = ? AND invoice_number = ? LIMIT 1`,
    [vendorCode, body.invoiceNumber]
  );
  if (dup.length) {
    throw ApiError.badRequest("Invoice number already exists for this vendor");
  }

  const validation = await validateInvoiceLines(
    null,
    body.lines,
    body.poNumber,
    vendorCode,
    null,
    false
  );

  if (!validation.valid) {
    throw ApiError.unprocessable("Invoice validation failed", validation.errors);
  }

  const systemInvoiceId = await generateSystemInvoiceId(vendorCode, body.invoiceDate);
  const conn = await getConnection();

  try {
    await conn.beginTransaction();

    const [headerResult] = await conn.execute(
      `INSERT INTO invoices
        (system_invoice_id, invoice_number, vendor_code, po_number, invoice_date, status, created_by)
       VALUES (?, ?, ?, ?, ?, 'draft', ?)`,
      [
        systemInvoiceId,
        body.invoiceNumber,
        vendorCode,
        body.poNumber,
        formatSqlDate(body.invoiceDate),
        actorUserId,
      ]
    );

    const invoiceId = headerResult.insertId;

    for (const line of validation.poLines) {
      await conn.execute(
        `INSERT INTO invoice_lines
          (invoice_id, po_line_no, material_code, plant_code, storage_location_code, invoice_qty, uom, unit_price)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          invoiceId,
          line.poLineNo,
          line.materialCode,
          line.plantCode,
          line.storageLocationCode,
          line.invoiceQty,
          line.uom,
          line.unitPrice ?? 0,
        ]
      );
    }

    await writeAuditLog(conn, {
      actorUserId: audit.actorUserId ?? actorUserId,
      action: "INVOICE_DRAFT_CREATE",
      entityType: "invoice",
      entityId: String(invoiceId),
      oldValues: null,
      newValues: { systemInvoiceId, invoiceNumber: body.invoiceNumber, poNumber: body.poNumber },
      ipAddress: audit.ipAddress,
      userAgent: audit.userAgent,
    });

    await conn.commit();

    return getInvoiceWithLines(invoiceId);
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

const APPENDABLE_INVOICE_STATUSES = ["submitted", "qr_generated", "verified"];

/**
 * @param {import('mysql2/promise').PoolConnection} conn
 * @param {number} invoiceId
 * @param {object[]} validatedLines
 */
async function replaceInvoiceDraftLines(conn, invoiceId, validatedLines) {
  await conn.execute(`DELETE FROM invoice_lines WHERE invoice_id = ?`, [invoiceId]);

  for (const line of validatedLines) {
    await conn.execute(
      `INSERT INTO invoice_lines
        (invoice_id, po_line_no, material_code, plant_code, storage_location_code, invoice_qty, uom, unit_price)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        invoiceId,
        line.poLineNo,
        line.materialCode,
        line.plantCode,
        line.storageLocationCode,
        line.invoiceQty,
        line.uom,
        line.unitPrice ?? 0,
      ]
    );
  }
}

/**
 * Clears cached QR images after invoice line quantities change.
 * @param {number} invoiceId
 */
async function invalidateInvoiceQrCaches(invoiceId) {
  await clearQrCaches(invoiceId);
}

/**
 * Adds partial quantities to an already-submitted invoice (same vendor invoice number).
 * @param {string} vendorCode
 * @param {number} invoiceId
 * @param {object[]} inputLines
 * @param {string} poNumber
 * @param {object} audit
 */
export async function appendPartialInvoiceTransaction(
  vendorCode,
  invoiceId,
  inputLines,
  poNumber,
  audit
) {
  const conn = await getConnection();

  try {
    await conn.beginTransaction();

    const [invoices] = await conn.execute(
      `SELECT invoice_id, po_number, system_invoice_id, status
       FROM invoices
       WHERE invoice_id = ? AND vendor_code = ?
         AND status IN ('submitted', 'qr_generated', 'verified')
       FOR UPDATE`,
      [invoiceId, vendorCode]
    );

    if (!invoices.length) {
      throw ApiError.notFound("Invoice not found or not eligible for partial invoicing");
    }

    const invoice = invoices[0];

    if (invoice.po_number !== poNumber) {
      throw ApiError.badRequest("PO number does not match the existing invoice");
    }

    const [existingInvoiceLines] = await conn.execute(
      `SELECT po_line_no, invoice_qty FROM invoice_lines WHERE invoice_id = ?`,
      [invoiceId]
    );
    const partialExistingQtyByLine = new Map(
      existingInvoiceLines.map((row) => [
        Number(row.po_line_no),
        Number(row.invoice_qty),
      ])
    );

    const validation = await validateInvoiceLines(
      conn,
      inputLines,
      poNumber,
      vendorCode,
      null,
      true,
      partialExistingQtyByLine
    );

    if (!validation.valid) {
      throw ApiError.unprocessable("Invoice validation failed", validation.errors);
    }

    const dispatchDate = formatSqlDate(new Date());

    for (const line of validation.poLines) {
      const pl = line.poLine;
      const balanceBefore = Number(
        pl.balance_qty ??
          pl.pending_qty ??
          calculatePendingQty(pl.ordered_qty, pl.received_qty)
      );
      const previousQty = partialExistingQtyByLine.get(line.poLineNo) ?? 0;
      const newTotalQty = line.invoiceQty;
      const deltaQty = Math.round((newTotalQty - previousQty) * 1000) / 1000;

      if (deltaQty <= 0) {
        if (existingInvoiceLines.some((row) => Number(row.po_line_no) === line.poLineNo)) {
          const [existingLines] = await conn.execute(
            `SELECT id FROM invoice_lines
             WHERE invoice_id = ? AND po_line_no = ?`,
            [invoiceId, line.poLineNo]
          );
          if (existingLines.length) {
            await conn.execute(
              `UPDATE invoice_lines SET unit_price = ? WHERE id = ?`,
              [line.unitPrice ?? 0, existingLines[0].id]
            );
          }
        }
        continue;
      }

      const qtyCheck = validatePOLineQty(deltaQty, balanceBefore);

      if (!qtyCheck.valid) {
        throw ApiError.unprocessable(
          `Line ${line.poLineNo}: ${qtyCheck.message}`,
          validation.errors
        );
      }

      const balanceAfter = Math.max(
        0,
        Math.round((balanceBefore - deltaQty) * 1000) / 1000
      );
      const newDispatched =
        Math.round((Number(pl.dispatched_qty) + deltaQty) * 1000) / 1000;
      const newReceived = Number(pl.received_qty) + deltaQty;
      const newPending = balanceAfter;

      const [existingLines] = await conn.execute(
        `SELECT id, invoice_qty FROM invoice_lines
         WHERE invoice_id = ? AND po_line_no = ?`,
        [invoiceId, line.poLineNo]
      );

      if (existingLines.length) {
        await conn.execute(
          `UPDATE invoice_lines SET invoice_qty = ?, unit_price = ? WHERE id = ?`,
          [newTotalQty, line.unitPrice ?? 0, existingLines[0].id]
        );
      } else {
        await conn.execute(
          `INSERT INTO invoice_lines
            (invoice_id, po_line_no, material_code, plant_code, storage_location_code, invoice_qty, uom, unit_price)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            invoiceId,
            line.poLineNo,
            line.materialCode,
            line.plantCode,
            line.storageLocationCode,
            newTotalQty,
            line.uom,
            line.unitPrice ?? 0,
          ]
        );
      }

      await conn.execute(
        `UPDATE po_lines
         SET dispatched_qty = ?,
             balance_qty = ?,
             received_qty = ?,
             pending_qty = ?,
             updated_at = NOW(3)
         WHERE po_number = ? AND line_no = ?`,
        [
          newDispatched,
          balanceAfter,
          newReceived,
          newPending,
          invoice.po_number,
          line.poLineNo,
        ]
      );

      await conn.execute(
        `INSERT INTO vendor_dispatch_history
          (po_number, po_line_no, vendor_code, material_code, invoice_id,
           system_invoice_id, dispatched_qty, balance_before, balance_after, dispatch_date)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          invoice.po_number,
          line.poLineNo,
          vendorCode,
          line.materialCode,
          invoiceId,
          invoice.system_invoice_id,
          deltaQty,
          balanceBefore,
          balanceAfter,
          dispatchDate,
        ]
      );
    }

    const [updatedPoLines] = await conn.execute(
      `SELECT ordered_qty,
              COALESCE(balance_qty, pending_qty) AS balance_qty
       FROM po_lines WHERE po_number = ?`,
      [invoice.po_number]
    );

    const poStatus = determinePOStatusFromBalance(
      updatedPoLines.map((pl) => ({
        orderedQty: pl.ordered_qty,
        balanceQty: pl.balance_qty,
      }))
    );

    await conn.execute(`UPDATE po_headers SET status = ? WHERE po_number = ?`, [
      poStatus,
      invoice.po_number,
    ]);

    await invalidateInvoiceQrCaches(invoiceId);
    const qrResult = await generateQR(invoiceId, conn);

    await writeAuditLog(conn, {
      actorUserId: audit.actorUserId,
      action: "INVOICE_PARTIAL_APPEND",
      entityType: "invoice",
      entityId: String(invoiceId),
      oldValues: { status: invoice.status },
      newValues: { status: "qr_generated", poStatus, partialAppend: true },
      ipAddress: audit.ipAddress,
      userAgent: audit.userAgent,
    });

    await conn.commit();

    await invalidateVendorPoCaches(vendorCode);
    await invalidatePoDetail(vendorCode, invoice.po_number);

    const full = await getInvoiceWithLines(invoiceId);
    return {
      ...full,
      partialAppend: true,
      qr: {
        ...full.qr,
        qrImageBase64: qrResult.qrImageBase64,
        systemInvoiceId: qrResult.systemInvoiceId,
      },
    };
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

/**
 * Vendor resubmits a rejected invoice with corrected quantities and regenerates QR.
 * PO balance was restored on admin rejection; this dispatches the new quantities.
 * @param {string} vendorCode
 * @param {number} invoiceId
 * @param {object[]} inputLines
 * @param {string} poNumber
 * @param {Date|string} invoiceDate
 * @param {object} audit
 */
export async function resubmitRejectedInvoiceTransaction(
  vendorCode,
  invoiceId,
  inputLines,
  poNumber,
  invoiceDate,
  audit
) {
  const conn = await getConnection();

  try {
    await conn.beginTransaction();

    const [invoices] = await conn.execute(
      `SELECT invoice_id, po_number, system_invoice_id, status
       FROM invoices
       WHERE invoice_id = ? AND vendor_code = ? AND status = 'rejected'
       FOR UPDATE`,
      [invoiceId, vendorCode]
    );

    if (!invoices.length) {
      throw ApiError.notFound("Rejected invoice not found");
    }

    const invoice = invoices[0];

    if (invoice.po_number !== poNumber) {
      throw ApiError.badRequest("PO number does not match the rejected invoice");
    }

    const validation = await validateInvoiceLines(
      conn,
      inputLines,
      poNumber,
      vendorCode,
      null,
      true
    );

    if (!validation.valid) {
      throw ApiError.unprocessable("Invoice validation failed", validation.errors);
    }

    await replaceInvoiceDraftLines(conn, invoiceId, validation.poLines);

    await conn.execute(
      `UPDATE invoices
       SET status = 'submitted',
           rejection_reason = NULL,
           invoice_date = ?,
           submitted_at = NOW(3),
           qr_generated_at = NULL,
           qr_code_data = NULL
       WHERE invoice_id = ?`,
      [formatSqlDate(invoiceDate), invoiceId]
    );

    const dispatchDate = formatSqlDate(new Date());

    for (const line of validation.poLines) {
      const pl = line.poLine;
      const balanceBefore = Number(
        pl.balance_qty ??
          pl.pending_qty ??
          calculatePendingQty(pl.ordered_qty, pl.received_qty)
      );
      const qtyCheck = validatePOLineQty(line.invoiceQty, balanceBefore);

      if (!qtyCheck.valid) {
        throw ApiError.unprocessable(
          `Line ${line.poLineNo}: ${qtyCheck.message}`,
          validation.errors
        );
      }

      const invoiceQty = line.invoiceQty;
      const balanceAfter = Math.max(
        0,
        Math.round((balanceBefore - invoiceQty) * 1000) / 1000
      );
      const newDispatched =
        Math.round((Number(pl.dispatched_qty) + invoiceQty) * 1000) / 1000;
      const newReceived = Number(pl.received_qty) + invoiceQty;
      const newPending = balanceAfter;

      await conn.execute(
        `UPDATE po_lines
         SET dispatched_qty = ?,
             balance_qty = ?,
             received_qty = ?,
             pending_qty = ?,
             updated_at = NOW(3)
         WHERE po_number = ? AND line_no = ?`,
        [
          newDispatched,
          balanceAfter,
          newReceived,
          newPending,
          invoice.po_number,
          line.poLineNo,
        ]
      );

      await conn.execute(
        `INSERT INTO vendor_dispatch_history
          (po_number, po_line_no, vendor_code, material_code, invoice_id,
           system_invoice_id, dispatched_qty, balance_before, balance_after, dispatch_date)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          invoice.po_number,
          line.poLineNo,
          vendorCode,
          line.materialCode,
          invoiceId,
          invoice.system_invoice_id,
          invoiceQty,
          balanceBefore,
          balanceAfter,
          dispatchDate,
        ]
      );
    }

    const [updatedPoLines] = await conn.execute(
      `SELECT ordered_qty,
              COALESCE(balance_qty, pending_qty) AS balance_qty
       FROM po_lines WHERE po_number = ?`,
      [invoice.po_number]
    );

    const poStatus = determinePOStatusFromBalance(
      updatedPoLines.map((pl) => ({
        orderedQty: pl.ordered_qty,
        balanceQty: pl.balance_qty,
      }))
    );

    await conn.execute(`UPDATE po_headers SET status = ? WHERE po_number = ?`, [
      poStatus,
      invoice.po_number,
    ]);

    await invalidateInvoiceQrCaches(invoiceId);
    const qrResult = await generateQR(invoiceId, conn);

    await writeAuditLog(conn, {
      actorUserId: audit.actorUserId,
      action: "INVOICE_RESUBMIT_AFTER_REJECT",
      entityType: "invoice",
      entityId: String(invoiceId),
      oldValues: { status: "rejected" },
      newValues: { status: "qr_generated", poStatus },
      ipAddress: audit.ipAddress,
      userAgent: audit.userAgent,
    });

    await conn.commit();

    await invalidateVendorPoCaches(vendorCode);
    await invalidatePoDetail(vendorCode, invoice.po_number);

    const full = await getInvoiceWithLines(invoiceId);
    return {
      ...full,
      regeneratedFromRejected: true,
      qr: {
        ...full.qr,
        qrImageBase64: qrResult.qrImageBase64,
        systemInvoiceId: qrResult.systemInvoiceId,
      },
    };
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

/**
 * Create, update draft, submit, or append partial quantities on an existing invoice number.
 * @param {string} vendorCode
 * @param {number} actorUserId
 * @param {object} body
 * @param {object} audit
 * @param {"draft"|"submit"} mode
 */
export async function persistInvoiceForVendor(vendorCode, actorUserId, body, audit, mode) {
  const [existingRows] = await query(
    `SELECT invoice_id, po_number, status FROM invoices
     WHERE vendor_code = ? AND invoice_number = ? LIMIT 1`,
    [vendorCode, body.invoiceNumber]
  );

  if (!existingRows.length) {
    if (mode === "submit") {
      const draft = await createInvoiceDraftForVendor(vendorCode, actorUserId, body, audit);
      return submitInvoiceTransaction(vendorCode, draft.invoice.invoiceId, audit);
    }
    return createInvoiceDraftForVendor(vendorCode, actorUserId, body, audit);
  }

  const existing = existingRows[0];

  if (existing.po_number !== body.poNumber) {
    throw ApiError.badRequest(
      "Invoice number already exists for a different PO. Use a different invoice number."
    );
  }

  if (existing.status === "draft") {
    const conn = await getConnection();

    try {
      await conn.beginTransaction();

      const validation = await validateInvoiceLines(
        conn,
        body.lines,
        body.poNumber,
        vendorCode,
        null,
        false
      );

      if (!validation.valid) {
        throw ApiError.unprocessable("Invoice validation failed", validation.errors);
      }

      await conn.execute(
        `UPDATE invoices SET invoice_date = ? WHERE invoice_id = ?`,
        [formatSqlDate(body.invoiceDate), existing.invoice_id]
      );

      await replaceInvoiceDraftLines(conn, existing.invoice_id, validation.poLines);

      await writeAuditLog(conn, {
        actorUserId: audit.actorUserId ?? actorUserId,
        action: "INVOICE_DRAFT_UPDATE",
        entityType: "invoice",
        entityId: String(existing.invoice_id),
        oldValues: { status: "draft" },
        newValues: { invoiceNumber: body.invoiceNumber, poNumber: body.poNumber },
        ipAddress: audit.ipAddress,
        userAgent: audit.userAgent,
      });

      await conn.commit();
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }

    if (mode === "submit") {
      return submitInvoiceTransaction(vendorCode, existing.invoice_id, audit);
    }
    return getInvoiceWithLines(existing.invoice_id);
  }

  if (APPENDABLE_INVOICE_STATUSES.includes(existing.status)) {
    if (mode !== "submit") {
      throw ApiError.badRequest(
        "This invoice was already submitted. Use Generate Invoice & QR to add partial quantities."
      );
    }
    return appendPartialInvoiceTransaction(
      vendorCode,
      existing.invoice_id,
      body.lines,
      body.poNumber,
      audit
    );
  }

  if (existing.status === "rejected") {
    if (mode === "submit") {
      return resubmitRejectedInvoiceTransaction(
        vendorCode,
        existing.invoice_id,
        body.lines,
        body.poNumber,
        body.invoiceDate,
        audit
      );
    }

    const conn = await getConnection();

    try {
      await conn.beginTransaction();

      const validation = await validateInvoiceLines(
        conn,
        body.lines,
        body.poNumber,
        vendorCode,
        null,
        false
      );

      if (!validation.valid) {
        throw ApiError.unprocessable("Invoice validation failed", validation.errors);
      }

      await conn.execute(
        `UPDATE invoices
         SET status = 'draft', rejection_reason = NULL, invoice_date = ?,
             qr_generated_at = NULL, qr_code_data = NULL
         WHERE invoice_id = ?`,
        [formatSqlDate(body.invoiceDate), existing.invoice_id]
      );

      await replaceInvoiceDraftLines(conn, existing.invoice_id, validation.poLines);

      await writeAuditLog(conn, {
        actorUserId: audit.actorUserId ?? actorUserId,
        action: "INVOICE_REJECTED_RESET_DRAFT",
        entityType: "invoice",
        entityId: String(existing.invoice_id),
        oldValues: { status: "rejected" },
        newValues: { status: "draft", invoiceNumber: body.invoiceNumber },
        ipAddress: audit.ipAddress,
        userAgent: audit.userAgent,
      });

      await conn.commit();
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }

    return getInvoiceWithLines(existing.invoice_id);
  }

  throw ApiError.badRequest("Invoice cannot be updated in its current status");
}

/**
 * @param {import('express').Request} req
 * @param {object} body
 * @param {object} audit
 */
export async function createInvoiceDraft(req, body, audit) {
  const vendorCode = requireVendorCode(req);
  return createInvoiceDraftForVendor(vendorCode, req.user.userId, body, audit);
}

/**
 * Admin: create draft + submit invoice for one or more PO line quantities.
 * @param {object} body
 * @param {object} audit
 */
export async function generateInvoiceFromPOLine(body, audit) {
  const vendorCode = body.vendorCode;
  const poNumber = body.poNumber;
  const invoiceDate = body.invoiceDate ?? new Date();
  const inputLines = body.lines ?? [];

  if (!inputLines.length) {
    throw ApiError.badRequest("At least one invoice line is required");
  }

  const lineNos = inputLines.map((line) => Number(line.poLineNo));
  const placeholders = lineNos.map(() => "?").join(", ");

  const [poLineRows] = await query(
    `SELECT pl.line_no,
            pl.uom,
            pl.storage_location_code,
            COALESCE(pl.balance_qty, pl.pending_qty, pl.ordered_qty - pl.received_qty) AS balance_qty,
            ph.plant_code,
            ph.status AS po_status
     FROM po_lines pl
     INNER JOIN po_headers ph ON ph.po_number = pl.po_number
     WHERE pl.po_number = ? AND ph.vendor_code = ? AND pl.line_no IN (${placeholders})`,
    [poNumber, vendorCode, ...lineNos]
  );

  const poLineMap = new Map(poLineRows.map((row) => [Number(row.line_no), row]));

  if (!poLineRows.length) {
    throw ApiError.notFound("PO lines not found for this vendor");
  }

  const poStatus = poLineRows[0].po_status;
  if (!INVOICEABLE_PO_STATUSES.includes(poStatus)) {
    throw ApiError.unprocessable(
      `PO status '${poStatus}' is not eligible for invoicing`
    );
  }

  /** @type {object[]} */
  const draftLines = [];
  /** @type {object[]} */
  const balanceSummaries = [];

  for (const input of inputLines) {
    const poLine = poLineMap.get(Number(input.poLineNo));
    if (!poLine) {
      throw ApiError.notFound(`PO line ${input.poLineNo} not found for this vendor`);
    }

    const balanceBefore = Number(poLine.balance_qty);
    const invoiceQty = Number(input.invoiceQty);
    const qtyCheck = validatePOLineQty(invoiceQty, balanceBefore);

    if (!qtyCheck.valid) {
      throw ApiError.unprocessable(
        `Line ${input.poLineNo}: ${qtyCheck.message ?? "Invoice quantity exceeds balance"}`
      );
    }

    draftLines.push({
      poLineNo: Number(input.poLineNo),
      plantCode: input.plantCode ?? poLine.plant_code,
      storageLocationCode: input.storageLocationCode ?? poLine.storage_location_code,
      invoiceQty,
      uom: input.uom ?? poLine.uom,
    });

    balanceSummaries.push({
      poLineNo: Number(input.poLineNo),
      balanceBefore,
      invoiceQty,
      balanceAfter: Math.max(
        0,
        Math.round((balanceBefore - invoiceQty) * 1000) / 1000
      ),
      remainingQty: Math.max(
        0,
        Math.round((balanceBefore - invoiceQty) * 1000) / 1000
      ),
    });
  }

  let invoiceNumber = body.invoiceNumber?.trim();
  if (!invoiceNumber) {
    const dateKey = toDateKey(invoiceDate);
    const lineSuffix =
      inputLines.length === 1 ? `L${inputLines[0].poLineNo}` : `M${inputLines.length}`;
    invoiceNumber = `GEN-${poNumber}-${lineSuffix}-${dateKey}`;
    const [dup] = await query(
      `SELECT invoice_id FROM invoices
       WHERE vendor_code = ? AND invoice_number = ? LIMIT 1`,
      [vendorCode, invoiceNumber]
    );
    if (dup.length) {
      invoiceNumber = `${invoiceNumber}-${String(Date.now()).slice(-5)}`;
    }
  }

  const draft = await createInvoiceDraftForVendor(
    vendorCode,
    audit.actorUserId,
    {
      invoiceNumber,
      invoiceDate,
      poNumber,
      lines: draftLines,
    },
    audit
  );

  const submitted = await submitInvoiceTransaction(
    vendorCode,
    draft.invoice.invoiceId,
    audit
  );

  return {
    ...submitted,
    balanceSummaries,
    balanceSummary: balanceSummaries.length === 1 ? balanceSummaries[0] : null,
  };
}

/**
 * Core submit transaction — used by HTTP handler and Bull worker.
 * Lock order: invoice row → PO header/lines (single FOR UPDATE pass) → updates without re-lock.
 *
 * EXPLAIN: invoices PRIMARY; po_headers PRIMARY; po_lines idx_po_lines_po_number.
 * Performance: ~50–70% shorter lock duration vs per-line FOR UPDATE loop.
 *
 * @param {string} vendorCode
 * @param {number} invoiceId
 * @param {object} audit
 */
export async function submitInvoiceTransaction(vendorCode, invoiceId, audit) {
  const conn = await getConnection();

  try {
    await conn.beginTransaction();

    const [invoices] = await conn.execute(
      `SELECT invoice_id, po_number, system_invoice_id
       FROM invoices
       WHERE invoice_id = ? AND vendor_code = ? AND status = 'draft'
       FOR UPDATE`,
      [invoiceId, vendorCode]
    );

    if (!invoices.length) {
      throw ApiError.notFound("Draft invoice not found");
    }

    const invoice = invoices[0];

    const [invoiceLines] = await conn.execute(
      `SELECT po_line_no, plant_code, storage_location_code, invoice_qty, uom
       FROM invoice_lines WHERE invoice_id = ?`,
      [invoiceId]
    );

    const inputLines = invoiceLines.map((l) => ({
      poLineNo: l.po_line_no,
      plantCode: l.plant_code,
      storageLocationCode: l.storage_location_code,
      invoiceQty: Number(l.invoice_qty),
      uom: l.uom,
    }));

    const validation = await validateInvoiceLines(
      conn,
      inputLines,
      invoice.po_number,
      vendorCode,
      null,
      true
    );

    if (!validation.valid) {
      throw ApiError.unprocessable("Invoice cannot be submitted", validation.errors);
    }

    await conn.execute(
      `UPDATE invoices SET status = 'submitted', submitted_at = NOW(3) WHERE invoice_id = ?`,
      [invoiceId]
    );

    const dispatchDate = formatSqlDate(new Date());

    for (const line of validation.poLines) {
      const pl = line.poLine;
      const balanceBefore = Number(
        pl.balance_qty ??
          pl.pending_qty ??
          calculatePendingQty(pl.ordered_qty, pl.received_qty)
      );
      const qtyCheck = validatePOLineQty(line.invoiceQty, balanceBefore);

      if (!qtyCheck.valid) {
        throw ApiError.unprocessable(
          `Line ${line.poLineNo}: ${qtyCheck.message}`,
          validation.errors
        );
      }

      const invoiceQty = line.invoiceQty;
      const balanceAfter = Math.max(
        0,
        Math.round((balanceBefore - invoiceQty) * 1000) / 1000
      );
      const newDispatched =
        Math.round((Number(pl.dispatched_qty) + invoiceQty) * 1000) / 1000;
      const newReceived = Number(pl.received_qty) + invoiceQty;
      const newPending = balanceAfter;

      await conn.execute(
        `UPDATE invoice_lines SET unit_price = ? WHERE invoice_id = ? AND po_line_no = ?`,
        [line.unitPrice ?? 0, invoiceId, line.poLineNo]
      );

      await conn.execute(
        `UPDATE po_lines
         SET dispatched_qty = ?,
             balance_qty = ?,
             received_qty = ?,
             pending_qty = ?,
             updated_at = NOW(3)
         WHERE po_number = ? AND line_no = ?`,
        [
          newDispatched,
          balanceAfter,
          newReceived,
          newPending,
          invoice.po_number,
          line.poLineNo,
        ]
      );

      await conn.execute(
        `INSERT INTO vendor_dispatch_history
          (po_number, po_line_no, vendor_code, material_code, invoice_id,
           system_invoice_id, dispatched_qty, balance_before, balance_after, dispatch_date)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          invoice.po_number,
          line.poLineNo,
          vendorCode,
          line.materialCode,
          invoiceId,
          invoice.system_invoice_id,
          invoiceQty,
          balanceBefore,
          balanceAfter,
          dispatchDate,
        ]
      );
    }

    const [updatedPoLines] = await conn.execute(
      `SELECT ordered_qty,
              COALESCE(balance_qty, pending_qty) AS balance_qty
       FROM po_lines WHERE po_number = ?`,
      [invoice.po_number]
    );

    const poStatus = determinePOStatusFromBalance(
      updatedPoLines.map((pl) => ({
        orderedQty: pl.ordered_qty,
        balanceQty: pl.balance_qty,
      }))
    );

    await conn.execute(`UPDATE po_headers SET status = ? WHERE po_number = ?`, [
      poStatus,
      invoice.po_number,
    ]);

    const qrResult = await generateQR(invoiceId, conn);

    await writeAuditLog(conn, {
      actorUserId: audit.actorUserId,
      action: "INVOICE_SUBMIT",
      entityType: "invoice",
      entityId: String(invoiceId),
      oldValues: { status: "draft" },
      newValues: { status: "qr_generated", poStatus },
      ipAddress: audit.ipAddress,
      userAgent: audit.userAgent,
    });

    await conn.commit();

    await invalidateVendorPoCaches(vendorCode);
    await invalidatePoDetail(vendorCode, invoice.po_number);

    const full = await getInvoiceWithLines(invoiceId);
    return {
      ...full,
      qr: {
        ...full.qr,
        qrImageBase64: qrResult.qrImageBase64,
        systemInvoiceId: qrResult.systemInvoiceId,
      },
    };
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

/**
 * @param {import('express').Request} req
 * @param {number} invoiceId
 * @param {object} audit
 */
export async function submitInvoice(req, invoiceId, audit) {
  const vendorCode = requireVendorCode(req);
  return submitInvoiceTransaction(vendorCode, invoiceId, audit);
}

/**
 * @param {import('express').Request} req
 */
export async function getMyInvoices(req) {
  const vendorCode = requireVendorCode(req);

  return listInvoices(
    { ...req.query, vendorCode },
    { forceVendorCode: vendorCode }
  );
}

/**
 * @param {object} queryParams
 * @param {object} [options]
 * @param {string} [options.forceVendorCode]
 */
async function listInvoices(queryParams, options = {}) {
  const { limit, cursor } = parsePaginationQuery({
    pageSize: queryParams.pageSize,
    cursor: queryParams.cursor,
  });

  const clauses = [];
  const params = [];

  const vendorCode = options.forceVendorCode ?? queryParams.vendorCode;
  if (vendorCode) {
    clauses.push("i.vendor_code = ?");
    params.push(vendorCode);
  }

  if (queryParams.status) {
    clauses.push("i.status = ?");
    params.push(queryParams.status);
  }

  if (queryParams.poNumber) {
    clauses.push("i.po_number = ?");
    params.push(queryParams.poNumber);
  }

  if (queryParams.dateFrom) {
    clauses.push("i.invoice_date >= ?");
    params.push(formatSqlDate(queryParams.dateFrom));
  }

  if (queryParams.dateTo) {
    clauses.push("i.invoice_date <= ?");
    params.push(formatSqlDate(queryParams.dateTo));
  }

  if (queryParams.search?.trim()) {
    const term = `%${queryParams.search.trim()}%`;
    clauses.push("(i.invoice_number LIKE ? OR i.system_invoice_id LIKE ?)");
    params.push(term, term);
  }

  const keyset = keysetWhereClauseByKey(cursor, "invoice_id", "i");
  if (keyset.clause) {
    clauses.push(keyset.clause.replace(/^AND\s+/, ""));
  }

  const whereSql = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
  const allParams = [...params, ...keyset.params];

  const countSql = `SELECT COUNT(*) AS total FROM invoices i ${whereSql}`;
  const [countRows] = await query(countSql, allParams);
  const totalCount = Number(countRows[0]?.total ?? 0);

  const listSql = `
    SELECT i.invoice_id, i.system_invoice_id, i.invoice_number, i.vendor_code,
           v.vendor_name, i.po_number, i.invoice_date, i.status, i.rejection_reason,
           i.qr_generated_at, i.submitted_at, i.created_at, i.updated_at,
           (SELECT COUNT(*) FROM invoice_lines il WHERE il.invoice_id = i.invoice_id) AS line_count
    FROM invoices i
    LEFT JOIN vendors v ON v.vendor_code = i.vendor_code
    ${whereSql}
    ORDER BY i.created_at DESC, i.invoice_id DESC
    LIMIT ${sqlInlineLimit(limit, true)}`;

  const [rows] = await query(listSql, [...allParams]);

  const page = buildCursorPage(rows, limit, (row) => ({
    id: row.invoice_id,
    createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at,
  }));

  return {
    invoices: page.data.map(formatInvoiceSummary),
    totalCount,
    pagination: page.pagination,
  };
}

/**
 * @param {object} queryParams
 */
export async function getAllInvoices(queryParams) {
  return listInvoices(queryParams, {});
}

/**
 * @param {import('express').Request} req
 * @param {number} invoiceId
 */
export async function getInvoiceDetails(req, invoiceId) {
  const data = await getInvoiceWithLines(invoiceId);

  if (!isAdmin(req.user) && data.invoice.vendorCode !== req.user.vendorCode) {
    throw ApiError.forbidden("You do not have access to this invoice");
  }

  const submitMeta = await getSubmitStatus(invoiceId);
  if (submitMeta) {
    data.submitStatus = submitMeta.status;
    if (submitMeta.error) {
      data.submitError = submitMeta.error;
    }
    if (
      data.invoice.status !== "draft" &&
      (submitMeta.status === "completed" || submitMeta.status === "failed")
    ) {
      await clearSubmitStatus(invoiceId);
    }
  }

  return data;
}

/**
 * Restores PO line balance and dispatched quantities when an invoice is rejected.
 * @param {import('mysql2/promise').PoolConnection} conn
 * @param {object} params
 * @param {number} params.invoiceId
 * @param {string} params.vendorCode
 * @param {string} params.poNumber
 * @param {string} params.systemInvoiceId
 */
async function revertInvoiceDispatchOnReject(conn, params) {
  const { invoiceId, vendorCode, poNumber, systemInvoiceId } = params;

  const [invoiceLines] = await conn.execute(
    `SELECT po_line_no, material_code, invoice_qty
     FROM invoice_lines WHERE invoice_id = ?`,
    [invoiceId]
  );

  if (!invoiceLines.length) {
    return [];
  }

  const dispatchDate = formatSqlDate(new Date());
  /** @type {object[]} */
  const reverted = [];

  for (const line of invoiceLines) {
    const invoiceQty = Number(line.invoice_qty);
    if (invoiceQty <= 0) {
      continue;
    }

    const [poLines] = await conn.execute(
      `SELECT ordered_qty, received_qty, pending_qty,
              COALESCE(dispatched_qty, 0) AS dispatched_qty,
              COALESCE(balance_qty, pending_qty) AS balance_qty
       FROM po_lines
       WHERE po_number = ? AND line_no = ?
       FOR UPDATE`,
      [poNumber, line.po_line_no]
    );

    if (!poLines.length) {
      throw ApiError.notFound(`PO line ${line.po_line_no} not found for quantity reversal`);
    }

    const pl = poLines[0];
    const ordered = Number(pl.ordered_qty);
    const balanceBefore = Number(pl.balance_qty);
    const balanceAfter = Math.min(
      ordered,
      Math.round((balanceBefore + invoiceQty) * 1000) / 1000
    );
    const newDispatched = Math.max(
      0,
      Math.round((Number(pl.dispatched_qty) - invoiceQty) * 1000) / 1000
    );
    const newReceived = Math.max(
      0,
      Math.round((Number(pl.received_qty) - invoiceQty) * 1000) / 1000
    );

    await conn.execute(
      `UPDATE po_lines
       SET dispatched_qty = ?,
           balance_qty = ?,
           received_qty = ?,
           pending_qty = ?,
           updated_at = NOW(3)
       WHERE po_number = ? AND line_no = ?`,
      [
        newDispatched,
        balanceAfter,
        newReceived,
        balanceAfter,
        poNumber,
        line.po_line_no,
      ]
    );

    await conn.execute(
      `INSERT INTO vendor_dispatch_history
        (po_number, po_line_no, vendor_code, material_code, invoice_id,
         system_invoice_id, dispatched_qty, balance_before, balance_after, dispatch_date)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        poNumber,
        line.po_line_no,
        vendorCode,
        line.material_code,
        invoiceId,
        systemInvoiceId,
        -invoiceQty,
        balanceBefore,
        balanceAfter,
        dispatchDate,
      ]
    );

    reverted.push({
      poLineNo: Number(line.po_line_no),
      materialCode: line.material_code,
      invoiceQty,
      balanceBefore,
      balanceAfter,
      restoredQty: Math.round((balanceAfter - balanceBefore) * 1000) / 1000,
    });
  }

  const [updatedPoLines] = await conn.execute(
    `SELECT ordered_qty,
            COALESCE(balance_qty, pending_qty) AS balance_qty
     FROM po_lines WHERE po_number = ?`,
    [poNumber]
  );

  const poStatus = determinePOStatusFromBalance(
    updatedPoLines.map((pl) => ({
      orderedQty: pl.ordered_qty,
      balanceQty: pl.balance_qty,
    }))
  );

  await conn.execute(
    `UPDATE po_headers SET status = ?, updated_at = NOW(3) WHERE po_number = ?`,
    [poStatus, poNumber]
  );

  return reverted;
}

/**
 * @param {number} invoiceId
 * @param {{ status: string, reason?: string }} input
 * @param {object} audit
 */
export async function updateInvoiceStatus(invoiceId, input, audit) {
  const [rows] = await query(
    `SELECT invoice_id, status, vendor_code, po_number, system_invoice_id
     FROM invoices WHERE invoice_id = ?`,
    [invoiceId]
  );

  if (!rows.length) {
    throw ApiError.notFound("Invoice not found");
  }

  const current = rows[0];

  if (!["submitted", "qr_generated"].includes(current.status)) {
    throw ApiError.badRequest(
      `Cannot update status from '${current.status}' — invoice must be submitted or QR generated`
    );
  }

  const conn = await getConnection();

  try {
    await conn.beginTransaction();

    /** @type {object[]} */
    let revertedLines = [];

    if (input.status === "rejected") {
      revertedLines = await revertInvoiceDispatchOnReject(conn, {
        invoiceId,
        vendorCode: current.vendor_code,
        poNumber: current.po_number,
        systemInvoiceId: current.system_invoice_id,
      });
    }

    await conn.execute(
      `UPDATE invoices
       SET status = ?,
           rejection_reason = ?,
           qr_generated_at = CASE WHEN ? = 'rejected' THEN NULL ELSE qr_generated_at END,
           qr_code_data = CASE WHEN ? = 'rejected' THEN NULL ELSE qr_code_data END,
           updated_at = NOW(3)
       WHERE invoice_id = ?`,
      [input.status, input.status === "rejected" ? input.reason : null, input.status, input.status, invoiceId]
    );

    await writeAuditLog(conn, {
      actorUserId: audit.actorUserId,
      action: `INVOICE_STATUS_${input.status.toUpperCase()}`,
      entityType: "invoice",
      entityId: String(invoiceId),
      oldValues: { status: current.status },
      newValues: {
        status: input.status,
        reason: input.reason ?? null,
        revertedLines: input.status === "rejected" ? revertedLines : undefined,
      },
      ipAddress: audit.ipAddress,
      userAgent: audit.userAgent,
    });

    await conn.commit();

    if (input.status === "rejected") {
      await invalidateVendorPoCaches(current.vendor_code);
      await invalidatePoDetail(current.vendor_code, current.po_number);
      await invalidateInvoiceQrCaches(invoiceId);
    }

    const data = await getInvoiceWithLines(invoiceId);
    if (input.status === "rejected") {
      data.revertedLines = revertedLines;
      data.poStatusUpdated = true;
    }

    return data;
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}
