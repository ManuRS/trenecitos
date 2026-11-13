# Trenecitos

PWA para entrar y ver de un vistazo si llegas al tren. Solo datos abiertos de Renfe (Cercanías Madrid). Sin base de datos ni historial: un proxy mínimo en Cloudflare Pages Functions (Renfe no envía cabeceras CORS) que solo se ejecuta cuando alguien abre la app.

- Tiempo real: feeds GTFS-RT de Renfe (`trip_updates`, `vehicle_positions`, `alerts`), cada ~20 s.
- Horarios: GTFS estático de Renfe, procesado a un JSON compacto del núcleo de Madrid.
- Los trayectos guardados viven en el propio dispositivo.

## Estado

Prototipo de interfaz con datos **simulados** (`src/mock.js`). La fuente real sustituirá a `mock.js` cumpliendo el mismo contrato (`stations`, `departures`, `detail`).

## Estructura

- `index.html`, `styles.css`, `src/`: la app (JS sin framework, módulos ES).
- `test/probe.html`: sonda para ver qué permite Renfe (feeds, GTFS) a través del proxy o en directo.
- `scripts/build.mjs`: genera `dist/` con tipografías e iconos PNG (opcional).
- `functions/api/rt/[feed].js`: proxy de los feeds de tiempo real (`trip_updates`, `vehicle_positions`, `alerts`), con caché de borde de 15 s.
- `functions/api/gtfs.js`: proxy del zip GTFS estático (caché 1 h).

## Despliegue

Cloudflare Pages conectado a este repositorio (las Functions solo se despliegan así). Comando de compilación `npm run build`, directorio de salida `dist`. GitHub Pages no se usa.

## Desarrollo

Sin compilar: `python3 -m http.server 8080` en la raíz. Las tipografías caen a un CDN si no existe `fonts/`.

Con compilación: `npm install && npm run serve`.

Datos: Renfe Operadora, licencia CC BY 4.0 (https://data.renfe.com).
