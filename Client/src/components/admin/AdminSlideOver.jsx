import { useEffect, useId, useRef } from "react";
import { cn } from "../../lib/cn.js";

/**
 * @param {object} props
 * @param {boolean} props.open
 * @param {() => void} props.onClose
 * @param {string} props.title
 * @param {import('react').ReactNode} props.children
 * @param {string} [props.className]
 */
export function AdminSlideOver({ open, onClose, title, children, className }) {
  const titleId = useId();
  const panelRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    document.body.style.overflow = "hidden";
    const onKey = (e) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end" role="dialog" aria-modal="true" aria-labelledby={titleId}>
      <button
        type="button"
        className="absolute inset-0 bg-navy/40"
        aria-label="Close panel"
        onClick={onClose}
      />
      <div
        ref={panelRef}
        className={cn(
          "relative flex h-full w-full max-w-lg flex-col border-l border-slate-200 bg-white shadow-xl",
          className
        )}
      >
        <header className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
          <h2 id={titleId} className="text-lg font-semibold text-navy">
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded p-1 text-slate-500 hover:bg-slate-100 hover:text-navy"
            aria-label="Close"
          >
            ✕
          </button>
        </header>
        <div className="flex-1 overflow-y-auto p-4">{children}</div>
      </div>
    </div>
  );
}
