import { forwardRef, useId } from "react";
import { cn } from "../../lib/cn.js";

/**
 * @type {import('react').ForwardRefRenderFunction<HTMLInputElement, import('react').InputHTMLAttributes<HTMLInputElement> & {
 *   label?: string;
 *   error?: string;
 *   helperText?: string;
 *   icon?: import('react').ReactNode;
 *   iconPosition?: 'left' | 'right';
 *   inputClassName?: string;
 * }>}
 */
export const Input = forwardRef(function Input(
  {
    label,
    error,
    helperText,
    icon,
    iconPosition = "left",
    className,
    inputClassName,
    id: idProp,
    required,
    ...props
  },
  ref
) {
  const generatedId = useId();
  const id = idProp ?? generatedId;
  const errorId = error ? `${id}-error` : undefined;
  const helperId = helperText && !error ? `${id}-helper` : undefined;

  return (
    <div className={cn("w-full", className)}>
      {label && (
        <label htmlFor={id} className="mb-1.5 block text-sm font-medium text-slate-700">
          {label}
          {required && (
            <span className="text-red-500" aria-hidden="true">
              {" "}
              *
            </span>
          )}
        </label>
      )}
      <div className="relative">
        {icon && iconPosition === "left" && (
          <span
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
            aria-hidden="true"
          >
            {icon}
          </span>
        )}
        <input
          ref={ref}
          id={id}
          required={required}
          aria-invalid={error ? "true" : undefined}
          aria-describedby={errorId || helperId}
          className={cn(
            "w-full rounded-lg border bg-white px-3 py-2.5 text-sm text-navy",
            "placeholder:text-slate-400 transition-colors",
            "focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent",
            error ? "border-red-400" : "border-slate-200",
            icon && iconPosition === "left" && "pl-10",
            icon && iconPosition === "right" && "pr-10",
            inputClassName
          )}
          {...props}
        />
        {icon && iconPosition === "right" && (
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400">{icon}</span>
        )}
      </div>
      {error && (
        <p id={errorId} role="alert" className="mt-1.5 text-sm text-red-600">
          {error}
        </p>
      )}
      {helperText && !error && (
        <p id={helperId} className="mt-1.5 text-sm text-slate-500">
          {helperText}
        </p>
      )}
    </div>
  );
});
