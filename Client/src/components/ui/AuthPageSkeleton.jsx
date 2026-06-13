export function AuthPageSkeleton() {
  return (
    <div className="mx-auto w-full max-w-md animate-pulse space-y-6 p-6" role="status">
      <div className="mx-auto h-12 w-12 rounded-full bg-slate-200" />
      <div className="h-8 rounded-lg bg-slate-200" />
      <div className="space-y-4">
        <div className="h-10 rounded-lg bg-slate-100" />
        <div className="h-10 rounded-lg bg-slate-100" />
        <div className="h-10 rounded-lg bg-slate-200" />
      </div>
      <span className="sr-only">Loading…</span>
    </div>
  );
}
