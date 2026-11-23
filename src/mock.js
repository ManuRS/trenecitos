// Fuente de datos SIMULADA. Cumple el mismo contrato que tendrá la fuente real de Renfe:
//   stations()                      -> [{ id, name }]
//   departures(from, to, now)       -> { updatedAt, hops, trains: [Train] }
//   detail(key, from, to, now)      -> { train, stops, here, alerts, updatedAt }
// Simula la C4a (Alcobendas-San Sebastián de los Reyes – Parla). Los ids son inventados salvo Nuevos Ministerios (18002).

export const DEMO = true;
const LINE = 'C4a';
const HEAD = 15 * 60e3;          // un tren cada 15 min por sentido
const MIN = 60e3;

// [id, nombre, minutos desde Alcobendas (sentido sur)]
const ROUTE = [
  ['d01', 'Alcobendas-San Sebastián de los Reyes', 0],
  ['d02', 'Valdelasfuentes', 4],
  ['d03', 'Cantoblanco Universidad', 12],
  ['d04', 'Fuente de la Mora', 17],
  ['d05', 'Chamartín', 24],
  ['18002', 'Nuevos Ministerios', 30],
  ['d07', 'Sol', 33],
  ['d08', 'Atocha', 37],
  ['d09', 'Villaverde Alto', 48],
  ['d10', 'Getafe Centro', 56],
  ['d11', 'Parla', 66],
];
const END = ROUTE[ROUTE.length - 1][2];

const hash = n => { let x = (n * 2654435761) >>> 0; x ^= x >>> 15; x = Math.imul(x, 2246822519) >>> 0; x ^= x >>> 13; return x >>> 0; };
const idx = id => ROUTE.findIndex(r => r[0] === id);

export const stations = async () => ROUTE.map(([id, name]) => ({ id, name }));
export const info = async () => ({ built: null, first: null, last: null });

/** Parada i de un viaje en el sentido dado, con su offset en minutos desde el origen del viaje. */
function stopsOf(south) {
  const list = south ? ROUTE : [...ROUTE].reverse();
  return list.map(([id, name, off]) => ({ id, name, off: south ? off : END - off }));
}

function trip(k, south, delayOverride) {
  const phase = south ? 4 * MIN : 11 * MIN;
  const start = k * HEAD + phase;
  const h = hash(k * 2 + (south ? 1 : 0));
  const r = h % 20;
  const delay = delayOverride ?? (r < 12 ? 0 : r < 15 ? 120 : r < 17 ? 240 : r < 19 ? 480 : 720);
  const cancelled = hash(k * 7 + (south ? 1 : 2)) % 23 === 0;
  return {
    key: `${south ? 'S' : 'N'}${k}`,
    k, south, start, delay, cancelled,
    number: String(20000 + (k * 37 + (south ? 508 : 211)) % 900),
    headsign: south ? 'Parla' : 'Alcobendas-San Sebastián de los Reyes',
  };
}

function parseKey(key) { return { south: key[0] === 'S', k: Number(key.slice(1)) }; }

function trainFor(t, from, to, now) {
  const stops = stopsOf(t.south);
  const i = stops.findIndex(s => s.id === from), j = stops.findIndex(s => s.id === to);
  if (i < 0 || j < 0 || i >= j) return null;
  const schedDep = t.start + stops[i].off * MIN, schedArr = t.start + stops[j].off * MIN;
  const hasPos = !t.cancelled && now >= t.start + t.delay * 1000 - 10 * MIN;
  return {
    key: t.key, line: LINE, number: t.number, headsign: t.headsign,
    schedDep, schedArr,
    estDep: schedDep + t.delay * 1000, estArr: schedArr + t.delay * 1000,
    delay: t.cancelled ? null : t.delay,
    status: t.cancelled ? 'cancelled' : hasPos ? 'running' : 'scheduled',
    hops: j - i,
  };
}

export async function departures(from, to, now = Date.now(), count = 3) {
  const south = idx(from) < idx(to);
  const base = Math.floor(now / HEAD);
  const trains = [];
  for (let k = base - 6; k <= base + 10 && trains.length < 12; k++) {
    const t = trainFor(trip(k, south), from, to, now);
    if (t && t.estDep >= now - 20e3) trains.push(t);
  }
  trains.sort((a, b) => a.schedDep - b.schedDep);
  const updatedAt = now - (now % 20000);
  return { updatedAt, hops: Math.abs(idx(to) - idx(from)), trains: trains.slice(0, count) };
}

export async function detail(key, from, to, now = Date.now()) {
  const { south, k } = parseKey(key);
  const t = trip(k, south);
  const train = trainFor(t, from, to, now);
  const list = stopsOf(south);
  const stops = list.map(s => {
    const sched = t.start + s.off * MIN;
    return { id: s.id, name: s.name, sched, est: sched + t.delay * 1000, platform: 1 + hash(Number(s.id.replace(/\D/g, '') || 0) + k) % 4 };
  });
  const iFrom = stops.findIndex(s => s.id === from), iTo = stops.findIndex(s => s.id === to);

  // Dónde está el tren ahora.
  let here = { kind: 'sched', text: `Aún no ha salido de ${stops[0].name}`, hereIdx: -1 };
  let positionAt = null;
  if (t.cancelled) here = { kind: 'cancelled', text: 'Tren cancelado', hereIdx: -1 };
  else if (train.status === 'running') {
    positionAt = now - (now % 20000) - 3000;
    let last = -1;
    stops.forEach((s, n) => { if (s.est <= now) last = n; });
    if (last === stops.length - 1) here = { kind: 'end', text: `Ha llegado a ${stops[last].name}`, hereIdx: last };
    else if (last < 0) here = { kind: 'stopped', text: `En ${stops[0].name}`, hereIdx: 0, platform: stops[0].platform, state: 'parado' };
    else if (now - stops[last].est < 45e3) here = { kind: 'stopped', text: `En ${stops[last].name}`, hereIdx: last, platform: stops[last].platform, state: 'parado' };
    else if (stops[last + 1].est - now < 90e3) here = { kind: 'incoming', text: `Entrando en ${stops[last + 1].name}`, hereIdx: last, platform: stops[last + 1].platform, state: 'en marcha' };
    else here = { kind: 'moving', text: `Hacia ${stops[last + 1].name}`, hereIdx: last, state: 'en marcha' };
  }

  const alerts = [{
    id: 'demo-1',
    title: 'Obras entre Villaverde Alto y Getafe Centro',
    text: 'Posibles retrasos de hasta 10 minutos en ambos sentidos. (Aviso de demostración.)',
  }];

  const vi = here.kind === 'stopped' || here.kind === 'end' ? here.hereIdx : here.kind === 'incoming' || here.kind === 'moving' ? here.hereIdx + 1 : -1;
  const vstatus = here.kind === 'stopped' || here.kind === 'end' ? 'STOPPED_AT' : here.kind === 'incoming' ? 'INCOMING_AT' : here.kind === 'moving' ? 'IN_TRANSIT_TO' : '';
  stops.forEach((s, n) => { s.passed = t.cancelled ? false : vi >= 0 ? n < vi : s.est < now; });
  return { train, stops, iFrom, iTo, here, vi, vstatus, positionAt, alerts, updatedAt: now - (now % 20000) };
}
