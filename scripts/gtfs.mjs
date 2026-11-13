// Convierte el GTFS estático de Renfe (todos los núcleos, 15 MB comprimido, 259 MB de stop_times)
// en unos JSON compactos solo del núcleo de Madrid:
//   data/index.json      estaciones, líneas y "patrones" de recorrido (paradas + minutos relativos)
//   data/d/AAAAMMDD.json los viajes de cada día: [tripId, patrón, segundo de salida]
// El cliente descarga el índice y los tres días que necesita (ayer, hoy y mañana).
import { unzipSync } from 'fflate';

export const GTFS_URL = 'https://ssl.renfe.com/ftransit/Fichero_CER_FOMENTO/fomento_transit.zip';
export const MADRID_ROUTE = /^10T/;            // route_id de Madrid: 10T0001C1, 10T0015C4b…

/* ---------- Nombres de estación ---------- */

/** Nombre de uso diario: Renfe pone "Madrid-Atocha Cercanías"; quien la usa dice "Atocha". */
export function displayName(name) {
  return name
    .replace(/^Madrid-/, '')
    .replace(/\s+Cercanías$/i, '')
    .replace(/^Chamartín-Clara Campoamor$/, 'Chamartín')
    .replace(/\s+P\.V\.$/, '');
}

/* ---------- Descarga ---------- */

export async function download(urls) {
  const errors = [];
  for (const url of urls) {
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        const res = await fetch(url, { signal: AbortSignal.timeout(120000) });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const buf = new Uint8Array(await res.arrayBuffer());
        if (buf[0] !== 0x50 || buf[1] !== 0x4b) throw new Error('no es un zip');
        return { buf, from: url };
      } catch (e) {
        errors.push(`${url} (intento ${attempt}): ${e.cause?.code || e.message}`);
      }
    }
  }
  throw new Error('No se pudo descargar el GTFS de Renfe:\n  ' + errors.join('\n  '));
}

/* ---------- CSV ---------- */

// Renfe rellena con espacios los campos y hasta los nombres de las columnas: se recorta todo.
function splitLine(line) {
  if (line.indexOf('"') === -1) return line.split(',').map(s => s.trim());
  const out = []; let cur = '', q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (q) { if (c === '"') { if (line[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += c; }
    else if (c === '"') q = true; else if (c === ',') { out.push(cur); cur = ''; } else cur += c;
  }
  out.push(cur);
  return out.map(s => s.trim());
}

function* table(text) {
  let pos = 0, head = null;
  if (text.charCodeAt(0) === 0xFEFF) pos = 1;
  while (pos < text.length) {
    let nl = text.indexOf('\n', pos); if (nl < 0) nl = text.length;
    const line = text.slice(pos, nl).replace(/\r$/, ''); pos = nl + 1;
    if (!line.trim()) continue;
    const f = splitLine(line);
    if (!head) { head = Object.fromEntries(f.map((n, i) => [n, i])); continue; }
    yield { f, c: head };
  }
}
const get = (r, name) => { const i = r.c[name]; return i === undefined ? '' : (r.f[i] ?? ''); };

const secs = t => { const m = /^(\d+):(\d\d):(\d\d)$/.exec(t); return m ? +m[1] * 3600 + +m[2] * 60 + +m[3] : null; };

/* ---------- Fechas ---------- */

const ymd = d => d.getUTCFullYear() * 10000 + (d.getUTCMonth() + 1) * 100 + d.getUTCDate();
const addDays = (n, k) => { const d = new Date(Date.UTC(Math.floor(n / 10000), Math.floor(n / 100) % 100 - 1, n % 100 + k)); return ymd(d); };
const weekday = n => new Date(Date.UTC(Math.floor(n / 10000), Math.floor(n / 100) % 100 - 1, n % 100)).getUTCDay();
const DAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

/** Fecha de hoy en Madrid (AAAAMMDD). */
export function madridToday(now = new Date()) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid', year: 'numeric', month: '2-digit', day: '2-digit' })
    .formatToParts(now).map(x => [x.type, x.value]));
  return +(p.year + p.month + p.day);
}

/* ---------- Conversión ---------- */

export function convert(zipBuf, { today = madridToday() } = {}) {
  const small = unzipSync(zipBuf, { filter: f => /^(calendar|calendar_dates|routes|stops|trips)\.txt$/.test(f.name) });
  const text = n => (small[n] ? new TextDecoder('utf-8').decode(small[n]) : '');
  for (const n of ['calendar.txt', 'routes.txt', 'stops.txt', 'trips.txt']) if (!small[n]) throw new Error(`Falta ${n} en el zip`);

  // Rutas de Madrid
  const routes = new Map();
  for (const r of table(text('routes.txt'))) {
    const id = get(r, 'route_id');
    if (MADRID_ROUTE.test(id)) routes.set(id, { id, short: get(r, 'route_short_name'), long: get(r, 'route_long_name'), color: get(r, 'route_color'), text: get(r, 'route_text_color') });
  }
  if (!routes.size) throw new Error('No hay rutas de Madrid (route_id 10T…) en el GTFS');

  // Viajes de Madrid
  const trips = new Map();                 // trip_id -> { route, service }
  for (const r of table(text('trips.txt'))) {
    const route = get(r, 'route_id');
    if (routes.has(route)) trips.set(get(r, 'trip_id'), { route, service: get(r, 'service_id') });
  }
  const services = new Set([...trips.values()].map(t => t.service));

  // Qué servicios circulan cada día (los de Renfe son de un solo día, pero se admiten rangos y excepciones)
  const dates = new Map();                 // fecha -> Set(service_id)
  const first = addDays(today, -1), last = addDays(today, 45);
  const add = (d, s) => { if (!dates.has(d)) dates.set(d, new Set()); dates.get(d).add(s); };
  for (const r of table(text('calendar.txt'))) {
    const s = get(r, 'service_id'); if (!services.has(s)) continue;
    const a = +get(r, 'start_date'), b = +get(r, 'end_date');
    for (let d = Math.max(a, first); d <= Math.min(b, last); d = addDays(d, 1)) if (a === b || get(r, DAYS[weekday(d)]) === '1') add(d, s);   // servicio de un solo día: vale aunque no marque el día de la semana
  }
  for (const r of table(text('calendar_dates.txt'))) {
    const s = get(r, 'service_id'), d = +get(r, 'date'); if (!services.has(s) || d < first || d > last) continue;
    if (get(r, 'exception_type') === '1') add(d, s); else if (get(r, 'exception_type') === '2' && dates.has(d)) dates.get(d).delete(s);
  }
  const activeServices = new Set(); dates.forEach(set => set.forEach(s => activeServices.add(s)));

  // stop_times: 259 MB, se lee por líneas y solo se guardan los viajes de Madrid con servicio en la ventana
  const big = unzipSync(zipBuf, { filter: f => f.name === 'stop_times.txt' })['stop_times.txt'];
  if (!big) throw new Error('Falta stop_times.txt en el zip');
  const buf = Buffer.from(big.buffer, big.byteOffset, big.length);
  const times = new Map();                 // trip_id -> [[seq, stop, arr, dep]]
  let pos = 0, head = null, rows = 0;
  while (pos < buf.length) {
    let nl = buf.indexOf(10, pos); if (nl < 0) nl = buf.length;
    const line = buf.latin1Slice(pos, nl); pos = nl + 1;
    if (!head) { head = Object.fromEntries(splitLine(line.replace(/^﻿|^ï»¿/, '')).map((n, i) => [n, i])); continue; }
    rows++;
    const c = line.indexOf(',');
    const tid = (c < 0 ? line : line.slice(0, c)).trim();
    const t = trips.get(tid);
    if (!t || !activeServices.has(t.service)) continue;
    const f = splitLine(line);
    const arr = secs(f[head.arrival_time]), dep = secs(f[head.departure_time]);
    if (arr == null && dep == null) continue;
    let list = times.get(tid); if (!list) times.set(tid, list = []);
    list.push([+f[head.stop_sequence], f[head.stop_id], arr ?? dep, dep ?? arr]);
  }

  // Estaciones y patrones
  const stopIdx = new Map(), stopRows = [];
  const stopNames = new Map();
  for (const r of table(text('stops.txt'))) stopNames.set(get(r, 'stop_id'), get(r, 'stop_name'));
  const routeIdx = new Map(), routeRows = [];
  const patIdx = new Map(), patRows = [];
  const byTrip = new Map();                // trip_id -> [patrón, salida]
  const byService = new Map();             // service_id -> [trip_id]
  let dropped = 0;

  for (const [tid, list] of times) {
    list.sort((a, b) => a[0] - b[0]);
    if (list.length < 2) { dropped++; continue; }
    const t = trips.get(tid);
    const start = list[0][3];
    const sIdx = list.map(x => {
      if (!stopIdx.has(x[1])) { stopIdx.set(x[1], stopRows.length); const full = stopNames.get(x[1]) || x[1], shown = displayName(full);
      stopRows.push(shown === full ? [x[1], shown] : [x[1], shown, full]);    // el nombre original solo sirve para buscar
    }
      return stopIdx.get(x[1]);
    });
    const arr = list.map(x => x[2] - start), dep = list.map(x => x[3] - start);
    const minutes = arr.every(v => v % 60 === 0) && dep.every(v => v % 60 === 0);
    const k = minutes ? 60 : 1;
    if (!routeIdx.has(t.route)) {
      const r = routes.get(t.route); routeIdx.set(t.route, routeRows.length);
      routeRows.push([r.id, r.short, r.color, r.text, r.long]);
    }
    const body = [routeIdx.get(t.route), sIdx, arr.map(v => v / k), dep.map(v => v / k), k === 60 ? 1 : 0];
    const key = JSON.stringify(body);
    if (!patIdx.has(key)) { patIdx.set(key, patRows.length); patRows.push(body); }
    byTrip.set(tid, [patIdx.get(key), start]);
    if (!byService.has(t.service)) byService.set(t.service, []);
    byService.get(t.service).push(tid);
  }

  // Un fichero por día
  const days = new Map();
  const dateList = [...dates.keys()].sort((a, b) => a - b);
  for (const d of dateList) {
    const t = [];
    for (const s of dates.get(d)) for (const tid of byService.get(s) || []) t.push([tid, ...byTrip.get(tid)]);
    if (!t.length) continue;
    t.sort((a, b) => a[2] - b[2]);
    days.set(d, { d: String(d), t });
  }

  const index = {
    v: 1, built: new Date().toISOString(),
    dates: [...days.keys()].map(String),
    stops: stopRows, routes: routeRows, patterns: patRows,
  };
  const stats = { stopTimesRows: rows, madridTrips: trips.size, tripsWithTimes: byTrip.size, dropped, stops: stopRows.length, routes: routeRows.length, patterns: patRows.length, days: days.size };
  return { index, days, stats };
}
