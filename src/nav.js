// Navegación: el botón (o gesto) de "atrás" y las ventanas de confirmación.
//
// La app va por pasos (1 tu viaje → 2 elige tren → 3 tu tren) y encima puede haber un panel (buscador, ajustes).
// Mientras no estés en el paso 1 sin nada abierto, atrás NO sale de la app: retrocede un nivel (app.js decide cómo;
// del paso 3 al 2 pide confirmación). En el paso 1, atrás sale con normalidad.
//
// Mismo planteamiento que backguard.js de radio_web_neo. En móviles táctiles con CloseWatcher (Chrome/Android) el
// navegador avisa del gesto sin tocar el historial; sin CloseWatcher (PC, iOS, Firefox) se usa una entrada propia
// en el historial y se actúa al volver de ella.

const COARSE = matchMedia('(pointer: coarse)').matches;
const useWatcher = COARSE && 'CloseWatcher' in window;

let cfg = { depth: () => 0, back: async () => {}, hasRide: () => false };
let watcher = null;           // CloseWatcher activo
let entry = false;            // entrada propia en el historial (sin CloseWatcher)
let ignore = 0;               // popstate provocados por nosotros mismos
let busy = false;             // atendiendo un "atrás"

const openDialog = d => { if (typeof d.showModal === 'function') { if (!d.open) d.showModal(); } else d.setAttribute('open', ''); };

/* ---------- Aviso breve ---------- */

let toastEl = null, toastT = 0;
export function toast(msg, ms = 4000) {
  if (!toastEl) { toastEl = document.createElement('div'); toastEl.className = 'toast'; toastEl.setAttribute('role', 'status'); document.body.append(toastEl); }
  toastEl.textContent = msg; toastEl.hidden = false;
  clearTimeout(toastT); toastT = setTimeout(() => { toastEl.hidden = true; }, ms);
}

/* ---------- Confirmación ---------- */

/** Pregunta con dos botones. Devuelve true si se confirma; atrás/Escape/fuera cuentan como cancelar. */
export function ask({ title, text, ok, no = 'Cancelar', danger = true }) {
  const d = document.getElementById('askDlg');
  d.querySelector('[data-t=title]').textContent = title;
  d.querySelector('[data-t=text]').textContent = text;
  const bo = d.querySelector('[data-t=ok]'), bn = d.querySelector('[data-t=no]');
  bo.textContent = ok; bn.textContent = no;
  bo.classList.toggle('btn-add--danger', danger);
  d.returnValue = '';
  return new Promise(res => {
    d.addEventListener('close', () => res(d.returnValue === 'ok'), { once: true });
    openDialog(d);
  });
}

/* ---------- Guarda de "atrás" ---------- */

function arm() {
  if (useWatcher) {
    if (watcher) return;
    const w = new CloseWatcher();
    watcher = w;
    w.addEventListener('close', () => { if (watcher !== w) return; watcher = null; onBack(); });
  } else if (!entry) {
    history.pushState({ tc: 1 }, '');
    entry = true;
  }
}

function disarm() {
  if (watcher) { const w = watcher; watcher = null; w.destroy(); }
  if (entry) { entry = false; if (history.state && history.state.tc) { ignore++; history.back(); } }
}

/** Llamar tras cada cambio de pantalla: arma o retira la guarda según haya o no niveles por encima del paso 1. */
export function sync() { if (busy) return; if (cfg.depth() > 0) arm(); else disarm(); }

async function onBack() {
  sync();          // se rearma ya: si app.js pregunta algo, otro "atrás" no debe sacar de la app
  busy = true;
  try { await cfg.back(); } finally { busy = false; }
  sync();
}

export function initNav(c) {
  cfg = c;
  window.addEventListener('popstate', e => {
    if (ignore > 0) { ignore--; return; }
    if (!entry || (e.state && e.state.tc)) return;
    entry = false;
    const d = document.querySelector('dialog[open]');   // atrás con una pregunta abierta = cancelar
    if (d) { d.close(); sync(); return; }
    onBack();
  });
  // Cerrar o recargar la pestaña siguiendo un tren: aviso del propio navegador (en PC; en el móvil no aplica)
  window.addEventListener('beforeunload', e => { if (cfg.hasRide()) { e.preventDefault(); e.returnValue = ''; } });
  // El navegador solo respeta del todo lo creado tras tocar la página: se rehace la guarda en el primer toque.
  addEventListener('pointerdown', () => { if (watcher) { const w = watcher; watcher = null; w.destroy(); } sync(); }, { once: true, capture: true });
  sync();
}
