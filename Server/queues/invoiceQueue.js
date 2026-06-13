import Bull from "bull";
import { logger } from "../utils/logger.js";
import { invalidatePoDetail, invalidateVendorPoCaches } from "../services/cacheService.js";
import { submitInvoiceTransaction } from "../services/invoiceService.js";
import {
  getSubmitStatus,
  setSubmitStatus,
} from "../services/invoiceSubmitStatusService.js";

const QUEUE_ENABLED = process.env.INVOICE_QUEUE_ENABLED === "true";

const redisOpts = {
  host: process.env.REDIS_HOST || "127.0.0.1",
  port: Number(process.env.REDIS_PORT) || 6379,
  password: process.env.REDIS_PASSWORD || undefined,
  db: Number(process.env.REDIS_DB) || 0,
};

/** @type {import('bull').Queue|null} */
let queue = null;

/**
 * @returns {boolean}
 */
export function isInvoiceQueueEnabled() {
  return QUEUE_ENABLED;
}

/**
 * @returns {import('bull').Queue}
 */
function getQueue() {
  if (!queue) {
    queue = new Bull("invoice-submit", {
      redis: redisOpts,
      defaultJobOptions: {
        removeOnComplete: 200,
        removeOnFail: 500,
        attempts: 3,
        backoff: { type: "exponential", delay: 2000 },
      },
      limiter: {
        max: Number(process.env.INVOICE_QUEUE_RATE_MAX) || 50,
        duration: 1000,
      },
    });

    queue.on("failed", (job, err) => {
      logger.error("Invoice submit job failed", {
        jobId: job?.id,
        invoiceId: job?.data?.invoiceId,
        message: err.message,
      });
    });
  }
  return queue;
}

export { getSubmitStatus };

/**
 * Enqueues invoice submit; returns job metadata for 202 responses.
 * @param {object} payload
 * @param {number} payload.invoiceId
 * @param {string} payload.vendorCode
 * @param {object} payload.audit
 */
export async function enqueueInvoiceSubmit(payload) {
  const q = getQueue();
  const jobId = `invoice-submit-${payload.invoiceId}`;

  const existing = await q.getJob(jobId);
  if (existing) {
    const state = await existing.getState();
    if (["active", "waiting", "delayed"].includes(state)) {
      return { jobId, submitStatus: "processing", duplicate: true };
    }
  }

  await setSubmitStatus(payload.invoiceId, {
    status: "processing",
    queuedAt: new Date().toISOString(),
  });

  const job = await q.add(payload, {
    jobId,
    priority: 1,
  });

  return { jobId: job.id, submitStatus: "processing" };
}

/**
 * Starts Bull worker (call once per Node process).
 * Performance: serializes burst submits — stable p99 under concurrent vendor load.
 */
export function startInvoiceQueueWorker() {
  if (!QUEUE_ENABLED) {
    return;
  }

  const q = getQueue();
  const concurrency = Number(process.env.INVOICE_QUEUE_CONCURRENCY) || 3;

  q.process(concurrency, async (job) => {
    const { invoiceId, vendorCode, audit } = job.data;

    await setSubmitStatus(invoiceId, {
      status: "processing",
      startedAt: new Date().toISOString(),
    });

    try {
      const result = await submitInvoiceTransaction(vendorCode, invoiceId, audit);

      await invalidateVendorPoCaches(vendorCode);
      if (result?.invoice?.poNumber) {
        await invalidatePoDetail(vendorCode, result.invoice.poNumber);
      }

      await setSubmitStatus(invoiceId, {
        status: "completed",
        completedAt: new Date().toISOString(),
      });

      return result;
    } catch (err) {
      await setSubmitStatus(invoiceId, {
        status: "failed",
        error: err instanceof Error ? err.message : String(err),
        failedAt: new Date().toISOString(),
      });
      throw err;
    }
  });

  logger.info("Invoice submit queue worker started", { concurrency });
}

/**
 * @returns {Promise<void>}
 */
export async function closeInvoiceQueue() {
  if (queue) {
    await queue.close();
    queue = null;
  }
}
