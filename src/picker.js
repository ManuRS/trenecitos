import { esc, norm } from './format.js';
import { ICON } from './ui.js';

export function pickerHTML() {
  return `<div class="sheet__bar">
      <button type="button" class="icon-btn" data-act="close" aria-label="Cerrar">${ICON.close}</button>
      <span class="sheet__kicker">Nuevo trayecto</span>
    </div>
    <div class="sheet__scroll picker">
      <div class="fields">
        <label class="field" data-f="from"><span>Origen</span><input type="text" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="Estación de salida" enterkeyhint="next"></label>
        <button type="button" class="swap" data-act="swap" aria-label="Intercambiar origen y destino">${ICON.swap}</button>
        <label class="field" data-f="to"><span>Destino</span><input type="text" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="Estación de llegada" enterkeyhint="done"></label>
      </div>
      <ul class="results" role="listbox"></ul>
      <p class="fine">Solo estaciones del núcleo de Cercanías Madrid.</p>
    </div>
    <div class="sheet__foot"><button type="button" class="btn-add btn-add--big" data-act="save" disabled>Guardar trayecto</button></div>`;
}

/** Conecta la lógica del buscador. Devuelve una función para destruirlo. */
export function initPicker(root, stations, onSave) {
  const sel = { from: null, to: null };
  let active = 'from';
  const inputs = { from: root.querySelector('[data-f=from] input'), to: root.querySelector('[data-f=to] input') };
  const fields = { from: root.querySelector('[data-f=from]'), to: root.querySelector('[data-f=to]') };
  const list = root.querySelector('.results');
  const saveBtn = root.querySelector('[data-act=save]');

  function render() {
    const q = norm(inputs[active].value.trim());
    const other = sel[active === 'from' ? 'to' : 'from'];
    const items = stations
      .filter(s => (!other || s.id !== other.id) && (!q || norm(s.name).includes(q) || (s.alt && norm(s.alt).includes(q))))
      .sort((a, b) => (norm(b.name).startsWith(q) - norm(a.name).startsWith(q)) || a.name.localeCompare(b.name, 'es'));
    list.innerHTML = (sel.from && sel.to) ? '' : items.length
      ? items.map(s => `<li><button type="button" role="option" data-id="${esc(s.id)}">${esc(s.name)}</button></li>`).join('')
      : '<li class="results__none">Ninguna estación coincide</li>';
    saveBtn.disabled = !(sel.from && sel.to);
    for (const f of ['from', 'to']) {
      fields[f].classList.toggle('is-set', !!sel[f]);
      fields[f].classList.toggle('is-active', f === active);
    }
  }

  for (const f of ['from', 'to']) {
    inputs[f].addEventListener('focus', () => { active = f; render(); });
    inputs[f].addEventListener('input', () => { sel[f] = null; render(); });
    inputs[f].addEventListener('keydown', ev => {
      if (ev.key === 'Enter') { ev.preventDefault(); list.querySelector('button')?.click(); }
    });
  }

  const ac = new AbortController();         // el panel lateral se reutiliza: hay que soltar el manejador al cerrar
  root.addEventListener('click', ev => {
    const pick = ev.target.closest('.results button[data-id]');
    if (pick) {
      const s = stations.find(x => x.id === pick.dataset.id);
      sel[active] = s; inputs[active].value = s.name;
      const next = active === 'from' ? 'to' : 'from';
      if (!sel[next]) inputs[next].focus(); else { inputs[active].blur(); render(); }
      return;
    }
    if (ev.target.closest('[data-act=swap]')) {
      [sel.from, sel.to] = [sel.to, sel.from];
      [inputs.from.value, inputs.to.value] = [inputs.to.value, inputs.from.value];
      render();
      return;
    }
    if (ev.target.closest('[data-act=save]') && sel.from && sel.to) onSave({ from: sel.from, to: sel.to });
  }, { signal: ac.signal });

  render();
  inputs.from.focus();
  return () => ac.abort();
}
