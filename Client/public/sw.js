/* eslint-disable no-undef */
/**
 * Vendor QR Portal — Workbox service worker
 * - Master data: stale-while-revalidate
 * - Static assets: cache-first
 * - PO / invoice API: network-only (never cached)
 */
importScripts(
  "https://storage.googleapis.com/workbox-cdn/releases/7.0.0/workbox-sw.js"
);

workbox.setConfig({ debug: false });

const { registerRoute } = workbox.routing;
const { StaleWhileRevalidate, CacheFirst, NetworkOnly } = workbox.strategies;
const { ExpirationPlugin } = workbox.expiration;
const { CacheableResponsePlugin } = workbox.cacheableResponse;

const MASTER_CACHE = "vqr-masters-v1";
const ASSETS_CACHE = "vqr-assets-v1";
const OFFLINE_URL = "/offline.html";

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(ASSETS_CACHE).then((cache) => cache.add(OFFLINE_URL).catch(() => {}))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

// Master data only — safe to serve stale while revalidating
registerRoute(
  ({ url, request }) =>
    request.method === "GET" && url.pathname.startsWith("/api/masters/"),
  new StaleWhileRevalidate({
    cacheName: MASTER_CACHE,
    plugins: [
      new CacheableResponsePlugin({ statuses: [0, 200] }),
      new ExpirationPlugin({ maxEntries: 32, maxAgeSeconds: 3600 }),
    ],
  })
);

// Never cache transactional PO / invoice data
registerRoute(
  ({ url, request }) => {
    if (request.method !== "GET") return false;
    const p = url.pathname;
    return (
      p.startsWith("/api/pos") ||
      p.startsWith("/api/invoices") ||
      p.startsWith("/api/auth") ||
      p.startsWith("/api/admin")
    );
  },
  new NetworkOnly()
);

// JS / CSS / fonts — cache-first
registerRoute(
  ({ request }) =>
    request.destination === "script" ||
    request.destination === "style" ||
    request.destination === "font",
  new CacheFirst({
    cacheName: ASSETS_CACHE,
    plugins: [
      new CacheableResponsePlugin({ statuses: [0, 200] }),
      new ExpirationPlugin({ maxEntries: 64, maxAgeSeconds: 30 * 24 * 60 * 60 }),
    ],
  })
);

// Images (except QR API) — cache-first
registerRoute(
  ({ request, url }) =>
    request.destination === "image" && !url.pathname.startsWith("/api/qr/"),
  new CacheFirst({
    cacheName: ASSETS_CACHE,
    plugins: [
      new ExpirationPlugin({ maxEntries: 48, maxAgeSeconds: 7 * 24 * 60 * 60 }),
    ],
  })
);

self.addEventListener("fetch", (event) => {
  if (event.request.mode !== "navigate") {
    return;
  }

  event.respondWith(
    fetch(event.request).catch(async () => {
      const cache = await caches.open(ASSETS_CACHE);
      const offline = await cache.match(OFFLINE_URL);
      return (
        offline ||
        new Response("You are offline. Please reconnect to use the Vendor QR Portal.", {
          status: 503,
          headers: { "Content-Type": "text/plain" },
        })
      );
    })
  );
});
