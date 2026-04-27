import { getByCompetition, getPlayer } from '../players.js';
import { getLeague, placeOffer, cancelOffer } from '../leagues.js';
import { showToast } from '../ui.js';

let _filterPos   = 'all';
let _searchQuery = '';
let _subTab      = 'players'; // 'players' | 'results'

const POS_COLOR = { POR: 'var(--por)', DEF: 'var(--def)', MED: 'var(--med)', DEL: 'var(--del)' };

/* ── Auto-refresh check ──────────────────────────────────── */

async function checkAndRefreshMarket(league) {
  const size  = league.marketSize ?? 0;
  const times = league.marketRefreshTimes;
  if (size === 0 || !times || times.length === 0) return;

  const now      = new Date();
  const last     = league.marketLastRefresh ? new Date(league.marketLastRefresh) : new Date(0);
  const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  const due = times.some(h => {
    const t     = new Date(dayStart.getTime() + h * 3_600_000);
    const tYest = new Date(dayStart.getTime() - 86_400_000 + h * 3_600_000);
    return (t <= now && t > last) || (tYest <= now && tYest > last);
  });
  if (!due) return;

  // Dynamic import to avoid circular dep with liga.js
  const { resolveMarketOffers } = await import('../leagues.js');
  const all  = getByCompetition(league.competition);
  const pool = [...all].sort(() => Math.random() - 0.5).slice(0, size).map(p => p.id);
  try {
    const { results, now: ts } = await resolveMarketOffers(league, pool);
    league.marketPlayers     = pool;
    league.marketLastRefresh = ts;
    league.marketOffers      = {};
    league.marketResults     = results;
    window.NET11.ctx.league  = league;
    const mine = results.find(r => r.winnerUid === window.NET11.ctx.user?.uid);
    if (mine && window.NET11.ctx.teamState) {
      const ts2 = window.NET11.ctx.teamState;
      ts2.bench = [...(ts2.bench || []), mine.pid];
      ts2.money = (ts2.money ?? 0) - mine.amount;
      window.NET11.ctx.teamState = ts2;
    }
  } catch { /* silent */ }
}

/* ── Signings sub-tabs ───────────────────────────────────── */

function renderSigningsTab(entries, myUid, wrap, mode) {
  // mode: 'mis' = only mine | 'all' = everyone
  const sorted = [...entries].sort((a, b) => b.resolvedAt?.localeCompare(a.resolvedAt ?? '') ?? 0);

  if (sorted.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'plantilla-empty';
    empty.style.margin = '24px 16px';
    empty.textContent = mode === 'mis' ? 'Aún no has fichado ningún jugador.' : 'Sin fichajes aún en esta liga.';
    wrap.appendChild(empty);
    return;
  }

  const container = document.createElement('div');
  container.style.cssText = 'padding:0 16px 16px';

  const card = document.createElement('div');
  card.style.cssText = 'background:var(--bg3);border:1px solid var(--border);border-radius:var(--r);overflow:hidden';

  sorted.forEach(r => {
    const p    = getPlayer(r.pid);
    const isMe = r.winnerUid === myUid;
    const date = r.resolvedAt ? new Date(r.resolvedAt).toLocaleDateString('es-ES', { day: '2-digit', month: 'short' }) : '';

    const row = document.createElement('div');
    row.style.cssText = `display:flex;align-items:center;gap:10px;padding:10px 14px;border-bottom:1px solid var(--border);${isMe ? 'background:rgba(0,230,118,0.04)' : ''}`;
    row.innerHTML = `
      <span style="font-size:22px">${p?.emoji || '⚽'}</span>
      <div style="flex:1;min-width:0">
        <div style="font-size:13px;font-weight:700;color:${isMe ? 'var(--accent)' : 'var(--text)'};white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${p?.name || `#${r.pid}`}</div>
        <div style="font-size:11px;color:var(--muted)">${mode === 'all' ? `${r.winnerName}${isMe ? ' · Tú' : ''}` : date}</div>
      </div>
      ${mode === 'all' ? `<span style="font-size:10px;color:var(--muted);margin-right:4px">${date}</span>` : ''}
      <span style="font-size:12px;font-weight:700;color:var(--accent)">${(r.amount / 1e6).toFixed(1)} M€</span>`;
    card.appendChild(row);
  });

  container.appendChild(card);
  wrap.appendChild(container);
}

/* ── My pending offers section ───────────────────────────── */

function buildMyOffersSection(myOffers, league, user, wrap, onChanged) {
  if (myOffers.length === 0) return;

  const sec = document.createElement('div');
  sec.style.cssText = 'margin:0 16px 10px;background:var(--bg3);border:1px solid rgba(0,230,118,0.25);border-radius:var(--r);overflow:hidden';

  const header = document.createElement('div');
  header.style.cssText = 'padding:8px 12px;border-bottom:1px solid var(--border);display:flex;align-items:center;justify-content:space-between';
  header.innerHTML = `<span style="font-size:12px;font-weight:700;color:var(--accent)">💬 Mis ofertas (${myOffers.length})</span>`;
  sec.appendChild(header);

  myOffers.forEach(({ pid, amount }) => {
    const p   = getPlayer(pid);
    const row = document.createElement('div');
    row.style.cssText = 'padding:7px 12px;display:flex;align-items:center;gap:8px;border-bottom:1px solid var(--border)';

    const retBtn = document.createElement('button');
    retBtn.style.cssText = 'padding:3px 8px;border-radius:6px;border:1px solid rgba(255,23,68,0.3);background:rgba(255,23,68,0.08);color:var(--danger);font-size:11px;font-weight:600;cursor:pointer;font-family:var(--font-body)';
    retBtn.textContent = 'Retirar';
    retBtn.onclick = async () => {
      retBtn.disabled = true;
      try {
        await cancelOffer(league.code, pid, user.uid);
        delete league.marketOffers[pid][user.uid];
        window.NET11.ctx.league = league;
        showToast('Oferta retirada');
        onChanged();
      } catch { showToast('Error al retirar la oferta', 'error'); retBtn.disabled = false; }
    };

    row.innerHTML = `
      <span style="font-size:16px">${p?.emoji || '⚽'}</span>
      <span style="flex:1;font-size:12px;font-weight:600;color:var(--text)">${p?.name || `#${pid}`}</span>
      <span style="font-size:11px;font-weight:700;color:var(--accent)">${(amount / 1e6).toFixed(1)} M€</span>`;
    row.appendChild(retBtn);
    sec.appendChild(row);
  });

  wrap.appendChild(sec);
}

/* ── Player card with offer UI ───────────────────────────── */

function buildOfferCard(p, myOffer, totalOffers, ctx, onChanged) {
  const { user, league, teamState } = ctx;
  const balance  = teamState.money ?? 0;
  const minBid   = p.val * 1_000_000;
  const alreadyOwned = new Set([
    ...teamState.team.filter(Boolean),
    ...(teamState.bench || []),
  ]).has(p.id);

  const card = document.createElement('div');
  card.style.cssText = 'background:var(--bg3);border:1px solid var(--border);border-radius:var(--r);margin-bottom:8px;overflow:hidden';

  // ── Player info row ─────────────────────────────────────
  const info = document.createElement('div');
  info.style.cssText = 'display:flex;align-items:center;gap:10px;padding:10px 12px';
  info.innerHTML = `
    <span style="font-size:22px">${p.emoji}</span>
    <div style="flex:1;min-width:0">
      <div style="font-size:13px;font-weight:700;color:var(--text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${p.name}</div>
      <div style="font-size:11px;color:var(--muted)">${p.team}</div>
    </div>
    <span style="font-size:10px;padding:2px 6px;border-radius:4px;background:${POS_COLOR[p.pos]}22;color:${POS_COLOR[p.pos]};font-weight:700">${p.pos}</span>
    <div style="text-align:right">
      <div style="font-size:12px;font-weight:700;color:var(--text)">${p.val} M€</div>
      <div style="font-size:10px;color:var(--muted)">${p.pts} pts</div>
    </div>`;
  card.appendChild(info);

  // ── Action area ─────────────────────────────────────────
  const actions = document.createElement('div');
  actions.style.cssText = 'padding:0 12px 10px;display:flex;align-items:center;gap:8px';

  if (alreadyOwned) {
    const badge = document.createElement('span');
    badge.style.cssText = 'font-size:11px;color:var(--muted)';
    badge.textContent = '✓ En tu plantilla';
    actions.appendChild(badge);
  } else if (!league.marketOpen) {
    const badge = document.createElement('span');
    badge.style.cssText = 'font-size:11px;color:var(--muted)';
    badge.textContent = 'Mercado cerrado';
    actions.appendChild(badge);
  } else if (myOffer) {
    // User has an existing offer
    const offerLabel = document.createElement('span');
    offerLabel.style.cssText = 'flex:1;font-size:12px;color:var(--accent);font-weight:600';
    offerLabel.textContent = `Mi oferta: ${(myOffer.amount / 1e6).toFixed(1)} M€`;

    const modBtn = document.createElement('button');
    modBtn.style.cssText = 'padding:5px 10px;border-radius:6px;border:1px solid rgba(0,230,118,0.3);background:rgba(0,230,118,0.08);color:var(--accent);font-size:11px;font-weight:600;cursor:pointer;font-family:var(--font-body)';
    modBtn.textContent = 'Modificar';
    modBtn.onclick = () => toggleOfferPanel(card, p, myOffer, balance, minBid, league, user, onChanged);

    const retBtn = document.createElement('button');
    retBtn.style.cssText = 'padding:5px 10px;border-radius:6px;border:1px solid rgba(255,23,68,0.3);background:rgba(255,23,68,0.08);color:var(--danger);font-size:11px;font-weight:600;cursor:pointer;font-family:var(--font-body)';
    retBtn.textContent = 'Retirar';
    retBtn.onclick = async () => {
      retBtn.disabled = true;
      try {
        await cancelOffer(league.code, p.id, user.uid);
        if (league.marketOffers?.[p.id]) delete league.marketOffers[p.id][user.uid];
        window.NET11.ctx.league = league;
        showToast('Oferta retirada');
        onChanged();
      } catch { showToast('Error al retirar', 'error'); retBtn.disabled = false; }
    };

    actions.appendChild(offerLabel);
    actions.appendChild(modBtn);
    actions.appendChild(retBtn);
  } else {
    // No offer yet
    if (totalOffers > 0) {
      const cnt = document.createElement('span');
      cnt.style.cssText = 'font-size:11px;color:var(--muted);flex:1';
      cnt.textContent = `${totalOffers} oferta${totalOffers !== 1 ? 's' : ''}`;
      actions.appendChild(cnt);
    } else {
      actions.appendChild(document.createElement('span')).style.flex = '1';
    }

    const offerBtn = document.createElement('button');
    offerBtn.style.cssText = 'padding:6px 14px;border-radius:6px;border:1px solid rgba(0,230,118,0.35);background:rgba(0,230,118,0.1);color:var(--accent);font-size:12px;font-weight:700;cursor:pointer;font-family:var(--font-body)';
    offerBtn.textContent = '💬 Hacer oferta';
    offerBtn.onclick = () => toggleOfferPanel(card, p, null, balance, minBid, league, user, onChanged);
    actions.appendChild(offerBtn);
  }

  card.appendChild(actions);
  return card;
}

/* ── Inline offer panel ─────────────────────────────────── */

function toggleOfferPanel(card, p, existingOffer, balance, minBid, league, user, onChanged) {
  const existing = card.querySelector('.offer-panel');
  if (existing) { existing.remove(); card.style.borderRadius = 'var(--r)'; return; }

  const panel = document.createElement('div');
  panel.className = 'offer-panel';
  panel.style.cssText = 'padding:10px 12px;background:var(--bg4);border-top:1px solid var(--border)';

  const meta = document.createElement('div');
  meta.style.cssText = 'font-size:11px;color:var(--muted);margin-bottom:8px';
  meta.textContent = `Saldo disponible: ${(balance / 1e6).toFixed(2)} M€ · Mínimo: ${(minBid / 1e6).toFixed(1)} M€`;
  panel.appendChild(meta);

  const row = document.createElement('div');
  row.style.cssText = 'display:flex;align-items:center;gap:8px';

  const input = document.createElement('input');
  input.type  = 'number';
  input.className = 'search-box';
  input.style.cssText = 'flex:1;margin-bottom:0';
  input.placeholder = 'Importe (€)';
  input.min   = minBid;
  input.step  = 100_000;
  input.value = existingOffer ? existingOffer.amount : minBid;

  const confirmBtn = document.createElement('button');
  confirmBtn.className = 'pc-btn buy';
  confirmBtn.style.padding = '7px 14px';
  confirmBtn.textContent = existingOffer ? 'Modificar' : 'Confirmar';
  confirmBtn.onclick = async () => {
    const amount = Number(input.value);
    if (isNaN(amount) || amount < minBid) { showToast(`La oferta mínima es ${(minBid / 1e6).toFixed(1)} M€`, 'warn'); return; }
    if (amount > balance) { showToast('Saldo insuficiente', 'error'); return; }
    confirmBtn.disabled = true;
    try {
      await placeOffer(league.code, p.id, user.uid, amount);
      if (!league.marketOffers)          league.marketOffers = {};
      if (!league.marketOffers[p.id])    league.marketOffers[p.id] = {};
      league.marketOffers[p.id][user.uid] = { amount, createdAt: new Date().toISOString() };
      window.NET11.ctx.league = league;
      showToast(`✅ Oferta de ${(amount / 1e6).toFixed(1)} M€ por ${p.name}`);
      onChanged();
    } catch { showToast('Error al hacer la oferta', 'error'); confirmBtn.disabled = false; }
  };

  const closeBtn = document.createElement('button');
  closeBtn.style.cssText = 'background:none;border:none;color:var(--muted);font-size:20px;cursor:pointer;padding:0;line-height:1';
  closeBtn.textContent = '×';
  closeBtn.onclick = () => { panel.remove(); };

  row.appendChild(input);
  row.appendChild(confirmBtn);
  row.appendChild(closeBtn);
  panel.appendChild(row);
  card.appendChild(panel);
}

/* ── Main render ─────────────────────────────────────────── */

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

  // Refresh league doc to get fresh offers, results and transfer history
  const fresh = await getLeague(league.code);
  if (fresh) {
    league.marketOffers     = fresh.marketOffers     || {};
    league.marketResults    = fresh.marketResults    || [];
    league.transferHistory  = fresh.transferHistory  || [];
    league.marketOpen       = fresh.marketOpen;
    window.NET11.ctx.league = league;
  }

  await checkAndRefreshMarket(league);

  wrap.innerHTML = '';
  const title = document.createElement('div');
  title.className = 'sec-title';
  title.innerHTML = '💰 MERCADO <span>DE FICHAJES</span>';
  wrap.appendChild(title);

  // Pool info
  if ((league.marketSize ?? 0) > 0) {
    const times    = league.marketRefreshTimes || [];
    const poolSize = (league.marketPlayers ?? []).length;
    let nextStr = ' · Sin rotación automática';
    if (times.length > 0) {
      const now      = new Date();
      const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const upcoming = times
        .map(h => { const t = new Date(dayStart.getTime() + h * 3_600_000); return t > now ? t : new Date(t.getTime() + 86_400_000); })
        .sort((a, b) => a - b);
      const diff  = Math.round((upcoming[0] - now) / 60000);
      const hhmm  = `${String(upcoming[0].getHours()).padStart(2, '0')}:00`;
      nextStr = diff < 60 ? ` · Resolución en ${diff}m (${hhmm})` : ` · Próxima resolución: ${hhmm}`;
    }
    const poolBanner = document.createElement('div');
    poolBanner.style.cssText = 'margin:0 16px 8px;padding:7px 12px;background:var(--bg3);border:1px solid var(--border);border-radius:var(--r-sm)';
    poolBanner.innerHTML = `<span style="font-size:12px;color:var(--muted)">🏪 ${poolSize} jugadores en el mercado${nextStr}</span>`;
    wrap.appendChild(poolBanner);
  }

  // ── Sub-tab switcher ──────────────────────────────────────
  const mySigningsCount = (league.transferHistory || []).filter(r => r.winnerUid === user.uid).length;

  const tabBar = document.createElement('div');
  tabBar.style.cssText = 'display:flex;gap:0;margin:0 16px 12px;border:1px solid var(--border);border-radius:var(--r);overflow:hidden';

  const mkTab = (key, label) => {
    const btn = document.createElement('button');
    btn.style.cssText = 'flex:1;padding:9px 0;font-size:11px;font-weight:700;font-family:var(--font-body);border:none;cursor:pointer;transition:all .15s';
    btn.textContent = label;
    btn.onclick = () => {
      _subTab = key;
      tabBar.querySelectorAll('button').forEach(b => {
        const on = b.dataset.key === key;
        b.style.background = on ? 'var(--accent)' : 'var(--bg4)';
        b.style.color      = on ? '#000' : 'var(--muted)';
      });
      renderContent();
    };
    btn.dataset.key = key;
    btn.style.background = _subTab === key ? 'var(--accent)' : 'var(--bg4)';
    btn.style.color      = _subTab === key ? '#000' : 'var(--muted)';
    return btn;
  };

  tabBar.appendChild(mkTab('players',   '🏪 Jugadores'));
  tabBar.appendChild(mkTab('mysignings',`🏆 Mis fichajes${mySigningsCount > 0 ? ` (${mySigningsCount})` : ''}`));
  tabBar.appendChild(mkTab('signings',  '👥 Fichajes'));
  wrap.appendChild(tabBar);

  // ── Content area (swapped on tab change) ──────────────────
  const contentArea = document.createElement('div');
  wrap.appendChild(contentArea);

  const onChanged = () => window.NET11.refresh();

  const renderContent = () => {
    contentArea.innerHTML = '';

    if (_subTab === 'mysignings') {
      renderSigningsTab(
        (league.transferHistory || []).filter(r => r.winnerUid === user.uid),
        user.uid, contentArea, 'mis'
      );
      return;
    }
    if (_subTab === 'signings') {
      renderSigningsTab(league.transferHistory || [], user.uid, contentArea, 'all');
      return;
    }

    // ── Players tab ────────────────────────────────────────
    const myOffers = Object.entries(league.marketOffers || {})
      .filter(([, pidOffers]) => pidOffers?.[user.uid])
      .map(([pid, pidOffers]) => ({ pid: Number(pid), ...pidOffers[user.uid] }));
    buildMyOffersSection(myOffers, league, user, contentArea, onChanged);

    const mf = document.createElement('div');
    mf.className = 'market-filters';

    const search = document.createElement('input');
    search.type = 'text'; search.className = 'search-box';
    search.placeholder = '🔍  Buscar jugador o equipo...';
    search.value = _searchQuery;
    search.oninput = e => { _searchQuery = e.target.value; renderList(listWrap, ctx); };
    mf.appendChild(search);

    const prow = document.createElement('div');
    prow.className = 'filter-row';
    [['all','Todos'],['POR','POR'],['DEF','DEF'],['MED','MED'],['DEL','DEL']].forEach(([val, label]) => {
      const btn = document.createElement('button');
      const cls = _filterPos === val ? (val === 'all' ? ' active-all' : ` active-${val.toLowerCase()}`) : '';
      btn.className = `filter-chip${cls}`;
      btn.textContent = label;
      btn.onclick = () => {
        _filterPos = val;
        prow.querySelectorAll('.filter-chip').forEach(b => b.className = 'filter-chip');
        btn.className = `filter-chip${val === 'all' ? ' active-all' : ` active-${val.toLowerCase()}`}`;
        renderList(listWrap, ctx);
      };
      prow.appendChild(btn);
    });
    mf.appendChild(prow);
    contentArea.appendChild(mf);

    const listWrap = document.createElement('div');
    listWrap.style.padding = '0 16px 16px';
    contentArea.appendChild(listWrap);
    renderList(listWrap, ctx);
  };

  renderContent();
}

function renderList(listWrap, ctx) {
  const { teamState, league, user } = ctx;
  const onChanged = () => window.NET11.refresh();

  const marketPool = (league?.marketSize ?? 0) > 0 && Array.isArray(league?.marketPlayers)
    ? new Set(league.marketPlayers) : null;

  const players = getByCompetition(teamState.competition)
    .filter(p => {
      if (marketPool && !marketPool.has(p.id))              return false;
      if (_filterPos !== 'all' && p.pos !== _filterPos)     return false;
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

  players.forEach(p => {
    const pidOffers   = (league?.marketOffers || {})[p.id] || {};
    const myOffer     = pidOffers[user.uid] || null;
    const totalOffers = Object.keys(pidOffers).length;
    const card = buildOfferCard(p, myOffer, totalOffers, ctx, onChanged);
    listWrap.appendChild(card);
  });
}
