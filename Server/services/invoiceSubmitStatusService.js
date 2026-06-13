import {
  CACHE_TTL,
  cacheKeys,
  del,
  get,
  set,
} from "./cacheService.js";

/**
 * @param {number} invoiceId
 * @param {object} payload
 */
export async function setSubmitStatus(invoiceId, payload) {
  await set(
    cacheKeys.invoiceSubmitStatus(invoiceId),
    JSON.stringify(payload),
    CACHE_TTL.invoiceSubmitStatus
  );
}

/**
 * @param {number} invoiceId
 * @returns {Promise<object|null>}
 */
export async function getSubmitStatus(invoiceId) {
  const raw = await get(cacheKeys.invoiceSubmitStatus(invoiceId));
  if (!raw) {
    return null;
  }
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/**
 * @param {number} invoiceId
 */
export async function clearSubmitStatus(invoiceId) {
  await del(cacheKeys.invoiceSubmitStatus(invoiceId));
}
