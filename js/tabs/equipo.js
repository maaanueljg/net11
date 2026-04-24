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

  const allowedFormations = (league.formations || Object.keys(FORMATIONS)).filter(f => FORMATIONS[f]);

  const formWrap = document.createElement('div');
  formWrap.style.cssText = 'padding:0 18px 12px';

  const formBtn = document.createElement('button');
  formBtn.style.cssText = 'width:100%;display:flex;align-items:center;gap:14px;padding:12px 16px;background:var(--bg3);border:1px solid rgba(0,230,118,0.2);border-radius:var(--r);cursor:pointer;font-family:var(--font-body)';
  formBtn.innerHTML = `
    ${buildMiniPitch(formation)}
    <div style="flex:1;text-align:left">
      <div style="font-size:10px;color:var(--muted);letter-spacing:1px;text-transform:uppercase;margin-bottom:2px">Formación</div>
      <div style="font-family:var(--font-head);font-size:22px;color:var(--accent);letter-spacing:2px;line-height:1">${formation}</div>
    </div>
    <span style="color:var(--muted);font-size:18px">▾</span>
  `;
  formBtn.onclick = () => showFormationDropdown(formBtn, allowedFormations, formation, async (f) => {
    const newState = { ...teamState, formation: f, team: Array(11).fill(null), totalPts: 0 };
    ctx.teamState = newState;
    window.NET11.ctx.teamState = newState;
    await saveTeam(user.uid, league.code, newState);
    window.NET11.refresh();
  });

  formWrap.appendChild(formBtn);
  wrap.appendChild(formWrap);

  const pitchWrap = document.createElement('div');
  pitchWrap.className = 'pitch-wrap';
  pitchWrap.innerHTML = `
    <svg class="field-lines" viewBox="0 0 200 320" preserveAspectRatio="none"
      xmlns="http://www.w3.org/2000/svg"
      style="position:absolute;inset:0;width:100%;height:100%;opacity:0.07">
      <rect x="10" y="10" width="180" height="300" rx="2" fill="none" stroke="white" stroke-width="1.5"/>
      <line x1="10" y1="160" x2="190" y2="160" stroke="white" stroke-width="1"/>
      <circle cx="100" cy="160" r="26" fill="none" stroke="white" stroke-width="1"/>
      <rect x="55" y="10" width="90" height="42" fill="none" stroke="white" stroke-width="1"/>
      <rect x="55" y="268" width="90" height="42" fill="none" stroke="white" stroke-width="1"/>
    </svg>`;

  const POS_COLOR = { POR:'var(--por)', DEF:'var(--def)', MED:'var(--med)', DEL:'var(--del)' };
  const defaults  = defaultPositions(slots);
  const positions = loadPositions(user.uid, league.code, formation) || defaults;

  const dragAbort = new AbortController();

  const grid = document.createElement('div');
  grid.style.cssText = 'position:relative;width:100%;min-height:380px';

  slots.forEach((slot, idx) => {
    const player   = team[idx] ? getPlayer(team[idx]) : null;
    const posColor = POS_COLOR[slot.pos];
    const pos      = positions[idx] ?? defaults[idx];

    const slotEl = document.createElement('div');
    slotEl.className = 'slot';
    slotEl.style.cssText = `position:absolute;left:${pos.x}%;top:${pos.y}%;transform:translate(-50%,-50%);touch-action:none`;

    if (player) {
      slotEl.innerHTML = `
        <div class="slot-circle filled"
          style="color:${posColor};border-color:${posColor};background:${posColor}15;box-shadow:0 0 14px ${posColor}33">
          ${player.emoji}
        </div>
        <div class="slot-name">${player.name.split(' ').pop()}</div>
        <div class="slot-pts" style="color:${posColor}">${player.pts}p</div>`;
    } else {
      const isActive = window.NET11.activeSlot?.idx === idx;
      slotEl.innerHTML = `
        <div class="slot-circle empty ${isActive ? 'active-select' : ''}"
          style="${isActive ? 'border-color:var(--accent);color:var(--accent)' : ''}">
          ${isActive ? '★' : '+'}
        </div>
        <div class="slot-name" style="color:${posColor}88">${slot.pos}</div>`;
    }

    grid.appendChild(slotEl);

    const onTap = player
      ? () => showSlotMenu(
          slotEl,
          () => removePlayer(idx, ctx),
          () => moveToBench(idx, ctx),
        )
      : () => {
          const benchOfPos = bench.filter(pid => {
            const p = getPlayer(pid);
            return p && p.pos === slot.pos;
          });
          showEmptySlotMenu(slotEl, slot.pos, idx, benchOfPos, ctx);
        };

    makeDraggable(slotEl, idx, positions, user.uid, league.code, formation, onTap, dragAbort.signal);
  });

  pitchWrap.appendChild(grid);

  const resetBtn = document.createElement('button');
  resetBtn.style.cssText = 'position:absolute;bottom:8px;right:10px;background:none;border:none;color:rgba(255,255,255,0.3);font-size:11px;cursor:pointer;font-family:var(--font-body);padding:4px 6px';
  resetBtn.textContent = '↺ Resetear';
  resetBtn.onclick = () => {
    localStorage.removeItem(`net11_pos_${user.uid}_${league.code}_${formation}`);
    window.NET11.refresh();
  };
  pitchWrap.appendChild(resetBtn);
  pitchWrap._cleanup = () => dragAbort.abort();
  wrap.appendChild(pitchWrap);

  const plantTitle = document.createElement('div');
  plantTitle.className = 'sec-title';
  plantTitle.innerHTML = '📋 <span>PLANTILLA</span>';
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

function defaultPositions(slots) {
  const maxCol = Math.max(...slots.map(s => s.c));
  const maxRow = Math.max(...slots.map(s => s.r));
  return slots.map(slot => ({
    x: maxCol > 1 ? ((slot.c - 1) / (maxCol - 1)) * 85 + 7.5 : 50,
    y: maxRow > 1 ? ((maxRow - slot.r) / (maxRow - 1)) * 80 + 10 : 50,
  }));
}

function loadPositions(uid, leagueCode, form) {
  try {
    const raw = localStorage.getItem(`net11_pos_${uid}_${leagueCode}_${form}`);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

function savePositions(uid, leagueCode, form, positions) {
  localStorage.setItem(`net11_pos_${uid}_${leagueCode}_${form}`, JSON.stringify(positions));
}

function makeDraggable(slotEl, idx, positions, uid, leagueCode, form, onTap, signal) {
  let startX = 0, startY = 0, isDragging = false, tapTimer = null;
  const opts = { signal };

  slotEl.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    startX = e.clientX;
    startY = e.clientY;
    isDragging = false;
    slotEl.setPointerCapture(e.pointerId);
    tapTimer = setTimeout(() => { tapTimer = null; }, 150);
  }, opts);

  slotEl.addEventListener('pointermove', (e) => {
    if (tapTimer !== null) {
      if (Math.abs(e.clientX - startX) > 5 || Math.abs(e.clientY - startY) > 5) {
        clearTimeout(tapTimer);
        tapTimer = null;
        isDragging = true;
      }
    }
    if (!isDragging) return;
    const rect = slotEl.parentElement.getBoundingClientRect();
    const x = Math.max(3, Math.min(97, ((e.clientX - rect.left) / rect.width) * 100));
    const y = Math.max(3, Math.min(97, ((e.clientY - rect.top) / rect.height) * 100));
    slotEl.style.left = x + '%';
    slotEl.style.top  = y + '%';
    positions[idx] = { x, y };
  }, opts);

  slotEl.addEventListener('pointerup', () => {
    if (isDragging) {
      savePositions(uid, leagueCode, form, positions);
      isDragging = false;
    } else {
      if (tapTimer !== null) { clearTimeout(tapTimer); tapTimer = null; }
      onTap();
    }
  }, opts);

  slotEl.addEventListener('pointercancel', () => {
    if (isDragging) savePositions(uid, leagueCode, form, positions);
    isDragging = false;
    if (tapTimer) { clearTimeout(tapTimer); tapTimer = null; }
  }, opts);
}

function showSlotMenu(slotEl, onSell, onBench) {
  document.querySelector('.slot-menu')?.remove();
  const rect = slotEl.getBoundingClientRect();
  const menu = document.createElement('div');
  menu.className = 'slot-menu';
  menu.style.cssText = `position:fixed;left:${rect.left + rect.width / 2}px;top:${rect.top - 8}px;transform:translate(-50%,-100%);background:var(--bg3);border:1px solid var(--border);border-radius:10px;padding:6px;display:flex;flex-direction:column;gap:4px;z-index:200;min-width:140px`;

  let closeListener = null;
  const removeMenu = () => {
    menu.remove();
    if (closeListener) document.removeEventListener('pointerdown', closeListener);
  };

  const mkBtn = (text, bg, color, cb) => {
    const b = document.createElement('button');
    b.style.cssText = `padding:8px 12px;border:none;border-radius:7px;background:${bg};color:${color};font-family:var(--font-body);font-size:13px;font-weight:600;cursor:pointer;text-align:left`;
    b.textContent = text;
    b.onclick = (e) => { e.stopPropagation(); removeMenu(); cb(); };
    return b;
  };

  menu.appendChild(mkBtn('🔴 Vender',      'rgba(255,23,68,0.15)',   'var(--danger)', onSell));
  menu.appendChild(mkBtn('🪑 Al banquillo', 'rgba(255,255,255,0.05)', 'var(--text)',   onBench));
  document.body.appendChild(menu);

  setTimeout(() => {
    closeListener = (e) => { if (!menu.contains(e.target)) removeMenu(); };
    document.addEventListener('pointerdown', closeListener);
  }, 0);
}

async function moveToBench(idx, ctx) {
  const { user, league, teamState } = ctx;
  const pid = teamState.team[idx];
  if (!pid) return;
  const p = getPlayer(pid);
  const newTeam = [...teamState.team];
  newTeam[idx] = null;
  const newBench = [...(teamState.bench || []), pid];
  const newState = { ...teamState, team: newTeam, bench: newBench, totalPts: calcTotalPts(newTeam) };
  window.NET11.ctx.teamState = newState;
  ctx.teamState = newState;
  await saveTeam(user.uid, league.code, newState);
  showToast(`🪑 ${p.name} enviado al banquillo`);
  window.NET11.refresh();
}

function buildMiniPitch(formation) {
  const rows = formation.split('-').map(Number);
  const displayRows = [...rows].reverse(); // attackers first
  displayRows.push(1); // GK last

  const colors = displayRows.map((_, i) => {
    if (i === displayRows.length - 1) return '#ffd600'; // GK
    if (i === 0) return '#ff1744'; // DEL
    if (i === displayRows.length - 2) return '#00b0ff'; // DEF
    return '#00e676'; // MID
  });

  const r = 3.5, gap = 9, rowH = 10;
  const maxInRow = Math.max(...displayRows);
  const W = (maxInRow - 1) * gap + 2 * r + 2;
  const H = (displayRows.length - 1) * rowH + 2 * r + 2;

  let circles = '';
  displayRows.forEach((count, rowIdx) => {
    const y = rowIdx * rowH + r + 1;
    const rowWidth = (count - 1) * gap;
    const startX = (W - rowWidth) / 2;
    for (let i = 0; i < count; i++) {
      circles += `<circle cx="${startX + i * gap}" cy="${y}" r="${r}" fill="${colors[rowIdx]}" opacity="0.85"/>`;
    }
  });

  return `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" style="flex-shrink:0">${circles}</svg>`;
}

function showFormationDropdown(triggerEl, formations, current, onChange) {
  document.querySelector('.formation-dropdown')?.remove();
  const rect = triggerEl.getBoundingClientRect();
  const panel = document.createElement('div');
  panel.className = 'formation-dropdown';
  panel.style.cssText = `position:fixed;left:${rect.left}px;top:${rect.bottom + 6}px;width:${rect.width}px;background:var(--bg3);border:1px solid var(--border);border-radius:var(--r);overflow:hidden;z-index:200;box-shadow:0 8px 32px rgba(0,0,0,0.6);animation:fadeIn 0.15s ease;max-height:60vh;overflow-y:auto`;

  let closeListener = null;
  const removePanel = () => {
    panel.remove();
    if (closeListener) document.removeEventListener('pointerdown', closeListener);
  };

  formations.forEach((f, i) => {
    const isCurrent = f === current;
    const item = document.createElement('button');
    item.style.cssText = `width:100%;display:flex;align-items:center;gap:14px;padding:11px 16px;background:${isCurrent ? 'rgba(0,230,118,0.08)' : 'none'};border:none;${i < formations.length - 1 ? 'border-bottom:1px solid var(--border);' : ''}cursor:pointer;font-family:var(--font-body)`;
    const check = isCurrent ? `<span style="margin-left:auto;color:var(--accent);font-size:15px;font-weight:700">✓</span>` : '';
    item.innerHTML = `${buildMiniPitch(f)}<span style="font-family:var(--font-head);font-size:20px;letter-spacing:1.5px;${isCurrent ? 'color:var(--accent)' : 'color:var(--text)'}">${f}</span>${check}`;
    item.onclick = (e) => { e.stopPropagation(); removePanel(); if (f !== current) onChange(f); };
    panel.appendChild(item);
  });

  document.body.appendChild(panel);
  setTimeout(() => {
    closeListener = (e) => { if (!panel.contains(e.target) && !triggerEl.contains(e.target)) removePanel(); };
    document.addEventListener('pointerdown', closeListener);
  }, 0);
}

function showEmptySlotMenu(slotEl, pos, slotIdx, benchPlayers, ctx) {
  document.querySelector('.slot-menu')?.remove();
  const rect = slotEl.getBoundingClientRect();
  const menu = document.createElement('div');
  menu.className = 'slot-menu';
  menu.style.cssText = `position:fixed;left:${rect.left + rect.width / 2}px;top:${rect.top - 8}px;transform:translate(-50%,-100%);background:var(--bg3);border:1px solid var(--border);border-radius:10px;padding:6px;display:flex;flex-direction:column;gap:4px;z-index:200;min-width:160px`;

  let closeListener = null;
  const removeMenu = () => {
    menu.remove();
    if (closeListener) document.removeEventListener('pointerdown', closeListener);
  };

  const mkBtn = (text, bg, color, disabled, cb) => {
    const b = document.createElement('button');
    b.style.cssText = `padding:8px 12px;border:none;border-radius:7px;background:${bg};color:${color};font-family:var(--font-body);font-size:13px;font-weight:600;cursor:${disabled ? 'not-allowed' : 'pointer'};text-align:left;opacity:${disabled ? '0.4' : '1'}`;
    b.textContent = text;
    if (!disabled) b.onclick = (e) => { e.stopPropagation(); removeMenu(); cb(); };
    return b;
  };

  const hasBench = benchPlayers.length > 0;
  menu.appendChild(mkBtn(
    hasBench ? '🪑 Del banquillo' : '🪑 Del banquillo (vacío)',
    'rgba(255,255,255,0.05)', 'var(--text)', !hasBench,
    () => showBenchPicker(slotEl, slotIdx, benchPlayers, ctx),
  ));
  menu.appendChild(mkBtn(
    '💰 Ir al mercado',
    'rgba(0,230,118,0.1)', 'var(--accent)', false,
    () => {
      window.NET11.activeSlot = { pos, idx: slotIdx };
      window.NET11.switchTab('mercado');
      showToast(`Selecciona un ${pos} en el mercado`, 'warn');
    },
  ));

  document.body.appendChild(menu);
  setTimeout(() => {
    closeListener = (e) => { if (!menu.contains(e.target)) removeMenu(); };
    document.addEventListener('pointerdown', closeListener);
  }, 0);
}

function showBenchPicker(slotEl, slotIdx, benchPlayers, ctx) {
  document.querySelector('.slot-menu')?.remove();
  const rect = slotEl.getBoundingClientRect();
  const menu = document.createElement('div');
  menu.className = 'slot-menu';
  menu.style.cssText = `position:fixed;left:${rect.left + rect.width / 2}px;top:${rect.top - 8}px;transform:translate(-50%,-100%);background:var(--bg3);border:1px solid var(--border);border-radius:10px;padding:6px;display:flex;flex-direction:column;gap:4px;z-index:200;min-width:160px;max-height:200px;overflow-y:auto`;

  let closeListener = null;
  const removeMenu = () => {
    menu.remove();
    if (closeListener) document.removeEventListener('pointerdown', closeListener);
  };

  benchPlayers.forEach(pid => {
    const p = getPlayer(pid);
    if (!p) return;
    const b = document.createElement('button');
    b.style.cssText = `padding:8px 12px;border:none;border-radius:7px;background:rgba(255,255,255,0.05);color:var(--text);font-family:var(--font-body);font-size:13px;font-weight:600;cursor:pointer;text-align:left`;
    b.textContent = `${p.emoji} ${p.name.split(' ').pop()}`;
    b.onclick = (e) => { e.stopPropagation(); removeMenu(); moveBenchToSlot(slotIdx, pid, ctx); };
    menu.appendChild(b);
  });

  document.body.appendChild(menu);
  setTimeout(() => {
    closeListener = (e) => { if (!menu.contains(e.target)) removeMenu(); };
    document.addEventListener('pointerdown', closeListener);
  }, 0);
}

async function moveBenchToSlot(slotIdx, pid, ctx) {
  const { user, league, teamState } = ctx;
  const p = getPlayer(pid);
  const newTeam = [...teamState.team];
  newTeam[slotIdx] = pid;
  const newBench = (teamState.bench || []).filter(id => id !== pid);
  const newState = { ...teamState, team: newTeam, bench: newBench, totalPts: calcTotalPts(newTeam) };
  window.NET11.ctx.teamState = newState;
  ctx.teamState = newState;
  await saveTeam(user.uid, league.code, newState);
  showToast(`✅ ${p.name} al once inicial`);
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
