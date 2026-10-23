// CHATS service worker: offline app shell, end-to-end encrypted push previews, share target.
// Push payloads carry the message ciphertext; it is decrypted here with the chat key the app stored (sealed with the device key).
import { idbGet, idbSet } from '#shared/core/idb.js';
import { unb64, te, td } from '#shared/core/bytes.js';
import { normalizeBody } from '#shared/core/messages.js';
import { VERSION } from '#shared/core/build.js';

const CACHE = 'chats-shell-' + VERSION;
const SHELL = ['./', 'index.html', 'manifest.webmanifest', 'icons/icon-192.png', 'icons/favicon-32.png', 'icons/favicon.svg', 'icons/apple-touch-icon.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).catch(() => {}));
});

self.addEventListener('message', e => { if (e.data === 'skipWaiting') self.skipWaiting(); });

self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k !== CACHE) await caches.delete(k);
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', e => {
  const req = e.request;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;
  const scope = new URL(self.registration.scope);
  const rel = url.pathname.slice(scope.pathname.length);
  if (req.method === 'POST' && rel === 'share-target') return e.respondWith(shareTarget(req));
  if (req.method !== 'GET' || rel.startsWith('api/') || rel.startsWith('admin')) return;
  if (req.mode === 'navigate') {
    e.respondWith(fetch(req).then(res => {
      if (res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put('index.html', copy)); }
      return res;
    }).catch(() => caches.match('index.html')));
    return;
  }
  if (SHELL.includes(rel) || rel.startsWith('icons/') || rel.startsWith('fonts/')) {
    e.respondWith(caches.match(req).then(hit => hit || fetch(req).then(res => { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); return res; })));
  }
});

async function shareTarget(req) {
  try {
    const fd = await req.formData();
    const files = [];
    for (const f of fd.getAll('files')) if (f && typeof f === 'object' && f.size) files.push({ name: f.name || 'file', type: f.type || '', size: f.size, data: await f.arrayBuffer() });
    await idbSet('share', { files, title: fd.get('title') || '', text: fd.get('text') || '', url: fd.get('url') || '' });
  } catch { /* nothing to share */ }
  return Response.redirect(new URL('./?share=1', self.registration.scope).href, 303);
}

// ---- push

async function deviceOpen(blob) {
  const k = await idbGet('devkey');
  const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: blob.subarray(0, 12), additionalData: te.encode('device') }, k, blob.subarray(12));
  return JSON.parse(td.decode(pt));
}

async function decryptMsg(keyB64, ct, chatId) {
  const raw = unb64(ct);
  const k = await crypto.subtle.importKey('raw', unb64(keyB64), 'AES-GCM', false, ['decrypt']);
  const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: raw.subarray(0, 12), additionalData: te.encode(chatId) }, k, raw.subarray(12));
  return JSON.parse(td.decode(pt));
}

function previewOf(b) {
  b = normalizeBody(b);
  if (!b) return 'new message';
  if (b.t === 'text') return b.text.slice(0, 120);
  if (b.t === 'image') return '[photo] ' + ((b.f || {}).n || '') + (b.f ? ' · ' + Math.max(1, Math.round(b.f.s / 1024)) + ' KB' : '');
  if (b.t === 'file') return '[file] ' + ((b.f || {}).n || '');
  if (b.t === 'contact') return '[contact]';
  return 'new message';
}

self.addEventListener('push', e => {
  e.waitUntil((async () => {
    let p = {};
    try { p = e.data ? e.data.json() : {}; } catch { /* empty push */ }
    const opts = { icon: 'icons/icon-192.png', badge: 'icons/favicon-32.png', renotify: true, data: p };
    if (p.type === 'announce') {
      return self.registration.showNotification('CHATS · ' + (p.server || 'server'), { ...opts, body: p.body || '', tag: 'announce-' + p.id });
    }
    const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    if (wins.some(w => w.visibilityState === 'visible' && w.focused)) return;
    let title = 'CHATS', body = 'new message';
    try {
      const rec = await idbGet('pushkeys');
      const k = rec && await deviceOpen(rec);
      const chat = k && k.chats[p.chat];
      if (k && !k.lock && chat) {
        const from = k.people[p.from] || p.fromName || 'someone';
        const text = p.ct && chat.k ? previewOf(await decryptMsg(chat.k, p.ct, p.chat)) : 'new message';
        const group = chat.t === 'group';
        const prev = (await self.registration.getNotifications({ tag: p.chat }))[0];
        const n = prev && prev.data && prev.data.count ? prev.data.count + 1 : 1;
        title = (group ? '#' + (chat.n || 'group') : from) + (p.type === 'mention' ? ' · @you' : '') + (n > 1 ? ' · ' + n + ' new' : '');
        body = (group ? from + ': ' : '') + text + (n > 1 && prev ? ' · +' + (n - 1) + ' more' : '');
        opts.data = { ...p, count: n };
      }
    } catch { /* key locked or missing: generic text, never names */ }
    opts.actions = [{ action: 'open', title: 'open' }, { action: 'read', title: 'mark read' }];
    await self.registration.showNotification(title, { ...opts, body, tag: p.chat || 'chats' });
    if (self.navigator && 'setAppBadge' in self.navigator) self.navigator.setAppBadge().catch(() => {});
  })());
});

self.addEventListener('notificationclick', e => {
  const p = e.notification.data || {};
  e.notification.close();
  e.waitUntil((async () => {
    if (e.action === 'read' && p.chat && p.id) {
      try {
        const k = await deviceOpen(await idbGet('pushkeys'));
        await fetch(k.base + '?r=chat/update', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + k.token }, body: JSON.stringify({ chat: p.chat, read: p.id }) });
      } catch { /* offline */ }
      return;
    }
    const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    if (wins.length) {
      const w = wins[0];
      await w.focus();
      if (p.chat) w.postMessage({ type: 'open-chat', chat: p.chat });
      return;
    }
    await self.clients.openWindow(new URL('./' + (p.chat ? '?chat=' + encodeURIComponent(p.chat) : ''), self.registration.scope).href);
  })());
});
