import { Button } from "../ui/Button.jsx";
import { cn } from "../../lib/cn.js";

/**
 * @param {object} props
 * @param {number} props.page
 * @param {number} props.totalCount
 * @param {number} props.pageSize
 * @param {boolean} props.hasMore
 * @param {boolean} [props.loading]
 * @param {() => void} props.onPrevious
 * @param {() => void} props.onNext
 */
export function CursorPagination({
  page,
  totalCount,
  pageSize,
  hasMore,
  loading = false,
  onPrevious,
  onNext,
}) {
  const start = totalCount === 0 ? 0 : (page - 1) * pageSize + 1;
  const end = Math.min(page * pageSize, totalCount);

  return (
    <nav
      className="flex flex-wrap items-center justify-between gap-4 border-t border-slate-200 pt-4"
      aria-label="Pagination"
    >
      <p className="text-sm text-slate-600" aria-live="polite">
        {totalCount === 0 ? (
          "No results"
        ) : (
          <>
            Showing <span className="font-medium text-navy">{start}</span>–
            <span className="font-medium text-navy">{end}</span> of{" "}
            <span className="font-medium text-navy">{totalCount}</span>
          </>
        )}
      </p>
      <div className={cn("flex gap-2")}>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          disabled={page <= 1 || loading}
          onClick={onPrevious}
          aria-label="Previous page"
        >
          Previous
        </Button>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          disabled={!hasMore || loading}
          onClick={onNext}
          aria-label="Next page"
        >
          Next
        </Button>
      </div>
    </nav>
  );
}
