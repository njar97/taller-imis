/* Taller IMIS — Service Worker
 * Estrategia:
 *  - La página (HTML): primero internet, con 4 s de espera; sin señal, la guardada.
 *  - Iconos y demás same-origin: stale-while-revalidate.
 *  - CDN externos (jsdelivr/cdnjs): cache-first.
 *  - Supabase API: nunca cachear (datos siempre en vivo).
 *  - Update flow: SW nuevo queda en "waiting" hasta que el cliente lo libera
 *    via postMessage SKIP_WAITING (botón "Actualizar" del banner).
 */
const CACHE_VERSION = 'v20261127-230351';
const CACHE_NAME = `taller-imis-${CACHE_VERSION}`;
const PRECACHE_URLS = [
  './',
  'produccion.html',
  'manifest.webmanifest',
  'icon-192.png',
  'icon-512.png',
  'apple-touch-icon.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) =>
      cache.addAll(PRECACHE_URLS).catch((err) => {
        // No romper la instalación si algún recurso opcional falla.
        console.warn('[SW] precache parcial:', err);
      })
    )
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(
      keys
        .filter((k) => k.startsWith('taller-imis-') && k !== CACHE_NAME)
        .map((k) => caches.delete(k))
    );
    await self.clients.claim();
  })());
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  let url;
  try { url = new URL(req.url); } catch { return; }

  // Supabase: nunca cachear (auth, rest, realtime, storage)
  if (url.hostname.endsWith('supabase.co') || url.hostname.endsWith('supabase.in')) {
    return;
  }

  // CDN externos: cache-first con fallback a red
  if (
    url.hostname.endsWith('jsdelivr.net') ||
    url.hostname.endsWith('cdnjs.cloudflare.com') ||
    url.hostname.endsWith('unpkg.com')
  ) {
    event.respondWith(cacheFirst(req));
    return;
  }

  // Same-origin: la página se pide primero a internet (siempre la última
  // versión); si no hay señal o tarda, se usa la guardada. Lo demás (iconos),
  // guardado primero.
  if (url.origin === self.location.origin) {
    const esPagina = req.mode === 'navigate' || url.pathname.endsWith('.html') || url.pathname.endsWith('/');
    event.respondWith(esPagina ? redPrimero(req) : staleWhileRevalidate(req));
  }
});

async function redPrimero(req) {
  const cache = await caches.open(CACHE_NAME);
  const guardada = async () =>
    (await cache.match(req, { ignoreSearch: true })) || (await cache.match('produccion.html'));
  try {
    const ctrl = new AbortController();
    const reloj = setTimeout(() => ctrl.abort(), 4000);
    const res = await fetch(req.url, { cache: 'no-cache', signal: ctrl.signal });
    clearTimeout(reloj);
    if (res && res.ok && res.type === 'basic') {
      cache.put(req, res.clone());
      return res;
    }
    return (await guardada()) || res;
  } catch (err) {
    return (await guardada()) || Response.error();
  }
}

async function cacheFirst(req) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(req);
  if (cached) return cached;
  try {
    const res = await fetch(req);
    if (res && res.ok && (res.type === 'basic' || res.type === 'cors')) {
      cache.put(req, res.clone());
    }
    return res;
  } catch (err) {
    return cached || Response.error();
  }
}

async function staleWhileRevalidate(req) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(req);
  const networkPromise = fetch(req)
    .then((res) => {
      if (res && res.ok && res.type === 'basic') {
        cache.put(req, res.clone());
      }
      return res;
    })
    .catch(() => cached);
  return cached || networkPromise;
}
