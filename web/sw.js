// Offline-Betrieb: die Seite und ihre Skripte landen beim ersten Besuch im Cache. Online wird immer zuerst
// die neueste Version geladen (und der Cache erneuert), ohne Netz kommt die Seite aus dem Cache.
// Die Spielkopie selbst liegt ohnehin im Browser (IndexedDB), damit läuft das Spiel komplett offline.
const CACHE = 'kelloggs-v1';
const SHELL = ['./', 'index.html', 'main.js', 'worker.js', 'machine.js', 'cpu.js', 'vga.js', 'pit.js', 'sb.js', 'ne.js',
  'scene.js', 'state.js', 'gl.js', 'zip.js', 'audio-worklet.js', 'manifest.webmanifest', 'icons/icon-192.png', 'icons/icon-512.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  const fonts = /fonts\.(googleapis|gstatic)\.com$/.test(url.hostname);
  if (url.origin !== location.origin && !fonts) return;
  e.respondWith(fetch(req).then((res) => {
    if (res.ok || res.type === 'opaque') { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); }
    return res;
  }).catch(() => caches.match(req, { ignoreSearch: true }).then((r) => r || Response.error())));
});
