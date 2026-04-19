import { logout, addLeagueToProfile } from '../auth.js';
import { createLeague, joinLeague, getLeague, getShareLink } from '../leagues.js';
import { showToast } from '../ui.js';
import { loadTeam } from '../state.js';
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
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal-sheet" style="max-height:90vh;overflow-y:auto">
      <div class="modal-handle"></div>
      <div class="modal-title">➕ Nueva liga</div>
      <input id="cl-name" type="text" class="search-box" placeholder="Nombre de la liga" maxlength="30" style="margin-bottom:10px">
      <div style="font-size:12px;color:var(--muted);margin-bottom:8px;text-transform:uppercase;letter-spacing:1px">Competición</div>
      <div id="cl-comp-grid" style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:14px"></div>
      <div id="cl-error" style="color:var(--danger);font-size:12px;min-height:18px;margin-bottom:8px"></div>
      <div style="display:flex;gap:8px">
        <button id="cl-cancel" class="modal-close" style="flex:1;background:var(--bg4);color:var(--text)">Cancelar</button>
        <button id="cl-save"   class="modal-close" style="flex:1">Crear liga</button>
      </div>
    </div>`;

  let selectedComp = null;
  const grid = overlay.querySelector('#cl-comp-grid');
  Object.values(COMPETITIONS).forEach(c => {
    const btn = document.createElement('button');
    btn.style.cssText = 'padding:10px;border-radius:var(--r-sm);border:1px solid var(--border);background:var(--bg3);color:var(--text);cursor:pointer;font-family:var(--font-body);font-size:12px;font-weight:600;transition:all 0.18s';
    btn.textContent = c.label;
    btn.onclick = () => {
      grid.querySelectorAll('button').forEach(b => { b.style.borderColor = 'var(--border)'; b.style.background = 'var(--bg3)'; });
      btn.style.borderColor = 'var(--accent)';
      btn.style.background  = 'rgba(0,230,118,0.1)';
      selectedComp = c.key;
    };
    grid.appendChild(btn);
  });

  overlay.querySelector('#cl-cancel').onclick = () => overlay.remove();
  overlay.querySelector('#cl-save').onclick = async () => {
    const name = overlay.querySelector('#cl-name').value.trim();
    const errEl = overlay.querySelector('#cl-error');
    if (!name)         { errEl.textContent = 'Introduce un nombre'; return; }
    if (!selectedComp) { errEl.textContent = 'Elige una competición'; return; }
    try {
      const { user, profile } = ctx;
      const code   = await createLeague(user.uid, profile.teamName, name, selectedComp);
      const league = await getLeague(code);
      await addLeagueToProfile(user.uid, code);
      ctx.profile.leagues = [...(ctx.profile.leagues || []), code];
      window.NET11.ctx.profile   = ctx.profile;
      window.NET11.ctx.league    = league;
      window.NET11.ctx.teamState = { budget: 100, formation: '4-3-3', team: Array(11).fill(null), totalPts: 0, competition: selectedComp };
      overlay.remove();
      showToast(`✅ Liga "${name}" creada · Código: ${code}`);
      window.NET11.refresh();
    } catch (err) {
      overlay.querySelector('#cl-error').textContent = 'Error: ' + err.message;
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
      window.NET11.ctx.teamState = { budget: 100, formation: '4-3-3', team: Array(11).fill(null), totalPts: 0, competition: league.competition };
      overlay.remove();
      showToast(`✅ Te uniste a "${league.name}"`);
      window.NET11.refresh();
    } catch (err) {
      errEl.textContent = err.message;
    }
  };

  document.body.appendChild(overlay);
}
