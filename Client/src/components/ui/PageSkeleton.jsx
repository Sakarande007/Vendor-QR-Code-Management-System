import { cn } from "../../lib/cn.js";

/**
 * Generic full-page skeleton for lazy route loading.
 */
export function PageSkeleton({ className }) {
  return (
    <div
      className={cn("animate-pulse space-y-6 p-4", className)}
      role="status"
      aria-label="Loading page"
    >
      <div className="h-8 w-48 rounded-lg bg-slate-200" />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-24 rounded-xl border border-slate-200 bg-white" />
        ))}
      </div>
      <div className="h-64 rounded-xl border border-slate-200 bg-white" />
      <span className="sr-only">Loading…</span>
    </div>
  );
}
