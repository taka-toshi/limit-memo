// sw.js - Service Worker

const CACHE_NAME = 'memo-app-v1';
const ASSETS_TO_CACHE = [
  '/',
  '/index.html',
  '/manifest.json',
  '/css/style.css',
  '/js/app.js',
  '/js/config.js',
  '/js/models/Memo.js',
  '/js/services/InputLimiter.js',
  '/js/services/LocalStorageRepository.js',
  '/js/services/CloudRepository.js',
  '/js/services/GistRepository.js',
  '/js/services/AuthManager.js',
  '/js/services/SyncManager.js',
  '/js/controllers/AppController.js',
  '/icons/icon-192.png',
  '/icons/icon-512.png'
];

/**
 * Service Worker インストール時
 * 必要なアセットをキャッシュ
 */
self.addEventListener('install', (event) => {
  console.log('Service Worker: Installing...');
  
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('Service Worker: Caching assets');
        return cache.addAll(ASSETS_TO_CACHE);
      })
      .then(() => {
        console.log('Service Worker: Installed');
        return self.skipWaiting();
      })
      .catch((error) => {
        console.error('Service Worker: Installation failed', error);
      })
  );
});

/**
 * Service Worker アクティベーション時
 * 古いキャッシュを削除
 */
self.addEventListener('activate', (event) => {
  console.log('Service Worker: Activating...');
  
  event.waitUntil(
    caches.keys()
      .then((cacheNames) => {
        return Promise.all(
          cacheNames.map((cacheName) => {
            if (cacheName !== CACHE_NAME) {
              console.log('Service Worker: Deleting old cache:', cacheName);
              return caches.delete(cacheName);
            }
          })
        );
      })
      .then(() => {
        console.log('Service Worker: Activated');
        return self.clients.claim();
      })
  );
});

/**
 * Fetch イベント
 * Network First 戦略（オンライン優先、オフライン時はキャッシュ）
 */
self.addEventListener('fetch', (event) => {
  const { request } = event;
  
  // GitHub API へのリクエストはキャッシュしない
  if (request.url.includes('api.github.com')) {
    return;
  }
  
  event.respondWith(
    fetch(request)
      .then((response) => {
        // ネットワークから取得成功 → キャッシュを更新
        if (response && response.status === 200) {
          const responseClone = response.clone();
          caches.open(CACHE_NAME)
            .then((cache) => {
              cache.put(request, responseClone);
            });
        }
        return response;
      })
      .catch(() => {
        // ネットワーク失敗 → キャッシュから取得
        return caches.match(request)
          .then((cachedResponse) => {
            if (cachedResponse) {
              console.log('Service Worker: Serving from cache:', request.url);
              return cachedResponse;
            }
            
            // キャッシュにもない場合
            console.log('Service Worker: No cache available for:', request.url);
            return new Response('Offline - Resource not available', {
              status: 503,
              statusText: 'Service Unavailable'
            });
          });
      })
  );
});

/**
 * メッセージイベント
 * アプリからの指示を受け取る
 */
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
  
  if (event.data && event.data.type === 'CACHE_URLS') {
    event.waitUntil(
      caches.open(CACHE_NAME)
        .then((cache) => cache.addAll(event.data.urls))
    );
  }
});

/**
 * Background Sync イベント（将来の拡張用）
 * オフライン時の変更をオンライン復帰時に同期
 */
self.addEventListener('sync', (event) => {
  if (event.tag === 'sync-memo') {
    console.log('Service Worker: Background sync triggered');
    event.waitUntil(
      // ここで同期処理を実行
      // 実装例: IndexedDB から未同期データを取得してAPIに送信
      Promise.resolve()
    );
  }
});
