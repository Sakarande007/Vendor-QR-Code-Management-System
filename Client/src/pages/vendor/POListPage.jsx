import { useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { parseApiError } from "../../api/errors.js";
import { ApiErrorState } from "../../components/vendor/ApiErrorState.jsx";
import { POStatusBadge } from "../../components/vendor/POStatusBadge.jsx";
import { Button } from "../../components/ui/Button.jsx";
import { Input } from "../../components/ui/Input.jsx";
import { VirtualTable } from "../../components/ui/VirtualTable.jsx";
import { useDebounce } from "../../hooks/useDebounce.js";
import { useVendorPOsInfinite } from "../../hooks/queries/useVendorPOsInfinite.js";
import { formatDate } from "../../lib/format.js";

const STATUS_OPTIONS = [
  { value: "", label: "All" },
  { value: "open", label: "Open" },
  { value: "partially_invoiced", label: "Partially Invoiced" },
];

function canCreateInvoice(status) {
  return status === "open" || status === "partially_invoiced";
}

export function POListPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const statusFilter = searchParams.get("status") || "";
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebounce(search, 300);

  const filters = useMemo(
    () => ({ status: statusFilter, search: debouncedSearch }),
    [statusFilter, debouncedSearch]
  );

  const { data, isLoading, isError, error, fetchNextPage, hasNextPage, isFetchingNextPage } =
    useVendorPOsInfinite(filters);

  const purchaseOrders = useMemo(
    () => data?.pages.flatMap((p) => p.purchaseOrders ?? []) ?? [],
    [data]
  );

  const totalCount = data?.pages[0]?.totalCount ?? purchaseOrders.length;

  const handleStatusChange = (e) => {
    const value = e.target.value;
    const next = new URLSearchParams(searchParams);
    if (value) next.set("status", value);
    else next.delete("status");
    setSearchParams(next);
  };

  if (isError && purchaseOrders.length === 0) {
    return (
      <ApiErrorState
        message={parseApiError(error).message}
        onRetry={() => window.location.reload()}
      />
    );
  }

  const tableHeader = (
    <div className="grid grid-cols-[1.2fr_1fr_1fr_1fr_0.6fr_1.2fr] gap-2 border-b border-slate-100 bg-slate-50 px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-600">
      {["PO Number", "PO Date", "Plant", "Status", "Lines", "Action"].map((h) => (
        <span key={h}>{h}</span>
      ))}
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end">
        <div className="w-full sm:max-w-xs">
          <Input
            label="Search by PO number"
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="e.g. PO-2024-001"
          />
        </div>
        <div className="w-full sm:w-48">
          <label htmlFor="po-status-filter" className="mb-1.5 block text-sm font-medium text-slate-700">
            Status
          </label>
          <select
            id="po-status-filter"
            value={statusFilter}
            onChange={handleStatusChange}
            className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-navy focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/30"
          >
            {STATUS_OPTIONS.map((opt) => (
              <option key={opt.value || "all"} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {isLoading && purchaseOrders.length === 0 ? (
        <p className="text-sm text-slate-500">Loading purchase orders…</p>
      ) : purchaseOrders.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white px-6 py-16 text-center">
          <p className="text-base font-medium text-navy">No purchase orders found</p>
        </div>
      ) : (
        <>
          <VirtualTable
            rowCount={purchaseOrders.length}
            maxHeight={520}
            header={tableHeader}
            emptyMessage="No purchase orders"
            renderRow={(index) => {
              const po = purchaseOrders[index];
              return (
                <div className="grid grid-cols-[1.2fr_1fr_1fr_1fr_0.6fr_1.2fr] items-center gap-2 border-b border-slate-50 px-4 py-2.5 text-sm hover:bg-slate-50/80">
                  <Link
                    to={`/pos/${encodeURIComponent(po.poNumber)}`}
                    className="font-medium text-accent hover:underline"
                  >
                    {po.poNumber}
                  </Link>
                  <span>{formatDate(po.poDate)}</span>
                  <span className="truncate">{po.plantName || po.plantCode}</span>
                  <POStatusBadge status={po.status} />
                  <span className="tabular-nums">{po.lineCount}</span>
                  <div className="flex gap-1">
                    <Link to={`/pos/${encodeURIComponent(po.poNumber)}`}>
                      <Button type="button" variant="ghost" size="sm">
                        View
                      </Button>
                    </Link>
                    {canCreateInvoice(po.status) && (
                      <Link to={`/invoices/create?po=${encodeURIComponent(po.poNumber)}`}>
                        <Button type="button" size="sm">
                          Invoice
                        </Button>
                      </Link>
                    )}
                  </div>
                </div>
              );
            }}
          />

          <div className="flex items-center justify-between text-sm text-slate-600">
            <span>
              Showing {purchaseOrders.length} of {totalCount} loaded
            </span>
            {hasNextPage && (
              <Button
                type="button"
                variant="secondary"
                size="sm"
                loading={isFetchingNextPage}
                onClick={() => fetchNextPage()}
              >
                Load more
              </Button>
            )}
          </div>
        </>
      )}
    </div>
  );
}
