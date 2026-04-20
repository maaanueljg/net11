import { getByCompetition } from '../players.js';
import { buildPlayerCard } from '../ui.js';
import { buyPlayer } from './equipo.js';

let _filterPos   = 'all';
let _searchQuery = '';

export function render(wrap, ctx) {
  const { user, league, teamState } = ctx;

  if (!user) {
    wrap.innerHTML = `<div class="plantilla-empty" style="margin:24px 16px">Inicia sesión para acceder al mercado.</div>`;
    return;
  }
  if (!league || !teamState) {
    wrap.innerHTML = `<div class="plantilla-empty" style="margin:24px 16px">Únete a una liga desde <strong>👤 Perfil</strong> para ver el mercado.</div>`;
    return;
  }

  const activeSlot = window.NET11.activeSlot;
  const title = document.createElement('div');
  title.className = 'sec-title';
  title.innerHTML = activeSlot
    ? `💰 FICHAJE <span>${activeSlot.pos}</span>`
    : '💰 MERCADO <span>DE FICHAJES</span>';
  wrap.appendChild(title);

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
  const { teamState } = ctx;
  const activeSlot    = window.NET11.activeSlot;
  const teamIds       = new Set([...teamState.team.filter(Boolean), ...(teamState.bench || [])]);

  let players = getByCompetition(teamState.competition)
    .filter(p => {
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
