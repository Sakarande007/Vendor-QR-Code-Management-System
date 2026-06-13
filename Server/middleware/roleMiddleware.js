import { ApiError } from "../utils/ApiError.js";

/**
 * Factory that restricts route access to one or more roles.
 * Must run after authenticate middleware.
 * @param {...('vendor'|'admin'|'superadmin')} allowedRoles
 * @returns {import('express').RequestHandler}
 */
export function role(...allowedRoles) {
  return (req, _res, next) => {
    if (!req.user) {
      return next(ApiError.unauthorized("Authentication required"));
    }

    if (!allowedRoles.includes(req.user.role)) {
      return next(ApiError.forbidden("You do not have permission to access this resource"));
    }

    return next();
  };
}

/** @type {import('express').RequestHandler} */
export const vendorOnly = role("vendor");

/** @type {import('express').RequestHandler} */
export const adminOnly = role("admin", "superadmin");

/** @type {import('express').RequestHandler} */
export const superadminOnly = role("superadmin");
