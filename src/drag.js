// Ordenar los viajes del paso 1 arrastrando el asa (⋮⋮) de cada tarjeta. Funciona con dedo y con ratón.
// La tarjeta sigue al puntero; al pasar la mitad de la vecina, cambian de sitio. Al soltar se guarda el orden.

export function initDrag(root, onDone) {
  let st = null;   // { card, list, pid, y0, base }

  root.addEventListener('pointerdown', e => {
    const grip = e.target.closest('.fav__grip');
    if (!grip || (e.pointerType === 'mouse' && e.button !== 0)) return;
    const card = grip.closest('.fav'), list = card && card.parentElement;
    if (!list) return;
    e.preventDefault();
    grip.setPointerCapture(e.pointerId);
    st = { card, list, grip, pid: e.pointerId, y0: e.clientY, base: card.getBoundingClientRect().top };
    card.classList.add('is-drag');
    list.classList.add('is-sorting');
  });

  root.addEventListener('pointermove', e => {
    if (!st || e.pointerId !== st.pid) return;
    const { card, list } = st;
    // Cambia de sitio con la vecina cuando el centro de la tarjeta pasa el centro de esta
    const top = st.base + (e.clientY - st.y0);           // donde se ve la tarjeta ahora
    const mid = top + card.offsetHeight / 2;
    const prev = card.previousElementSibling, next = card.nextElementSibling;
    if (prev && mid < prev.getBoundingClientRect().top + prev.offsetHeight / 2) list.insertBefore(card, prev);
    else if (next && mid > next.getBoundingClientRect().top + next.offsetHeight / 2) list.insertBefore(next, card);
    // La tarjeta sigue al dedo desde donde ha quedado en la lista
    const now = card.getBoundingClientRect().top - (parseFloat(card.style.translate) || 0);
    card.style.translate = `0 ${top - now}px`;
  });

  const end = e => {
    if (!st || e.pointerId !== st.pid) return;
    const { card, list } = st;
    st = null;
    card.style.translate = '';
    card.classList.remove('is-drag');
    list.classList.remove('is-sorting');
    onDone([...list.querySelectorAll('.fav')].map(c => c.dataset.trip));
  };
  root.addEventListener('pointerup', end);
  root.addEventListener('pointercancel', end);
}
