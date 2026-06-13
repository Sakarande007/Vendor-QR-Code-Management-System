import { Link } from "react-router-dom";
import { ApiErrorState } from "../../components/vendor/ApiErrorState.jsx";
import { InvoiceStatusBadge } from "../../components/vendor/InvoiceStatusBadge.jsx";
import { Button } from "../../components/ui/Button.jsx";
import { DashboardPageSkeleton } from "../../components/ui/DashboardPageSkeleton.jsx";
import { useDashboardQuery } from "../../hooks/queries/useDashboardQuery.js";
import { formatCurrency, formatDate } from "../../lib/format.js";

function SummaryCard({ label, value, subtext, href }) {
  const content = (
    <>
      <p className="text-sm font-medium text-slate-600">{label}</p>
      <p className="mt-2 text-2xl font-semibold text-navy tabular-nums">{value}</p>
      {subtext && <p className="mt-1 text-xs text-slate-500">{subtext}</p>}
    </>
  );

  const className =
    "block rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition-shadow hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent";

  if (href) {
    return (
      <Link to={href} className={className}>
        {content}
      </Link>
    );
  }

  return <div className={className}>{content}</div>;
}

export function DashboardPage() {
  const { data, isLoading, isError, error, refetch, isFetching } = useDashboardQuery();

  if (isError) {
    return (
      <ApiErrorState
        message={error?.message ?? "Failed to load dashboard"}
        onRetry={() => refetch()}
        retrying={isFetching}
      />
    );
  }

  if (isLoading) {
    return <DashboardPageSkeleton />;
  }

  const stats = data?.stats ?? {
    openPOs: 0,
    pendingInvoiceValue: 0,
    invoicesThisMonth: 0,
    qrGeneratedCount: 0,
  };
  const recentInvoices = data?.recentInvoices ?? [];

  return (
    <div className="space-y-8">
      <section aria-labelledby="summary-heading">
        <h2 id="summary-heading" className="sr-only">
          Summary
        </h2>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <SummaryCard
            label="Open POs"
            value={stats.openPOs}
            subtext="Ready for invoicing"
            href="/pos?status=open"
          />
          <SummaryCard
            label="Pending Invoice Value"
            value={formatCurrency(stats.pendingInvoiceValue)}
            subtext="Draft invoices & open PO value"
          />
          <SummaryCard
            label="Invoices This Month"
            value={stats.invoicesThisMonth}
            href="/invoices"
          />
          <SummaryCard
            label="QR Generated Invoices"
            value={stats.qrGeneratedCount}
            href="/invoices"
          />
        </div>
      </section>

      <section className="flex flex-wrap gap-3" aria-label="Quick actions">
        <Link to="/invoices/create" className="inline-flex">
          <Button type="button" size="lg">
            Create New Invoice
          </Button>
        </Link>
        <Link to="/pos" className="inline-flex">
          <Button type="button" variant="secondary" size="lg">
            View All POs
          </Button>
        </Link>
      </section>

      <section
        className="rounded-xl border border-slate-200 bg-white shadow-sm"
        aria-labelledby="activity-heading"
      >
        <div className="border-b border-slate-100 px-5 py-4">
          <h2 id="activity-heading" className="text-base font-semibold text-navy">
            Recent Activity
          </h2>
          <p className="text-sm text-slate-500">Your latest invoices</p>
        </div>

        {recentInvoices.length === 0 ? (
          <div className="px-5 py-12 text-center">
            <p className="text-sm text-slate-600">No invoices yet.</p>
            <Link to="/invoices/create" className="mt-4 inline-flex">
              <Button type="button">Create invoice</Button>
            </Link>
          </div>
        ) : (
          <ul className="divide-y divide-slate-100 px-5">
            {recentInvoices.map((invoice) => (
              <li key={invoice.invoiceId}>
                <Link
                  to={`/invoices/${invoice.invoiceId}`}
                  className="flex flex-wrap items-center justify-between gap-3 py-4 -mx-2 px-2 rounded-lg hover:bg-slate-50/80"
                >
                  <div className="min-w-0">
                    <p className="font-medium text-navy truncate">
                      {invoice.systemInvoiceId || invoice.invoiceNumber}
                    </p>
                    <p className="text-sm text-slate-500">
                      PO {invoice.poNumber} · {formatDate(invoice.invoiceDate)}
                    </p>
                  </div>
                  <InvoiceStatusBadge status={invoice.status} />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
