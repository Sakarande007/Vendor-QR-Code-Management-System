import { onCLS, onLCP, onINP, onTTFB } from "web-vitals";

/**
 * @param {import('web-vitals').Metric} metric
 */
function reportMetric(metric) {
  const payload = {
    name: metric.name,
    value: metric.value,
    rating: metric.rating,
    id: metric.id,
    navigationType: metric.navigationType,
    timestamp: Date.now(),
  };

  if (import.meta.env.DEV) {
    console.info(`[web-vitals] ${metric.name}`, payload);
    return;
  }

  const endpoint = import.meta.env.VITE_MONITORING_URL;
  if (!endpoint) {
    return;
  }

  const body = JSON.stringify(payload);

  if (navigator.sendBeacon) {
    navigator.sendBeacon(endpoint, body);
    return;
  }

  fetch(endpoint, {
    method: "POST",
    body,
    headers: { "Content-Type": "application/json" },
    keepalive: true,
  }).catch(() => {});
}

/**
 * Start Core Web Vitals collection (LCP, INP, CLS, TTFB).
 * INP supersedes FID in web-vitals v4+.
 */
export function initWebVitals() {
  onLCP(reportMetric);
  onINP(reportMetric);
  onCLS(reportMetric);
  onTTFB(reportMetric);
}
