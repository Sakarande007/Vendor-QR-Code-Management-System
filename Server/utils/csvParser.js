/**
 * Parses a simple CSV (header row required) into material import rows.
 * @param {string} csvText
 * @returns {object[]}
 */
export function parseMaterialsCsv(csvText) {
  const lines = csvText
    .trim()
    .split(/\r?\n/)
    .filter((line) => line.trim().length > 0);

  if (lines.length < 2) {
    return [];
  }

  const headers = lines[0].split(",").map((h) => h.trim().replace(/^"|"$/g, ""));
  const headerMap = {
    materialcode: "materialCode",
    material_code: "materialCode",
    materialdescription: "materialDescription",
    material_description: "materialDescription",
    uom: "uom",
    materialtype: "materialType",
    material_type: "materialType",
    status: "status",
  };

  const normalizedHeaders = headers.map((h) => headerMap[h.toLowerCase().replace(/\s+/g, "")] ?? h);

  return lines.slice(1).map((line) => {
    const values = line.split(",").map((v) => v.trim().replace(/^"|"$/g, ""));
    /** @type {Record<string, string>} */
    const row = {};
    normalizedHeaders.forEach((key, i) => {
      if (values[i] !== undefined && values[i] !== "") {
        row[key] = values[i];
      }
    });
    return row;
  });
}
