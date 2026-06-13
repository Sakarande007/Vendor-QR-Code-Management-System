import mysql from "mysql2/promise";
import { logger } from "../utils/logger.js";

const isDev = process.env.NODE_ENV !== "production";
const SLOW_QUERY_MS = Number(process.env.DB_SLOW_QUERY_MS) || 500;
const MAX_DEADLOCK_RETRIES = Number(process.env.DB_DEADLOCK_RETRIES) || 3;

const poolConfig = {
  host: process.env.DB_HOST || "localhost",
  port: Number(process.env.DB_PORT) || 3306,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: Number(process.env.DB_POOL_MAX) || 50,
  queueLimit: Number(process.env.DB_POOL_QUEUE_LIMIT) || 0,
  connectTimeout: Number(process.env.DB_CONNECT_TIMEOUT_MS) || 10_000,
  enableKeepAlive: true,
  keepAliveInitialDelay: 0,
  timezone: "Z",
  charset: "utf8mb4",
  supportBigNumbers: true,
  bigNumberStrings: true,
  dateStrings: false,
  multipleStatements: false,
};

if (process.env.DB_SSL === "true") {
  poolConfig.ssl = {
    rejectUnauthorized: process.env.DB_SSL_REJECT_UNAUTHORIZED !== "false",
    ...(process.env.DB_SSL_CA && { ca: process.env.DB_SSL_CA }),
  };
}

const pool = mysql.createPool(poolConfig);

const minPoolSize = Number(process.env.DB_POOL_MIN) || 5;

/**
 * @param {number} attempt
 * @returns {Promise<void>}
 */
function deadlockBackoff(attempt) {
  const delay = Math.min(50 * 2 ** attempt, 2000);
  return new Promise((resolve) => setTimeout(resolve, delay));
}

/**
 * @param {unknown} err
 * @returns {boolean}
 */
function isRetryableDbError(err) {
  const errno = /** @type {{ errno?: number }} */ (err).errno;
  return errno === 1213 || errno === 1205;
}

/**
 * Pre-warms the pool with minimum connections to avoid cold-start latency.
 */
async function warmPool() {
  const connections = [];
  try {
    for (let i = 0; i < minPoolSize; i += 1) {
      connections.push(await pool.getConnection());
    }
  } finally {
    connections.forEach((conn) => conn.release());
  }
}

warmPool().catch((err) => {
  logger.error("[db] Pool warm-up failed", { message: err.message });
});

pool.on("connection", (connection) => {
  connection.query("SET time_zone = '+00:00'");
  connection.query(
    "SET SESSION sql_mode = 'STRICT_TRANS_TABLES,ERROR_FOR_DIVISION_BY_ZERO,NO_ENGINE_SUBSTITUTION'"
  );
});

/**
 * Logs internal pool queue depth (dev / when DB_POOL_MONITOR=true).
 */
function logPoolStats() {
  const core = pool.pool;
  if (!core) {
    return;
  }

  logger.info("[db] Pool stats", {
    all: core._allConnections?.length ?? 0,
    free: core._freeConnections?.length ?? 0,
    queued: core._connectionQueue?.length ?? 0,
    limit: poolConfig.connectionLimit,
  });
}

if (isDev || process.env.DB_POOL_MONITOR === "true") {
  setInterval(logPoolStats, 60_000).unref();
}

/**
 * Executes a parameterized query with timeout, slow-query logging, and deadlock retry.
 * @param {string} sql
 * @param {unknown[]} [params]
 * @param {number} [attempt]
 * @returns {Promise<import('mysql2/promise').QueryResult>}
 */
async function query(sql, params = [], attempt = 0) {
  const start = Date.now();
  const timeoutMs = Number(process.env.DB_QUERY_TIMEOUT_MS) || 30_000;

  let timer;
  const timeoutPromise = new Promise((_, reject) => {
    timer = setTimeout(
      () => reject(new Error(`Query timeout after ${timeoutMs}ms`)),
      timeoutMs
    );
  });

  try {
    const result = await Promise.race([pool.execute(sql, params), timeoutPromise]);
    const duration = Date.now() - start;

    if (duration > SLOW_QUERY_MS) {
      logger.warn("[db] Slow query", {
        durationMs: duration,
        sql: sql.slice(0, 300),
        attempt,
      });
    }

    return result;
  } catch (err) {
    if (isRetryableDbError(err) && attempt < MAX_DEADLOCK_RETRIES) {
      logger.warn("[db] Deadlock/lock wait — retrying", {
        attempt: attempt + 1,
        errno: /** @type {{ errno?: number }} */ (err).errno,
      });
      await deadlockBackoff(attempt);
      return query(sql, params, attempt + 1);
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * @returns {Promise<import('mysql2/promise').PoolConnection>}
 */
async function getConnection() {
  return pool.getConnection();
}

/**
 * @returns {Promise<boolean>}
 */
async function ping() {
  await pool.query("SELECT 1");
  return true;
}

/**
 * @returns {Promise<void>}
 */
async function closePool() {
  await pool.end();
}

export { pool, query, getConnection, ping, closePool, logPoolStats, isRetryableDbError };
