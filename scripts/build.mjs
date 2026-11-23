// Construye dist/: copia la app, las tipografías (desde node_modules), los iconos PNG y los horarios de Madrid
// (descarga el GTFS de Renfe y lo convierte; si GTFS_ZIP apunta a un zip local, usa ese).
import { cp, mkdir, rm, readFile, writeFile } from 'node:fs/promises';
import { Resvg } from '@resvg/resvg-js';
import { convert, download, madridToday, GTFS_URL } from './gtfs.mjs';

const dist = 'dist';
await rm(dist, { recursive: true, force: true });
await mkdir(dist, { recursive: true });

for (const p of ['index.html', 'styles.css', 'manifest.webmanifest', 'icon.svg', 'src', 'img', 'test']) {
  await cp(p, `${dist}/${p}`, { recursive: true });
}

// El service worker lleva la versión de build para invalidar la caché en cada despliegue.
const sw = (await readFile('sw.js', 'utf8')).replace('__BUILD__', new Date().toISOString());
await writeFile(`${dist}/sw.js`, sw);

await mkdir(`${dist}/fonts`, { recursive: true });
const fonts = [
  ['@fontsource/barlow-condensed', 'barlow-condensed', [500, 600, 700]],
  ['@fontsource/ibm-plex-mono', 'ibm-plex-mono', [400, 500]],
];
for (const [pkg, name, weights] of fonts) {
  for (const w of weights) {
    const f = `${name}-latin-${w}-normal.woff2`;
    await cp(`node_modules/${pkg}/files/${f}`, `${dist}/fonts/${f}`);
  }
}

await mkdir(`${dist}/icons`, { recursive: true });
const svg = await readFile('icon.svg');
for (const size of [180, 192, 512]) {
  const png = new Resvg(svg, { fitTo: { mode: 'width', value: size } }).render().asPng();
  await writeFile(`${dist}/icons/icon-${size}.png`, png);
}
await cp(`${dist}/icons/icon-180.png`, `${dist}/icons/apple-touch-icon.png`);
// Icono de la barra de estado para la notificación (Android usa solo la silueta: la marca en blanco sobre transparente)
const mark = (await readFile('index.html', 'utf8')).match(/class="brand__mark" viewBox="([^"]+)"[^>]*><path fill-rule="evenodd" d="([^"]+)"/);
const [vx, vy, vw, vh] = mark[1].split(' ').map(Number), side = Math.max(vw, vh) * 1.08;   // cuadrado, con un poco de aire
const badge = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vx - (side - vw) / 2} ${vy - (side - vh) / 2} ${side} ${side}"><path fill="#fff" fill-rule="evenodd" d="${mark[2]}"/></svg>`;
await writeFile(`${dist}/icons/badge-96.png`, new Resvg(badge, { fitTo: { mode: 'width', value: 96 } }).render().asPng());
// ---------- Horarios ----------
// Si la descarga o la conversión fallan, el build falla y Cloudflare deja el despliegue anterior en producción.
let zip;
if (process.env.GTFS_ZIP) zip = { buf: new Uint8Array(await readFile(process.env.GTFS_ZIP)), from: process.env.GTFS_ZIP };
else zip = await download([
  process.env.GTFS_URL || GTFS_URL,
  // Plan B: la función proxy ya desplegada (Cloudflare sí valida bien el certificado de Renfe).
  process.env.GTFS_FALLBACK_URL || 'https://trenecitos.pages.dev/api/gtfs',
]);
console.log(`GTFS: ${(zip.buf.length / 1048576).toFixed(1)} MB desde ${zip.from}`);
const t0 = Date.now();
const { index, days, stats } = convert(zip.buf);
if (!days.size) throw new Error('El GTFS no trae ningún día con trenes de Madrid');
const today = madridToday();
if (!days.has(today)) console.warn(`AVISO: el GTFS no incluye hoy (${today}); días: ${[...days.keys()].join(', ')}`);
await mkdir(`${dist}/data/d`, { recursive: true });
await writeFile(`${dist}/data/index.json`, JSON.stringify(index));
for (const [d, v] of days) await writeFile(`${dist}/data/d/${d}.json`, JSON.stringify(v));
const size = (await readFile(`${dist}/data/index.json`)).length;
console.log(`Horarios de Madrid en ${((Date.now() - t0) / 1000).toFixed(1)} s:`, stats, `· index.json ${(size / 1024).toFixed(0)} KB`);

console.log('dist/ listo');
