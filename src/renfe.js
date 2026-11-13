// Fuente de datos REAL de Renfe. Mismo contrato que mock.js:
//   stations()                      -> [{ id, name }]
//   departures(from, to, now)       -> { updatedAt, hops, trains: [Train], rt, noDirect }  |  { error, reason }
//   detail(key, from, to, now)      -> { train, stops, iFrom, iTo, here, positionAt, alerts, updatedAt }
//
// Horarios: data/index.json + data/d/AAAAMMDD.json, generados en el build desde el GTFS de Renfe.
// Tiempo real: /api/rt/* (proxy de los feeds GTFS-RT). Renfe publica UN retraso por viaje:
// hora estimada = horario + retraso. La posición (vehicle_positions) dice si el tren ya ha pasado por tu estación.

export const DEMO = false;

const TZ = 'Europe/Madrid';
const DAY = 86400e3;

/* ---------- Fechas en hora de Madrid (el móvil puede estar en otra zona) ---------- */

const wall = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' });
function wallParts(ms) {
  const p = {}; for (const x of wall.formatToParts(ms)) p[x.type] = +x.value;
  return p;
}
export const dateKey = ms => { const p = wallParts(ms); return String(p.year * 10000 + p.month * 100 + p.day); };
/** Medianoche de Madrid (ms) del día AAAAMMDD. */
export function dayStart(key) {
  const y = +key.slice(0, 4), m = +key.slice(4, 6), d = +key.slice(6, 8);
  let guess = Date.UTC(y, m - 1, d);
  for (let n = 0; n < 2; n++) {
    const p = wallParts(guess);
    guess -= Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - Date.UTC(y, m - 1, d);
  }
  return guess;
}

/* ---------- Red ---------- */

async function getJson(url, ms = 12000) {
  const res = await fetch(url, { signal: AbortSignal.timeout(ms), cache: 'no-store' });
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  return res.json();
}

/* ---------- Horarios ---------- */

let indexP = null;
export function loadIndex() {
  if (!indexP) {
    indexP = fetch('data/index.json', { signal: AbortSignal.timeout(20000) })
      .then(r => { if (!r.ok) throw new Error('index.json: HTTP ' + r.status); return r.json(); })
      .then(raw => ({
        built: raw.built, dates: new Set(raw.dates),
        stops: raw.stops.map(([id, name]) => ({ id, name })),
        stopIdx: new Map(raw.stops.map((s, i) => [s[0], i])),
        routes: raw.routes.map(([id, short, color, text, long]) => ({ id, short, color, text, long })),
        patterns: raw.patterns.map(([route, stops, arr, dep, min]) => ({ route, stops, arr, dep, k: min ? 60 : 1 })),
      }))
      .catch(e => { indexP = null; throw e; });
  }
  return indexP;
}

const dayCache = new Map();             // AAAAMMDD -> Promise<day|null>
function loadDay(key, idx) {
  if (!idx.dates.has(key)) return Promise.resolve(null);
  if (!dayCache.has(key)) {
    dayCache.set(key, fetch(`data/d/${key}.json`, { signal: AbortSignal.timeout(20000) })
      .then(r => { if (!r.ok) throw new Error(`día ${key}: HTTP ${r.status}`); return r.json(); })
      .then(raw => {
        const byStop = new Map();
        raw.t.forEach((t, n) => {
          for (const s of new Set(idx.patterns[t[1]].stops)) { let l = byStop.get(s); if (!l) byStop.set(s, l = []); l.push(n); }
        });
        return { key, base: dayStart(key), trips: raw.t, byStop, byId: new Map(raw.t.map((t, n) => [t[0], n])) };
      })
      .catch(e => { dayCache.delete(key); throw e; }));
  }
  return dayCache.get(key);
}

/** Ayer, hoy y mañana: un tren de la madrugada (24:30) pertenece al día de servicio anterior. */
async function loadDays(idx, now) {
  const today = dateKey(now), base = dayStart(today);
  const keys = [dateKey(base - 12 * 3600e3), today, dateKey(base + 36 * 3600e3)];
  const days = await Promise.all(keys.map(k => loadDay(k, idx)));
  return { today, days: days.filter(Boolean), hasToday: idx.dates.has(today) };
}

/* ---------- Tiempo real ---------- */

const PLAT = /PLATF\.?\s*\((\d+)\)/i;
let rtCache = { at: 0, p: null };

export function realtime() {
  if (rtCache.p && Date.now() - rtCache.at < 8000) return rtCache.p;
  rtCache.at = Date.now();
  rtCache.p = (async () => {
    const [tu, vp] = await Promise.allSettled([getJson('api/rt/trip_updates'), getJson('api/rt/vehicle_positions')]);
    const out = { ok: tu.status === 'fulfilled' || vp.status === 'fulfilled', updatedAt: null, trips: new Map(), veh: new Map() };
    let ts = 0;
    if (tu.status === 'fulfilled') {
      ts = Math.max(ts, +(tu.value.header && tu.value.header.timestamp) || 0);
      for (const e of tu.value.entity || []) {
        const u = e.tripUpdate, id = u && u.trip && u.trip.tripId; if (!id) continue;
        const cancelled = String(e.id).startsWith('TUCANCEL') || u.trip.scheduleRelationship === 'CANCELED';
        const stu = (u.stopTimeUpdate || [])[0];
        const delay = typeof u.delay === 'number' ? u.delay : stu && stu.arrival && typeof stu.arrival.delay === 'number' ? stu.arrival.delay : null;
        out.trips.set(id, { cancelled, delay });
      }
    }
    if (vp.status === 'fulfilled') {
      ts = Math.max(ts, +(vp.value.header && vp.value.header.timestamp) || 0);
      for (const e of vp.value.entity || []) {
        const v = e.vehicle, id = v && v.trip && v.trip.tripId; if (!id) continue;
        const label = (v.vehicle && v.vehicle.label) || '';
        const m = PLAT.exec(label);
        out.veh.set(id, { status: v.currentStatus || '', stopId: v.stopId == null ? '' : String(v.stopId), platform: m ? m[1] : null, ts: (+v.timestamp || 0) * 1000 });
      }
    }
    out.updatedAt = ts ? ts * 1000 : null;
    return out;
  })();
  return rtCache.p;
}

let alertCache = { at: 0, p: null };
function alerts() {
  if (alertCache.p && Date.now() - alertCache.at < 60000) return alertCache.p;
  alertCache.at = Date.now();
  alertCache.p = getJson('api/rt/alerts').then(j => j.entity || []).catch(() => []);
  return alertCache.p;
}
const tr = t => { const l = (t && t.translation) || []; return (l.find(x => x.language === 'es') || l[0] || {}).text || ''; };

/* ---------- Construcción de trenes ---------- */

const number = tid => { const m = /^\d+[A-Za-z](\d+)/.exec(tid); return m ? m[1] : tid; };

/** Posición del tren respecto al patrón: índice de la parada a la que se refiere el vehículo. */
function where(idx, pat, veh) {
  if (!veh) return -1;
  const s = idx.stopIdx.get(veh.stopId);
  return s === undefined ? -1 : pat.stops.indexOf(s);
}

function trainOf(ctx, day, n, from, to) {
  const { idx, rt } = ctx;
  const [tid, p, start] = day.trips[n];
  const pat = idx.patterns[p];
  const i = pat.stops.indexOf(from); if (i < 0) return null;
  const j = pat.stops.indexOf(to, i + 1); if (j < 0) return null;
  const route = idx.routes[pat.route];
  const sec = (v) => day.base + (start + v * pat.k) * 1000;
  const schedDep = sec(pat.dep[i]), schedArr = sec(pat.arr[j]);
  const u = rt.trips.get(tid), veh = rt.veh.get(tid);
  const cancelled = !!(u && u.cancelled);
  const delay = cancelled ? null : u && u.delay != null ? u.delay : null;
  const d = (delay || 0) * 1000;
  const vi = cancelled ? -1 : where(idx, pat, veh);
  let phase = null;
  if (vi === i && veh) phase = veh.status === 'STOPPED_AT' ? 'at' : veh.status === 'INCOMING_AT' ? 'arriving' : null;
  return {
    key: `${day.key}|${tid}`, line: route.short, number: number(tid), headsign: idx.stops[pat.stops[pat.stops.length - 1]].name,
    schedDep, schedArr, estDep: schedDep + d, estArr: schedArr + d, delay,
    status: cancelled ? 'cancelled' : veh ? 'running' : 'scheduled',
    hops: j - i, phase,
    platform: vi === i && veh ? veh.platform : null,
    _passed: vi > i, _vi: vi,
  };
}

async function context(now) {
  const idx = await loadIndex();
  const [d, rt] = await Promise.all([loadDays(idx, now), realtime().catch(() => ({ ok: false, trips: new Map(), veh: new Map(), updatedAt: null }))]);
  return { idx, rt, ...d };
}

export const stations = async () => (await loadIndex()).stops;

export async function departures(from, to, now = Date.now()) {
  let ctx;
  try { ctx = await context(now); } catch (e) { console.error(e); return { error: true, reason: 'net' }; }
  if (!ctx.hasToday || !ctx.days.length) return { error: true, reason: 'stale' };
  const a = ctx.idx.stopIdx.get(from), b = ctx.idx.stopIdx.get(to);
  if (a === undefined || b === undefined) return { error: true, reason: 'station' };

  const all = [];
  let anyHops = null;
  for (const day of ctx.days) {
    for (const n of day.byStop.get(a) || []) {
      const t = trainOf(ctx, day, n, a, b);
      if (!t) continue;
      if (anyHops == null) anyHops = t.hops;
      if (t.status === 'cancelled') { if (t.schedDep >= now - 60e3) all.push(t); continue; }
      if (t._passed) continue;
      if (t.estDep < now - (t._vi >= 0 ? 600e3 : 20e3)) continue;
      all.push(t);
    }
  }
  all.sort((x, y) => (x.status === 'cancelled' ? x.schedDep : x.estDep) - (y.status === 'cancelled' ? y.schedDep : y.estDep));
  const trains = []; let live = 0;
  for (const t of all) {
    trains.push(t);
    if (t.status !== 'cancelled' && ++live === 3) break;
  }
  return {
    updatedAt: ctx.rt.updatedAt, rt: ctx.rt.ok,
    hops: trains.length ? trains.find(t => t.status !== 'cancelled')?.hops ?? trains[0].hops : anyHops,
    noDirect: anyHops == null,
    trains,
  };
}

export async function detail(key, from, to, now = Date.now()) {
  const [dkey, tid] = key.split('|');
  const ctx = await context(now);
  const day = ctx.days.find(d => d.key === dkey);
  const n = day && day.byId.get(tid);
  if (n == null) throw new Error('Tren no encontrado: ' + key);
  const { idx, rt } = ctx;
  const a = idx.stopIdx.get(from), b = idx.stopIdx.get(to);
  const train = trainOf(ctx, day, n, a, b);
  const [, p, start] = day.trips[n];
  const pat = idx.patterns[p];
  const u = rt.trips.get(tid), veh = rt.veh.get(tid);
  const cancelled = train.status === 'cancelled';
  const d = ((u && u.delay) || 0) * 1000;
  const vi = cancelled ? -1 : where(idx, pat, veh);

  const stops = pat.stops.map((s, k) => {
    const sched = day.base + (start + (k === 0 ? pat.dep[0] : pat.arr[k]) * pat.k) * 1000;
    return {
      id: idx.stops[s].id, name: idx.stops[s].name, sched, est: sched + d,
      platform: veh && vi === k ? veh.platform : null,
      passed: cancelled ? false : veh ? (vi >= 0 ? k < vi : sched + d < now) : sched + d < now,
    };
  });
  const iFrom = pat.stops.indexOf(a), iTo = pat.stops.indexOf(b, iFrom + 1);
  const last = stops.length - 1;

  let here;
  if (cancelled) here = { kind: 'cancelled', text: 'Tren cancelado', hereIdx: -1 };
  else if (veh && vi >= 0) {
    const nm = stops[vi].name;
    if (veh.status === 'STOPPED_AT') here = vi === last
      ? { kind: 'end', text: `Ha llegado a ${nm}`, hereIdx: vi }
      : { kind: 'stopped', text: `En ${nm}`, hereIdx: vi, platform: veh.platform, state: 'parado' };
    else if (veh.status === 'INCOMING_AT') here = { kind: 'incoming', text: `Entrando en ${nm}`, hereIdx: vi - 1, platform: veh.platform, state: 'en marcha' };
    else here = { kind: 'moving', text: `Hacia ${nm}`, hereIdx: vi - 1, state: 'en marcha' };
  } else if (veh) here = { kind: 'moving', text: 'En marcha', hereIdx: -1, state: 'en marcha' };
  else here = { kind: 'sched', text: stops[0].sched > now ? `Aún no ha salido de ${stops[0].name}` : 'Renfe no publica su posición todavía', hereIdx: -1 };

  const seg = new Set(pat.stops.slice(iFrom, iTo + 1).map(s => idx.stops[s].id));
  const route = idx.routes[pat.route];
  const horizon = now / 1000 - 12 * 3600;
  const seen = new Set();
  const list = (await alerts()).map(e => e.alert).filter(Boolean).filter(al => {
    const p0 = (al.activePeriod || [])[0] || {};
    if (p0.end && +p0.end < now / 1000) return false;
    if (p0.start && +p0.start < horizon && !p0.end) return false;
    return (al.informedEntity || []).some(x => x.routeId === route.id || (x.stopId && seg.has(String(x.stopId))));
  }).map(al => ({
    start: +((al.activePeriod || [])[0] || {}).start || 0,
    title: tr(al.headerText), text: tr(al.descriptionText).replace(/\s+/g, ' ').trim(),
  })).filter(x => x.text && !seen.has(x.text) && seen.add(x.text)).sort((x, y) => y.start - x.start).slice(0, 3)
    .map((x, k) => ({ id: 'a' + k, title: x.title, text: x.text }));

  return { train, stops, iFrom, iTo, here, positionAt: veh && !cancelled && veh.ts ? veh.ts : null, alerts: list, updatedAt: rt.updatedAt };
}
