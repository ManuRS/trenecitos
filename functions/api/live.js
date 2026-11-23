// Los dos feeds de tiempo real que usa la app (trenes y posiciones) en una sola petición.
// Así cada refresco de la app cuenta como UNA invocación de la Function en lugar de dos.
// Si uno de los dos falla, se devuelve el otro y el que falta va a null.

const FEEDS = {
  trip_updates: 'https://gtfsrt.renfe.com/trip_updates.json',
  vehicle_positions: 'https://gtfsrt.renfe.com/vehicle_positions.json',
};

async function get(url) {
  try {
    const r = await fetch(url, {
      headers: { accept: 'application/json' },
      signal: AbortSignal.timeout(8000),
      cf: { cacheTtl: 15, cacheEverything: true },
    });
    if (!r.ok) return null;
    const t = await r.text();
    return t.trim().startsWith('{') ? t : null;
  } catch { return null; }
}

export async function onRequestGet() {
  const [tu, vp] = await Promise.all([get(FEEDS.trip_updates), get(FEEDS.vehicle_positions)]);
  if (!tu && !vp) {
    return new Response('{"error":"no se pudo contactar con Renfe"}', { status: 502, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } });
  }
  return new Response(`{"trip_updates":${tu || 'null'},"vehicle_positions":${vp || 'null'}}`, {
    status: 200,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'public, max-age=10, s-maxage=15' },
  });
}
