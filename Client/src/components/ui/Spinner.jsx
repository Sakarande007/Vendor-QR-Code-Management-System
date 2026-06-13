import { cn } from "../../lib/cn.js";

const sizes = {
  sm: "h-4 w-4 border-2",
  md: "h-6 w-6 border-2",
  lg: "h-10 w-10 border-[3px]",
};

/**
 * @param {object} props
 * @param {'sm'|'md'|'lg'} [props.size]
 * @param {string} [props.className]
 * @param {string} [props.label]
 */
export function Spinner({ size = "md", className, label = "Loading" }) {
  return (
    <span
      role="status"
      aria-label={label}
      className={cn(
        "inline-block animate-spin rounded-full border-slate-200 border-t-accent",
        sizes[size],
        className
      )}
    />
  );
}

/**
 * @param {object} props
 * @param {string} [props.message]
 */
export function PageSpinner({ message = "Loading…" }) {
  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center gap-4">
      <Spinner size="lg" />
      <p className="text-sm text-slate-600">{message}</p>
    </div>
  );
}

