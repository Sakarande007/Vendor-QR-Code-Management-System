import crypto from "node:crypto";
import QRCode from "qrcode";
import { query, getConnection } from "../config/db.js";
import { tryQrScanDedup } from "../config/redis.js";
import { CACHE_TTL, cacheKeys, del, get, set } from "./cacheService.js";
import { encrypt, decrypt, hashData } from "../utils/encryption.js";
import { sha256Hex, timingSafeCompareStrings } from "../utils/timingSafe.js";
import { writeAuditLog } from "../utils/auditHelper.js";
import { ApiError } from "../utils/ApiError.js";

const QR_VERSION = "1";
const MAX_PAYLOAD_AGE_SEC = 365 * 24 * 60 * 60;
const QR_IMAGE_WIDTH = 300;

/**
 * @param {import('mysql2/promise').PoolConnection|null} conn
 * @param {string} sql
 * @param {unknown[]} params
 */
async function executeQuery(conn, sql, params = []) {
  if (conn) {
    const [rows] = await conn.execute(sql, params);
    return rows;
  }
  const [rows] = await query(sql, params);
  return rows;
}

/**
 * @returns {string}
 */
function getQrSecretKey() {
  const key = process.env.QR_SECRET_KEY;
  if (!key || key.length < 32) {
    throw new Error("QR_SECRET_KEY must be set (min 32 characters)");
  }
  return key;
}

/**
 * Deterministic JSON for HMAC signing (excludes chk).
 * @param {object} obj
 * @returns {string}
 */
function canonicalJson(obj) {
  return JSON.stringify(obj, Object.keys(obj).sort());
}

/**
 * @param {object} payloadWithoutChk
 * @returns {string} hex HMAC-SHA256
 */
function signPayload(payloadWithoutChk) {
  return crypto
    .createHmac("sha256", getQrSecretKey())
    .update(canonicalJson(payloadWithoutChk), "utf8")
    .digest("hex");
}

/**
 * @param {object} payload
 * @param {string} signature
 * @returns {boolean}
 */
function verifyPayloadSignature(payload, signature) {
  const { chk, ...rest } = payload;
  const expected = signPayload(rest);
  return timingSafeCompareStrings(expected, signature);
}

/**
 * @param {number} invoiceId
 * @returns {Promise<{ invoice: object, lines: object[] }>}
 */
async function fetchInvoiceForQR(invoiceId, conn = null) {
  const headers = await executeQuery(
    conn,
    `SELECT i.invoice_id, i.system_invoice_id, i.invoice_number, i.vendor_code,
            i.po_number, i.invoice_date, i.status, ph.plant_code
     FROM invoices i
     INNER JOIN po_headers ph ON ph.po_number = i.po_number
     WHERE i.invoice_id = ?`,
    [invoiceId]
  );

  if (!headers.length) {
    throw ApiError.notFound("Invoice not found");
  }

  const lines = await executeQuery(
    conn,
    `SELECT il.po_line_no, il.material_code, il.plant_code, il.invoice_qty, il.uom
     FROM invoice_lines il
     WHERE il.invoice_id = ?
     ORDER BY il.po_line_no`,
    [invoiceId]
  );

  return { invoice: headers[0], lines };
}

/**
 * Human-readable QR content for invoice print (scannable without decryption).
 * @param {object} invoice
 * @param {object[]} lines
 * @returns {string}
 */
function buildReadableQRContent(invoice, lines) {
  return JSON.stringify({
    vendorCode: invoice.vendor_code,
    poNumber: invoice.po_number,
    invoiceNumber: invoice.invoice_number,
    systemInvoiceId: invoice.system_invoice_id,
    lines: lines.map((l) => ({
      materialCode: l.material_code,
      quantity: Number(l.invoice_qty),
      uom: l.uom ?? undefined,
    })),
  });
}

// Per-material QR content (FRD: vendor code, PO no, invoice no, invoice date,
// department, PO line no). Department has no source field yet, so it is left
// blank between the delimiters. Order matches the agreed barcode spec sheet.
const QR_LINE_FIELD_DELIMITER = "|";

/**
 * Formats a DB invoice_date into DDMMYYYY (matches the barcode spec sheet).
 * @param {Date|string} value
 * @returns {string}
 */
function formatInvoiceDateDDMMYYYY(value) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    return String(value ?? "").replace(/[^0-9]/g, "");
  }
  const dd = String(date.getDate()).padStart(2, "0");
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const yyyy = String(date.getFullYear());
  return `${dd}${mm}${yyyy}`;
}

/**
 * Builds the scannable per-material QR string with the 6 spec fields:
 * vendorCode | poNumber | invoiceNumber | invoiceDate | department | poLineNo.
 * Department is intentionally empty (no source field).
 * @param {object} invoice
 * @param {object} line
 * @returns {string}
 */
function buildLineQrString(invoice, line) {
  const department = "";
  return [
    invoice.vendor_code ?? "",
    invoice.po_number ?? "",
    invoice.invoice_number ?? "",
    formatInvoiceDateDDMMYYYY(invoice.invoice_date),
    department,
    line.po_line_no ?? "",
  ].join(QR_LINE_FIELD_DELIMITER);
}

/**
 * @param {string} text
 * @returns {Promise<Buffer>}
 */
async function renderQRImage(text) {
  const payload = typeof text === "string" ? text.trim() : "";
  if (!payload) {
    throw ApiError.internal("QR payload is empty");
  }

  return QRCode.toBuffer(payload, {
    errorCorrectionLevel: "H",
    width: QR_IMAGE_WIDTH,
    margin: 2,
    type: "png",
  });
}

/**
 * @param {object} invoice
 * @param {object[]} lines
 * @returns {object}
 */
function buildQRPayloadObject(invoice, lines) {
  const invDate =
    invoice.invoice_date instanceof Date
      ? invoice.invoice_date.toISOString().slice(0, 10)
      : String(invoice.invoice_date).slice(0, 10);

  const ts = Math.floor(Date.now() / 1000);

  const body = {
    v: QR_VERSION,
    sid: invoice.system_invoice_id,
    ven: invoice.vendor_code,
    po: invoice.po_number,
    inv: invoice.invoice_number,
    invDate,
    plant: invoice.plant_code ?? lines[0]?.plant_code,
    lines: lines.map((l) => ({
      line: l.po_line_no,
      mat: l.material_code,
      qty: Number(l.invoice_qty),
      uom: l.uom,
    })),
    ts,
  };

  return { ...body, chk: signPayload(body) };
}

/**
 * @param {string} jsonPayload
 * @param {string} readableQrText
 * @returns {Promise<{ encrypted: string, qrImageBase64: string, qrImageBuffer: Buffer }>}
 */
async function buildQRArtifacts(jsonPayload, readableQrText) {
  const base64Payload = Buffer.from(jsonPayload, "utf8").toString("base64");
  const encrypted = encrypt(base64Payload);

  const qrImageBuffer = await renderQRImage(readableQrText);
  const qrImageBase64 = `data:image/png;base64,${qrImageBuffer.toString("base64")}`;

  return { encrypted, qrImageBase64, qrImageBuffer };
}

/**
 * Generates encrypted QR for an invoice and persists to qr_codes.
 * @param {number} invoiceId
 * @param {import('mysql2/promise').PoolConnection|null} [conn] Optional transaction connection
 * @returns {Promise<{ qrImageBase64: string, systemInvoiceId: string, qrDataEncrypted: string, qrDataHash: string }>}
 */
export async function generateQR(invoiceId, conn = null) {
  const { invoice, lines } = await fetchInvoiceForQR(invoiceId, conn);

  if (!["submitted", "qr_generated", "verified"].includes(invoice.status)) {
    throw ApiError.badRequest(
      "Invoice must be submitted before QR generation"
    );
  }

  const payload = buildQRPayloadObject(invoice, lines);
  const jsonPayload = JSON.stringify(payload);
  const readableQrText = buildReadableQRContent(invoice, lines);
  const qrDataHash = hashData(jsonPayload);

  const { encrypted, qrImageBase64 } = await buildQRArtifacts(jsonPayload, readableQrText);

  await executeQuery(
    conn,
    `INSERT INTO qr_codes (invoice_id, qr_data_encrypted, qr_data_hash)
     VALUES (?, ?, ?)
     ON DUPLICATE KEY UPDATE
       qr_data_encrypted = VALUES(qr_data_encrypted),
       qr_data_hash = VALUES(qr_data_hash),
       generated_at = NOW(3),
       scanned_count = 0,
       last_scanned_at = NULL`,
    [invoiceId, encrypted, qrDataHash]
  );

  await executeQuery(
    conn,
    `UPDATE invoices
     SET status = 'qr_generated',
         qr_code_data = ?,
         qr_generated_at = NOW(3),
         submitted_at = COALESCE(submitted_at, NOW(3))
     WHERE invoice_id = ?`,
    [encrypted, invoiceId]
  );

  return {
    qrImageBase64,
    systemInvoiceId: invoice.system_invoice_id,
    qrDataEncrypted: encrypted,
    qrDataHash,
  };
}

/**
 * Regenerates QR for an existing invoice (admin).
 * @param {number} invoiceId
 */
export async function regenerateQR(invoiceId) {
  await del(cacheKeys.qrImage(invoiceId));
  await del(`${cacheKeys.qrImage(invoiceId)}:readable`);
  await del(cacheKeys.qrLines(invoiceId));
  return generateQR(invoiceId, null);
}

/**
 * Returns one QR per material/PO line for an invoice. Each QR encodes the
 * 6-field spec string (vendor, PO, invoice no, invoice date, department, line).
 * @param {number} invoiceId
 * @returns {Promise<{ lines: Array<{ poLineNo: number, materialCode: string, qrString: string, qrImageBase64: string }> }>}
 */
export async function getInvoiceLineQRImages(invoiceId) {
  const cacheKey = cacheKeys.qrLines(invoiceId);
  const cached = await get(cacheKey);
  if (cached) {
    try {
      return { lines: JSON.parse(cached), fromCache: true };
    } catch {
      // Corrupted cache entry — fall through and regenerate.
    }
  }

  const { invoice, lines } = await fetchInvoiceForQR(invoiceId);

  if (!["submitted", "qr_generated", "verified"].includes(invoice.status)) {
    throw ApiError.notFound("QR code not available for this invoice status");
  }

  if (!lines.length) {
    throw ApiError.notFound("Invoice has no lines for QR generation");
  }

  const lineQrs = await Promise.all(
    lines.map(async (line) => {
      const qrString = buildLineQrString(invoice, line);
      const buffer = await renderQRImage(qrString);
      return {
        poLineNo: line.po_line_no,
        materialCode: line.material_code,
        qrString,
        qrImageBase64: `data:image/png;base64,${buffer.toString("base64")}`,
      };
    })
  );

  await set(cacheKey, JSON.stringify(lineQrs), CACHE_TTL.qrImage);

  return { lines: lineQrs, fromCache: false };
}

/**
 * Returns QR PNG image for an invoice (readable JSON: vendor, PO, materials, qty).
 * @param {number} invoiceId
 */
export async function getQRImage(invoiceId) {
  const cacheKey = `${cacheKeys.qrImage(invoiceId)}:readable`;
  const cached = await get(cacheKey);

  if (cached) {
    const qrImageBuffer = Buffer.from(cached, "base64");
    const qrImageBase64 = `data:image/png;base64,${cached}`;
    return { qrImageBuffer, qrImageBase64, encrypted: null, fromCache: true };
  }

  const { invoice, lines } = await fetchInvoiceForQR(invoiceId);

  if (!["submitted", "qr_generated", "verified"].includes(invoice.status)) {
    throw ApiError.notFound("QR code not available for this invoice status");
  }

  if (!lines.length) {
    throw ApiError.notFound("Invoice has no lines for QR generation");
  }

  const readableQrText = buildReadableQRContent(invoice, lines);
  const qrImageBuffer = await renderQRImage(readableQrText);

  const b64 = qrImageBuffer.toString("base64");
  await set(cacheKey, b64, CACHE_TTL.qrImage);

  const qrImageBase64 = `data:image/png;base64,${b64}`;

  return { qrImageBuffer, qrImageBase64, encrypted: null, fromCache: false };
}

/**
 * @param {object} readable
 * @param {object} auditBase
 * @param {object} context
 */
async function verifyReadableQR(readable, auditBase, context) {
  const lookupSql = readable.systemInvoiceId
    ? `SELECT i.invoice_id, i.system_invoice_id, i.invoice_number, i.vendor_code,
              i.po_number, i.invoice_date, i.status, ph.plant_code
       FROM invoices i
       INNER JOIN po_headers ph ON ph.po_number = i.po_number
       WHERE i.system_invoice_id = ?
       LIMIT 1`
    : `SELECT i.invoice_id, i.system_invoice_id, i.invoice_number, i.vendor_code,
              i.po_number, i.invoice_date, i.status, ph.plant_code
       FROM invoices i
       INNER JOIN po_headers ph ON ph.po_number = i.po_number
       WHERE i.vendor_code = ? AND i.po_number = ? AND i.invoice_number = ?
       LIMIT 1`;

  const lookupParams = readable.systemInvoiceId
    ? [readable.systemInvoiceId]
    : [readable.vendorCode, readable.poNumber, readable.invoiceNumber ?? ""];

  const [invoices] = await query(lookupSql, lookupParams);

  if (!invoices.length) {
    await writeAuditLog(null, {
      ...auditBase,
      entityId: readable.systemInvoiceId ?? readable.invoiceNumber ?? "unknown",
      newValues: { valid: false, reason: "invoice_not_found" },
    });
    return { valid: false, reason: "Invoice not found in system" };
  }

  const dbInvoice = invoices[0];

  if (
    dbInvoice.vendor_code !== readable.vendorCode ||
    dbInvoice.po_number !== readable.poNumber
  ) {
    await writeAuditLog(null, {
      ...auditBase,
      entityId: dbInvoice.system_invoice_id,
      newValues: { valid: false, reason: "data_mismatch" },
    });
    return { valid: false, reason: "QR data does not match invoice records" };
  }

  const [dbLines] = await query(
    `SELECT il.po_line_no, il.material_code, il.invoice_qty, il.uom, il.plant_code,
            m.material_description
     FROM invoice_lines il
     INNER JOIN materials m ON m.material_code = il.material_code
     WHERE il.invoice_id = ?
     ORDER BY il.po_line_no`,
    [dbInvoice.invoice_id]
  );

  const qrLineMap = new Map(
    readable.lines.map((l) => [String(l.materialCode), Number(l.quantity)])
  );

  for (const line of dbLines) {
    const expectedQty = qrLineMap.get(String(line.material_code));
    if (expectedQty === undefined || expectedQty !== Number(line.invoice_qty)) {
      await writeAuditLog(null, {
        ...auditBase,
        entityId: dbInvoice.system_invoice_id,
        newValues: { valid: false, reason: "line_mismatch" },
      });
      return { valid: false, reason: "QR line quantities do not match invoice" };
    }
  }

  const scannerId = context.apiKey
    ? `api:${sha256Hex(context.apiKey).slice(0, 16)}`
    : `ip:${context.ipAddress ?? "unknown"}`;

  await tryQrScanDedup(hashData(JSON.stringify(readable)), scannerId);

  await query(
    `UPDATE qr_codes
     SET scanned_count = scanned_count + 1, last_scanned_at = NOW(3)
     WHERE invoice_id = ?`,
    [dbInvoice.invoice_id]
  );

  const invDate =
    dbInvoice.invoice_date instanceof Date
      ? dbInvoice.invoice_date.toISOString().slice(0, 10)
      : String(dbInvoice.invoice_date).slice(0, 10);

  await writeAuditLog(null, {
    ...auditBase,
    entityId: dbInvoice.system_invoice_id,
    newValues: { valid: true, invoiceId: dbInvoice.invoice_id, format: "readable" },
  });

  return {
    valid: true,
    invoice: {
      invoiceId: dbInvoice.invoice_id,
      systemInvoiceId: dbInvoice.system_invoice_id,
      invoiceNumber: dbInvoice.invoice_number,
      vendorCode: dbInvoice.vendor_code,
      poNumber: dbInvoice.po_number,
      invoiceDate: invDate,
      plantCode: dbInvoice.plant_code,
      status: dbInvoice.status,
    },
    lines: dbLines.map((l) => ({
      poLineNo: l.po_line_no,
      materialCode: l.material_code,
      materialDescription: l.material_description,
      invoiceQty: Number(l.invoice_qty),
      uom: l.uom,
      plantCode: l.plant_code,
    })),
  };
}

/**
 * Verifies a scanned encrypted QR payload.
 * @param {string} encryptedPayload
 * @param {object} [context]
 * @param {string|null} [context.ipAddress]
 * @param {string|null} [context.userAgent]
 * @param {string|null} [context.apiKey]
 * @returns {Promise<{ valid: boolean, reason?: string, invoice?: object, lines?: object[] }>}
 */
export async function verifyQR(encryptedPayload, context = {}) {
  const auditBase = {
    actorUserId: null,
    action: "QR_VERIFY",
    entityType: "qr",
    entityId: "scan",
    ipAddress: context.ipAddress ?? null,
    userAgent: context.userAgent ?? null,
  };

  if (!encryptedPayload || typeof encryptedPayload !== "string") {
    await writeAuditLog(null, {
      ...auditBase,
      newValues: { valid: false, reason: "missing_payload" },
    });
    return { valid: false, reason: "Encrypted payload is required" };
  }

  const trimmedPayload = encryptedPayload.trim();

  try {
    const readable = JSON.parse(trimmedPayload);
    if (readable?.vendorCode && readable?.poNumber && Array.isArray(readable.lines)) {
      return verifyReadableQR(readable, auditBase, context);
    }
  } catch {
    // Not readable JSON — fall through to encrypted verification.
  }

  let jsonPayload;
  try {
    const base64Inner = decrypt(trimmedPayload);
    jsonPayload = Buffer.from(base64Inner, "base64").toString("utf8");
  } catch {
    await writeAuditLog(null, {
      ...auditBase,
      newValues: { valid: false, reason: "decrypt_failed" },
    });
    return { valid: false, reason: "Invalid or corrupted QR payload" };
  }

  let payload;
  try {
    payload = JSON.parse(jsonPayload);
  } catch {
    await writeAuditLog(null, {
      ...auditBase,
      newValues: { valid: false, reason: "parse_failed" },
    });
    return { valid: false, reason: "QR payload is not valid JSON" };
  }

  if (!payload.chk || !verifyPayloadSignature(payload, payload.chk)) {
    await writeAuditLog(null, {
      ...auditBase,
      entityId: payload.sid ?? "unknown",
      newValues: { valid: false, reason: "invalid_signature" },
    });
    return { valid: false, reason: "QR integrity check failed" };
  }

  const now = Math.floor(Date.now() / 1000);
  if (!payload.ts || now - payload.ts > MAX_PAYLOAD_AGE_SEC) {
    await writeAuditLog(null, {
      ...auditBase,
      entityId: payload.sid ?? "unknown",
      newValues: { valid: false, reason: "expired_timestamp" },
    });
    return { valid: false, reason: "QR payload has expired" };
  }

  const [invoices] = await query(
    `SELECT i.invoice_id, i.system_invoice_id, i.invoice_number, i.vendor_code,
            i.po_number, i.invoice_date, i.status, ph.plant_code
     FROM invoices i
     INNER JOIN po_headers ph ON ph.po_number = i.po_number
     WHERE i.system_invoice_id = ?
     LIMIT 1`,
    [payload.sid]
  );

  if (!invoices.length) {
    await writeAuditLog(null, {
      ...auditBase,
      entityId: payload.sid,
      newValues: { valid: false, reason: "invoice_not_found" },
    });
    return { valid: false, reason: "Invoice not found in system" };
  }

  const dbInvoice = invoices[0];
  const invDate =
    dbInvoice.invoice_date instanceof Date
      ? dbInvoice.invoice_date.toISOString().slice(0, 10)
      : String(dbInvoice.invoice_date).slice(0, 10);

  if (
    dbInvoice.vendor_code !== payload.ven ||
    dbInvoice.po_number !== payload.po ||
    dbInvoice.invoice_number !== payload.inv
  ) {
    await writeAuditLog(null, {
      ...auditBase,
      entityId: payload.sid,
      newValues: { valid: false, reason: "data_mismatch" },
    });
    return { valid: false, reason: "QR data does not match invoice records" };
  }

  const [dbLines] = await query(
    `SELECT il.po_line_no, il.material_code, il.invoice_qty, il.uom, il.plant_code,
            m.material_description
     FROM invoice_lines il
     INNER JOIN materials m ON m.material_code = il.material_code
     WHERE il.invoice_id = ?
     ORDER BY il.po_line_no`,
    [dbInvoice.invoice_id]
  );

  const scannerId = context.apiKey
    ? `api:${sha256Hex(context.apiKey).slice(0, 16)}`
    : `ip:${context.ipAddress ?? "unknown"}`;

  await tryQrScanDedup(hashData(encryptedPayload), scannerId);

  await query(
    `UPDATE qr_codes
     SET scanned_count = scanned_count + 1, last_scanned_at = NOW(3)
     WHERE invoice_id = ?`,
    [dbInvoice.invoice_id]
  );

  const formattedInvoice = {
    invoiceId: dbInvoice.invoice_id,
    systemInvoiceId: dbInvoice.system_invoice_id,
    invoiceNumber: dbInvoice.invoice_number,
    vendorCode: dbInvoice.vendor_code,
    poNumber: dbInvoice.po_number,
    invoiceDate: invDate,
    plantCode: dbInvoice.plant_code,
    status: dbInvoice.status,
  };

  const formattedLines = dbLines.map((l) => ({
    poLineNo: l.po_line_no,
    materialCode: l.material_code,
    materialDescription: l.material_description,
    invoiceQty: Number(l.invoice_qty),
    uom: l.uom,
    plantCode: l.plant_code,
  }));

  await writeAuditLog(null, {
    ...auditBase,
    entityId: payload.sid,
    newValues: { valid: true, invoiceId: dbInvoice.invoice_id },
  });

  return {
    valid: true,
    invoice: formattedInvoice,
    lines: formattedLines,
  };
}

/**
 * Validates company API key when provided.
 * @param {string|undefined} apiKey
 * @returns {boolean}
 */
export function isValidQrApiKey(apiKey) {
  const expected = process.env.QR_VERIFY_API_KEY;
  if (!expected || !apiKey) {
    return false;
  }
  return timingSafeCompareStrings(apiKey, expected);
}
