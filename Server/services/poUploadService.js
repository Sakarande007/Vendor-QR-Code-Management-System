import crypto from "node:crypto";
import { getConnection, query } from "../config/db.js";
import { ApiError } from "../utils/ApiError.js";
import { writeAuditLog } from "../utils/auditHelper.js";
import { determinePOStatusFromBalance } from "../utils/poCalculations.js";
import {
  buildCursorPage,
  parsePaginationQuery,
  sqlInlineLimit,
} from "../utils/pagination.js";
import { parseSAPExcel, sapDateRawToMysqlDate } from "../utils/sapExcelParser.js";
import { validateExcelRow } from "../validators/poUploadValidators.js";
import { invalidateVendorPoCaches } from "./cacheService.js";

/**
 * @param {import('mysql2/promise').PoolConnection} conn
 * @param {string} plantCode
 */
async function ensurePlantExists(conn, plantCode) {
  const [rows] = await conn.execute(
    `SELECT plant_code FROM plants WHERE plant_code = ? LIMIT 1`,
    [plantCode]
  );
  if (rows.length) {
    return;
  }

  await conn.execute(
    `INSERT INTO plants (plant_code, plant_name, company_code, status)
     VALUES (?, ?, 'SAP', 'active')`,
    [plantCode, `Plant ${plantCode}`]
  );
}

/**
 * @param {import('mysql2/promise').PoolConnection} conn
 * @param {string} materialCode
 * @param {string|null} description
 * @param {string} uom
 */
async function ensureMaterialExists(conn, materialCode, description, uom) {
  const [rows] = await conn.execute(
    `SELECT material_code FROM materials WHERE material_code = ? LIMIT 1`,
    [materialCode]
  );
  if (rows.length) {
    return;
  }

  await conn.execute(
    `INSERT INTO materials (material_code, material_description, uom, status)
     VALUES (?, ?, ?, 'active')`,
    [materialCode, description || `Material ${materialCode}`, uom]
  );
}

/**
 * Maps Excel "Vendor Code" (often SAP vendor_code_sap) to internal vendors.vendor_code.
 * @param {string[]} excelVendorCodes
 * @returns {Promise<Map<string, string>>}
 */
async function resolveVendorCodeMap(excelVendorCodes) {
  /** @type {Map<string, string>} */
  const map = new Map();

  if (!excelVendorCodes.length) {
    return map;
  }

  const placeholders = excelVendorCodes.map(() => "?").join(",");
  const [rows] = await query(
    `SELECT vendor_code, vendor_code_sap
     FROM vendors
     WHERE vendor_code IN (${placeholders})
        OR vendor_code_sap IN (${placeholders})`,
    [...excelVendorCodes, ...excelVendorCodes]
  );

  for (const excelCode of excelVendorCodes) {
    const match = rows.find(
      (r) => r.vendor_code === excelCode || r.vendor_code_sap === excelCode
    );
    if (match) {
      map.set(excelCode, match.vendor_code);
    }
  }

  return map;
}

/**
 * Creates a minimal vendor row for an SAP code from Excel when none exists yet.
 * @param {string} sapCode
 * @param {number|null|undefined} actorUserId
 * @returns {Promise<string>} internal vendor_code
 */
async function provisionVendorFromSapCode(sapCode, actorUserId) {
  const code = String(sapCode).trim();
  const existing = await resolveVendorCodeMap([code]);
  if (existing.has(code)) {
    return existing.get(code);
  }

  const email = `vendor.${code}@import.pending`;

  await query(
    `INSERT INTO vendors
      (vendor_code, vendor_code_sap, vendor_name, email, status, first_login, created_by)
     VALUES (?, ?, ?, ?, 'active', 1, ?)`,
    [code, code, `Vendor ${code}`, email, actorUserId ?? null]
  );

  return code;
}

/**
 * Resolves SAP vendor codes to onboarded vendors only (admin must create vendor first).
 * @param {string[]} excelVendorCodes
 */
async function resolveOnboardedVendorCodes(excelVendorCodes) {
  const map = await resolveVendorCodeMap(excelVendorCodes);
  const missing = excelVendorCodes.filter((code) => !map.has(code));
  return { map, missing };
}

/**
 * @param {import('mysql2/promise').PoolConnection} conn
 * @param {string} poNumber
 * @returns {Promise<Array<{ line_no: number, ordered_qty: number, balance_qty: number }>>}
 */
async function fetchPOLineBalances(conn, poNumber) {
  const [rows] = await conn.execute(
    `SELECT line_no, ordered_qty, COALESCE(balance_qty, ordered_qty) AS balance_qty
     FROM po_lines WHERE po_number = ?`,
    [poNumber]
  );
  return rows;
}

/**
 * @param {import('mysql2/promise').PoolConnection} conn
 * @param {string} poNumber
 */
async function recalculatePOHeaderStatus(conn, poNumber) {
  const lines = await fetchPOLineBalances(conn, poNumber);
  if (!lines.length) {
    return;
  }

  const status = determinePOStatusFromBalance(
    lines.map((l) => ({
      orderedQty: Number(l.ordered_qty),
      balanceQty: Number(l.balance_qty),
    }))
  );

  await conn.execute(
    `UPDATE po_headers SET status = ?, updated_at = CURRENT_TIMESTAMP(3)
     WHERE po_number = ? AND status != 'cancelled'`,
    [status, poNumber]
  );
}

/**
 * @param {import('mysql2/promise').PoolConnection} conn
 * @param {object} row
 * @param {string} batchId
 * @param {Set<string>} headersProcessed
 * @param {Set<string>} posCreated
 */
async function upsertPOHeader(conn, row, batchId, headersProcessed, posCreated) {
  if (headersProcessed.has(row.po_number)) {
    return;
  }
  headersProcessed.add(row.po_number);

  await ensurePlantExists(conn, row.plant_code);

  const poDate = sapDateRawToMysqlDate(row.po_date_raw);

  const [headerExists] = await conn.execute(
    `SELECT po_number FROM po_headers WHERE po_number = ? LIMIT 1`,
    [row.po_number]
  );

  const headerIsNew = headerExists.length === 0;

  await conn.execute(
    `INSERT INTO po_headers
      (po_number, vendor_code, po_date, po_date_raw, plant_code, status, source, upload_batch_id)
     VALUES (?, ?, ?, ?, ?, 'open', 'excel_upload', ?)
     ON DUPLICATE KEY UPDATE
       po_date = VALUES(po_date),
       po_date_raw = VALUES(po_date_raw),
       plant_code = VALUES(plant_code),
       vendor_code = VALUES(vendor_code),
       upload_batch_id = VALUES(upload_batch_id),
       updated_at = CURRENT_TIMESTAMP(3)`,
    [
      row.po_number,
      row.vendor_code,
      poDate,
      row.po_date_raw,
      row.plant_code,
      batchId,
    ]
  );

  if (headerIsNew) {
    posCreated.add(row.po_number);
  }
}

/**
 * @param {import('mysql2/promise').PoolConnection} conn
 * @param {object} row
 * @param {{ lineInserted: number, lineUpdated: number }} counters
 */
async function upsertPOLine(conn, row, counters) {
  const storageLocation =
    row.storage_location_raw && row.storage_location_raw.length > 0
      ? row.storage_location_raw
      : null;
  const itemDescription =
    row.item_description && row.item_description.length > 0
      ? row.item_description
      : null;
  const srNo =
    row.sr_no !== undefined && row.sr_no !== null && row.sr_no !== ""
      ? Number(row.sr_no)
      : null;

  await ensurePlantExists(conn, row.plant_code);
  await ensureMaterialExists(
    conn,
    row.material_code,
    itemDescription,
    row.uom
  );

  const [existingLine] = await conn.execute(
    `SELECT id, COALESCE(dispatched_qty, 0) AS dispatched_qty
     FROM po_lines WHERE po_number = ? AND line_no = ? LIMIT 1`,
    [row.po_number, row.line_no]
  );

  const orderedQty = Number(row.ordered_qty);

  if (!existingLine.length) {
    const balanceQty = orderedQty;

    await conn.execute(
      `INSERT INTO po_lines
        (po_number, line_no, material_code, item_description, ordered_qty, received_qty,
         pending_qty, dispatched_qty, balance_qty, uom, storage_location_raw, storage_location_code,
         sr_no, unit_price)
       VALUES (?, ?, ?, ?, ?, 0, ?, 0, ?, ?, ?, ?, ?, 0)`,
      [
        row.po_number,
        row.line_no,
        row.material_code,
        itemDescription,
        orderedQty,
        balanceQty,
        balanceQty,
        row.uom,
        storageLocation,
        storageLocation,
        srNo,
      ]
    );
    counters.lineInserted += 1;
    return;
  }

  const dispatchedQty = Number(existingLine[0].dispatched_qty);
  const balanceQty = Math.max(
    0,
    Math.round((orderedQty - dispatchedQty) * 1000) / 1000
  );
  const receivedQty = dispatchedQty;
  const pendingQty = balanceQty;

  await conn.execute(
    `UPDATE po_lines SET
       material_code = ?,
       item_description = ?,
       ordered_qty = ?,
       uom = ?,
       storage_location_raw = ?,
       storage_location_code = ?,
       sr_no = ?,
       balance_qty = ?,
       received_qty = ?,
       pending_qty = ?,
       updated_at = CURRENT_TIMESTAMP(3)
     WHERE po_number = ? AND line_no = ?`,
    [
      row.material_code,
      itemDescription,
      orderedQty,
      row.uom,
      storageLocation,
      storageLocation,
      srNo,
      balanceQty,
      receivedQty,
      pendingQty,
      row.po_number,
      row.line_no,
    ]
  );
  counters.lineUpdated += 1;
}

/**
 * @param {Buffer} buffer
 * @param {{ originalname: string, mimetype: string }} fileMeta
 * @param {{ actorUserId: number, ipAddress?: string|null, userAgent?: string|null }} audit
 */
export async function processSAPExcelUpload(buffer, fileMeta, audit) {
  const batchId = crypto.randomUUID();
  const { sheetName, rows: rawRows, totalDataRows } = parseSAPExcel(buffer);

  /** @type {Array<{ row: number, field: string, message: string }>} */
  const errors = [];
  const validRows = [];

  for (const raw of rawRows) {
    const { valid, data, errors: rowErrors } = validateExcelRow(
      raw,
      raw.rowNumber
    );
    if (!valid) {
      errors.push(...rowErrors);
      continue;
    }
    validRows.push(data);
  }

  const uniqueVendorCodes = [
    ...new Set(validRows.map((r) => r.vendor_code)),
  ];
  const { map: vendorCodeMap, missing: vendorsNotOnboarded } =
    await resolveOnboardedVendorCodes(uniqueVendorCodes);

  for (const code of vendorsNotOnboarded) {
    errors.push({
      row: 0,
      field: "vendor_code",
      message: `Vendor ${code} is not onboarded — create vendor in Admin → Vendors first, then re-upload`,
    });
  }

  const rowsToProcess = validRows
    .filter((r) => vendorCodeMap.has(r.vendor_code))
    .map((r) => ({
      ...r,
      excel_vendor_code: r.vendor_code,
      vendor_code: vendorCodeMap.get(r.vendor_code),
    }));

  /** @type {Set<string>} */
  const vendorsProcessed = new Set();
  /** @type {Set<string>} */
  const posCreated = new Set();

  let lineInserted = 0;
  let lineUpdated = 0;

  const rowsByVendor = new Map();
  for (const row of rowsToProcess) {
    if (!rowsByVendor.has(row.vendor_code)) {
      rowsByVendor.set(row.vendor_code, []);
    }
    rowsByVendor.get(row.vendor_code).push(row);
  }

  for (const [vendorCode, vendorRows] of rowsByVendor) {
    const conn = await getConnection();
    const counters = { lineInserted: 0, lineUpdated: 0 };
    const headersProcessed = new Set();

    try {
      await conn.beginTransaction();

      for (const row of vendorRows) {
        await upsertPOHeader(conn, row, batchId, headersProcessed, posCreated);
        await upsertPOLine(conn, row, counters);
      }

      const poNumbers = [...new Set(vendorRows.map((r) => r.po_number))];
      for (const poNumber of poNumbers) {
        await recalculatePOHeaderStatus(conn, poNumber);
      }

      await conn.commit();
      const sapCode =
        vendorRows[0]?.excel_vendor_code ?? vendorCode;
      vendorsProcessed.add(sapCode);
      lineInserted += counters.lineInserted;
      lineUpdated += counters.lineUpdated;
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }
  }

  const inserted = lineInserted;
  const updated = lineUpdated;
  const errorRows = totalDataRows - rowsToProcess.length;

  await query(
    `INSERT INTO po_upload_batches
      (batch_id, uploaded_by, file_name, sheet_name, total_rows, inserted_rows,
       updated_rows, error_rows, errors, status, completed_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'completed', NOW())`,
    [
      batchId,
      audit.actorUserId,
      fileMeta.originalname,
      sheetName,
      totalDataRows,
      inserted,
      updated,
      errorRows,
      JSON.stringify(errors),
    ]
  );

  await writeAuditLog(null, {
    actorUserId: audit.actorUserId,
    action: "PO_SAP_EXCEL_UPLOAD",
    entityType: "po_upload_batch",
    entityId: batchId,
    oldValues: null,
    newValues: {
      fileName: fileMeta.originalname,
      totalRows: totalDataRows,
      inserted,
      updated,
      errorRows,
    },
    ipAddress: audit.ipAddress,
    userAgent: audit.userAgent,
  });

  await Promise.all(
    [...vendorsProcessed].map((vc) => invalidateVendorPoCaches(vc))
  );

  return {
    batchId,
    summary: {
      total_rows: totalDataRows,
      inserted,
      updated,
      errors: errors.length,
      vendors_processed: [...vendorsProcessed],
      vendors_not_onboarded: vendorsNotOnboarded,
      pos_created: [...posCreated],
    },
    errors,
  };
}

/**
 * @param {object} queryParams
 */
export async function listUploadHistory(queryParams) {
  const { limit, cursor } = parsePaginationQuery({
    pageSize: queryParams.pageSize,
    cursor: queryParams.cursor,
  });

  let keysetClause = "";
  const keysetParams = [];

  if (cursor?.createdAt) {
    keysetClause =
      "b.uploaded_at < ? OR (b.uploaded_at = ? AND b.batch_id < ?)";
    keysetParams.push(cursor.createdAt, cursor.createdAt, cursor.id);
  } else if (cursor?.id) {
    keysetClause = "b.batch_id < ?";
    keysetParams.push(cursor.id);
  }

  const whereSql = keysetClause ? `WHERE ${keysetClause}` : "";
  const params = [...keysetParams];

  const [countRows] = await query(
    `SELECT COUNT(*) AS total FROM po_upload_batches b ${whereSql}`,
    params
  );
  const totalCount = Number(countRows[0]?.total ?? 0);

  const listSql = `
    SELECT b.batch_id, b.uploaded_by, b.file_name, b.sheet_name, b.total_rows,
           b.inserted_rows, b.updated_rows, b.error_rows, b.status,
           b.uploaded_at, b.completed_at
    FROM po_upload_batches b
    ${whereSql}
    ORDER BY b.uploaded_at DESC, b.batch_id DESC
    LIMIT ${sqlInlineLimit(limit, true)}`;

  const [rows] = await query(listSql, params);

  const page = buildCursorPage(rows, limit, (row) => ({
    id: row.batch_id,
    createdAt:
      row.uploaded_at instanceof Date
        ? row.uploaded_at.toISOString()
        : row.uploaded_at,
  }));

  return {
    batches: page.data.map((row) => ({
      batchId: row.batch_id,
      uploadedBy: row.uploaded_by,
      fileName: row.file_name,
      sheetName: row.sheet_name,
      totalRows: row.total_rows,
      insertedRows: row.inserted_rows,
      updatedRows: row.updated_rows,
      errorRows: row.error_rows,
      status: row.status,
      uploadedAt: row.uploaded_at,
      completedAt: row.completed_at,
    })),
    totalCount,
    pagination: page.pagination,
  };
}

/**
 * @param {string} batchId
 */
export async function getUploadBatchById(batchId) {
  const [rows] = await query(
    `SELECT b.batch_id, b.uploaded_by, b.file_name, b.sheet_name, b.total_rows,
            b.inserted_rows, b.updated_rows, b.error_rows, b.errors, b.status,
            b.uploaded_at, b.completed_at, u.email AS uploaded_by_email
     FROM po_upload_batches b
     LEFT JOIN users u ON u.user_id = b.uploaded_by
     WHERE b.batch_id = ?
     LIMIT 1`,
    [batchId]
  );

  if (!rows.length) {
    throw ApiError.notFound("Upload batch not found");
  }

  const row = rows[0];
  let parsedErrors = [];
  if (row.errors) {
    try {
      parsedErrors =
        typeof row.errors === "string" ? JSON.parse(row.errors) : row.errors;
    } catch {
      parsedErrors = [];
    }
  }

  return {
    batchId: row.batch_id,
    uploadedBy: row.uploaded_by,
    uploadedByEmail: row.uploaded_by_email ?? null,
    fileName: row.file_name,
    sheetName: row.sheet_name,
    totalRows: row.total_rows,
    insertedRows: row.inserted_rows,
    updatedRows: row.updated_rows,
    errorRows: row.error_rows,
    errors: parsedErrors,
    status: row.status,
    uploadedAt: row.uploaded_at,
    completedAt: row.completed_at,
  };
}
