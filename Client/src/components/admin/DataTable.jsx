import { useMemo, useState } from "react";
import { cn } from "../../lib/cn.js";
import { Button } from "../ui/Button.jsx";
import { Input } from "../ui/Input.jsx";
import { Spinner } from "../ui/Spinner.jsx";
import { downloadCsv } from "../../lib/csvExport.js";

/**
 * @typedef {object} DataTableColumn
 * @property {string} key
 * @property {string} label
 * @property {boolean} [sortable]
 * @property {boolean} [filterable]
 * @property {string} [className]
 * @property {(row: Record<string, unknown>) => unknown} [accessor]
 * @property {(row: Record<string, unknown>) => import('react').ReactNode} [render]
 */

/**
 * @param {object} props
 * @param {DataTableColumn[]} props.columns
 * @param {Record<string, unknown>[]} props.data
 * @param {boolean} [props.loading]
 * @param {string} [props.emptyMessage]
 * @param {string} [props.caption]
 * @param {string} [props.exportFilename]
 * @param {boolean} [props.dense]
 * @param {object} [props.pagination]
 * @param {number} props.pagination.page
 * @param {number} props.pagination.pageSize
 * @param {number} props.pagination.totalCount
 * @param {boolean} [props.pagination.hasMore]
 * @param {boolean} [props.pagination.loading]
 * @param {() => void} [props.pagination.onPrevious]
 * @param {() => void} [props.pagination.onNext]
 * @param {(row: Record<string, unknown>, index: number) => import('react').ReactNode} [props.renderRow]
 */
export function DataTable({
  columns,
  data,
  loading = false,
  emptyMessage = "No records found.",
  caption,
  exportFilename = "export.csv",
  dense = true,
  pagination,
  renderRow,
}) {
  const [sortKey, setSortKey] = useState(null);
  const [sortDir, setSortDir] = useState("asc");
  const [globalFilter, setGlobalFilter] = useState("");
  const [columnFilters, setColumnFilters] = useState({});

  const cellPadding = dense ? "px-3 py-2" : "px-4 py-3";

  const getCellValue = (row, col) => {
    if (col.accessor) return col.accessor(row);
    return row[col.key];
  };

  const filteredData = useMemo(() => {
    let rows = [...data];

    if (globalFilter.trim()) {
      const q = globalFilter.toLowerCase();
      rows = rows.filter((row) =>
        columns.some((col) => {
          const v = getCellValue(row, col);
          return v != null && String(v).toLowerCase().includes(q);
        })
      );
    }

    for (const col of columns) {
      const f = columnFilters[col.key];
      if (f?.trim()) {
        const q = f.toLowerCase();
        rows = rows.filter((row) => {
          const v = getCellValue(row, col);
          return v != null && String(v).toLowerCase().includes(q);
        });
      }
    }

    if (sortKey) {
      const col = columns.find((c) => c.key === sortKey);
      rows.sort((a, b) => {
        const av = col ? getCellValue(a, col) : a[sortKey];
        const bv = col ? getCellValue(b, col) : b[sortKey];
        if (av == null && bv == null) return 0;
        if (av == null) return 1;
        if (bv == null) return -1;
        const cmp =
          typeof av === "number" && typeof bv === "number"
            ? av - bv
            : String(av).localeCompare(String(bv));
        return sortDir === "asc" ? cmp : -cmp;
      });
    }

    return rows;
  }, [data, columns, globalFilter, columnFilters, sortKey, sortDir]);

  const handleSort = (key) => {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  };

  const handleExport = () => {
    const headers = columns.map((c) => c.label);
    const rows = filteredData.map((row) =>
      columns.map((col) => {
        const v = getCellValue(row, col);
        return v == null ? "" : v;
      })
    );
    downloadCsv(exportFilename, headers, rows);
  };

  const filterableColumns = columns.filter((c) => c.filterable);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-[200px] flex-1">
          <Input
            label="Search table"
            placeholder="Filter all columns…"
            value={globalFilter}
            onChange={(e) => setGlobalFilter(e.target.value)}
            className="text-sm"
          />
        </div>
        {filterableColumns.slice(0, 2).map((col) => (
          <div key={col.key} className="min-w-[140px]">
            <Input
              label={col.label}
              placeholder="Filter…"
              value={columnFilters[col.key] ?? ""}
              onChange={(e) =>
                setColumnFilters((prev) => ({ ...prev, [col.key]: e.target.value }))
              }
              className="text-sm"
            />
          </div>
        ))}
        <Button type="button" variant="secondary" size="sm" onClick={handleExport} disabled={!filteredData.length}>
          Export CSV
        </Button>
      </div>

      <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white shadow-sm">
        <table className="min-w-full divide-y divide-slate-200 text-sm">
          {caption && <caption className="sr-only">{caption}</caption>}
          <thead className="bg-slate-50">
            <tr>
              {columns.map((col) => {
                const isSorted = sortKey === col.key;
                return (
                  <th
                    key={col.key}
                    scope="col"
                    className={cn(
                      cellPadding,
                      "text-left text-xs font-semibold uppercase tracking-wide text-slate-600",
                      col.className
                    )}
                  >
                    {col.sortable ? (
                      <button
                        type="button"
                        onClick={() => handleSort(col.key)}
                        className="inline-flex items-center gap-1 hover:text-navy"
                        aria-sort={isSorted ? (sortDir === "asc" ? "ascending" : "descending") : "none"}
                      >
                        {col.label}
                        <span className="text-slate-400" aria-hidden="true">
                          {isSorted ? (sortDir === "asc" ? "↑" : "↓") : "↕"}
                        </span>
                      </button>
                    ) : (
                      col.label
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {loading ? (
              <tr>
                <td colSpan={columns.length} className={cn(cellPadding, "text-center")}>
                  <Spinner size="sm" className="mx-auto" />
                  <span className="ml-2 text-slate-500">Loading…</span>
                </td>
              </tr>
            ) : filteredData.length === 0 ? (
              <tr>
                <td
                  colSpan={columns.length}
                  className={cn(cellPadding, "py-10 text-center text-slate-500")}
                >
                  {emptyMessage}
                </td>
              </tr>
            ) : (
              filteredData.map((row, index) =>
                renderRow ? (
                  renderRow(row, index)
                ) : (
                  <tr key={index} className="hover:bg-slate-50/80">
                    {columns.map((col) => (
                      <td key={col.key} className={cn(cellPadding, "text-slate-800", col.className)}>
                        {col.render ? col.render(row) : String(getCellValue(row, col) ?? "—")}
                      </td>
                    ))}
                  </tr>
                )
              )
            )}
          </tbody>
        </table>
      </div>

      {pagination && (
        <nav className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 pt-3">
          <p className="text-xs text-slate-600">
            {pagination.totalCount === 0
              ? "No results"
              : `Page ${pagination.page} · ${pagination.totalCount} total`}
          </p>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              disabled={pagination.page <= 1 || pagination.loading}
              onClick={pagination.onPrevious}
            >
              Previous
            </Button>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              disabled={!pagination.hasMore || pagination.loading}
              onClick={pagination.onNext}
            >
              Next
            </Button>
          </div>
        </nav>
      )}
    </div>
  );
}
