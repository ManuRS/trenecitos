// Panel de ajustes (se abre con el menú de la esquina superior izquierda).
import { esc } from './format.js';
import { VERSION } from './version.js';

const day = k => k ? `${+k.slice(6, 8)}/${+k.slice(4, 6)}` : '';
const stamp = iso => {
  const d = iso && new Date(iso);
  return d && !isNaN(d) ? new Intl.DateTimeFormat('es-ES', { timeZone: 'Europe/Madrid', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(d) : '';
};

const toggle = (key, on, title, hint) => `<label class="sw">
  <span class="sw__t">${title}${hint ? `<small>${hint}</small>` : ''}</span>
  <input type="checkbox" data-set="${key}"${on ? ' checked' : ''}><i class="sw__ui" aria-hidden="true"></i>
</label>`;

const appText = {
  prompt: '<button type="button" class="btn-add btn-add--big" data-act="install">Instalar la app</button><p class="fine">Se abre como una app más, sin barra del navegador.</p>',
  ios: '<p class="fine fine--first">En Safari: Compartir › Añadir a pantalla de inicio. Instalada, también puede avisarte al salir.</p>',
  none: '<p class="fine fine--first">Desde el menú del navegador: Instalar app o Añadir a pantalla de inicio.</p>',
};

export function settingsHTML(s, info, wipeAsk, install = 'none') {
  const data = info && (info.built || info.first)
    ? `Horarios de Renfe${info.first ? ` del ${day(info.first)} al ${day(info.last)}` : ''}${info.built ? ` · descargados ${stamp(info.built)}` : ''}. Se renuevan solos cada día.`
    : 'Datos de demostración.';
  return `<div class="sheet__bar">
      <button type="button" class="icon-btn" data-act="close" aria-label="Cerrar">${'<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3 3l10 10M13 3L3 13"/></svg>'}</button>
      <span class="sheet__kicker">Ajustes</span>
    </div>
    <div class="sheet__scroll">
      <section>
        <h3 class="h-big">Trenecitos</h3>
        <p class="about">Trenecitos muestra los próximos trenes de Cercanías Madrid. Usa los datos abiertos de Renfe Operadora (CC BY 4.0) pero no es una aplicación oficial.</p>
        <p class="fine">${esc(data)}</p>
      </section>
      <section>
        <h3>Mi tren</h3>
        ${toggle('awake', s.awake, 'Mantener la pantalla encendida', 'mientras sigues un tren')}
        ${toggle('vibrate', s.vibrate, 'Vibrar al acercarme a mi destino', 'con la app abierta y en móviles compatibles')}
        ${toggle('notify', s.notify, 'Aviso al salir de la app', 'una notificación para volver a tu tren')}
      </section>
      ${install === 'installed' ? '' : `<section>
        <h3>App</h3>
        ${appText[install] || appText.none}
      </section>`}
      <section>
        <h3>Datos</h3>
        <p class="fine fine--first">Tus trayectos y ajustes solo se guardan en tu teléfono. Borrarlos no se puede deshacer.</p>
        <button type="button" class="btn-add btn-add--big btn-add--danger" data-act="wipe">${wipeAsk ? 'Pulsa otra vez para borrar' : 'Borrar mis datos'}</button>
      </section>
      <footer class="credits">
        <p>Versión ${VERSION}</p>
        <p class="credits__by">Manuel Reyes · <a href="https://github.com/ManuRS/trenecitos" target="_blank" rel="noopener">Proyecto en GitHub</a></p>
      </footer>
    </div>`;
}
