import { FORMATIONS, getPlayer } from '../players.js';
import { showToast, updateHeader, buildPlayerCard } from '../ui.js';
import { saveTeam, calcTotalPts } from '../state.js';

export function render(wrap, ctx) {
  const { user, league, teamState } = ctx;

  if (!user) {
    wrap.innerHTML = `<div class="plantilla-empty" style="margin:24px 16px">Inicia sesión para gestionar tu equipo.</div>`;
    return;
  }
  if (!league || !teamState) {
    wrap.innerHTML = `<div class="plantilla-empty" style="margin:24px 16px">Únete o crea una liga desde la pestaña <strong>👤 Perfil</strong> para empezar a fichar.</div>`;
    return;
  }

  const { team, budget, formation } = teamState;
  const slots = FORMATIONS[formation];

  updateHeader({
    budget,
    teamCount: team.filter(Boolean).length,
    pts: calcTotalPts(team),
    formation,
  });

  const titleEl = document.createElement('div');
  titleEl.innerHTML = `<div class="sec-title">👕 MI <span>EQUIPO</span></div>`;
  wrap.appendChild(titleEl);

  const bar = document.createElement('div');
  bar.className = 'formation-bar';
  Object.keys(FORMATIONS).forEach(f => {
    const btn = document.createElement('button');
    btn.className = 'fmbtn' + (formation === f ? ' active' : '');
    btn.textContent = f;
    btn.onclick = async () => {
      const newState = { ...teamState, formation: f, team: Array(11).fill(null), totalPts: 0 };
      ctx.teamState = newState;
      window.NET11.ctx.teamState = newState;
      await saveTeam(user.uid, league.code, newState);
      window.NET11.refresh();
    };
    bar.appendChild(btn);
  });
  wrap.appendChild(bar);

  const pitchWrap = document.createElement('div');
  pitchWrap.className = 'pitch-wrap';
  pitchWrap.innerHTML = `
    <svg class="field-lines" viewBox="0 0 300 220" preserveAspectRatio="none"
      xmlns="http://www.w3.org/2000/svg"
      style="position:absolute;inset:0;width:100%;height:100%;opacity:0.07">
      <rect x="30" y="10" width="240" height="200" rx="2" fill="none" stroke="white" stroke-width="1"/>
      <line x1="30" y1="110" x2="270" y2="110" stroke="white" stroke-width="1"/>
      <circle cx="150" cy="110" r="28" fill="none" stroke="white" stroke-width="1"/>
      <rect x="100" y="10" width="100" height="30" fill="none" stroke="white" stroke-width="1"/>
      <rect x="100" y="180" width="100" height="30" fill="none" stroke="white" stroke-width="1"/>
    </svg>`;

  const grid = document.createElement('div');
  grid.className = 'pitch-grid';
  const POS_COLOR = { POR:'var(--por)', DEF:'var(--def)', MED:'var(--med)', DEL:'var(--del)' };

  slots.forEach((slot, idx) => {
    const player   = team[idx] ? getPlayer(team[idx]) : null;
    const posColor = POS_COLOR[slot.pos];
    const slotEl   = document.createElement('div');
    slotEl.className = 'slot';
    slotEl.style.gridColumn = slot.c;
    slotEl.style.gridRow    = slot.r;

    if (player) {
      slotEl.innerHTML = `
        <div class="slot-circle filled"
          style="color:${posColor};border-color:${posColor};background:${posColor}15;box-shadow:0 0 14px ${posColor}33">
          ${player.emoji}
        </div>
        <div class="slot-name">${player.name.split(' ').pop()}</div>
        <div class="slot-pts" style="color:${posColor}">${player.pts}p</div>`;
      slotEl.onclick = () => removePlayer(idx, ctx);
    } else {
      const isActive = window.NET11.activeSlot?.idx === idx;
      slotEl.innerHTML = `
        <div class="slot-circle empty ${isActive ? 'active-select' : ''}"
          style="${isActive ? 'border-color:var(--accent);color:var(--accent)' : ''}">
          ${isActive ? '★' : '+'}
        </div>
        <div class="slot-name" style="color:${posColor}88">${slot.pos}</div>`;
      slotEl.onclick = () => {
        window.NET11.activeSlot = { pos: slot.pos, idx };
        window.NET11.switchTab('mercado');
        showToast(`Selecciona un ${slot.pos} en el mercado`, 'warn');
      };
    }
    grid.appendChild(slotEl);
  });

  pitchWrap.appendChild(grid);
  wrap.appendChild(pitchWrap);

  const plantTitle = document.createElement('div');
  plantTitle.className = 'sec-title';
  plantTitle.innerHTML = '📋 PLANTILLA <span>COMPLETA</span>';
  wrap.appendChild(plantTitle);

  const plantilla = document.createElement('div');
  plantilla.className = 'plantilla';

  const activePlayers = team.map((id, idx) => id ? { player: getPlayer(id), idx } : null).filter(Boolean);

  if (activePlayers.length === 0) {
    plantilla.innerHTML = `<div class="plantilla-empty">Toca un hueco en el campo<br>o ve al <strong>Mercado</strong> para fichar.<br><br>💡 Presupuesto: <strong>${budget}M€</strong></div>`;
  } else {
    activePlayers.forEach(({ player, idx }) => {
      const card = buildPlayerCard(player, true, {
        onSell: () => removePlayer(idx, ctx),
        canBuy: false,
        alreadyOwned: false,
      });
      plantilla.appendChild(card);
    });
  }
  wrap.appendChild(plantilla);
}

async function removePlayer(idx, ctx) {
  const { user, league, teamState } = ctx;
  const pid = teamState.team[idx];
  if (!pid) return;
  const p = getPlayer(pid);
  const newTeam = [...teamState.team];
  newTeam[idx] = null;
  const newState = {
    ...teamState,
    team:     newTeam,
    budget:   +(teamState.budget + p.val).toFixed(1),
    totalPts: calcTotalPts(newTeam),
  };
  window.NET11.ctx.teamState = newState;
  ctx.teamState = newState;
  await saveTeam(user.uid, league.code, newState);
  showToast(`🔴 ${p.name} vendido · +${p.val}M€`, 'error');
  window.NET11.refresh();
}

export async function buyPlayer(pid, ctx) {
  const { user, league, teamState } = ctx;
  const p = getPlayer(pid);
  if (!p) return;

  const teamIds = new Set(teamState.team.filter(Boolean));
  if (teamIds.has(pid)) return showToast('Ya está en tu equipo', 'warn');
  if (teamState.budget < p.val) return showToast('¡Sin presupuesto suficiente!', 'error');

  const slots  = FORMATIONS[teamState.formation];
  const active = window.NET11.activeSlot;
  let targetIdx = -1;

  if (active) {
    if (active.pos !== p.pos) return showToast(`Solo puedes poner un ${active.pos} ahí`, 'error');
    targetIdx = active.idx;
  } else {
    targetIdx = slots.findIndex((s, i) => s.pos === p.pos && !teamState.team[i]);
  }

  if (targetIdx === -1) return showToast(`No hay hueco de ${p.pos} libre`, 'error');

  const newTeam = [...teamState.team];
  newTeam[targetIdx] = pid;
  const newState = {
    ...teamState,
    team:     newTeam,
    budget:   +(teamState.budget - p.val).toFixed(1),
    totalPts: calcTotalPts(newTeam),
  };
  window.NET11.ctx.teamState = newState;
  ctx.teamState = newState;
  window.NET11.activeSlot = null;
  await saveTeam(user.uid, league.code, newState);
  showToast(`✅ ${p.name} fichado · -${p.val}M€`);
  window.NET11.switchTab('equipo');
}
