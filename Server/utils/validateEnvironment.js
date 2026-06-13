import { logger } from "./logger.js";

/**
 * Fails fast when secrets required for invoice QR generation are missing.
 */
export function validateRequiredSecrets() {
  const encryptionKey =
    process.env.ENCRYPTION_KEY?.trim() || process.env.QR_ENCRYPTION_KEY?.trim();

  if (!encryptionKey) {
    throw new Error(
      "ENCRYPTION_KEY (or QR_ENCRYPTION_KEY) is required for invoice QR/PDF generation. " +
        "Generate one with: node -e \"console.log(require('crypto').randomBytes(32).toString('hex'))\""
    );
  }

  const qrSecret = process.env.QR_SECRET_KEY?.trim();
  if (!qrSecret || qrSecret === "change-me-min-32-characters-for-hmac-signing") {
    logger.warn(
      "QR_SECRET_KEY is unset or still using the example placeholder — QR verification may be insecure"
    );
  }

  if (process.env.NODE_ENV === "production") {
    if (!process.env.JWT_ACCESS_SECRET?.trim() || !process.env.JWT_REFRESH_SECRET?.trim()) {
      throw new Error("JWT_ACCESS_SECRET and JWT_REFRESH_SECRET are required in production");
    }
    if (!process.env.CLIENT_URL?.trim()) {
      throw new Error("CLIENT_URL is required in production (frontend origin for CORS)");
    }
  }
}
