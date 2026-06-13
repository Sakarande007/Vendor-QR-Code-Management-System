import { query } from "../config/db.js";
import { sqlInlineLimit, sqlInlineOffset } from "../utils/pagination.js";

/**
 * @param {object} row
 */
function formatAuditLog(row) {
  return {
    id: Number(row.id),
    userId: row.user_id != null ? Number(row.user_id) : null,
    userEmail: row.user_email ?? null,
    userName: null,
    action: row.action,
    entityType: row.entity_type,
    entityId: row.entity_id,
    oldValues: row.old_values,
    newValues: row.new_values,
    ipAddress: row.ip_address,
    createdAt:
      row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at,
  };
}

/**
 * Admin dashboard aggregates and chart series.
 */
export async function getAdminDashboard() {
  // All five reads are independent — run them in parallel to cut round-trips.
  const [
    [[statsRow]],
    [invoicesPerDay],
    [statusDistribution],
    [poSyncActivity],
    [recentInvoices],
  ] = await Promise.all([
    query(
      `SELECT
       (SELECT COUNT(*) FROM vendors) AS total_vendors,
       (SELECT COUNT(*) FROM po_headers WHERE status IN ('open', 'partially_invoiced')) AS active_pos,
       (SELECT COUNT(*) FROM invoices
        WHERE invoice_date >= DATE_FORMAT(CURDATE(), '%Y-%m-01')) AS invoices_this_month,
       (SELECT COUNT(*) FROM invoices WHERE status IN ('submitted', 'qr_generated')) AS pending_verification`
    ),
    query(
      `SELECT DATE(invoice_date) AS day, COUNT(*) AS count
     FROM invoices
     WHERE invoice_date >= DATE_SUB(CURDATE(), INTERVAL 29 DAY)
     GROUP BY DATE(invoice_date)
     ORDER BY day ASC`
    ),
    query(
      `SELECT status, COUNT(*) AS count
     FROM invoices
     GROUP BY status
     ORDER BY count DESC`
    ),
    query(
      `SELECT DATE(created_at) AS day, COUNT(*) AS count
     FROM audit_logs
     WHERE action = 'PO_ERP_SYNC'
       AND created_at >= DATE_SUB(CURDATE(), INTERVAL 29 DAY)
     GROUP BY DATE(created_at)
     ORDER BY day ASC`
    ),
    query(
      `SELECT i.invoice_id, i.system_invoice_id, i.invoice_number, i.vendor_code,
            i.po_number, i.invoice_date, i.status, i.created_at, v.vendor_name,
            COALESCE(lt.total_amount, 0) AS total_amount,
            COALESCE(ph.currency, 'INR') AS currency
     FROM invoices i
     LEFT JOIN vendors v ON v.vendor_code = i.vendor_code
     LEFT JOIN po_headers ph ON ph.po_number = i.po_number
     LEFT JOIN (
       SELECT invoice_id, SUM(invoice_qty * unit_price) AS total_amount
       FROM invoice_lines
       GROUP BY invoice_id
     ) lt ON lt.invoice_id = i.invoice_id
     ORDER BY i.created_at DESC
     LIMIT 10`
    ),
  ]);

  return {
    stats: {
      totalVendors: Number(statsRow.total_vendors ?? 0),
      activePOs: Number(statsRow.active_pos ?? 0),
      invoicesThisMonth: Number(statsRow.invoices_this_month ?? 0),
      pendingVerification: Number(statsRow.pending_verification ?? 0),
    },
    charts: {
      invoicesPerDay: invoicesPerDay.map((r) => ({
        date: r.day instanceof Date ? r.day.toISOString().slice(0, 10) : String(r.day),
        count: Number(r.count),
      })),
      invoiceStatusDistribution: statusDistribution.map((r) => ({
        status: r.status,
        count: Number(r.count),
      })),
      poSyncActivity: poSyncActivity.map((r) => ({
        date: r.day instanceof Date ? r.day.toISOString().slice(0, 10) : String(r.day),
        count: Number(r.count),
      })),
    },
    recentInvoices: recentInvoices.map((r) => ({
      invoiceId: Number(r.invoice_id),
      systemInvoiceId: r.system_invoice_id,
      invoiceNumber: r.invoice_number,
      vendorCode: r.vendor_code,
      vendorName: r.vendor_name,
      poNumber: r.po_number,
      invoiceDate:
        r.invoice_date instanceof Date
          ? r.invoice_date.toISOString().slice(0, 10)
          : r.invoice_date,
      totalAmount: Number(r.total_amount),
      currency: r.currency,
      status: r.status,
      createdAt:
        r.created_at instanceof Date ? r.created_at.toISOString() : r.created_at,
    })),
  };
}

/**
 * Last N PO ERP sync audit entries.
 * @param {number} [limit]
 */
export async function getPOSyncHistory(limit = 5) {
  const [rows] = await query(
    `SELECT a.id, a.created_at, a.new_values, a.user_id, u.email AS user_email
     FROM audit_logs a
     LEFT JOIN users u ON u.user_id = a.user_id
     WHERE a.action = 'PO_ERP_SYNC'
     ORDER BY a.id DESC
     LIMIT ${sqlInlineLimit(limit)}`,
    []
  );

  return rows.map((r) => {
    let parsed = r.new_values;
    if (typeof parsed === "string") {
      try {
        parsed = JSON.parse(parsed);
      } catch {
        parsed = null;
      }
    }

    const errors = Array.isArray(parsed?.errors) ? parsed.errors.length : 0;

    return {
      id: Number(r.id),
      createdAt:
        r.created_at instanceof Date ? r.created_at.toISOString() : r.created_at,
      userEmail: r.user_email,
      total: parsed?.total ?? parsed?.inserted + parsed?.updated ?? null,
      inserted: parsed?.inserted ?? null,
      updated: parsed?.updated ?? null,
      errorCount: errors,
    };
  });
}

/**
 * Offset-paginated audit log list for admin UI.
 * @param {object} filters
 */
export async function listAuditLogs(filters) {
  const page = filters.page ?? 1;
  const pageSize = filters.pageSize ?? 50;
  const offset = (page - 1) * pageSize;

  const clauses = [];
  const params = [];

  if (filters.userId) {
    clauses.push("a.user_id = ?");
    params.push(filters.userId);
  }

  if (filters.action) {
    clauses.push("a.action LIKE ?");
    params.push(`%${filters.action}%`);
  }

  if (filters.entityType) {
    clauses.push("a.entity_type = ?");
    params.push(filters.entityType);
  }

  if (filters.dateFrom) {
    clauses.push("a.created_at >= ?");
    params.push(filters.dateFrom);
  }

  if (filters.dateTo) {
    clauses.push("a.created_at < DATE_ADD(?, INTERVAL 1 DAY)");
    params.push(filters.dateTo);
  }

  const whereSql = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";

  const [[countRow]] = await query(
    `SELECT COUNT(*) AS total FROM audit_logs a ${whereSql}`,
    params
  );
  const totalCount = Number(countRow.total ?? 0);

  const [rows] = await query(
    `SELECT a.id, a.user_id, a.action, a.entity_type, a.entity_id,
            a.old_values, a.new_values, a.ip_address, a.created_at,
            u.email AS user_email
     FROM audit_logs a
     LEFT JOIN users u ON u.user_id = a.user_id
     ${whereSql}
     ORDER BY a.id DESC
     LIMIT ${sqlInlineLimit(pageSize)} OFFSET ${sqlInlineOffset(offset)}`,
    params
  );

  return {
    auditLogs: rows.map(formatAuditLog),
    totalCount,
    pagination: {
      page,
      pageSize,
      totalPages: Math.ceil(totalCount / pageSize) || 1,
    },
  };
}
