const pad = n => String(n).padStart(2, '0');

export const hhmm = ms => { const d = new Date(ms); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; };
export const hhmmss = ms => { const d = new Date(ms); return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`; };

/** Minúsculas y sin tildes, para buscar estaciones. */
export const norm = s => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

export const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/** Cuenta atrás hasta la salida. Redondea hacia abajo: mejor pecar de prisa. */
export function etaParts(targetMs, nowMs) {
  const s = Math.round((targetMs - nowMs) / 1000);
  if (s <= 0) return { big: 'ya', unit: '', soon: true };
  if (s < 60) return { big: '<1', unit: 'min', soon: true };
  const m = Math.floor(s / 60);
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
