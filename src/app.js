import * as store from './store.js';
import { etaParts, etaKey, etaHTML, hhmm } from './format.js';
import { tripsViewHTML, pickViewHTML, detailBodyHTML, stepHTML } from './ui.js';
import { rideHTML, rideInfo, rideExpiry, progFill } from './ride.js';
import { settingsHTML } from './settings.js';
import { pickerHTML, initPicker } from './picker.js';
import { initNav, ask, sync } from './nav.js';
import { initDrag } from './drag.js';
import * as notify from './notify.js';
import * as inst from './install.js';

// Datos reales de Renfe; con ?demo se usa la fuente simulada (para ver la interfaz sin red).
const src = await import(new URLSearchParams(location.search).has('demo') ? './mock.js' : './renfe.js');
if (src.DEMO) store.useDemoStore();

const $ = id => document.getElementById(id);
const board = $('board'), sheet = $('sheet'), scrim = $('scrim');

// La app va por pasos:
//   1 · ¿Cuál es tu viaje?  favoritos, cada uno con sus dos sentidos. Sin tiempo real: no pide nada a Renfe.
//   2 · Elige tu tren       los próximos 3 trenes del sentido elegido. Refresco cada 40 s.
//   3 · Tu tren             la tarjeta del tren elegido y su recorrido. Refresco cada 20 s.
// Con un tren elegido al abrir la app, se entra directamente al paso 3.
const REFRESH = { pick: 40000, ride: 20000 };
const COUNT = 3;                      // trenes para elegir en el paso 2

let settings = store.loadSettings();
let trips = [];
let stationList = [];
let reach = null;                     // qué estaciones se unen con tren directo (null = sin filtro)
let pick = null, pickData = null;     // paso 2: { from, to } y sus trenes
let ride = null, rideData = null;     // paso 3: el tren elegido y su último detalle
let rideAt = 0;                       // paso 3: cuándo llegaron los últimos datos buenos (0 = esperando o sin red)
let wl = null;                        // bloqueo de pantalla mientras viajas
let infoCache = null;
let open = null;                      // panel encima: { kind: 'picker' } | { kind: 'settings' }
let lastFocus = null;
let dropPicker = null;                // suelta los eventos del buscador al cerrarlo
let timer = 0;

const uid = () => Math.random().toString(36).slice(2, 9);
const view = () => ride ? 'ride' : pick ? 'pick' : 'trips';

/* ---------- Arranque ---------- */

async function init() {
  try { stationList = await src.stations(); reach = await src.links().catch(() => null); }
  catch (e) { console.error(e); board.innerHTML = '<section class="empty"><p class="empty__title">Sin horarios</p><p>No se han podido cargar los horarios de Renfe. Comprueba la conexión y recarga la página.</p></section>'; return; }
  const saved = store.load();
  if (saved) {                         // solo trayectos cuyas estaciones existen en los horarios actuales
    const byId = new Map(stationList.map(s => [s.id, s]));
    trips = saved.filter(t => byId.has(t.from.id) && byId.has(t.to.id)).map(t => ({ ...t, from: byId.get(t.from.id), to: byId.get(t.to.id) }));
    if (trips.length !== saved.length) store.save(trips);
  }
  else if (src.DEMO) {                 // solo en modo demostración: dos viajes de ejemplo
    const by = id => stationList.find(s => s.id === id);
    trips = [['d07', 'd11'], ['d05', 'd08']].map(([a, b]) => ({ id: uid(), from: by(a), to: by(b) }));
    store.save(trips);
  }
  $('demo').hidden = !src.DEMO;
  ride = store.loadRide();
  if (ride && Date.now() > rideExpiry(ride, null)) { ride = null; store.saveRide(null); }
  setInterval(tick, 1000);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { if (ride && settings.notify) notify.show(ride, rideData); return; }
    notify.clear(); refresh(); syncWake();
  });
  initNav({ depth, back, hasRide: () => !!ride });
  go();
}

/* ---------- Pasos ---------- */

/** Pinta el paso actual, lo refresca y ajusta la guarda de "atrás". */
function go({ top = true } = {}) {
  render();
  if (top) $('scroller').scrollTo({ top: 0 });
  refresh();
  syncWake();
  sync();
}

/** Niveles por encima del paso 1: mientras haya alguno, atrás no sale de la app. */
const depth = () => (open ? 1 : 0) + (ride ? 2 : pick ? 1 : 0);

/** Un paso atrás: cierra el panel, vuelve del 3 al 2 (preguntando) o del 2 al 1. */
async function back() {
  if (open) return closeSheet();
  if (ride) return changeTrain();
  if (pick) { pick = null; pickData = null; go(); }
}

function choose(trip, dir) {
  const [from, to] = dir ? [trip.to, trip.from] : [trip.from, trip.to];
  pick = { from, to }; pickData = null;
  go();
}

async function changeTrain() {
  const info = rideData ? rideInfo(rideData, Date.now()) : null;
  const done = info && (info.phase === 'cancelled' || info.phase === 'arrived');
  if (!done) {
    const what = await ask({
      title: '¿Cambiar de tren?', text: `Dejarás de seguir el de las ${hhmm(rideData ? rideData.train.estDep : ride.schedDep)}.`,
      choices: [
        { label: 'Dejar tren y cerrar app', value: 'leave' },
        { label: 'Elegir otro tren distinto', value: 'other' },
        { label: 'Permanecer en este tren', value: 'stay', focus: true },
      ],
    });
    if (!ride || !what || what === 'stay') return;
    if (what === 'leave') { pick = null; pickData = null; setRide(null); window.close(); return; }   // en la PWA instalada cierra la ventana; en una pestaña no puede y queda en el paso 1
  }
  pick = { from: ride.from, to: ride.to }; pickData = null;
  setRide(null);
}

function setRide(r) {
  ride = r; rideData = null; store.saveRide(r);
  if (r && settings.notify) notify.askPermission();
  if (!r) notify.clear();
  go();
}

const mkRide = (from, to, t) => ({
  key: t.key, from: { id: from.id, name: from.name }, to: { id: to.id, name: to.name },
  line: t.line, number: t.number, headsign: t.headsign, schedDep: t.schedDep, schedArr: t.schedArr,
});

/* ---------- Pintado ---------- */

function render() {
  const now = Date.now(), v = view();
  board.className = 'board board--' + v;
  if (v === 'trips') board.innerHTML = tripsViewHTML(trips, trips.length && !store.flag('install') ? inst.state() : '');
  else if (v === 'pick') {
    const opened = new Set([...board.querySelectorAll('.palert[open]')].map(e => e.dataset.k));   // avisos desplegados: siguen así al refrescar
    board.innerHTML = pickViewHTML(pick, pickData, now);
    board.querySelectorAll('.palert').forEach(e => { if (opened.has(e.dataset.k)) e.open = true; });
  }
  else board.innerHTML = stepHTML(3, 'Tu tren', { action: '<button type="button" class="step__act" data-act="change">Cambiar</button>' })
    + rideHTML(ride, rideData, now)
    + (rideData ? detailBodyHTML(rideData, now, reloadBar(now)) : '');
  if (v === 'trips') { fitNames(); document.fonts?.ready.then(() => view() === 'trips' && fitNames()); }
}

/** Línea al pie de "Ahora" que avanza hasta la próxima recarga; llena y parpadeando mientras espera o sin red. */
function reloadBar(now) {
  if (!rideAt) return '<i class="reload is-wait" aria-hidden="true"></i>';
  return `<i class="reload" aria-hidden="true" style="--dur:${REFRESH.ride}ms;--off:${rideAt - now}ms"></i>`;
}

/** Los nombres largos (Majadahonda, Fuenlabrada…) reducen la letra de su fila hasta caber, sin partirse a mitad de palabra. */
function fitNames() {
  for (const go of board.querySelectorAll('.fav__go')) {
    const names = [...go.querySelectorAll('.fav__a, .fav__b')];
    const over = () => names.some(n => n.scrollWidth > n.clientWidth + 1);
    let s = 21;
    for (const n of names) { n.style.fontSize = ''; n.style.overflowWrap = ''; }
    while (s > 15 && over()) { s--; for (const n of names) n.style.fontSize = s + 'px'; }
    if (over()) for (const n of names) n.style.overflowWrap = 'anywhere';
  }
}
let fitT = 0;
addEventListener('resize', () => { clearTimeout(fitT); fitT = setTimeout(() => view() === 'trips' && fitNames(), 150); });

function tick() {
  const now = Date.now();
  document.querySelectorAll('[data-eta]').forEach(el => {
    const e = etaParts(Number(el.dataset.eta), now), k = etaKey(e);
    if (el.dataset.k !== k) { el.dataset.k = k; el.innerHTML = etaHTML(e); }
    el.classList.toggle('is-soon', e.soon);
    el.classList.toggle('is-long', e.long);
  });
  document.querySelectorAll('.prog').forEach(el => {
    const times = el.dataset.t.split(',').map(Number), k = +el.dataset.k;
    if (k < 0 || el.dataset.stop) return;
    const i = el.querySelectorAll('i')[k];
    if (i) i.style.width = (progFill(times, k, k, now) * 100).toFixed(1) + '%';
  });
}

/* ---------- Datos (solo los del paso en pantalla) ---------- */

async function refresh() {
  clearTimeout(timer);
  const v = view();
  if (v === 'trips' || document.hidden) return;
  if (v === 'pick') await refreshPick(); else await refreshRide();
  if (view() === v) timer = setTimeout(refresh, REFRESH[v]);
}

async function refreshPick() {
  const p = pick;
  let d;
  try { d = await src.departures(p.from.id, p.to.id, Date.now(), COUNT); }
  catch (e) { console.error(e); d = { error: true }; }
  if (pick !== p || ride) return;
  pickData = d; render();
}

async function refreshRide() {
  const r = ride;
  rideAt = 0;
  board.querySelector('.reload')?.classList.add('is-wait');
  try {
    const d = await src.detail(r.key, r.from.id, r.to.id, Date.now());
    if (ride !== r) return;
    rideData = d;
    if (!d.rtDown) rideAt = Date.now();
  } catch (e) {
    console.error(e);
    if (ride !== r) return;
    if (Date.now() > rideExpiry(r, null)) return arrived();
  }
  if (rideData && Date.now() > rideExpiry(r, rideData)) return arrived();   // ya llegó hace rato
  if (rideData && settings.vibrate && !r.warned) {                          // siguiente parada = tu destino
    const inf = rideInfo(rideData, Date.now());
    if (inf.phase === 'riding' && inf.left === 1) {
      r.warned = true; store.saveRide(r);
      try { navigator.vibrate && navigator.vibrate([250, 120, 250]); } catch { /* sin vibración */ }
    }
  }
  render(); syncWake();
}

/** El viaje terminó: se quita el tren y se vuelve al paso 1. */
function arrived() { pick = null; pickData = null; setRide(null); }

/** Pantalla encendida mientras vas en el tren (o falta poco para subir). */
async function syncWake() {
  let need = false;
  if (settings.awake && ride && rideData && 'wakeLock' in navigator && document.visibilityState === 'visible') {
    const inf = rideInfo(rideData, Date.now());
    need = inf.phase === 'riding' || (inf.phase === 'waiting' && rideData.train.estDep - Date.now() < 15 * 60e3);
  }
  try {
    if (need && !wl) { wl = await navigator.wakeLock.request('screen'); wl.addEventListener('release', () => { wl = null; }); }
    else if (!need && wl) { const w = wl; wl = null; await w.release(); }
  } catch { /* el navegador puede negarlo */ }
}

/* ---------- Panel lateral (buscador y ajustes) ---------- */

function showSheet(html, side = 'right') {
  if (dropPicker) { dropPicker(); dropPicker = null; }
  lastFocus = document.activeElement;
  sheet.innerHTML = html;
  sheet.style.transition = 'none';                         // cambiar de lado sin animar: si no, cruza la pantalla
  sheet.classList.toggle('sheet--left', side === 'left');
  void sheet.offsetWidth;
  sheet.style.transition = '';
  sheet.classList.add('is-open'); scrim.classList.add('is-open');
  sheet.setAttribute('aria-hidden', 'false');
  document.body.classList.add('no-scroll');
  sync();
}

function closeSheet() {
  open = null;
  if (dropPicker) { dropPicker(); dropPicker = null; }
  sheet.classList.remove('is-open'); scrim.classList.remove('is-open');
  sheet.setAttribute('aria-hidden', 'true');
  document.body.classList.remove('no-scroll');
  if (lastFocus && document.contains(lastFocus)) lastFocus.focus();
  sync();
}

async function openSettings() {
  open = { kind: 'settings' };
  if (!infoCache) infoCache = await src.info().catch(() => null);
  showSheet(settingsHTML(settings, infoCache, false, inst.state()), 'left');
  sheet.querySelector('[data-act=close]').focus();
}
let wipeAsk = false;
function paintSettings(focusSel) {
  sheet.innerHTML = settingsHTML(settings, infoCache, wipeAsk, inst.state());
  if (focusSel) { const el = sheet.querySelector(focusSel); if (el) el.focus(); }
}

function openPicker() {
  open = { kind: 'picker' };
  showSheet(pickerHTML());
  dropPicker = initPicker(sheet, stationList, reach, ({ from, to }) => {
    trips.push({ id: uid(), from, to }); store.save(trips);
    closeSheet(); render();
  });
}

/* ---------- Eventos ---------- */

$('menu').addEventListener('click', () => { wipeAsk = false; openSettings(); });
scrim.addEventListener('click', closeSheet);
sheet.addEventListener('click', async ev => {
  if (ev.target.closest('[data-act=close]')) return closeSheet();
  if (ev.target.closest('[data-act=install]')) { await inst.install(); return; }
  if (open && open.kind === 'settings') {
    if (ev.target.closest('[data-act=wipe]')) {
      if (!wipeAsk) { wipeAsk = true; return paintSettings('[data-act=wipe]'); }
      store.wipe(); location.reload();
    }
  }
});
sheet.addEventListener('change', ev => {
  const k = ev.target.dataset && ev.target.dataset.set;
  if (!k || !(k in settings)) return;
  settings[k] = ev.target.checked; store.saveSettings(settings); syncWake();
  if (k === 'notify' && settings.notify) notify.askPermission();
});

board.addEventListener('click', async ev => {
  const el = ev.target.closest('[data-act]');
  if (!el) return;
  const act = el.dataset.act;
  const card = el.closest('[data-trip]');
  const trip = card && trips.find(x => x.id === card.dataset.trip);

  if (act === 'add') return openPicker();
  if (act === 'go' && trip) return choose(trip, +el.dataset.dir);
  if (act === 'remove' && trip) {
    const ok = await ask({ title: '¿Quitar este viaje?', text: `${trip.from.name} – ${trip.to.name}`, ok: 'Quitar', no: 'Mantener' });
    if (ok) { trips = trips.filter(x => x !== trip); store.save(trips); render(); }
    return;
  }
  if (act === 'back') return back();
  if (act === 'install') { await inst.install(); return; }
  if (act === 'hint-off') { store.setFlag('install'); return render(); }
  if (act === 'pick' && pick && pickData && pickData.trains) {
    const t = pickData.trains.find(x => x.key === el.dataset.key);
    if (t) setRide(mkRide(pick.from, pick.to, t));
    return;
  }
  if (act === 'change') return changeTrain();
});

// Cambia lo que se puede hacer para instalar (aparece el botón, se instala…)
inst.onChange(() => { if (view() === 'trips') render(); if (open && open.kind === 'settings') paintSettings(); });

// Paso 1: ordenar los viajes arrastrando el asa de cada tarjeta.
initDrag(board, ids => {
  const byId = new Map(trips.map(t => [t.id, t]));
  trips = ids.map(id => byId.get(id)).filter(Boolean);
  store.save(trips);
});

document.addEventListener('keydown', ev => {
  if (!open) return;
  if (ev.key === 'Escape') return closeSheet();
  if (ev.key === 'Tab') {                          // el foco no sale del panel lateral
    const f = [...sheet.querySelectorAll('button:not([disabled]), input, a[href]')];
    if (!f.length) return;
    const first = f[0], last = f[f.length - 1];
    if (ev.shiftKey && document.activeElement === first) { ev.preventDefault(); last.focus(); }
    else if (!ev.shiftKey && document.activeElement === last) { ev.preventDefault(); first.focus(); }
  }
});

if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}

init();
