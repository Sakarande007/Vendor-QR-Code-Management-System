import { lazy, Suspense } from "react";
import { PageSkeleton } from "../components/ui/PageSkeleton.jsx";
import { TablePageSkeleton } from "../components/ui/TablePageSkeleton.jsx";
import { AuthPageSkeleton } from "../components/ui/AuthPageSkeleton.jsx";
import { DashboardPageSkeleton } from "../components/ui/DashboardPageSkeleton.jsx";

const FALLBACKS = {
  page: PageSkeleton,
  table: TablePageSkeleton,
  auth: AuthPageSkeleton,
  dashboard: DashboardPageSkeleton,
};

/**
 * Lazy-load a page module with a skeleton fallback (not a bare spinner).
 * @param {() => Promise<{ [key: string]: React.ComponentType }>} importFn
 * @param {string} exportName Named export from the module
 * @param {'page'|'table'|'auth'|'dashboard'} [variant]
 */
export function lazyPage(importFn, exportName, variant = "page") {
  const LazyComponent = lazy(() =>
    importFn().then((mod) => ({ default: mod[exportName] }))
  );

  const Fallback = FALLBACKS[variant] ?? PageSkeleton;

  function LazyPageWrapper(props) {
    return (
      <Suspense fallback={<Fallback />}>
        <LazyComponent {...props} />
      </Suspense>
    );
  }

  LazyPageWrapper.displayName = `Lazy(${exportName})`;
  return LazyPageWrapper;
}
