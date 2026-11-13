# Trenecitos

PWA para entrar y ver de un vistazo si llegas al tren. Solo datos abiertos de Renfe (Cercanías Madrid), sin servidor propio.

- Tiempo real: feeds GTFS-RT de Renfe (`trip_updates`, `vehicle_positions`, `alerts`), cada ~20 s.
- Horarios: GTFS estático de Renfe, procesado a un JSON compacto del núcleo de Madrid.
- Los trayectos guardados viven en el propio dispositivo.

## Estado

Prototipo de interfaz con datos **simulados** (`src/mock.js`). La fuente real sustituirá a `mock.js` cumpliendo el mismo contrato (`stations`, `departures`, `detail`).

## Estructura

- `index.html`, `styles.css`, `src/`: la app (JS sin framework, módulos ES).
- `test/probe.html`: sonda para ver qué permite Renfe desde el navegador (CORS, forma de los feeds, GTFS).
- `scripts/build.mjs`: genera `dist/` con tipografías e iconos PNG (opcional).
- `scripts/pages.yml`: workflow de GitHub Pages; copiar a `.github/workflows/` para desplegar con compilación.

## Desarrollo

Sin compilar: `python3 -m http.server 8080` en la raíz. Las tipografías caen a un CDN si no existe `fonts/`.

Con compilación: `npm install && npm run serve`.

Datos: Renfe Operadora, licencia CC BY 4.0 (https://data.renfe.com).
