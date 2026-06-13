export function DashboardPageSkeleton() {
  return (
    <div className="animate-pulse space-y-8" role="status" aria-label="Loading dashboard">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-28 rounded-xl border border-slate-200 bg-white" />
        ))}
      </div>
      <div className="h-12 w-48 rounded-lg bg-slate-200" />
      <div className="rounded-xl border border-slate-200 bg-white p-5">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="mb-4 h-14 border-b border-slate-100 last:mb-0 last:border-0" />
        ))}
      </div>
      <span className="sr-only">Loading dashboard…</span>
    </div>
  );
}
