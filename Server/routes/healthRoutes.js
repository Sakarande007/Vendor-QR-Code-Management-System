import { Router } from "express";
import { statfs } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ping as dbPing } from "../config/db.js";
import { ping as redisPing } from "../config/redis.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiResponse } from "../utils/ApiResponse.js";

const router = Router();
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const HEALTH_CHECK_TIMEOUT_MS = Number(process.env.HEALTH_CHECK_TIMEOUT_MS) || 3_000;

/**
 * @template T
 * @param {Promise<T>} promise
 * @param {number} ms
 * @param {string} label
 * @returns {Promise<T>}
 */
function withTimeout(promise, ms, label) {
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      setTimeout(() => reject(new Error(`${label} check timed out after ${ms}ms`)), ms);
    }),
  ]);
}

/**
 * Checks available disk space for the application volume.
 * @returns {Promise<{ status: string, freePercent?: number, freeBytes?: number, totalBytes?: number, message?: string }>}
 */
async function checkDiskSpace() {
  const minFreePercent = Number(process.env.HEALTH_MIN_DISK_FREE_PERCENT) || 5;

  try {
    const stats = await statfs(path.resolve(__dirname, ".."));
    const freeBytes = Number(stats.bfree) * Number(stats.bsize);
    const totalBytes = Number(stats.blocks) * Number(stats.bsize);

    if (totalBytes === 0) {
      return { status: "unknown", message: "Unable to determine disk size" };
    }

    const freePercent = (freeBytes / totalBytes) * 100;

    return {
      status: freePercent >= minFreePercent ? "ok" : "degraded",
      freePercent: Math.round(freePercent * 100) / 100,
      freeBytes,
      totalBytes,
    };
  } catch (err) {
    return {
      status: "unknown",
      message: err instanceof Error ? err.message : "Disk check failed",
    };
  }
}

/**
 * @route GET /api/health
 * Liveness/readiness probe — DB, Redis, disk space.
 */
router.get(
  "/",
  asyncHandler(async (_req, res) => {
    const checks = {
      database: { status: "down" },
      redis: { status: "down" },
      disk: { status: "unknown" },
    };

    try {
      await withTimeout(dbPing(), HEALTH_CHECK_TIMEOUT_MS, "database");
      checks.database = { status: "ok" };
    } catch (err) {
      checks.database = {
        status: "down",
        message: err instanceof Error ? err.message : "Database unreachable",
      };
    }

    try {
      await withTimeout(redisPing(), HEALTH_CHECK_TIMEOUT_MS, "redis");
      checks.redis = { status: "ok" };
    } catch (err) {
      checks.redis = {
        status: "down",
        message: err instanceof Error ? err.message : "Redis unreachable",
      };
    }

    checks.disk = await checkDiskSpace();

    const isHealthy =
      checks.database.status === "ok" &&
      checks.redis.status === "ok" &&
      checks.disk.status !== "degraded";

    const statusCode = isHealthy ? 200 : 503;

    return res.status(statusCode).json({
      success: isHealthy,
      data: {
        status: isHealthy ? "healthy" : "unhealthy",
        uptime: process.uptime(),
        worker: process.pid,
        checks,
      },
      message: isHealthy ? "All systems operational" : "One or more health checks failed",
      requestId: res.locals.requestId ?? null,
      timestamp: new Date().toISOString(),
    });
  })
);

export default router;
