// Retires the previous app's offline helper (service worker).
// The old app registered sw.js at /money-hq/ and cached its files as "money-hq-shell-v…". When a phone that used
// it next checks for an update, it gets this file instead. This version deletes those cached files, removes
// itself and reloads open pages, so they load the new app from the network.
// It only deletes the old app's file cache: data saved in the old app (IndexedDB) is not touched.
// The new app does not register a service worker, so nothing else ever loads this file.

self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names.filter((n) => n.startsWith('money-hq-shell')).map((n) => caches.delete(n)));
    await self.registration.unregister();
    const pages = await self.clients.matchAll({ type: 'window' });
    for (const page of pages) page.navigate(page.url);
  })());
});

// While it's still active, never answer from a cache: always go to the network.
self.addEventListener('fetch', () => {});
