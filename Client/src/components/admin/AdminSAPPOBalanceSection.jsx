import { useEffect, useMemo, useState } from "react";
import { useAdminPOBalance } from "../../hooks/queries/useAdminPOBalance.js";
import { useAdminVendorsLookupQuery } from "../../hooks/queries/useAdminVendorsQuery.js";
import { ApiErrorState } from "../vendor/ApiErrorState.jsx";
import { POStatusBadge } from "../vendor/POStatusBadge.jsx";
import { Button } from "../ui/Button.jsx";
import { Input } from "../ui/Input.jsx";
import { useDebounce } from "../../hooks/useDebounce.js";
import { parseApiError } from "../../api/errors.js";
import { downloadCsv } from "../../lib/csvExport.js";
import { formatCurrency, formatDate, formatDateSap } from "../../lib/format.js";
import { cn } from "../../lib/cn.js";

const LIST_PAGE_SIZE = 100;

const EXPORT_HEADERS = [
  "Plant",
  "PO Number",
  "PO Date",
  "Vendor",
  "Vendor Name",
  "Line",
  "Material",
  "Description",
  "PO Qty",
  "UOM",
  "Store",
  "Dispatched",
  "Balance",
  "Status",
];

/**
 * @param {object} row
 */
function lineKey(row) {
  return `${row.po_number}-${row.line_no}`;
}

/**
 * @param {object} row
 */
function canInvoiceLine(row) {
  return (
    Number(row.balance_qty) > 0.001 &&
    ["open", "partially_invoiced"].includes(row.po_status)
  );
}

/**
 * @param {object} row
 */
function rowMatchesGlobalSearch(row, term) {
  const haystack = [
    row.plant_code,
    row.po_number,
    row.po_date,
    row.vendor_code_sap,
    row.vendor_code,
    row.vendor_name,
    row.line_no,
    row.material_code,
    row.item_description,
    row.po_qty,
    row.uom,
    row.store_location,
    row.dispatched_qty,
    row.balance_qty,
    row.po_status,
  ]
    .map((v) => String(v ?? "").toLowerCase())
    .join(" ");
  return haystack.includes(term);
}

/**
 * SAP-style PO line grid with optional merge-rows + search toolbar + CSV export.
 * @param {object} props
 * @param {string} [props.title]
 * @param {string} [props.description]
 * @param {boolean} [props.groupByPo]
 * @param {boolean} [props.showToolbar]
 * @param {string} [props.exportFilename]
 * @param {string} [props.emptyMessage]
 * @param {boolean} [props.enableInvoiceGenerate]
 * @param {(rows: object[]) => void} [props.onGenerateLines]
 * @param {number} [props.selectionResetKey]
 */
export function AdminSAPPOBalanceSection({
  title = "SAP purchase order lines",
  description = "Line-level data from BAR-code Excel uploads — same view as SAP purchasing documents.",
  groupByPo = true,
  showToolbar = false,
  exportFilename = "sap-po-lines.csv",
  emptyMessage = "No PO lines found. Upload SAP Excel from Purchase Orders.",
  enableInvoiceGenerate = false,
  onGenerateLines,
  selectionResetKey = 0,
}) {
  const [vendorFilter, setVendorFilter] = useState("");
  const [tableSearch, setTableSearch] = useState("");
  const [poFilter, setPoFilter] = useState("");
  const [materialFilter, setMaterialFilter] = useState("");
  const [selectedKeys, setSelectedKeys] = useState(() => new Set());
  const [selectionPo, setSelectionPo] = useState(null);

  const debouncedTableSearch = useDebounce(tableSearch, 200);
  const debouncedPoFilter = useDebounce(poFilter, 200);
  const debouncedMaterialFilter = useDebounce(materialFilter, 200);

  const listParams = useMemo(
    () => ({
      pageSize: LIST_PAGE_SIZE,
      vendor_code: vendorFilter || undefined,
    }),
    [vendorFilter]
  );

  const { data, isLoading, error, refetch, isFetching } = useAdminPOBalance(listParams);
  const { data: vendorsData } = useAdminVendorsLookupQuery();

  const vendors = vendorsData?.vendors ?? [];
  const lines = data?.lines ?? [];

  const filteredLines = useMemo(() => {
    let rows = lines;

    const globalTerm = debouncedTableSearch.trim().toLowerCase();
    if (globalTerm) {
      rows = rows.filter((row) => rowMatchesGlobalSearch(row, globalTerm));
    }

    const poTerm = debouncedPoFilter.trim().toLowerCase();
    if (poTerm) {
      rows = rows.filter((row) =>
        String(row.po_number ?? "").toLowerCase().includes(poTerm)
      );
    }

    const matTerm = debouncedMaterialFilter.trim().toLowerCase();
    if (matTerm) {
      rows = rows.filter(
        (row) =>
          String(row.material_code ?? "").toLowerCase().includes(matTerm) ||
          String(row.item_description ?? "").toLowerCase().includes(matTerm)
      );
    }

    return rows;
  }, [lines, debouncedTableSearch, debouncedPoFilter, debouncedMaterialFilter]);

  const poGroups = useMemo(() => {
    if (!groupByPo) {
      return filteredLines.map((row) => [row]);
    }
    const map = new Map();
    for (const row of filteredLines) {
      const key = String(row.po_number);
      if (!map.has(key)) {
        map.set(key, []);
      }
      map.get(key).push(row);
    }
    return [...map.values()].map((group) =>
      group.sort((a, b) => Number(a.line_no) - Number(b.line_no))
    );
  }, [filteredLines, groupByPo]);

  const selectedLines = useMemo(
    () => filteredLines.filter((row) => selectedKeys.has(lineKey(row))),
    [filteredLines, selectedKeys]
  );

  const toggleLineSelection = (row) => {
    if (!canInvoiceLine(row)) return;

    const key = lineKey(row);
    setSelectedKeys((prev) => {
      const next = new Set(prev);

      if (next.has(key)) {
        next.delete(key);
        if (next.size === 0) {
          setSelectionPo(null);
        }
        return next;
      }

      if (selectionPo && selectionPo !== row.po_number) {
        setSelectionPo(row.po_number);
        return new Set([key]);
      }

      setSelectionPo(row.po_number);
      next.add(key);
      return next;
    });
  };

  const toggleGroupSelection = (group) => {
    const invoiceable = group.filter(canInvoiceLine);
    if (!invoiceable.length) return;

    const keys = invoiceable.map(lineKey);
    const allSelected = keys.every((key) => selectedKeys.has(key));

    if (allSelected) {
      setSelectedKeys((prev) => {
        const next = new Set(prev);
        keys.forEach((key) => next.delete(key));
        if (next.size === 0) {
          setSelectionPo(null);
        }
        return next;
      });
      return;
    }

    setSelectionPo(invoiceable[0].po_number);
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      if (selectionPo && selectionPo !== invoiceable[0].po_number) {
        next.clear();
      }
      keys.forEach((key) => next.add(key));
      return next;
    });
  };

  const clearSelection = () => {
    setSelectedKeys(new Set());
    setSelectionPo(null);
  };

  useEffect(() => {
    if (selectionResetKey > 0) {
      clearSelection();
    }
  }, [selectionResetKey]);

  const handleExportCsv = () => {
    const rows = filteredLines.map((row) => [
      row.plant_code,
      row.po_number,
      formatDateSap(row.po_date),
      row.vendor_code_sap ?? row.vendor_code,
      row.vendor_name,
      row.line_no,
      row.material_code,
      row.item_description,
      row.po_qty,
      row.uom,
      row.store_location ?? "",
      row.dispatched_qty,
      row.balance_qty,
      row.po_status,
    ]);
    downloadCsv(exportFilename, EXPORT_HEADERS, rows);
  };

  if (error && !lines.length && !isLoading) {
    return (
      <ApiErrorState
        message={parseApiError(error).message}
        onRetry={() => refetch()}
        retrying={isFetching}
      />
    );
  }

  return (
    <section className="space-y-3">
      {description && <p className="text-xs text-slate-500">{description}</p>}
      {enableInvoiceGenerate && (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs text-accent">
            Select one or more materials from the same PO, then generate a combined invoice and PDF.
          </p>
          {selectedLines.length > 0 && (
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-600">
                {selectedLines.length} selected · PO {selectionPo}
              </span>
              <Button type="button" variant="secondary" size="sm" onClick={clearSelection}>
                Clear
              </Button>
              <Button
                type="button"
                size="sm"
                onClick={() => onGenerateLines?.(selectedLines)}
              >
                Generate invoice ({selectedLines.length})
              </Button>
            </div>
          )}
        </div>
      )}

      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-[180px]">
          <label className="mb-1 block text-xs font-medium text-slate-600">Vendor</label>
          <select
            className="h-10 w-full rounded-lg border border-slate-200 px-3 text-sm"
            value={vendorFilter}
            onChange={(e) => setVendorFilter(e.target.value)}
          >
            <option value="">All vendors</option>
            {vendors.map((v) => (
              <option key={v.vendorCode} value={v.vendorCode}>
                {v.vendorCodeSap ?? v.vendorCode} — {v.vendorName}
              </option>
            ))}
          </select>
        </div>

        {showToolbar && (
          <>
            <div className="min-w-[200px] flex-1">
              <Input
                label="Search table"
                placeholder="Filter all columns…"
                value={tableSearch}
                onChange={(e) => setTableSearch(e.target.value)}
                className="text-sm"
              />
            </div>
            <div className="min-w-[140px]">
              <Input
                label="PO #"
                placeholder="Filter…"
                value={poFilter}
                onChange={(e) => setPoFilter(e.target.value)}
                className="text-sm"
              />
            </div>
            <div className="min-w-[140px]">
              <Input
                label="Material"
                placeholder="Filter…"
                value={materialFilter}
                onChange={(e) => setMaterialFilter(e.target.value)}
                className="text-sm"
              />
            </div>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              className="mb-0.5"
              onClick={handleExportCsv}
              disabled={!filteredLines.length}
            >
              Export CSV
            </Button>
          </>
        )}
      </div>

      <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
        <div className="border-b border-slate-100 px-4 py-3 flex justify-between items-center">
          <h2 className="text-sm font-semibold text-navy">{title}</h2>
          <span className="text-xs text-slate-500">
            {filteredLines.length} line{filteredLines.length === 1 ? "" : "s"}
            {isFetching && !isLoading ? " · refreshing…" : ""}
          </span>
        </div>

        {isLoading && !lines.length ? (
          <p className="p-8 text-center text-sm text-slate-500">Loading…</p>
        ) : filteredLines.length === 0 ? (
          <p className="p-8 text-center text-sm text-slate-500">{emptyMessage}</p>
        ) : (
          <div className="overflow-x-auto max-h-[55vh]">
            <table className="min-w-full text-xs border-collapse">
              <thead className="bg-slate-50 text-left font-semibold uppercase text-slate-600 sticky top-0 z-10">
                <tr>
                  {enableInvoiceGenerate && (
                    <th className="px-2 py-2 border-b border-slate-200 w-10" aria-label="Select" />
                  )}
                  <th className="px-2 py-2 border-b border-slate-200">Plant</th>
                  <th className="px-2 py-2 border-b border-slate-200">PO Number</th>
                  <th className="px-2 py-2 border-b border-slate-200">PO Date</th>
                  <th className="px-2 py-2 border-b border-slate-200">Vendor</th>
                  <th className="px-2 py-2 border-b border-slate-200">Vendor Name</th>
                  <th className="px-2 py-2 border-b border-slate-200">Line</th>
                  <th className="px-2 py-2 border-b border-slate-200">Material</th>
                  <th className="px-2 py-2 border-b border-slate-200">Description</th>
                  <th className="px-2 py-2 border-b border-slate-200 text-right">PO Qty</th>
                  <th className="px-2 py-2 border-b border-slate-200">UOM</th>
                  <th className="px-2 py-2 border-b border-slate-200 text-right">Price</th>
                  <th className="px-2 py-2 border-b border-slate-200">Store</th>
                  <th className="px-2 py-2 border-b border-slate-200 text-right">Dispatched</th>
                  <th className="px-2 py-2 border-b border-slate-200 text-right">Balance</th>
                  <th className="px-2 py-2 border-b border-slate-200">Status</th>
                </tr>
              </thead>
              <tbody>
                {poGroups.map((group) =>
                  group.map((row, idx) => {
                    const complete = Number(row.balance_qty) <= 0.001;
                    const isFirst = idx === 0;
                    const rowSpan = group.length;
                    const mergedCell =
                      "px-2 py-2 align-top bg-slate-50/40 border-b border-slate-100";
                    const canInvoice = enableInvoiceGenerate && canInvoiceLine(row);
                    const isSelected = selectedKeys.has(lineKey(row));

                    return (
                      <tr
                        key={`${row.po_number}-${row.line_no}`}
                        className={cn(
                          "hover:bg-slate-50/80",
                          complete && "text-slate-500",
                          canInvoice && "cursor-pointer hover:bg-accent/5",
                          isSelected && "bg-accent/5"
                        )}
                        onClick={canInvoice ? () => toggleLineSelection(row) : undefined}
                        title={canInvoice ? "Select material for invoice" : undefined}
                      >
                        {enableInvoiceGenerate && (
                          <td className="px-2 py-2 border-b border-slate-100 text-center align-middle">
                            {canInvoice ? (
                              <input
                                type="checkbox"
                                className="h-4 w-4 rounded border-slate-300"
                                checked={isSelected}
                                onChange={(e) => {
                                  e.stopPropagation();
                                  toggleLineSelection(row);
                                }}
                                onClick={(e) => e.stopPropagation()}
                                aria-label={`Select line ${row.line_no}`}
                              />
                            ) : null}
                          </td>
                        )}

                        {groupByPo && isFirst ? (
                          <>
                            <td rowSpan={rowSpan} className={mergedCell}>
                              {row.plant_code}
                            </td>
                            <td rowSpan={rowSpan} className={cn(mergedCell, "font-mono font-medium")}>
                              <div className="flex flex-col gap-1">
                                <span>{row.po_number}</span>
                                {enableInvoiceGenerate && group.filter(canInvoiceLine).length > 1 && (
                                  <button
                                    type="button"
                                    className="text-[10px] font-normal text-accent underline"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      toggleGroupSelection(group);
                                    }}
                                  >
                                    {group
                                      .filter(canInvoiceLine)
                                      .every((line) => selectedKeys.has(lineKey(line)))
                                      ? "Deselect all"
                                      : "Select all lines"}
                                  </button>
                                )}
                              </div>
                            </td>
                            <td rowSpan={rowSpan} className={cn(mergedCell, "whitespace-nowrap")}>
                              {formatDate(row.po_date)}
                            </td>
                            <td rowSpan={rowSpan} className={cn(mergedCell, "font-mono")}>
                              {row.vendor_code_sap ?? row.vendor_code}
                            </td>
                            <td
                              rowSpan={rowSpan}
                              className={cn(mergedCell, "max-w-[140px]")}
                              title={row.vendor_name}
                            >
                              {row.vendor_name}
                            </td>
                          </>
                        ) : !groupByPo ? (
                          <>
                            <td className="px-2 py-2 border-b border-slate-100">{row.plant_code}</td>
                            <td className="px-2 py-2 border-b border-slate-100 font-mono font-medium">
                              {row.po_number}
                            </td>
                            <td className="px-2 py-2 border-b border-slate-100 whitespace-nowrap">
                              {formatDate(row.po_date)}
                            </td>
                            <td className="px-2 py-2 border-b border-slate-100 font-mono">
                              {row.vendor_code_sap ?? row.vendor_code}
                            </td>
                            <td
                              className="px-2 py-2 border-b border-slate-100 max-w-[140px] truncate"
                              title={row.vendor_name}
                            >
                              {row.vendor_name}
                            </td>
                          </>
                        ) : null}

                        <td className="px-2 py-2 border-b border-slate-100 tabular-nums">
                          {row.line_no}
                        </td>
                        <td className="px-2 py-2 border-b border-slate-100 font-mono">
                          {row.material_code}
                        </td>
                        <td
                          className="px-2 py-2 border-b border-slate-100 max-w-[180px] truncate"
                          title={row.item_description}
                        >
                          {row.item_description}
                        </td>
                        <td className="px-2 py-2 border-b border-slate-100 text-right tabular-nums">
                          {Number(row.po_qty).toLocaleString()}
                        </td>
                        <td className="px-2 py-2 border-b border-slate-100">{row.uom}</td>
                        <td className="px-2 py-2 border-b border-slate-100 text-right tabular-nums">
                          {formatCurrency(row.unit_price ?? 0)}
                        </td>
                        <td className="px-2 py-2 border-b border-slate-100">
                          {row.store_location ?? "—"}
                        </td>
                        <td className="px-2 py-2 border-b border-slate-100 text-right tabular-nums">
                          {Number(row.dispatched_qty).toLocaleString()}
                        </td>
                        <td className="px-2 py-2 border-b border-slate-100 text-right tabular-nums font-medium text-amber-800">
                          {Number(row.balance_qty).toLocaleString()}
                        </td>
                        {groupByPo && isFirst ? (
                          <td rowSpan={rowSpan} className={cn(mergedCell, "align-middle")}>
                            <POStatusBadge status={row.po_status} />
                          </td>
                        ) : !groupByPo ? (
                          <td className="px-2 py-2 border-b border-slate-100">
                            <POStatusBadge status={row.po_status} />
                          </td>
                        ) : null}
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}
