import { checkSlidingRateLimit } from "../config/redis.js";
import { ApiError } from "../utils/ApiError.js";
import { isValidQrApiKey } from "../services/qrService.js";
import { sha256Hex } from "../utils/timingSafe.js";
import { asyncHandler } from "../utils/asyncHandler.js";

const IP_LIMIT = Number(process.env.QR_VERIFY_IP_MAX_PER_MIN) || 10;
const API_KEY_LIMIT = Number(process.env.QR_VERIFY_API_KEY_MAX_PER_MIN) || 100;
const WINDOW_SEC = 60;

/**
 * Rate limits QR verify: 10/min per IP, 100/min per valid API key.
 * Requires X-API-Key header for elevated limits (optional but recommended for company scanners).
 * @type {import('express').RequestHandler}
 */
export const qrVerifyRateLimit = asyncHandler(async (req, _res, next) => {
  const ip = req.ip ?? "unknown";
  const apiKey = req.headers["x-api-key"];

  const ipCheck = await checkSlidingRateLimit("qr-verify-ip", ip, IP_LIMIT, WINDOW_SEC);

  if (!ipCheck.allowed) {
    throw ApiError.tooManyRequests("Too many verification requests from this IP");
  }

  if (apiKey && typeof apiKey === "string") {
    if (!isValidQrApiKey(apiKey)) {
      throw ApiError.unauthorized("Invalid API key");
    }

    const keyId = sha256Hex(apiKey).slice(0, 16);
    const keyCheck = await checkSlidingRateLimit(
      "qr-verify-apikey",
      keyId,
      API_KEY_LIMIT,
      WINDOW_SEC
    );

    if (!keyCheck.allowed) {
      throw ApiError.tooManyRequests("API key rate limit exceeded");
    }

    req.qrApiKey = apiKey;
  }

  next();
});
