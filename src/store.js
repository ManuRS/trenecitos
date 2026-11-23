// Todo se guarda en el propio navegador (localStorage): sin cuentas ni servidor.
// La demostración usa otro prefijo, para no pisar los datos reales.
let NS = 'trenecitos:v1:';
export const useDemoStore = () => { NS = 'trenecitos:demo:'; };

const read = k => { try { return JSON.parse(localStorage.getItem(NS + k)); } catch { return null; } };
const write = (k, v) => { try { localStorage.setItem(NS + k, JSON.stringify(v)); } catch { /* almacenamiento no disponible */ } };
const drop = k => { try { localStorage.removeItem(NS + k); } catch { /* idem */ } };

/** Trayectos: la lista guardada, o null si nunca se ha guardado nada. */
export function load() { const v = read('trips'); return Array.isArray(v) ? v : null; }
export const save = trips => write('trips', trips);

/** Ajustes, con valores por defecto para lo que falte. */
export const DEFAULTS = { count: 2, awake: true, vibrate: true, notify: true };
export function loadSettings() {
  const v = read('settings');
  const s = { ...DEFAULTS, ...(v && typeof v === 'object' ? v : {}) };
  s.count = Math.min(3, Math.max(2, Math.round(+s.count) || DEFAULTS.count));
  return s;
}
export const saveSettings = s => write('settings', s);

/** "Mi tren": el tren que el usuario ha marcado para seguir. */
export const loadRide = () => { const v = read('ride'); return v && v.key && v.from && v.to ? v : null; };
export const saveRide = r => (r ? write('ride', r) : drop('ride'));

/** Borra todo lo guardado. */
export const wipe = () => { drop('trips'); drop('settings'); drop('ride'); };
