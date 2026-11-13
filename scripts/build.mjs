// Construye dist/: copia la app, las tipografías (desde node_modules) y genera los iconos PNG.
import { cp, mkdir, rm, readFile, writeFile } from 'node:fs/promises';
import { Resvg } from '@resvg/resvg-js';

const dist = 'dist';
await rm(dist, { recursive: true, force: true });
await mkdir(dist, { recursive: true });

for (const p of ['index.html', 'styles.css', 'manifest.webmanifest', 'icon.svg', 'src', 'test']) {
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
console.log('dist/ listo');
