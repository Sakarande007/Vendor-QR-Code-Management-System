import { query } from "../config/db.js";
import { ApiError } from "../utils/ApiError.js";
import {
  buildCursorPage,
  parsePaginationQuery,
  sqlInlineLimit,
} from "../utils/pagination.js";

const OPEN_PO_STATUSES = ["open", "partially_invoiced"];

/**
 * @param {string} vendorCode
 */
async function getVendorInfo(vendorCode) {
  const [rows] = await query(
    `SELECT vendor_code, vendor_code_sap, vendor_name
     FROM vendors WHERE vendor_code = ? AND status = 'active' LIMIT 1`,
    [vendorCode]
  );

  if (!rows.length) {
    throw ApiError.notFound("Vendor not found");
  }

  const v = rows[0];
  return {
    vendor_code: v.vendor_code,
    vendor_code_sap: v.vendor_code_sap ?? v.vendor_code,
    vendor_name: v.vendor_name,
  };
}

/**
 * @param {object} filters
 * @param {string} filters.vendorCode
 * @param {string} [filters.status]
 * @param {string} [filters.plantCode]
 * @param {string} [filters.search]
 * @param {boolean} [filters.includeAllStatuses]
 * @returns {{ clauses: string[], params: unknown[] }}
 */
function buildViewFilters(filters) {
  const clauses = ["v.vendor_code = ?"];
  const params = [filters.vendorCode];

  if (filters.status) {
    clauses.push("v.po_status = ?");
    params.push(filters.status);
  } else if (!filters.includeAllStatuses) {
    clauses.push(`v.po_status IN (${OPEN_PO_STATUSES.map(() => "?").join(", ")})`);
    params.push(...OPEN_PO_STATUSES);
  }

  if (filters.plantCode) {
    clauses.push("v.plant_code = ?");
    params.push(filters.plantCode);
  }

  if (filters.search?.trim()) {
    const term = `%${filters.search.trim()}%`;
    clauses.push("(v.po_number LIKE ? OR v.material_code LIKE ?)");
    params.push(term, term);
  }

  return { clauses, params };
}

/**
 * @param {string} vendorCode
 */
export async function getDashboardSummary(vendorCode) {
  const vendor_info = await getVendorInfo(vendorCode);

  // Independent aggregations — run in parallel to cut DB round-trips.
  const [
    [summaryRows],
    [invoiceRows],
    [pendingValueRows],
    [openBalanceValueRows],
    [recentInvoiceRows],
    [recentRows],
  ] = await Promise.all([
    query(
      `SELECT
       COUNT(DISTINCT CASE WHEN v.po_status IN ('open', 'partially_invoiced') THEN v.po_number END) AS total_open_pos,
       COUNT(DISTINCT CASE WHEN v.po_status IN ('open', 'partially_invoiced') THEN v.material_code END) AS total_materials,
       COALESCE(SUM(CASE WHEN v.po_status IN ('open', 'partially_invoiced') THEN v.po_qty END), 0) AS total_po_qty,
       COALESCE(SUM(CASE WHEN v.po_status IN ('open', 'partially_invoiced') THEN v.dispatched_qty END), 0) AS total_dispatched_qty,
       COALESCE(SUM(CASE WHEN v.po_status IN ('open', 'partially_invoiced') THEN v.balance_qty END), 0) AS total_balance_qty
     FROM v_vendor_po_balance v
     WHERE v.vendor_code = ?`,
      [vendorCode]
    ),
    query(
      `SELECT
       SUM(CASE WHEN status = 'draft' THEN 1 ELSE 0 END) AS pending_invoices,
       SUM(
         CASE
           WHEN invoice_date >= DATE_FORMAT(CURDATE(), '%Y-%m-01') THEN 1
           ELSE 0
         END
       ) AS invoices_this_month,
       SUM(CASE WHEN status IN ('qr_generated', 'verified') THEN 1 ELSE 0 END) AS qr_generated_count
     FROM invoices
     WHERE vendor_code = ?`,
      [vendorCode]
    ),
    query(
      `SELECT COALESCE(SUM(il.invoice_qty * il.unit_price), 0) AS draft_value
     FROM invoice_lines il
     INNER JOIN invoices i ON i.invoice_id = il.invoice_id
     WHERE i.vendor_code = ? AND i.status = 'draft'`,
      [vendorCode]
    ),
    query(
      `SELECT COALESCE(SUM(pl.balance_qty * pl.unit_price), 0) AS open_po_value
     FROM po_headers ph
     INNER JOIN po_lines pl ON pl.po_number = ph.po_number
     WHERE ph.vendor_code = ?
       AND ph.status IN ('open', 'partially_invoiced')
       AND pl.balance_qty > 0.001`,
      [vendorCode]
    ),
    query(
      `SELECT invoice_id, system_invoice_id, invoice_number, po_number, invoice_date, status
     FROM invoices
     WHERE vendor_code = ?
     ORDER BY created_at DESC
     LIMIT 5`,
      [vendorCode]
    ),
    query(
      `SELECT
       v.po_number,
       v.po_date,
       v.plant_code,
       v.po_status AS status,
       COUNT(*) AS total_lines,
       SUM(CASE WHEN v.balance_qty > 0.001 THEN 1 ELSE 0 END) AS lines_with_balance,
       COALESCE(SUM(v.balance_qty), 0) AS total_balance_qty
     FROM v_vendor_po_balance v
     WHERE v.vendor_code = ?
       AND v.po_status IN ('open', 'partially_invoiced')
     GROUP BY v.po_number, v.po_date, v.plant_code, v.po_status
     ORDER BY v.po_date DESC, v.po_number DESC
     LIMIT 5`,
      [vendorCode]
    ),
  ]);

  const draftValue = Number(pendingValueRows[0]?.draft_value ?? 0);
  const openPoValue = Number(openBalanceValueRows[0]?.open_po_value ?? 0);

  const s = summaryRows[0] ?? {};

  return {
    vendor_info,
    summary: {
      total_open_pos: Number(s.total_open_pos ?? 0),
      total_materials: Number(s.total_materials ?? 0),
      total_po_qty: Number(s.total_po_qty ?? 0),
      total_dispatched_qty: Number(s.total_dispatched_qty ?? 0),
      total_balance_qty: Number(s.total_balance_qty ?? 0),
      pending_invoices: Number(invoiceRows[0]?.pending_invoices ?? 0),
      invoices_this_month: Number(invoiceRows[0]?.invoices_this_month ?? 0),
      qr_generated_count: Number(invoiceRows[0]?.qr_generated_count ?? 0),
      pending_invoice_value: draftValue > 0 ? draftValue : openPoValue,
      draft_invoice_value: draftValue,
      open_po_value: openPoValue,
    },
    recent_invoices: recentInvoiceRows.map((r) => ({
      invoice_id: Number(r.invoice_id),
      system_invoice_id: r.system_invoice_id,
      invoice_number: r.invoice_number,
      po_number: r.po_number,
      invoice_date: r.invoice_date,
      status: r.status,
    })),
    recent_pos: recentRows.map((r) => ({
      po_number: r.po_number,
      po_date: r.po_date,
      plant_code: r.plant_code,
      status: r.status,
      total_lines: Number(r.total_lines),
      lines_with_balance: Number(r.lines_with_balance),
      total_balance_qty: Number(r.total_balance_qty),
    })),
  };
}

/**
 * @param {number} poQty
 * @param {number} balanceQty
 */
function balancePercentage(poQty, balanceQty) {
  const ordered = Number(poQty);
  if (!ordered || ordered <= 0) {
    return 0;
  }
  return Math.round((Number(balanceQty) / ordered) * 100);
}

/**
 * @param {string} vendorCode
 * @param {object} queryParams
 */
export async function getVendorPOList(vendorCode, queryParams) {
  const { limit, cursor } = parsePaginationQuery({
    pageSize: queryParams.pageSize,
    cursor: queryParams.cursor,
    maxPageSize: 50,
  });

  const filters = buildViewFilters({
    vendorCode,
    status: queryParams.status,
    plantCode: queryParams.plant_code,
    search: queryParams.search,
    includeAllStatuses: queryParams.include_all_statuses === true
      || queryParams.include_all_statuses === "true",
  });

  const whereBase = filters.clauses.join(" AND ");
  const keysetParams = [];
  let keysetClause = "";

  if (cursor?.createdAt && cursor?.id) {
    keysetClause =
      "AND (agg.po_date < ? OR (agg.po_date = ? AND agg.po_number < ?))";
    keysetParams.push(cursor.createdAt, cursor.createdAt, cursor.id);
  } else if (cursor?.id) {
    keysetClause = "AND agg.po_number < ?";
    keysetParams.push(cursor.id);
  }

  const poListSql = `
    SELECT agg.po_number, agg.po_date, agg.plant_code, agg.po_status AS status,
           p.plant_name
    FROM (
      SELECT v.po_number, MAX(v.po_date) AS po_date, v.plant_code, v.po_status
      FROM v_vendor_po_balance v
      WHERE ${whereBase}
      GROUP BY v.po_number, v.plant_code, v.po_status
    ) agg
    INNER JOIN plants p ON p.plant_code = agg.plant_code
    WHERE 1=1 ${keysetClause}
    ORDER BY agg.po_date DESC, agg.po_number DESC
    LIMIT ${sqlInlineLimit(limit, true)}`;

  const [poRows] = await query(poListSql, [
    ...filters.params,
    ...keysetParams,
  ]);

  const page = buildCursorPage(poRows, limit, (row) => ({
    id: row.po_number,
    createdAt:
      row.po_date instanceof Date
        ? row.po_date.toISOString().slice(0, 10)
        : String(row.po_date).slice(0, 10),
  }));

  if (!page.data.length) {
    return {
      purchase_orders: [],
      pagination: page.pagination,
    };
  }

  const poNumbers = page.data.map((r) => r.po_number);
  const linePlaceholders = poNumbers.map(() => "?").join(",");

  const [lineRows] = await query(
    `SELECT v.po_number, v.sr_no, v.line_no, v.material_code, v.item_description,
            v.po_qty, v.dispatched_qty, v.balance_qty, v.uom, v.store_location
     FROM v_vendor_po_balance v
     WHERE v.vendor_code = ? AND v.po_number IN (${linePlaceholders})
     ORDER BY v.po_number, v.line_no`,
    [vendorCode, ...poNumbers]
  );

  /** @type {Map<string, object>} */
  const poMap = new Map();

  for (const row of page.data) {
    poMap.set(row.po_number, {
      po_number: row.po_number,
      po_date: row.po_date,
      plant_code: row.plant_code,
      plant_name: row.plant_name,
      status: row.status,
      lines: [],
      po_totals: { total_po_qty: 0, total_dispatched: 0, total_balance: 0 },
    });
  }

  for (const line of lineRows) {
    const po = poMap.get(line.po_number);
    if (!po) {
      continue;
    }

    const poQty = Number(line.po_qty);
    const dispatchedQty = Number(line.dispatched_qty);
    const balanceQty = Number(line.balance_qty);

    po.lines.push({
      sr_no: line.sr_no != null ? Number(line.sr_no) : null,
      line_no: Number(line.line_no),
      material_code: line.material_code,
      item_description: line.item_description,
      po_qty: poQty,
      dispatched_qty: dispatchedQty,
      balance_qty: balanceQty,
      uom: line.uom,
      store_location: line.store_location,
      balance_percentage: balancePercentage(poQty, balanceQty),
    });

    po.po_totals.total_po_qty += poQty;
    po.po_totals.total_dispatched += dispatchedQty;
    po.po_totals.total_balance += balanceQty;
  }

  return {
    purchase_orders: [...poMap.values()],
    pagination: page.pagination,
  };
}

/**
 * @param {string} vendorCode
 * @param {string} poNumber
 */
export async function getVendorPODetail(vendorCode, poNumber) {
  const [owned] = await query(
    `SELECT 1 AS ok FROM po_headers
     WHERE po_number = ? AND vendor_code = ?
     LIMIT 1`,
    [poNumber, vendorCode]
  );

  if (!owned.length) {
    throw ApiError.notFound("Purchase order not found");
  }

  // Independent reads — run in parallel after ownership is confirmed.
  const [[headerRows], [lineRows], [dispatchRows], [invoiceRows]] =
    await Promise.all([
      query(
        `SELECT ph.po_number, ph.po_date, ph.plant_code, p.plant_name, ph.status,
            ph.source, pub.completed_at AS uploaded_at
     FROM po_headers ph
     INNER JOIN plants p ON p.plant_code = ph.plant_code
     LEFT JOIN po_upload_batches pub ON pub.batch_id = ph.upload_batch_id
     WHERE ph.po_number = ? AND ph.vendor_code = ?
     LIMIT 1`,
        [poNumber, vendorCode]
      ),
      query(
        `SELECT v.sr_no, v.line_no, v.line_id, v.material_code, v.item_description,
            v.po_qty, v.dispatched_qty, v.balance_qty, v.uom, v.store_location
     FROM v_vendor_po_balance v
     WHERE v.vendor_code = ? AND v.po_number = ?
     ORDER BY v.line_no`,
        [vendorCode, poNumber]
      ),
      query(
        `SELECT system_invoice_id, dispatched_qty, dispatch_date, balance_after
     FROM vendor_dispatch_history
     WHERE po_number = ? AND vendor_code = ?
     ORDER BY dispatch_date DESC, id DESC
     LIMIT 50`,
        [poNumber, vendorCode]
      ),
      query(
        `SELECT invoice_id, system_invoice_id, invoice_number, invoice_date, status,
            submitted_at, created_at
     FROM invoices
     WHERE po_number = ? AND vendor_code = ?
     ORDER BY created_at DESC
     LIMIT 20`,
        [poNumber, vendorCode]
      ),
    ]);

  const h = headerRows[0];

  return {
    po_header: {
      po_number: h.po_number,
      po_date: h.po_date,
      plant_code: h.plant_code,
      plant_name: h.plant_name,
      status: h.status,
      source: h.source ?? "manual",
      uploaded_at: h.uploaded_at,
    },
    lines: lineRows.map((line) => {
      const poQty = Number(line.po_qty);
      const balanceQty = Number(line.balance_qty);
      return {
        line_id: Number(line.line_id),
        sr_no: line.sr_no != null ? Number(line.sr_no) : null,
        line_no: Number(line.line_no),
        material_code: line.material_code,
        item_description: line.item_description,
        po_qty: poQty,
        dispatched_qty: Number(line.dispatched_qty),
        balance_qty: balanceQty,
        uom: line.uom,
        store_location: line.store_location,
        balance_percentage: balancePercentage(poQty, balanceQty),
      };
    }),
    dispatch_history: dispatchRows.map((d) => ({
      system_invoice_id: d.system_invoice_id,
      dispatched_qty: Number(d.dispatched_qty),
      dispatch_date: d.dispatch_date,
      balance_after: Number(d.balance_after),
    })),
    invoices: invoiceRows.map((inv) => ({
      invoice_id: inv.invoice_id,
      system_invoice_id: inv.system_invoice_id,
      invoice_number: inv.invoice_number,
      invoice_date: inv.invoice_date,
      status: inv.status,
      submitted_at: inv.submitted_at,
      created_at: inv.created_at,
    })),
  };
}

/**
 * @param {string} vendorCode
 */
export async function getVendorMaterialBalance(vendorCode) {
  const [rows] = await query(
    `SELECT material_code, item_description, uom,
            SUM(po_qty) AS total_po_qty,
            SUM(dispatched_qty) AS total_dispatched,
            SUM(balance_qty) AS total_balance,
            COUNT(DISTINCT po_number) AS open_po_count
     FROM v_vendor_po_balance
     WHERE vendor_code = ? AND po_status IN ('open', 'partially_invoiced')
     GROUP BY material_code, item_description, uom
     ORDER BY total_balance DESC`,
    [vendorCode]
  );

  return rows.map((r) => ({
    material_code: r.material_code,
    item_description: r.item_description,
    total_po_qty: Number(r.total_po_qty),
    total_dispatched: Number(r.total_dispatched),
    total_balance: Number(r.total_balance),
    open_po_count: Number(r.open_po_count),
    uom: r.uom,
  }));
}
