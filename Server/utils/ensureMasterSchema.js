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
 * Adds materials.unit_price when DB predates current schema.sql.
 */
export async function ensureMasterSchema() {
  if (!(await hasColumn("materials", "unit_price"))) {
    logger.info("[schema] Adding materials.unit_price column");
    await query(
      `ALTER TABLE materials
       ADD COLUMN unit_price DECIMAL(15, 2) NOT NULL DEFAULT 0.00 AFTER uom`
    );
  }
}
