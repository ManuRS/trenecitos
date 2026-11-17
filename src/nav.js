// Navegación: el botón (o gesto) de "atrás" y las ventanas de confirmación.
//
//  · Con un panel abierto (buscador, ajustes, detalle de un tren), atrás cierra el panel y deja en la pantalla principal.
//  · Con "mi tren" marcado, atrás desde la pantalla principal NO saca de la app: pregunta antes. Lo que buscamos es que
//    el usuario minimice la app y no la cierre, para no perder el código en marcha (avisos futuros, bloqueo de pantalla…).
//  · Sin tren marcado, atrás sigue su camino sin preguntar.
//
// Mismo planteamiento que backguard.js de radio_web_neo. En móviles táctiles con CloseWatcher (Chrome/Android) el navegador
// avisa del gesto sin tocar el historial, así Android no anima la "vista previa" de la página anterior. Sin CloseWatcher
// (PC, iOS, Firefox) se añaden entradas propias al historial y se actúa al volver de ellas.

const COARSE = matchMedia('(pointer: coarse)').matches;
const useWatcher = COARSE && 'CloseWatcher' in window;

let cfg = { closeOverlay() {}, hasRide: () => false };
let exitDlg = null;
let ow = null;                // CloseWatcher del panel abierto
let sheetEntry = false;       // entrada de historial del panel abierto (sin CloseWatcher)
let hw = null;                // CloseWatcher de la pantalla principal (con tren marcado)
let hEntry = false;           // entrada de historial de guarda de la pantalla principal
let dlgW = null;              // CloseWatcher de la ventana de salida
let ignore = 0;               // popstate provocados por nosotros mismos
let leaving = false;

const openDialog = d => { if (typeof d.showModal === 'function') { if (!d.open) d.showModal(); } else d.setAttribute('open', ''); };
const closeDialog = d => { if (typeof d.close === 'function') { if (d.open) d.close(); } else d.removeAttribute('open'); };
const anyDialog = () => document.querySelector('dialog[open]');

/* ---------- Aviso breve ---------- */

let toastEl = null, toastT = 0;
export function toast(msg, ms = 4000) {
  if (!toastEl) { toastEl = document.createElement('div'); toastEl.className = 'toast'; toastEl.setAttribute('role', 'status'); document.body.append(toastEl); }
  toastEl.textContent = msg; toastEl.hidden = false;
  clearTimeout(toastT); toastT = setTimeout(() => { toastEl.hidden = true; }, ms);
}

/* ---------- Confirmación genérica ---------- */

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

/* ---------- Panel abierto: atrás lo cierra ---------- */

export function overlayOpened() {
  if (useWatcher) {
    if (ow) return;
    const w = new CloseWatcher();
    ow = w;
    w.addEventListener('close', () => { if (ow === w) ow = null; cfg.closeOverlay(); });
  } else if (!sheetEntry) {
    history.pushState({ tc: 'sheet' }, '');
    sheetEntry = true;
  }
}

/** El panel se ha cerrado por otro camino (cruz, fuera, Escape…): se retira la entrada o el vigilante. */
export function overlayClosed() {
  if (useWatcher) { if (ow) { const w = ow; ow = null; w.destroy(); } return; }
  if (!sheetEntry) return;
  sheetEntry = false;
  if (history.state && history.state.tc === 'sheet') { ignore++; history.back(); }
}

/* ---------- Pantalla principal con "mi tren": atrás pregunta ---------- */

function armGuard() {
  if (leaving || !cfg.hasRide()) return;
  if (useWatcher) {
    if (hw) return;
    const w = new CloseWatcher();
    hw = w;
    // Primer atrás: se cancela y se pregunta. Chrome solo permite cancelar si se ha tocado la página; si no, salta "close" para no atrapar a nadie.
    w.addEventListener('cancel', e => {
      if (!e.cancelable) return;
      e.preventDefault(); w.destroy(); hw = null;
      if (cfg.hasRide()) showExit(); 
    });
    w.addEventListener('close', () => { hw = null; if (!leaving) history.back(); });
  } else if (!hEntry) {
    history.pushState({ tc: 'guard' }, '');
    hEntry = true;
  }
}
function disarmGuard() {
  if (hw) { hw.destroy(); hw = null; }
  if (hEntry && history.state && history.state.tc === 'guard') { hEntry = false; ignore++; history.back(); }
  // si hay un panel encima de la entrada, se queda: al llegar a ella con el tren ya quitado, se deja pasar
}

/** Llamar cuando se marca o se quita "mi tren". */
export function rideChanged() { if (cfg.hasRide()) armGuard(); else disarmGuard(); }

function showExit() {
  openDialog(exitDlg);
  if (!useWatcher || dlgW) return;
  const d = new CloseWatcher();
  dlgW = d;
  d.addEventListener('close', () => { dlgW = null; stay(); });   // atrás con la ventana abierta = seguir en la app
}
function stay() { closeDialog(exitDlg); armGuard(); }

function leave() {
  if (leaving) return;
  leaving = true;
  closeDialog(exitDlg);
  history.go(hEntry ? -2 : -1);
  // Una app instalada o una pestaña sin página anterior no se puede cerrar desde la web: se intenta y, si sigue aquí, se avisa.
  setTimeout(() => {
    try { window.close(); } catch { /* nada */ }
    setTimeout(() => {
      leaving = false;
      if (document.visibilityState === 'visible') { toast(COARSE ? 'Ya puedes salir de la app. Tu tren sigue marcado.' : 'Ya puedes cerrar la pestaña. Tu tren sigue marcado.'); armGuard(); }
    }, 250);
  }, 300);
}

/* ---------- Arranque ---------- */

export function initNav(c) {
  cfg = c;
  exitDlg = document.getElementById('exitDlg');
  exitDlg.querySelector('[data-t=stay]').addEventListener('click', stay);
  exitDlg.querySelector('[data-t=leave]').addEventListener('click', leave);
  exitDlg.addEventListener('cancel', e => { e.preventDefault(); stay(); });
  exitDlg.addEventListener('close', () => { if (dlgW) { dlgW.destroy(); dlgW = null; } if (!leaving) armGuard(); });

  window.addEventListener('popstate', e => {
    if (ignore > 0) { ignore--; return; }
    if (sheetEntry && !(e.state && e.state.tc === 'sheet')) { sheetEntry = false; cfg.closeOverlay(); return; }   // atrás cierra el panel
    if (hEntry && !(e.state && e.state.tc === 'guard') && !sheetEntry) {
      hEntry = false;
      if (leaving) return;
      if (!cfg.hasRide()) { history.back(); return; }          // sin tren marcado, el atrás sigue su camino
      const d = anyDialog();
      if (d === exitDlg) stay(); else if (d) { closeDialog(d); armGuard(); } else { showExit(); armGuard(); }
    }
  });

  // Cerrar o recargar la pestaña con tren marcado: aviso del propio navegador (en PC; en el móvil no aplica)
  window.addEventListener('beforeunload', e => { if (cfg.hasRide() && !leaving) { e.preventDefault(); e.returnValue = ''; } });

  // El navegador solo respeta lo que se crea tras tocar la página: si al abrir ya había un tren marcado, se arma también en el primer toque.
  addEventListener('pointerdown', () => armGuard(), { once: true, capture: true });
}
