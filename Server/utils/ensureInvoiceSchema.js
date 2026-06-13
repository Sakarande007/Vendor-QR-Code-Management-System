import { query } from "../config/db.js";
import { logger } from "./logger.js";

/**
 * @param {string} table
 * @param {string} column
 */
async function hasColumn(table, column) {
  const [rows] = await query(
    `SELECT 1 AS ok FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?
     LIMIT 1`,
    [table, column]
  );
  return rows.length > 0;
}

/**
 * @param {string} table
 * @param {string} column
 */
async function columnExtra(table, column) {
  const [rows] = await query(
    `SELECT EXTRA FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?
     LIMIT 1`,
    [table, column]
  );
  return String(rows[0]?.EXTRA ?? "");
}

/**
 * @param {string} table
 * @param {string} indexName
 */
async function hasIndex(table, indexName) {
  const [rows] = await query(
    `SELECT 1 AS ok FROM INFORMATION_SCHEMA.STATISTICS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND INDEX_NAME = ?
     LIMIT 1`,
    [table, indexName]
  );
  return rows.length > 0;
}

/**
 * Adds `system_invoice_id` / `rejection_reason` when DB predates current schema.sql.
 * Safe to run on every startup (no-op when already aligned).
 */
export async function ensureInvoiceSchema() {
  /** @type {string[]} */
  const fixes = [];

  const hasSystemId = await hasColumn("invoices", "system_invoice_id");

  if (!hasSystemId) {
    fixes.push("add system_invoice_id");
    await query(
      `ALTER TABLE invoices
       ADD COLUMN system_invoice_id VARCHAR(50) NULL AFTER invoice_id`
    );
  } else if (/generated/i.test(await columnExtra("invoices", "system_invoice_id"))) {
    fixes.push("replace generated system_invoice_id");
    if (await hasIndex("invoices", "uk_invoices_system_invoice_id")) {
      await query(`ALTER TABLE invoices DROP INDEX uk_invoices_system_invoice_id`);
    }
    await query(`ALTER TABLE invoices DROP COLUMN system_invoice_id`);
    await query(
      `ALTER TABLE invoices
       ADD COLUMN system_invoice_id VARCHAR(50) NULL AFTER invoice_id`
    );
  }

  if (!hasSystemId || fixes.includes("replace generated system_invoice_id")) {
    await query(
      `UPDATE invoices
       SET system_invoice_id = CONCAT('SYS-', LPAD(CAST(invoice_id AS CHAR), 10, '0'))
       WHERE system_invoice_id IS NULL OR TRIM(system_invoice_id) = ''`
    );
    await query(
      `ALTER TABLE invoices
       MODIFY COLUMN system_invoice_id VARCHAR(50) NOT NULL`
    );
  }

  if (!(await hasIndex("invoices", "uk_invoices_system_invoice_id"))) {
    fixes.push("add uk_invoices_system_invoice_id");
    await query(
      `ALTER TABLE invoices
       ADD UNIQUE KEY uk_invoices_system_invoice_id (system_invoice_id)`
    );
  }

  if (!(await hasColumn("invoices", "rejection_reason"))) {
    fixes.push("add rejection_reason");
    await query(
      `ALTER TABLE invoices
       ADD COLUMN rejection_reason VARCHAR(500) NULL AFTER status`
    );
  }

  if (fixes.length) {
    logger.info("[db] Invoice schema aligned with application", { fixes });
  }
}
