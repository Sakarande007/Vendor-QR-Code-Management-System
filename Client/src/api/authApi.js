import apiClient from "./apiClient.js";
import { unwrapResponse } from "./errors.js";

/**
 * @param {{ identifier: string, password: string }} credentials
 * @returns {Promise<{
 *   mustChangePassword: boolean,
 *   accessToken?: string,
 *   tempToken?: string,
 *   user: object,
 *   message?: string
 * }>}
 */
export async function login(credentials) {
  const response = await apiClient.post("/api/auth/login", credentials, {
    skipAuth: true,
    skipAuthRefresh: true,
  });

  const body = response.data;

  if (body?.must_change_password) {
    return {
      mustChangePassword: true,
      tempToken: body.temp_token,
      user: body.user,
      message: body.message,
    };
  }

  const data = unwrapResponse(response);

  return {
    mustChangePassword: false,
    accessToken: data.accessToken,
    user: data.user,
  };
}

/**
 * First-login forced password change (uses temp_token from login).
 * @param {{ tempToken: string, newPassword: string }} payload
 */
export async function completeForcedPasswordChange(payload) {
  const response = await apiClient.post(
    "/api/auth/change-password",
    {
      temp_token: payload.tempToken,
      newPassword: payload.newPassword,
    },
    { skipAuth: true, skipAuthRefresh: true }
  );
  return unwrapResponse(response);
}

/**
 * @returns {Promise<{ accessToken: string, user?: object }>}
 */
export async function refresh() {
  const response = await apiClient.post(
    "/api/auth/refresh",
    {},
    { skipAuth: true, skipAuthRefresh: true }
  );
  return unwrapResponse(response);
}

export async function logout() {
  const response = await apiClient.post("/api/auth/logout");
  return unwrapResponse(response);
}

/**
 * @param {{ email: string }} payload
 */
export async function forgotPassword(payload) {
  const response = await apiClient.post("/api/auth/forgot-password", payload, {
    skipAuth: true,
    skipAuthRefresh: true,
  });
  return unwrapResponse(response);
}

/**
 * @param {{ email: string, otp: string, newPassword: string }} payload
 */
export async function resetPassword(payload) {
  const response = await apiClient.post("/api/auth/reset-password", payload, {
    skipAuth: true,
    skipAuthRefresh: true,
  });
  return unwrapResponse(response);
}

/**
 * @param {{ currentPassword: string, newPassword: string }} payload
 */
export async function changePassword(payload) {
  const response = await apiClient.post("/api/auth/change-password", payload);
  return unwrapResponse(response);
}

/**
 * @param {{ email: string, vendorCode: string, password?: string }} payload
 */
export async function registerUser(payload) {
  const response = await apiClient.post("/api/auth/register", payload);
  return unwrapResponse(response);
}
