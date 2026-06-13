import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { logger } from "../utils/logger.js";

/**
 * 404 handler for unmatched routes.
 * @type {import('express').RequestHandler}
 */
export function notFoundHandler(req, res) {
  return ApiResponse.error(
    res,
    `Route ${req.method} ${req.originalUrl} not found`,
    404
  );
}

/**
 * Centralized error handler — operational vs programmer errors.
 * @type {import('express').ErrorRequestHandler}
 */
export function errorHandler(err, req, res, _next) {
  const requestId = res.locals.requestId ?? req.id ?? null;
  const isProd = process.env.NODE_ENV === "production";

  let statusCode = 500;
  let message = "Internal server error";
  let errors = null;
  let isOperational = false;

  if (err instanceof ApiError) {
    statusCode = err.statusCode;
    message = err.message;
    errors = err.errors;
    isOperational = err.isOperational;
  } else if (err?.name === "UnauthorizedError") {
    statusCode = 401;
    message = "Unauthorized";
    isOperational = true;
  } else if (err?.type === "entity.parse.failed" || err instanceof SyntaxError) {
    statusCode = 400;
    message = "Invalid JSON payload";
    isOperational = true;
  } else if (err?.code === "LIMIT_FILE_SIZE" || err?.type === "entity.too.large") {
    statusCode = err?.code === "LIMIT_FILE_SIZE" ? 400 : 413;
    message =
      err?.code === "LIMIT_FILE_SIZE"
        ? "File exceeds maximum allowed size"
        : "Request body too large";
    isOperational = true;
  } else if (err?.code === "LIMIT_UNEXPECTED_FILE") {
    statusCode = 400;
    message = "Unexpected file upload field";
    isOperational = true;
  }

  if (!isOperational || statusCode >= 500) {
    logger.error("Unhandled error", {
      requestId,
      statusCode,
      message: err?.message,
      stack: isProd ? undefined : err?.stack,
    });
    if (isProd) {
      message = "Internal server error";
      errors = null;
    }
  } else {
    logger.warn("Operational error", {
      requestId,
      statusCode,
      message: err?.message ?? message,
    });
  }

  return ApiResponse.error(res, message, statusCode, errors);
}
