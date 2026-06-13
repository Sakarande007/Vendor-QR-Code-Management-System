import crypto from "node:crypto";

const UPPER = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
const LOWER = "abcdefghijklmnopqrstuvwxyz";
const DIGITS = "0123456789";
const SPECIAL = "@#$!%*?";

/**
 * Picks `count` characters from `pool` using crypto.randomBytes.
 * @param {string} pool
 * @param {number} count
 * @returns {string[]}
 */
function pickFrom(pool, count) {
  const chars = [];
  const bytes = crypto.randomBytes(count);
  for (let i = 0; i < count; i += 1) {
    chars.push(pool[bytes[i] % pool.length]);
  }
  return chars;
}

/**
 * Fisher–Yates shuffle (cryptographic indices).
 * @param {string[]} arr
 * @returns {string[]}
 */
function shuffle(arr) {
  const result = [...arr];
  for (let i = result.length - 1; i > 0; i -= 1) {
    const j = crypto.randomInt(0, i + 1);
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

/**
 * Generates a 10-character vendor password:
 * 2 uppercase + 2 digits + 2 special (@#$!%*?) + 4 lowercase, shuffled.
 * @returns {string}
 */
export function generateVendorPassword() {
  const parts = [
    ...pickFrom(UPPER, 2),
    ...pickFrom(DIGITS, 2),
    ...pickFrom(SPECIAL, 2),
    ...pickFrom(LOWER, 4),
  ];
  return shuffle(parts).join("");
}

/**
 * Login username is the SAP vendor code (already unique).
 * @param {string} vendorCodeSap
 * @returns {string}
 */
export function generateUsername(vendorCodeSap) {
  return String(vendorCodeSap).trim();
}
