const CACHE_NAME = "wajebaty-v4";
const ASSETS = ["/", "/login", "/manifest.webmanifest", "/image.png", "/icon-192.png", "/icon-512.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;

  // Let the browser perform page navigations itself. Re-issuing a navigation
  // through `fetch(event.request)` rewrites its Sec-Fetch-* metadata (a typed
  // URL arrives as `Sec-Fetch-Site: same-origin` / `Sec-Fetch-Dest: empty`),
  // which the server uses in proxy.ts to tell a typed URL from an in-app
  // navigation. Offline navigations fall back to the browser's offline page.
  if (event.request.mode === "navigate") return;

  event.respondWith(
    fetch(event.request).catch(async () => {
      const cached = await caches.match(event.request);
      if (cached) return cached;
      return new Response("Offline", { status: 503, headers: { "Content-Type": "text/plain" } });
    })
  );
});

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { title: "واجباتي" };
  }
  const options = {
    body: data.body || "",
    icon: "/icon-192.png",
    badge: "/icon-192.png",
    data: { url: data.url || "/" },
    dir: "rtl",
    lang: "ar"
  };
  event.waitUntil(self.registration.showNotification(data.title || "واجباتي", options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = (event.notification.data && event.notification.data.url) || "/";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      for (const client of list) {
        if ("focus" in client) {
          client.navigate(target).catch(() => undefined);
          return client.focus();
        }
      }
      return self.clients.openWindow(target);
    })
  );
});