import { logger } from "../utils/logger.js";

/**
 * In-process FIFO email queue — decouples HTTP response from SMTP latency.
 * Production: replace with Redis/BullMQ for multi-worker durability.
 */
class EmailQueue {
  constructor() {
    /** @type {Array<() => Promise<void>>} */
    this.queue = [];
    this.processing = false;
  }

  /**
   * @param {() => Promise<void>} job
   */
  enqueue(job) {
    this.queue.push(job);
    this.scheduleProcess();
  }

  scheduleProcess() {
    if (this.processing) {
      return;
    }
    setImmediate(() => this.process());
  }

  async process() {
    if (this.processing || this.queue.length === 0) {
      return;
    }

    this.processing = true;

    while (this.queue.length > 0) {
      const job = this.queue.shift();
      try {
        await job();
      } catch (err) {
        logger.error("Email queue job failed", {
          message: err instanceof Error ? err.message : String(err),
        });
      }
    }

    this.processing = false;

    if (this.queue.length > 0) {
      this.scheduleProcess();
    }
  }
}

export const emailQueue = new EmailQueue();
