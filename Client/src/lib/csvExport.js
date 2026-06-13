/**
 * Trigger browser download of CSV from rows.
 * @param {string} filename
 * @param {string[]} headers
 * @param {unknown[][]} rows
 */
export function downloadCsv(filename, headers, rows) {
  const escape = (val) => {
    const s = val == null ? "" : String(val);
    if (/[",\n\r]/.test(s)) {
      return `"${s.replace(/"/g, '""')}"`;
    }
    return s;
  };

  const lines = [
    headers.map(escape).join(","),
    ...rows.map((row) => row.map(escape).join(",")),
  ];

  const blob = new Blob([`\uFEFF${lines.join("\r\n")}`], {
    type: "text/csv;charset=utf-8;",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}
