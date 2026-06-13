/**
 * API base URL for axios. In local dev, prefer the Vite `/api` proxy so the
 * refresh-token cookie stays same-site (avoids logout on page refresh).
 */
export function getApiBaseUrl() {
  const configured = import.meta.env.VITE_API_URL?.trim();

  if (import.meta.env.DEV) {
    const devDirectApi =
      configured === "http://localhost:5000" ||
      configured === "http://127.0.0.1:5000";

    if (!configured || devDirectApi) {
      return "";
    }
  }

  return configured || "http://localhost:5000";
}
