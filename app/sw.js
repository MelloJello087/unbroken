/* Motif offline support (service worker). Keeps the last good copy of the app, its account library and fonts, so Motif opens without a connection.
   The page itself is always fetched fresh first, so an update shows on the next open; the saved copy is used only when the network fails or stalls.
   Account data (anything from Supabase) is never stored here. tools/standalone.sh copies this file next to the page and fills in VERSION. */
const VERSION = '__VERSION__', CACHE = 'motif-' + VERSION, PAGE = new URL('./', self.registration.scope).href;
const KEEP = /^https:\/\/(cdn\.jsdelivr\.net\/npm\/@supabase\/supabase-js@[\d.]+\/|fonts\.googleapis\.com\/css2|fonts\.gstatic\.com\/)/;
self.addEventListener('install', e => { e.waitUntil(caches.open(CACHE).then(c => c.add(new Request(PAGE, { cache: 'reload' }))).catch(() => {}).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k.startsWith('motif-') && k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', e => {
  const r = e.request, u = new URL(r.url);
  if (r.method !== 'GET') return;
  if (r.mode === 'navigate' && u.origin === location.origin) {
    const net = fetch(r, { cache: 'no-store' }).then(res => { if (res.ok) { const c = res.clone(); e.waitUntil(caches.open(CACHE).then(x => x.put(PAGE, c))); } return res; });
    e.waitUntil(net.catch(() => {}));
    e.respondWith(new Promise(ok => {
      let done = false; const send = x => { if (!done && x) { done = true; ok(x); } };
      const slow = setTimeout(() => caches.match(PAGE).then(send), 4000);   // a stalled connection: show the saved copy, update in the background
      net.then(res => { clearTimeout(slow); send(res); }, () => { clearTimeout(slow); caches.match(PAGE).then(m => send(m || Response.error())); });
    }));
    return;
  }
  if (KEEP.test(r.url)) e.respondWith(caches.match(r).then(m => m || fetch(r).then(res => { if (res.ok || res.type === 'opaque') { const c = res.clone(); e.waitUntil(caches.open(CACHE).then(x => x.put(r, c))); } return res; })));
});
