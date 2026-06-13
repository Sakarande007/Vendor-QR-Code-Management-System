import { randomUUID } from "node:crypto";
import jwt from "jsonwebtoken";
import { sha256Hex } from "../utils/timingSafe.js";
import { query } from "../config/db.js";
import { ApiError } from "../utils/ApiError.js";

const ACCESS_SECRET = () => process.env.JWT_ACCESS_SECRET;
const REFRESH_SECRET = () => process.env.JWT_REFRESH_SECRET;
const ISSUER = () => process.env.JWT_ISSUER || "vendor-qr-api";
const AUDIENCE = () => process.env.JWT_AUDIENCE || "vendor-qr-client";
const ACCESS_EXPIRES = () => process.env.JWT_ACCESS_EXPIRES_IN || "15m";
const REFRESH_EXPIRES = () => process.env.JWT_REFRESH_EXPIRES_IN || "2d";

const REFRESH_COOKIE = "refresh_token";

/**
 * Refresh-token cookie options (supports cross-subdomain: app + api).
 * @returns {import('express').CookieOptions}
 */
function getRefreshCookieOptions() {
  const isProd = process.env.NODE_ENV === "production";
  const sameSite = process.env.COOKIE_SAME_SITE || (isProd ? "none" : "lax");
  const secure =
    process.env.COOKIE_SECURE === "true" ||
    isProd ||
    sameSite === "none";

  const maxAgeMs = parseRefreshExpiryMs(REFRESH_EXPIRES());

  const options = {
    httpOnly: true,
    secure,
    sameSite,
    path: "/",
    maxAge: maxAgeMs,
  };

  if (process.env.COOKIE_DOMAIN?.trim()) {
    options.domain = process.env.COOKIE_DOMAIN.trim();
  }

  return options;
}

/**
 * @param {import('express').Response} res
 * @param {string} refreshToken
 */
export function setRefreshTokenCookie(res, refreshToken) {
  res.cookie(REFRESH_COOKIE, refreshToken, getRefreshCookieOptions());
}

/**
 * @param {import('express').Response} res
 */
export function clearRefreshTokenCookie(res) {
  res.clearCookie(REFRESH_COOKIE, getRefreshCookieOptions());
}

/**
 * @param {import('express').Request} req
 * @returns {string|undefined}
 */
export function getRefreshTokenFromCookie(req) {
  return req.cookies?.[REFRESH_COOKIE];
}

/**
 * @typedef {object} TokenUser
 * @property {number} userId
 * @property {string} email
 * @property {'vendor'|'admin'|'superadmin'} role
 * @property {string|null} [vendorCode]
 * @property {string|null} [vendorCodeSap]
 * @property {string|null} [vendorName]
 */

const PASSWORD_CHANGE_EXPIRES = "15m";

/**
 * Issues access + refresh JWT pair; persists refresh hash in DB.
 * @param {TokenUser} user
 * @param {string} ipAddress
 * @param {string|null} userAgent
 * @param {string} [sessionId]
 * @returns {Promise<{ accessToken: string, refreshToken: string, sessionId: string, accessJti: string }>}
 */
export async function issueTokenPair(user, ipAddress, userAgent, sessionId = randomUUID()) {
  if (!ACCESS_SECRET() || !REFRESH_SECRET()) {
    throw ApiError.internal("Authentication is not configured");
  }

  const accessJti = randomUUID();
  const refreshJti = randomUUID();

  const accessToken = jwt.sign(
    {
      sub: String(user.userId),
      email: user.email,
      role: user.role,
      vendorCode: user.vendorCode ?? null,
      vendorCodeSap: user.vendorCodeSap ?? user.vendorCode ?? null,
      vendorName: user.vendorName ?? null,
      mustChangePassword: false,
      sessionId,
      jti: accessJti,
    },
    ACCESS_SECRET(),
    {
      expiresIn: ACCESS_EXPIRES(),
      algorithm: "HS256",
      issuer: ISSUER(),
      audience: AUDIENCE(),
    }
  );

  const refreshToken = jwt.sign(
    {
      sub: String(user.userId),
      sessionId,
      jti: refreshJti,
    },
    REFRESH_SECRET(),
    {
      expiresIn: REFRESH_EXPIRES(),
      algorithm: "HS256",
      issuer: ISSUER(),
      audience: AUDIENCE(),
    }
  );

  const tokenHash = sha256Hex(refreshToken);
  const expiresAt = new Date(
    Date.now() + parseRefreshExpiryMs(REFRESH_EXPIRES())
  );

  await query(
    `INSERT INTO refresh_tokens (user_id, token_hash, expires_at, ip_address, user_agent)
     VALUES (?, ?, ?, ?, ?)`,
    [user.userId, tokenHash, expiresAt, ipAddress, userAgent]
  );

  return { accessToken, refreshToken, sessionId, accessJti };
}

/**
 * @param {string} refreshToken
 * @returns {number}
 */
export function parseRefreshExpiryMs(expiresIn) {
  const match = /^(\d+)([smhd])$/.exec(expiresIn);
  if (!match) {
    return 2 * 24 * 60 * 60 * 1000;
  }
  const value = Number(match[1]);
  const unit = match[2];
  const multipliers = { s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000 };
  return value * (multipliers[unit] ?? 86_400_000);
}

/**
 * @param {string} refreshToken
 * @returns {import('jsonwebtoken').JwtPayload}
 */
export function verifyRefreshToken(refreshToken) {
  return jwt.verify(refreshToken, REFRESH_SECRET(), {
    algorithms: ["HS256"],
    issuer: ISSUER(),
    audience: AUDIENCE(),
  });
}

/**
 * Short-lived token for mandatory first-time password change (no refresh token).
 * @param {TokenUser} user
 * @returns {string}
 */
export function issuePasswordChangeToken(user) {
  if (!ACCESS_SECRET()) {
    throw ApiError.internal("Authentication is not configured");
  }

  return jwt.sign(
    {
      sub: String(user.userId),
      email: user.email,
      role: user.role,
      vendorCode: user.vendorCode ?? null,
      vendorCodeSap: user.vendorCodeSap ?? user.vendorCode ?? null,
      vendorName: user.vendorName ?? null,
      mustChangePassword: true,
      purpose: "password_change",
      jti: randomUUID(),
    },
    ACCESS_SECRET(),
    {
      expiresIn: PASSWORD_CHANGE_EXPIRES,
      algorithm: "HS256",
      issuer: ISSUER(),
      audience: AUDIENCE(),
    }
  );
}

/**
 * @param {string} token
 * @returns {import('jsonwebtoken').JwtPayload}
 */
export function verifyPasswordChangeToken(token) {
  const decoded = verifyAccessToken(token);

  if (!decoded.mustChangePassword || decoded.purpose !== "password_change") {
    throw ApiError.unauthorized("Invalid password change token");
  }

  return decoded;
}

/**
 * @param {string} accessToken
 * @returns {import('jsonwebtoken').JwtPayload}
 */
export function verifyAccessToken(accessToken) {
  return jwt.verify(accessToken, ACCESS_SECRET(), {
    algorithms: ["HS256"],
    issuer: ISSUER(),
    audience: AUDIENCE(),
  });
}

/**
 * Computes remaining TTL in seconds for a JWT (for Redis denylist).
 * @param {import('jsonwebtoken').JwtPayload} decoded
 * @returns {number}
 */
export function getJwtRemainingTtlSec(decoded) {
  if (!decoded.exp) {
    return 900;
  }
  return Math.max(1, decoded.exp - Math.floor(Date.now() / 1000));
}

export { REFRESH_COOKIE };
