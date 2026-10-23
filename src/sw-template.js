/* Habits service worker — generated at build time from src/sw-template.js. */
const VERSION = __VERSION__;
const PRECACHE = __PRECACHE__;
const CACHE = `habits-${VERSION}`;

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(PRECACHE.map((url) => new Request(url, { cache: 'reload' }))))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  const activated = (async () => {
    const stale = (await caches.keys()).filter((k) => k.startsWith('habits-') && k !== CACHE);
    await Promise.all(stale.map((k) => caches.delete(k)));
    await self.clients.claim();
    return stale.length > 0;
  })();
  event.waitUntil(activated);
  // This replaced an older version: reload open windows so they show the new
  // interface immediately (works even when the page runs the previous code).
  // Done after activation completes — the reload's request needs an active worker.
  activated.then(async (updated) => {
    if (!updated) return;
    const windows = await self.clients.matchAll({ type: 'window' });
    for (const client of windows) client.navigate(client.url).catch(() => {});
  });
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Single-page app: every navigation is served the cached shell, so the app
  // opens instantly and fully offline. Query strings are ignored.
  if (request.mode === 'navigate') {
    event.respondWith(caches.match('./', { ignoreSearch: true }).then((cached) => cached || fetch(request)));
    return;
  }

  event.respondWith(
    caches.match(request, { ignoreSearch: true }).then(
      (cached) =>
        cached ||
        fetch(request).then((response) => {
          if (response.ok && response.type === 'basic') {
            const copy = response.clone();
            caches.open(CACHE).then((cache) => cache.put(request, copy));
          }
          return response;
        }),
    ),
  );
});
