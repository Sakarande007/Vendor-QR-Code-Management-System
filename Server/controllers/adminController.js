import * as adminService from "../services/adminService.js";
import { ApiResponse } from "../utils/ApiResponse.js";

/**
 * GET /api/admin/dashboard
 * @type {import('express').RequestHandler}
 */
export async function getDashboard(req, res) {
  const data = await adminService.getAdminDashboard();
  return ApiResponse.success(res, data);
}

/**
 * GET /api/admin/audit-logs
 * @type {import('express').RequestHandler}
 */
export async function getAuditLogs(req, res) {
  const result = await adminService.listAuditLogs(req.query);
  return ApiResponse.success(res, result);
}

/**
 * GET /api/admin/po-sync-history
 * @type {import('express').RequestHandler}
 */
export async function getPOSyncHistory(req, res) {
  const limit = Number(req.query.limit) || 5;
  const history = await adminService.getPOSyncHistory(Math.min(limit, 20));
  return ApiResponse.success(res, { history });
}
