import { getPlayer } from '../players.js';
import { calcPoints } from '../scoring.js';
import { db } from '../firebase.js';
import {
  doc, getDoc,
} from "https://www.gstatic.com/firebasejs/10.7.0/firebase-firestore.js";

export async function render(wrap, ctx) {
  const { user, league, teamState } = ctx;

  if (!user || !league || !teamState) {
    wrap.innerHTML = `<div class="plantilla-empty" style="margin:24px 16px">Únete a una liga para ver la jornada.</div>`;
    return;
  }

  const jornada     = league.currentJornada ?? 1;
  const scoringMode = league.scoringMode || 'base';

  wrap.innerHTML = `<div class="sec-title">📅 JORNADA <span>${jornada}</span></div>`;

  const jh = document.createElement('div');
  jh.className = 'jornada-header';
  jh.innerHTML = `
    <div class="jh-info">
      <div class="jh-label">Temporada 24/25</div>
      <div class="jh-num">Jornada ${jornada}</div>
    </div>
    <div class="jh-pts">
      <div class="jh-total" id="jh-total-pts">—</div>
      <div class="jh-sub">puntos acumulados</div>
    </div>`;
  wrap.appendChild(jh);

  if (scoringMode === 'puras') {
    const note = document.createElement('div');
    note.className = 'plantilla-empty';
    note.style.margin = '16px';
    note.textContent = '🔌 Modo Estadísticas Puras — Próximamente.';
    wrap.appendChild(note);
    return;
  }

  // Cargar jornada desde Firestore
  let jornadaDoc = null;
  try {
    const snap = await getDoc(doc(db, 'jornadas', String(jornada)));
    if (snap.exists()) jornadaDoc = snap.data();
  } catch { /* sin datos de jornada aún */ }

  const players = teamState.team
    .filter(Boolean)
    .map(id => getPlayer(id))
    .filter(Boolean);

  const list = document.createElement('div');
  list.style.padding = '0 16px';

  if (players.length === 0) {
    list.innerHTML = '<div class="plantilla-empty">Ficha jugadores para ver sus puntuaciones.</div>';
    wrap.appendChild(list);
    return;
  }

  if (!jornadaDoc) {
    list.innerHTML = '<div class="plantilla-empty" style="margin-top:8px">La jornada aún no ha sido publicada por el administrador.</div>';
    wrap.appendChild(list);
    return;
  }

  const POS_COLOR = { POR:'var(--por)', DEF:'var(--def)', MED:'var(--med)', DEL:'var(--del)' };

  const playersWithPts = players
    .map(p => ({
      ...p,
      jornadaPts: calcPoints(jornadaDoc.players?.[p.id] || {}, p.pos, scoringMode),
    }))
    .sort((a, b) => b.jornadaPts - a.jornadaPts);

  const totalJornadaPts = playersWithPts.reduce((s, p) => s + p.jornadaPts, 0);
  const totalEl = document.getElementById('jh-total-pts');
  if (totalEl) totalEl.textContent = totalJornadaPts;

  const maxPts = Math.max(...playersWithPts.map(p => p.jornadaPts), 1);

  playersWithPts.forEach(p => {
    const pct = Math.round((Math.max(p.jornadaPts, 0) / maxPts) * 100);
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
      <div class="pb-val" style="color:${p.jornadaPts>0?'var(--accent)':p.jornadaPts<0?'var(--danger)':'var(--muted)'}">${p.jornadaPts}</div>`;
    list.appendChild(bar);
  });

  wrap.appendChild(list);
}
