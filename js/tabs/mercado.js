import { getByCompetition } from '../players.js';
import { buildPlayerCard } from '../ui.js';
import { buyPlayer } from './equipo.js';
import { updateLeague } from '../leagues.js';

let _filterPos   = 'all';
let _searchQuery = '';

async function checkAndRefreshMarket(league) {
  const size  = league.marketSize ?? 0;
  const times = league.marketRefreshTimes;
  if (size === 0 || !times || times.length === 0) return;

  const now      = new Date();
  const last     = league.marketLastRefresh ? new Date(league.marketLastRefresh) : new Date(0);
  const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  const due = times.some(h => {
    const t = new Date(dayStart.getTime() + h * 3_600_000);
    if (t <= now && t > last) return true;
    // Also check previous day (cross-midnight case)
    const tYest = new Date(dayStart.getTime() - 86_400_000 + h * 3_600_000);
    return tYest <= now && tYest > last;
  });
  if (!due) return;

  const all  = getByCompetition(league.competition);
  const pool = [...all].sort(() => Math.random() - 0.5).slice(0, size).map(p => p.id);
  const nowStr = new Date().toISOString();
  try {
    await updateLeague(league.code, { marketPlayers: pool, marketLastRefresh: nowStr });
    league.marketPlayers     = pool;
    league.marketLastRefresh = nowStr;
    window.NET11.ctx.league  = league;
  } catch { /* silent */ }
}

export async function render(wrap, ctx) {
  const { user, league, teamState } = ctx;

  if (!user) {
    wrap.innerHTML = `<div class="plantilla-empty" style="margin:24px 16px">Inicia sesión para acceder al mercado.</div>`;
    return;
  }
  if (!league || !teamState) {
    wrap.innerHTML = `<div class="plantilla-empty" style="margin:24px 16px">Únete a una liga desde <strong>👤 Perfil</strong> para ver el mercado.</div>`;
    return;
  }

  await checkAndRefreshMarket(league);

  const activeSlot = window.NET11.activeSlot;
  const title = document.createElement('div');
  title.className = 'sec-title';
  title.innerHTML = activeSlot
    ? `💰 FICHAJE <span>${activeSlot.pos}</span>`
    : '💰 MERCADO <span>DE FICHAJES</span>';
  wrap.appendChild(title);

  // Pool info banner (only when rotation is active)
  if ((league.marketSize ?? 0) > 0) {
    const infoBanner = document.createElement('div');
    infoBanner.style.cssText = 'margin:0 16px 6px;padding:7px 12px;background:var(--bg3);border:1px solid var(--border);border-radius:var(--r-sm)';
    const poolSize = (league.marketPlayers ?? []).length;
    const times    = league.marketRefreshTimes || [];
    let nextStr = ' · Sin rotación automática';
    if (times.length > 0) {
      const now      = new Date();
      const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const upcoming = times
        .map(h => { const t = new Date(dayStart.getTime() + h * 3_600_000); return t > now ? t : new Date(t.getTime() + 86_400_000); })
        .sort((a, b) => a - b);
      const diffMins = Math.round((upcoming[0] - now) / 60000);
      const hhmm     = `${String(upcoming[0].getHours()).padStart(2,'0')}:00`;
      nextStr = diffMins < 60 ? ` · Rota en ${diffMins}m (${hhmm})` : ` · Próxima rotación: ${hhmm}`;
    }
    infoBanner.innerHTML = `<span style="font-size:12px;color:var(--muted)">🏪 ${poolSize} jugadores disponibles${nextStr}</span>`;
    wrap.appendChild(infoBanner);
  }

  const mf = document.createElement('div');
  mf.className = 'market-filters';

  const search = document.createElement('input');
  search.type        = 'text';
  search.className   = 'search-box';
  search.placeholder = '🔍  Buscar jugador o equipo...';
  search.value       = _searchQuery;
  search.oninput     = e => { _searchQuery = e.target.value; updateList(listWrap, ctx); };
  mf.appendChild(search);

  const prow = document.createElement('div');
  prow.className = 'filter-row';
  [['all','Todos'],['POR','POR'],['DEF','DEF'],['MED','MED'],['DEL','DEL']].forEach(([val, label]) => {
    const btn = document.createElement('button');
    const activeClass = _filterPos === val ? (val === 'all' ? ' active-all' : ` active-${val.toLowerCase()}`) : '';
    btn.className = `filter-chip${activeClass}`;
    btn.textContent = label;
    btn.onclick = () => {
      _filterPos = val;
      prow.querySelectorAll('.filter-chip').forEach(b => b.className = 'filter-chip');
      btn.className = `filter-chip${val === 'all' ? ' active-all' : ` active-${val.toLowerCase()}`}`;
      updateList(listWrap, ctx);
    };
    prow.appendChild(btn);
  });
  mf.appendChild(prow);
  wrap.appendChild(mf);

  const listWrap = document.createElement('div');
  listWrap.style.padding = '0 16px';
  wrap.appendChild(listWrap);
  updateList(listWrap, ctx);
}

function updateList(listWrap, ctx) {
  const { teamState, league } = ctx;
  const activeSlot = window.NET11.activeSlot;
  const teamIds    = new Set([...teamState.team.filter(Boolean), ...(teamState.bench || [])]);

  const marketPool = (league?.marketSize ?? 0) > 0 && Array.isArray(league?.marketPlayers)
    ? new Set(league.marketPlayers)
    : null;

  let players = getByCompetition(teamState.competition)
    .filter(p => {
      if (marketPool && !marketPool.has(p.id)) return false;
      if (_filterPos !== 'all' && p.pos !== _filterPos) return false;
      if (activeSlot && p.pos !== activeSlot.pos) return false;
      if (_searchQuery) {
        const q = _searchQuery.toLowerCase();
        if (!p.name.toLowerCase().includes(q) && !p.team.toLowerCase().includes(q)) return false;
      }
      return true;
    })
    .sort((a, b) => b.pts - a.pts);

  listWrap.innerHTML = '';

  if (players.length === 0) {
    listWrap.innerHTML = '<div class="plantilla-empty">No se encontraron jugadores</div>';
    return;
  }

  const totalPlayers = teamState.team.filter(Boolean).length + (teamState.bench || []).length;
  const maxPlayers   = ctx.league?.maxPlayersPerTeam ?? 15;

  players.forEach(p => {
    const alreadyOwned = teamIds.has(p.id);
    const balance      = teamState.money ?? teamState.budget;
    const canBuy       = !alreadyOwned && balance >= p.val * 1_000_000 && totalPlayers < maxPlayers;
    const card = buildPlayerCard(p, false, {
      onBuy:        () => buyPlayer(p.id, ctx),
      onSell:       () => {},
      canBuy,
      alreadyOwned,
    });
    listWrap.appendChild(card);
  });
}
