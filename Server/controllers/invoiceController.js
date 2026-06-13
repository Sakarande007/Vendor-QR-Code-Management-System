import * as invoiceService from "../services/invoiceService.js";
import {
  enqueueInvoiceSubmit,
  isInvoiceQueueEnabled,
} from "../queues/invoiceQueue.js";
import { assertAdmin } from "../utils/accessControl.js";
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
 * POST /api/invoices/generate-from-po-line
 * @type {import('express').RequestHandler}
 */
export async function generateInvoiceFromPOLine(req, res) {
  assertAdmin(req.user);

  const data = await invoiceService.generateInvoiceFromPOLine(
    req.body,
    auditFromReq(req)
  );

  return ApiResponse.success(
    res,
    data,
    "Invoice generated and balance updated",
    201
  );
}

/**
 * POST /api/invoices/persist — Create, update draft, submit, or append partial invoice.
 * @type {import('express').RequestHandler}
 */
export async function persistInvoice(req, res) {
  const vendorCode = req.user?.vendorCode;
  if (!vendorCode) {
    throw ApiError.forbidden("Vendor account is not linked to a vendor code");
  }

  const mode = req.body.mode ?? "draft";
  const data = await invoiceService.persistInvoiceForVendor(
    vendorCode,
    req.user.userId,
    req.body,
    auditFromReq(req),
    mode
  );

  const message =
    mode === "submit"
      ? data.partialAppend
        ? "Partial invoice added and QR code updated"
        : data.regeneratedFromRejected
          ? "Invoice regenerated and QR code updated"
          : "Invoice submitted and QR code generated"
      : data.invoice?.status === "draft" && req.body.invoiceNumber
        ? "Invoice draft updated successfully"
        : "Invoice draft saved successfully";

  const statusCode = mode === "submit" && !data.partialAppend ? 200 : mode === "submit" ? 200 : 201;

  return ApiResponse.success(res, data, message, statusCode);
}

/**
 * POST /api/invoices/draft
 * @type {import('express').RequestHandler}
 */
export async function createInvoiceDraft(req, res) {
  const data = await invoiceService.createInvoiceDraft(req, req.body, auditFromReq(req));

  return ApiResponse.success(res, data, "Invoice draft created successfully", 201);
}

/**
 * POST /api/invoices/:invoiceId/submit
 * @type {import('express').RequestHandler}
 */
export async function submitInvoice(req, res) {
  const invoiceId = Number(req.params.invoiceId);
  const audit = auditFromReq(req);

  if (!req.user?.vendorCode) {
    throw ApiError.forbidden("Vendor account is not linked to a vendor code");
  }

  if (isInvoiceQueueEnabled()) {
    const job = await enqueueInvoiceSubmit({
      invoiceId,
      vendorCode: req.user.vendorCode,
      audit,
    });

    return ApiResponse.success(
      res,
      {
        invoiceId,
        submitStatus: job.submitStatus,
        jobId: job.jobId,
        message: "Processing…",
      },
      "Invoice submission queued for processing",
      202
    );
  }

  const data = await invoiceService.submitInvoice(req, invoiceId, audit);

  return ApiResponse.success(res, data, "Invoice submitted and QR code generated");
}

/**
 * GET /api/invoices/mine
 * @type {import('express').RequestHandler}
 */
export async function getMyInvoices(req, res) {
  const result = await invoiceService.getMyInvoices(req);

  return ApiResponse.success(res, {
    invoices: result.invoices,
    totalCount: result.totalCount,
    pagination: result.pagination,
  });
}

/**
 * GET /api/invoices/:invoiceId
 * @type {import('express').RequestHandler}
 */
export async function getInvoiceDetails(req, res) {
  const data = await invoiceService.getInvoiceDetails(req, Number(req.params.invoiceId));

  return ApiResponse.success(res, data);
}

/**
 * GET /api/invoices
 * @type {import('express').RequestHandler}
 */
export async function getAllInvoices(req, res) {
  assertAdmin(req.user);

  const result = await invoiceService.getAllInvoices(req.query);

  return ApiResponse.success(res, {
    invoices: result.invoices,
    totalCount: result.totalCount,
    pagination: result.pagination,
  });
}

/**
 * PATCH /api/invoices/:invoiceId/status
 * @type {import('express').RequestHandler}
 */
export async function updateInvoiceStatus(req, res) {
  assertAdmin(req.user);

  const data = await invoiceService.updateInvoiceStatus(
    Number(req.params.invoiceId),
    req.body,
    auditFromReq(req)
  );

  return ApiResponse.success(res, data, `Invoice marked as ${req.body.status}`);
}
