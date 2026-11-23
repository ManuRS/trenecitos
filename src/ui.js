import { esc, hhmm, hhmmss, etaParts, etaKey, etaHTML, ago, delayInfo, dayTag } from './format.js';
import { badge } from './lines.js';

export const ICON = {
  dots: '<svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="3" cy="8" r="1.4"/><circle cx="8" cy="8" r="1.4"/><circle cx="13" cy="8" r="1.4"/></svg>',
  close: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3 3l10 10M13 3L3 13"/></svg>',
  check: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3 8.5l3.2 3.2L13 4.8"/></svg>',
  swap: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M5 2v11M2 10l3 3 3-3M11 14V3M8 6l3-3 3 3"/></svg>',
  back: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M10 3L5 8l5 5"/></svg>',
  arrow: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M2 8h11M9 4l4 4-4 4"/></svg>',
  grip: '<svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="6" cy="3.5" r="1.2"/><circle cx="10" cy="3.5" r="1.2"/><circle cx="6" cy="8" r="1.2"/><circle cx="10" cy="8" r="1.2"/><circle cx="6" cy="12.5" r="1.2"/><circle cx="10" cy="12.5" r="1.2"/></svg>',
};


/* ---------- Filas de tren ---------- */

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

function trainRow(t, i, now) {
  const e = etaParts(t.estDep, now);
  const changed = t.status !== 'cancelled' && hhmm(t.schedDep) !== hhmm(t.estDep);
  const st = stateLine(t);
  const live = t.status !== 'cancelled';
  return `<div class="tr${i === 0 ? ' tr--next' : ''}${live ? '' : ' tr--off'}">
    <button type="button" class="tr__open" data-act="pick" data-key="${esc(t.key)}"${live ? '' : ' disabled'}>
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

/** Cabecera de cada paso: número, título y, si toca, un botón a la izquierda (volver) o a la derecha (acción). */
export const stepHTML = (n, title, { back = false, action = '' } = {}) => `<div class="step">
    ${back ? `<button type="button" class="step__back" data-act="back" aria-label="Volver">${ICON.back}</button>` : ''}
    <b class="step__n">${n}</b><h2 class="step__t">${title}</h2>${action}
  </div>`;

/* ---------- Paso 1: tus viajes ---------- */

const dirBtn = (trip, dir) => {
  const [a, b] = dir ? [trip.to, trip.from] : [trip.from, trip.to];
  return `<button type="button" class="fav__go" data-act="go" data-dir="${dir}">
      <span class="fav__a">${esc(a.name)}</span><span class="fav__to" aria-label="a">${ICON.arrow}</span><span class="fav__b">${esc(b.name)}</span>
    </button>`;
};

/** Aviso de instalar al pie del paso 1 (hasta que se instala o se cierra). */
function installHint(st) {
  if (st === 'prompt') return `<aside class="hint"><p>Instálala y ábrela como una app más.</p><button type="button" class="btn-add" data-act="install">Instalar</button><button type="button" class="icon-btn" data-act="hint-off" aria-label="Cerrar">${ICON.close}</button></aside>`;
  if (st === 'ios') return `<aside class="hint"><p>Instálala: Compartir › Añadir a pantalla de inicio.</p><button type="button" class="icon-btn" data-act="hint-off" aria-label="Cerrar">${ICON.close}</button></aside>`;
  return '';
}

export function tripsViewHTML(trips, install = '') {
  if (!trips.length) return `<section class="empty">
    <p class="empty__title">Sin viajes</p>
    <p>Añade el trayecto que haces a diario. Luego eliges el sentido y el tren.</p>
    <button type="button" class="btn-add btn-add--big" data-act="add">Añadir viaje</button>
  </section>`;
  return stepHTML(1, '¿Cuál es tu viaje?') + `<div class="favs">${trips.map(t => `<article class="fav" data-trip="${esc(t.id)}">
      <button type="button" class="fav__grip" aria-label="Mover" title="Arrastra para ordenar">${ICON.grip}</button>
      <div class="fav__dirs">${dirBtn(t, 0)}${dirBtn(t, 1)}</div>
      <button type="button" class="icon-btn fav__rm" data-act="remove" aria-label="Quitar viaje">${ICON.close}</button>
    </article>`).join('')}</div>${installHint(install)}`;
}

/* ---------- Paso 2: elige tu tren ---------- */

export function pickViewHTML(p, d, now) {
  let body;
  if (!d) body = '<p class="note">Cargando trenes…</p>';
  else if (d.error) body = `<p class="note note--bad">${d.reason === 'stale' ? 'Los horarios guardados no incluyen hoy. Recarga la página en un rato.' : d.reason === 'station' ? 'Una de las estaciones ya no existe en los horarios de Renfe. Quita el viaje y vuelve a crearlo.' : 'No se han podido cargar los horarios de Renfe.'}</p>`;
  else if (d.noDirect) body = '<p class="note">No hay tren directo entre estas dos estaciones. Hará falta un transbordo.</p>';
  else if (!d.trains.length) body = '<p class="note">No hay trenes en las próximas horas.</p>';
  else body = d.trains.map((t, i) => trainRow(t, i, now)).join('');

  return stepHTML(2, 'Elige tu tren', { back: true }) + `<article class="panel">
    <header class="panel__head">
      <div class="route route--${routeTone(d)}">
        <div class="route__row"><i class="route__dot"></i><span class="route__name">${esc(p.from.name)}</span></div>
        <div class="route__row"><i class="route__dot route__dot--end"></i><span class="route__name">${esc(p.to.name)}</span></div>
      </div>
    </header>
    <div class="trains">${body}</div>
    <footer class="panel__foot"><span>${!d || d.error ? '' : d.updatedAt ? 'Actualizado ' + hhmmss(d.updatedAt) : d.rtDown ? 'Sin conexión con el tiempo real · horarios teóricos' : d.rt === false ? 'Renfe no publica tiempo real ahora · horarios teóricos' : ''}</span></footer>
  </article>`;
}

/* ---------- Detalle de un tren ---------- */

/** Paso 3, debajo de la tarjeta: dónde va el tren, su recorrido y los avisos de Renfe. */
export function detailBodyHTML(d, now) {
  const t = d.train;
  const first = d.stops[0].name, last = d.stops[d.stops.length - 1].name;

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

  const nowLine = d.here.kind === 'cancelled' ? '' : `<section class="now">
      <h3>Ahora</h3>
      <p class="now__text">${esc(d.here.text)}</p>
      <p class="now__meta">${[
        d.here.platform ? `vía ${d.here.platform}` : '',
        d.here.state || '',
        d.positionAt ? `posición ${ago(d.positionAt, now)}` : 'sin posición: horas según horario',
      ].filter(Boolean).join(' · ')}</p>
    </section>`;

  return `<div class="more">
      ${t.skipsEnds ? `<p class="note note--bad note--box">Atención: según Renfe, este tren no para en ${esc(d.stops[d.iFrom].skipped ? d.stops[d.iFrom].name : d.stops[d.iTo].name)}.</p>` : ''}
      ${nowLine}
      <section>
        <h3>Recorrido · tren ${esc(t.number)}</h3>
        <p class="more__run">${esc(first)} <span>a</span> ${esc(last)}</p>
        <ol class="stops">${stops}</ol>
      </section>
      ${d.alerts.length ? `<section>
        <h3>Avisos de Renfe</h3>
        ${d.alerts.map(a => `<div class="alert">${a.title ? `<p class="alert__t">${esc(a.title)}</p>` : ''}<p>${esc(a.text)}</p></div>`).join('')}
      </section>` : ''}
      <p class="fine">Renfe publica un único retraso por tren: las horas estimadas son el horario más ese retraso.</p>
    </div>`;
}
