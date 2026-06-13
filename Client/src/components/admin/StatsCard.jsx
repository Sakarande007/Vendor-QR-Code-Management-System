import { cn } from "../../lib/cn.js";

/**
 * @param {object} props
 * @param {string} props.label
 * @param {string|number} props.value
 * @param {import('react').ReactNode} [props.icon]
 * @param {string} [props.trend]
 * @param {'up'|'down'|'neutral'} [props.trendDirection]
 * @param {string} [props.subtext]
 * @param {string} [props.className]
 */
export function StatsCard({
  label,
  value,
  icon,
  trend,
  trendDirection = "neutral",
  subtext,
  className,
}) {
  const trendColors = {
    up: "text-emerald-600",
    down: "text-red-600",
    neutral: "text-slate-500",
  };

  return (
    <div className={cn("rounded-lg border border-slate-200 bg-white px-4 py-3 shadow-sm", className)}>
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums text-navy">{value}</p>
          {trend && (
            <p className={cn("mt-0.5 text-xs font-medium", trendColors[trendDirection])}>{trend}</p>
          )}
          {subtext && <p className="mt-0.5 text-xs text-slate-500">{subtext}</p>}
        </div>
        {icon && (
          <div
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-slate-100 text-slate-600"
            aria-hidden="true"
          >
            {icon}
          </div>
        )}
      </div>
    </div>
  );
}
