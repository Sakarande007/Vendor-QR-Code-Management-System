import { ApiError } from "./ApiError.js";

/**
 * @param {{ role: string }} user
 * @returns {boolean}
 */
export function isAdmin(user) {
  return user.role === "admin" || user.role === "superadmin";
}

/**
 * @param {{ role: string }} user
 */
export function assertAdmin(user) {
  if (!isAdmin(user)) {
    throw ApiError.forbidden("Admin access required");
  }
}

/**
 * Vendor users may only access their own user record.
 * @param {{ userId: number, role: string }} user
 * @param {number} targetUserId
 */
export function assertSelfOrAdmin(user, targetUserId) {
  if (isAdmin(user)) {
    return;
  }
  if (user.userId !== targetUserId) {
    throw ApiError.forbidden("You can only access your own profile");
  }
}

/**
 * Vendor users may only access data for their vendor_code.
 * @param {{ role: string, vendorCode?: string|null }} user
 * @param {string} vendorCode
 */
export function assertVendorScope(user, vendorCode) {
  if (isAdmin(user)) {
    return;
  }
  if (user.role === "vendor" && user.vendorCode === vendorCode) {
    return;
  }
  throw ApiError.forbidden("You do not have access to this vendor");
}
