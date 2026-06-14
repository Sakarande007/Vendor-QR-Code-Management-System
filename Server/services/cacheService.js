import { client } from "../config/redis.js";
import { logger } from "../utils/logger.js";

/** Application cache TTLs (seconds) */
export const CACHE_TTL = {
  masterPlants: Number(process.env.MASTER_CACHE_PLANTS_TTL_SEC) || 3600,
  masterStorage: Number(process.env.MASTER_CACHE_STORAGE_TTL_SEC) || 3600,
  masterMaterials: Number(process.env.MASTER_CACHE_MATERIALS_TTL_SEC) || 1800,
  vendorPoList: Number(process.env.CACHE_VENDOR_PO_LIST_TTL_SEC) || 30,
  poDetail: Number(process.env.CACHE_PO_DETAIL_TTL_SEC) || 60,
  qrImage: Number(process.env.CACHE_QR_IMAGE_TTL_SEC) || 86_400,
  invoiceSubmitStatus: Number(process.env.CACHE_INVOICE_SUBMIT_STATUS_TTL_SEC) || 3600,
};

export const cacheKeys = {
  master: (type, hash) => `cache:masters:${type}:${hash}`,
  vendorPoList: (vendorCode, queryHash) => `cache:pos:list:${vendorCode}:${queryHash}`,
  poDetail: (vendorCode, poNumber) => `cache:pos:detail:v3:${vendorCode}:${poNumber}`,
  qrImage: (invoiceId) => `cache:qr:png:v2:${invoiceId}`,
  qrLines: (invoiceId) => `cache:qr:lines:v2:${invoiceId}`,
  invoiceSubmitStatus: (invoiceId) => `cache:invoice:submit:${invoiceId}`,
};

/**
 * @param {string} key
 * @returns {Promise<string|null>}
 */
export async function get(key) {
  try {
    return await client.get(key);
  } catch (err) {
    logger.warn("Cache get failed", { key, message: err.message });
    return null;
  }
}

/**
 * @param {string} key
 * @param {string} value
 * @param {number} [ttlSec]
 */
export async function set(key, value, ttlSec) {
  try {
    if (ttlSec > 0) {
      await client.setex(key, ttlSec, value);
    } else {
      await client.set(key, value);
    }
  } catch (err) {
    logger.warn("Cache set failed", { key, message: err.message });
  }
}

/**
 * @param {string|string[]} keys
 */
export async function del(keys) {
  try {
    const list = Array.isArray(keys) ? keys : [keys];
    if (list.length) {
      await client.del(...list);
    }
  } catch (err) {
    logger.warn("Cache del failed", { message: err.message });
  }
}

/**
 * Cache-aside: read JSON from Redis or populate via fetchFn.
 * @template T
 * @param {string} key
 * @param {() => Promise<T>} fetchFn
 * @param {number} ttlSec
 * @returns {Promise<T>}
 */
export async function getOrSet(key, fetchFn, ttlSec) {
  try {
    const cached = await client.get(key);
    if (cached) {
      return JSON.parse(cached);
    }
  } catch (err) {
    logger.warn("Cache getOrSet read failed", { key, message: err.message });
  }

  const data = await fetchFn();

  try {
    await client.setex(key, ttlSec, JSON.stringify(data));
  } catch (err) {
    logger.warn("Cache getOrSet write failed", { key, message: err.message });
  }

  return data;
}

/**
 * @param {string} pattern e.g. cache:pos:list:V001:*
 */
export async function delByPattern(pattern) {
  try {
    // ioredis keyPrefix: SCAN matches against fully-prefixed keys in Redis,
    // so use a leading wildcard. SCAN is non-blocking vs KEYS (O(N) blocking).
    const scanPattern = pattern.startsWith("*") ? pattern : `*${pattern}`;
    const prefix = client.options?.keyPrefix ?? "";

    let cursor = "0";
    let deleted = 0;

    do {
      const [nextCursor, keys] = await client.scan(
        cursor,
        "MATCH",
        scanPattern,
        "COUNT",
        100
      );
      cursor = nextCursor;

      if (keys.length) {
        const logicalKeys = keys.map((key) =>
          prefix && key.startsWith(prefix) ? key.slice(prefix.length) : key
        );
        await client.del(...logicalKeys);
        deleted += logicalKeys.length;
      }
    } while (cursor !== "0");

    return deleted;
  } catch (err) {
    logger.warn("Cache pattern delete failed", { pattern, message: err.message });
    return 0;
  }
}

/**
 * @param {string} vendorCode
 */
export async function invalidateVendorPoCaches(vendorCode) {
  // Detail keys are versioned (cache:pos:detail:<ver>:<vendor>:<po>); the `*`
  // in place of the version keeps invalidation correct across version bumps.
  await Promise.all([
    delByPattern(`cache:pos:list:${vendorCode}:*`),
    delByPattern(`cache:pos:detail:*:${vendorCode}:*`),
  ]);
}

/**
 * @param {string} vendorCode
 * @param {string} poNumber
 */
export async function invalidatePoDetail(vendorCode, poNumber) {
  await del(cacheKeys.poDetail(vendorCode, poNumber));
}
