import { forwardRef } from "react";
import { cn } from "../../lib/cn.js";
import { Spinner } from "./Spinner.jsx";

const variants = {
  primary:
    "bg-accent text-white hover:bg-accent-hover focus-visible:ring-accent shadow-sm disabled:bg-accent/60",
  secondary:
    "bg-white text-navy border border-slate-200 hover:bg-slate-50 focus-visible:ring-slate-400",
  danger:
    "bg-red-600 text-white hover:bg-red-700 focus-visible:ring-red-500 disabled:bg-red-400",
  ghost:
    "bg-transparent text-slate-700 hover:bg-slate-100 focus-visible:ring-slate-400",
};

const sizes = {
  sm: "h-8 px-3 text-sm gap-1.5",
  md: "h-10 px-4 text-sm gap-2",
  lg: "h-12 px-6 text-base gap-2",
};

/**
 * @type {import('react').ForwardRefRenderFunction<HTMLButtonElement, import('react').ButtonHTMLAttributes<HTMLButtonElement> & {
 *   variant?: keyof typeof variants;
 *   size?: keyof typeof sizes;
 *   loading?: boolean;
 *   fullWidth?: boolean;
 * }>}
 */
export const Button = forwardRef(function Button(
  {
    className,
    variant = "primary",
    size = "md",
    loading = false,
    fullWidth = false,
    disabled,
    children,
    type = "button",
    ...props
  },
  ref
) {
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cn(
        "inline-flex items-center justify-center rounded-lg font-medium transition-colors",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2",
        "disabled:cursor-not-allowed disabled:opacity-70",
        variants[variant],
        sizes[size],
        fullWidth && "w-full",
        className
      )}
      {...props}
    >
      {loading && <Spinner size="sm" className="border-white/30 border-t-white" />}
      {children}
    </button>
  );
});
