import axios from "axios";
import { tokenStore } from "./tokenStore.js";
import { parseApiError } from "./errors.js";
import { getApiBaseUrl } from "./apiBaseUrl.js";

const isDev = import.meta.env.DEV;

export const apiClient = axios.create({
  baseURL: getApiBaseUrl(),
  timeout: 30_000,
  withCredentials: true,
  headers: {
    "Content-Type": "application/json",
  },
});

let isRefreshing = false;
/** @type {Array<{ resolve: (token: string) => void, reject: (err: unknown) => void }>} */
let refreshSubscribers = [];

/**
 * @param {(token: string) => void} resolve
 * @param {(err: unknown) => void} reject
 */
function subscribeTokenRefresh(resolve, reject) {
  refreshSubscribers.push({ resolve, reject });
}

/**
 * @param {string} token
 */
function onTokenRefreshed(token) {
  refreshSubscribers.forEach(({ resolve }) => resolve(token));
  refreshSubscribers = [];
}

/**
 * @param {unknown} err
 */
function onRefreshFailed(err) {
  refreshSubscribers.forEach(({ reject }) => reject(err));
  refreshSubscribers = [];
}

/**
 * @param {import('axios').InternalAxiosRequestConfig} config
 */
function generateRequestId(config) {
  config.headers["X-Request-Id"] =
    typeof crypto !== "undefined" && crypto.randomUUID
      ? crypto.randomUUID()
      : `req-${Date.now()}`;
}

apiClient.interceptors.request.use(
  (config) => {
    generateRequestId(config);

    if (!config.skipAuth) {
      const token = tokenStore.getToken();
      if (token) {
        config.headers.Authorization = `Bearer ${token}`;
      }
    }

    if (isDev) {
      console.debug(`[API] ${config.method?.toUpperCase()} ${config.url}`, {
        params: config.params,
        requestId: config.headers["X-Request-Id"],
      });
    }

    return config;
  },
  (error) => Promise.reject(error)
);

apiClient.interceptors.response.use(
  (response) => {
    if (isDev) {
      console.debug(
        `[API] ${response.status} ${response.config.method?.toUpperCase()} ${response.config.url}`,
        { requestId: response.headers["x-request-id"] }
      );
    }
    return response;
  },
  async (error) => {
    const originalRequest = error.config;

    const isAuthEndpoint =
      originalRequest?.url?.includes("/auth/login") ||
      originalRequest?.url?.includes("/auth/refresh") ||
      originalRequest?.url?.includes("/auth/forgot-password") ||
      originalRequest?.url?.includes("/auth/reset-password");

    if (
      error.response?.status === 401 &&
      originalRequest &&
      !originalRequest._retry &&
      !originalRequest.skipAuthRefresh &&
      !isAuthEndpoint
    ) {
      if (isRefreshing) {
        return new Promise((resolve, reject) => {
          subscribeTokenRefresh(
            (token) => {
              originalRequest.headers.Authorization = `Bearer ${token}`;
              resolve(apiClient(originalRequest));
            },
            reject
          );
        });
      }

      originalRequest._retry = true;
      isRefreshing = true;

      try {
        const refreshResponse = await apiClient.post(
          "/api/auth/refresh",
          {},
          { skipAuth: true, skipAuthRefresh: true }
        );

        const newToken = refreshResponse.data?.data?.accessToken;

        if (!newToken) {
          throw new Error("No access token in refresh response");
        }

        tokenStore.setToken(newToken);
        onTokenRefreshed(newToken);

        originalRequest.headers.Authorization = `Bearer ${newToken}`;
        return apiClient(originalRequest);
      } catch (refreshError) {
        onRefreshFailed(refreshError);
        tokenStore.clearToken();
        try {
          localStorage.removeItem("vqr_session");
        } catch {
          /* ignore */
        }
        sessionStorage.removeItem("vqr_session");

        if (
          typeof window !== "undefined" &&
          !window.location.pathname.startsWith("/login") &&
          !window.location.pathname.includes("/print")
        ) {
          window.location.href = "/login";
        }

        return Promise.reject(refreshError);
      } finally {
        isRefreshing = false;
      }
    }

    const parsed = parseApiError(error);
    error.userMessage = parsed.message;
    error.parsedError = parsed;

    return Promise.reject(error);
  }
);

export default apiClient;
