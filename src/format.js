const hm = new Intl.DateTimeFormat('es-ES', { timeZone: 'Europe/Madrid', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
const hms = new Intl.DateTimeFormat('es-ES', { timeZone: 'Europe/Madrid', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' });

// Siempre hora de Madrid, esté el móvil donde esté.
export const hhmm = ms => hm.format(ms);
export const hhmmss = ms => hms.format(ms);

/** Minúsculas y sin tildes, para buscar estaciones. */
export const norm = s => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

export const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/** Cuenta atrás hasta la salida. Redondea hacia abajo: mejor pecar de prisa. */
export function etaParts(targetMs, nowMs) {
  const s = Math.round((targetMs - nowMs) / 1000);
  if (s <= 0) return { big: 'ya', unit: '', soon: true };
  if (s < 60) return { big: '<1', unit: 'min', soon: true };
  const m = Math.floor(s / 60);
  if (m >= 24 * 60) return { big: '>24', unit: 'h', soon: false };
  if (m >= 100) return { big: `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`, unit: 'h', soon: false };
  return { big: String(m), unit: 'min', soon: m <= 3 };
}

export const ago = (ms, now) => {
  const s = Math.max(0, Math.round((now - ms) / 1000));
  return s < 60 ? `hace ${s} s` : `hace ${Math.floor(s / 60)} min`;
};

/** Retraso de Renfe (segundos) -> texto y clase. */
export function delayInfo(sec) {
  if (sec == null) return { text: '', cls: 'none' };
  if (sec <= -60) return { text: `${Math.round(-sec / 60)} min antes`, cls: 'early' };
  if (sec < 60) return { text: 'Puntual', cls: 'ok' };
  return { text: `+${Math.round(sec / 60)} min`, cls: 'late' };
}

const dkey = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid' });
const wday = new Intl.DateTimeFormat('es-ES', { timeZone: 'Europe/Madrid', weekday: 'long' });
/** '' si es hoy; 'mañana' o 'el lunes' si la salida es otro día (en hora de Madrid). */
export function dayTag(ms, now) {
  const a = dkey.format(now), b = dkey.format(ms);
  if (a === b) return '';
  const days = Math.round((Date.parse(b) - Date.parse(a)) / 86400e3);
  return days === 1 ? 'mañana' : `el ${wday.format(ms)}`;
}
