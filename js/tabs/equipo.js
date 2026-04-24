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

  const { team, budget, formation, money } = teamState;
  const bench = teamState.bench || [];
  const slots = FORMATIONS[formation];
  const maxPlayers = league?.maxPlayersPerTeam ?? 15;

  updateHeader({
    budget,
    teamCount: team.filter(Boolean).length + bench.length,
    maxPlayers,
    pts: calcTotalPts(team),
    formation,
    money,
  });

  const titleEl = document.createElement('div');
  titleEl.innerHTML = `<div class="sec-title">👕 MI <span>EQUIPO</span></div>`;
  wrap.appendChild(titleEl);

  const bar = document.createElement('div');
  bar.className = 'formation-bar';
  const allowedFormations = league.formations || Object.keys(FORMATIONS);
  allowedFormations.filter(f => FORMATIONS[f]).forEach(f => {
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
  const maxRow = Math.max(...slots.map(s => s.r));

  slots.forEach((slot, idx) => {
    const player   = team[idx] ? getPlayer(team[idx]) : null;
    const posColor = POS_COLOR[slot.pos];
    const slotEl   = document.createElement('div');
    slotEl.className = 'slot';
    slotEl.style.gridColumn = slot.c;
    slotEl.style.gridRow    = (maxRow + 1) - slot.r;

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

  const filterBar = document.createElement('div');
  filterBar.style.cssText = 'display:flex;gap:6px;padding:0 16px 10px;overflow-x:auto;scrollbar-width:none';

  const plantilla = document.createElement('div');
  plantilla.className = 'plantilla';

  const FILTERS = ['Todos', 'POR', 'DEF', 'MED', 'DEL'];
  let activeFilter = 'Todos';
  let activeFilterBtn = null;

  const activePlayers = team.map((id, idx) => id ? { player: getPlayer(id), idx } : null).filter(Boolean);

  function renderPlantillaContent() {
    plantilla.innerHTML = '';

    const filtered = activePlayers.filter(({ player }) =>
      activeFilter === 'Todos' || player.pos === activeFilter
    );
    const benchFiltered = bench.filter(pid => {
      const p = getPlayer(pid);
      return p && (activeFilter === 'Todos' || p.pos === activeFilter);
    });

    if (activePlayers.length === 0 && bench.length === 0) {
      const balance = teamState.money ?? teamState.budget;
      plantilla.innerHTML = `<div class="plantilla-empty">Toca un hueco en el campo<br>o ve al <strong>Mercado</strong> para fichar.<br><br>💡 Presupuesto: <strong>${balance.toLocaleString('es-ES')} €</strong></div>`;
      return;
    }

    if (filtered.length === 0 && benchFiltered.length === 0) {
      plantilla.innerHTML = '<div class="plantilla-empty">No hay jugadores en esa posición.</div>';
      return;
    }

    filtered.forEach(({ player, idx }) => {
      const card = buildPlayerCard(player, true, {
        onSell: () => removePlayer(idx, ctx),
        canBuy: false,
        alreadyOwned: false,
      });
      plantilla.appendChild(card);
    });

    if (benchFiltered.length > 0) {
      const benchLabel = document.createElement('div');
      benchLabel.style.cssText = 'font-size:11px;color:var(--muted);text-transform:uppercase;letter-spacing:1px;margin:12px 0 6px;padding:0 4px';
      benchLabel.textContent = '🪑 Banquillo';
      plantilla.appendChild(benchLabel);
      bench.forEach((pid, benchIdx) => {
        const p = getPlayer(pid);
        if (!p) return;
        if (activeFilter !== 'Todos' && p.pos !== activeFilter) return;
        const card = buildPlayerCard(p, true, {
          onSell: () => removeBenchPlayer(benchIdx, ctx),
          canBuy: false,
          alreadyOwned: false,
        });
        plantilla.appendChild(card);
      });
    }
  }

  FILTERS.forEach(f => {
    const btn = document.createElement('button');
    btn.className = `filter-chip${f === 'Todos' ? ' active-all' : ''}`;
    btn.style.cssText = 'flex-shrink:0';
    btn.textContent = f;
    btn.onclick = () => {
      if (activeFilterBtn) activeFilterBtn.className = 'filter-chip';
      btn.className = `filter-chip ${f === 'Todos' ? 'active-all' : `active-${f.toLowerCase()}`}`;
      activeFilterBtn = btn;
      activeFilter = f;
      renderPlantillaContent();
    };
    if (f === 'Todos') activeFilterBtn = btn;
    filterBar.appendChild(btn);
  });

  renderPlantillaContent();
  wrap.appendChild(filterBar);
  wrap.appendChild(plantilla);
}

async function removePlayer(idx, ctx) {
  const { user, league, teamState } = ctx;
  const pid = teamState.team[idx];
  if (!pid) return;
  const p = getPlayer(pid);
  const newTeam = [...teamState.team];
  newTeam[idx] = null;
  const balance = teamState.money ?? teamState.budget;
  const newState = {
    ...teamState,
    team:     newTeam,
    money:    balance + p.val * 1_000_000,
    budget:   balance + p.val * 1_000_000,
    totalPts: calcTotalPts(newTeam),
  };
  window.NET11.ctx.teamState = newState;
  ctx.teamState = newState;
  await saveTeam(user.uid, league.code, newState);
  showToast(`🔴 ${p.name} vendido · +${(p.val * 1_000_000).toLocaleString('es-ES')} €`, 'error');
  window.NET11.refresh();
}

async function removeBenchPlayer(idx, ctx) {
  const { user, league, teamState } = ctx;
  const pid = (teamState.bench || [])[idx];
  if (!pid) return;
  const p = getPlayer(pid);
  const newBench = [...(teamState.bench || [])];
  newBench.splice(idx, 1);
  const balance = teamState.money ?? teamState.budget;
  const newState = {
    ...teamState,
    bench:  newBench,
    money:  balance + p.val * 1_000_000,
    budget: balance + p.val * 1_000_000,
  };
  window.NET11.ctx.teamState = newState;
  ctx.teamState = newState;
  await saveTeam(user.uid, league.code, newState);
  showToast(`🔴 ${p.name} vendido · +${(p.val * 1_000_000).toLocaleString('es-ES')} €`, 'error');
  window.NET11.refresh();
}

export async function buyPlayer(pid, ctx) {
  const { user, league, teamState } = ctx;
  const p = getPlayer(pid);
  if (!p) return;

  const teamIds = new Set([...teamState.team.filter(Boolean), ...(teamState.bench || [])]);
  if (teamIds.has(pid)) return showToast('Ya está en tu equipo', 'warn');
  const balance = teamState.money ?? teamState.budget;
  if (balance < p.val * 1_000_000) return showToast('¡Sin presupuesto suficiente!', 'error');

  const totalPlayers = teamState.team.filter(Boolean).length + (teamState.bench || []).length;
  const maxPlayers   = league?.maxPlayersPerTeam ?? 15;
  if (totalPlayers >= maxPlayers) return showToast(`Plantilla llena (máx. ${maxPlayers})`, 'error');

  const slots  = FORMATIONS[teamState.formation];
  const active = window.NET11.activeSlot;
  let targetIdx = -1;

  if (active) {
    if (active.pos !== p.pos) return showToast(`Solo puedes poner un ${active.pos} ahí`, 'error');
    targetIdx = active.idx;
  } else {
    targetIdx = slots.findIndex((s, i) => s.pos === p.pos && !teamState.team[i]);
  }

  const cost = p.val * 1_000_000;

  if (targetIdx === -1) {
    // No free formation slot — add to bench
    const newBench = [...(teamState.bench || []), pid];
    const newState = {
      ...teamState,
      bench:  newBench,
      money:  balance - cost,
      budget: balance - cost,
    };
    window.NET11.ctx.teamState = newState;
    ctx.teamState = newState;
    window.NET11.activeSlot = null;
    await saveTeam(user.uid, league.code, newState);
    showToast(`✅ ${p.name} en banquillo · -${cost.toLocaleString('es-ES')} €`);
    window.NET11.switchTab('equipo');
    return;
  }

  const newTeam = [...teamState.team];
  newTeam[targetIdx] = pid;
  const newState = {
    ...teamState,
    team:     newTeam,
    money:    balance - cost,
    budget:   balance - cost,
    totalPts: calcTotalPts(newTeam),
  };
  window.NET11.ctx.teamState = newState;
  ctx.teamState = newState;
  window.NET11.activeSlot = null;
  await saveTeam(user.uid, league.code, newState);
  showToast(`✅ ${p.name} fichado · -${cost.toLocaleString('es-ES')} €`);
  window.NET11.switchTab('equipo');
}
