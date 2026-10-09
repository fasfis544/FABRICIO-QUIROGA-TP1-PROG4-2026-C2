/* Caché SOLO de GET /rpc/cine_cartelera. Ninguna compra, sesión, saldo o PDF. */
const CACHE = 'cine-cartelera-v1';
const MAX_AGE = 7 * 24 * 60 * 60 * 1000;
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (
    event.request.method !== 'GET' ||
    url.pathname !== '/rest/v1/rpc/cine_cartelera' ||
    !url.hostname.endsWith('.supabase.co')
  )
    return;
  // Evitar que ngsw responda al mismo evento: este endpoint tiene SWR explícito.
  event.stopImmediatePropagation();
  const key = url.origin + url.pathname;
  const refresh = fetch(event.request).then(async (response) => {
    if (response.ok && response.headers.get('content-type')?.includes('application/json')) {
      try {
        const headers = new Headers(response.headers);
        headers.set('x-cine-cache-date', String(Date.now()));
        const cache = await caches.open(CACHE);
        const text = await response.clone().text();
        const previous = await cache.match(key);
        const changed = previous && (await previous.text()) !== text;
        await cache.put(key, new Response(text, { status: response.status, headers }));
        if (changed)
          for (const client of await self.clients.matchAll())
            client.postMessage({ tipo: 'cine-cartelera-actualizada' });
      } catch {
        // Caché privada/deshabilitada o sin espacio: conservar la respuesta válida de red.
      }
    }
    return response;
  });
  // SWR: retornar la copia mientras se revalida en segundo plano, incluso con internet.
  event.waitUntil(refresh.then(() => undefined).catch(() => undefined));
  event.respondWith(
    (async () => {
      let cached;
      try {
        const cache = await caches.open(CACHE);
        cached = await cache.match(key);
      } catch {
        // Una falla local de almacenamiento no debe impedir consultar con internet.
      }
      const timestamp = Number(cached?.headers.get('x-cine-cache-date') ?? NaN);
      const age = Date.now() - timestamp;
      if (cached && Number.isFinite(timestamp) && age >= 0 && age < MAX_AGE) {
        const headers = new Headers(cached.headers);
        headers.set('x-cine-cached', 'true');
        return new Response(await cached.text(), { status: 200, headers });
      }
      try {
        return await refresh;
      } catch {
        return new Response(
          JSON.stringify({
            error: 'No hay una cartelera reciente guardada. Conectate a internet.',
          }),
          { status: 503, headers: { 'Content-Type': 'application/json' } },
        );
      }
    })(),
  );
});
// Registrar antes de Angular SW: un solo dueño del evento evita avisos duplicados.
const PUSH_TEXTOS = {
  venta: 'Ya hay entradas disponibles. Consultá la película y sus funciones.',
  recordatorio_24: 'Recordatorio de 24 h: consultá sala, horario y QR en tu cuenta.',
  recordatorio_2: 'Recordatorio de 2 h: consultá sala, horario y QR en tu cuenta.',
  ingreso: 'Se validó tu ingreso a sala. Consultá el estado en tu cuenta.',
  candy: 'Se validó tu retiro de candy. Consultá el estado en tu cuenta.',
};
const PUSH_UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
function destinoPush(destino) {
  return (
    typeof destino === 'string' &&
    (destino === '/perfil/compras' ||
      new RegExp('^/peliculas/' + PUSH_UUID + '$', 'i').test(destino))
  );
}
self.addEventListener('push', (event) => {
  event.stopImmediatePropagation();
  event.waitUntil(
    (async () => {
      let d;
      try {
        d = event.data?.json();
      } catch {
        return;
      }
      if (
        !d ||
        d.tipo !== 'cine-push' ||
        d.version !== 1 ||
        !Object.hasOwn(PUSH_TEXTOS, d.evento) ||
        typeof d.tag !== 'string' ||
        !new RegExp('^cine-push-' + PUSH_UUID + '$', 'i').test(d.tag) ||
        !Number.isFinite(d.vence) ||
        d.vence <= Date.now() ||
        d.vence > Date.now() + 86460000 ||
        !destinoPush(d.destino) ||
        (d.evento !== 'venta' && d.destino !== '/perfil/compras') ||
        (d.evento === 'venta' && !d.destino.startsWith('/peliculas/'))
      )
        return;
      // Mismo delivery-id => misma tag; no reavisar si la notificación aún está presente.
      const existentes = await self.registration.getNotifications({ tag: d.tag });
      if (existentes.length) return;
      await self.registration.showNotification('Cine Aurora', {
        body: PUSH_TEXTOS[d.evento],
        tag: d.tag,
        renotify: false,
        icon: '/icons/icon-192x192.png',
        badge: '/icons/icon-192x192.png',
        data: { cine: 1, destino: d.destino },
      });
    })(),
  );
});
self.addEventListener('notificationclick', (event) => {
  const datos = event.notification.data;
  if (!datos || datos.cine !== 1) return;
  event.stopImmediatePropagation();
  event.notification.close();
  event.waitUntil(
    (async () => {
      // Jamás abrir URLs arbitrarias, query strings, QR o comprobantes portadores.
      const destino = destinoPush(datos.destino) ? datos.destino : '/perfil/compras';
      const url = new URL(destino, self.location.origin).href;
      const ventanas = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      for (const client of ventanas) {
        if (new URL(client.url).origin !== self.location.origin) continue;
        try {
          const abierta = await client.navigate(url);
          if (abierta) {
            await abierta.focus();
            return;
          }
        } catch {
          /* Si la ventana desapareció, abrir una nueva del mismo origen. */
        }
      }
      await self.clients.openWindow(url);
    })(),
  );
});
importScripts('./ngsw-worker.js');
