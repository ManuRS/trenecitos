// Instalar la app (PWA). Chrome/Edge en Android y PC avisan con "beforeinstallprompt" y se instala con un botón;
// en iPhone/iPad no hay botón: se hace desde Compartir › Añadir a pantalla de inicio.

let deferred = null;
const subs = new Set();
const emit = () => subs.forEach(f => f());

const standalone = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
const ios = /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

addEventListener('beforeinstallprompt', e => { e.preventDefault(); deferred = e; emit(); });
addEventListener('appinstalled', () => { deferred = null; emit(); });

/** 'installed' · 'prompt' (hay botón) · 'ios' (a mano desde Compartir) · 'none' (el navegador no lo ofrece) */
export function state() {
  if (standalone()) return 'installed';
  if (deferred) return 'prompt';
  if (ios) return 'ios';
  return 'none';
}

export async function install() {
  if (!deferred) return false;
  const e = deferred; deferred = null;
  e.prompt();
  const { outcome } = await e.userChoice.catch(() => ({ outcome: 'dismissed' }));
  emit();
  return outcome === 'accepted';
}

export const onChange = f => subs.add(f);
