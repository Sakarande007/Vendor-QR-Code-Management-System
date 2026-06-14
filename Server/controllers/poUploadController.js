import * as poUploadService from "../services/poUploadService.js";
import { auditContextFromRequest } from "../utils/auditHelper.js";
import { ApiResponse } from "../utils/ApiResponse.js";
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
 * POST /api/admin/po/upload-excel — Parse SAP Excel and upsert PO data by vendor.
 * @type {import('express').RequestHandler}
 */
export async function uploadSAPExcel(req, res) {
  if (!req.file?.buffer) {
    throw ApiError.badRequest(
      "Excel file is required. Upload using form field name: po_file"
    );
  }

  const result = await poUploadService.processSAPExcelUpload(
    req.file.buffer,
    {
      originalname: req.file.originalname,
      mimetype: req.file.mimetype,
    },
    {
      actorUserId: req.user.userId,
      ...auditContextFromRequest(req),
    }
  );

  return res.status(200).json({
    success: true,
    batch_id: result.batchId,
    summary: result.summary,
    errors: result.errors,
    message: "SAP Excel PO upload completed",
    requestId: res.locals.requestId ?? null,
    timestamp: new Date().toISOString(),
  });
}

/**
 * GET /api/admin/po/upload-history
 * @type {import('express').RequestHandler}
 */
export async function getUploadHistory(req, res) {
  const result = await poUploadService.listUploadHistory(req.query);

  return ApiResponse.success(res, {
    batches: result.batches,
    totalCount: result.totalCount,
    pagination: result.pagination,
  });
}

/**
 * GET /api/admin/po/upload-history/:batchId
 * @type {import('express').RequestHandler}
 */
export async function getUploadBatchDetails(req, res) {
  const batch = await poUploadService.getUploadBatchById(req.params.batchId);

  return ApiResponse.success(res, { batch });
}

/**
 * POST /api/pos/mine/upload-excel — Vendor SAP Excel upload (scoped to logged-in vendor).
 * @type {import('express').RequestHandler}
 */
export async function uploadSAPExcelAsVendor(req, res) {
  if (!req.user?.vendorCode) {
    throw ApiError.forbidden("Vendor account is not linked to a vendor code");
  }

  if (!req.file?.buffer) {
    throw ApiError.badRequest(
      "Excel file is required. Upload using form field name: po_file"
    );
  }

  const result = await poUploadService.processSAPExcelUpload(
    req.file.buffer,
    {
      originalname: req.file.originalname,
      mimetype: req.file.mimetype,
    },
    auditFromReq(req),
    { restrictToVendorCode: req.user.vendorCode }
  );

  return ApiResponse.success(res, {
    batchId: result.batchId,
    summary: result.summary,
    errors: result.errors,
  }, "SAP Excel PO upload completed");
}

/**
 * GET /api/pos/mine/upload-history
 * @type {import('express').RequestHandler}
 */
export async function getMyUploadHistory(req, res) {
  const result = await poUploadService.listUploadHistory({
    ...req.query,
    uploadedBy: req.user.userId,
  });

  return ApiResponse.success(res, {
    batches: result.batches,
    totalCount: result.totalCount,
    pagination: result.pagination,
  });
}

/**
 * GET /api/pos/mine/upload-history/:batchId
 * @type {import('express').RequestHandler}
 */
export async function getMyUploadBatchDetails(req, res) {
  const batch = await poUploadService.getUploadBatchById(
    req.params.batchId,
    req.user.userId
  );

  return ApiResponse.success(res, { batch });
}
