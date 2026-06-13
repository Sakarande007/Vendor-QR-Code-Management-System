import crypto from "node:crypto";
import bcrypt from "bcrypt";

const BCRYPT_ROUNDS = Number(process.env.BCRYPT_ROUNDS) || 12;

/** Password policy: min 8, upper, lower, digit, special */
const PASSWORD_POLICY =
  /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]).{8,}$/;

/**
 * @param {string} password
 * @returns {boolean}
 */
export function meetsPasswordPolicy(password) {
  return PASSWORD_POLICY.test(password);
}

/**
 * @returns {string}
 */
export function getPasswordPolicyMessage() {
  return "Password must be at least 8 characters with uppercase, lowercase, number, and special character";
}

/**
 * Generates a cryptographically secure temporary password meeting policy.
 * @returns {string}
 */
export function generateSecureTempPassword() {
  const upper = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  const lower = "abcdefghjkmnpqrstuvwxyz";
  const digits = "23456789";
  const special = "!@#$%^&*-_+=";
  const all = upper + lower + digits + special;

  const pick = (chars) => chars[crypto.randomInt(0, chars.length)];

  const required = [pick(upper), pick(lower), pick(digits), pick(special)];
  const rest = Array.from({ length: 12 }, () => pick(all));

  const combined = [...required, ...rest];
  for (let i = combined.length - 1; i > 0; i -= 1) {
    const j = crypto.randomInt(0, i + 1);
    [combined[i], combined[j]] = [combined[j], combined[i]];
  }

  return combined.join("");
}

/**
 * @param {string} plainPassword
 * @returns {Promise<string>}
 */
export async function hashPassword(plainPassword) {
  return bcrypt.hash(plainPassword, BCRYPT_ROUNDS);
}

/**
 * Timing-safe password verification via bcrypt (constant-time compare internally).
 * @param {string} plainPassword
 * @param {string} passwordHash
 * @returns {Promise<boolean>}
 */
export async function verifyPassword(plainPassword, passwordHash) {
  if (!plainPassword || !passwordHash) {
    return false;
  }
  return bcrypt.compare(plainPassword, passwordHash);
}
