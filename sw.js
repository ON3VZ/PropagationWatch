/* Propagation Watch — Service Worker v15 */
const CACHE = 'pw-v18';
const STATIC = [
  './', './index.html', './manifest.json',
  './css/style.css', './js/app.js', './lib/suncalc.js'
];
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
  if (e.request.url.includes('swpc.noaa.gov')) return;
  e.respondWith(caches.match(e.request).then(c => c || fetch(e.request)));
});
