import { esc } from './format.js';

// Colores de las líneas: los route_color del GTFS de Renfe. [fondo, texto]
// (Renfe pone texto blanco en todas; en los claros se usa texto oscuro para que se lea.)
const COLORS = {
  C1: ['#75b6e0', '#0e0d0b'],
  C2: ['#00943d', '#ffffff'],
  C3: ['#952585', '#ffffff'],
  C4: ['#2c2a86', '#ffffff'],
  C5: ['#fecb00', '#0e0d0b'],
  C7: ['#e5202a', '#ffffff'],
  C8: ['#868584', '#ffffff'],
  C9: ['#915419', '#ffffff'],
  C10: ['#bccf00', '#0e0d0b'],
};

export function lineColors(code) {
  const m = /^C(\d+)/i.exec(code || '');
  return COLORS['C' + (m && m[1])] || ['#5e594f', '#ffffff'];
}

export function badge(code) {
  const [b, f] = lineColors(code);
  return `<span class="badge" style="--b:${b};--f:${f}">${esc(code)}</span>`;
}
