// PayTrack Service Worker — Network-First Strategy
// Place at: <project-root>/public/sw.js

const CACHE_NAME = 'paytrack-v3';
const SHELL_URLS = ['/', '/index.html'];

// ── Install ──────────────────────────────────────────────────────────────────
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(SHELL_URLS))
      .then(() => self.skipWaiting())
  );
});

// ── Activate ─────────────────────────────────────────────────────────────────
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

// ── Fetch — Network-First ─────────────────────────────────────────────────────
// Strategy:
//   1. Always try the network first
//   2. On success → cache the response & return it
//   3. On network failure → fall back to cache
//   4. API requests are also network-first; on failure we return 503 so the
//      app slice falls back to IndexedDB (no silent blank screens)
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Only handle same-origin GET requests
  if (request.method !== 'GET') return;
  if (url.origin !== self.location.origin) return;

  // ── SPA navigation ────────────────────────────────────────────────────────
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((res) => {
          // Cache a fresh copy of the shell
          const clone = res.clone();
          caches.open(CACHE_NAME).then((c) => c.put('/index.html', clone));
          return res;
        })
        .catch(() => caches.match('/index.html'))
    );
    return;
  }

  // ── API requests — Network-First, no caching ──────────────────────────────
  // On offline the axios interceptor / Redux slice will fall back to IDB.
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(
      fetch(request).catch(() =>
        new Response(JSON.stringify({ success: false, message: 'Offline' }), {
          status: 503,
          headers: { 'Content-Type': 'application/json' },
        })
      )
    );
    return;
  }

  // ── Static assets — Network-First, then cache ─────────────────────────────
  event.respondWith(
    fetch(request)
      .then((res) => {
        if (res && res.status === 200) {
          const clone = res.clone();
          caches.open(CACHE_NAME).then((c) => c.put(request, clone));
        }
        return res;
      })
      .catch(() => caches.match(request))
  );
});

// ── Background Sync ───────────────────────────────────────────────────────────
self.addEventListener('sync', (event) => {
  if (event.tag === 'sync-expenses') {
    event.waitUntil(syncExpenses());
  }
});

async function syncExpenses() {
  let db;
  try {
    db = await openIDB();
  } catch (err) {
    console.error('[SW] Could not open IDB for sync:', err);
    return;
  }

  const items = await idbGetAll(db, 'sync_queue');
  for (const item of items) {
    try {
      const token = await getAccessToken();
      const res = await fetch('/api/v1/expenses', {
        method: item.method || 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(item.payload || item.data),
      });
      if (res.ok) {
        await idbDelete(db, 'sync_queue', item.id);
      }
    } catch (err) {
      console.error('[SW] Sync item failed:', err);
    }
  }
}

// Grab access token from IDB cache store
async function getAccessToken() {
  try {
    const db = await openIDB();
    const tx = db.transaction('cache', 'readonly');
    const store = tx.objectStore('cache');
    return new Promise((res) => {
      const req = store.get('access_token');
      req.onsuccess = () => res(req.result?.value || null);
      req.onerror = () => res(null);
    });
  } catch { return null; }
}

function openIDB() {
  return new Promise((res, rej) => {
    const req = indexedDB.open('PayTrack_db', 2);
    req.onsuccess = () => res(req.result);
    req.onerror = () => rej(req.error);
  });
}

function idbGetAll(db, storeName) {
  return new Promise((res, rej) => {
    const tx = db.transaction(storeName, 'readonly');
    const req = tx.objectStore(storeName).getAll();
    req.onsuccess = () => res(req.result || []);
    req.onerror = () => rej(req.error);
  });
}

function idbDelete(db, storeName, id) {
  return new Promise((res, rej) => {
    const tx = db.transaction(storeName, 'readwrite');
    const req = tx.objectStore(storeName).delete(id);
    req.onsuccess = () => res();
    req.onerror = () => rej(req.error);
  });
}

// ── Push ──────────────────────────────────────────────────────────────────────
self.addEventListener('push', (event) => {
  let payload = {
    title: 'PayTrack',
    body: 'You have a new notification',
    icon: '/favicon.ico',
    tag: 'paytrack',
  };
  try {
    if (event.data) payload = { ...payload, ...event.data.json() };
  } catch (_) {}

  event.waitUntil(
    self.registration.showNotification(payload.title, {
      body: payload.body,
      icon: payload.icon,
      badge: payload.icon,
      data: payload.data || {},
      vibrate: [200, 100, 200],
      tag: payload.tag,
      requireInteraction: false,
    })
  );
});

// ── Notification click ────────────────────────────────────────────────────────
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = event.notification.data?.url || '/notifications';
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      const existing = windowClients.find((w) => w.url.startsWith(self.location.origin));
      if (existing) { existing.focus(); return existing.navigate(targetUrl); }
      return clients.openWindow(targetUrl);
    })
  );
});
