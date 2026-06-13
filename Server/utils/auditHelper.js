import { query } from "../config/db.js";
import { logger } from "./logger.js";

/**
 * Writes an audit log entry (use within transactions via connection.execute).
 * @param {import('mysql2/promise').PoolConnection|{ execute: Function }} executor
 * @param {object} entry
 * @param {number|null} entry.actorUserId
 * @param {string} entry.action
 * @param {string} entry.entityType
 * @param {string} entry.entityId
 * @param {object|null} [entry.oldValues]
 * @param {object|null} [entry.newValues]
 * @param {string|null} [entry.ipAddress]
 * @param {string|null} [entry.userAgent]
 */
export async function writeAuditLog(executor, entry) {
  const sql = `INSERT INTO audit_logs
    (user_id, action, entity_type, entity_id, old_values, new_values, ip_address, user_agent)
   VALUES (?, ?, ?, ?, ?, ?, ?, ?)`;

  const params = [
    entry.actorUserId ?? null,
    entry.action,
    entry.entityType,
    String(entry.entityId).slice(0, 50),
    entry.oldValues ? JSON.stringify(entry.oldValues) : null,
    entry.newValues ? JSON.stringify(entry.newValues) : null,
    entry.ipAddress ?? null,
    entry.userAgent ?? null,
  ];

  if (executor && typeof executor.execute === "function") {
    await executor.execute(sql, params);
    return;
  }

  await query(sql, params);
}

/**
 * Fire-and-forget audit from controllers when not in a transaction.
 * @param {object} entry
 */
export async function writeAuditLogAsync(entry) {
  try {
    await writeAuditLog(null, entry);
  } catch (err) {
    logger.error("Audit log write failed", {
      action: entry.action,
      message: err instanceof Error ? err.message : String(err),
    });
  }
}

/**
 * @param {import('express').Request} req
 * @returns {{ ipAddress: string|null, userAgent: string|null }}
 */
export function auditContextFromRequest(req) {
  return {
    ipAddress: req.ip || null,
    userAgent: req.get("user-agent") || null,
  };
}
