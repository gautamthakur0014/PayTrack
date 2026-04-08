// PayTrack Service Worker — Network-First + Background Sync
// Place at: <project-root>/public/sw.js

const CACHE_NAME = 'paytrack-v4';
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
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  if (request.method !== 'GET') return;
  if (url.origin !== self.location.origin) return;

  // SPA navigation
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((res) => {
          const clone = res.clone();
          caches.open(CACHE_NAME).then((c) => c.put('/index.html', clone));
          return res;
        })
        .catch(() => caches.match('/index.html'))
    );
    return;
  }

  // API — network only, return 503 on failure so Redux falls back to IDB
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

  // Static assets — network first, cache fallback
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
// Triggered automatically by the browser when connectivity is restored.
// The tag 'sync-expenses' is registered by the main thread (see expensesSlice).
self.addEventListener('sync', (event) => {
  if (event.tag === 'sync-expenses') {
    event.waitUntil(runBackgroundSync());
  }
});

async function runBackgroundSync() {
  let db;
  try {
    db = await openIDB();
  } catch (err) {
    console.error('[SW Sync] Cannot open IDB:', err);
    return;
  }

  const queue = await idbGetAll(db, 'sync_queue');
  if (!queue.length) {
    console.log('[SW Sync] Queue empty — nothing to sync');
    return;
  }

  // Grab the access token from localStorage via a client message,
  // or from the IDB cache store as a fallback
  const token = await getAccessToken();
  if (!token) {
    console.warn('[SW Sync] No access token — deferring until main thread syncs');
    return; // Background sync will retry; main thread handles it on reconnect
  }

  console.log(`[SW Sync] Syncing ${queue.length} queued item(s)…`);

  const operations = queue.map(item => ({ op: item.op, data: item.payload }));

  let response;
  try {
    response = await fetch('/api/v1/sync/push', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ operations }),
    });
  } catch (err) {
    console.error('[SW Sync] Network error — will retry:', err.message);
    throw err; // Re-throw so the browser retries the background sync
  }

  if (!response.ok) {
    console.error('[SW Sync] Server error:', response.status);
    if (response.status === 401) return; // Token expired — let main thread refresh
    throw new Error(`Server responded ${response.status}`); // Retry
  }

  const body = await response.json();
  const results = body.data?.results || [];

  // Remove successfully-synced items from the queue
  for (const item of queue) {
    const result = results.find(r => r.localId === item.payload?.localId);
    if (result && !['not_found', 'error'].includes(result.op)) {
      await idbDelete(db, 'sync_queue', item.id);

      // Remove the temp IDB entry (offline_ prefix) — server has the real one now
      if (item.op === 'create' && item.payload?.localId) {
        await idbDelete(db, 'expenses', item.payload.localId).catch(() => {});
      }
    }
  }

  console.log('[SW Sync] Background sync complete:', results);

  // Notify all open tabs so they can refresh from the server
  const clients = await self.clients.matchAll({ type: 'window' });
  clients.forEach(client => client.postMessage({ type: 'SYNC_COMPLETE' }));
}

// ── Token helpers ─────────────────────────────────────────────────────────────

/**
 * Try to get the access token.
 * 1. Ask an open window tab (fastest, always current)
 * 2. Fall back to IDB cache store
 */
async function getAccessToken() {
  // Ask main thread first
  try {
    const clients = await self.clients.matchAll({ type: 'window' });
    if (clients.length > 0) {
      const token = await new Promise((resolve) => {
        const channel = new MessageChannel();
        channel.port1.onmessage = (e) => resolve(e.data?.token || null);
        clients[0].postMessage({ type: 'GET_TOKEN' }, [channel.port2]);
        setTimeout(() => resolve(null), 500); // 500ms timeout
      });
      if (token) return token;
    }
  } catch { /* fall through */ }

  // Fallback: read from IDB cache
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

// ── IDB helpers ───────────────────────────────────────────────────────────────

function openIDB() {
  return new Promise((res, rej) => {
    const req = indexedDB.open('PayTrack_db', 3);
    req.onsuccess = () => res(req.result);
    req.onerror = () => rej(req.error);
    // Don't block on upgradeneeded — the main thread manages schema
    req.onupgradeneeded = () => {};
  });
}

function idbGetAll(db, storeName) {
  return new Promise((res, rej) => {
    try {
      const tx = db.transaction(storeName, 'readonly');
      const req = tx.objectStore(storeName).getAll();
      req.onsuccess = () => res(req.result || []);
      req.onerror = () => rej(req.error);
    } catch (err) { rej(err); }
  });
}

function idbDelete(db, storeName, id) {
  return new Promise((res, rej) => {
    try {
      const tx = db.transaction(storeName, 'readwrite');
      const req = tx.objectStore(storeName).delete(id);
      req.onsuccess = () => res();
      req.onerror = () => rej(req.error);
    } catch (err) { rej(err); }
  });
}

// ── Push ──────────────────────────────────────────────────────────────────────
self.addEventListener('push', (event) => {
  let payload = {
    title: 'PayTrack',
    body:  'You have a new notification',
    icon:  '/favicon.ico',
    tag:   'paytrack',
  };
  try {
    if (event.data) payload = { ...payload, ...event.data.json() };
  } catch (_) {}

  event.waitUntil(
    self.registration.showNotification(payload.title, {
      body:             payload.body,
      icon:             payload.icon || '/favicon.ico',
      badge:            payload.icon || '/favicon.ico',
      data:             payload.data || {},
      vibrate:          [200, 100, 200],
      tag:              payload.tag || 'paytrack',
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

// ── Message handler (main thread → SW) ───────────────────────────────────────
// Used for manual sync trigger and token handshake
self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
