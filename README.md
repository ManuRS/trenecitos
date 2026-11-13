# Trenecitos

PWA para entrar y ver de un vistazo si llegas al tren. Solo datos abiertos de Renfe (Cercanías Madrid), sin servidor propio.

- Tiempo real: feeds GTFS-RT de Renfe (`trip_updates`, `vehicle_positions`, `alerts`), cada ~20 s.
- Horarios: GTFS estático de Renfe, procesado a un JSON compacto del núcleo de Madrid.
- Los trayectos guardados viven en el propio dispositivo.

## Pruebas

`test/probe.html` es una sonda: se abre desde una URL https (GitHub Pages) o con `python3 -m http.server`, se pulsan los pasos y se copia el log.

Datos: Renfe Operadora, licencia CC BY 4.0 (https://data.renfe.com).
