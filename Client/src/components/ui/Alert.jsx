import { cn } from "../../lib/cn.js";

const variants = {
  success: {
    container: "bg-emerald-50 border-emerald-200 text-emerald-900",
    icon: "text-emerald-600",
  },
  error: {
    container: "bg-red-50 border-red-200 text-red-900",
    icon: "text-red-600",
  },
  warning: {
    container: "bg-amber-50 border-amber-200 text-amber-900",
    icon: "text-amber-600",
  },
  info: {
    container: "bg-blue-50 border-blue-200 text-blue-900",
    icon: "text-blue-600",
  },
};

const icons = {
  success: "✓",
  error: "✕",
  warning: "!",
  info: "i",
};

/**
 * @param {object} props
 * @param {'success'|'error'|'warning'|'info'} [props.variant]
 * @param {string} [props.title]
 * @param {import('react').ReactNode} props.children
 * @param {string} [props.className]
 * @param {() => void} [props.onDismiss]
 */
export function Alert({ variant = "info", title, children, className, onDismiss }) {
  const styles = variants[variant];

  return (
    <div
      role="alert"
      className={cn(
        "flex gap-3 rounded-lg border px-4 py-3 text-sm",
        styles.container,
        className
      )}
    >
      <span
        className={cn(
          "flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-xs font-bold",
          styles.icon
        )}
        aria-hidden="true"
      >
        {icons[variant]}
      </span>
      <div className="min-w-0 flex-1">
        {title && <p className="mb-0.5 font-semibold">{title}</p>}
        <div>{children}</div>
      </div>
      {onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          className="shrink-0 text-current opacity-60 hover:opacity-100"
          aria-label="Dismiss alert"
        >
          ×
        </button>
      )}
    </div>
  );
}
