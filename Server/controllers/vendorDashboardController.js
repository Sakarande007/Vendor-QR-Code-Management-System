import * as vendorDashboardService from "../services/vendorDashboardService.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { ApiError } from "../utils/ApiError.js";

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
 * GET /api/vendor/dashboard
 * @type {import('express').RequestHandler}
 */
export async function getVendorDashboardSummary(req, res) {
  const data = await vendorDashboardService.getDashboardSummary(
    requireVendorCode(req)
  );

  return ApiResponse.success(res, data);
}

/**
 * GET /api/vendor/pos
 * @type {import('express').RequestHandler}
 */
export async function getVendorPOList(req, res) {
  const result = await vendorDashboardService.getVendorPOList(
    requireVendorCode(req),
    req.query
  );

  return ApiResponse.success(res, result);
}

/**
 * GET /api/vendor/pos/:poNumber
 * @type {import('express').RequestHandler}
 */
export async function getVendorPODetail(req, res) {
  const data = await vendorDashboardService.getVendorPODetail(
    requireVendorCode(req),
    req.params.poNumber
  );

  return ApiResponse.success(res, data);
}

/**
 * GET /api/vendor/materials/balance
 * @type {import('express').RequestHandler}
 */
export async function getVendorMaterialBalance(req, res) {
  const materials = await vendorDashboardService.getVendorMaterialBalance(
    requireVendorCode(req)
  );

  return ApiResponse.success(res, { materials });
}
