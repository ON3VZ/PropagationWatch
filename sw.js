// sw.js — Service Worker for Propagatie Watch
const CACHE_NAME = 'pw-cache-v1';
const STATIC_ASSETS = [
  '/', '/index.html',
  '/css/tokens.css', '/css/reset.css', '/css/base.css',
  '/css/layout.css', '/css/components.css', '/css/timeline.css', '/css/setup.css',
  '/js/ui.js',
  '/js/app.js', '/js/state.js', '/js/storage.js', '/js/utils.js',
  '/js/i18n.js', '/js/propagation.js', '/js/greyline.js',
  '/js/noaa.js', '/js/watches.js', '/js/notifications.js', '/js/export.js',
  '/lib/suncalc.js',
  '/data/dxcc-entities.json', '/data/meteor-showers.json', '/data/band-profiles.json',
  '/manifest.json',
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(STATIC_ASSETS))
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
  const { request } = event;
  const url = new URL(request.url);

  // NOAA API: Network first, fall back to cache
  if (url.hostname === 'services.swpc.noaa.gov') {
    event.respondWith(
      fetch(request).then(res => {
        const clone = res.clone();
        caches.open(CACHE_NAME).then(c => c.put(request, clone));
        return res;
      }).catch(() => caches.match(request))
    );
    return;
  }

  // Everything else: Cache first
  event.respondWith(
    caches.match(request).then(cached => cached || fetch(request))
  );
});

// Handle notification clicks
self.addEventListener('notificationclick', event => {
  event.notification.close();
  const url = event.notification.data?.url || '/';
  event.waitUntil(
    clients.matchAll({ type: 'window' }).then(windowClients => {
      if (windowClients.length > 0) {
        windowClients[0].focus();
        windowClients[0].postMessage({ type: 'navigate', url });
      } else {
        clients.openWindow(url);
      }
    })
  );
});
