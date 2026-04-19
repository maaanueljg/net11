import { getPlayer } from '../players.js';

export function render(wrap, ctx) {
  const { user, league, teamState } = ctx;

  if (!user || !league || !teamState) {
    wrap.innerHTML = `<div class="plantilla-empty" style="margin:24px 16px">Únete a una liga para ver la jornada.</div>`;
    return;
  }

  const jornada = league.currentJornada ?? 1;
  const players = teamState.team
    .filter(Boolean)
    .map(id => getPlayer(id))
    .filter(Boolean);

  wrap.innerHTML = `<div class="sec-title">📅 JORNADA <span>${jornada}</span></div>`;

  const jh = document.createElement('div');
  jh.className = 'jornada-header';
  const totalPts = teamState.totalPts ?? 0;
  jh.innerHTML = `
    <div class="jh-info">
      <div class="jh-label">Temporada 24/25</div>
      <div class="jh-num">Jornada ${jornada}</div>
    </div>
    <div class="jh-pts">
      <div class="jh-total">${players.length ? totalPts : '--'}</div>
      <div class="jh-sub">puntos acumulados</div>
    </div>`;
  wrap.appendChild(jh);

  const list = document.createElement('div');
  list.style.padding = '0 16px';

  if (players.length === 0) {
    list.innerHTML = '<div class="plantilla-empty">Ficha jugadores para ver sus puntuaciones.</div>';
  } else {
    const POS_COLOR = { POR:'var(--por)', DEF:'var(--def)', MED:'var(--med)', DEL:'var(--del)' };
    const maxPts    = Math.max(...players.map(p => p.pts));

    [...players].sort((a, b) => b.pts - a.pts).forEach(p => {
      const pct = Math.round((p.pts / maxPts) * 100);
      const col = POS_COLOR[p.pos];
      const bar = document.createElement('div');
      bar.className = 'pts-bar';
      bar.innerHTML = `
        <div class="pb-emoji">${p.emoji}</div>
        <div class="pb-info">
          <div class="pb-name">${p.name}</div>
          <div class="pb-track">
            <div class="pb-fill" style="width:${pct}%;background:${col}"></div>
          </div>
        </div>
        <div class="pb-val" style="color:${p.pts>=80?'var(--accent)':p.pts>=65?'var(--gold)':'var(--danger)'}">${p.pts}</div>`;
      list.appendChild(bar);
    });
  }

  wrap.appendChild(list);

  const note = document.createElement('p');
  note.style.cssText = 'text-align:center;color:var(--muted);font-size:11px;padding:12px 16px';
  note.textContent = 'Los puntos se actualizarán con datos reales en la Fase B.';
  wrap.appendChild(note);
}
