// Service worker: la app (HTML, CSS, JS, fuentes) funciona sin conexión.
// Los datos de Renfe nunca se cachean aquí: van siempre a la red.
const CACHE = 'trenecitos-__BUILD__';

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(['./'])).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const req = e.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/api/')) return;      // tiempo real: siempre a la red
  // Devuelve lo cacheado al instante y lo refresca en segundo plano.
  e.respondWith(
    caches.open(CACHE).then(async cache => {
      const hit = await cache.match(req, { ignoreSearch: true });
      const net = fetch(req).then(res => {
        if (res.ok) cache.put(req, res.clone());
        return res;
      }).catch(() => hit);
      return hit || net;
    })
  );
});

// Notificación "tu tren" (la crea app.js al salir de la app): tocarla vuelve a la app.
self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const win = all.find(c => new URL(c.url).origin === self.location.origin);
    if (win) return win.focus();
    return self.clients.openWindow('./');
  })());
});
