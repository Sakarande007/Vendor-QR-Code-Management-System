import * as XLSX from "xlsx";
import { ApiError } from "./ApiError.js";

/**
 * Normalizes a flat row (CSV/Excel) into ERP sync PO shape.
 * @param {Record<string, unknown>} row
 * @returns {object|null}
 */
function mapFlatRow(row) {
  const get = (...keys) => {
    for (const key of keys) {
      const found = Object.keys(row).find(
        (k) => k.toLowerCase().replace(/[\s_]/g, "") === key.toLowerCase()
      );
      if (found !== undefined && row[found] !== "" && row[found] != null) {
        return row[found];
      }
    }
    return undefined;
  };

  const poNumber = get("ponumber", "po");
  const lineNo = get("lineno", "linenumber", "line");
  const materialCode = get("materialcode", "material");
  const orderedQty = get("orderedqty", "orderedquantity");
  const uom = get("uom", "unit");

  if (!poNumber || !lineNo || !materialCode || orderedQty === undefined || !uom) {
    return null;
  }

  return {
    poNumber: String(poNumber).trim(),
    vendorCode: String(get("vendorcode", "vendor") ?? "").trim(),
    poDate: get("podate", "date"),
    plantCode: String(get("plantcode", "plant") ?? "").trim(),
    lineNo: Number(lineNo),
    materialCode: String(materialCode).trim(),
    orderedQty: Number(orderedQty),
    receivedQty: Number(get("receivedqty", "receivedquantity") ?? 0),
    uom: String(uom).trim(),
    storageLocationCode: get("storagelocationcode", "storagelocation")
      ? String(get("storagelocationcode", "storagelocation")).trim()
      : null,
    unitPrice: Number(get("unitprice", "price") ?? 0),
    totalValue: Number(get("totalvalue", "total") ?? 0),
    currency: get("currency") ? String(get("currency")).trim() : "INR",
  };
}

/**
 * Groups flat rows into purchaseOrders array for sync.
 * @param {Record<string, unknown>[]} flatRows
 * @returns {object[]}
 */
function groupFlatRows(flatRows) {
  /** @type {Map<string, object>} */
  const poMap = new Map();

  flatRows.forEach((row) => {
    const mapped = mapFlatRow(row);
    if (!mapped) {
      return;
    }

    if (!poMap.has(mapped.poNumber)) {
      poMap.set(mapped.poNumber, {
        poNumber: mapped.poNumber,
        vendorCode: mapped.vendorCode,
        poDate: mapped.poDate,
        plantCode: mapped.plantCode,
        totalValue: mapped.totalValue,
        currency: mapped.currency,
        lines: [],
      });
    }

    const po = poMap.get(mapped.poNumber);
    po.lines.push({
      lineNo: mapped.lineNo,
      materialCode: mapped.materialCode,
      orderedQty: mapped.orderedQty,
      receivedQty: mapped.receivedQty,
      uom: mapped.uom,
      storageLocationCode: mapped.storageLocationCode,
      unitPrice: mapped.unitPrice,
    });
  });

  return Array.from(poMap.values());
}

/**
 * Parses uploaded Excel or CSV buffer into purchaseOrders structure.
 * @param {Buffer} buffer
 * @param {string} mimetype
 * @param {string} originalname
 * @returns {object[]}
 */
export function parsePOUploadFile(buffer, mimetype, originalname) {
  const isCsv =
    mimetype === "text/csv" ||
    originalname.toLowerCase().endsWith(".csv");

  const workbook = isCsv
    ? XLSX.read(buffer.toString("utf8"), { type: "string" })
    : XLSX.read(buffer, { type: "buffer" });

  const sheetName = workbook.SheetNames[0];
  if (!sheetName) {
    throw ApiError.badRequest("Uploaded file contains no sheets");
  }

  const rows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], {
    defval: "",
  });

  if (!rows.length) {
    throw ApiError.badRequest("Uploaded file contains no data rows");
  }

  const purchaseOrders = groupFlatRows(rows);

  if (!purchaseOrders.length) {
    throw ApiError.badRequest(
      "Could not parse PO rows — ensure columns include poNumber, vendorCode, poDate, plantCode, lineNo, materialCode, orderedQty, uom"
    );
  }

  return purchaseOrders;
}
