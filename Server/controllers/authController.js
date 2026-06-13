import * as authService from "../services/authService.js";
import {
  clearRefreshTokenCookie,
  setRefreshTokenCookie,
} from "../services/tokenService.js";
import { ApiResponse } from "../utils/ApiResponse.js";

/**
 * POST /api/auth/register — Admin creates a vendor user.
 * @type {import('express').RequestHandler}
 */
export async function register(req, res) {
  const user = await authService.registerVendorUser({
    email: req.body.email,
    vendorCode: req.body.vendorCode,
    password: req.body.password,
  });

  return ApiResponse.success(
    res,
    { user },
    "Vendor user created successfully. Welcome email queued.",
    201
  );
}

/**
 * POST /api/auth/login — vendor_code_sap, vendor email, or admin email + password.
 * @type {import('express').RequestHandler}
 */
export async function login(req, res) {
  const result = await authService.loginUser(req, {
    identifier: req.body.identifier,
    password: req.body.password,
  });

  if (result.mustChangePassword) {
    return res.status(200).json({
      success: true,
      must_change_password: true,
      message: result.message,
      temp_token: result.tempToken,
      user: result.user,
      requestId: res.locals.requestId ?? null,
      timestamp: new Date().toISOString(),
    });
  }

  setRefreshTokenCookie(res, result.refreshToken);

  return ApiResponse.success(res, {
    accessToken: result.accessToken,
    user: result.user,
  });
}

/**
 * POST /api/auth/refresh
 * @type {import('express').RequestHandler}
 */
export async function refreshToken(req, res) {
  const { accessToken, user } = await authService.refreshSession(req, res);

  return ApiResponse.success(res, { accessToken, user });
}

/**
 * POST /api/auth/logout
 * @type {import('express').RequestHandler}
 */
export async function logout(req, res) {
  await authService.logoutUser(req, res);

  return ApiResponse.success(res, null, "Logged out successfully");
}

/**
 * POST /api/auth/forgot-password
 * @type {import('express').RequestHandler}
 */
export async function forgotPassword(req, res) {
  const result = await authService.requestPasswordReset(req.body.email);

  return ApiResponse.success(res, null, result.message);
}

/**
 * POST /api/auth/reset-password
 * @type {import('express').RequestHandler}
 */
export async function resetPassword(req, res) {
  const result = await authService.resetPasswordWithOtp({
    email: req.body.email,
    otp: req.body.otp,
    newPassword: req.body.newPassword,
  });

  return ApiResponse.success(res, null, result.message);
}

/**
 * POST /api/auth/change-password — normal change (Bearer) or first-login (temp_token).
 * @type {import('express').RequestHandler}
 */
export async function changePassword(req, res) {
  if (req.body.temp_token) {
    const result = await authService.completeForcedPasswordChange(req, {
      tempToken: req.body.temp_token,
      newPassword: req.body.newPassword,
    });

    setRefreshTokenCookie(res, result.refreshToken);

    return ApiResponse.success(
      res,
      {
        accessToken: result.accessToken,
        user: result.user,
      },
      "Password changed successfully. You are now logged in."
    );
  }

  const result = await authService.changeUserPassword(req, {
    currentPassword: req.body.currentPassword,
    newPassword: req.body.newPassword,
  });

  return ApiResponse.success(res, null, result.message);
}
