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
globalThis.addEventListener('install', (event) => {
  // Service Worker: Installing
  
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        // Service Worker: Caching assets
        return cache.addAll(ASSETS_TO_CACHE);
      })
      .then(() => {
        // Service Worker: Installed
        return globalThis.skipWaiting();
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
globalThis.addEventListener('activate', (event) => {
  // Service Worker: Activating
  
  event.waitUntil(
    caches.keys()
      .then((cacheNames) => {
        return Promise.all(
          cacheNames.map((cacheName) => {
            if (cacheName !== CACHE_NAME) {
              // Deleting old cache: ${cacheName}
              return caches.delete(cacheName);
            }
          })
        );
      })
      .then(() => {
        // Service Worker: Activated
        return globalThis.clients.claim();
      })
  );
});

/**
 * Fetch イベント
 * Network First 戦略（オンライン優先、オフライン時はキャッシュ）
 */
globalThis.addEventListener('fetch', (event) => {
  const { request } = event;
  // Skip non-http(s) schemes (e.g., chrome-extension://)
  try {
    const urlObj = new URL(request.url);
    if (urlObj.protocol !== 'http:' && urlObj.protocol !== 'https:') {
      return; // do not handle non-http(s) requests
    }

    // Skip GitHub API / auth endpoints and other external APIs from caching
    if (urlObj.hostname.includes('github.com') || urlObj.hostname.includes('api.github.com')) {
      // Let the browser handle network-only for auth/API calls
      return;
    }
  } catch (e) {
    // If URL parsing fails, skip handling
    console.warn('Failed to parse URL:', request.url);
    return;
  }
  
  event.respondWith(
    fetch(request)
      .then((response) => {
        // ネットワークから取得成功 → キャッシュを更新
        if (response?.status === 200) {
          const responseClone = response.clone();
          // Only attempt to cache same-origin http(s) responses
          try {
            const reqUrl = new URL(request.url);
            if (reqUrl.protocol === 'http:' || reqUrl.protocol === 'https:') {
              caches.open(CACHE_NAME)
                .then((cache) => {
                  cache.put(request, responseClone).catch(() => {/* ignore unsupported requests */});
                });
            }
          } catch (e) {
            // ignore
            console.warn('Failed to parse URL:', request.url);
          }
        }
        return response;
      })
      .catch(() => {
        // ネットワーク失敗 → キャッシュから取得
        return caches.match(request)
          .then((cachedResponse) => {
            if (cachedResponse) {
              // Serving from cache: ${request.url}
              return cachedResponse;
            }
            
            // キャッシュにもない場合
            // No cache available for: ${request.url}
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
globalThis.addEventListener('message', (event) => {
  // 受信元 origin を検証して同一オリジン以外は無視する
  let sourceOrigin = null;
  try {
    if (event.source?.url) {
      sourceOrigin = new URL(event.source.url).origin;
    } else if (event.origin) {
      sourceOrigin = event.origin;
    }
  } catch (e) {
    console.warn('Failed to parse message origin:', e);
    sourceOrigin = null;
  }

  // 許可する origin（現在は同一オリジンのみ）
  const allowedOrigins = [globalThis.location?.origin].filter(Boolean);

  if (!sourceOrigin || !allowedOrigins.includes(sourceOrigin)) {
    // 信頼できない送信元からのメッセージは無視
    return;
  }

  const msg = event.data || {};
    if (msg.type === 'SKIP_WAITING') {
    globalThis.skipWaiting();
    return;
  }

    if (msg.type === 'CACHE_URLS' && Array.isArray(msg.urls)) {
    event.waitUntil(
      caches.open(CACHE_NAME).then((cache) => cache.addAll(msg.urls))
    );
    return;
  }
});

/**
 * Background Sync イベント（将来の拡張用）
 * オフライン時の変更をオンライン復帰時に同期
 */
globalThis.addEventListener('sync', (event) => {
  if (event.tag === 'sync-memo') {
    // Background sync triggered
    event.waitUntil(
      // ここで同期処理を実行
      // 実装例: IndexedDB から未同期データを取得してAPIに送信
      Promise.resolve()
    );
  }
});
