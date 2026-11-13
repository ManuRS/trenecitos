const KEY = 'trenecitos:v1:trips';

/** Devuelve la lista guardada, o null si nunca se ha guardado nada. */
export function load() {
  try {
    const v = JSON.parse(localStorage.getItem(KEY));
    return Array.isArray(v) ? v : null;
  } catch { return null; }
}

export function save(trips) {
  try { localStorage.setItem(KEY, JSON.stringify(trips)); } catch { /* almacenamiento no disponible */ }
}
