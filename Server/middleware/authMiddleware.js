import jwt from "jsonwebtoken";
import { isAccessTokenDenied } from "../config/redis.js";
import { ApiError } from "../utils/ApiError.js";
import { asyncHandler } from "../utils/asyncHandler.js";

/**
 * @typedef {object} AuthUser
 * @property {number} userId
 * @property {string} email
 * @property {'vendor'|'admin'|'superadmin'} role
 * @property {string|null} vendorCode
 * @property {string|null} [vendorCodeSap]
 * @property {string|null} [vendorName]
 * @property {boolean} [mustChangePassword]
 * @property {string} sessionId
 * @property {string} jti
 */

/**
 * Verifies JWT access token from Authorization: Bearer header.
 * Rejects denylisted tokens (logout) via Redis jti lookup.
 * @type {import('express').RequestHandler}
 */
export const authenticate = asyncHandler(async (req, _res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader?.startsWith("Bearer ")) {
    throw ApiError.unauthorized("Access token is required");
  }

  const token = authHeader.slice(7).trim();

  if (!token) {
    throw ApiError.unauthorized("Access token is required");
  }

  const secret = process.env.JWT_ACCESS_SECRET;

  if (!secret) {
    throw ApiError.internal("Authentication is not configured");
  }

  try {
    /** @type {import('jsonwebtoken').JwtPayload} */
    const decoded = jwt.verify(token, secret, {
      algorithms: ["HS256"],
      issuer: process.env.JWT_ISSUER || "vendor-qr-api",
      audience: process.env.JWT_AUDIENCE || "vendor-qr-client",
    });

    if (!decoded.sub || !decoded.email || !decoded.role || !decoded.jti) {
      throw ApiError.unauthorized("Invalid access token");
    }

    // Logout denylist — token valid cryptographically but revoked server-side
    const denied = await isAccessTokenDenied(String(decoded.jti));
    if (denied) {
      throw ApiError.unauthorized("Access token has been revoked");
    }

    /** @type {AuthUser} */
    req.user = {
      userId: Number(decoded.sub),
      email: String(decoded.email),
      role: decoded.role,
      vendorCode: decoded.vendorCode ?? null,
      vendorCodeSap: decoded.vendorCodeSap ?? decoded.vendorCode ?? null,
      vendorName: decoded.vendorName ?? null,
      mustChangePassword: decoded.mustChangePassword === true,
      sessionId: String(decoded.sessionId ?? ""),
      jti: String(decoded.jti),
    };

    next();
  } catch (err) {
    if (err instanceof ApiError) {
      throw err;
    }

    if (err instanceof jwt.TokenExpiredError) {
      throw new ApiError(401, "Access token has expired", true);
    }

    if (err instanceof jwt.JsonWebTokenError) {
      throw ApiError.unauthorized("Invalid access token");
    }

    throw err;
  }
});

/**
 * Optional authentication — attaches user when token present, continues otherwise.
 * @type {import('express').RequestHandler}
 */
export const optionalAuthenticate = asyncHandler(async (req, res, next) => {
  if (!req.headers.authorization?.startsWith("Bearer ")) {
    return next();
  }

  return authenticate(req, res, next);
});
