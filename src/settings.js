// Panel de ajustes (se abre con el menú de la esquina superior izquierda).
import { esc } from './format.js';

const day = k => k ? `${+k.slice(6, 8)}/${+k.slice(4, 6)}` : '';
const stamp = iso => {
  const d = iso && new Date(iso);
  return d && !isNaN(d) ? new Intl.DateTimeFormat('es-ES', { timeZone: 'Europe/Madrid', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(d) : '';
};

const toggle = (key, on, title, hint) => `<label class="sw">
  <span class="sw__t">${title}${hint ? `<small>${hint}</small>` : ''}</span>
  <input type="checkbox" data-set="${key}"${on ? ' checked' : ''}><i class="sw__ui" aria-hidden="true"></i>
</label>`;

export function settingsHTML(s, info, wipeAsk) {
  const data = info && (info.built || info.first)
    ? `Horarios de Renfe${info.first ? ` del ${day(info.first)} al ${day(info.last)}` : ''}${info.built ? ` · descargados ${stamp(info.built)}` : ''}. Se renuevan solos cada día.`
    : 'Datos de demostración.';
  return `<div class="sheet__bar">
      <button type="button" class="icon-btn" data-act="close" aria-label="Cerrar">${'<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3 3l10 10M13 3L3 13"/></svg>'}</button>
      <span class="sheet__kicker">Ajustes</span>
    </div>
    <div class="sheet__scroll">
      <section>
        <h3>Trenes para elegir</h3>
        <div class="seg seg--2" role="group" aria-label="Trenes para elegir">
          ${[2, 3].map(n => `<button type="button" data-count="${n}" aria-pressed="${s.count === n}" class="${s.count === n ? 'is-on' : ''}">${n}</button>`).join('')}
        </div>
      </section>
      <section>
        <h3>Mi tren</h3>
        ${toggle('awake', s.awake, 'Mantener la pantalla encendida', 'mientras sigues un tren')}
        ${toggle('vibrate', s.vibrate, 'Vibrar al acercarme a mi destino', 'solo funciona con la app abierta y en móviles compatibles')}
        ${toggle('notify', s.notify, 'Aviso al salir de la app', 'una notificación para volver a tu tren')}
      </section>
      <section>
        <h3>Datos</h3>
        <p class="fine fine--first">${esc(data)}</p>
        <button type="button" class="btn-add btn-add--big btn-add--danger" data-act="wipe">${wipeAsk ? 'Pulsa otra vez para borrar' : 'Borrar mis datos'}</button>
        <p class="fine">Trayectos, ajustes y tren marcado se guardan solo en este navegador. Borrarlos no se puede deshacer.</p>
      </section>
      <section>
        <h3>Acerca de</h3>
        <p class="about">Trenecitos muestra los próximos trenes de Cercanías Madrid con los datos abiertos de Renfe Operadora (CC BY 4.0). No es una aplicación oficial de Renfe.</p>
        <p class="about"><a href="https://github.com/ManuRS/trenecitos" target="_blank" rel="noopener">Código fuente en GitHub</a></p>
      </section>
    </div>`;
}
