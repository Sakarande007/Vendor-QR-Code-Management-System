import { useEffect, useId, useRef } from "react";
import { cn } from "../../lib/cn.js";

const FOCUSABLE =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * @param {object} props
 * @param {boolean} props.open
 * @param {() => void} props.onClose
 * @param {string} [props.title]
 * @param {import('react').ReactNode} props.children
 * @param {string} [props.className]
 * @param {boolean} [props.closeOnBackdrop]
 */
export function Modal({
  open,
  onClose,
  title,
  children,
  className,
  closeOnBackdrop = true,
}) {
  const titleId = useId();
  const panelRef = useRef(null);
  const previousFocus = useRef(null);
  const onCloseRef = useRef(onClose);

  onCloseRef.current = onClose;

  useEffect(() => {
    if (!open) return;

    previousFocus.current = document.activeElement;
    document.body.style.overflow = "hidden";

    const panel = panelRef.current;
    const focusables = panel?.querySelectorAll(FOCUSABLE);
    const first = focusables?.[0];
    first?.focus();

    const onKeyDown = (e) => {
      if (e.key === "Escape") {
        onCloseRef.current();
        return;
      }

      if (e.key !== "Tab" || !panel) return;

      const items = panel.querySelectorAll(FOCUSABLE);
      if (!items.length) return;

      const firstEl = items[0];
      const lastEl = items[items.length - 1];

      if (e.shiftKey && document.activeElement === firstEl) {
        e.preventDefault();
        lastEl.focus();
      } else if (!e.shiftKey && document.activeElement === lastEl) {
        e.preventDefault();
        firstEl.focus();
      }
    };

    document.addEventListener("keydown", onKeyDown);

    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = "";
      if (previousFocus.current instanceof HTMLElement) {
        previousFocus.current.focus();
      }
    };
  }, [open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button
        type="button"
        className="absolute inset-0 bg-navy/60 backdrop-blur-sm"
        aria-label="Close dialog"
        onClick={closeOnBackdrop ? onClose : undefined}
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? titleId : undefined}
        className={cn(
          "relative z-10 w-full max-w-lg rounded-xl bg-white shadow-xl",
          "max-h-[90vh] overflow-y-auto",
          className
        )}
      >
        {title && (
          <div className="border-b border-slate-100 px-6 py-4">
            <h2 id={titleId} className="text-lg font-semibold text-navy">
              {title}
            </h2>
          </div>
        )}
        <div className="px-6 py-4">{children}</div>
      </div>
    </div>
  );
}
