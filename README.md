# Trenecitos

PWA para entrar y ver de un vistazo si llegas al tren. Solo datos abiertos de Renfe (Cercanías Madrid). Sin base de datos ni historial: un proxy mínimo en Cloudflare Pages Functions (Renfe no envía cabeceras CORS) que solo se ejecuta cuando alguien abre la app.

- **Tiempo real:** feeds GTFS-RT de Renfe (`trip_updates`, `vehicle_positions`, `alerts`), cada ~20 s, a través de `/api/rt/*`. Renfe publica un único retraso por viaje: hora estimada = horario + retraso. La posición dice si el tren ya ha pasado por tu estación.
- **Horarios:** GTFS estático de Renfe, convertido en cada build a JSON compacto solo del núcleo de Madrid (`data/index.json` + un fichero por día).
- Los trayectos guardados viven en el propio dispositivo (`localStorage`).

## Estructura

- `index.html`, `styles.css`, `src/`: la app (JS sin framework, módulos ES). `src/renfe.js` es la fuente real; `src/mock.js` es una fuente simulada que se ve con `?demo`.
- `scripts/gtfs.mjs`: descarga el GTFS y lo convierte (recorta los espacios de los campos, filtra rutas `10T…`, agrupa en patrones de recorrido y un fichero por día).
- `scripts/build.mjs`: genera `dist/` con la app, tipografías, iconos PNG y los horarios.
- `functions/api/rt/[feed].js`: proxy de los feeds de tiempo real, con caché de borde de 15 s.
- `functions/api/gtfs.js`: proxy del zip GTFS estático (caché 1 h). También sirve de plan B para el build.
- `test/probe.html`: sonda para ver qué permite Renfe (feeds, GTFS) a través del proxy o en directo.
- `scripts/rebuild-hook.yml`: plantilla de GitHub Action que dispara un redespliegue diario (ver abajo).

## Despliegue

Cloudflare Pages conectado a este repositorio (las Functions solo se despliegan así). Comando de compilación `npm run build`, directorio de salida `dist`. GitHub Pages no se usa.

El build descarga el GTFS de Renfe (`ssl.renfe.com`); si falla, lo pide a `/api/gtfs` del propio sitio. Si tampoco hay manera, el build falla y Cloudflare deja en producción la versión anterior.

Los horarios traen una ventana de ~30 días que Renfe renueva a diario, así que conviene redesplegar al menos una vez al día:

1. Cloudflare → proyecto → Settings → Builds → **Deploy hooks** → crear uno y copiar la URL.
2. GitHub → repo → Settings → Secrets and variables → Actions → secreto `CF_DEPLOY_HOOK` con esa URL.
3. Copiar `scripts/rebuild-hook.yml` a `.github/workflows/rebuild.yml`.

## Desarrollo

Con compilación y un GTFS local: `npm install && GTFS_ZIP=ruta/fomento_transit.zip npm run serve`. Sin `GTFS_ZIP` descarga el de Renfe.

Datos: Renfe Operadora, licencia CC BY 4.0 (https://data.renfe.com).
