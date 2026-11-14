import * as store from './store.js';
import { etaParts, etaKey, etaHTML } from './format.js';
import { panelHTML, emptyHTML, detailHTML } from './ui.js';
import { rideHTML, rideInfo, rideExpiry } from './ride.js';
import { settingsHTML } from './settings.js';
import { pickerHTML, initPicker } from './picker.js';

// Datos reales de Renfe; con ?demo se usa la fuente simulada (para ver la interfaz sin red).
const src = await import(new URLSearchParams(location.search).has('demo') ? './mock.js' : './renfe.js');
if (src.DEMO) store.useDemoStore();

const $ = id => document.getElementById(id);
const board = $('board'), sheet = $('sheet'), scrim = $('scrim'), rideEl = $('ride');
const REFRESH_MS = 20000;

const ui = { menu: null, confirm: null, rideKey: null, wipeAsk: false };
let settings = store.loadSettings();
let ride = null, rideData = null;     // "mi tren": el marcado y su último detalle
let wl = null;                        // bloqueo de pantalla mientras viajas
let infoCache = null;
const data = new Map();               // tripId -> resultado de departures() o { error }
let trips = [];
let stationList = [];
let open = null;                      // { kind: 'train', key, from, to, d } | { kind: 'picker' } | { kind: 'settings' }
let lastFocus = null;
let dropPicker = null;                // suelta los eventos del buscador al cerrarlo

const uid = () => Math.random().toString(36).slice(2, 9);

/* ---------- Arranque ---------- */

async function init() {
  try { stationList = await src.stations(); }
  catch (e) { console.error(e); board.innerHTML = '<section class="empty"><p class="empty__title">Sin horarios</p><p>No se han podido cargar los horarios de Renfe. Comprueba la conexión y recarga la página.</p></section>'; return; }
  const saved = store.load();
  if (saved) {                         // solo trayectos cuyas estaciones existen en los horarios actuales
    const byId = new Map(stationList.map(s => [s.id, s]));
    trips = saved.filter(t => byId.has(t.from.id) && byId.has(t.to.id)).map(t => ({ ...t, from: byId.get(t.from.id), to: byId.get(t.to.id) }));
    if (trips.length !== saved.length) store.save(trips);
  }
  else if (src.DEMO) {                 // solo en modo demostración: tres trayectos de ejemplo
    const by = id => stationList.find(s => s.id === id);
    trips = [['17004', '18002'], ['18002', '17004'], ['d08', 'd10']].map(([a, b]) => ({ id: uid(), from: by(a), to: by(b) }));
    store.save(trips);
  }
  $('demo').hidden = !src.DEMO;
  ride = store.loadRide();
  if (ride && Date.now() > rideExpiry(ride, null)) { ride = null; store.saveRide(null); }
  ui.rideKey = ride ? ride.key : null;
  renderRide();
  renderBoard();
  await refreshAll();
  setInterval(() => { if (!document.hidden) refreshAll(); }, REFRESH_MS);
  setInterval(tick, 1000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) { refreshAll(); syncWake(); } });
}

/* ---------- Datos ---------- */

async function refreshTrip(t) {
  try { data.set(t.id, await src.departures(t.from.id, t.to.id, Date.now(), settings.count)); }
  catch (e) { console.error(e); data.set(t.id, { error: true }); }
}

async function refreshAll() {
  await Promise.all([...trips.map(refreshTrip), refreshRide()]);
  renderBoard();
  if (open && open.kind === 'train') refreshDetail();
}

/* ---------- Pintado ---------- */

function renderBoard() {
  const now = Date.now();
  board.innerHTML = trips.length
    ? trips.map(t => panelHTML(t, data.get(t.id), ui, now)).join('')
    : emptyHTML();
}

function tick() {
  const now = Date.now();
  document.querySelectorAll('[data-eta]').forEach(el => {
    const e = etaParts(Number(el.dataset.eta), now), k = etaKey(e);
    if (el.dataset.k !== k) { el.dataset.k = k; el.innerHTML = etaHTML(e); }
    el.classList.toggle('is-soon', e.soon);
    el.classList.toggle('is-long', e.long);
  });
  document.querySelectorAll('.prog[data-wait="0"]').forEach(el => {
    const t0 = +el.dataset.t0, t1 = +el.dataset.t1;
    el.firstElementChild.style.width = Math.min(98, Math.max(2, (now - t0) / Math.max(1, t1 - t0) * 100)).toFixed(1) + '%';
  });
}

/* ---------- Mi tren ---------- */

const mkRide = (from, to, t) => ({
  key: t.key, from: { id: from.id, name: from.name }, to: { id: to.id, name: to.name },
  line: t.line, number: t.number, headsign: t.headsign, schedDep: t.schedDep, schedArr: t.schedArr,
});

function renderRide() {
  rideEl.hidden = !ride;
  rideEl.innerHTML = ride ? rideHTML(ride, rideData, Date.now()) : '';
}

function setRide(r) {
  ride = r; rideData = null; store.saveRide(r);
  ui.rideKey = r ? r.key : null;
  renderRide(); renderBoard(); syncWake();
  if (r) { refreshRide(); window.scrollTo({ top: 0, behavior: 'smooth' }); }
}

async function refreshRide() {
  const r = ride; if (!r) return;
  try {
    const d = await src.detail(r.key, r.from.id, r.to.id, Date.now());
    if (ride !== r) return;
    rideData = d;
  } catch (e) {
    console.error(e);
    if (ride !== r) return;
    if (Date.now() > rideExpiry(r, null)) return setRide(null);
  }
  if (rideData && Date.now() > rideExpiry(r, rideData)) return setRide(null);   // ya llegó hace rato
  if (rideData && settings.vibrate && !r.warned) {                                // siguiente parada = tu destino
    const inf = rideInfo(rideData, Date.now());
    if (inf.phase === 'riding' && inf.left === 1) {
      r.warned = true; store.saveRide(r);
      try { navigator.vibrate && navigator.vibrate([250, 120, 250]); } catch { /* sin vibración */ }
    }
  }
  renderRide(); syncWake();
  if (open && open.kind === 'train') refreshDetail();
}

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

/* ---------- Panel lateral (detalle y buscador) ---------- */

function showSheet(html, side = 'right') {
  if (dropPicker) { dropPicker(); dropPicker = null; }
  lastFocus = document.activeElement;
  sheet.innerHTML = html;
  sheet.classList.toggle('sheet--left', side === 'left');
  void sheet.offsetWidth;                                  // fija el lado antes de animar la entrada
  sheet.classList.add('is-open'); scrim.classList.add('is-open');
  sheet.setAttribute('aria-hidden', 'false');
  document.body.classList.add('no-scroll');
}

function closeSheet() {
  open = null;
  if (dropPicker) { dropPicker(); dropPicker = null; }
  sheet.classList.remove('is-open'); scrim.classList.remove('is-open');
  sheet.setAttribute('aria-hidden', 'true');
  document.body.classList.remove('no-scroll');
  if (lastFocus && document.contains(lastFocus)) lastFocus.focus();
}

async function openTrain(key, from, to) {
  open = { kind: 'train', key, from, to };
  const d = await src.detail(key, from, to, Date.now());
  open.d = d;
  showSheet(detailHTML(d, Date.now(), !!ride && ride.key === key));
  sheet.querySelector('[data-act=close]').focus();
}

async function refreshDetail() {
  const o = open;
  const d = await src.detail(o.key, o.from, o.to, Date.now());
  if (open !== o) return;
  o.d = d;
  const scroll = sheet.querySelector('.sheet__scroll');
  if (!scroll) return;
  const y = scroll.scrollTop;
  const tmp = document.createElement('div');
  tmp.innerHTML = detailHTML(d, Date.now(), !!ride && ride.key === o.key);
  scroll.innerHTML = tmp.querySelector('.sheet__scroll').innerHTML;
  scroll.scrollTop = y;
  const foot = sheet.querySelector('.sheet__foot'), nf = tmp.querySelector('.sheet__foot');
  if (foot && nf) foot.innerHTML = nf.innerHTML;
}

async function openSettings() {
  open = { kind: 'settings' }; ui.wipeAsk = false;
  if (!infoCache) infoCache = await src.info().catch(() => null);
  showSheet(settingsHTML(settings, infoCache, false), 'left');
  sheet.querySelector('[data-act=close]').focus();
}
function paintSettings(focusSel) {
  sheet.innerHTML = settingsHTML(settings, infoCache, ui.wipeAsk);
  if (focusSel) { const el = sheet.querySelector(focusSel); if (el) el.focus(); }
}

function openPicker() {
  open = { kind: 'picker' };
  showSheet(pickerHTML());
  dropPicker = initPicker(sheet, stationList, async ({ from, to }) => {
    const t = { id: uid(), from, to };
    trips.push(t); store.save(trips);
    closeSheet(); renderBoard();
    await refreshTrip(t); renderBoard();
  });
}

/* ---------- Eventos ---------- */

$('add').addEventListener('click', openPicker);
$('menu').addEventListener('click', openSettings);
scrim.addEventListener('click', closeSheet);
sheet.addEventListener('click', async ev => {
  if (ev.target.closest('[data-act=close]')) return closeSheet();
  if (open && open.kind === 'settings') {
    const c = ev.target.closest('[data-count]');
    if (c) { settings.count = +c.dataset.count; store.saveSettings(settings); paintSettings(`[data-count="${settings.count}"]`); refreshAll(); return; }
    if (ev.target.closest('[data-act=wipe]')) {
      if (!ui.wipeAsk) { ui.wipeAsk = true; return paintSettings('[data-act=wipe]'); }
      store.wipe(); location.reload();
    }
    return;
  }
  if (ev.target.closest('[data-act=ride-sheet]') && open && open.kind === 'train') {
    if (ride && ride.key === open.key) { setRide(null); return refreshDetail(); }
    const d = open.d, a = d.stops[d.iFrom], b = d.stops[d.iTo];
    closeSheet(); setRide(mkRide(a, b, d.train));
  }
});
sheet.addEventListener('change', ev => {
  const k = ev.target.dataset && ev.target.dataset.set;
  if (!k || !(k in settings)) return;
  settings[k] = ev.target.checked; store.saveSettings(settings); syncWake();
});

rideEl.addEventListener('click', ev => {
  const el = ev.target.closest('[data-act]'); if (!el || !ride) return;
  if (el.dataset.act === 'ride-end') return setRide(null);
  if (el.dataset.act === 'ride-open') return openTrain(ride.key, ride.from.id, ride.to.id);
});

board.addEventListener('click', async ev => {
  const el = ev.target.closest('[data-act]');
  if (!el) return;
  const act = el.dataset.act;
  const panel = el.closest('[data-trip]');
  const id = panel && panel.dataset.trip;

  if (act === 'add') return openPicker();
  if (act === 'train') { const t = trips.find(x => x.id === id); return t && openTrain(el.dataset.key, t.from.id, t.to.id); }
  if (act === 'ride') {
    const key = el.dataset.key;
    if (ride && ride.key === key) return setRide(null);
    const t = trips.find(x => x.id === id), tr = data.get(id) && data.get(id).trains && data.get(id).trains.find(x => x.key === key);
    return t && tr && setRide(mkRide(t.from, t.to, tr));
  }
  if (act === 'menu') { ui.menu = ui.menu === id ? null : id; ui.confirm = null; return renderBoard(); }
  if (act === 'reverse') {
    const t = trips.find(x => x.id === id);
    [t.from, t.to] = [t.to, t.from]; store.save(trips);
    ui.menu = null; data.delete(id); renderBoard();
    await refreshTrip(t); return renderBoard();
  }
  if (act === 'remove') {
    if (ui.confirm !== id) { ui.confirm = id; return renderBoard(); }
    trips = trips.filter(x => x.id !== id); data.delete(id); store.save(trips);
    ui.menu = ui.confirm = null; return renderBoard();
  }
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
