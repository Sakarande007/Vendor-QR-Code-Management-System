/**
 * Operational errors are expected failures (validation, auth) safe to expose to clients.
 * Programmer errors indicate bugs and should map to generic 500 responses in production.
 */
export class ApiError extends Error {
  /**
   * @param {number} statusCode HTTP status code
   * @param {string} message Client-safe message
   * @param {boolean} [isOperational=true] When false, treated as internal server error
   * @param {unknown} [errors] Additional error details (e.g. validation fields)
   */
  constructor(statusCode, message, isOperational = true, errors = null) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = isOperational;
    this.errors = errors;
    Error.captureStackTrace(this, this.constructor);
  }

  /**
   * @param {string} message
   * @param {unknown} [errors]
   * @returns {ApiError}
   */
  static badRequest(message = "Bad request", errors = null) {
    return new ApiError(400, message, true, errors);
  }

  /**
   * @param {string} [message]
   * @returns {ApiError}
   */
  static unauthorized(message = "Unauthorized") {
    return new ApiError(401, message, true);
  }

  /**
   * @param {string} [message]
   * @returns {ApiError}
   */
  static forbidden(message = "Forbidden") {
    return new ApiError(403, message, true);
  }

  /**
   * @param {string} [message]
   * @returns {ApiError}
   */
  static notFound(message = "Resource not found") {
    return new ApiError(404, message, true);
  }

  /**
   * @param {string} message
   * @param {unknown} [errors]
   * @returns {ApiError}
   */
  static unprocessable(message = "Validation failed", errors = null) {
    return new ApiError(422, message, true, errors);
  }

  /**
   * @param {string} [message]
   * @returns {ApiError}
   */
  static tooManyRequests(message = "Too many requests") {
    return new ApiError(429, message, true);
  }

  /**
   * @param {string} [message]
   * @returns {ApiError}
   */
  static internal(message = "Internal server error") {
    return new ApiError(500, message, false);
  }
}
