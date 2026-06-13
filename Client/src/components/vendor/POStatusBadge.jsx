import { cn } from "../../lib/cn.js";
import { formatPOStatusLabel } from "../../lib/format.js";

const statusStyles = {
  open: "bg-emerald-100 text-emerald-800 ring-emerald-600/20",
  partially_invoiced: "bg-amber-100 text-amber-800 ring-amber-600/20",
  closed: "bg-slate-100 text-slate-600 ring-slate-500/20",
  cancelled: "bg-slate-100 text-slate-500 ring-slate-400/20",
};

/**
 * @param {object} props
 * @param {string} props.status
 * @param {string} [props.className]
 */
export function POStatusBadge({ status, className }) {
  const key = status in statusStyles ? status : "closed";

  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset",
        statusStyles[key],
        className
      )}
    >
      {formatPOStatusLabel(status)}
    </span>
  );
}
