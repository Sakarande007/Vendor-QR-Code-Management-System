import { companyConfig } from "../../lib/companyConfig.js";
import { cn } from "../../lib/cn.js";

/**
 * Company logo with srcset for retina displays.
 */
export function CompanyLogo({ className, height = 40 }) {
  const url = companyConfig.logoUrl;
  if (!url) {
    return (
      <span className={cn("text-lg font-semibold text-navy", className)}>
        {companyConfig.name}
      </span>
    );
  }

  const width = Math.round(height * 2.5);

  return (
    <img
      src={url}
      srcSet={`${url} 1x, ${url} 2x`}
      alt={`${companyConfig.name} logo`}
      width={width}
      height={height}
      loading="lazy"
      decoding="async"
      className={cn("object-contain", className)}
      style={{ height, width: "auto", maxWidth: width }}
    />
  );
}
