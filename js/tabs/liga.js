import {
  doc, getDoc,
} from "https://www.gstatic.com/firebasejs/10.7.0/firebase-firestore.js";
import { db } from '../firebase.js';
import { updateLeague, kickMember, getShareLink } from '../leagues.js';
import { showToast } from '../ui.js';

export async function render(wrap, ctx) {
  const { user, league } = ctx;

  if (!league || league.adminUid !== user?.uid) {
    wrap.innerHTML = `<div class="plantilla-empty" style="margin:24px 16px">Acceso restringido al admin de la liga.</div>`;
    return;
  }

  wrap.innerHTML = `<div class="sec-title">⚙️ <span>LIGA</span></div>`;

  const container = document.createElement('div');
  container.style.padding = '0 16px 24px';
  wrap.appendChild(container);

  const locked = (league.jornadasPublished ?? 0) > 0;

  renderGeneral(container, league, locked);
  renderPlantillas(container, league);
  renderEconomia(container, league, locked);
  renderMercado(container, league);
  renderClausulas(container, league, locked);
  renderMiembros(container, league, user.uid);
}

/* ── Helpers ────────────────────────────────────────────── */

function section(container, title) {
  const wrap = document.createElement('div');
  wrap.style.cssText = 'background:var(--bg3);border:1px solid var(--border);border-radius:var(--r);padding:16px;margin-bottom:12px';
  const h = document.createElement('div');
  h.style.cssText = 'font-weight:700;font-size:14px;color:#fff;margin-bottom:12px';
  h.textContent = title;
  wrap.appendChild(h);
  container.appendChild(wrap);
  return wrap;
}

function saveBtn(label = 'Guardar') {
  const btn = document.createElement('button');
  btn.className = 'modal-close';
  btn.style.cssText = 'margin-top:10px;padding:10px';
  btn.textContent = label;
  return btn;
}

function inputRow(label, inputEl) {
  const wrap = document.createElement('div');
  wrap.style.marginBottom = '10px';
  const l = document.createElement('div');
  l.style.cssText = 'font-size:11px;color:var(--muted);margin-bottom:4px';
  l.textContent = label;
  wrap.appendChild(l);
  wrap.appendChild(inputEl);
  return wrap;
}

function textInput(value, opts = {}) {
  const el = document.createElement('input');
  el.type = opts.type || 'text';
  el.className = 'search-box';
  el.style.marginBottom = '0';
  if (value !== null && value !== undefined) el.value = value;
  if (opts.placeholder) el.placeholder = opts.placeholder;
  if (opts.max !== undefined) el.max = opts.max;
  if (opts.min !== undefined) el.min = opts.min;
  if (opts.maxlength) el.maxLength = opts.maxlength;
  if (opts.disabled) el.disabled = true;
  return el;
}

/* ── Section: General ───────────────────────────────────── */

function renderGeneral(container, league, locked) {
  const sec = section(container, '📋 General');

  const nameInput = textInput(league.name, { maxlength: 30 });
  sec.appendChild(inputRow('Nombre de la liga', nameInput));

  const modeLabel = document.createElement('div');
  modeLabel.style.cssText = 'font-size:11px;color:var(--muted);margin-bottom:4px';
  modeLabel.textContent = 'Sistema de puntuación' + (locked ? ' 🔒' : '');
  sec.appendChild(modeLabel);

  let selectedMode = league.scoringMode || 'base';
  let newspaperRow;

  if (locked) {
    const modeVal = document.createElement('div');
    modeVal.style.cssText = 'font-size:13px;color:var(--text);padding:8px 0';
    modeVal.textContent = { base: '📊 Base', cronistas: '📰 Cronistas', puras: '🔌 Puras' }[league.scoringMode] || league.scoringMode;
    sec.appendChild(modeVal);
    const note = document.createElement('div');
    note.style.cssText = 'font-size:11px;color:var(--muted);margin-bottom:10px';
    note.textContent = 'No editable tras publicar la primera jornada';
    sec.appendChild(note);
  } else {
    const MODES = [
      { key: 'base',      label: '📊 Base' },
      { key: 'cronistas', label: '📰 Cronistas' },
      { key: 'puras',     label: '🔌 Puras' },
    ];
    const modeGrid = document.createElement('div');
    modeGrid.style.cssText = 'display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;margin-bottom:10px';
    MODES.forEach(m => {
      const btn = document.createElement('button');
      btn.style.cssText = 'padding:8px;border-radius:var(--r-sm);border:1px solid var(--border);background:var(--bg4);color:var(--text);cursor:pointer;font-family:var(--font-body);font-size:12px;font-weight:600;transition:all 0.18s';
      btn.textContent = m.label;
      if (m.key === selectedMode) { btn.style.borderColor = 'var(--accent)'; btn.style.background = 'rgba(0,230,118,0.1)'; }
      btn.onclick = () => {
        modeGrid.querySelectorAll('button').forEach(b => { b.style.borderColor = 'var(--border)'; b.style.background = 'var(--bg4)'; });
        btn.style.borderColor = 'var(--accent)'; btn.style.background = 'rgba(0,230,118,0.1)';
        selectedMode = m.key;
        if (newspaperRow) newspaperRow.style.display = m.key === 'cronistas' ? 'block' : 'none';
      };
      modeGrid.appendChild(btn);
    });
    sec.appendChild(modeGrid);

    const newspaperInput = textInput(league.newspaper || '', { placeholder: 'Periódico fuente (ej: Marca, AS…)', maxlength: 40 });
    newspaperRow = inputRow('Periódico fuente', newspaperInput);
    newspaperRow.style.display = selectedMode === 'cronistas' ? 'block' : 'none';
    sec.appendChild(newspaperRow);

    const btn = saveBtn();
    btn.onclick = async () => {
      const name = nameInput.value.trim();
      if (!name) { showToast('El nombre no puede estar vacío', 'error'); return; }
      btn.disabled = true;
      try {
        const fields = { name, scoringMode: selectedMode };
        if (selectedMode === 'cronistas') fields.newspaper = newspaperInput.value.trim() || null;
        await updateLeague(league.code, fields);
        Object.assign(league, fields);
        window.NET11.ctx.league = league;
        showToast('✅ Ajustes generales guardados');
      } catch { showToast('Error al guardar', 'error'); }
      btn.disabled = false;
    };
    sec.appendChild(btn);
    return;
  }

  // Locked: only name editable
  const btn = saveBtn();
  btn.onclick = async () => {
    const name = nameInput.value.trim();
    if (!name) { showToast('El nombre no puede estar vacío', 'error'); return; }
    btn.disabled = true;
    try {
      await updateLeague(league.code, { name });
      league.name = name;
      window.NET11.ctx.league = league;
      showToast('✅ Nombre actualizado');
    } catch { showToast('Error al guardar', 'error'); }
    btn.disabled = false;
  };
  sec.appendChild(btn);
}

/* ── Section: Plantillas ────────────────────────────────── */

function renderPlantillas(container, league) {
  const ALL_FORMATIONS = ['4-3-3','4-4-2','4-2-3-1','4-5-1','3-5-2','5-3-2','3-4-3','5-4-1'];
  const sec = section(container, '📐 Plantillas');

  const selected = new Set(league.formations || ALL_FORMATIONS);
  const grid = document.createElement('div');
  grid.style.cssText = 'display:flex;flex-wrap:wrap;gap:6px;margin-bottom:4px';

  ALL_FORMATIONS.forEach(f => {
    const active = selected.has(f);
    const chip = document.createElement('button');
    chip.style.cssText = `padding:5px 12px;border-radius:16px;border:1px solid ${active?'var(--accent)':'var(--border)'};background:${active?'rgba(0,230,118,0.1)':'var(--bg4)'};color:${active?'var(--accent)':'var(--muted)'};font-size:12px;font-weight:600;cursor:pointer;font-family:var(--font-body);transition:all 0.18s`;
    chip.textContent = f;
    chip.onclick = () => {
      if (selected.has(f)) {
        selected.delete(f);
        chip.style.borderColor = 'var(--border)'; chip.style.background = 'var(--bg4)'; chip.style.color = 'var(--muted)';
      } else {
        selected.add(f);
        chip.style.borderColor = 'var(--accent)'; chip.style.background = 'rgba(0,230,118,0.1)'; chip.style.color = 'var(--accent)';
      }
    };
    grid.appendChild(chip);
  });
  sec.appendChild(grid);

  const btn = saveBtn();
  btn.onclick = async () => {
    if (selected.size === 0) { showToast('Activa al menos una alineación', 'error'); return; }
    btn.disabled = true;
    try {
      await updateLeague(league.code, { formations: [...selected] });
      league.formations = [...selected];
      window.NET11.ctx.league = league;
      showToast('✅ Alineaciones actualizadas');
    } catch { showToast('Error al guardar', 'error'); }
    btn.disabled = false;
  };
  sec.appendChild(btn);
}

/* ── Section: Economía ──────────────────────────────────── */

function renderEconomia(container, league, locked) {
  const sec = section(container, '💰 Economía');

  const moneyInput = textInput(league.startingMoney ?? 100, { type: 'number', min: 0, max: 999999, disabled: locked });
  sec.appendChild(inputRow('Dinero inicial por equipo (M€)' + (locked ? ' 🔒' : ''), moneyInput));

  const mppInput = textInput(league.moneyPerPoint ?? 0, { type: 'number', min: 0, max: 9999999 });
  sec.appendChild(inputRow('Dinero ganado por punto (€)', mppInput));

  const bonusRow = document.createElement('div');
  bonusRow.style.cssText = 'display:flex;align-items:center;gap:10px;margin-bottom:8px';
  const bonusCheck = document.createElement('input');
  bonusCheck.type = 'checkbox';
  bonusCheck.style.cssText = 'width:16px;height:16px;cursor:pointer';
  bonusCheck.checked = league.jornadaBonus !== null && league.jornadaBonus !== undefined;
  const bonusLabel = document.createElement('label');
  bonusLabel.style.cssText = 'font-size:13px;color:var(--text);cursor:pointer';
  bonusLabel.textContent = 'Bonus para el mejor equipo de jornada';
  bonusRow.appendChild(bonusCheck);
  bonusRow.appendChild(bonusLabel);
  sec.appendChild(bonusRow);

  const bonusAmountWrap = document.createElement('div');
  bonusAmountWrap.style.display = bonusCheck.checked ? 'block' : 'none';
  const bonusAmountInput = textInput(league.jornadaBonus ?? 500000, { type: 'number', min: 0 });
  bonusAmountWrap.appendChild(inputRow('Importe del bonus (€)', bonusAmountInput));
  sec.appendChild(bonusAmountWrap);
  bonusCheck.onchange = () => { bonusAmountWrap.style.display = bonusCheck.checked ? 'block' : 'none'; };

  const btn = saveBtn();
  btn.onclick = async () => {
    btn.disabled = true;
    try {
      const bonusAmount = Number(bonusAmountInput.value);
      const fields = {
        moneyPerPoint: Number(mppInput.value) || 0,
        jornadaBonus:  bonusCheck.checked && bonusAmount > 0 ? bonusAmount : null,
      };
      if (!locked) {
        const moneyRaw = moneyInput.value.trim();
        fields.startingMoney = moneyRaw !== '' ? Number(moneyRaw) : 100;
      }
      await updateLeague(league.code, fields);
      Object.assign(league, fields);
      window.NET11.ctx.league = league;
      showToast('✅ Economía actualizada');
    } catch { showToast('Error al guardar', 'error'); }
    btn.disabled = false;
  };
  sec.appendChild(btn);
}

/* ── Section: Mercado y Fichajes ────────────────────────── */

function renderMercado(container, league) {
  const sec = section(container, '🏪 Mercado y Fichajes');

  const dot = document.createElement('span');
  dot.style.cssText = `display:inline-block;width:8px;height:8px;border-radius:50%;background:${league.marketOpen ? 'var(--accent)' : 'var(--danger)'}`;
  const statusText = document.createElement('span');
  statusText.style.color = league.marketOpen ? 'var(--accent)' : 'var(--danger)';
  statusText.textContent = league.marketOpen ? 'Mercado abierto' : 'Mercado cerrado';
  const statusLabel = document.createElement('div');
  statusLabel.style.cssText = 'font-size:13px;margin-bottom:10px;display:flex;align-items:center;gap:8px';
  statusLabel.appendChild(dot);
  statusLabel.appendChild(statusText);
  sec.appendChild(statusLabel);

  const toggleBtn = document.createElement('button');
  toggleBtn.className = 'modal-close';
  toggleBtn.style.cssText = `margin-bottom:14px;padding:10px;background:${league.marketOpen?'rgba(255,23,68,0.12)':'rgba(0,230,118,0.12)'};color:${league.marketOpen?'var(--danger)':'var(--accent)'};border:1px solid ${league.marketOpen?'rgba(255,23,68,0.3)':'rgba(0,230,118,0.3)'}`;
  toggleBtn.textContent = league.marketOpen ? '🔒 Cerrar mercado' : '🔓 Abrir mercado';
  toggleBtn.onclick = async () => {
    toggleBtn.disabled = true;
    try {
      const newState = !league.marketOpen;
      await updateLeague(league.code, { marketOpen: newState });
      league.marketOpen = newState;
      window.NET11.ctx.league = league;
      showToast(newState ? '✅ Mercado abierto' : '✅ Mercado cerrado');
      dot.style.background    = newState ? 'var(--accent)' : 'var(--danger)';
      statusText.style.color  = newState ? 'var(--accent)' : 'var(--danger)';
      statusText.textContent  = newState ? 'Mercado abierto' : 'Mercado cerrado';
      toggleBtn.textContent   = newState ? '🔒 Cerrar mercado' : '🔓 Abrir mercado';
      toggleBtn.style.background  = newState ? 'rgba(255,23,68,0.12)' : 'rgba(0,230,118,0.12)';
      toggleBtn.style.color       = newState ? 'var(--danger)' : 'var(--accent)';
      toggleBtn.style.borderColor = newState ? 'rgba(255,23,68,0.3)' : 'rgba(0,230,118,0.3)';
    } catch { showToast('Error al actualizar', 'error'); }
    toggleBtn.disabled = false;
  };
  sec.appendChild(toggleBtn);

  const stolenInput = textInput(league.maxStolenPerTeam ?? '', { type: 'number', min: 1, max: 20, placeholder: 'Sin límite' });
  sec.appendChild(inputRow('Máx. jugadores robables por equipo por ventana (vacío = sin límite)', stolenInput));

  const btn = saveBtn();
  btn.onclick = async () => {
    btn.disabled = true;
    try {
      const val = stolenInput.value.trim();
      const maxStolenPerTeam = val ? Number(val) : null;
      await updateLeague(league.code, { maxStolenPerTeam });
      league.maxStolenPerTeam = maxStolenPerTeam;
      window.NET11.ctx.league = league;
      showToast('✅ Límite de mercado actualizado');
    } catch { showToast('Error al guardar', 'error'); }
    btn.disabled = false;
  };
  sec.appendChild(btn);
}

/* ── Section: Cláusulas ─────────────────────────────────── */

function renderClausulas(container, league, locked) {
  const sec = section(container, '🏷️ Cláusulas');

  const modeNames = { moderado: '📈 Moderado (+30%)', agresivo: '🔥 Agresivo (+50%)', real: '⚽ Real' };
  const modeLabelEl = document.createElement('div');
  modeLabelEl.style.cssText = 'font-size:11px;color:var(--muted);margin-bottom:4px';
  modeLabelEl.textContent = 'Modo de cláusulas' + (locked ? ' 🔒' : '');
  sec.appendChild(modeLabelEl);

  const modeValEl = document.createElement('div');
  modeValEl.style.cssText = 'font-size:13px;color:var(--text);padding:8px 0;margin-bottom:' + (locked ? '12' : '0') + 'px';
  modeValEl.textContent = modeNames[league.clauseMode] || league.clauseMode;
  sec.appendChild(modeValEl);

  if (locked) {
    const note = document.createElement('div');
    note.style.cssText = 'font-size:11px;color:var(--muted);margin-bottom:12px';
    note.textContent = 'No editable tras publicar la primera jornada';
    sec.appendChild(note);
  }

  const arRow = document.createElement('div');
  arRow.style.cssText = 'display:flex;align-items:center;gap:10px;margin-bottom:8px';
  const arCheck = document.createElement('input');
  arCheck.type = 'checkbox';
  arCheck.style.cssText = 'width:16px;height:16px;cursor:pointer';
  arCheck.checked = !!league.antiRobo;
  const arLabel = document.createElement('label');
  arLabel.style.cssText = 'font-size:13px;color:var(--text);cursor:pointer';
  arLabel.textContent = 'Activar sistema anti-robo';
  arRow.appendChild(arCheck);
  arRow.appendChild(arLabel);
  sec.appendChild(arRow);

  const arWrap = document.createElement('div');
  arWrap.style.display = arCheck.checked ? 'block' : 'none';
  const arFeeInput   = textInput(league.antiRoboFee ?? 75,  { type: 'number', min: 1, max: 200 });
  const arLimitInput = textInput(league.antiRoboLimit ?? '', { type: 'number', min: 1, max: 99, placeholder: 'Ilimitado' });
  arWrap.appendChild(inputRow('Coste (% del valor del jugador)', arFeeInput));
  arWrap.appendChild(inputRow('Límite de usos por equipo por temporada (vacío = ilimitado)', arLimitInput));
  sec.appendChild(arWrap);
  arCheck.onchange = () => { arWrap.style.display = arCheck.checked ? 'block' : 'none'; };

  const btn = saveBtn();
  btn.onclick = async () => {
    btn.disabled = true;
    try {
      const fields = {
        antiRobo:      arCheck.checked,
        antiRoboFee:   Number(arFeeInput.value) || 75,
        antiRoboLimit: arLimitInput.value.trim() ? Number(arLimitInput.value) : null,
      };
      await updateLeague(league.code, fields);
      Object.assign(league, fields);
      window.NET11.ctx.league = league;
      showToast('✅ Sistema de cláusulas actualizado');
    } catch { showToast('Error al guardar', 'error'); }
    btn.disabled = false;
  };
  sec.appendChild(btn);
}

/* ── Section: Miembros ──────────────────────────────────── */

function renderMiembros(container, league, myUid) {
  const sec = section(container, '👥 Miembros');

  const list = document.createElement('div');
  list.style.marginBottom = '12px';

  const renderList = () => {
    list.innerHTML = '';
    (league.members || []).forEach(uid => {
      const row = document.createElement('div');
      row.style.cssText = 'display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid var(--border)';
      const name = document.createElement('div');
      name.style.flex = '1';
      name.innerHTML = `
        <div style="font-size:13px;font-weight:600;color:${uid===myUid?'var(--accent)':'#fff'}">${league.memberNames[uid] || '—'}${uid===myUid?' <small style="color:var(--muted)">(Tú)</small>':''}</div>
        <div style="font-size:10px;color:var(--muted)">${uid.slice(0,8)}…</div>`;
      row.appendChild(name);
      if (uid !== myUid) {
        const kickBtn = document.createElement('button');
        kickBtn.className = 'pc-btn sell';
        kickBtn.style.cssText = 'font-size:11px;padding:4px 10px';
        kickBtn.textContent = 'Expulsar';
        kickBtn.onclick = async () => {
          if (!confirm(`¿Expulsar a ${league.memberNames[uid]}?`)) return;
          kickBtn.disabled = true;
          try {
            await kickMember(league.code, uid);
            league.members     = league.members.filter(u => u !== uid);
            delete league.memberNames[uid];
            window.NET11.ctx.league = league;
            renderList();
            showToast('✅ Miembro expulsado');
          } catch (e) { showToast(e.message || 'Error al expulsar', 'error'); kickBtn.disabled = false; }
        };
        row.appendChild(kickBtn);
      }
      list.appendChild(row);
    });
  };
  renderList();
  sec.appendChild(list);

  const link = getShareLink(league.code);
  const inviteBtn = document.createElement('button');
  inviteBtn.className = 'modal-close';
  inviteBtn.style.cssText = 'padding:10px;background:var(--bg4);color:var(--text);border:1px solid var(--border)';
  inviteBtn.textContent = '🔗 Copiar enlace de invitación';
  inviteBtn.onclick = async () => {
    if (navigator.share) {
      await navigator.share({ title: 'Net11', text: `Únete a mi liga con código ${league.code}`, url: link });
    } else {
      await navigator.clipboard.writeText(link);
      showToast('Link copiado 📋');
    }
  };
  sec.appendChild(inviteBtn);
}
