import * as adminDashboardService from "../services/adminDashboardService.js";
import { ApiResponse } from "../utils/ApiResponse.js";

/**
 * GET /api/admin/dashboard/balance — PO balance overview (existing /api/admin/dashboard unchanged).
 * @type {import('express').RequestHandler}
 */
export async function getAdminDashboardSummary(req, res) {
  const data = await adminDashboardService.getAdminDashboardSummary();

  return ApiResponse.success(res, data);
}

/**
 * GET /api/admin/vendors/:vendorCode/po-balance
 * @type {import('express').RequestHandler}
 */
export async function getAdminVendorPOBalance(req, res) {
  const data = await adminDashboardService.getAdminVendorPOBalance(
    req.params.vendorCode
  );

  return ApiResponse.success(res, data);
}

/**
 * GET /api/admin/po-balance
 * @type {import('express').RequestHandler}
 */
export async function getAdminAllPOBalance(req, res) {
  const result = await adminDashboardService.getAdminAllPOBalance(req.query);

  return ApiResponse.success(res, result);
}

/**
 * GET /api/admin/materials/balance
 * @type {import('express').RequestHandler}
 */
export async function getAdminMaterialBalanceSummary(req, res) {
  const materials = await adminDashboardService.getAdminMaterialBalanceSummary(
    req.query
  );

  return ApiResponse.success(res, { materials });
}

/**
 * GET /api/admin/po-balance/export
 * @type {import('express').RequestHandler}
 */
export async function exportPOBalanceExcel(req, res) {
  const { buffer, filename } =
    await adminDashboardService.exportPOBalanceExcel(req.query);

  res.setHeader(
    "Content-Type",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
  );
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  res.setHeader("Content-Length", buffer.length);

  return res.send(buffer);
}
