import { query } from "../config/db.js";

/**
 * Material master price wins when set; otherwise fall back to PO line price.
 * @param {number|null|undefined} materialUnitPrice
 * @param {number|null|undefined} poLineUnitPrice
 * @returns {number}
 */
export function resolveInvoiceUnitPrice(materialUnitPrice, poLineUnitPrice) {
  const material = Number(materialUnitPrice ?? 0);
  const poLine = Number(poLineUnitPrice ?? 0);
  if (material > 0) {
    return Math.round(material * 100) / 100;
  }
  return Math.round(poLine * 100) / 100;
}

/**
 * @param {string[]} materialCodes
 * @returns {Promise<Map<string, number>>}
 */
export async function getMaterialUnitPriceMap(materialCodes) {
  const unique = [...new Set(materialCodes.filter(Boolean))];
  if (!unique.length) {
    return new Map();
  }

  const placeholders = unique.map(() => "?").join(", ");
  const [rows] = await query(
    `SELECT material_code, unit_price FROM materials WHERE material_code IN (${placeholders})`,
    unique
  );

  return new Map(
    rows.map((row) => [row.material_code, Number(row.unit_price ?? 0)])
  );
}
