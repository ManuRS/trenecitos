// "Mi tren": la tarjeta destacada con el tren que has marcado, antes de subir y durante el viaje.
import { esc, hhmm, etaParts, etaKey, etaHTML, delayInfo, dayTag } from './format.js';
import { badge } from './lines.js';

const passedOf = (s, now) => (s.passed ?? s.est < now);

/**
 * En qué punto está el viaje:
 *  waiting   · aún no ha salido de tu estación
 *  riding    · ya va en marcha; calcula la siguiente parada y cuántas quedan
 *  arrived   · ha llegado a tu destino
 *  cancelled
 */
export function rideInfo(d, now) {
  const t = d.train, s = d.stops;
  if (t.status === 'cancelled') return { phase: 'cancelled' };
  const nextIdx = s.findIndex(x => !passedOf(x, now));
  const atDest = (d.vstatus === 'STOPPED_AT' && d.vi === d.iTo) || nextIdx === -1 || nextIdx > d.iTo;
  if (atDest) return { phase: 'arrived' };
  if (nextIdx <= d.iFrom) return { phase: 'waiting' };
  const stoppedHere = d.vstatus === 'STOPPED_AT' && d.vi === nextIdx;
  const idx = stoppedHere ? nextIdx + 1 : nextIdx;          // parada a la que va
  return { phase: 'riding', stoppedAt: stoppedHere ? s[nextIdx] : null, next: s[idx], left: d.iTo - idx + 1 };
}

/** Marca de tiempo (ms) tras la cual la tarjeta se retira sola. */
export const rideExpiry = (ride, d) => (d ? d.train.estArr : ride.schedArr) + (d ? 4 : 40) * 60e3;

/**
 * Relleno (0–1) del tramo i de la barra del paso 3. k es el tramo en el que va el tren (-1: aún no ha salido):
 * los anteriores, llenos; los siguientes, vacíos; el suyo, por tiempo entre sus dos paradas (sin llegar a tocarlas).
 */
export function progFill(times, k, i, now, stopped = false) {
  if (i < k) return 1;
  if (i > k || stopped) return 0;
  return Math.min(.92, Math.max(.08, (now - times[i]) / Math.max(1, times[i + 1] - times[i])));
}

const cell = (k, v, cls = '', wide = false) => `<div class="ride__c${wide ? ' ride__c--wide' : ''}"><span>${k}</span><b${cls ? ` class="${cls}"` : ''}>${v}</b></div>`;

export function rideHTML(ride, d, now) {
  const who = `${badge(ride.line)}<span class="ride__run">${esc(ride.from.name)} <span>a</span> ${esc(ride.to.name)}</span>`;

  if (!d) return `<section class="ride"><div class="ride__body"><div class="ride__who">${who}</div><p class="ride__sub">Cargando…</p></div></section>`;

  const t = d.train, info = rideInfo(d, now), dl = delayInfo(t.delay);
  let main, sub = '', cells = '', prog = '', waiting3 = false;

  if (info.phase === 'cancelled') {
    main = '<p class="ride__big ride__big--bad">Tren cancelado</p>';
    sub = `<p class="ride__sub">Salía a las ${hhmm(t.schedDep)}. Elige otro tren.</p>`;
  } else if (info.phase === 'arrived') {
    main = '<p class="ride__big">Has llegado</p>';
    sub = `<p class="ride__sub">a ${esc(ride.to.name)} · ${hhmm(t.estArr)}</p>`;
  } else {
    const waiting = info.phase === 'waiting';
    const target = waiting ? t.estDep : t.estArr, e = etaParts(target, now);
    const tag = waiting ? dayTag(t.estDep, now) : '';
    main = `<div class="ride__row">
        <div><p class="ride__lbl">${waiting ? `Sale${tag ? ' ' + tag : ''} a las` : 'Llegas a las'}</p><p class="ride__time">${hhmm(target)}</p></div>
        ${waiting && t.held ? '<div class="ride__eta is-soon is-long"><b>Sin salir</b></div>' : `<div class="ride__eta${e.soon ? ' is-soon' : ''}${e.long ? ' is-long' : ''}" data-eta="${target}" data-k="${esc(etaKey(e))}">${etaHTML(e)}</div>`}
      </div>`;
    // Un tramo por cada salto entre paradas y un punto en cada hueco; se rellena hasta donde va el tren.
    const times = d.stops.slice(d.iFrom, d.iTo + 1).map(s => s.est);
    times[0] = t.estDep; times[times.length - 1] = t.estArr;
    const k = waiting ? -1 : info.stoppedAt ? d.stops.indexOf(info.stoppedAt) - d.iFrom : d.stops.indexOf(info.next) - d.iFrom - 1;
    const segs = times.slice(1).map((_, i) => `${i ? `<u${i <= k ? ' class="on"' : ''}></u>` : ''}<b><i style="width:${(progFill(times, k, i, now, !!info.stoppedAt) * 100).toFixed(1)}%"></i></b>`).join('');
    prog = `<div class="prog" data-t="${times.join(',')}" data-k="${k}"${info.stoppedAt ? ' data-stop="1"' : ''}>${segs}</div>
      <div class="prog__ends"><span>${esc(ride.from.name)}</span><span>${esc(ride.to.name)}</span></div>`;
    if (waiting) {
      sub = `<p class="ride__sub">Llegas a ${esc(ride.to.name)} a las <b>${hhmm(t.estArr)}</b></p>`;
      waiting3 = true;
      cells = cell('Vía', t.platform ? esc(t.platform) : d.here.platform ? esc(d.here.platform) : '—') + cell('Retraso', t.delay == null ? '—' : esc(dl.short), `kv--${dl.cls}`) + cell('Paradas', String(t.hops));
    } else {
      const next = info.next, last = info.left === 1;
      sub = info.stoppedAt ? `<p class="ride__sub">Parado en ${esc(info.stoppedAt.name)}</p>` : '';
      cells = cell('Siguiente parada', `${esc(next.name)} <small>${hhmm(next.est)}</small>`, '', true)
            + cell('Quedan', last ? 'Bajas aquí' : `${info.left} paradas`, last ? 'warnc' : '')
            + cell('Retraso', t.delay == null ? '—' : esc(dl.short), `kv--${dl.cls}`);
    }
  }
  const lost = d.lost && info.phase !== 'arrived' ? '<p class="ride__warn">Renfe ya no informa de este tren: puede estar cancelado.</p>' : '';
  return `<section class="ride ride--${info.phase}">
    <div class="ride__body">
      <div class="ride__who">${who}</div>
      ${main}${sub}${prog}
      ${cells ? `<div class="ride__cells${waiting3 ? ' ride__cells--3' : ''}">${cells}</div>` : ''}
      ${lost}
    </div>
  </section>`;
}
