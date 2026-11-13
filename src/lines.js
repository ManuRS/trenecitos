import { esc } from './format.js';

// Colores aproximados de las líneas de Cercanías Madrid: [fondo, texto].
const COLORS = {
  C1: ['#5bb4e5', '#0e0d0b'],
  C2: ['#14a05a', '#ffffff'],
  C3: ['#a2349b', '#ffffff'],
  C4: ['#2f55b3', '#ffffff'],
  C5: ['#f2c12e', '#0e0d0b'],
  C7: ['#d9342b', '#ffffff'],
  C8: ['#7d8793', '#ffffff'],
  C9: ['#8b5a2b', '#ffffff'],
  C10: ['#9bb52b', '#0e0d0b'],
};

export function lineColors(code) {
  const m = /^C(\d+)/i.exec(code || '');
  return COLORS['C' + (m && m[1])] || ['#5e594f', '#ffffff'];
}

export function badge(code) {
  const [b, f] = lineColors(code);
  return `<span class="badge" style="--b:${b};--f:${f}">${esc(code)}</span>`;
}
