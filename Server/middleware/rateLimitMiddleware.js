import { checkSlidingRateLimit } from "../config/redis.js";
import { ApiError } from "../utils/ApiError.js";
import { asyncHandler } from "../utils/asyncHandler.js";

/**
 * Extracts client IP respecting reverse proxy (requires trust proxy).
 * @param {import('express').Request} req
 * @returns {string}
 */
function getClientIp(req) {
  return req.ip || req.socket.remoteAddress || "unknown";
}

/**
 * Redis-backed sliding-window rate limiter per user or IP.
 * @param {object} options
 * @param {string} options.scope Logical namespace (e.g. 'api', 'login')
 * @param {number} options.maxRequests Maximum requests per window
 * @param {number} options.windowSec Window size in seconds
 * @param {boolean} [options.useUserId=true] Prefer authenticated user ID over IP
 * @returns {import('express').RequestHandler}
 */
export function slidingRateLimit({ scope, maxRequests, windowSec, useUserId = true }) {
  return asyncHandler(async (req, res, next) => {
    const identifier =
      useUserId && req.user?.userId
        ? `user:${req.user.userId}`
        : `ip:${getClientIp(req)}`;

    let result;
    try {
      result = await checkSlidingRateLimit(scope, identifier, maxRequests, windowSec);
    } catch {
      if (process.env.NODE_ENV === "production") {
        throw ApiError.internal("Rate limiting service unavailable");
      }
      return next();
    }

    res.setHeader("X-RateLimit-Limit", String(maxRequests));
    res.setHeader("X-RateLimit-Remaining", String(result.remaining));
    res.setHeader("X-RateLimit-Reset", String(result.resetInSec));

    if (!result.allowed) {
      res.setHeader("Retry-After", String(result.resetInSec));
      throw ApiError.tooManyRequests("Rate limit exceeded. Please try again later.");
    }

    next();
  });
}

const isProd = process.env.NODE_ENV === "production";
const rateLimitDisabled =
  process.env.DISABLE_RATE_LIMIT === "true" ||
  (!isProd && process.env.DISABLE_RATE_LIMIT !== "false");

/**
 * Default per-user/IP API rate limiter (100 req / 15 min in production).
 * Disabled in development by default so local UI polling does not block actions.
 * @type {import('express').RequestHandler}
 */
export const apiSlidingRateLimit = rateLimitDisabled
  ? (_req, _res, next) => next()
  : slidingRateLimit({
      scope: "api",
      maxRequests: Number(process.env.RATE_LIMIT_API_MAX) || (isProd ? 100 : 10_000),
      windowSec: Number(process.env.RATE_LIMIT_API_WINDOW_SEC) || 15 * 60,
    });
