import "dotenv/config";
import cluster from "node:cluster";
import os from "node:os";
import process from "node:process";

import { createApp } from "./app.js";
import { closePool } from "./config/db.js";
import { ensureInvoiceSchema } from "./utils/ensureInvoiceSchema.js";
import { ensureMasterSchema } from "./utils/ensureMasterSchema.js";
import { quit as quitRedis } from "./config/redis.js";
import {
  closeInvoiceQueue,
  startInvoiceQueueWorker,
} from "./queues/invoiceQueue.js";
import { logger } from "./utils/logger.js";
import { validateRequiredSecrets } from "./utils/validateEnvironment.js";

const PORT = Number(process.env.PORT) || 5000;
const isProd = process.env.NODE_ENV === "production";
const clusterEnabled =
  process.env.CLUSTER_ENABLED === "true" ||
  (process.env.CLUSTER_ENABLED !== "false" && isProd);

const workerCount =
  process.env.CLUSTER_WORKERS === "auto" || !process.env.CLUSTER_WORKERS
    ? os.cpus().length
    : Math.max(1, Number(process.env.CLUSTER_WORKERS));

/** @type {import('http').Server|null} */
let server = null;
/** @type {boolean} */
let isShuttingDown = false;

/**
 * Starts the HTTP server in the current process (cluster worker or standalone).
 * @returns {Promise<import('http').Server>}
 */
async function startHttpServer() {
  const app = createApp();

  return new Promise((resolve, reject) => {
    server = app.listen(PORT, () => {
      logger.info("Server listening", {
        port: PORT,
        pid: process.pid,
        env: process.env.NODE_ENV || "development",
        cluster: cluster.isWorker,
      });
      resolve(server);
    });

    server.on("error", reject);
  });
}

/**
 * Gracefully drains in-flight connections and closes resources.
 * @param {string} signal
 */
async function gracefulShutdown(signal) {
  if (isShuttingDown) {
    return;
  }
  isShuttingDown = true;

  logger.info("Shutdown initiated", { signal, pid: process.pid });

  const forceExitTimer = setTimeout(() => {
    logger.error("Forced shutdown after timeout");
    process.exit(1);
  }, Number(process.env.SHUTDOWN_TIMEOUT_MS) || 30_000);

  forceExitTimer.unref();

  try {
    if (server) {
      await new Promise((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()));
      });
    }

    await closeInvoiceQueue();
    await closePool();
    await quitRedis();

    logger.info("Shutdown complete", { pid: process.pid });
    clearTimeout(forceExitTimer);
    process.exit(0);
  } catch (err) {
    logger.error("Shutdown error", {
      message: err instanceof Error ? err.message : String(err),
    });
    clearTimeout(forceExitTimer);
    process.exit(1);
  }
}

/**
 * Registers signal handlers on worker / standalone processes.
 */
function registerWorkerSignals() {
  process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
  process.on("SIGINT", () => gracefulShutdown("SIGINT"));

  process.on("uncaughtException", (err) => {
    logger.error("Uncaught exception", { message: err.message, stack: err.stack });
    gracefulShutdown("uncaughtException");
  });

  process.on("unhandledRejection", (reason) => {
    logger.error("Unhandled rejection", {
      reason: reason instanceof Error ? reason.message : String(reason),
    });
  });
}

/**
 * Cluster primary — forks workers and manages lifecycle.
 */
function startPrimary() {
  logger.info("Primary starting cluster", { workers: workerCount });

  for (let i = 0; i < workerCount; i += 1) {
    cluster.fork();
  }

  cluster.on("online", (worker) => {
    logger.info("Worker online", { workerId: worker.id, pid: worker.process.pid });
  });

  cluster.on("exit", (worker, code, signal) => {
    logger.warn("Worker exited", {
      workerId: worker.id,
      pid: worker.process.pid,
      code,
      signal,
    });

    if (!isShuttingDown && code !== 0) {
      logger.info("Replacing failed worker");
      cluster.fork();
    }
  });

  const shutdownPrimary = (signal) => {
    if (isShuttingDown) {
      return;
    }
    isShuttingDown = true;

    logger.info("Primary shutdown", { signal });

    for (const id in cluster.workers) {
      cluster.workers[id]?.process.kill(signal);
    }

    setTimeout(() => {
      logger.error("Workers did not exit in time — forcing primary exit");
      process.exit(1);
    }, Number(process.env.SHUTDOWN_TIMEOUT_MS) || 30_000).unref();
  };

  process.on("SIGTERM", () => shutdownPrimary("SIGTERM"));
  process.on("SIGINT", () => shutdownPrimary("SIGINT"));
}

/**
 * Application entrypoint.
 */
async function main() {
  if (clusterEnabled && cluster.isPrimary) {
    startPrimary();
    return;
  }

  registerWorkerSignals();
  validateRequiredSecrets();
  await ensureInvoiceSchema();
  await ensureMasterSchema();
  await startHttpServer();
  startInvoiceQueueWorker();
}

main().catch((err) => {
  logger.error("Fatal startup error", { message: err.message, stack: err.stack });
  process.exit(1);
});
