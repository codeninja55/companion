/// <reference lib="webworker" />
import { precacheAndRoute, createHandlerBoundToURL } from "workbox-precaching";
import { registerRoute, NavigationRoute } from "workbox-routing";
import { NetworkOnly } from "workbox-strategies";

declare const self: ServiceWorkerGlobalScope;

// ─── Precaching ─────────────────────────────────────────────────────────────
// Precache the Workbox manifest (injected at build time by vite-plugin-pwa)
precacheAndRoute(self.__WB_MANIFEST);

// ─── Navigation fallback ────────────────────────────────────────────────────
// Hash routing: all navigations hit "/" → serve index.html from cache
const navigationHandler = createHandlerBoundToURL("index.html");
const navigationRoute = new NavigationRoute(navigationHandler, {
  denylist: [/^\/api/, /^\/ws/],
});
registerRoute(navigationRoute);

// ─── API bypass ─────────────────────────────────────────────────────────────
// All /api/* fetch() calls: always go to network, never cache
registerRoute(/^\/api\//, new NetworkOnly());

// ─── Lifecycle ──────────────────────────────────────────────────────────────
// Activate immediately and claim all open clients
self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

// ─── Push notification handler ──────────────────────────────────────────────
self.addEventListener("push", (event) => {
  const data = event.data?.json() ?? {};
  const title = data.title ?? "Companion";
  const body = data.body ?? "Session complete";

  // Suppress notification if a Companion window is currently focused
  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((clients) => {
        const hasFocusedWindow = clients.some((c) => c.focused);
        if (hasFocusedWindow) return;
        return self.registration.showNotification(title, {
          body,
          icon: "/favicon.ico",
        });
      }),
  );
});
