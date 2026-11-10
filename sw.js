/* eslint-disable no-restricted-globals */
/**
 * Service Worker：把整个 App（含 620KB 引擎）缓存到本机，
 * 装到主屏幕以后断网也能用。
 * 改了文件就把 VERSION 加一，用户下次打开会收到更新提示。
 */

const VERSION = 'v1.4.0';
const CACHE = 'pocket-devcpp-' + VERSION;

const ASSETS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './css/app.css',
  './js/app.js',
  './js/editor.js',
  './js/highlight.js',
  './js/storage.js',
  './js/runner.js',
  './js/engine-online.js',
  './js/struct-compat.js',
  './js/scanf-compat.js',
  './js/text-compat.js',
  './js/enum-compat.js',
  './js/errors.js',
  './js/examples.js',
  './vendor/JSCPP.es5.min.js',
  './icons/icon-180.png',
  './icons/icon-192.png',
  './icons/icon-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(ASSETS)));
});

// 页面点"立即更新"时，让等待中的新版本立刻接管
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  // 在线编译器（第三方 API）永远走网络，不缓存
  if (url.origin !== location.origin) return;

  event.respondWith(
    caches.match(req).then((hit) => {
      if (hit) return hit;
      return fetch(req).then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((cache) => cache.put(req, copy)).catch(() => {});
        return res;
      }).catch(() => caches.match('./index.html'));
    })
  );
});
