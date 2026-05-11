/* Propagation Watch — Service Worker v13 */
const CACHE = 'pw-v14';
const STATIC = ['./', './index.html', './manifest.json', './lib/suncalc.js', './js/app.js'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(STATIC)));
  self.skipWaiting();
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks =>
    Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))
  ));
  self.clients.claim();
});
self.addEventListener('fetch', e => {
  if (e.request.url.includes('swpc.noaa.gov')) return; // nooit cachen
  e.respondWith(caches.match(e.request).then(c => c || fetch(e.request)));
});
