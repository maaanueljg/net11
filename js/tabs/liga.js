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
  let newspaperInput = null;
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

    newspaperInput = textInput(league.newspaper || '', { placeholder: 'Periódico fuente (ej: Marca, AS…)', maxlength: 40 });
    newspaperRow = inputRow('Periódico fuente', newspaperInput);
    newspaperRow.style.display = selectedMode === 'cronistas' ? 'block' : 'none';
    sec.appendChild(newspaperRow);
  }

  const btn = saveBtn();
  btn.onclick = async () => {
    const name = nameInput.value.trim();
    if (!name) { showToast('El nombre no puede estar vacío', 'error'); return; }
    btn.disabled = true;
    try {
      const fields = { name };
      if (!locked) {
        fields.scoringMode = selectedMode;
        if (selectedMode === 'cronistas') fields.newspaper = newspaperInput.value.trim() || null;
      }
      await updateLeague(league.code, fields);
      Object.assign(league, fields);
      window.NET11.ctx.league = league;
      showToast(locked ? '✅ Nombre actualizado' : '✅ Ajustes generales guardados');
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

/* ── Helpers: formatted number input ────────────────────── */

function formattedNumberInput(value, opts = {}) {
  // opts: { suffix, min, max, disabled }
  const wrap = document.createElement('div');
  wrap.style.cssText = 'display:flex;align-items:center;gap:8px';

  const fmt = v => {
    const n = Number(v);
    return (isNaN(n) ? 0 : n).toLocaleString('es-ES') + (opts.suffix ? ' ' + opts.suffix : '');
  };

  let rawValue = Number(value) || 0;

  const label = document.createElement('span');
  label.style.cssText = 'font-size:15px;font-weight:700;color:var(--accent);cursor:pointer;border-bottom:1px dashed var(--accent);padding-bottom:1px';
  label.textContent = fmt(rawValue);

  const input = document.createElement('input');
  input.type = 'number';
  input.className = 'search-box';
  input.style.cssText = 'margin-bottom:0;display:none;width:120px';
  input.value = rawValue;
  if (opts.min !== undefined) input.min = opts.min;
  if (opts.max !== undefined) input.max = opts.max;
  if (opts.disabled) { label.style.cursor = 'default'; label.style.borderBottom = 'none'; }

  if (!opts.disabled) {
    label.onclick = () => {
      label.style.display = 'none';
      input.style.display = '';
      input.focus();
      input.select();
    };
    const commit = () => {
      rawValue = Number(input.value) || 0;
      label.textContent = fmt(rawValue);
      input.style.display = 'none';
      label.style.display = '';
    };
    input.onblur = commit;
    input.onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); commit(); } };
  }

  wrap.appendChild(label);
  wrap.appendChild(input);
  wrap.getValue = () => rawValue;
  return wrap;
}

/* ── Section: Economía ──────────────────────────────────── */

function renderEconomia(container, league, locked) {
  const sec = section(container, '💰 Economía');

  const startingMoneyInput = formattedNumberInput(league.startingMoney ?? 100, { suffix: 'M€', min: 0, disabled: locked });
  sec.appendChild(inputRow('Dinero inicial por equipo (M€)' + (locked ? ' 🔒' : ''), startingMoneyInput));

  const mppInput = formattedNumberInput(league.moneyPerPoint ?? 0, { suffix: '€', min: 0 });
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
  const bonusInput = formattedNumberInput(league.jornadaBonus ?? 500000, { suffix: '€', min: 1 });
  bonusAmountWrap.appendChild(inputRow('Importe del bonus (€)', bonusInput));
  sec.appendChild(bonusAmountWrap);
  bonusCheck.onchange = () => { bonusAmountWrap.style.display = bonusCheck.checked ? 'block' : 'none'; };

  const btn = saveBtn();
  btn.onclick = async () => {
    btn.disabled = true;
    try {
      const fields = {
        moneyPerPoint: mppInput.getValue() || 0,
        jornadaBonus:  bonusCheck.checked && bonusInput.getValue() > 0 ? bonusInput.getValue() : null,
      };
      if (!locked) {
        fields.startingMoney = startingMoneyInput.getValue();
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

  // Ventanas de cláusulas
  const windowsLabel = document.createElement('div');
  windowsLabel.style.cssText = 'font-size:11px;color:var(--muted);margin:12px 0 6px';
  windowsLabel.textContent = 'Ventanas de cláusulas';
  sec.appendChild(windowsLabel);

  let windows = [...(league.clauseWindows || [])];

  const windowsList = document.createElement('div');
  windowsList.style.marginBottom = '8px';
  sec.appendChild(windowsList);

  const renderWindows = () => {
    windowsList.innerHTML = '';
    if (windows.length === 0) {
      const empty = document.createElement('div');
      empty.style.cssText = 'font-size:12px;color:var(--muted);margin-bottom:6px';
      empty.textContent = 'Sin ventanas definidas';
      windowsList.appendChild(empty);
      return;
    }
    windows.forEach((w, i) => {
      const card = document.createElement('div');
      card.style.cssText = 'background:var(--bg4);border:1px solid var(--border);border-radius:var(--r-sm);padding:8px 10px;margin-bottom:6px;display:flex;align-items:center;gap:8px';
      const info = document.createElement('div');
      info.style.flex = '1';
      const dateStr = `${w.startDate} → ${w.endDate}`;
      const jorStr  = (w.startJornada || w.endJornada) ? ` · J${w.startJornada ?? '?'}–J${w.endJornada ?? '?'}` : '';
      info.style.cssText = 'font-size:12px;color:var(--text)';
      info.textContent = dateStr + jorStr;
      const del = document.createElement('button');
      del.className = 'pc-btn sell';
      del.style.cssText = 'font-size:11px;padding:3px 8px';
      del.textContent = '✕';
      del.onclick = () => { windows.splice(i, 1); renderWindows(); };
      card.appendChild(info);
      card.appendChild(del);
      windowsList.appendChild(card);
    });
  };
  renderWindows();

  const addWindowBtn = document.createElement('button');
  addWindowBtn.className = 'modal-close';
  addWindowBtn.style.cssText = 'font-size:12px;padding:6px 12px;margin-bottom:8px;background:var(--bg4);color:var(--text);border:1px solid var(--border)';
  addWindowBtn.textContent = '+ Añadir ventana';
  sec.appendChild(addWindowBtn);

  const addForm = document.createElement('div');
  addForm.style.cssText = 'display:none;background:var(--bg4);border:1px solid var(--border);border-radius:var(--r-sm);padding:10px;margin-bottom:8px';

  const wStartDate = textInput('', { type: 'date' });
  const wEndDate   = textInput('', { type: 'date' });
  const wStartJor  = textInput('', { type: 'number', min: 1, max: 99, placeholder: 'Opcional' });
  const wEndJor    = textInput('', { type: 'number', min: 1, max: 99, placeholder: 'Opcional' });
  addForm.appendChild(inputRow('Fecha inicio', wStartDate));
  addForm.appendChild(inputRow('Fecha fin', wEndDate));
  addForm.appendChild(inputRow('Jornada inicio', wStartJor));
  addForm.appendChild(inputRow('Jornada fin', wEndJor));

  const wErrEl = document.createElement('div');
  wErrEl.style.cssText = 'font-size:11px;color:var(--danger);margin-bottom:6px';
  addForm.appendChild(wErrEl);

  const wAddBtn = document.createElement('button');
  wAddBtn.className = 'modal-close';
  wAddBtn.style.cssText = 'font-size:12px;padding:6px 12px;background:rgba(0,230,118,0.12);color:var(--accent);border:1px solid rgba(0,230,118,0.3)';
  wAddBtn.textContent = 'Añadir';
  wAddBtn.onclick = () => {
    wErrEl.textContent = '';
    const sd = wStartDate.value;
    const ed = wEndDate.value;
    if (!sd) { wErrEl.textContent = 'La fecha de inicio es obligatoria'; return; }
    if (!ed) { wErrEl.textContent = 'La fecha de fin es obligatoria'; return; }
    if (ed < sd) { wErrEl.textContent = 'La fecha de fin debe ser posterior a la de inicio'; return; }
    windows.push({
      startDate:    sd,
      endDate:      ed,
      startJornada: wStartJor.value ? Number(wStartJor.value) : null,
      endJornada:   wEndJor.value   ? Number(wEndJor.value)   : null,
    });
    wStartDate.value = ''; wEndDate.value = ''; wStartJor.value = ''; wEndJor.value = '';
    addForm.style.display = 'none';
    addWindowBtn.style.display = '';
    renderWindows();
  };
  addForm.appendChild(wAddBtn);
  sec.appendChild(addForm);

  addWindowBtn.onclick = () => {
    addForm.style.display = 'block';
    addWindowBtn.style.display = 'none';
  };

  // maxStolenPerTeam
  const stolenInput = textInput(league.maxStolenPerTeam ?? '', { type: 'number', min: 1, max: 20, placeholder: 'Sin límite' });
  sec.appendChild(inputRow('Máx. jugadores robables por equipo por ventana (vacío = sin límite)', stolenInput));

  const btn = saveBtn();
  btn.onclick = async () => {
    btn.disabled = true;
    try {
      const val = stolenInput.value.trim();
      const fields = {
        antiRobo:         arCheck.checked,
        antiRoboFee:      Number(arFeeInput.value) || 75,
        antiRoboLimit:    arLimitInput.value.trim() ? Number(arLimitInput.value) : null,
        clauseWindows:    windows,
        maxStolenPerTeam: val ? Number(val) : null,
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
      const nameDiv = document.createElement('div');
      nameDiv.style.cssText = `font-size:13px;font-weight:600;color:${uid===myUid?'var(--accent)':'#fff'}`;
      nameDiv.textContent = league.memberNames[uid] || '—';
      if (uid === myUid) {
        const small = document.createElement('small');
        small.style.cssText = 'color:var(--muted)';
        small.textContent = ' (Tú)';
        nameDiv.appendChild(small);
      }
      const uidDiv = document.createElement('div');
      uidDiv.style.cssText = 'font-size:10px;color:var(--muted)';
      uidDiv.textContent = uid.slice(0, 8) + '…';
      name.appendChild(nameDiv);
      name.appendChild(uidDiv);
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
    try {
      if (navigator.share) {
        await navigator.share({ title: 'Net11', text: `Únete a mi liga con código ${league.code}`, url: link });
      } else {
        await navigator.clipboard.writeText(link);
        showToast('Link copiado 📋');
      }
    } catch (e) {
      if (e.name !== 'AbortError') showToast('No se pudo copiar el enlace', 'error');
    }
  };
  sec.appendChild(inviteBtn);
}
