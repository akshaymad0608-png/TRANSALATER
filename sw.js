/* Rosetta service worker.
 *
 * Makes the site installable and lets the app open without a connection.
 * Translation itself always needs the network (it calls the translation
 * service), so this caches only our own pages and static files:
 *   - pages: network first, cached copy if offline, else the cached home page
 *   - static files (css, icons, flags, manifest): cached copy first,
 *     refreshed in the background
 * Other origins (ads, fonts, translation API, video-call servers) are never
 * touched, so they behave exactly as without a service worker.
 * Bump VERSION when the precache list changes; old caches are deleted.
 */
const VERSION = "rosetta-v1";
const PRECACHE = ["/", "/site.css", "/manifest.json", "/icon.svg", "/icon-192.png", "/icon-512.png"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(PRECACHE)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  if (req.mode === "navigate") {
    e.respondWith(
      fetch(req)
        .then((res) => {
          if (res.ok) { const copy = res.clone(); caches.open(VERSION).then((c) => c.put(req, copy)); }
          return res;
        })
        .catch(() => caches.match(req, { ignoreSearch: true }).then((hit) => hit || caches.match("/")))
    );
    return;
  }

  e.respondWith(
    caches.match(req).then((hit) => {
      const net = fetch(req)
        .then((res) => {
          if (res.ok) { const copy = res.clone(); caches.open(VERSION).then((c) => c.put(req, copy)); }
          return res;
        })
        .catch(() => hit);
      return hit || net;
    })
  );
});
