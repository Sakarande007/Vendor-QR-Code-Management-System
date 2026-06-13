import { query } from "../config/db.js";
import { logger } from "../utils/logger.js";

const MUTATING_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

/**
 * Persists audit trail for mutating HTTP requests after response completes.
 * @type {import('express').RequestHandler}
 */
export function auditMiddleware(req, res, next) {
  if (!MUTATING_METHODS.has(req.method)) {
    return next();
  }

  const startTime = Date.now();

  res.on("finish", () => {
    const durationMs = Date.now() - startTime;

    const action = `${req.method} ${req.route?.path || req.path}`;
    const entityType = req.baseUrl?.replace(/^\//, "") || "api";
    const entityId =
      req.params?.id ||
      req.params?.invoiceId ||
      req.params?.poNumber ||
      req.body?.id ||
      "n/a";

    const auditEntry = {
      user_id: req.user?.userId ?? null,
      action,
      entity_type: entityType,
      entity_id: String(entityId).slice(0, 50),
      old_values: null,
      new_values: sanitizeBody(req.body),
      ip_address: req.ip || null,
      user_agent: req.get("user-agent") || null,
    };

    query(
      `INSERT INTO audit_logs
        (user_id, action, entity_type, entity_id, old_values, new_values, ip_address, user_agent)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        auditEntry.user_id,
        auditEntry.action,
        auditEntry.entity_type,
        auditEntry.entity_id,
        auditEntry.old_values,
        auditEntry.new_values,
        auditEntry.ip_address,
        auditEntry.user_agent,
      ]
    ).catch((err) => {
      logger.error("Audit log write failed", {
        requestId: res.locals.requestId,
        error: err.message,
        durationMs,
      });
    });
  });

  next();
}

/**
 * Redacts sensitive fields before persisting request body to audit_logs.
 * @param {unknown} body
 * @returns {Record<string, unknown>|null}
 */
function sanitizeBody(body) {
  if (!body || typeof body !== "object") {
    return null;
  }

  const sanitized = { ...body };
  const sensitiveKeys = [
    "password",
    "password_hash",
    "passwordHash",
    "token",
    "refreshToken",
    "accessToken",
  ];

  for (const key of sensitiveKeys) {
    if (key in sanitized) {
      sanitized[key] = "[REDACTED]";
    }
  }

  return sanitized;
}
