/**
 * Registers production service worker (Workbox in public/sw.js).
 */
export function registerServiceWorker() {
  if (!import.meta.env.PROD || !("serviceWorker" in navigator)) {
    return;
  }

  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register("/sw.js", { scope: "/" })
      .then((reg) => {
        if (import.meta.env.DEV) {
          console.info("[sw] registered", reg.scope);
        }
      })
      .catch((err) => {
        console.warn("[sw] registration failed", err);
      });
  });
}
