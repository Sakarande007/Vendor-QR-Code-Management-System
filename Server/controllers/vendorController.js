import * as vendorService from "../services/vendorService.js";
import { assertAdmin } from "../utils/accessControl.js";
import { auditContextFromRequest } from "../utils/auditHelper.js";
import { ApiResponse } from "../utils/ApiResponse.js";

/**
 * GET /api/vendors — Admin list with cursor pagination.
 * @type {import('express').RequestHandler}
 */
export async function getAllVendors(req, res) {
  assertAdmin(req.user);

  const result = await vendorService.listVendors(req.query);

  return ApiResponse.success(res, {
    vendors: result.vendors,
    totalCount: result.totalCount,
    pagination: result.pagination,
  });
}

/**
 * GET /api/vendors/:vendorCode — Admin vendor detail with user count.
 * @type {import('express').RequestHandler}
 */
export async function getVendorById(req, res) {
  assertAdmin(req.user);

  const vendor = await vendorService.getVendorByCode(req.params.vendorCode);

  return ApiResponse.success(res, { vendor });
}

/**
 * POST /api/vendors — Admin create vendor with auto-generated login credentials.
 * @type {import('express').RequestHandler}
 */
export async function createVendor(req, res) {
  assertAdmin(req.user);

  const result = await vendorService.createVendor(req.body, {
    actorUserId: req.user.userId,
    ...auditContextFromRequest(req),
  });

  return ApiResponse.success(
    res,
    {
      vendor_code: result.vendorCode,
      vendor_name: result.vendorName,
      email: result.email,
      login_credentials: {
        username: result.loginCredentials.username,
        temporary_password: result.loginCredentials.temporaryPassword,
        note: result.loginCredentials.note,
      },
    },
    "Vendor created successfully",
    201
  );
}

/**
 * POST /api/vendors/:vendorCode/reset-password — Admin set/reset vendor login password.
 * @type {import('express').RequestHandler}
 */
export async function resetVendorPassword(req, res) {
  assertAdmin(req.user);

  const result = await vendorService.resetVendorPassword(
    req.params.vendorCode,
    req.body ?? {},
    {
      actorUserId: req.user.userId,
      ...auditContextFromRequest(req),
    }
  );

  return ApiResponse.success(
    res,
    {
      vendor_code: result.vendorCode,
      vendor_name: result.vendorName,
      email: result.email,
      login_credentials: {
        username: result.loginCredentials.username,
        temporary_password: result.loginCredentials.temporaryPassword,
        note: result.loginCredentials.note,
      },
    },
    "Vendor password updated successfully"
  );
}

/**
 * PATCH /api/vendors/:vendorCode — Admin partial update (vendor_code immutable).
 * @type {import('express').RequestHandler}
 */
export async function updateVendor(req, res) {
  assertAdmin(req.user);

  const vendor = await vendorService.updateVendor(
    req.params.vendorCode,
    req.body,
    {
      actorUserId: req.user.userId,
      ...auditContextFromRequest(req),
    }
  );

  return ApiResponse.success(res, { vendor }, "Vendor updated successfully");
}

/**
 * PATCH /api/vendors/:vendorCode/status — Activate or deactivate vendor.
 * @type {import('express').RequestHandler}
 */
export async function toggleVendorStatus(req, res) {
  assertAdmin(req.user);

  const vendor = await vendorService.toggleVendorStatus(
    req.params.vendorCode,
    req.body.status,
    {
      actorUserId: req.user.userId,
      ...auditContextFromRequest(req),
    }
  );

  return ApiResponse.success(res, { vendor }, `Vendor ${req.body.status === "active" ? "activated" : "deactivated"}`);
}
