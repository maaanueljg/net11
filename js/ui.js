import { COMPETITIONS } from './players.js';

let _toastTimer;

export function showToast(msg, type = 'success') {
  const t = document.getElementById('toast');
  if (!t) return;
  t.textContent = msg;
  t.className = `show ${type}`;
  clearTimeout(_toastTimer);
  _toastTimer = setTimeout(() => t.classList.remove('show'), 2400);
}

export function updateHeader({ budget, teamCount, pts, formation, money }) {
  const budgetEl = document.getElementById('budget-display');
  if (budgetEl) {
    budgetEl.textContent = budget.toFixed(1) + 'M€';
    budgetEl.className = 'amount ' + (budget < 10 ? 'low' : 'ok');
  }
  const moneyPill = document.getElementById('money-pill');
  const moneyEl   = document.getElementById('money-display');
  if (moneyPill && moneyEl) {
    if (money !== undefined && money !== null) {
      moneyEl.textContent = money.toLocaleString('es-ES') + ' €';
      moneyPill.style.display = '';
    } else {
      moneyPill.style.display = 'none';
    }
  }
  const el = (id, val) => { const e = document.getElementById(id); if (e) e.textContent = val; };
  el('stat-players', `${teamCount}/11`);
  el('stat-pts', pts);
  el('stat-form', formation);
}

export function competitionLabel(key) {
  return COMPETITIONS[key]?.label || key;
}

export function buildPlayerCard(p, inTeam, { onBuy, onSell, canBuy, alreadyOwned }) {
  const card = document.createElement('div');
  card.className = `player-card ${p.pos.toLowerCase()}${(!inTeam && !canBuy) ? ' dim' : ''}`;

  let btnHtml;
  if (inTeam) {
    btnHtml = `<button class="pc-btn sell">Vender</button>`;
  } else if (alreadyOwned) {
    btnHtml = `<button class="pc-btn buy" disabled>En equipo</button>`;
  } else if (!canBuy) {
    btnHtml = `<button class="pc-btn buy" disabled>Sin fondos</button>`;
  } else {
    btnHtml = `<button class="pc-btn buy">Fichar</button>`;
  }

  card.innerHTML = `
    <div class="pc-emoji"></div>
    <div class="pc-info">
      <div class="pc-name">${p.name}</div>
      <div class="pc-team">${p.team}</div>
      <div style="margin-top:5px;display:flex;align-items:center;gap:6px">
        <span class="pc-badge ${p.pos.toLowerCase()}">${p.pos}</span>
        <span class="pc-pts">${p.pts} pts totales</span>
      </div>
    </div>
    <div class="pc-right">
      <div class="pc-value">${p.val}M</div>
      ${btnHtml}
    </div>`;

  card.querySelector('.pc-emoji').textContent = p.emoji;
  const btn = card.querySelector('button');
  if (!btn.disabled) {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      inTeam ? onSell() : onBuy();
    });
  }
  return card;
}
