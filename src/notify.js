// Notificación para volver a la app mientras sigues un tren.
// Sin servidor: se crea al salir de la app (minimizar, cambiar de app, apagar pantalla) con los datos de ese momento
// y no se actualiza mientras estás fuera; por eso dice a qué hora son los datos. Tocarla vuelve a la app (sw.js)
// y se quita sola al volver o al terminar el viaje.
import { hhmm } from './format.js';
import { rideInfo } from './ride.js';

const TAG = 'ride';
const ok = () => 'Notification' in window && 'serviceWorker' in navigator;

/** Pide permiso (una vez). Llamar dentro de un toque del usuario, al elegir tren. */
export function askPermission() {
  if (ok() && Notification.permission === 'default') Notification.requestPermission().catch(() => {});
}

// Textos cortos: título con lo esencial; debajo, el trayecto, la llegada y la hora de los datos, cada cosa en su línea.
function text(ride, d, now) {
  const route = `${ride.from.name} → ${ride.to.name}`;
  if (!d) return { title: `Salida ${hhmm(ride.schedDep)}`, body: route };
  const t = d.train, inf = rideInfo(d, now);
  const upd = `Actualizado ${hhmm(d.updatedAt || now)}`;
  if (inf.phase === 'cancelled') return { title: 'Tren cancelado', body: `${route}\n${upd}` };
  if (inf.phase === 'riding') {
    const next = inf.left === 1 ? 'Bajas en la siguiente' : `Siguiente: ${inf.next.name}`;
    return { title: `Llegada ${hhmm(t.estArr)}`, body: `${route}\n${next} · ${upd}` };
  }
  return { title: `Salida ${hhmm(t.estDep)}${t.platform ? ` · Vía ${t.platform}` : ''}`, body: `${route}\nLlegada ${hhmm(t.estArr)} · ${upd}` };
}

export async function show(ride, d, now = Date.now()) {
  if (!ok() || Notification.permission !== 'granted') return;
  try {
    const reg = await navigator.serviceWorker.ready;
    const { title, body } = text(ride, d, now);
    await reg.showNotification(title, {
      body, tag: TAG, renotify: false, silent: true,
      badge: 'icons/badge-96.png', icon: 'icons/blank.png', timestamp: d && d.updatedAt ? d.updatedAt : now,
    });
  } catch { /* el navegador puede negarlo */ }
}

export async function clear() {
  if (!ok()) return;
  try { (await (await navigator.serviceWorker.ready).getNotifications({ tag: TAG })).forEach(n => n.close()); }
  catch { /* nada */ }
}
