import * as poService from "../services/poService.js";
import { auditContextFromRequest } from "../utils/auditHelper.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { parsePOUploadFile } from "../utils/poFileParser.js";
import { ApiError } from "../utils/ApiError.js";

/**
 * @param {import('express').Request} req
 */
function auditFromReq(req) {
  return {
    actorUserId: req.user.userId,
    ...auditContextFromRequest(req),
  };
}

/**
 * GET /api/pos/mine — Vendor PO list (vendor_code scoped in SQL).
 * @type {import('express').RequestHandler}
 */
export async function getMyPOs(req, res) {
  const result = await poService.getMyPOs(req);

  return ApiResponse.success(res, {
    purchaseOrders: result.purchaseOrders,
    totalCount: result.totalCount,
    pagination: result.pagination,
  });
}

/**
 * GET /api/pos/mine/:poNumber — Vendor PO detail with lines.
 * @type {import('express').RequestHandler}
 */
export async function getPODetails(req, res) {
  const data = await poService.getPODetailsForVendor(req, req.params.poNumber);

  return ApiResponse.success(res, data);
}

/**
 * GET /api/pos — Admin all POs.
 * @type {import('express').RequestHandler}
 */
export async function getAllPOs(req, res) {
  const result = await poService.getAllPOs(req.query);

  return ApiResponse.success(res, {
    purchaseOrders: result.purchaseOrders,
    totalCount: result.totalCount,
    pagination: result.pagination,
  });
}

/**
 * POST /api/pos/sync — Admin ERP JSON sync.
 * @type {import('express').RequestHandler}
 */
export async function syncPOFromERP(req, res) {
  const result = await poService.syncPurchaseOrders(
    req.body.purchaseOrders,
    auditFromReq(req)
  );

  const statusCode = result.errors.length > 0 ? 422 : 200;

  return res.status(statusCode).json({
    success: result.errors.length === 0,
    data: result,
    message:
      result.errors.length > 0
        ? "PO sync validation failed"
        : "PO sync completed successfully",
    requestId: res.locals.requestId ?? null,
    timestamp: new Date().toISOString(),
  });
}

/**
 * POST /api/pos/upload — Admin Excel/CSV bulk upload.
 * @type {import('express').RequestHandler}
 */
export async function bulkUploadPO(req, res) {
  if (!req.file) {
    throw ApiError.badRequest("File is required");
  }

  const purchaseOrders = parsePOUploadFile(
    req.file.buffer,
    req.file.mimetype,
    req.file.originalname
  );

  const result = await poService.syncPurchaseOrders(purchaseOrders, auditFromReq(req));

  const statusCode = result.errors.length > 0 ? 422 : 200;

  return res.status(statusCode).json({
    success: result.errors.length === 0,
    data: result,
    message:
      result.errors.length > 0
        ? "PO upload validation failed"
        : "PO upload completed successfully",
    requestId: res.locals.requestId ?? null,
    timestamp: new Date().toISOString(),
  });
}
