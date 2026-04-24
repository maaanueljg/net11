# Mejoras en "Mi Equipo" — Plan de Implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Añadir filtros por posición en "Plantilla Completa" y slots arrastrables en el campo de forma puramente visual.

**Architecture:** Todo en `js/tabs/equipo.js`. Los filtros son estado local en memoria. Las posiciones del campo se persisten en localStorage por clave `net11_pos_{uid}_{leagueCode}_{formation}`. Tap vs. arrastre se distingue con un timer de 150ms en el handler de pointer events. El menú de acción (vender / banquillo) usa `position:fixed` para evitar clipping por `overflow:hidden` del pitch-wrap.

**Tech Stack:** Vanilla JS ES Modules, Web Pointer Events API, localStorage

---

## Estructura de archivos

| Archivo | Cambio |
|---|---|
| `js/tabs/equipo.js` | Todos los cambios — filtros, posicionamiento absoluto, drag, menú |

Ningún otro archivo se toca.

---

## Contexto de la codebase

Antes de implementar, leer `js/tabs/equipo.js` completo. Puntos clave:
- `render(wrap, ctx)` crea el campo con `pitch-grid` (CSS Grid 5 columnas) y la plantilla debajo
- Cada slot usa `slotEl.style.gridColumn = slot.c` y `slotEl.style.gridRow = (maxRow+1) - slot.r`
- `FORMATIONS` en `js/players.js`: cada slot tiene `{pos, r, c}` donde `r` es fila (1=POR, max=DEL) y `c` columna (1-5)
- Funciones existentes: `removePlayer(idx, ctx)`, `removeBenchPlayer(idx, ctx)`, `buyPlayer(pid, ctx)`
- `calcTotalPts`, `saveTeam` importados de `../state.js`
- `buildPlayerCard`, `showToast`, `updateHeader` importados de `../ui.js`

---

### Task 1: Filtros por posición en la plantilla

**Files:**
- Modify: `js/tabs/equipo.js` (sección plantilla, actualmente líneas ~108-147)

- [ ] **Paso 1: Reemplazar la sección de plantilla en render()**

En `render()`, localiza el bloque que empieza en:
```js
const plantTitle = document.createElement('div');
plantTitle.className = 'sec-title';
plantTitle.innerHTML = '📋 PLANTILLA <span>COMPLETA</span>';
```
y termina en `wrap.appendChild(plantilla)`.

Reemplázalo íntegramente con:

```js
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
    btn.className = 'filter-chip active-all';
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
```

- [ ] **Paso 2: Verificar en el navegador**

Abre la app, ve a "Mi Equipo". Deben aparecer los chips Todos / POR / DEF / MED / DEL encima de la plantilla. Al pulsar cada chip, solo se ven los jugadores de esa posición (incluido banquillo). Al pulsar "Todos" vuelven todos. Sin jugadores, aparece el mensaje de bienvenida.

- [ ] **Paso 3: Commit**

```bash
git add js/tabs/equipo.js
git commit -m "feat: add position filter chips to plantilla completa"
```

---

### Task 2: Posicionamiento absoluto del campo + funciones auxiliares

**Files:**
- Modify: `js/tabs/equipo.js` (sección del campo + nuevas funciones al final del archivo)

- [ ] **Paso 1: Añadir funciones auxiliares al final del archivo**

Justo antes de `export async function buyPlayer(pid, ctx) {`, añade:

```js
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
```

- [ ] **Paso 2: Reemplazar el bloque de creación del grid**

En `render()`, localiza:
```js
const grid = document.createElement('div');
grid.className = 'pitch-grid';
const POS_COLOR = { POR:'var(--por)', DEF:'var(--def)', MED:'var(--med)', DEL:'var(--del)' };
const maxRow = Math.max(...slots.map(s => s.r));

slots.forEach((slot, idx) => {
  ...
  slotEl.style.gridColumn = slot.c;
  slotEl.style.gridRow    = (maxRow + 1) - slot.r;
  ...
  grid.appendChild(slotEl);
});

pitchWrap.appendChild(grid);
```

Reemplázalo con:

```js
const POS_COLOR = { POR:'var(--por)', DEF:'var(--def)', MED:'var(--med)', DEL:'var(--del)' };
const defaults  = defaultPositions(slots);
const positions = loadPositions(user.uid, league.code, formation) || defaults;

const grid = document.createElement('div');
grid.style.cssText = 'position:relative;width:100%;min-height:260px';

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
});

pitchWrap.appendChild(grid);
```

- [ ] **Paso 3: Añadir botón de resetear posiciones**

Inmediatamente después de `pitchWrap.appendChild(grid)`, añade:

```js
const resetBtn = document.createElement('button');
resetBtn.style.cssText = 'position:absolute;bottom:8px;right:10px;background:none;border:none;color:rgba(255,255,255,0.3);font-size:11px;cursor:pointer;font-family:var(--font-body);padding:4px 6px';
resetBtn.textContent = '↺ Resetear';
resetBtn.onclick = () => {
  localStorage.removeItem(`net11_pos_${user.uid}_${league.code}_${formation}`);
  window.NET11.refresh();
};
pitchWrap.appendChild(resetBtn);
```

- [ ] **Paso 4: Verificar en el navegador**

Los jugadores en el campo deben aparecer en las mismas posiciones relativas que antes (equivalentes a la formación). El POR debe estar abajo al centro, los DEL arriba. El botón "↺ Resetear" aparece en la esquina inferior derecha del campo.

- [ ] **Paso 5: Commit**

```bash
git add js/tabs/equipo.js
git commit -m "feat: refactor pitch to absolute positioning with localStorage persistence"
```

---

### Task 3: Arrastre con pointer events + menú de acciones

**Files:**
- Modify: `js/tabs/equipo.js`

- [ ] **Paso 1: Añadir makeDraggable justo después de savePositions**

```js
function makeDraggable(slotEl, idx, positions, uid, leagueCode, form, onTap) {
  let startX, startY, isDragging = false, tapTimer = null;

  slotEl.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    startX = e.clientX;
    startY = e.clientY;
    isDragging = false;
    slotEl.setPointerCapture(e.pointerId);
    tapTimer = setTimeout(() => { tapTimer = null; }, 150);
  });

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
  });

  slotEl.addEventListener('pointerup', () => {
    if (isDragging) {
      savePositions(uid, leagueCode, form, positions);
      isDragging = false;
    } else if (tapTimer !== null) {
      clearTimeout(tapTimer);
      tapTimer = null;
      onTap();
    }
  });

  slotEl.addEventListener('pointercancel', () => {
    if (isDragging) savePositions(uid, leagueCode, form, positions);
    isDragging = false;
    if (tapTimer) { clearTimeout(tapTimer); tapTimer = null; }
  });
}
```

- [ ] **Paso 2: Añadir showSlotMenu y moveToBench justo después de makeDraggable**

```js
function showSlotMenu(slotEl, onSell, onBench) {
  document.querySelector('.slot-menu')?.remove();
  const rect = slotEl.getBoundingClientRect();
  const menu = document.createElement('div');
  menu.className = 'slot-menu';
  menu.style.cssText = `position:fixed;left:${rect.left + rect.width / 2}px;top:${rect.top - 8}px;transform:translate(-50%,-100%);background:var(--bg3);border:1px solid var(--border);border-radius:10px;padding:6px;display:flex;flex-direction:column;gap:4px;z-index:200;min-width:140px`;

  const mkBtn = (text, bg, color, cb) => {
    const b = document.createElement('button');
    b.style.cssText = `padding:8px 12px;border:none;border-radius:7px;background:${bg};color:${color};font-family:var(--font-body);font-size:13px;font-weight:600;cursor:pointer;text-align:left`;
    b.textContent = text;
    b.onclick = (e) => { e.stopPropagation(); menu.remove(); cb(); };
    return b;
  };

  menu.appendChild(mkBtn('🔴 Vender',      'rgba(255,23,68,0.15)',   'var(--danger)', onSell));
  menu.appendChild(mkBtn('🪑 Al banquillo', 'rgba(255,255,255,0.05)', 'var(--text)',   onBench));
  document.body.appendChild(menu);

  setTimeout(() => {
    const close = (e) => { if (!menu.contains(e.target)) { menu.remove(); document.removeEventListener('pointerdown', close); } };
    document.addEventListener('pointerdown', close);
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
```

- [ ] **Paso 3: Conectar makeDraggable a cada slot**

En el `slots.forEach` del Task 2, inmediatamente después de `grid.appendChild(slotEl)`, añade:

```js
const onTap = player
  ? () => showSlotMenu(
      slotEl,
      () => removePlayer(idx, ctx),
      () => moveToBench(idx, ctx),
    )
  : () => {
      window.NET11.activeSlot = { pos: slot.pos, idx };
      window.NET11.switchTab('mercado');
      showToast(`Selecciona un ${slot.pos} en el mercado`, 'warn');
    };

makeDraggable(slotEl, idx, positions, user.uid, league.code, formation, onTap);
```

- [ ] **Paso 4: Verificar en el navegador**

  a. **Arrastre**: arrastra un jugador por el campo — se mueve en tiempo real. Al soltar, se queda en la nueva posición.
  b. **Persistencia**: recarga la app — el jugador sigue en la posición guardada.
  c. **Tap en slot con jugador**: aparece menú flotante con "🔴 Vender" y "🪑 Al banquillo". Al pulsar fuera, el menú se cierra.
  d. **Al banquillo**: pulsa esa opción — el jugador desaparece del campo y aparece en el banquillo de la plantilla.
  e. **Vender**: pulsa esa opción — el jugador se vende y el saldo aumenta.
  f. **Tap en slot vacío**: navega al mercado con el toast habitual.
  g. **Arrastre de slot vacío**: el slot vacío se puede mover libremente. Al soltar, guarda la posición.
  h. **Resetear**: pulsa "↺ Resetear" — todos los slots vuelven a las posiciones de la formación.

- [ ] **Paso 5: Commit**

```bash
git add js/tabs/equipo.js
git commit -m "feat: draggable field slots with tap action menu (sell / move to bench)"
```
