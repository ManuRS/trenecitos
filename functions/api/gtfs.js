// Tubería hacia el GTFS estático de Renfe (zip). Solo para la sonda y para la compilación:
// la app no lo descarga, usa un JSON compacto generado a partir de él.

const GTFS = 'https://ssl.renfe.com/ftransit/Fichero_CER_FOMENTO/fomento_transit.zip';

export async function onRequestGet() {
  let up;
  try {
    up = await fetch(GTFS, { signal: AbortSignal.timeout(25000), cf: { cacheTtl: 3600, cacheEverything: true } });
  } catch (e) {
    return new Response(JSON.stringify({ error: 'no se pudo contactar con Renfe', detail: String(e && e.message || e) }),
      { status: 502, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } });
  }
  if (!up.ok) {
    return new Response(JSON.stringify({ error: 'Renfe respondió con error', status: up.status }),
      { status: 502, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } });
  }
  const h = { 'content-type': 'application/zip', 'cache-control': 'public, max-age=3600' };
  const len = up.headers.get('content-length'); if (len) h['content-length'] = len;
  return new Response(up.body, { status: 200, headers: h });
}
