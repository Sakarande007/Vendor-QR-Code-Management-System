import { cn } from "../../lib/cn.js";

const statusStyles = {
  active: "bg-emerald-100 text-emerald-800 ring-emerald-600/20",
  inactive: "bg-slate-100 text-slate-600 ring-slate-500/20",
  pending: "bg-amber-100 text-amber-800 ring-amber-600/20",
  draft: "bg-slate-100 text-slate-700 ring-slate-500/20",
  submitted: "bg-blue-100 text-blue-800 ring-blue-600/20",
  verified: "bg-emerald-100 text-emerald-800 ring-emerald-600/20",
  rejected: "bg-red-100 text-red-800 ring-red-600/20",
  locked: "bg-red-100 text-red-800 ring-red-600/20",
  default: "bg-slate-100 text-slate-700 ring-slate-500/20",
};

/**
 * @param {object} props
 * @param {import('react').ReactNode} props.children
 * @param {keyof typeof statusStyles | string} [props.status]
 * @param {string} [props.className]
 */
export function Badge({ children, status = "default", className }) {
  const key = status in statusStyles ? status : "default";

  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset",
        statusStyles[key],
        className
      )}
    >
      {children}
    </span>
  );
}
