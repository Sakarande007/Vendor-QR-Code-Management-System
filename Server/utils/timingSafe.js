import { timingSafeEqual, createHash } from "node:crypto";

/**
 * Constant-time string comparison (length must match).
 * @param {string} a
 * @param {string} b
 * @returns {boolean}
 */
export function timingSafeCompareStrings(a, b) {
  const bufA = Buffer.from(a, "utf8");
  const bufB = Buffer.from(b, "utf8");

  if (bufA.length !== bufB.length) {
    return false;
  }

  return timingSafeEqual(bufA, bufB);
}

/**
 * SHA-256 hex digest — used for refresh token storage and OTP hashing.
 * @param {string} value
 * @returns {string}
 */
export function sha256Hex(value) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

/**
 * Verifies a plaintext OTP against a stored SHA-256 hex hash using timing-safe compare.
 * @param {string} otp
 * @param {string} storedHash
 * @returns {boolean}
 */
export function verifyOtpHash(otp, storedHash) {
  const candidate = sha256Hex(otp);
  const a = Buffer.from(candidate, "hex");
  const b = Buffer.from(storedHash, "hex");

  if (a.length !== b.length) {
    return false;
  }

  return timingSafeEqual(a, b);
}
