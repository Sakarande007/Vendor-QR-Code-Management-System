import { cn } from "../../lib/cn.js";
import { Spinner } from "./Spinner.jsx";

/**
 * @typedef {{ key: string, label: string, sortable?: boolean, className?: string }} TableColumn
 */

/**
 * @param {object} props
 * @param {TableColumn[]} props.columns
 * @param {Record<string, unknown>[]} [props.data]
 * @param {boolean} [props.loading]
 * @param {number} [props.skeletonRows]
 * @param {string|null} [props.sortKey]
 * @param {'asc'|'desc'} [props.sortDir]
 * @param {(key: string) => void} [props.onSort]
 * @param {(row: Record<string, unknown>, index: number) => import('react').ReactNode} props.renderRow
 * @param {string} [props.emptyMessage]
 * @param {string} [props.caption]
 */
export function Table({
  columns,
  data = [],
  loading = false,
  skeletonRows = 5,
  sortKey,
  sortDir = "asc",
  onSort,
  renderRow,
  emptyMessage = "No records found.",
  caption,
}) {
  if (loading) {
    return (
      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
        <table className="min-w-full divide-y divide-slate-200">
          {caption && <caption className="sr-only">{caption}</caption>}
          <thead className="bg-slate-50">
            <tr>
              {columns.map((col) => (
                <th
                  key={col.key}
                  scope="col"
                  className={cn(
                    "px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-600",
                    col.className
                  )}
                >
                  {col.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {Array.from({ length: skeletonRows }).map((_, i) => (
              <tr key={i} aria-hidden="true">
                {columns.map((col) => (
                  <td key={col.key} className="px-4 py-3">
                    <div className="h-4 animate-pulse rounded bg-slate-200" />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        <div className="flex items-center justify-center gap-2 border-t border-slate-100 py-4 text-sm text-slate-500">
          <Spinner size="sm" />
          Loading data…
        </div>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
      <table className="min-w-full divide-y divide-slate-200">
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
                    "px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-600",
                    col.className
                  )}
                >
                  {col.sortable && onSort ? (
                    <button
                      type="button"
                      onClick={() => onSort(col.key)}
                      className="inline-flex items-center gap-1 rounded hover:text-navy focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                      aria-sort={
                        isSorted ? (sortDir === "asc" ? "ascending" : "descending") : "none"
                      }
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
          {data.length === 0 ? (
            <tr>
              <td
                colSpan={columns.length}
                className="px-4 py-12 text-center text-sm text-slate-500"
              >
                {emptyMessage}
              </td>
            </tr>
          ) : (
            data.map((row, index) => renderRow(row, index))
          )}
        </tbody>
      </table>
    </div>
  );
}
