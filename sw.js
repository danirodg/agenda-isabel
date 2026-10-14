// Service worker: guarda la app para que abra rápido y sin conexión.
// Los datos (Google) nunca se guardan aquí: siempre se piden en directo.
const CACHE = 'agenda-isabel-v9';
const ARCHIVOS = [
  './',
  './index.html',
  './app.js',
  './parser.js',
  './manifest.webmanifest',
  './iconos/icono-180.png',
  './iconos/icono-192.png',
  './iconos/icono-512.png'
];

self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(CACHE).then(function (c) { return c.addAll(ARCHIVOS); }).then(function () { return self.skipWaiting(); }));
});

self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (claves) {
    return Promise.all(claves.filter(function (k) { return k !== CACHE; }).map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});

// Archivos de la app: primero la red (para recibir mejoras), y si no hay, la copia guardada.
self.addEventListener('fetch', function (e) {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== self.location.origin) return;
  e.respondWith(
    // "no-store": se salta la caché del navegador y de GitHub, así las
    // actualizaciones llegan en cuanto se publican.
    fetch(e.request, { cache: 'no-store' }).then(function (resp) {
      const copia = resp.clone();
      caches.open(CACHE).then(function (c) { c.put(e.request, copia); });
      return resp;
    }).catch(function () {
      return caches.match(e.request, { ignoreSearch: true }).then(function (r) { return r || caches.match('./index.html'); });
    })
  );
});
