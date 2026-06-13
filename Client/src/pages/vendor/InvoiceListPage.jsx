import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { parseApiError } from "../../api/errors.js";
import { ApiErrorState } from "../../components/vendor/ApiErrorState.jsx";
import { InvoiceStatusBadge } from "../../components/vendor/InvoiceStatusBadge.jsx";
import { Button } from "../../components/ui/Button.jsx";
import { Input } from "../../components/ui/Input.jsx";
import { VirtualTable } from "../../components/ui/VirtualTable.jsx";
import { useDebounce } from "../../hooks/useDebounce.js";
import { useVendorInvoicesInfinite } from "../../hooks/queries/useVendorInvoicesInfinite.js";
import { formatDate } from "../../lib/format.js";
import { openInvoicePrintTab } from "../../lib/printUrls.js";

const STATUS_OPTIONS = [
  { value: "", label: "All statuses" },
  { value: "draft", label: "Draft" },
  { value: "submitted", label: "Submitted" },
  { value: "qr_generated", label: "QR Generated" },
  { value: "verified", label: "Verified" },
  { value: "rejected", label: "Rejected" },
];

export function InvoiceListPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [search, setSearch] = useState(searchParams.get("search") ?? "");
  const debouncedSearch = useDebounce(search, 300);
  const [status, setStatus] = useState(searchParams.get("status") ?? "");
  const [dateFrom, setDateFrom] = useState(searchParams.get("dateFrom") ?? "");
  const [dateTo, setDateTo] = useState(searchParams.get("dateTo") ?? "");

  const filters = useMemo(
    () => ({ status, search: debouncedSearch, dateFrom, dateTo }),
    [status, debouncedSearch, dateFrom, dateTo]
  );

  const { data, isLoading, isError, error, fetchNextPage, hasNextPage, isFetchingNextPage } =
    useVendorInvoicesInfinite(filters);

  const invoices = useMemo(
    () => data?.pages.flatMap((p) => p.invoices ?? []) ?? [],
    [data]
  );

  const totalCount = data?.pages[0]?.totalCount ?? invoices.length;

  useEffect(() => {
    const next = new URLSearchParams();
    if (status) next.set("status", status);
    if (debouncedSearch) next.set("search", debouncedSearch);
    if (dateFrom) next.set("dateFrom", dateFrom);
    if (dateTo) next.set("dateTo", dateTo);
    setSearchParams(next, { replace: true });
  }, [status, debouncedSearch, dateFrom, dateTo, setSearchParams]);

  if (isError && invoices.length === 0) {
    return <ApiErrorState message={parseApiError(error).message} onRetry={() => fetchNextPage()} />;
  }

  const tableHeader = (
    <div className="grid grid-cols-[1.1fr_1fr_0.9fr_0.9fr_1fr_0.5fr_1.2fr] gap-2 border-b border-slate-100 bg-slate-50 px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-600">
      {["Invoice #", "System ID", "PO", "Date", "Status", "Lines", "Actions"].map((h) => (
        <span key={h}>{h}</span>
      ))}
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-navy">My Invoices</h2>
          <p className="text-sm text-slate-500">Track drafts, submissions, and QR codes</p>
        </div>
        <Link to="/invoices/create" className="inline-flex shrink-0">
          <Button type="button">Create invoice</Button>
        </Link>
      </div>

      <div className="grid gap-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:grid-cols-2 lg:grid-cols-4">
        <Input
          label="Search invoice number"
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <div>
          <label htmlFor="inv-status" className="mb-1.5 block text-sm font-medium text-slate-700">
            Status
          </label>
          <select
            id="inv-status"
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm"
          >
            {STATUS_OPTIONS.map((opt) => (
              <option key={opt.value || "all"} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
        <Input label="From" type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
        <Input label="To" type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
      </div>

      {isLoading && invoices.length === 0 ? (
        <p className="text-sm text-slate-500">Loading invoices…</p>
      ) : invoices.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white px-6 py-16 text-center">
          <p className="text-base font-medium text-navy">Create your first invoice</p>
          <Link to="/invoices/create" className="mt-4 inline-flex">
            <Button type="button">Create invoice</Button>
          </Link>
        </div>
      ) : (
        <>
          <VirtualTable
            rowCount={invoices.length}
            maxHeight={520}
            header={tableHeader}
            renderRow={(index) => {
              const inv = invoices[index];
              const canPrint =
                inv.status === "qr_generated" ||
                inv.status === "verified" ||
                inv.qrGenerated;

              return (
                <div className="grid grid-cols-[1.1fr_1fr_0.9fr_0.9fr_1fr_0.5fr_1.2fr] items-center gap-2 border-b border-slate-50 px-4 py-2.5 text-sm hover:bg-slate-50/80">
                  <span className="font-medium text-navy">{inv.invoiceNumber}</span>
                  <span className="font-mono text-xs text-slate-600">{inv.systemInvoiceId}</span>
                  <span className="font-mono text-xs">{inv.poNumber}</span>
                  <span>{formatDate(inv.invoiceDate)}</span>
                  <div className="min-w-0">
                    <InvoiceStatusBadge status={inv.status} />
                    {inv.status === "rejected" && inv.rejectionReason ? (
                      <p
                        className="mt-1 line-clamp-2 text-xs text-red-700"
                        title={inv.rejectionReason}
                      >
                        {inv.rejectionReason}
                      </p>
                    ) : null}
                  </div>
                  <span className="tabular-nums">{inv.lineCount ?? "—"}</span>
                  <div className="flex flex-wrap gap-1">
                    <Link to={`/invoices/${inv.invoiceId}`}>
                      <Button type="button" variant="ghost" size="sm">
                        View
                      </Button>
                    </Link>
                    {canPrint && (
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        onClick={() => openInvoicePrintTab(inv.invoiceId, true)}
                      >
                        Print
                      </Button>
                    )}
                  </div>
                </div>
              );
            }}
          />
          <div className="flex items-center justify-between text-sm text-slate-600">
            <span>
              Showing {invoices.length} of {totalCount} loaded
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
