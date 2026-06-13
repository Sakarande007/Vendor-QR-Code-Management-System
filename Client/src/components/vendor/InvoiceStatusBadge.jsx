import { cn } from "../../lib/cn.js";
import { formatInvoiceStatusLabel } from "../../lib/format.js";

const statusStyles = {
  draft: "bg-slate-100 text-slate-700 ring-slate-500/20",
  submitted: "bg-blue-100 text-blue-800 ring-blue-600/20",
  qr_generated: "bg-emerald-100 text-emerald-800 ring-emerald-600/20",
  verified: "bg-emerald-100 text-emerald-800 ring-emerald-600/20",
  rejected: "bg-red-100 text-red-800 ring-red-600/20",
};

/**
 * @param {object} props
 * @param {string} props.status
 * @param {string} [props.className]
 */
export function InvoiceStatusBadge({ status, className }) {
  const key = status in statusStyles ? status : "draft";

  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset",
        statusStyles[key],
        className
      )}
    >
      {formatInvoiceStatusLabel(status)}
    </span>
  );
}
