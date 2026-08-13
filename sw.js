'use strict';
/*
 * LARVA（ラルファ）― Service Worker
 * 静的アセットをキャッシュし、オフラインでも起動・プレイできるようにする。
 * ファイルを更新したら CACHE_NAME のバージョンを必ず上げること
 * （上げ忘れるとブラウザが古いキャッシュを返し続け、「直したはずなのに直っていない」事故につながる）。
 */
const CACHE_NAME = 'larva-cache-v2';

const PRECACHE_URLS = [
  './',
  './index.html',
  './mask-game.js',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
  './icon-512-maskable.png',
  './cards/card-attendant.png',
  './cards/card-musician.png',
  './cards/card-fortune.png',
  './cards/card-noble_lady.png',
  './cards/card-spy.png',
  './cards/card-jester.png',
  './cards/card-taster.png',
  './cards/card-black_knight.png',
  './cards/card-grand_duke.png',
  './cards/card-masked_host.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(PRECACHE_URLS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  // 他オリジン（Google Fonts等）はSWを介さず素通しにする（フォントはネットワーク／ブラウザキャッシュに任せる）
  if (url.origin !== self.location.origin) return;

  event.respondWith(
    caches.match(req).then((cached) => {
      const network = fetch(req).then((res) => {
        if (res && res.status === 200) {
          const resClone = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(req, resClone));
        }
        return res;
      }).catch(() => cached);
      // キャッシュ優先。無ければネットワークへ（取得できたものは以後のためにキャッシュへ保存）
      return cached || network;
    })
  );
});
