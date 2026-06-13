import * as XLSX from "xlsx";
import { query } from "../config/db.js";
import { ApiError } from "../utils/ApiError.js";
import {
  getDashboardSummary,
  getVendorMaterialBalance,
  getVendorPOList,
} from "./vendorDashboardService.js";
import {
  buildCursorPage,
  parsePaginationQuery,
  sqlInlineLimit,
} from "../utils/pagination.js";

const OPEN_PO_STATUSES = ["open", "partially_invoiced"];
const EXPORT_ROW_LIMIT = 50_000;

/**
 * @param {Date|string} value
 * @returns {string}
 */
function formatSqlDate(value) {
  if (value instanceof Date) {
    return value.toISOString().slice(0, 10);
  }
  return String(value).slice(0, 10);
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
 * @param {object} filters
 * @returns {{ clauses: string[], params: unknown[] }}
 */
function buildAdminViewFilters(filters) {
  const clauses = ["1=1"];
  const params = [];

  if (filters.vendorCode) {
    clauses.push("v.vendor_code = ?");
    params.push(filters.vendorCode);
  }

  if (filters.plantCode) {
    clauses.push("v.plant_code = ?");
    params.push(filters.plantCode);
  }

  if (filters.status) {
    clauses.push("v.po_status = ?");
    params.push(filters.status);
  }

  if (filters.materialCode) {
    clauses.push("v.material_code = ?");
    params.push(filters.materialCode);
  }

  if (filters.dateFrom) {
    clauses.push("v.po_date >= ?");
    params.push(formatSqlDate(filters.dateFrom));
  }

  if (filters.dateTo) {
    clauses.push("v.po_date <= ?");
    params.push(formatSqlDate(filters.dateTo));
  }

  return { clauses, params };
}

/**
 * @param {object} row
 */
function formatFlatBalanceRow(row) {
  const poQty = Number(row.po_qty);
  const balanceQty = Number(row.balance_qty);
  return {
    vendor_code: row.vendor_code,
    vendor_code_sap: row.vendor_code_sap ?? row.vendor_code,
    vendor_name: row.vendor_name,
    po_number: row.po_number,
    po_date: row.po_date,
    plant_code: row.plant_code,
    sr_no: row.sr_no != null ? Number(row.sr_no) : null,
    line_no: Number(row.line_no),
    material_code: row.material_code,
    item_description: row.item_description,
    po_qty: poQty,
    dispatched_qty: Number(row.dispatched_qty),
    balance_qty: balanceQty,
    uom: row.uom,
    store_location: row.store_location,
    balance_percentage: balancePercentage(poQty, balanceQty),
    po_status: row.po_status,
    unit_price: Number(row.unit_price ?? 0),
  };
}

export async function getAdminDashboardSummary() {
  // Independent reads — run in parallel to cut round-trips.
  const [
    [[vendorStats]],
    [[poStats]],
    [[todayStats]],
    [topPending],
    [recentUploads],
  ] = await Promise.all([
    query(
      `SELECT
       COUNT(*) AS total_vendors,
       SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) AS active_vendors
     FROM vendors`
    ),
    query(
      `SELECT
       COUNT(DISTINCT CASE WHEN po_status IN ('open', 'partially_invoiced') THEN po_number END) AS total_open_pos,
       COALESCE(SUM(CASE WHEN po_status IN ('open', 'partially_invoiced') THEN balance_qty END), 0) AS total_balance_qty
     FROM v_vendor_po_balance`
    ),
    query(
      `SELECT
       (SELECT COUNT(*) FROM po_upload_batches
        WHERE DATE(uploaded_at) = CURDATE()) AS pos_uploaded_today,
       (SELECT COUNT(*) FROM invoices
        WHERE DATE(created_at) = CURDATE()) AS invoices_today`
    ),
    query(
      `SELECT vendor_code, vendor_name,
            SUM(balance_qty) AS total_balance_qty,
            COUNT(DISTINCT po_number) AS open_po_count
     FROM v_vendor_po_balance
     WHERE po_status IN ('open', 'partially_invoiced')
     GROUP BY vendor_code, vendor_name
     ORDER BY total_balance_qty DESC
     LIMIT 10`
    ),
    query(
      `SELECT batch_id, file_name, uploaded_at, total_rows, inserted_rows, status
     FROM po_upload_batches
     ORDER BY uploaded_at DESC
     LIMIT 5`
    ),
  ]);

  return {
    summary: {
      total_vendors: Number(vendorStats?.total_vendors ?? 0),
      active_vendors: Number(vendorStats?.active_vendors ?? 0),
      total_open_pos: Number(poStats?.total_open_pos ?? 0),
      total_balance_qty: Number(poStats?.total_balance_qty ?? 0),
      pos_uploaded_today: Number(todayStats?.pos_uploaded_today ?? 0),
      invoices_today: Number(todayStats?.invoices_today ?? 0),
    },
    top_pending_vendors: topPending.map((r) => ({
      vendor_code: r.vendor_code,
      vendor_name: r.vendor_name,
      total_balance_qty: Number(r.total_balance_qty),
      open_po_count: Number(r.open_po_count),
    })),
    recent_uploads: recentUploads.map((r) => ({
      batch_id: r.batch_id,
      file_name: r.file_name,
      uploaded_at: r.uploaded_at,
      total_rows: Number(r.total_rows),
      inserted_rows: Number(r.inserted_rows),
      status: r.status,
    })),
  };
}

/**
 * @param {string} vendorCode
 */
export async function getAdminVendorPOBalance(vendorCode) {
  const [vendorRows] = await query(
    `SELECT vendor_code, vendor_code_sap, vendor_name, status
     FROM vendors WHERE vendor_code = ? LIMIT 1`,
    [vendorCode]
  );

  if (!vendorRows.length) {
    throw ApiError.notFound("Vendor not found");
  }

  const vendor = vendorRows[0];

  // Independent reads — run in parallel after vendor validation.
  const [dashboard, poList, materials, [[invoiceStats]], [[dispatchStats]]] =
    await Promise.all([
      getDashboardSummary(vendorCode),
      getVendorPOList(vendorCode, {
        pageSize: 100,
        include_all_statuses: true,
      }),
      getVendorMaterialBalance(vendorCode),
      query(
        `SELECT
       COUNT(*) AS invoice_count,
       COALESCE(SUM(il.invoice_qty * il.unit_price), 0) AS total_invoiced_amount
     FROM invoices i
     LEFT JOIN invoice_lines il ON il.invoice_id = i.invoice_id
     WHERE i.vendor_code = ?
       AND i.status NOT IN ('draft', 'rejected')`,
        [vendorCode]
      ),
      query(
        `SELECT MAX(dispatch_date) AS last_dispatch_date
     FROM vendor_dispatch_history
     WHERE vendor_code = ?`,
        [vendorCode]
      ),
    ]);

  return {
    vendor_info: {
      vendor_code: vendor.vendor_code,
      vendor_code_sap: vendor.vendor_code_sap ?? vendor.vendor_code,
      vendor_name: vendor.vendor_name,
      status: vendor.status,
    },
    summary: dashboard.summary,
    purchase_orders: poList.purchase_orders,
    materials,
    invoice_stats: {
      invoice_count: Number(invoiceStats?.invoice_count ?? 0),
      total_invoiced_amount: Number(invoiceStats?.total_invoiced_amount ?? 0),
      last_dispatch_date: dispatchStats?.last_dispatch_date ?? null,
    },
  };
}

/**
 * @param {object} queryParams
 */
export async function getAdminAllPOBalance(queryParams) {
  const { limit, cursor } = parsePaginationQuery({
    pageSize: queryParams.pageSize,
    cursor: queryParams.cursor,
    maxPageSize: 100,
  });

  const filters = buildAdminViewFilters({
    vendorCode: queryParams.vendor_code,
    plantCode: queryParams.plant_code,
    status: queryParams.status,
    materialCode: queryParams.material_code,
    dateFrom: queryParams.date_from,
    dateTo: queryParams.date_to,
  });

  const whereBase = filters.clauses.join(" AND ");
  const keysetParams = [];
  let keysetClause = "";

  if (cursor?.createdAt && cursor?.id) {
    keysetClause =
      "AND (v.po_date < ? OR (v.po_date = ? AND v.line_id < ?))";
    keysetParams.push(cursor.createdAt, cursor.createdAt, cursor.id);
  } else if (cursor?.id) {
    keysetClause = "AND v.line_id < ?";
    keysetParams.push(cursor.id);
  }

  const listSql = `
    SELECT v.vendor_code, vend.vendor_code_sap, v.vendor_name, v.po_number, v.po_date, v.plant_code,
           v.sr_no, v.line_no, v.line_id, v.material_code, v.item_description,
           v.po_qty, v.dispatched_qty, v.balance_qty, v.uom, v.store_location,
           v.po_status, COALESCE(m.unit_price, 0) AS unit_price
    FROM v_vendor_po_balance v
    INNER JOIN vendors vend ON vend.vendor_code = v.vendor_code
    LEFT JOIN materials m ON m.material_code = v.material_code
    WHERE ${whereBase} ${keysetClause}
    ORDER BY v.po_date DESC, v.line_id DESC
    LIMIT ${sqlInlineLimit(limit, true)}`;

  const [rows] = await query(listSql, [...filters.params, ...keysetParams]);

  const page = buildCursorPage(rows, limit, (row) => ({
    id: row.line_id,
    createdAt:
      row.po_date instanceof Date
        ? row.po_date.toISOString().slice(0, 10)
        : String(row.po_date).slice(0, 10),
  }));

  return {
    lines: page.data.map(formatFlatBalanceRow),
    pagination: page.pagination,
  };
}

/**
 * Fetches all matching rows for export (capped).
 * @param {object} queryParams
 */
async function fetchAllPOBalanceRows(queryParams) {
  const filters = buildAdminViewFilters({
    vendorCode: queryParams.vendor_code,
    plantCode: queryParams.plant_code,
    status: queryParams.status,
    materialCode: queryParams.material_code,
    dateFrom: queryParams.date_from,
    dateTo: queryParams.date_to,
  });

  const whereBase = filters.clauses.join(" AND ");

  const [rows] = await query(
    `SELECT v.vendor_code, vend.vendor_code_sap, v.vendor_name, v.po_number, v.po_date, v.plant_code,
            v.sr_no, v.line_no, v.material_code, v.item_description,
            v.po_qty, v.dispatched_qty, v.balance_qty, v.uom, v.store_location,
            v.po_status, COALESCE(m.unit_price, 0) AS unit_price
     FROM v_vendor_po_balance v
     INNER JOIN vendors vend ON vend.vendor_code = v.vendor_code
     LEFT JOIN materials m ON m.material_code = v.material_code
     WHERE ${whereBase}
     ORDER BY v.vendor_code, v.po_date DESC, v.po_number, v.line_no
     LIMIT ${sqlInlineLimit(EXPORT_ROW_LIMIT)}`,
    filters.params
  );

  return rows.map(formatFlatBalanceRow);
}

/**
 * @param {object} queryParams
 */
export async function getAdminMaterialBalanceSummary(queryParams) {
  const clauses = [`v.po_status IN (${OPEN_PO_STATUSES.map(() => "?").join(", ")})`];
  const params = [...OPEN_PO_STATUSES];

  if (queryParams.vendor_code) {
    clauses.push("v.vendor_code = ?");
    params.push(queryParams.vendor_code);
  }

  if (queryParams.plant_code) {
    clauses.push("v.plant_code = ?");
    params.push(queryParams.plant_code);
  }

  const [rows] = await query(
    `SELECT v.material_code, v.item_description, v.uom,
            SUM(v.po_qty) AS total_po_qty,
            SUM(v.dispatched_qty) AS total_dispatched,
            SUM(v.balance_qty) AS total_balance,
            COUNT(DISTINCT v.vendor_code) AS vendor_count,
            COUNT(DISTINCT v.po_number) AS open_po_count
     FROM v_vendor_po_balance v
     WHERE ${clauses.join(" AND ")}
     GROUP BY v.material_code, v.item_description, v.uom
     ORDER BY total_balance DESC`,
    params
  );

  return rows.map((r) => ({
    material_code: r.material_code,
    item_description: r.item_description,
    uom: r.uom,
    total_po_qty: Number(r.total_po_qty),
    total_dispatched: Number(r.total_dispatched),
    total_balance: Number(r.total_balance),
    vendor_count: Number(r.vendor_count),
    open_po_count: Number(r.open_po_count),
  }));
}

/**
 * @param {object} queryParams
 * @returns {Promise<{ buffer: Buffer, filename: string }>}
 */
export async function exportPOBalanceExcel(queryParams) {
  const [poRows, materialRows] = await Promise.all([
    fetchAllPOBalanceRows(queryParams),
    getAdminMaterialBalanceSummary(queryParams),
  ]);

  const poSheetData = poRows.map((r) => ({
    "Vendor Code": r.vendor_code,
    "Vendor Name": r.vendor_name,
    "PO Number": r.po_number,
    "PO Date": r.po_date,
    Plant: r.plant_code,
    "Line No": r.line_no,
    "Material Code": r.material_code,
    Description: r.item_description,
    "PO Qty": r.po_qty,
    "Dispatched Qty": r.dispatched_qty,
    "Balance Qty": r.balance_qty,
    UOM: r.uom,
    "Store Location": r.store_location,
    "Balance %": r.balance_percentage,
    Status: r.po_status,
  }));

  const materialSheetData = materialRows.map((r) => ({
    "Material Code": r.material_code,
    Description: r.item_description,
    UOM: r.uom,
    "Total PO Qty": r.total_po_qty,
    "Total Dispatched": r.total_dispatched,
    "Total Balance": r.total_balance,
    "Vendor Count": r.vendor_count,
    "Open PO Count": r.open_po_count,
  }));

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.json_to_sheet(
      poSheetData.length ? poSheetData : [{ Note: "No data for selected filters" }]
    ),
    "PO Balance Summary"
  );
  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.json_to_sheet(
      materialSheetData.length
        ? materialSheetData
        : [{ Note: "No data for selected filters" }]
    ),
    "Material Summary"
  );

  const buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });
  const dateKey = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const vendorSuffix = queryParams.vendor_code
    ? `_${queryParams.vendor_code}`
    : "";

  return {
    buffer,
    filename: `po_balance_export${vendorSuffix}_${dateKey}.xlsx`,
  };
}
