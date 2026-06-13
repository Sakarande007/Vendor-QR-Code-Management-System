import * as qrService from "../services/qrService.js";
import { assertAdmin, isAdmin } from "../utils/accessControl.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { query } from "../config/db.js";

/**
 * POST /api/qr/verify — Company scanner endpoint (API key recommended).
 * @type {import('express').RequestHandler}
 */
export async function verifyQR(req, res) {
  const result = await qrService.verifyQR(req.body.encryptedPayload, {
    ipAddress: req.ip ?? null,
    userAgent: req.get("user-agent") ?? null,
    apiKey: req.qrApiKey ?? req.headers["x-api-key"] ?? null,
  });

  const statusCode = result.valid ? 200 : 422;

  return res.status(statusCode).json({
    success: result.valid,
    data: result,
    message: result.valid ? "QR verified successfully" : result.reason,
    requestId: res.locals.requestId ?? null,
    timestamp: new Date().toISOString(),
  });
}

/**
 * GET /api/qr/:invoiceId/image — QR PNG for authorized users.
 * @type {import('express').RequestHandler}
 */
export async function getQRImage(req, res) {
  const invoiceId = Number(req.params.invoiceId);

  const [rows] = await query(
    `SELECT vendor_code FROM invoices WHERE invoice_id = ? LIMIT 1`,
    [invoiceId]
  );

  if (!rows.length) {
    throw ApiError.notFound("Invoice not found");
  }

  if (!isAdmin(req.user) && rows[0].vendor_code !== req.user.vendorCode) {
    throw ApiError.forbidden("You do not have access to this QR code");
  }

  const { qrImageBuffer, fromCache } = await qrService.getQRImage(invoiceId);

  res.setHeader("Content-Type", "image/png");
  res.setHeader("Cache-Control", "private, max-age=86400, immutable");
  res.setHeader("Vary", "Accept-Encoding");
  if (fromCache) {
    res.setHeader("X-Cache", "HIT");
  }
  return res.send(qrImageBuffer);
}

/**
 * GET /api/qr/:invoiceId/lines — Per-material QR codes (one per PO line).
 * @type {import('express').RequestHandler}
 */
export async function getInvoiceLineQRs(req, res) {
  const invoiceId = Number(req.params.invoiceId);

  const [rows] = await query(
    `SELECT vendor_code FROM invoices WHERE invoice_id = ? LIMIT 1`,
    [invoiceId]
  );

  if (!rows.length) {
    throw ApiError.notFound("Invoice not found");
  }

  if (!isAdmin(req.user) && rows[0].vendor_code !== req.user.vendorCode) {
    throw ApiError.forbidden("You do not have access to this QR code");
  }

  const result = await qrService.getInvoiceLineQRImages(invoiceId);

  return ApiResponse.success(res, result, "Per-material QR codes generated");
}

/**
 * POST /api/qr/:invoiceId/regenerate — Admin regenerate QR.
 * @type {import('express').RequestHandler}
 */
export async function regenerateQR(req, res) {
  assertAdmin(req.user);

  const invoiceId = Number(req.params.invoiceId);
  const result = await qrService.regenerateQR(invoiceId);

  return ApiResponse.success(res, result, "QR code regenerated successfully");
}
