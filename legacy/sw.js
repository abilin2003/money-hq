// Network-first service worker: always try the network, so updates show straight away.
// The cache is only a fallback for when you're offline. Saved money data lives in IndexedDB, not here.
const CACHE = 'money-hq-shell-v7';
const SHELL = [
  './',
  'index.html',
  'css/style.css',
  'css/theme.css',
  'js/demo.js',
  'js/app.js',
  'js/store.js',
  'js/backup.js',
  'js/crypto.js',
  'js/ui.js',
  'js/kit.js',
  'js/charts.js',
  'js/money.js',
  'js/seed.js',
  'js/csv.js',
  'js/classify.js',
  'js/dedupe.js',
  'js/importer.js',
  'js/oldbackup.js',
  'js/paycycle.js',
  'js/quick.js',
  'js/txfilter.js',
  'js/insights.js',
  'js/dashboard.js',
  'js/finance.js',
  'js/analytics.js',
  'js/advice.js',
  'js/views/hq.js',
  'js/views/spending.js',
  'js/views/savings.js',
  'js/views/wealth.js',
  'js/views/planning.js',
  'js/views/settings.js',
  'js/views/add.js',
  'js/views/transactions.js',
  'js/views/import.js',
  'js/views/data.js',
  'manifest.webmanifest',
  'icons/icon.svg',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/apple-touch-icon.png',
];

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(SHELL)));
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) {
      if (key !== CACHE) await caches.delete(key);
    }
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) return;

  event.respondWith((async () => {
    try {
      const response = await fetch(request);
      if (response.ok) {
        const cache = await caches.open(CACHE);
        cache.put(request, response.clone());
      }
      return response;
    } catch {
      return (await caches.match(request)) || (await caches.match('index.html'));
    }
  })());
});
