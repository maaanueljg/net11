import { logout, addLeagueToProfile } from '../auth.js';
import { createLeague, joinLeague, getLeague, getShareLink } from '../leagues.js';
import { showToast } from '../ui.js';
import { loadTeam, saveTeam } from '../state.js';
import { COMPETITIONS } from '../players.js';

export function render(wrap, ctx) {
  const { user, profile, league } = ctx;

  if (!user || !profile) {
    wrap.innerHTML = `<div class="plantilla-empty" style="margin:24px 16px">Inicia sesión para ver tu perfil.</div>`;
    return;
  }

  wrap.innerHTML = `<div class="sec-title">👤 <span>PERFIL</span></div>`;

  const card = document.createElement('div');
  card.style.cssText = 'margin:0 16px 16px;background:var(--bg3);border:1px solid var(--border);border-radius:var(--r);padding:16px';
  card.innerHTML = `
    <div style="font-weight:700;font-size:16px;color:#fff">${profile.displayName || user.email}</div>
    <div style="font-size:13px;color:var(--muted);margin-top:2px">${user.email || ''}</div>
    <div style="margin-top:10px;display:flex;align-items:center;gap:8px">
      <span style="font-size:20px">⚽</span>
      <span style="font-weight:600;color:var(--accent);font-size:15px">${profile.teamName}</span>
    </div>
    ${league ? `<div style="margin-top:6px;font-size:11px;color:var(--muted)">Liga activa: <strong style="color:#fff">${league.name}</strong> · ${COMPETITIONS[league.competition]?.label || league.competition}</div>` : ''}`;
  wrap.appendChild(card);

  const leaguesTitle = document.createElement('div');
  leaguesTitle.className = 'sec-title';
  leaguesTitle.innerHTML = '🏟️ MIS <span>LIGAS</span>';
  wrap.appendChild(leaguesTitle);

  const leagues = profile.leagues || [];
  if (leagues.length > 0) {
    const leagueList = document.createElement('div');
    leagueList.style.padding = '0 16px';
    leagues.forEach(code => {
      const item = document.createElement('div');
      item.style.cssText = `background:var(--bg3);border:1px solid ${code === league?.code ? 'var(--accent)' : 'var(--border)'};border-radius:var(--r);padding:12px 14px;margin-bottom:8px;display:flex;align-items:center;gap:10px;cursor:pointer`;
      item.innerHTML = `
        <div style="flex:1">
          <div style="font-weight:600;font-size:14px;color:${code === league?.code ? 'var(--accent)' : '#fff'}">${code}${code === league?.code ? ' ✓' : ''}</div>
          <div style="font-size:11px;color:var(--muted);margin-top:2px">Toca para activar</div>
        </div>
        <button class="pc-btn buy" style="font-size:11px;padding:4px 10px">Compartir</button>`;
      item.querySelector('button').onclick = async e => {
        e.stopPropagation();
        const link = getShareLink(code);
        if (navigator.share) {
          await navigator.share({ title: 'Net11', text: `Únete a mi liga con código ${code}`, url: link });
        } else {
          await navigator.clipboard.writeText(link);
          showToast('Link copiado 📋');
        }
      };
      item.onclick = async () => {
        if (code === league?.code) return;
        const newLeague = await getLeague(code);
        if (!newLeague) return showToast('Error cargando liga', 'error');
        window.NET11.ctx.league    = newLeague;
        window.NET11.ctx.teamState = await loadTeam(user.uid, code, newLeague.competition);
        showToast(`Liga activa: ${newLeague.name}`);
        window.NET11.refresh();
      };
      leagueList.appendChild(item);
    });
    wrap.appendChild(leagueList);
  } else {
    const empty = document.createElement('div');
    empty.className = 'plantilla-empty';
    empty.style.cssText = 'margin:0 16px 16px';
    empty.textContent = 'No estás en ninguna liga. Crea o únete a una para empezar.';
    wrap.appendChild(empty);
  }

  const actionsTitle = document.createElement('div');
  actionsTitle.className = 'sec-title';
  actionsTitle.innerHTML = '⚙️ <span>ACCIONES</span>';
  wrap.appendChild(actionsTitle);

  const actions = document.createElement('div');
  actions.style.padding = '0 16px';

  const btnCreate = document.createElement('button');
  btnCreate.className = 'modal-close';
  btnCreate.style.cssText = 'margin-bottom:10px;background:var(--accent);color:var(--bg)';
  btnCreate.textContent = '➕ Crear nueva liga';
  btnCreate.onclick = () => showCreateLeagueModal(ctx);
  actions.appendChild(btnCreate);

  const btnJoin = document.createElement('button');
  btnJoin.className = 'modal-close';
  btnJoin.style.cssText = 'margin-bottom:10px;background:var(--bg4);color:var(--text)';
  btnJoin.textContent = '🔗 Unirse con código';
  btnJoin.onclick = () => showJoinLeagueModal(ctx);
  actions.appendChild(btnJoin);

  const btnLogout = document.createElement('button');
  btnLogout.className = 'modal-close';
  btnLogout.style.cssText = 'background:rgba(255,23,68,0.12);border:1px solid rgba(255,23,68,0.3);color:var(--danger)';
  btnLogout.textContent = '🚪 Cerrar sesión';
  btnLogout.onclick = async () => {
    await logout();
    showToast('Sesión cerrada');
  };
  actions.appendChild(btnLogout);
  wrap.appendChild(actions);
}

function showCreateLeagueModal(ctx) {
  const ALL_FORMATIONS = ['4-3-3','4-4-2','4-2-3-1','4-5-1','3-5-2','5-3-2','3-4-3','5-4-1'];

  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal-sheet" style="max-height:90vh;overflow-y:auto">
      <div class="modal-handle"></div>
      <div class="modal-title">➕ Nueva liga</div>

      <input id="cl-name" type="text" class="search-box" placeholder="Nombre de la liga" maxlength="30" style="margin-bottom:10px">

      <div class="cl-label">Competición</div>
      <div id="cl-comp-grid" style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:14px"></div>

      <div class="cl-label">Sistema de puntuación</div>
      <div id="cl-mode-grid" style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;margin-bottom:10px"></div>
      <div id="cl-newspaper-wrap" style="display:none;margin-bottom:10px">
        <input id="cl-newspaper" type="text" class="search-box" placeholder="Periódico fuente (ej: Marca, AS…)" maxlength="40">
      </div>

      <div class="cl-label">Modo de cláusulas</div>
      <div id="cl-clause-grid" style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;margin-bottom:14px"></div>

      <div class="cl-label">Economía</div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:14px">
        <div>
          <div style="font-size:11px;color:var(--muted);margin-bottom:4px">Dinero inicial (M€)</div>
          <input id="cl-money" type="number" min="0" max="9999" value="100" class="search-box" style="margin-bottom:0">
        </div>
        <div>
          <div style="font-size:11px;color:var(--muted);margin-bottom:4px">€ por punto</div>
          <input id="cl-mpp" type="number" min="0" max="9999999" value="0" class="search-box" style="margin-bottom:0">
        </div>
      </div>
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:6px">
        <input type="checkbox" id="cl-bonus-on" style="width:16px;height:16px;cursor:pointer">
        <label for="cl-bonus-on" style="font-size:13px;color:var(--text);cursor:pointer">Bonus para mejor equipo de jornada</label>
      </div>
      <div id="cl-bonus-wrap" style="display:none;margin-bottom:14px">
        <div style="font-size:11px;color:var(--muted);margin-bottom:4px">Importe del bonus (€)</div>
        <input id="cl-bonus-amount" type="number" min="0" value="500000" class="search-box" style="margin-bottom:0">
      </div>

      <div class="cl-label">Alineaciones permitidas</div>
      <div id="cl-formations" style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:14px"></div>

      <div class="cl-label">Mercado y Fichajes</div>
      <div style="margin-bottom:14px">
        <div style="font-size:11px;color:var(--muted);margin-bottom:4px">Máx. jugadores robables por equipo por ventana (vacío = sin límite)</div>
        <input id="cl-stolen" type="number" min="1" max="20" class="search-box" placeholder="Sin límite" style="margin-bottom:0">
      </div>

      <div class="cl-label">Anti-Robo</div>
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:6px">
        <input type="checkbox" id="cl-antirobo-on" style="width:16px;height:16px;cursor:pointer">
        <label for="cl-antirobo-on" style="font-size:13px;color:var(--text);cursor:pointer">Activar sistema anti-robo</label>
      </div>
      <div id="cl-antirobo-wrap" style="display:none;margin-bottom:14px">
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
          <div>
            <div style="font-size:11px;color:var(--muted);margin-bottom:4px">Coste (% del valor del jugador)</div>
            <input id="cl-antirobo-fee" type="number" min="1" max="200" value="75" class="search-box" style="margin-bottom:0">
          </div>
          <div>
            <div style="font-size:11px;color:var(--muted);margin-bottom:4px">Límite usos/equipo/temporada (vacío = ilimitado)</div>
            <input id="cl-antirobo-limit" type="number" min="1" max="99" class="search-box" placeholder="Ilimitado" style="margin-bottom:0">
          </div>
        </div>
      </div>

      <div id="cl-error" style="color:var(--danger);font-size:12px;min-height:18px;margin-bottom:8px"></div>
      <div style="display:flex;gap:8px">
        <button id="cl-cancel" class="modal-close" style="flex:1;background:var(--bg4);color:var(--text)">Cancelar</button>
        <button id="cl-save"   class="modal-close" style="flex:1">Crear liga</button>
      </div>
    </div>`;

  // Inject label style once
  if (!document.getElementById('cl-style')) {
    const s = document.createElement('style');
    s.id = 'cl-style';
    s.textContent = '.cl-label{font-size:12px;color:var(--muted);margin-bottom:8px;text-transform:uppercase;letter-spacing:1px}';
    document.head.appendChild(s);
  }

  let selectedComp   = null;
  let selectedMode   = 'base';
  let selectedClause = 'moderado';
  const selectedFormations = new Set(ALL_FORMATIONS);

  // Competición
  const compGrid = overlay.querySelector('#cl-comp-grid');
  Object.values(COMPETITIONS).forEach(c => {
    const btn = document.createElement('button');
    btn.style.cssText = 'padding:10px;border-radius:var(--r-sm);border:1px solid var(--border);background:var(--bg3);color:var(--text);cursor:pointer;font-family:var(--font-body);font-size:12px;font-weight:600;transition:all 0.18s';
    btn.textContent = c.label;
    btn.onclick = () => {
      compGrid.querySelectorAll('button').forEach(b => { b.style.borderColor='var(--border)'; b.style.background='var(--bg3)'; });
      btn.style.borderColor = 'var(--accent)'; btn.style.background = 'rgba(0,230,118,0.1)';
      selectedComp = c.key;
    };
    compGrid.appendChild(btn);
  });

  // Modo de puntuación
  const modeGrid      = overlay.querySelector('#cl-mode-grid');
  const newspaperWrap = overlay.querySelector('#cl-newspaper-wrap');
  const MODES = [
    { key: 'base',      label: '📊 Base' },
    { key: 'cronistas', label: '📰 Cronistas' },
    { key: 'puras',     label: '🔌 Puras' },
  ];
  MODES.forEach(m => {
    const btn = document.createElement('button');
    btn.style.cssText = 'padding:10px;border-radius:var(--r-sm);border:1px solid var(--border);background:var(--bg3);color:var(--text);cursor:pointer;font-family:var(--font-body);font-size:12px;font-weight:600;transition:all 0.18s;text-align:center';
    btn.textContent = m.label;
    if (m.key === 'base') { btn.style.borderColor='var(--accent)'; btn.style.background='rgba(0,230,118,0.1)'; }
    btn.onclick = () => {
      modeGrid.querySelectorAll('button').forEach(b => { b.style.borderColor='var(--border)'; b.style.background='var(--bg3)'; });
      btn.style.borderColor='var(--accent)'; btn.style.background='rgba(0,230,118,0.1)';
      selectedMode = m.key;
      newspaperWrap.style.display = m.key === 'cronistas' ? 'block' : 'none';
    };
    modeGrid.appendChild(btn);
  });

  // Modo de cláusulas
  const clauseGrid = overlay.querySelector('#cl-clause-grid');
  const CLAUSE_MODES = [
    { key: 'moderado', label: '📈 Moderado (+30%)' },
    { key: 'agresivo', label: '🔥 Agresivo (+50%)' },
    { key: 'real',     label: '⚽ Real' },
  ];
  CLAUSE_MODES.forEach(m => {
    const btn = document.createElement('button');
    btn.style.cssText = 'padding:10px;border-radius:var(--r-sm);border:1px solid var(--border);background:var(--bg3);color:var(--text);cursor:pointer;font-family:var(--font-body);font-size:11px;font-weight:600;transition:all 0.18s;text-align:center';
    btn.textContent = m.label;
    if (m.key === 'moderado') { btn.style.borderColor='var(--accent)'; btn.style.background='rgba(0,230,118,0.1)'; }
    btn.onclick = () => {
      clauseGrid.querySelectorAll('button').forEach(b => { b.style.borderColor='var(--border)'; b.style.background='var(--bg3)'; });
      btn.style.borderColor='var(--accent)'; btn.style.background='rgba(0,230,118,0.1)';
      selectedClause = m.key;
    };
    clauseGrid.appendChild(btn);
  });

  // Alineaciones
  const formWrap = overlay.querySelector('#cl-formations');
  ALL_FORMATIONS.forEach(f => {
    const chip = document.createElement('button');
    chip.style.cssText = 'padding:5px 12px;border-radius:16px;border:1px solid var(--accent);background:rgba(0,230,118,0.1);color:var(--accent);font-size:12px;font-weight:600;cursor:pointer;font-family:var(--font-body)';
    chip.textContent = f;
    chip.onclick = () => {
      if (selectedFormations.has(f)) {
        selectedFormations.delete(f);
        chip.style.borderColor='var(--border)'; chip.style.background='var(--bg3)'; chip.style.color='var(--muted)';
      } else {
        selectedFormations.add(f);
        chip.style.borderColor='var(--accent)'; chip.style.background='rgba(0,230,118,0.1)'; chip.style.color='var(--accent)';
      }
    };
    formWrap.appendChild(chip);
  });

  // Bonus toggle
  const bonusCheck = overlay.querySelector('#cl-bonus-on');
  const bonusWrap  = overlay.querySelector('#cl-bonus-wrap');
  bonusCheck.onchange = () => { bonusWrap.style.display = bonusCheck.checked ? 'block' : 'none'; };

  // Anti-robo toggle
  const arCheck = overlay.querySelector('#cl-antirobo-on');
  const arWrap  = overlay.querySelector('#cl-antirobo-wrap');
  arCheck.onchange = () => { arWrap.style.display = arCheck.checked ? 'block' : 'none'; };

  overlay.querySelector('#cl-cancel').onclick = () => overlay.remove();

  overlay.querySelector('#cl-save').onclick = async () => {
    const name          = overlay.querySelector('#cl-name').value.trim();
    const newspaper     = overlay.querySelector('#cl-newspaper').value.trim();
    const moneyRaw = overlay.querySelector('#cl-money').value.trim();
    const startingMoney = moneyRaw !== '' ? Number(moneyRaw) : 100;
    const moneyPerPoint = Number(overlay.querySelector('#cl-mpp').value) || 0;
    const bonusAmount  = Number(overlay.querySelector('#cl-bonus-amount').value);
    const jornadaBonus = bonusCheck.checked && bonusAmount > 0 ? bonusAmount : null;
    const maxStolenRaw  = overlay.querySelector('#cl-stolen').value.trim();
    const maxStolenPerTeam = maxStolenRaw ? Number(maxStolenRaw) : null;
    const antiRobo      = arCheck.checked;
    const antiRoboFee   = Number(overlay.querySelector('#cl-antirobo-fee').value) || 75;
    const antiRoboLimitRaw = overlay.querySelector('#cl-antirobo-limit').value.trim();
    const antiRoboLimit = antiRoboLimitRaw ? Number(antiRoboLimitRaw) : null;
    const errEl = overlay.querySelector('#cl-error');

    if (!name)                                       { errEl.textContent = 'Introduce un nombre'; return; }
    if (!selectedComp)                               { errEl.textContent = 'Elige una competición'; return; }
    if (selectedMode === 'cronistas' && !newspaper)  { errEl.textContent = 'Introduce el periódico fuente'; return; }
    if (selectedFormations.size === 0)               { errEl.textContent = 'Activa al menos una alineación'; return; }

    const saveBtn = overlay.querySelector('#cl-save');
    saveBtn.disabled = true;

    try {
      const { user, profile } = ctx;
      const code = await createLeague(
        user.uid, profile.teamName, name, selectedComp, selectedMode, newspaper || null,
        {
          clauseMode: selectedClause,
          startingMoney,
          moneyPerPoint,
          jornadaBonus,
          formations: [...selectedFormations],
          maxStolenPerTeam,
          antiRobo,
          antiRoboFee,
          antiRoboLimit,
        }
      );
      const league = await getLeague(code);
      await addLeagueToProfile(user.uid, code);
      ctx.profile.leagues = [...(ctx.profile.leagues || []), code];
      window.NET11.ctx.profile   = ctx.profile;
      window.NET11.ctx.league    = league;
      const initialTeamState = {
        budget: 100, formation: '4-3-3', team: Array(11).fill(null),
        totalPts: 0, competition: selectedComp,
        money: startingMoney, antiRoboUsed: 0, stolenThisWindow: 0,
      };
      window.NET11.ctx.teamState = initialTeamState;
      await saveTeam(user.uid, code, initialTeamState);
      overlay.remove();
      showToast(`✅ Liga "${name}" creada · Código: ${code}`);
      window.NET11.refresh();
      if (window.NET11.updateLigaNav) window.NET11.updateLigaNav();
    } catch (err) {
      errEl.textContent = 'Error: ' + err.message;
      saveBtn.disabled = false;
    }
  };

  document.body.appendChild(overlay);
}

function showJoinLeagueModal(ctx) {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal-sheet">
      <div class="modal-handle"></div>
      <div class="modal-title">🔗 Unirse a liga</div>
      <div class="modal-sub">Introduce el código de 7 caracteres (ej: NET-X7K)</div>
      <input id="jl-code" type="text" class="search-box"
        placeholder="NET-XXX" maxlength="7"
        style="text-transform:uppercase;letter-spacing:2px;font-weight:700;margin-bottom:8px">
      <div id="jl-error" style="color:var(--danger);font-size:12px;min-height:18px;margin-bottom:8px"></div>
      <div style="display:flex;gap:8px">
        <button id="jl-cancel" class="modal-close" style="flex:1;background:var(--bg4);color:var(--text)">Cancelar</button>
        <button id="jl-join"   class="modal-close" style="flex:1">Unirse</button>
      </div>
    </div>`;

  const input = overlay.querySelector('#jl-code');
  input.oninput = () => { input.value = input.value.toUpperCase(); };
  overlay.querySelector('#jl-cancel').onclick = () => overlay.remove();
  overlay.querySelector('#jl-join').onclick = async () => {
    const code  = input.value.trim().toUpperCase();
    const errEl = overlay.querySelector('#jl-error');
    if (code.length < 5) { errEl.textContent = 'Código inválido'; return; }
    try {
      const { user, profile } = ctx;
      const league = await joinLeague(code, user.uid, profile.teamName);
      await addLeagueToProfile(user.uid, code);
      ctx.profile.leagues = [...(ctx.profile.leagues || []), code];
      window.NET11.ctx.profile   = ctx.profile;
      window.NET11.ctx.league    = { ...league, code };
      window.NET11.ctx.teamState = {
        budget: 100, formation: '4-3-3', team: Array(11).fill(null),
        totalPts: 0, competition: league.competition,
        money: league.startingMoney ?? 100, antiRoboUsed: 0, stolenThisWindow: 0,
      };
      overlay.remove();
      showToast(`✅ Te uniste a "${league.name}"`);
      window.NET11.refresh();
      if (window.NET11.updateLigaNav) window.NET11.updateLigaNav();
    } catch (err) {
      errEl.textContent = err.message;
    }
  };

  document.body.appendChild(overlay);
}
