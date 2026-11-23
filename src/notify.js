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

function text(ride, d, now) {
  const head = `${ride.from.name} → ${ride.to.name}`;
  if (!d) return { title: `Tu tren de las ${hhmm(ride.schedDep)}`, body: head };
  const t = d.train, inf = rideInfo(d, now);
  const upd = `Actualizado a las ${hhmm(d.updatedAt || now)}`;
  const late = t.delay >= 60 ? ` · retraso ${Math.round(t.delay / 60)} min` : '';
  if (inf.phase === 'cancelled') return { title: 'Tu tren está cancelado', body: `${head}\n${upd}` };
  if (inf.phase === 'riding') {
    const next = inf.left === 1 ? 'Bajas en la siguiente' : `Siguiente: ${inf.next.name}`;
    return { title: `Llegas a las ${hhmm(t.estArr)}${late}`, body: `${next}\n${upd}` };
  }
  const via = t.platform ? ` · vía ${t.platform}` : '';
  return { title: `Tu tren sale a las ${hhmm(t.estDep)}${via}${late}`, body: `${head} · llegas a las ${hhmm(t.estArr)}\n${upd}` };
}

export async function show(ride, d, now = Date.now()) {
  if (!ok() || Notification.permission !== 'granted') return;
  try {
    const reg = await navigator.serviceWorker.ready;
    const { title, body } = text(ride, d, now);
    await reg.showNotification(title, {
      body, tag: TAG, renotify: false, silent: true,
      icon: 'icons/icon-192.png', timestamp: d && d.updatedAt ? d.updatedAt : now,
    });
  } catch { /* el navegador puede negarlo */ }
}

export async function clear() {
  if (!ok()) return;
  try { (await (await navigator.serviceWorker.ready).getNotifications({ tag: TAG })).forEach(n => n.close()); }
  catch { /* nada */ }
}
