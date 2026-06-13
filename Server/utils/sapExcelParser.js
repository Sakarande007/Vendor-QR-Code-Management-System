import * as XLSX from "xlsx";
import { ApiError } from "./ApiError.js";

/** @type {readonly string[]} */
export const SAP_EXCEL_HEADERS = [
  "SR.NO",
  "Vendor Code",
  "PO Number",
  "PO Date",
  "Plant",
  "PO Line Number",
  "Material Code",
  "Item Description",
  "PO Qty",
  "UOM",
  "Item Store Location",
  "Balance PO Qty",
];

/**
 * @param {unknown} value
 * @returns {string}
 */
export function cellToString(value) {
  if (value === null || value === undefined || value === "") {
    return "";
  }
  if (typeof value === "number") {
    if (Number.isInteger(value) || value % 1 === 0) {
      return String(Math.trunc(value));
    }
    return String(value);
  }
  return String(value).trim();
}

/**
 * @param {number} raw YYYYMMDD integer
 * @returns {string} MySQL DATE YYYY-MM-DD
 */
export function sapDateRawToMysqlDate(raw) {
  const year = Math.floor(raw / 10000);
  const month = Math.floor((raw % 10000) / 100);
  const day = raw % 100;
  const mm = String(month).padStart(2, "0");
  const dd = String(day).padStart(2, "0");
  return `${year}-${mm}-${dd}`;
}

/**
 * @param {unknown[]} row
 * @returns {boolean}
 */
function isEmptyDataRow(row) {
  return !row.some((cell) => cellToString(cell) !== "");
}

/**
 * @param {string[]} headerRow
 * @returns {Record<string, number>}
 */
function buildHeaderIndex(headerRow) {
  /** @type {Record<string, number>} */
  const index = {};
  headerRow.forEach((label, colIdx) => {
    const key = String(label).trim();
    if (key) {
      index[key] = colIdx;
    }
  });
  return index;
}

/**
 * @param {unknown[]} row
 * @param {Record<string, number>} headerIndex
 * @param {string} header
 * @returns {unknown}
 */
function getCell(row, headerIndex, header) {
  const idx = headerIndex[header];
  if (idx === undefined) {
    return undefined;
  }
  return row[idx];
}

/**
 * Parses SAP-exported Excel (first sheet, header row 1, data from row 2).
 * @param {Buffer} buffer
 * @returns {{ sheetName: string, rows: object[], totalDataRows: number }}
 */
export function parseSAPExcel(buffer) {
  const workbook = XLSX.read(buffer, { type: "buffer" });
  const sheetName = workbook.SheetNames[0];

  if (!sheetName) {
    throw ApiError.badRequest("Uploaded file contains no sheets");
  }

  const sheet = workbook.Sheets[sheetName];
  const matrix = XLSX.utils.sheet_to_json(sheet, {
    header: 1,
    defval: "",
    raw: true,
  });

  if (!matrix.length) {
    throw ApiError.badRequest("Uploaded file is empty");
  }

  const headerRow = matrix[0].map((h) => String(h).trim());
  const headerIndex = buildHeaderIndex(headerRow);

  const missing = SAP_EXCEL_HEADERS.filter((h) => headerIndex[h] === undefined);
  if (missing.length) {
    throw ApiError.badRequest(
      `Missing required Excel columns: ${missing.join(", ")}`
    );
  }

  /** @type {object[]} */
  const rows = [];

  for (let i = 1; i < matrix.length; i += 1) {
    const row = matrix[i];
    if (!Array.isArray(row) || isEmptyDataRow(row)) {
      continue;
    }

    const poDateCell = getCell(row, headerIndex, "PO Date");
    const poDateRaw =
      typeof poDateCell === "number"
        ? Math.trunc(poDateCell)
        : Number.parseInt(cellToString(poDateCell), 10);

    rows.push({
      rowNumber: i + 1,
      sr_no: getCell(row, headerIndex, "SR.NO"),
      vendor_code: cellToString(getCell(row, headerIndex, "Vendor Code")),
      po_number: cellToString(getCell(row, headerIndex, "PO Number")),
      po_date_raw: Number.isFinite(poDateRaw) ? poDateRaw : NaN,
      plant_code: cellToString(getCell(row, headerIndex, "Plant")),
      line_no: getCell(row, headerIndex, "PO Line Number"),
      material_code: cellToString(getCell(row, headerIndex, "Material Code")),
      item_description: cellToString(
        getCell(row, headerIndex, "Item Description")
      ),
      ordered_qty: getCell(row, headerIndex, "PO Qty"),
      uom: cellToString(getCell(row, headerIndex, "UOM")),
      storage_location_raw: cellToString(
        getCell(row, headerIndex, "Item Store Location")
      ),
      balance_qty_from_sap: getCell(row, headerIndex, "Balance PO Qty"),
    });
  }

  if (!rows.length) {
    throw ApiError.badRequest("Uploaded file contains no data rows");
  }

  return { sheetName, rows, totalDataRows: rows.length };
}
