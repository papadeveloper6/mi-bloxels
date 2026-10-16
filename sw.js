'use strict';

// Service worker de Mi Bloxels: guarda la app en el aparato para usarla sin internet.
// AL PUBLICAR CAMBIOS: sube VERSION aquí y el ?v= de index.html al mismo número.
const VERSION = 9;
const CACHE = `mi-bloxel-v${VERSION}`;
const ARCHIVOS = [
  './',
  `css/estilos.css?v=${VERSION}`,
  ...['datos', 'dialogo', 'foto', 'editor', 'personaje', 'mundo', 'juego', 'app'].map(n => `js/${n}.js?v=${VERSION}`),
  'manifest.webmanifest',
  'iconos/icono-192.png',
  'iconos/icono-512.png',
  'iconos/apple-touch-icon.png',
];

self.addEventListener('install', e => {
  // cache: 'reload' para no guardar copias viejas de la caché HTTP del navegador
  e.waitUntil(
    caches.open(CACHE)
      .then(c => c.addAll(ARCHIVOS.map(u => new Request(u, { cache: 'reload' }))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(claves => Promise.all(claves.filter(k => k.startsWith('mi-bloxel-') && k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  if (req.mode === 'navigate') { e.respondWith(pagina(req)); return; }
  // CSS, JS e iconos llevan versión en la URL: si están guardados no cambian
  e.respondWith(caches.match(req).then(guardado => guardado || fetch(req).then(resp => {
    if (resp.ok) {
      const copia = resp.clone();
      caches.open(CACHE).then(c => c.put(req, copia));
    }
    return resp;
  })));
});

// La página se pide primero a internet (así siempre llega la última versión);
// sin conexión, o si tarda más de 4 segundos, se usa la copia guardada.
async function pagina(req) {
  const cache = await caches.open(CACHE);
  try {
    const resp = await Promise.race([
      fetch(req.url, { cache: 'no-cache', credentials: 'same-origin' }),
      new Promise((_, falla) => setTimeout(() => falla(new Error('lento')), 4000)),
    ]);
    if (resp.ok) cache.put('./', resp.clone());
    return resp;
  } catch (err) {
    return (await cache.match('./')) || (await caches.match('./')) || Response.error();
  }
}
