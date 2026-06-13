import { ApiResponse } from "../utils/ApiResponse.js";

/**
 * Aborts requests that exceed the configured timeout.
 * @param {number} timeoutMs Timeout in milliseconds (default 30s)
 * @returns {import('express').RequestHandler}
 */
export function requestTimeout(timeoutMs = 30_000) {
  return (req, res, next) => {
    const timer = setTimeout(() => {
      if (!res.headersSent) {
        ApiResponse.error(res, "Request timeout", 408);
      }
    }, timeoutMs);

    const cleanup = () => clearTimeout(timer);
    res.on("finish", cleanup);
    res.on("close", cleanup);

    next();
  };
}
