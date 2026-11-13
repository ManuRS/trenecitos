const hm = new Intl.DateTimeFormat('es-ES', { timeZone: 'Europe/Madrid', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
const hms = new Intl.DateTimeFormat('es-ES', { timeZone: 'Europe/Madrid', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' });

// Siempre hora de Madrid, esté el móvil donde esté.
export const hhmm = ms => hm.format(ms);
export const hhmmss = ms => hms.format(ms);

/** Minúsculas y sin tildes, para buscar estaciones. */
export const norm = s => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

export const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/**
 * Cuenta atrás hasta la salida, como pares [número, unidad]: 7 min · 1 h 02 min · ya.
 * Redondea hacia abajo: mejor pecar de prisa.
 */
export function etaParts(targetMs, nowMs) {
  const s = Math.round((targetMs - nowMs) / 1000);
  if (s <= 0) return { parts: [['ya', '']], soon: true, long: false };
  if (s < 60) return { parts: [['<1', 'min']], soon: true, long: false };
  const m = Math.floor(s / 60);
  if (m >= 24 * 60) return { parts: [['+24', 'h']], soon: false, long: false };
  if (m >= 60) {
    const h = Math.floor(m / 60), r = m % 60;
    return { parts: r ? [[String(h), 'h'], [String(r).padStart(2, '0'), 'min']] : [[String(h), 'h']], soon: false, long: r > 0 };
  }
  return { parts: [[String(m), 'min']], soon: m <= 3, long: false };
}
/** Clave para saber si hay que repintar la cuenta atrás. */
export const etaKey = e => e.parts.map(p => p.join(' ')).join(' ');
/** Número grande y unidad al lado, en la misma línea. */
export const etaHTML = e => e.parts.map(([n, u]) => `<b>${n}</b>${u ? `<i>${u}</i>` : ''}`).join('');

export const ago = (ms, now) => {
  const s = Math.max(0, Math.round((now - ms) / 1000));
  return s < 60 ? `hace ${s} s` : `hace ${Math.floor(s / 60)} min`;
};

/** Retraso de Renfe (segundos) -> texto largo, texto corto y clase. */
export function delayInfo(sec) {
  if (sec == null) return { text: '', short: '', cls: 'none' };
  if (sec <= -60) { const m = Math.round(-sec / 60); return { text: `Adelanto ${m} min`, short: `−${m} min`, cls: 'early' }; }
  if (sec < 60) return { text: 'Puntual', short: 'Puntual', cls: 'ok' };
  const m = Math.round(sec / 60);
  return { text: `Retraso ${m} min`, short: `+${m} min`, cls: 'late' };
}

const dkey = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid' });
const wday = new Intl.DateTimeFormat('es-ES', { timeZone: 'Europe/Madrid', weekday: 'long' });
/** '' si es hoy (o la misma noche, hasta las 4:00); 'mañana' o 'el lunes' si la salida es otro día (hora de Madrid). */
export function dayTag(ms, now) {
  const a = dkey.format(now), b = dkey.format(ms);
  if (a === b) return '';
  if (+hm.format(ms).slice(0, 2) < 4) return '';          // la madrugada sigue siendo "esta noche"
  const days = Math.round((Date.parse(b) - Date.parse(a)) / 86400e3);
  return days === 1 ? 'mañana' : `el ${wday.format(ms)}`;
}
