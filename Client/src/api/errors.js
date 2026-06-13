/**
 * Normalizes API errors into user-friendly messages.
 * @param {unknown} error
 * @returns {{ message: string, errors: unknown, status: number|null, isNetworkError: boolean }}
 */
export function parseApiError(error) {
  if (error?.isApiError) {
    return {
      message: error.message,
      errors: error.errors ?? null,
      status: error.status ?? null,
      isNetworkError: false,
    };
  }

  if (error?.code === "ECONNABORTED") {
    return {
      message: "Request timed out. Please try again.",
      errors: null,
      status: null,
      isNetworkError: true,
    };
  }

  if (!error?.response) {
    return {
      message: "Unable to reach the server. Check your connection.",
      errors: null,
      status: null,
      isNetworkError: true,
    };
  }

  const { status, data } = error.response;
  const message =
    data?.message ||
    (status === 401
      ? "Your session has expired. Please sign in again."
      : status === 403
        ? "You do not have permission to perform this action."
        : status === 404
          ? "The requested resource was not found."
          : status === 422
            ? "Please check your input and try again."
            : status === 429
              ? "Too many requests. Please wait a moment and try again."
              : status >= 500
                ? "Something went wrong on our end. Please try again later."
                : "An unexpected error occurred.");

  if (import.meta.env.DEV) {
    console.error("[API Error]", { status, data, error });
  }

  return {
    message,
    errors: data?.errors ?? null,
    status,
    isNetworkError: false,
  };
}

/**
 * @param {string} message
 * @param {unknown} [errors]
 * @param {number} [status]
 */
export class ApiClientError extends Error {
  constructor(message, errors = null, status = null) {
    super(message);
    this.name = "ApiClientError";
    this.isApiError = true;
    this.errors = errors;
    this.status = status;
  }
}

/**
 * @param {import('axios').AxiosResponse} response
 */
export function unwrapResponse(response) {
  const body = response.data;

  if (body && body.success === false) {
    throw new ApiClientError(body.message || "Request failed", body.errors, response.status);
  }

  return body?.data !== undefined ? body.data : body;
}
