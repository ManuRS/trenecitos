import { esc, hhmm, hhmmss, etaParts, etaKey, etaHTML, ago, delayInfo, dayTag } from './format.js';
import { badge } from './lines.js';

export const ICON = {
  dots: '<svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="3" cy="8" r="1.4"/><circle cx="8" cy="8" r="1.4"/><circle cx="13" cy="8" r="1.4"/></svg>',
  close: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3 3l10 10M13 3L3 13"/></svg>',
  check: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3 8.5l3.2 3.2L13 4.8"/></svg>',
  swap: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M5 2v11M2 10l3 3 3-3M11 14V3M8 6l3-3 3 3"/></svg>',
};

const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

/* ---------- Panel de un trayecto ---------- */

function stateLine(t) {
  if (t.status === 'cancelled') return { cls: 'off', text: 'Cancelado' };
  const d = delayInfo(t.delay);
  const via = t.platform ? `vía ${t.platform}` : '';
  if (t.status === 'scheduled') {
    return { cls: d.cls === 'late' ? 'late' : 'sched', text: [d.cls === 'late' ? d.text : '', d.cls === 'late' ? 'según horario' : 'según horario · sin posición'].filter(Boolean).join(' · ') };
  }
  const phase = t.phase === 'at' ? 'en la estación' : t.phase === 'arriving' ? 'llegando' : 'circulando';
  return { cls: d.cls, text: [d.text, phase, via].filter(Boolean).join(' · ') };
}

function trainRow(t, i, now, ui) {
  const e = etaParts(t.estDep, now);
  const changed = t.status !== 'cancelled' && hhmm(t.schedDep) !== hhmm(t.estDep);
  const st = stateLine(t);
  const live = t.status !== 'cancelled';
  const mine = ui.rideKey === t.key;
  return `<div class="tr${i === 0 ? ' tr--next' : ''}${live ? ' tr--pin' : ' tr--off'}${mine ? ' tr--mine' : ''}">
    <button type="button" class="tr__open" data-act="train" data-key="${esc(t.key)}">
      ${badge(t.line)}
      <span class="tr__main">
        <span class="tr__dep">${changed ? `<s>${hhmm(t.schedDep)}</s>` : ''}${hhmm(t.estDep)}</span>
        <span class="tr__arr">Llega a las <b>${hhmm(t.estArr)}</b></span>
        <span class="tr__sub">${dayTag(t.estDep, now) ? `<b class="tr__day">${dayTag(t.estDep, now)}</b> · ` : ''}Tren sentido ${esc(t.headsign)}</span>
      </span>
      ${live
        ? `<span class="tr__eta${e.soon ? ' is-soon' : ''}${e.long ? ' is-long' : ''}" data-eta="${t.estDep}" data-k="${esc(etaKey(e))}">${etaHTML(e)}</span>`
        : '<span class="tr__eta"><b>—</b></span>'}
      <span class="tr__state tr__state--${st.cls}">${esc(st.text)}</span>
    </button>
    ${live ? `<button type="button" class="tr__pin${mine ? ' is-on' : ''}" data-act="ride" data-key="${esc(t.key)}" aria-pressed="${mine}">${mine ? ICON.check + 'Mi tren' : 'Es mi tren'}</button>` : ''}
  </div>`;
}

/** Color del símbolo de ruta según cómo va el próximo tren: en hora, con retraso, cancelado, sin datos. */
function routeTone(d) {
  if (!d || d.error || d.noDirect) return 'none';
  const t = d.trains.find(x => x.status !== 'cancelled');
  if (!t) return d.trains.length ? 'off' : 'none';
  const c = delayInfo(t.delay).cls;
  return c === 'ok' || c === 'early' ? 'ok' : c === 'late' ? 'late' : 'none';
}

export function panelHTML(trip, d, ui, now) {
  const menu = ui.menu === trip.id;
  const confirm = ui.confirm === trip.id;
  let body;
  if (!d) body = '<p class="note">Cargando trenes…</p>';
  else if (d.error) body = `<p class="note note--bad">${d.reason === 'stale' ? 'Los horarios guardados no incluyen hoy. Recarga la página en un rato.' : d.reason === 'station' ? 'Una de las estaciones ya no existe en los horarios de Renfe. Quita el trayecto y vuelve a crearlo.' : 'No se han podido cargar los horarios de Renfe.'}</p>`;
  else if (d.noDirect) body = '<p class="note">No hay tren directo entre estas dos estaciones. Hará falta un transbordo.</p>';
  else if (!d.trains.length) body = '<p class="note">No hay trenes en las próximas horas.</p>';
  else body = d.trains.map((t, i) => trainRow(t, i, now, ui)).join('');

  return `<article class="panel" data-trip="${esc(trip.id)}">
    <header class="panel__head">
      <div class="route route--${routeTone(d)}">
        <div class="route__row"><i class="route__dot"></i><span class="route__name">${esc(trip.from.name)}</span></div>
        <div class="route__row"><i class="route__dot route__dot--end"></i><span class="route__name">${esc(trip.to.name)}</span></div>
      </div>
      <button type="button" class="icon-btn" data-act="menu" aria-label="Opciones del trayecto" aria-expanded="${menu}">${ICON.dots}</button>
    </header>
    ${menu ? `<div class="panel__menu">
      <button type="button" data-act="reverse">${ICON.swap}Invertir trayecto</button>
      <button type="button" class="danger" data-act="remove">${confirm ? 'Pulsa otra vez para quitar' : 'Quitar'}</button>
    </div>` : ''}
    <div class="trains">${body}</div>
    <footer class="panel__foot"><span data-upd="${d && d.updatedAt ? d.updatedAt : ''}">${!d || d.error ? '' : d.updatedAt ? 'Renfe · actualizado ' + hhmmss(d.updatedAt) : d.rt === false ? 'Renfe no publica tiempo real ahora · horarios teóricos' : ''}</span></footer>
  </article>`;
}

export function emptyHTML() {
  return `<section class="empty">
    <p class="empty__title">Sin trayectos</p>
    <p>Añade tu primer trayecto y verás de un vistazo cuánto falta para el siguiente tren.</p>
    <button type="button" class="btn-add btn-add--big" data-act="add">Añadir trayecto</button>
  </section>`;
}

/* ---------- Detalle de un tren ---------- */

export function detailHTML(d, now, isRide = false) {
  const t = d.train;
  const e = etaParts(t.estDep, now);
  const dl = delayInfo(t.delay);
  const first = d.stops[0].name, last = d.stops[d.stops.length - 1].name;
  const changed = t.status !== 'cancelled' && hhmm(t.schedDep) !== hhmm(t.estDep);

  const stops = d.stops.map((s, n) => {
    const inSeg = n >= d.iFrom && n <= d.iTo;
    const seg = n >= d.iFrom && n < d.iTo;
    const passed = (s.passed ?? s.est < now) && t.status !== 'cancelled';
    const here = n === d.here.hereIdx && d.here.kind !== 'sched';
    const tag = n === d.iFrom ? '<em class="tag">Subes</em>' : n === d.iTo ? '<em class="tag">Bajas</em>' : '';
    const sc = hhmm(s.sched) !== hhmm(s.est);
    return `<li class="st${inSeg ? ' in' : ''}${seg ? ' run' : ''}${passed ? ' passed' : ''}${here ? ' here' : ''}${n === d.iFrom || n === d.iTo ? ' key' : ''}${s.skipped ? ' skip' : ''}">
      <i class="st__dot"></i>
      <span class="st__name">${esc(s.name)}${tag}</span>
      <span class="st__time">${s.skipped ? 'no para' : `${sc && t.status !== 'cancelled' ? `<s>${hhmm(s.sched)}</s>` : ''}${hhmm(s.est)}`}</span>
    </li>`;
  }).join('');

  const nowLine = d.here.kind === 'cancelled'
    ? `<p class="now__text now__text--bad">Tren cancelado</p>`
    : `<p class="now__text">${esc(d.here.text)}</p>
       <p class="now__meta">${[
          d.here.platform ? `vía ${d.here.platform}` : '',
          d.here.state || '',
          d.positionAt ? `posición ${ago(d.positionAt, now)}` : 'sin posición: horas según horario',
        ].filter(Boolean).join(' · ')}</p>`;

  return `<div class="sheet__bar">
      <button type="button" class="icon-btn" data-act="close" aria-label="Cerrar">${ICON.close}</button>
      <span class="sheet__kicker">Tren ${esc(t.number)}</span>
    </div>
    <div class="sheet__scroll">
      <div class="dhead">
        ${badge(t.line)}
        <p class="dhead__run">${esc(first)} <span>a</span> ${esc(last)}</p>
      </div>

      <div class="hero">
        <div class="hero__time">${changed ? `<s>${hhmm(t.schedDep)}</s>` : ''}${t.status === 'cancelled' ? hhmm(t.schedDep) : hhmm(t.estDep)}</div>
        ${t.status === 'cancelled' ? '' : `<div class="hero__eta${e.soon ? ' is-soon' : ''}${e.long ? ' is-long' : ''}" data-eta="${t.estDep}" data-k="${esc(etaKey(e))}">${etaHTML(e)}</div>`}
      </div>
      <p class="hero__sub">sale de ${esc(d.stops[d.iFrom].name)} · llega a ${esc(d.stops[d.iTo].name)} a las ${hhmm(t.status === 'cancelled' ? t.schedArr : t.estArr)}</p>

      ${t.skipsEnds ? `<p class="note note--bad note--box">Atención: según Renfe, este tren no para en ${esc(d.stops[d.iFrom].skipped ? d.stops[d.iFrom].name : d.stops[d.iTo].name)}.</p>` : ''}
      <section class="now">
        <h3>Ahora</h3>
        ${nowLine}
      </section>

      <section class="kv">
        <div><h3>Retraso</h3><p class="kv__v kv__v--${dl.cls}">${t.delay == null ? '—' : esc(dl.short)}</p></div>
        <div><h3>Paradas</h3><p class="kv__v">${plural(t.hops, 'parada', 'paradas')}</p></div>
      </section>
      <p class="fine">Renfe publica un único retraso por tren, no uno por parada: las horas estimadas son el horario más ese retraso.</p>

      <section>
        <h3>Recorrido</h3>
        <ol class="stops">${stops}</ol>
      </section>

      ${d.alerts.length ? `<section>
        <h3>Avisos de Renfe</h3>
        ${d.alerts.map(a => `<div class="alert">${a.title ? `<p class="alert__t">${esc(a.title)}</p>` : ''}<p>${esc(a.text)}</p></div>`).join('')}
      </section>` : ''}
    </div>
    ${t.status === 'cancelled' ? '' : `<div class="sheet__foot"><button type="button" class="btn-add btn-add--big${isRide ? ' is-on' : ''}" data-act="ride-sheet">${isRide ? ICON.check + 'Mi tren · quitar' : 'Este es mi tren'}</button></div>`}`;
}
