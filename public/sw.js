/* Cairn service worker.
 * The version string and precache list below are injected by scripts/build.mjs.
 * Strategy: precache the entire app (shell, scripts, styles, icons, data) on install,
 * then serve everything cache-first. Navigations always resolve to the cached shell
 * (the app uses hash routing), so every screen works with no connectivity.
 */
'use strict';

const VERSION = '__VERSION__';
const PRECACHE = /*__PRECACHE__*/[];
const CACHE_PREFIX = 'cairn-v-';
const CACHE = CACHE_PREFIX + VERSION;

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    // Small batches keep iOS Safari happy. Any failure aborts the install,
    // so a half-cached version can never become active.
    for (let i = 0; i < PRECACHE.length; i += 8) {
      await Promise.all(PRECACHE.slice(i, i + 8).map(async (url) => {
        const res = await fetch(new Request(url, { cache: 'reload' }));
        if (!res.ok) throw new Error('Precache failed: ' + url + ' (' + res.status + ')');
        await cache.put(url, res);
      }));
    }
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k.startsWith(CACHE_PREFIX) && k !== CACHE).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('message', (event) => {
  const data = event.data || {};
  if (data.type === 'SKIP_WAITING') self.skipWaiting();
  if (data.type === 'GET_VERSION' && event.ports[0]) event.ports[0].postMessage({ version: VERSION, cache: CACHE });
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // Cairn makes no cross-origin requests

  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    if (req.mode === 'navigate') {
      // The app uses hash routes, so the only real documents are the scope root and index.html.
      // Any other path (mistyped link, stale bookmark) goes to the root; relative asset URLs would not resolve from it.
      const scopePath = new URL(self.registration.scope).pathname;
      if (url.pathname !== scopePath && url.pathname !== scopePath + 'index.html') {
        return Response.redirect(self.registration.scope, 302);
      }
      const shell = await cache.match('./index.html');
      if (shell) return shell;
      try { return await fetch(req); } catch (_) {
        return (await cache.match('./offline.html')) || Response.error();
      }
    }
    const hit = await cache.match(req, { ignoreSearch: true });
    if (hit) return hit;
    try { return await fetch(req); } catch (_) {
      return new Response('', { status: 504, statusText: 'Offline and not cached' });
    }
  })());
});
