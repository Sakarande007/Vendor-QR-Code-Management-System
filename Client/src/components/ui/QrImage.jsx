import { cn } from "../../lib/cn.js";

/**
 * QR display with explicit dimensions to prevent CLS.
 * @param {object} props
 * @param {string|null} props.src blob/object URL or data URL
 * @param {string} [props.alt]
 * @param {number} [props.size]
 * @param {string} [props.className]
 */
export function QrImage({ src, alt = "Invoice QR code", size = 200, className }) {
  if (!src) {
    return (
      <div
        className={cn("animate-pulse rounded-lg bg-slate-100", className)}
        style={{ width: size, height: size }}
        aria-hidden="true"
      />
    );
  }

  return (
    <img
      src={src}
      alt={alt}
      width={size}
      height={size}
      loading="lazy"
      decoding="async"
      className={cn("rounded-lg border border-slate-200 bg-white", className)}
      style={{ width: size, height: size }}
    />
  );
}
