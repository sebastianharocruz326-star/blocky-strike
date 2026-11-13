// Service worker de Blocky Strike:
//  - permite instalar el juego como app
//  - guarda los archivos para poder jugar contra bots sin internet
//  - NUNCA toca el WebSocket (/ws): el multijugador siempre va directo al servidor
const VERSION = 'blocky-strike-v1.5.1';
const CORE = [
  '/', '/index.html', '/game.js', '/shared.js', '/manifest.webmanifest',
  '/icons/icon-192.png', '/icons/icon-512.png', '/vendor/three.module.js',
];

self.addEventListener('install', e => {
  e.waitUntil((async () => {
    const cache = await caches.open(VERSION);
    // si un archivo falla (p. ej. sin internet), no se cancela la instalación
    await Promise.all(CORE.map(u => cache.add(u).catch(() => {})));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) {
      if (k.startsWith('blocky-strike-') && k !== VERSION) await caches.delete(k);
    }
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.pathname === '/ws' || url.pathname === '/health') return;
  if (url.origin !== self.location.origin && url.hostname !== 'cdn.jsdelivr.net') return;
  e.respondWith(url.pathname.endsWith('three.module.js') ? cacheFirst(req) : networkFirst(req));
});

// Three.js casi nunca cambia: se sirve desde la copia guardada
async function cacheFirst(req) {
  const cache = await caches.open(VERSION);
  const hit = await cache.match(req);
  if (hit) return hit;
  const res = await fetch(req);
  if (res.ok) cache.put(req, res.clone());
  return res;
}

// El juego sí cambia: se pide a internet y, si no hay conexión, se usa la copia guardada
async function networkFirst(req) {
  const cache = await caches.open(VERSION);
  try {
    const res = await Promise.race([
      fetch(req),
      new Promise((_, no) => setTimeout(() => no(new Error('timeout')), 4000)),
    ]);
    if (res && res.ok) cache.put(req, res.clone());
    return res;
  } catch (err) {
    const hit = await cache.match(req, { ignoreSearch: true });
    if (hit) return hit;
    if (req.mode === 'navigate') {
      const home = await cache.match('/');
      if (home) return home;
    }
    return new Response('Sin conexión', { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
  }
}
