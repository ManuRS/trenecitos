// Tubería hacia los feeds GTFS-RT de Renfe, que no envían cabeceras CORS.
// Solo se ejecuta cuando alguien abre la app, no guarda nada y la caché de borde
// de 15 s hace que muchos usuarios compartan una única petición a Renfe.

const FEEDS = {
  trip_updates: 'https://gtfsrt.renfe.com/trip_updates.json',
  vehicle_positions: 'https://gtfsrt.renfe.com/vehicle_positions.json',
  alerts: 'https://gtfsrt.renfe.com/alerts.json',
};

const json = (body, status) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } });

export async function onRequestGet({ params }) {
  const url = FEEDS[params.feed];
  if (!url) return json({ error: 'feed desconocido' }, 404);

  let up;
  try {
    up = await fetch(url, {
      headers: { accept: 'application/json' },
      signal: AbortSignal.timeout(8000),
      cf: { cacheTtl: 15, cacheEverything: true },
    });
  } catch (e) {
    return json({ error: 'no se pudo contactar con Renfe', detail: String(e && e.message || e) }, 502);
  }
  if (!up.ok) return json({ error: 'Renfe respondió con error', status: up.status }, 502);

  return new Response(up.body, {
    status: 200,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'public, max-age=10, s-maxage=15',
      'x-upstream-cache': up.headers.get('cf-cache-status') || '',
    },
  });
}
