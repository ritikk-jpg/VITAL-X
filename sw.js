/**
 * VITAL-X // TACTICAL EDGE NODE
 * Offline Service Worker Engine (sw.js)
 * Strategy: Strict Cache-First -> Fallback to Network -> Fallback to ./index.html
 * Guarantees 100% execution in Airplane Mode / Zero-Connectivity environments.
 */
'use strict';

const CACHE_NAME = 'vital-x-v1';

const CORE_ASSETS = [
  './',
  './index.html',
  './style.css',
  './app.js',
  './db.js',
  './manifest.json',
  './vendor/qrcode.min.js',
  './vendor/jsQR.min.js'
];

// 1. INSTALL: Pre-cache all core local assets and activate immediately
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[VITAL-X SW] Pre-caching core tactical assets:', CACHE_NAME);
      return cache.addAll(CORE_ASSETS);
    }).then(() => self.skipWaiting())
  );
});

// 2. ACTIVATE: Purge outdated caches and claim all active clients immediately
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((name) => {
          if (name !== CACHE_NAME) {
            console.log('[VITAL-X SW] Purging outdated cache:', name);
            return caches.delete(name);
          }
          return null;
        })
      );
    }).then(() => self.clients.claim())
  );
});

// 3. FETCH: Strict Cache-First (Fallback to Network -> Fallback to ./index.html)
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      // Serve immediately from cache without touching the network
      if (cachedResponse) {
        return cachedResponse;
      }

      // If unavailable in cache, attempt network fetch; if both fail, return ./index.html
      return fetch(event.request)
        .then((networkResponse) => {
          if (
            networkResponse &&
            networkResponse.status === 200 &&
            (networkResponse.type === 'basic' || networkResponse.type === 'cors')
          ) {
            const responseClone = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(event.request, responseClone);
            });
          }
          return networkResponse;
        })
        .catch(() => {
          // Airplane mode / zero-connectivity fallback
          return caches.match('./index.html');
        });
    })
  );
});
