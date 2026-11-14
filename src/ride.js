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

const cell = (k, v, cls = '', wide = false) => `<div class="ride__c${wide ? ' ride__c--wide' : ''}"><span>${k}</span><b${cls ? ` class="${cls}"` : ''}>${v}</b></div>`;

export function rideHTML(ride, d, now) {
  const head = `<div class="ride__bar">
      <span class="ride__tag"><i></i>Mi tren</span>
      <button type="button" class="icon-btn" data-act="ride-end" aria-label="Quitar mi tren"><svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3 3l10 10M13 3L3 13"/></svg></button>
    </div>`;
  const who = `${badge(ride.line)}<span class="ride__run">${esc(ride.from.name)} <span>a</span> ${esc(ride.to.name)}</span>`;

  if (!d) return `<section class="ride">${head}<div class="ride__body"><div class="ride__who">${who}</div><p class="ride__sub">Cargando…</p></div></section>`;

  const t = d.train, info = rideInfo(d, now), dl = delayInfo(t.delay);
  let main, sub = '', cells = '', prog = '', waiting3 = false;

  if (info.phase === 'cancelled') {
    main = '<p class="ride__big ride__big--bad">Tren cancelado</p>';
    sub = `<p class="ride__sub">Salía a las ${hhmm(t.schedDep)}. Mira el resto de trenes de tu trayecto.</p>`;
  } else if (info.phase === 'arrived') {
    main = '<p class="ride__big">Has llegado</p>';
    sub = `<p class="ride__sub">a ${esc(ride.to.name)} · ${hhmm(t.estArr)}</p>`;
  } else {
    const waiting = info.phase === 'waiting';
    const target = waiting ? t.estDep : t.estArr, e = etaParts(target, now);
    const tag = waiting ? dayTag(t.estDep, now) : '';
    main = `<div class="ride__row">
        <div><p class="ride__lbl">${waiting ? `Sale${tag ? ' ' + tag : ''} a las` : 'Llegas a las'}</p><p class="ride__time">${hhmm(target)}</p></div>
        <div class="ride__eta${e.soon ? ' is-soon' : ''}${e.long ? ' is-long' : ''}" data-eta="${target}" data-k="${esc(etaKey(e))}">${etaHTML(e)}</div>
      </div>`;
    const span = Math.max(1, t.estArr - t.estDep);
    const p = waiting ? 0 : Math.min(98, Math.max(2, ((now - t.estDep) / span) * 100));
    const ticks = d.stops.slice(d.iFrom + 1, d.iTo).map(s => `<u style="left:${Math.min(98, Math.max(2, ((s.est - t.estDep) / span) * 100)).toFixed(1)}%"></u>`).join('');
    prog = `<div class="prog" data-t0="${t.estDep}" data-t1="${t.estArr}" data-wait="${waiting ? 1 : 0}"><i style="width:${p.toFixed(1)}%"></i>${ticks}</div>
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
  return `<section class="ride ride--${info.phase}">${head}
    <button type="button" class="ride__body" data-act="ride-open">
      <span class="ride__who">${who}</span>
      ${main}${sub}${prog}
      ${cells ? `<div class="ride__cells${waiting3 ? ' ride__cells--3' : ''}">${cells}</div>` : ''}
    </button>
  </section>`;
}
