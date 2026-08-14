'use strict';
/*
 * MASCARADE ― Service Worker
 * 静的アセットをキャッシュし、オフラインでも起動・プレイできるようにする。
 * ファイルを更新したら CACHE_NAME のバージョンを必ず上げること
 * （上げ忘れるとブラウザが古いキャッシュを返し続け、「直したはずなのに直っていない」事故につながる）。
 */
const CACHE_NAME = 'mascarade-cache-v1';

// カード画像は mask-game.js 内にBase64で埋め込み済みのため、
// 個別のcards/以下の画像はプリキャッシュ対象に含めない
// （cards/フォルダが同梱されていない環境でもインストールが失敗しないようにするため）。
const PRECACHE_URLS = [
  './',
  './index.html',
  './mask-game.js',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
  './icon-512-maskable.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => Promise.all(
        // 1つのURLの取得に失敗しても他のプリキャッシュを道連れにしない（addAllは全滅するため使わない）
        PRECACHE_URLS.map((url) => cache.add(url).catch((err) => {
          console.warn('[SW] precache failed for', url, err);
        }))
      ))
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

  // アプリ本体（HTML/JS）は「ネットワーク優先」にする。
  // これにより、GitHubへpush→デプロイ後にアプリを開き直すだけで最新版に更新される。
  // オフライン時のみ、直近にキャッシュした版にフォールバックする。
  const isAppShell = req.mode === 'navigate' || url.pathname.endsWith('.html') || url.pathname.endsWith('.js') || url.pathname === '/' || url.pathname.endsWith('/');
  if (isAppShell) {
    event.respondWith(
      fetch(req).then((res) => {
        if (res && res.status === 200) {
          const resClone = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(req, resClone));
        }
        return res;
      }).catch(() => caches.match(req))
    );
    return;
  }

  // アイコンやマニフェストなど、めったに変わらない静的資産は「キャッシュ優先」のまま
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
