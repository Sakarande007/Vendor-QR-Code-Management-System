import { createHash } from "node:crypto";
import {
  CACHE_TTL,
  cacheKeys,
  delByPattern,
  getOrSet,
} from "./cacheService.js";

/** @deprecated Use CACHE_TTL — kept for existing imports */
export const MASTER_CACHE_TTL = {
  plants: CACHE_TTL.masterPlants,
  storage_locations: CACHE_TTL.masterStorage,
  materials: CACHE_TTL.masterMaterials,
};

/**
 * @param {string} type
 * @param {object} [params]
 * @returns {string}
 */
export function buildMasterCacheKey(type, params = {}) {
  const hash = createHash("sha256")
    .update(JSON.stringify(params, Object.keys(params).sort()))
    .digest("hex")
    .slice(0, 16);
  return cacheKeys.master(type, hash);
}

/**
 * @template T
 * @param {string} key
 * @param {() => Promise<T>} fetchFn
 * @param {number} ttlSec
 * @returns {Promise<T>}
 */
export async function cacheAside(key, fetchFn, ttlSec) {
  return getOrSet(key, fetchFn, ttlSec);
}

/**
 * @param {string} type
 */
export async function invalidateMasterCache(type) {
  await delByPattern(`cache:masters:${type}:*`);
}

export async function invalidatePlantRelatedCaches() {
  await invalidateMasterCache("plants");
  await invalidateMasterCache("storage_locations");
}
