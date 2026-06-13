import { cn } from "../../lib/cn.js";

/**
 * Skeleton for list/table pages (PO, invoices).
 */
export function TablePageSkeleton({ rows = 8, className }) {
  return (
    <div className={cn("space-y-4 p-1", className)} role="status" aria-label="Loading list">
      <div className="flex flex-wrap gap-3">
        <div className="h-10 w-48 animate-pulse rounded-lg bg-slate-200" />
        <div className="h-10 w-36 animate-pulse rounded-lg bg-slate-200" />
      </div>
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <div className="border-b border-slate-100 bg-slate-50 px-4 py-3">
          <div className="h-4 w-full max-w-md animate-pulse rounded bg-slate-200" />
        </div>
        {Array.from({ length: rows }).map((_, i) => (
          <div
            key={i}
            className="flex items-center gap-4 border-b border-slate-50 px-4 py-3 last:border-0"
          >
            <div className="h-4 w-28 animate-pulse rounded bg-slate-200" />
            <div className="h-4 w-20 animate-pulse rounded bg-slate-100" />
            <div className="h-4 max-w-xs flex-1 animate-pulse rounded bg-slate-100" />
            <div className="h-6 w-16 animate-pulse rounded-full bg-slate-200" />
          </div>
        ))}
      </div>
      <span className="sr-only">Loading table…</span>
    </div>
  );
}
