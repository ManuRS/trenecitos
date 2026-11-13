import * as store from './store.js';
import { etaParts, etaKey, etaHTML } from './format.js';
import { panelHTML, emptyHTML, detailHTML } from './ui.js';
import { pickerHTML, initPicker } from './picker.js';

// Datos reales de Renfe; con ?demo se usa la fuente simulada (para ver la interfaz sin red).
const src = await import(new URLSearchParams(location.search).has('demo') ? './mock.js' : './renfe.js');
if (src.DEMO) store.useDemoStore();

const $ = id => document.getElementById(id);
const board = $('board'), sheet = $('sheet'), scrim = $('scrim');
const REFRESH_MS = 20000;

const ui = { menu: null, confirm: null };
const data = new Map();               // tripId -> resultado de departures() o { error }
let trips = [];
let stationList = [];
let open = null;                      // { kind: 'train', tripId, key } | { kind: 'picker' }
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
  renderBoard();
  await refreshAll();
  setInterval(() => { if (!document.hidden) refreshAll(); }, REFRESH_MS);
  setInterval(tick, 1000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) refreshAll(); });
}

/* ---------- Datos ---------- */

async function refreshTrip(t) {
  try { data.set(t.id, await src.departures(t.from.id, t.to.id, Date.now())); }
  catch (e) { console.error(e); data.set(t.id, { error: true }); }
}

async function refreshAll() {
  await Promise.all(trips.map(refreshTrip));
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
}

/* ---------- Panel lateral (detalle y buscador) ---------- */

function showSheet(html) {
  if (dropPicker) { dropPicker(); dropPicker = null; }
  lastFocus = document.activeElement;
  sheet.innerHTML = html;
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

async function openTrain(tripId, key) {
  const t = trips.find(x => x.id === tripId);
  if (!t) return;
  open = { kind: 'train', tripId, key };
  const d = await src.detail(key, t.from.id, t.to.id, Date.now());
  showSheet(detailHTML(d, Date.now()));
  sheet.querySelector('[data-act=close]').focus();
}

async function refreshDetail() {
  const t = trips.find(x => x.id === open.tripId);
  if (!t) return closeSheet();
  const d = await src.detail(open.key, t.from.id, t.to.id, Date.now());
  const scroll = sheet.querySelector('.sheet__scroll');
  if (!scroll) return;
  const y = scroll.scrollTop;
  const tmp = document.createElement('div');
  tmp.innerHTML = detailHTML(d, Date.now());
  scroll.innerHTML = tmp.querySelector('.sheet__scroll').innerHTML;
  scroll.scrollTop = y;
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
scrim.addEventListener('click', closeSheet);
sheet.addEventListener('click', ev => { if (ev.target.closest('[data-act=close]')) closeSheet(); });

board.addEventListener('click', async ev => {
  const el = ev.target.closest('[data-act]');
  if (!el) return;
  const act = el.dataset.act;
  const panel = el.closest('[data-trip]');
  const id = panel && panel.dataset.trip;

  if (act === 'add') return openPicker();
  if (act === 'train') return openTrain(id, el.dataset.key);
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
    const f = [...sheet.querySelectorAll('button:not([disabled]), input')];
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
