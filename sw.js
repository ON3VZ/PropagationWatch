/* Propagation Watch — Service Worker */
const CACHE = 'pw-v10';
const STATIC = ['./','./index.html','./manifest.json','./lib/suncalc.js'];
self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c=>c.addAll(STATIC)));
  self.skipWaiting();
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>k!==CACHE).map(k=>caches.delete(k)))));
  self.clients.claim();
});
self.addEventListener('fetch', e => {
  // Never cache NOAA API
  if(e.request.url.includes('swpc.noaa.gov')) return;
  e.respondWith(caches.match(e.request).then(c=>c||fetch(e.request)));
});
