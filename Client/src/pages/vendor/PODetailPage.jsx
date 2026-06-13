import { Link, useParams } from "react-router-dom";
import { parseApiError } from "../../api/errors.js";
import { ApiErrorState } from "../../components/vendor/ApiErrorState.jsx";
import { POLineTable } from "../../components/vendor/POLineTable.jsx";
import { POStatusBadge } from "../../components/vendor/POStatusBadge.jsx";
import { Button } from "../../components/ui/Button.jsx";
import { usePODetailQuery } from "../../hooks/queries/usePODetailQuery.js";
import { formatCurrency, formatDate } from "../../lib/format.js";

function HeaderSkeleton() {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm animate-pulse" aria-hidden="true">
      <div className="h-6 w-48 rounded bg-slate-200" />
      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-12 rounded bg-slate-100" />
        ))}
      </div>
    </div>
  );
}

export function PODetailPage() {
  const { poNumber } = useParams();
  const { data, isLoading, isError, error, refetch, isFetching } = usePODetailQuery(poNumber);

  if (isLoading && !data) {
    return (
      <div className="space-y-6">
        <Link to="/pos" className="inline-flex text-sm font-medium text-accent">
          ← Back to PO list
        </Link>
        <HeaderSkeleton />
        <POLineTable lines={[]} loading />
      </div>
    );
  }

  if (isError) {
    return (
      <ApiErrorState
        message={parseApiError(error).message}
        onRetry={() => refetch()}
        retrying={isFetching}
      />
    );
  }

  const header = data?.header;
  const lines = data?.lines ?? [];
  const summary = data?.summary;

  if (!header) {
    return null;
  }

  const canInvoice = header.status === "open" || header.status === "partially_invoiced";

  return (
    <div className="space-y-6">
      <Link to="/pos" className="inline-flex text-sm font-medium text-accent">
        ← Back to PO list
      </Link>

      <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-medium uppercase text-slate-500">Purchase Order</p>
            <h1 className="font-mono text-2xl font-semibold text-navy">{header.poNumber}</h1>
            <p className="mt-1 text-sm text-slate-600">
              {header.plantName || header.plantCode} · {formatDate(header.poDate)}
            </p>
          </div>
          <POStatusBadge status={header.status} />
        </div>

        <dl className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4 text-sm">
          <div>
            <dt className="text-slate-500">Vendor</dt>
            <dd className="font-medium">{header.vendorCode}</dd>
          </div>
          <div>
            <dt className="text-slate-500">Total value</dt>
            <dd className="font-medium">{formatCurrency(header.totalValue, header.currency)}</dd>
          </div>
          <div>
            <dt className="text-slate-500">Lines with pending qty</dt>
            <dd className="font-medium">{summary?.linesWithPending ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-slate-500">Total pending qty</dt>
            <dd className="font-medium tabular-nums">{summary?.totalPendingQty ?? "—"}</dd>
          </div>
        </dl>

        {canInvoice && (
          <Link
            to={`/invoices/create?po=${encodeURIComponent(header.poNumber)}`}
            className="mt-6 inline-flex"
          >
            <Button type="button">Create invoice from this PO</Button>
          </Link>
        )}
      </section>

      <POLineTable lines={lines} />
    </div>
  );
}
