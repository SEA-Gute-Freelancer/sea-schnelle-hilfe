// ================================================================
// SEA Schnelle Hilfe — Service Worker
// Enables offline capability and PWA installation
// ================================================================

const CACHE_NAME = 'sea-hilfe-v1';

// Assets to cache on install (app shell)
const PRECACHE = [
  '/',
  '/index.html',
  '/manifest.json',
];

// ----------------------------------------------------------------
// INSTALL: precache the app shell
// ----------------------------------------------------------------
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(PRECACHE))
  );
  self.skipWaiting();
});

// ----------------------------------------------------------------
// ACTIVATE: clean up old caches
// ----------------------------------------------------------------
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(key => key !== CACHE_NAME)
          .map(key => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

// ----------------------------------------------------------------
// FETCH: network-first for API calls, cache-first for assets
// ----------------------------------------------------------------
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // Always go network-first for API/backend calls
  if (url.pathname.startsWith('/send') || url.pathname.startsWith('/messages')) {
    event.respondWith(
      fetch(event.request).catch(() =>
        new Response(JSON.stringify({ error: 'offline' }), {
          headers: { 'Content-Type': 'application/json' },
        })
      )
    );
    return;
  }

  // Cache-first for CDN resources (Tailwind, Lucide, fonts)
  if (
    url.origin !== location.origin &&
    (url.host.includes('cdn.tailwindcss.com') ||
     url.host.includes('unpkg.com') ||
     url.host.includes('fonts.googleapis.com') ||
     url.host.includes('fonts.gstatic.com'))
  ) {
    event.respondWith(
      caches.match(event.request).then(
        cached => cached || fetch(event.request).then(res => {
          const clone = res.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
          return res;
        })
      )
    );
    return;
  }

  // Network-first for same-origin requests, fallback to cache
  event.respondWith(
    fetch(event.request)
      .then(res => {
        const clone = res.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
        return res;
      })
      .catch(() => caches.match(event.request))
  );
});

// ----------------------------------------------------------------
// PUSH NOTIFICATIONS (for future use)
// ----------------------------------------------------------------
self.addEventListener('push', event => {
  if (!event.data) return;
  const data = event.data.json();
  event.waitUntil(
    self.registration.showNotification(data.title || 'SEA Schnelle Hilfe', {
      body:    data.body || 'Neue Nachricht vom SEA-Kollektiv',
      icon:    '/icons/icon-192.png',
      badge:   '/icons/icon-192.png',
      vibrate: [200, 100, 200],
      data:    { url: '/' },
    })
  );
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  event.waitUntil(clients.openWindow('/'));
});
