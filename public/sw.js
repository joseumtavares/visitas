const CACHE_VERSION = 'agri-vendas-v1';
const APP_CACHE = `${CACHE_VERSION}-app`;
const RUNTIME_CACHE = `${CACHE_VERSION}-runtime`;
const APP_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/sw.js',
  '/icons/icon-72.png',
  '/icons/icon-96.png',
  '/icons/icon-128.png',
  '/icons/icon-144.png',
  '/icons/icon-152.png',
  '/icons/icon-192.png',
  '/icons/icon-384.png',
  '/icons/icon-512.png',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js',
  'https://unpkg.com/react@18/umd/react.production.min.js',
  'https://unpkg.com/react-dom@18/umd/react-dom.production.min.js',
  'https://unpkg.com/@babel/standalone/babel.min.js'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(APP_CACHE)
      .then(cache => cache.addAll(APP_ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(
      keys
        .filter(key => ![APP_CACHE, RUNTIME_CACHE].includes(key))
        .filter(key => key.startsWith('agri-vendas-'))
        .map(key => caches.delete(key))
    )).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  const isSameOrigin = url.origin === self.location.origin;
  const isDocument = request.mode === 'navigate';
  const isMapTile = url.hostname.includes('tile.openstreetmap.org') || url.hostname.includes('cartocdn.com');

  if (isMapTile) {
    event.respondWith(
      fetch(request).catch(() => caches.match(request))
    );
    return;
  }

  if (isDocument) {
    event.respondWith(
      fetch(request)
        .then(response => {
          const clone = response.clone();
          caches.open(RUNTIME_CACHE).then(cache => cache.put(request, clone));
          return response;
        })
        .catch(() => caches.match(request).then(match => match || caches.match('/index.html')))
    );
    return;
  }

  if (isSameOrigin || url.hostname.includes('unpkg.com')) {
    event.respondWith(
      caches.match(request).then(cached => {
        const networkFetch = fetch(request)
          .then(response => {
            const clone = response.clone();
            caches.open(RUNTIME_CACHE).then(cache => cache.put(request, clone));
            return response;
          })
          .catch(() => cached);

        return cached || networkFetch;
      })
    );
  }
});
