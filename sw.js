/* SK POLYMERS invoice - offline cache.
   Network first, so a fixed app.js / app.css reaches installed copies the next
   time they are opened online; the cache is only the fallback for offline (or
   a network that hangs). Bump CACHE when the file list changes. */
var CACHE = 'sk-invoice-v3';
var ASSETS = [
  './',
  './index.html',
  './app.css',
  './app.js',
  './assets.js',
  './manifest.json',
  './vendor/html2pdf.bundle.min.js',
  './icons/favicon.png',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/maskable-192.png',
  './icons/maskable-512.png'
];
var NETWORK_WAIT = 4000;   /* ms before a hanging request falls back to the cache */

self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(CACHE).then(function (c) {
    /* 'reload' skips the browser's HTTP cache, which could hand back the old files */
    return c.addAll(ASSETS.map(function (u) { return new Request(u, { cache: 'reload' }); }));
  }).then(function () {
    return self.skipWaiting();
  }));
});

self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.map(function (k) { return k === CACHE ? null : caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});

self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;

  var network = fetch(req).then(function (res) {
    if (res && res.status === 200 && res.type === 'basic') {
      var copy = res.clone();
      caches.open(CACHE).then(function (c) { return c.put(req, copy); });
    }
    return res;
  });

  var cached = function () {
    return caches.match(req, { ignoreSearch: true }).then(function (hit) {
      return hit || (req.mode === 'navigate' ? caches.match('./index.html') : undefined);
    });
  };

  var slow = new Promise(function (r) { setTimeout(r, NETWORK_WAIT); }).then(cached);

  e.respondWith(
    Promise.race([
      network['catch'](cached),                          /* offline -> cache */
      slow.then(function (hit) { return hit || network; }) /* hanging -> cache */
    ]).then(function (res) { return res || network; })
  );
});
