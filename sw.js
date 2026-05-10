/* Propagatie Watch — Service Worker v1.1
 * NOAA requests bypass SW completely — no caching interference.
 * Static assets: Cache First. Everything else: Network First. */

const CACHE_NAME   = 'pw-cache-v3';
const NOAA_ORIGINS = ['services.swpc.noaa.gov'];

const STATIC_ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './css/tokens.css',
  './css/reset.css',
  './css/base.css',
  './css/layout.css',
  './css/components.css',
  './css/timeline.css',
  './css/setup.css',
  './js/ui.js',
  './js/settings.js',
  './js/app.js',
  './js/state.js',
  './js/storage.js',
  './js/utils.js',
  './js/i18n.js',
  './js/watches.js',
  './js/propagation.js',
  './js/greyline.js',
  './js/noaa.js',
  './js/notifications.js',
  './js/export.js',
  './js/setup.js',
  './js/timeline.js',
  './lib/suncalc.js',
  './data/dxcc-entities.json',
  './data/meteor-showers.json',
  './data/band-profiles.json',
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(STATIC_ASSETS))
      .catch(err => console.warn('SW cache install error:', err))
  );
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // NOAA API: NEVER cache, always go to network directly
  if (NOAA_ORIGINS.includes(url.hostname)) {
    // Let browser handle it — no event.respondWith
    return;
  }

  // Static assets: Cache First (offline support)
  if (event.request.method === 'GET') {
    event.respondWith(
      caches.match(event.request).then(cached => {
        if (cached) return cached;
        return fetch(event.request).then(response => {
          // Cache valid responses
          if (response && response.status === 200) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then(c => c.put(event.request, clone));
          }
          return response;
        });
      })
    );
  }
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  event.waitUntil(clients.openWindow(event.notification.data ?? './'));
});
