import crypto from "node:crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;

/**
 * Resolves a 32-byte encryption key from environment variables.
 * Accepts 64-char hex or base64-encoded 32-byte keys.
 * @returns {Buffer}
 */
function getEncryptionKey() {
  const raw =
    process.env.ENCRYPTION_KEY ||
    process.env.QR_ENCRYPTION_KEY ||
    "";

  if (!raw) {
    throw new Error("ENCRYPTION_KEY (or QR_ENCRYPTION_KEY) is not configured");
  }

  if (/^[0-9a-fA-F]{64}$/.test(raw)) {
    return Buffer.from(raw, "hex");
  }

  const decoded = Buffer.from(raw, "base64");
  if (decoded.length !== 32) {
    throw new Error("ENCRYPTION_KEY must decode to exactly 32 bytes for AES-256-GCM");
  }

  return decoded;
}

/**
 * Encrypts plaintext using AES-256-GCM.
 * Output format: base64(iv + authTag + ciphertext)
 * @param {string} plaintext
 * @returns {string} Base64-encoded encrypted payload
 */
export function encrypt(plaintext) {
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

  const encrypted = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);

  const authTag = cipher.getAuthTag();
  const payload = Buffer.concat([iv, authTag, encrypted]);

  return payload.toString("base64");
}

/**
 * Decrypts a payload produced by {@link encrypt}.
 * @param {string} encryptedBase64
 * @returns {string} Decrypted UTF-8 string
 */
export function decrypt(encryptedBase64) {
  const key = getEncryptionKey();
  const payload = Buffer.from(encryptedBase64, "base64");

  if (payload.length < IV_LENGTH + AUTH_TAG_LENGTH + 1) {
    throw new Error("Invalid encrypted payload");
  }

  const iv = payload.subarray(0, IV_LENGTH);
  const authTag = payload.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
  const ciphertext = payload.subarray(IV_LENGTH + AUTH_TAG_LENGTH);

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);

  const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);

  return decrypted.toString("utf8");
}

/**
 * Produces a SHA-256 hex hash for integrity checks without storing plaintext.
 * @param {string} data
 * @returns {string}
 */
export function hashData(data) {
  return crypto.createHash("sha256").update(data, "utf8").digest("hex");
}
