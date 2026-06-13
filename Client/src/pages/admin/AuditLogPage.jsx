import { useState } from "react";
import { parseApiError } from "../../api/errors.js";
import { useAuditLogsQuery } from "../../hooks/queries/useAuditLogsQuery.js";
import { ApiErrorState } from "../../components/vendor/ApiErrorState.jsx";
import { Button } from "../../components/ui/Button.jsx";
import { Input } from "../../components/ui/Input.jsx";
import { Spinner } from "../../components/ui/Spinner.jsx";
import { formatDate } from "../../lib/format.js";

function JsonDiff({ oldValues, newValues }) {
  const oldObj = typeof oldValues === "string" ? tryParse(oldValues) : oldValues;
  const newObj = typeof newValues === "string" ? tryParse(newValues) : newValues;

  if (!oldObj && !newObj) return null;

  return (
    <div className="mt-2 grid gap-2 text-xs sm:grid-cols-2">
      <div className="rounded border border-red-100 bg-red-50/50 p-2">
        <p className="mb-1 font-semibold text-red-800">Before</p>
        <pre className="max-h-32 overflow-auto whitespace-pre-wrap break-all text-red-900">
          {oldObj ? JSON.stringify(oldObj, null, 2) : "—"}
        </pre>
      </div>
      <div className="rounded border border-emerald-100 bg-emerald-50/50 p-2">
        <p className="mb-1 font-semibold text-emerald-800">After</p>
        <pre className="max-h-32 overflow-auto whitespace-pre-wrap break-all text-emerald-900">
          {newObj ? JSON.stringify(newObj, null, 2) : "—"}
        </pre>
      </div>
    </div>
  );
}

function tryParse(s) {
  try {
    return JSON.parse(s);
  } catch {
    return s;
  }
}

export function AuditLogPage() {
  const [page, setPage] = useState(1);
  const [expandedId, setExpandedId] = useState(null);
  const [appliedFilters, setAppliedFilters] = useState({
    userId: "",
    action: "",
    entityType: "",
    dateFrom: "",
    dateTo: "",
  });

  const [userId, setUserId] = useState("");
  const [action, setAction] = useState("");
  const [entityType, setEntityType] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const pageSize = 50;

  const { data, isLoading: loading, error, refetch } = useAuditLogsQuery({
    page,
    pageSize,
    ...appliedFilters,
  });

  const logs = data?.auditLogs ?? [];
  const totalCount = data?.totalCount ?? 0;
  const totalPages = data?.pagination?.totalPages ?? 1;
  const errorMessage = error ? parseApiError(error).message : null;

  const applyFilters = () => {
    setAppliedFilters({ userId, action, entityType, dateFrom, dateTo });
    setPage(1);
  };

  if (errorMessage && !logs.length) {
    return <ApiErrorState message={errorMessage} onRetry={() => refetch()} />;
  }

  return (
    <div className="space-y-3">
      <div className="grid gap-3 rounded-lg border border-slate-200 bg-white p-3 sm:grid-cols-2 lg:grid-cols-5">
        <Input
          label="User ID"
          type="number"
          value={userId}
          onChange={(e) => setUserId(e.target.value)}
          placeholder="e.g. 1"
        />
        <Input label="Action" value={action} onChange={(e) => setAction(e.target.value)} placeholder="INVOICE_" />
        <Input
          label="Entity type"
          value={entityType}
          onChange={(e) => setEntityType(e.target.value)}
          placeholder="invoice"
        />
        <Input label="From" type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
        <Input label="To" type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
      </div>
      <Button type="button" size="sm" onClick={applyFilters}>
        Apply filters
      </Button>

      {loading ? (
        <div className="flex justify-center py-12">
          <Spinner />
        </div>
      ) : (
        <ol className="relative space-y-0 border-l-2 border-slate-200 pl-4">
          {logs.length === 0 ? (
            <li className="py-8 text-sm text-slate-500">No audit entries match filters.</li>
          ) : (
            logs.map((log) => (
              <li key={log.id} className="relative pb-6">
                <span
                  className="absolute -left-[1.35rem] top-1 h-2.5 w-2.5 rounded-full border-2 border-white bg-accent ring-2 ring-slate-200"
                  aria-hidden="true"
                />
                <article className="rounded-lg border border-slate-200 bg-white p-3 text-sm shadow-sm">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <p className="font-semibold text-navy">{log.action}</p>
                      <p className="text-xs text-slate-500">
                        {log.entityType} · {log.entityId}
                        {log.userEmail ? ` · ${log.userEmail}` : " · system"}
                      </p>
                    </div>
                    <time className="text-xs text-slate-500">{formatDate(log.createdAt)}</time>
                  </div>
                  {(log.oldValues || log.newValues) && (
                    <button
                      type="button"
                      className="mt-2 text-xs font-medium text-accent hover:underline"
                      onClick={() => setExpandedId(expandedId === log.id ? null : log.id)}
                    >
                      {expandedId === log.id ? "Hide changes" : "Show old → new"}
                    </button>
                  )}
                  {expandedId === log.id && (
                    <JsonDiff oldValues={log.oldValues} newValues={log.newValues} />
                  )}
                </article>
              </li>
            ))
          )}
        </ol>
      )}

      <nav className="flex items-center justify-between border-t border-slate-200 pt-3">
        <p className="text-xs text-slate-600">
          Page {page} of {totalPages} · {totalCount.toLocaleString()} entries
        </p>
        <div className="flex gap-2">
          <Button
            type="button"
            variant="secondary"
            size="sm"
            disabled={page <= 1 || loading}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
          >
            Previous
          </Button>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            disabled={page >= totalPages || loading}
            onClick={() => setPage((p) => p + 1)}
          >
            Next
          </Button>
        </div>
      </nav>
    </div>
  );
}
