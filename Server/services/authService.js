import crypto from "node:crypto";
import { query } from "../config/db.js";
import {
  checkSlidingRateLimit,
  deletePasswordResetOtp,
  denylistAccessToken,
  getPasswordResetOtpHash,
  setPasswordResetOtp,
} from "../config/redis.js";
import { ApiError } from "../utils/ApiError.js";
import {
  generateSecureTempPassword,
  getPasswordPolicyMessage,
  hashPassword,
  meetsPasswordPolicy,
  verifyPassword,
} from "../utils/password.js";
import { sha256Hex, verifyOtpHash } from "../utils/timingSafe.js";
import { logger } from "../utils/logger.js";
import { queueOtpEmailWithCode, queueWelcomeEmail } from "./emailService.js";
import {
  clearRefreshTokenCookie,
  getJwtRemainingTtlSec,
  getRefreshTokenFromCookie,
  issuePasswordChangeToken,
  issueTokenPair,
  setRefreshTokenCookie,
  verifyAccessToken,
  verifyPasswordChangeToken,
  verifyRefreshToken,
} from "./tokenService.js";

const MAX_LOGIN_ATTEMPTS = Number(process.env.MAX_LOGIN_ATTEMPTS) || 5;
const ACCOUNT_LOCK_MINUTES = Number(process.env.ACCOUNT_LOCK_MINUTES) || 30;
const REFRESH_VERIFY_IP = process.env.REFRESH_VERIFY_IP === "true";
const FORGOT_PASSWORD_MAX = Number(process.env.FORGOT_PASSWORD_MAX_PER_HOUR) || 3;
const FORGOT_PASSWORD_WINDOW_SEC = 3600;

/** Generic message — prevents user enumeration */
const INVALID_CREDENTIALS_MSG = "Invalid vendor code, email, or password";
const FORGOT_PASSWORD_MSG =
  "If an account exists for this email, a reset code has been sent.";

/**
 * @param {object} row
 * @returns {object}
 */
export function sanitizeUser(row) {
  return {
    userId: row.user_id,
    email: row.email,
    vendorCode: row.vendor_code,
    role: row.role,
    status: row.status,
    lastLogin: row.last_login,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * @param {object} params
 * @param {number|null} params.userId
 * @param {string} params.action
 * @param {boolean} params.success
 * @param {string|null} params.ipAddress
 * @param {string|null} params.userAgent
 * @param {string} [params.entityId]
 */
async function logAuthAudit({
  userId,
  action,
  success,
  ipAddress,
  userAgent,
  entityId = "n/a",
}) {
  try {
    await query(
      `INSERT INTO audit_logs
        (user_id, action, entity_type, entity_id, old_values, new_values, ip_address, user_agent)
       VALUES (?, ?, 'auth', ?, NULL, ?, ?, ?)`,
      [
        userId,
        action,
        entityId,
        JSON.stringify({ success }),
        ipAddress,
        userAgent,
      ]
    );
  } catch (err) {
    logger.error("Auth audit log failed", {
      action,
      message: err instanceof Error ? err.message : String(err),
    });
  }
}

/**
 * @param {object} row
 */
export function formatLoginUser(row) {
  return {
    user_id: row.user_id,
    vendor_code: row.vendor_code ?? null,
    vendor_code_sap: row.vendor_code_sap ?? row.vendor_code ?? null,
    vendor_name: row.vendor_name ?? null,
    email: row.email,
    role: row.role,
    must_change_password: Boolean(row.must_change_password),
  };
}

/**
 * @param {string} identifier SAP vendor code or vendor email
 * @returns {Promise<object|null>}
 */
async function findVendorUserByIdentifier(identifier) {
  const trimmed = identifier.trim();
  const normalizedEmail = trimmed.toLowerCase();

  const [rows] = await query(
    `SELECT u.user_id, u.vendor_code, u.email, u.password_hash, u.role, u.status,
            u.failed_login_attempts, u.locked_until, u.last_login, u.created_at, u.updated_at,
            COALESCE(u.must_change_password, 0) AS must_change_password,
            v.vendor_name, v.vendor_code_sap, v.status AS vendor_status
     FROM users u
     INNER JOIN vendors v ON u.vendor_code = v.vendor_code
     WHERE (v.vendor_code_sap = ? OR LOWER(u.email) = ? OR u.vendor_code = ?)
       AND u.role = 'vendor'
       AND u.status = 'active'
       AND v.status = 'active'
     LIMIT 1`,
    [trimmed, normalizedEmail, trimmed]
  );

  return rows[0] ?? null;
}

/**
 * @param {string} identifier Admin login email
 * @returns {Promise<object|null>}
 */
async function findAdminUserByEmail(identifier) {
  const normalizedEmail = identifier.trim().toLowerCase();

  const [rows] = await query(
    `SELECT u.user_id, u.vendor_code, u.email, u.password_hash, u.role, u.status,
            u.failed_login_attempts, u.locked_until, u.last_login, u.created_at, u.updated_at,
            COALESCE(u.must_change_password, 0) AS must_change_password
     FROM users u
     WHERE LOWER(u.email) = ?
       AND u.role IN ('admin', 'superadmin')
       AND u.status = 'active'
     LIMIT 1`,
    [normalizedEmail]
  );

  return rows[0] ?? null;
}

/**
 * @param {string} identifier
 * @returns {Promise<object|null>}
 */
async function findUserByIdentifier(identifier) {
  const vendorUser = await findVendorUserByIdentifier(identifier);
  if (vendorUser) {
    return vendorUser;
  }

  return findAdminUserByEmail(identifier);
}

/**
 * @param {object} user
 * @returns {boolean}
 */
function isAccountLocked(user) {
  if (user.failed_login_attempts < MAX_LOGIN_ATTEMPTS) {
    return false;
  }

  if (!user.locked_until) {
    return user.failed_login_attempts >= MAX_LOGIN_ATTEMPTS;
  }

  return new Date(user.locked_until) > new Date();
}

/**
 * @param {number} userId
 */
async function recordFailedLogin(userId) {
  await query(
    `UPDATE users
     SET failed_login_attempts = failed_login_attempts + 1,
         locked_until = CASE
           WHEN failed_login_attempts + 1 >= ? THEN DATE_ADD(NOW(3), INTERVAL ? MINUTE)
           ELSE locked_until
         END
     WHERE user_id = ?`,
    [MAX_LOGIN_ATTEMPTS, ACCOUNT_LOCK_MINUTES, userId]
  );
}

/**
 * @param {number} userId
 */
async function resetLoginSuccess(userId) {
  await query(
    `UPDATE users
     SET failed_login_attempts = 0,
         locked_until = NULL,
         last_login = NOW(3)
     WHERE user_id = ?`,
    [userId]
  );
}

/**
 * @param {import('express').Request} req
 * @returns {string}
 */
export function getClientIp(req) {
  return req.ip || req.socket.remoteAddress || "unknown";
}

/**
 * Admin-only vendor user registration.
 * @param {object} input
 * @param {string} input.email
 * @param {string} input.vendorCode
 * @param {string} [input.password]
 */
export async function registerVendorUser({ email, vendorCode, password }) {
  const [vendors] = await query(
    `SELECT vendor_code, status FROM vendors WHERE vendor_code = ? LIMIT 1`,
    [vendorCode]
  );

  if (!vendors.length) {
    throw ApiError.badRequest("Vendor code does not exist");
  }

  if (vendors[0].status !== "active") {
    throw ApiError.badRequest("Vendor is not active");
  }

  const [existing] = await query(
    `SELECT user_id FROM users WHERE LOWER(email) = ? LIMIT 1`,
    [email.toLowerCase()]
  );

  if (existing.length) {
    throw ApiError.badRequest("Email is already registered");
  }

  const plainPassword = password || generateSecureTempPassword();

  if (password && !meetsPasswordPolicy(password)) {
    throw ApiError.unprocessable(getPasswordPolicyMessage());
  }

  const passwordHash = await hashPassword(plainPassword);

  const [result] = await query(
    `INSERT INTO users (vendor_code, email, password_hash, role, status)
     VALUES (?, ?, ?, 'vendor', 'active')`,
    [vendorCode, email.toLowerCase(), passwordHash]
  );

  queueWelcomeEmail(email, vendorCode, plainPassword);

  const [rows] = await query(
    `SELECT user_id, vendor_code, email, role, status, last_login, created_at, updated_at
     FROM users WHERE user_id = ?`,
    [result.insertId]
  );

  return sanitizeUser(rows[0]);
}

/**
 * @param {import('express').Request} req
 * @param {{ identifier: string, password: string }} credentials
 */
export async function loginUser(req, { identifier, password }) {
  const ipAddress = getClientIp(req);
  const userAgent = req.get("user-agent") || null;

  const user = await findUserByIdentifier(identifier);

  if (!user || user.status !== "active") {
    await logAuthAudit({
      userId: null,
      action: "AUTH_LOGIN_FAILED",
      success: false,
      ipAddress,
      userAgent,
      entityId: identifier.slice(0, 50),
    });
    throw ApiError.unauthorized(INVALID_CREDENTIALS_MSG);
  }

  if (isAccountLocked(user)) {
    await logAuthAudit({
      userId: user.user_id,
      action: "AUTH_LOGIN_LOCKED",
      success: false,
      ipAddress,
      userAgent,
    });
    throw ApiError.unauthorized(
      "Account is temporarily locked. Try again later."
    );
  }

  const passwordValid = await verifyPassword(password, user.password_hash);

  if (!passwordValid) {
    await recordFailedLogin(user.user_id);
    await logAuthAudit({
      userId: user.user_id,
      action: "AUTH_LOGIN_FAILED",
      success: false,
      ipAddress,
      userAgent,
    });
    throw ApiError.unauthorized(INVALID_CREDENTIALS_MSG);
  }

  await resetLoginSuccess(user.user_id);

  const loginUser = formatLoginUser(user);

  if (Number(user.must_change_password) === 1 && user.role === "vendor") {
    const tempToken = issuePasswordChangeToken({
      userId: user.user_id,
      email: user.email,
      role: user.role,
      vendorCode: user.vendor_code,
      vendorCodeSap: user.vendor_code_sap ?? user.vendor_code,
      vendorName: user.vendor_name ?? null,
    });

    await logAuthAudit({
      userId: user.user_id,
      action: "AUTH_LOGIN_PASSWORD_CHANGE_REQUIRED",
      success: true,
      ipAddress,
      userAgent,
    });

    return {
      mustChangePassword: true,
      tempToken,
      user: { ...loginUser, must_change_password: true },
      message: "You must change your password before continuing",
    };
  }

  const tokenUser = {
    userId: user.user_id,
    email: user.email,
    role: user.role,
    vendorCode: user.vendor_code,
    vendorCodeSap: user.vendor_code_sap ?? user.vendor_code ?? null,
    vendorName: user.vendor_name ?? null,
  };

  const { accessToken, refreshToken } = await issueTokenPair(
    tokenUser,
    ipAddress,
    userAgent
  );

  await logAuthAudit({
    userId: user.user_id,
    action: "AUTH_LOGIN_SUCCESS",
    success: true,
    ipAddress,
    userAgent,
  });

  return {
    mustChangePassword: false,
    accessToken,
    refreshToken,
    user: loginUser,
  };
}

/**
 * Rotates refresh token and issues new access token.
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 */
export async function refreshSession(req, res) {
  const refreshToken = getRefreshTokenFromCookie(req);

  if (!refreshToken) {
    throw ApiError.unauthorized("Refresh token is required");
  }

  let decoded;
  try {
    decoded = verifyRefreshToken(refreshToken);
  } catch {
    clearRefreshTokenCookie(res);
    throw ApiError.unauthorized("Invalid or expired refresh token");
  }

  const tokenHash = sha256Hex(refreshToken);
  const ipAddress = getClientIp(req);
  const userAgent = req.get("user-agent") || null;

  const [tokens] = await query(
    `SELECT rt.id, rt.user_id, rt.ip_address, rt.expires_at
     FROM refresh_tokens rt
     WHERE rt.token_hash = ? AND rt.expires_at > NOW(3)
     LIMIT 1`,
    [tokenHash]
  );

  if (!tokens.length) {
    clearRefreshTokenCookie(res);
    throw ApiError.unauthorized("Invalid or expired refresh token");
  }

  const stored = tokens[0];

  if (REFRESH_VERIFY_IP && stored.ip_address && stored.ip_address !== ipAddress) {
    await query(`DELETE FROM refresh_tokens WHERE id = ?`, [stored.id]);
    clearRefreshTokenCookie(res);
    throw ApiError.unauthorized("Refresh token cannot be used from this device");
  }

  const [users] = await query(
    `SELECT user_id, vendor_code, email, role, status, last_login, created_at, updated_at,
            COALESCE(must_change_password, 0) AS must_change_password
     FROM users WHERE user_id = ? AND status = 'active' LIMIT 1`,
    [stored.user_id]
  );

  if (!users.length) {
    await query(`DELETE FROM refresh_tokens WHERE id = ?`, [stored.id]);
    clearRefreshTokenCookie(res);
    throw ApiError.unauthorized("User account is not active");
  }

  const user = users[0];

  if (Number(user.must_change_password) === 1) {
    await query(`DELETE FROM refresh_tokens WHERE id = ?`, [stored.id]);
    clearRefreshTokenCookie(res);
    throw ApiError.forbidden(
      "Password change required. Please log in and update your password."
    );
  }

  let vendorCodeSap = null;
  let vendorName = null;

  if (user.role === "vendor" && user.vendor_code) {
    const [vendors] = await query(
      `SELECT vendor_code_sap, vendor_name FROM vendors WHERE vendor_code = ? LIMIT 1`,
      [user.vendor_code]
    );
    if (vendors.length) {
      vendorCodeSap = vendors[0].vendor_code_sap ?? user.vendor_code;
      vendorName = vendors[0].vendor_name;
    }
  }

  await query(`DELETE FROM refresh_tokens WHERE id = ?`, [stored.id]);

  const tokenUser = {
    userId: user.user_id,
    email: user.email,
    role: user.role,
    vendorCode: user.vendor_code,
    vendorCodeSap,
    vendorName,
  };

  const sessionId = decoded.sessionId || crypto.randomUUID();
  const { accessToken, refreshToken: newRefreshToken } = await issueTokenPair(
    tokenUser,
    ipAddress,
    userAgent,
    sessionId
  );

  setRefreshTokenCookie(res, newRefreshToken);

  const loginUser = formatLoginUser({
    user_id: user.user_id,
    vendor_code: user.vendor_code,
    vendor_code_sap: vendorCodeSap,
    vendor_name: vendorName,
    email: user.email,
    role: user.role,
    must_change_password: user.must_change_password,
  });

  return { accessToken, user: loginUser };
}

/**
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 */
export async function logoutUser(req, res) {
  const refreshToken = getRefreshTokenFromCookie(req);
  const ipAddress = getClientIp(req);
  const userAgent = req.get("user-agent") || null;

  if (refreshToken) {
    const tokenHash = sha256Hex(refreshToken);
    await query(`DELETE FROM refresh_tokens WHERE token_hash = ?`, [tokenHash]);
  }

  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith("Bearer ")) {
    const accessToken = authHeader.slice(7).trim();
    try {
      const decoded = verifyAccessToken(accessToken);
      if (decoded.jti) {
        const ttl = getJwtRemainingTtlSec(decoded);
        await denylistAccessToken(String(decoded.jti), ttl);
      }
    } catch {
      // Token already invalid — no denylist needed
    }
  }

  clearRefreshTokenCookie(res);

  if (req.user?.userId) {
    await logAuthAudit({
      userId: req.user.userId,
      action: "AUTH_LOGOUT",
      success: true,
      ipAddress,
      userAgent,
    });
  }
}

/**
 * @param {string} email
 */
export async function requestPasswordReset(email) {
  const rate = await checkSlidingRateLimit(
    "forgot-password",
    email.toLowerCase(),
    FORGOT_PASSWORD_MAX,
    FORGOT_PASSWORD_WINDOW_SEC
  );

  if (!rate.allowed) {
    throw ApiError.tooManyRequests(
      "Too many reset requests. Please try again later."
    );
  }

  const [users] = await query(
    `SELECT user_id, email, status FROM users WHERE LOWER(email) = ? LIMIT 1`,
    [email.toLowerCase()]
  );

  if (users.length && users[0].status === "active") {
    const otp = String(crypto.randomInt(100_000, 1_000_000));
    const otpHash = sha256Hex(otp);
    await setPasswordResetOtp(email, otpHash);
    queueOtpEmailWithCode(email, otp);
  }

  return { message: FORGOT_PASSWORD_MSG };
}

/**
 * @param {{ email: string, otp: string, newPassword: string }} input
 */
export async function resetPasswordWithOtp({ email, otp, newPassword }) {
  if (!meetsPasswordPolicy(newPassword)) {
    throw ApiError.unprocessable(getPasswordPolicyMessage());
  }

  const storedHash = await getPasswordResetOtpHash(email);

  if (!storedHash || !verifyOtpHash(otp, storedHash)) {
    throw ApiError.badRequest("Invalid or expired reset code");
  }

  const [users] = await query(
    `SELECT user_id FROM users WHERE LOWER(email) = ? AND status = 'active' LIMIT 1`,
    [email.toLowerCase()]
  );

  if (!users.length) {
    throw ApiError.badRequest("Invalid or expired reset code");
  }

  const userId = users[0].user_id;
  const passwordHash = await hashPassword(newPassword);

  await query(
    `UPDATE users SET password_hash = ?, failed_login_attempts = 0, locked_until = NULL WHERE user_id = ?`,
    [passwordHash, userId]
  );

  await query(`DELETE FROM refresh_tokens WHERE user_id = ?`, [userId]);
  await deletePasswordResetOtp(email);

  return { message: "Password has been reset successfully" };
}

/**
 * @param {import('express').Request} req
 * @param {{ currentPassword: string, newPassword: string }} input
 */
export async function changeUserPassword(req, { currentPassword, newPassword }) {
  if (!meetsPasswordPolicy(newPassword)) {
    throw ApiError.unprocessable(getPasswordPolicyMessage());
  }

  const userId = req.user.userId;

  const [users] = await query(
    `SELECT password_hash FROM users WHERE user_id = ? AND status = 'active' LIMIT 1`,
    [userId]
  );

  if (!users.length) {
    throw ApiError.unauthorized("User not found");
  }

  const valid = await verifyPassword(currentPassword, users[0].password_hash);

  if (!valid) {
    throw ApiError.unauthorized("Current password is incorrect");
  }

  const passwordHash = await hashPassword(newPassword);
  await query(`UPDATE users SET password_hash = ? WHERE user_id = ?`, [
    passwordHash,
    userId,
  ]);

  const currentRefresh = getRefreshTokenFromCookie(req);
  const currentHash = currentRefresh ? sha256Hex(currentRefresh) : null;

  if (currentHash) {
    await query(
      `DELETE FROM refresh_tokens WHERE user_id = ? AND token_hash != ?`,
      [userId, currentHash]
    );
  } else {
    await query(`DELETE FROM refresh_tokens WHERE user_id = ?`, [userId]);
  }

  await logAuthAudit({
    userId,
    action: "AUTH_PASSWORD_CHANGED",
    success: true,
    ipAddress: getClientIp(req),
    userAgent: req.get("user-agent") || null,
  });

  return { message: "Password changed successfully" };
}

/**
 * First-login forced password change using short-lived temp_token.
 * @param {import('express').Request} req
 * @param {{ tempToken: string, newPassword: string }} input
 */
export async function completeForcedPasswordChange(req, { tempToken, newPassword }) {
  if (!meetsPasswordPolicy(newPassword)) {
    throw ApiError.unprocessable(getPasswordPolicyMessage());
  }

  let decoded;
  try {
    decoded = verifyPasswordChangeToken(tempToken);
  } catch {
    throw ApiError.unauthorized("Invalid or expired temporary token");
  }

  const userId = Number(decoded.sub);

  const [users] = await query(
    `SELECT u.user_id, u.vendor_code, u.email, u.password_hash, u.role, u.status,
            COALESCE(u.must_change_password, 0) AS must_change_password,
            v.vendor_name, v.vendor_code_sap
     FROM users u
     LEFT JOIN vendors v ON v.vendor_code = u.vendor_code
     WHERE u.user_id = ? AND u.status = 'active' AND u.role = 'vendor'
     LIMIT 1`,
    [userId]
  );

  if (!users.length || Number(users[0].must_change_password) !== 1) {
    throw ApiError.unauthorized("Invalid or expired temporary token");
  }

  const user = users[0];

  const isSameAsTemp = await verifyPassword(newPassword, user.password_hash);
  if (isSameAsTemp) {
    throw ApiError.badRequest(
      "New password must be different from your temporary password"
    );
  }

  const passwordHash = await hashPassword(newPassword);
  const ipAddress = getClientIp(req);
  const userAgent = req.get("user-agent") || null;

  await query(
    `UPDATE users
     SET password_hash = ?, must_change_password = 0, password_changed_at = NOW(3),
         failed_login_attempts = 0, locked_until = NULL, last_login = NOW(3)
     WHERE user_id = ?`,
    [passwordHash, userId]
  );

  await query(
    `UPDATE vendors SET first_login = 0 WHERE vendor_code = ?`,
    [user.vendor_code]
  );

  const tokenUser = {
    userId: user.user_id,
    email: user.email,
    role: user.role,
    vendorCode: user.vendor_code,
    vendorCodeSap: user.vendor_code_sap ?? user.vendor_code,
    vendorName: user.vendor_name ?? null,
  };

  const { accessToken, refreshToken } = await issueTokenPair(
    tokenUser,
    ipAddress,
    userAgent
  );

  await logAuthAudit({
    userId,
    action: "AUTH_PASSWORD_CHANGED",
    success: true,
    ipAddress,
    userAgent,
    entityId: "first_login",
  });

  return {
    accessToken,
    refreshToken,
    user: formatLoginUser({
      ...user,
      must_change_password: 0,
    }),
  };
}
