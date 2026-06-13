import { useMemo } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useAdminDashboardQuery } from "../../hooks/queries/useAdminDashboardQuery.js";
import { StatsCard } from "../../components/admin/StatsCard.jsx";
import { DataTable } from "../../components/admin/DataTable.jsx";
import { InvoiceStatusBadge } from "../../components/vendor/InvoiceStatusBadge.jsx";
import { Button } from "../../components/ui/Button.jsx";
import { ApiErrorState } from "../../components/vendor/ApiErrorState.jsx";
import { formatCurrency, formatDate } from "../../lib/format.js";
import { CHART_COLORS, fillDailySeries } from "../../lib/chartHelpers.js";

const STATUS_COLORS = {
  draft: "#94A3B8",
  submitted: "#2563EB",
  qr_generated: "#10B981",
  verified: "#059669",
  rejected: "#EF4444",
};

function ChartPanel({ title, children, className = "" }) {
  return (
    <section
      className={`rounded-lg border border-slate-200 bg-white p-3 shadow-sm ${className}`}
    >
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">{title}</h3>
      {children}
    </section>
  );
}

export function AdminDashboardPage() {
  const navigate = useNavigate();
  const { data, isLoading: loading, isError, error, refetch } = useAdminDashboardQuery();

  const invoicesPerDay = useMemo(
    () => fillDailySeries(data?.charts?.invoicesPerDay ?? []),
    [data]
  );
  const poSyncActivity = useMemo(
    () => fillDailySeries(data?.charts?.poSyncActivity ?? []),
    [data]
  );

  if (isError && !data) {
    return <ApiErrorState message={error?.message ?? "Failed to load"} onRetry={() => refetch()} />;
  }

  const stats = data?.stats ?? {};

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatsCard
          label="Total Vendors"
          value={loading ? "—" : stats.totalVendors}
          icon={<span className="text-sm font-bold">V</span>}
          trend="Registered vendors"
          trendDirection="neutral"
        />
        <StatsCard
          label="Active POs"
          value={loading ? "—" : stats.activePOs}
          icon={<span className="text-sm font-bold">PO</span>}
          trend="Open + partial"
          trendDirection="neutral"
        />
        <StatsCard
          label="Invoices This Month"
          value={loading ? "—" : stats.invoicesThisMonth}
          icon={<span className="text-sm font-bold">INV</span>}
        />
        <StatsCard
          label="Pending Verification"
          value={loading ? "—" : stats.pendingVerification}
          icon={<span className="text-sm font-bold">!</span>}
          trend="Submitted / QR ready"
          trendDirection={stats.pendingVerification > 0 ? "down" : "up"}
        />
      </div>

      <div className="grid gap-3 lg:grid-cols-3">
        <ChartPanel title="Invoices per day (30d)" className="lg:col-span-2">
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={invoicesPerDay} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
              <XAxis
                dataKey="date"
                tick={{ fontSize: 10 }}
                tickFormatter={(v) => v.slice(5)}
              />
              <YAxis allowDecimals={false} tick={{ fontSize: 10 }} width={32} />
              <Tooltip labelFormatter={(v) => formatDate(v)} />
              <Bar dataKey="count" fill="#2563EB" radius={[2, 2, 0, 0]} name="Invoices" />
            </BarChart>
          </ResponsiveContainer>
        </ChartPanel>

        <ChartPanel title="Invoice status">
          <ResponsiveContainer width="100%" height={220}>
            <PieChart>
              <Pie
                data={data?.charts?.invoiceStatusDistribution ?? []}
                dataKey="count"
                nameKey="status"
                cx="50%"
                cy="50%"
                outerRadius={72}
                label={({ status, count }) => `${status}: ${count}`}
                labelLine={false}
              >
                {(data?.charts?.invoiceStatusDistribution ?? []).map((entry, i) => (
                  <Cell
                    key={entry.status}
                    fill={STATUS_COLORS[entry.status] ?? CHART_COLORS[i % CHART_COLORS.length]}
                  />
                ))}
              </Pie>
              <Tooltip />
              <Legend wrapperStyle={{ fontSize: 11 }} />
            </PieChart>
          </ResponsiveContainer>
        </ChartPanel>
      </div>

      <ChartPanel title="PO sync activity (30d)">
        <ResponsiveContainer width="100%" height={180}>
          <LineChart data={poSyncActivity} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
            <XAxis dataKey="date" tick={{ fontSize: 10 }} tickFormatter={(v) => v.slice(5)} />
            <YAxis allowDecimals={false} tick={{ fontSize: 10 }} width={32} />
            <Tooltip labelFormatter={(v) => formatDate(v)} />
            <Line
              type="monotone"
              dataKey="count"
              stroke="#0F172A"
              strokeWidth={2}
              dot={false}
              name="Syncs"
            />
          </LineChart>
        </ResponsiveContainer>
      </ChartPanel>

      <section className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-semibold text-navy">Recent invoices (all vendors)</h3>
          <Link to="/admin/invoices" className="text-xs font-medium text-accent hover:underline">
            View all
          </Link>
        </div>
        <DataTable
          dense
          loading={loading}
          columns={[
            { key: "systemInvoiceId", label: "System ID", sortable: true },
            { key: "invoiceNumber", label: "Invoice #", sortable: true, filterable: true },
            { key: "vendorCode", label: "Vendor", sortable: true, filterable: true },
            { key: "vendorName", label: "Name", sortable: true },
            { key: "invoiceDate", label: "Date", sortable: true },
            { key: "totalAmount", label: "Amount", sortable: true },
            { key: "status", label: "Status", sortable: true },
          ]}
          data={data?.recentInvoices ?? []}
          exportFilename="recent-invoices.csv"
          renderRow={(row) => (
            <tr key={row.invoiceId} className="hover:bg-slate-50/80">
              <td className="px-3 py-2 font-mono text-xs">{row.systemInvoiceId}</td>
              <td className="px-3 py-2 text-xs">{row.invoiceNumber}</td>
              <td className="px-3 py-2 text-xs">{row.vendorCode}</td>
              <td className="px-3 py-2 text-xs">{row.vendorName ?? "—"}</td>
              <td className="px-3 py-2 text-xs">{formatDate(row.invoiceDate)}</td>
              <td className="px-3 py-2 text-xs tabular-nums">
                {formatCurrency(row.totalAmount, row.currency)}
              </td>
              <td className="px-3 py-2">
                <InvoiceStatusBadge status={row.status} />
              </td>
            </tr>
          )}
        />
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
        <h3 className="mb-2 text-sm font-semibold text-navy">Quick actions</h3>
        <div className="flex flex-wrap gap-2">
          <Button type="button" size="sm" onClick={() => navigate("/admin/pos")}>
            Sync PO Data
          </Button>
          <Button type="button" variant="secondary" size="sm" onClick={() => navigate("/admin/vendors")}>
            Add Vendor
          </Button>
          <Button type="button" variant="secondary" size="sm" onClick={() => navigate("/admin/audit-logs")}>
            View Audit Logs
          </Button>
        </div>
      </section>
    </div>
  );
}
