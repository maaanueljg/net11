# League Admin Panel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a conditional ⚙️ Liga tab giving league creators a full configuration panel (general settings, economy, transfer windows, clauses, anti-robo system, member management) while extending publishJornada to distribute money per point and jornada bonus.

**Architecture:** Vanilla JS ES module tab (`js/tabs/liga.js`) conditionally shown in the bottom nav when the active league's `adminUid` matches the current user. League config fields are stored in `leagues/{code}`; per-team financial state (`money`, `antiRoboUsed`, `stolenThisWindow`) lives in `users/{uid}/leagueTeams/{code}`. Scoring mode locks after the first jornada is published (tracked via `jornadasPublished` counter on the league doc). No build step; Firebase 10.7.0 CDN imports.

**Tech Stack:** Vanilla JS ES Modules, Firebase Firestore 10.7.0, PWA (no framework, no bundler)

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `js/leagues.js` | Modify | Add new league config fields to `createLeague()`; add `updateLeague()`, `kickMember()` |
| `js/tabs/perfil.js` | Modify | Extend `showCreateLeagueModal` with new config fields; init `money` on create/join |
| `js/app.js` | Modify | Add liga tab routing; show/hide liga nav btn conditionally |
| `index.html` | Modify | Add hidden ⚙️ Liga nav button |
| `js/tabs/liga.js` | Create | Full league admin tab (all sections) |
| `js/admin.js` | Modify | Extend `publishJornada` to distribute money/bonus and increment `jornadasPublished` |

---

## Task 1: Extend `createLeague()` and add `updateLeague()` / `kickMember()`

**Files:**
- Modify: `js/leagues.js`

Context: `createLeague()` already accepts `(adminUid, adminTeamName, name, competition, scoringMode, newspaper)`. We extend it with new league config params and add two new exported functions.

- [ ] **Step 1: Add new imports to leagues.js**

Open `js/leagues.js`. The current import from firestore is:
```js
import {
  doc, setDoc, getDoc, updateDoc, arrayUnion, runTransaction,
} from "https://www.gstatic.com/firebasejs/10.7.0/firebase-firestore.js";
```

Replace with:
```js
import {
  doc, setDoc, getDoc, updateDoc, arrayUnion, arrayRemove, deleteField, runTransaction,
} from "https://www.gstatic.com/firebasejs/10.7.0/firebase-firestore.js";
```

- [ ] **Step 2: Extend `createLeague()` signature and data object**

Replace the existing `createLeague` function:
```js
export async function createLeague(
  adminUid, adminTeamName, name, competition,
  scoringMode = 'base', newspaper = null,
  {
    clauseMode      = 'moderado',
    startingMoney   = 100,
    moneyPerPoint   = 0,
    jornadaBonus    = null,
    formations      = ['4-3-3', '4-4-2', '4-2-3-1', '4-5-1', '3-5-2', '5-3-2', '3-4-3', '5-4-1'],
    maxStolenPerTeam = null,
    antiRobo        = false,
    antiRoboFee     = 75,
    antiRoboLimit   = null,
  } = {}
) {
  let code;
  let attempts = 0;
  const data = {
    name,
    competition,
    scoringMode,
    newspaper:        newspaper || null,
    adminUid,
    members:          [adminUid],
    memberNames:      { [adminUid]: adminTeamName },
    createdAt:        new Date().toISOString(),
    currentJornada:   1,
    jornadasPublished: 0,
    clauseMode,
    startingMoney,
    moneyPerPoint,
    jornadaBonus,
    formations,
    marketOpen:       false,
    maxStolenPerTeam,
    antiRobo,
    antiRoboFee,
    antiRoboLimit,
  };
  do {
    code = generateCode();
    const ref = doc(db, 'leagues', code);
    try {
      await runTransaction(db, async tx => {
        const snap = await tx.get(ref);
        if (snap.exists()) throw new Error('collision');
        tx.set(ref, data);
      });
      break;
    } catch (e) {
      if (e.message !== 'collision') throw e;
    }
  } while (++attempts < 5);
  if (attempts === 5) throw new Error('No se pudo generar un código único');
  return code;
}
```

- [ ] **Step 3: Add `updateLeague()` function**

Add after the existing `joinLeague` function:
```js
export async function updateLeague(code, fields) {
  await updateDoc(doc(db, 'leagues', code.toUpperCase()), fields);
}
```

- [ ] **Step 4: Add `kickMember()` function**

Add after `updateLeague`:
```js
export async function kickMember(code, memberUid) {
  await updateDoc(doc(db, 'leagues', code.toUpperCase()), {
    members:                        arrayRemove(memberUid),
    [`memberNames.${memberUid}`]:   deleteField(),
  });
}
```

- [ ] **Step 5: Verify in browser console**

Open the app, open browser DevTools console, run:
```js
import('/js/leagues.js').then(m => {
  console.log(typeof m.updateLeague);   // "function"
  console.log(typeof m.kickMember);     // "function"
});
```
Expected: both log `"function"`.

- [ ] **Step 6: Commit**

```bash
git add js/leagues.js
git commit -m "feat: extend createLeague with config fields, add updateLeague/kickMember"
```

---

## Task 2: Extend `showCreateLeagueModal` with new config fields

**Files:**
- Modify: `js/tabs/perfil.js`

Context: The current modal has: name, competition grid, scoring mode grid, newspaper. We add: clauseMode, startingMoney, moneyPerPoint, jornadaBonus (toggle + amount), formations checkboxes, maxStolenPerTeam, antiRobo (toggle + fee + limit). Also initialize `money` when creating/joining.

- [ ] **Step 1: Add imports for new leagues functions**

In `js/tabs/perfil.js`, the current import from leagues.js is:
```js
import { createLeague, joinLeague, getLeague, getShareLink } from '../leagues.js';
```
Replace with:
```js
import { createLeague, joinLeague, getLeague, getShareLink, updateLeague } from '../leagues.js';
```

- [ ] **Step 2: Replace `showCreateLeagueModal` with extended version**

Replace the entire `showCreateLeagueModal` function (lines 111–204):
```js
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
  const modeGrid    = overlay.querySelector('#cl-mode-grid');
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
    const name         = overlay.querySelector('#cl-name').value.trim();
    const newspaper    = overlay.querySelector('#cl-newspaper').value.trim();
    const startingMoney = Number(overlay.querySelector('#cl-money').value) || 100;
    const moneyPerPoint = Number(overlay.querySelector('#cl-mpp').value) || 0;
    const jornadaBonus  = bonusCheck.checked ? (Number(overlay.querySelector('#cl-bonus-amount').value) || 0) : null;
    const maxStolenRaw  = overlay.querySelector('#cl-stolen').value.trim();
    const maxStolenPerTeam = maxStolenRaw ? Number(maxStolenRaw) : null;
    const antiRobo      = arCheck.checked;
    const antiRoboFee   = Number(overlay.querySelector('#cl-antirobo-fee').value) || 75;
    const antiRoboLimitRaw = overlay.querySelector('#cl-antirobo-limit').value.trim();
    const antiRoboLimit = antiRoboLimitRaw ? Number(antiRoboLimitRaw) : null;
    const errEl = overlay.querySelector('#cl-error');

    if (!name)                                          { errEl.textContent = 'Introduce un nombre'; return; }
    if (!selectedComp)                                  { errEl.textContent = 'Elige una competición'; return; }
    if (selectedMode === 'cronistas' && !newspaper)     { errEl.textContent = 'Introduce el periódico fuente'; return; }
    if (selectedFormations.size === 0)                  { errEl.textContent = 'Activa al menos una alineación'; return; }

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
      window.NET11.ctx.teamState = {
        budget: 100, formation: '4-3-3', team: Array(11).fill(null),
        totalPts: 0, competition: selectedComp,
        money: startingMoney, antiRoboUsed: 0, stolenThisWindow: 0,
      };
      overlay.remove();
      showToast(`✅ Liga "${name}" creada · Código: ${code}`);
      window.NET11.refresh();
    } catch (err) {
      overlay.querySelector('#cl-error').textContent = 'Error: ' + err.message;
    }
  };

  document.body.appendChild(overlay);
}
```

- [ ] **Step 3: Initialize `money` when joining a league**

In `showJoinLeagueModal`, replace the teamState initialization inside the join onclick handler:
```js
// Old:
window.NET11.ctx.teamState = { budget: 100, formation: '4-3-3', team: Array(11).fill(null), totalPts: 0, competition: league.competition };

// New:
window.NET11.ctx.teamState = {
  budget: 100, formation: '4-3-3', team: Array(11).fill(null),
  totalPts: 0, competition: league.competition,
  money: league.startingMoney ?? 100, antiRoboUsed: 0, stolenThisWindow: 0,
};
```

- [ ] **Step 4: Verify in browser**

1. Open app → Perfil → Crear nueva liga
2. Check that new fields appear: modo de cláusulas, economía (dinero inicial, €/punto), bonus toggle, alineaciones, máx robados, anti-robo toggle
3. Create a test league → verify it appears in Firestore `leagues/{code}` with all new fields

- [ ] **Step 5: Commit**

```bash
git add js/tabs/perfil.js
git commit -m "feat: extend createLeague modal with clause/economy/market/anti-robo config"
```

---

## Task 3: Add ⚙️ Liga nav button + routing in app.js

**Files:**
- Modify: `index.html`
- Modify: `js/app.js`

Context: The Liga tab is only shown if `league?.adminUid === user.uid`. The nav button is hidden by default and shown/hidden after auth.

- [ ] **Step 1: Add Liga nav button to index.html**

In `index.html`, inside `<nav>`, add the Liga button after the Perfil button:
```html
<button class="nav-btn" id="nav-liga" data-tab="liga" onclick="switchTab('liga',this)" style="display:none">
  <div class="nav-icon">⚙️</div>
  <div class="nav-label">Liga</div>
  <div class="nav-dot"></div>
</button>
```

- [ ] **Step 2: Import `renderLiga` in app.js**

In `js/app.js`, add the import after the perfil import:
```js
import { render as renderLiga } from './tabs/liga.js';
```

- [ ] **Step 3: Add Liga tab routing in `renderCurrentTab`**

In `js/app.js`, inside `renderCurrentTab()`, add after the perfil branch:
```js
else if (currentTab === 'liga') renderLiga(wrap, ctx);
```

- [ ] **Step 4: Add `updateLigaNav` helper and call it after ctx update**

In `js/app.js`, add this function before `renderCurrentTab`:
```js
function updateLigaNav() {
  const { user, league } = window.NET11.ctx;
  const btn = document.getElementById('nav-liga');
  if (btn) btn.style.display = (league && user && league.adminUid === user.uid) ? '' : 'none';
}
```

Call `updateLigaNav()` after every ctx mutation in the `onAuthChange` handler and after tab switches that update `ctx.league`. Specifically, in the `onAuthChange` callback, add `updateLigaNav()` just before `renderCurrentTab()`:

```js
// In onAuthChange, before each renderCurrentTab() call:
updateLigaNav();
renderCurrentTab();
```

Also export `updateLigaNav` to `window` so perfil.js can call it after creating/joining a league:
```js
window.NET11.updateLigaNav = updateLigaNav;
```

- [ ] **Step 5: Call `updateLigaNav` after create/join in perfil.js**

In `js/tabs/perfil.js`, inside `showCreateLeagueModal` after `window.NET11.refresh()`:
```js
if (window.NET11.updateLigaNav) window.NET11.updateLigaNav();
```

Same in `showJoinLeagueModal` after `window.NET11.refresh()`:
```js
if (window.NET11.updateLigaNav) window.NET11.updateLigaNav();
```

- [ ] **Step 6: Verify in browser**

1. Log in as league admin → ⚙️ nav button appears
2. Log in as non-admin member → ⚙️ nav button hidden
3. Click ⚙️ → console shows no error (tab renders, even if empty for now)

- [ ] **Step 7: Commit**

```bash
git add index.html js/app.js js/tabs/perfil.js
git commit -m "feat: add conditional Liga nav tab for league admins"
```

---

## Task 4: Create `js/tabs/liga.js` — scaffold + General section

**Files:**
- Create: `js/tabs/liga.js`

Context: The tab renders all sections sequentially in a scrollable container. Each section has a header and save button. The General section covers league name, scoring mode (locked after first jornada published), and newspaper.

- [ ] **Step 1: Create the file with scaffold and General section**

Create `js/tabs/liga.js`:
```js
import {
  doc, getDoc, setDoc,
} from "https://www.gstatic.com/firebasejs/10.7.0/firebase-firestore.js";
import { db } from '../firebase.js';
import { updateLeague, kickMember } from '../leagues.js';
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
  renderEconomia(container, league);
  renderMercado(container, league);
  renderClausulas(container, league, locked);
  renderMiembros(container, league, user.uid, ctx);
}

function section(container, title) {
  const wrap = document.createElement('div');
  wrap.style.cssText = 'background:var(--bg3);border:1px solid var(--border);border-radius:var(--r);padding:16px;margin-bottom:12px';
  const h = document.createElement('div');
  h.style.cssText = 'font-weight:700;font-size:14px;color:#fff;margin-bottom:12px;display:flex;align-items:center;gap:6px';
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
  el.value = value ?? '';
  if (opts.placeholder) el.placeholder = opts.placeholder;
  if (opts.max !== undefined) el.max = opts.max;
  if (opts.min !== undefined) el.min = opts.min;
  if (opts.maxlength) el.maxLength = opts.maxlength;
  if (opts.disabled) el.disabled = true;
  return el;
}

function renderGeneral(container, league, locked) {
  const sec = section(container, '📋 General');

  const nameInput = textInput(league.name, { maxlength: 30 });
  sec.appendChild(inputRow('Nombre de la liga', nameInput));

  const modeLabel = document.createElement('div');
  modeLabel.style.cssText = 'font-size:11px;color:var(--muted);margin-bottom:4px';
  modeLabel.textContent = 'Sistema de puntuación';
  sec.appendChild(modeLabel);

  if (locked) {
    const modeVal = document.createElement('div');
    modeVal.style.cssText = 'font-size:13px;color:var(--text);padding:8px 0;margin-bottom:10px';
    modeVal.textContent = { base: '📊 Base', cronistas: '📰 Cronistas', puras: '🔌 Puras' }[league.scoringMode] || league.scoringMode;
    const note = document.createElement('div');
    note.style.cssText = 'font-size:11px;color:var(--muted);margin-bottom:10px';
    note.textContent = '🔒 No editable tras publicar la primera jornada';
    sec.appendChild(modeVal);
    sec.appendChild(note);
  } else {
    const MODES = [
      { key: 'base',      label: '📊 Base' },
      { key: 'cronistas', label: '📰 Cronistas' },
      { key: 'puras',     label: '🔌 Puras' },
    ];
    let selectedMode = league.scoringMode || 'base';
    const modeGrid = document.createElement('div');
    modeGrid.style.cssText = 'display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;margin-bottom:10px';
    MODES.forEach(m => {
      const btn = document.createElement('button');
      btn.style.cssText = 'padding:8px;border-radius:var(--r-sm);border:1px solid var(--border);background:var(--bg4);color:var(--text);cursor:pointer;font-family:var(--font-body);font-size:12px;font-weight:600;transition:all 0.18s';
      btn.textContent = m.label;
      if (m.key === selectedMode) { btn.style.borderColor='var(--accent)'; btn.style.background='rgba(0,230,118,0.1)'; }
      btn.onclick = () => {
        modeGrid.querySelectorAll('button').forEach(b => { b.style.borderColor='var(--border)'; b.style.background='var(--bg4)'; });
        btn.style.borderColor='var(--accent)'; btn.style.background='rgba(0,230,118,0.1)';
        selectedMode = m.key;
        newspaperRow.style.display = m.key === 'cronistas' ? 'block' : 'none';
      };
      modeGrid.appendChild(btn);
    });
    sec.appendChild(modeGrid);

    const newspaperInput = textInput(league.newspaper || '', { placeholder: 'Periódico fuente (ej: Marca, AS…)', maxlength: 40 });
    const newspaperRow = inputRow('Periódico fuente', newspaperInput);
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
        league.name = name;
        league.scoringMode = selectedMode;
        if (selectedMode === 'cronistas') league.newspaper = fields.newspaper;
        window.NET11.ctx.league = league;
        showToast('✅ Ajustes generales guardados');
      } catch { showToast('Error al guardar', 'error'); }
      btn.disabled = false;
    };
    sec.appendChild(btn);
    return;
  }

  // If locked, only name is editable
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
```

- [ ] **Step 2: Add placeholder stubs for remaining sections (so the file loads without errors)**

Add at the bottom of the file:
```js
function renderEconomia(container, league) {}
function renderMercado(container, league) {}
function renderClausulas(container, league, locked) {}
function renderMiembros(container, league, myUid, ctx) {}
```

- [ ] **Step 3: Verify in browser**

1. Log in as league admin → click ⚙️ Liga
2. "General" section appears with name input and mode selector
3. Edit name → click Guardar → toast shows "✅ Ajustes generales guardados"
4. Verify in Firestore that `leagues/{code}.name` updated

- [ ] **Step 4: Commit**

```bash
git add js/tabs/liga.js
git commit -m "feat: add liga tab scaffold with General section"
```

---

## Task 5: Liga tab — Plantillas section (formations)

**Files:**
- Modify: `js/tabs/liga.js`

Context: Show the allowed formations as toggleable chips. The admin selects which formations members can use. Save writes `formations` array to Firestore.

- [ ] **Step 1: Replace `renderEconomia` stub with Plantillas + Economía stubs**

Actually, insert a `renderPlantillas` section between General and Economía. Update the `render` function call order:

In the `render` function, replace:
```js
renderGeneral(container, league, locked);
renderEconomia(container, league);
```
with:
```js
renderGeneral(container, league, locked);
renderPlantillas(container, league);
renderEconomia(container, league);
```

- [ ] **Step 2: Implement `renderPlantillas`**

Add before `renderEconomia` stub:
```js
function renderPlantillas(container, league) {
  const ALL_FORMATIONS = ['4-3-3','4-4-2','4-2-3-1','4-5-1','3-5-2','5-3-2','3-4-3','5-4-1'];
  const sec = section(container, '📐 Plantillas');

  const selected = new Set(league.formations || ALL_FORMATIONS);
  const grid = document.createElement('div');
  grid.style.cssText = 'display:flex;flex-wrap:wrap;gap:6px;margin-bottom:4px';

  ALL_FORMATIONS.forEach(f => {
    const chip = document.createElement('button');
    const active = selected.has(f);
    chip.style.cssText = `padding:5px 12px;border-radius:16px;border:1px solid ${active?'var(--accent)':'var(--border)'};background:${active?'rgba(0,230,118,0.1)':'var(--bg4)'};color:${active?'var(--accent)':'var(--muted)'};font-size:12px;font-weight:600;cursor:pointer;font-family:var(--font-body);transition:all 0.18s`;
    chip.textContent = f;
    chip.onclick = () => {
      if (selected.has(f)) {
        selected.delete(f);
        chip.style.borderColor='var(--border)'; chip.style.background='var(--bg4)'; chip.style.color='var(--muted)';
      } else {
        selected.add(f);
        chip.style.borderColor='var(--accent)'; chip.style.background='rgba(0,230,118,0.1)'; chip.style.color='var(--accent)';
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
```

- [ ] **Step 3: Verify in browser**

1. ⚙️ Liga → Plantillas section shows formation chips
2. Toggle chips on/off → click Guardar
3. Verify `leagues/{code}.formations` updated in Firestore

- [ ] **Step 4: Commit**

```bash
git add js/tabs/liga.js
git commit -m "feat: add Plantillas (formations) section to liga tab"
```

---

## Task 6: Liga tab — Economía section

**Files:**
- Modify: `js/tabs/liga.js`

Context: Shows startingMoney (read-only if jornadasPublished > 0), moneyPerPoint, jornadaBonus toggle + amount.

- [ ] **Step 1: Implement `renderEconomia`**

Replace the `renderEconomia` stub:
```js
function renderEconomia(container, league) {
  const sec     = section(container, '💰 Economía');
  const locked  = (league.jornadasPublished ?? 0) > 0;

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
      const fields = {
        moneyPerPoint: Number(mppInput.value) || 0,
        jornadaBonus:  bonusCheck.checked ? (Number(bonusAmountInput.value) || 0) : null,
      };
      if (!locked) fields.startingMoney = Number(moneyInput.value) || 100;
      await updateLeague(league.code, fields);
      Object.assign(league, fields);
      window.NET11.ctx.league = league;
      showToast('✅ Economía actualizada');
    } catch { showToast('Error al guardar', 'error'); }
    btn.disabled = false;
  };
  sec.appendChild(btn);
}
```

- [ ] **Step 2: Verify in browser**

1. ⚙️ Liga → Economía shows startingMoney, €/punto, bonus toggle
2. Edit values → Guardar → toast success
3. Verify Firestore fields updated

- [ ] **Step 3: Commit**

```bash
git add js/tabs/liga.js
git commit -m "feat: add Economía section to liga tab"
```

---

## Task 7: Liga tab — Mercado y Fichajes section

**Files:**
- Modify: `js/tabs/liga.js`

Context: Market open/close toggle with current state displayed. maxStolenPerTeam input.

- [ ] **Step 1: Implement `renderMercado`**

Replace `renderMercado` stub:
```js
function renderMercado(container, league) {
  const sec = section(container, '🏪 Mercado y Fichajes');

  const statusLabel = document.createElement('div');
  statusLabel.style.cssText = 'font-size:13px;margin-bottom:10px;display:flex;align-items:center;gap:8px';
  const dot = document.createElement('span');
  dot.style.cssText = `display:inline-block;width:8px;height:8px;border-radius:50%;background:${league.marketOpen ? 'var(--accent)' : 'var(--danger)'}`;
  statusLabel.appendChild(dot);
  const statusText = document.createElement('span');
  statusText.style.color = league.marketOpen ? 'var(--accent)' : 'var(--danger)';
  statusText.textContent  = league.marketOpen ? 'Mercado abierto' : 'Mercado cerrado';
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
      dot.style.background   = newState ? 'var(--accent)' : 'var(--danger)';
      statusText.style.color  = newState ? 'var(--accent)' : 'var(--danger)';
      statusText.textContent   = newState ? 'Mercado abierto' : 'Mercado cerrado';
      toggleBtn.textContent    = newState ? '🔒 Cerrar mercado' : '🔓 Abrir mercado';
      toggleBtn.style.background = newState ? 'rgba(255,23,68,0.12)' : 'rgba(0,230,118,0.12)';
      toggleBtn.style.color      = newState ? 'var(--danger)' : 'var(--accent)';
      toggleBtn.style.borderColor = newState ? 'rgba(255,23,68,0.3)' : 'rgba(0,230,118,0.3)';
    } catch { showToast('Error al actualizar', 'error'); }
    toggleBtn.disabled = false;
  };
  sec.appendChild(toggleBtn);

  const stolenRaw    = league.maxStolenPerTeam;
  const stolenInput  = textInput(stolenRaw ?? '', { type: 'number', min: 1, max: 20, placeholder: 'Sin límite' });
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
```

- [ ] **Step 2: Verify in browser**

1. ⚙️ Liga → Mercado shows current market state with correct color dot
2. Toggle button opens/closes market → Firestore `marketOpen` updates
3. Save maxStolenPerTeam → Firestore updates

- [ ] **Step 3: Commit**

```bash
git add js/tabs/liga.js
git commit -m "feat: add Mercado section to liga tab"
```

---

## Task 8: Liga tab — Cláusulas section

**Files:**
- Modify: `js/tabs/liga.js`

Context: Shows clauseMode (read-only after first jornada). Shows anti-robo toggle, fee, and limit with save.

- [ ] **Step 1: Implement `renderClausulas`**

Replace `renderClausulas` stub:
```js
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

  // Anti-robo
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

  const arFeeInput   = textInput(league.antiRoboFee ?? 75,   { type:'number', min:1, max:200 });
  const arLimitInput = textInput(league.antiRoboLimit ?? '', { type:'number', min:1, max:99, placeholder:'Ilimitado' });
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
```

- [ ] **Step 2: Verify in browser**

1. ⚙️ Liga → Cláusulas shows clause mode and anti-robo toggle
2. Enable anti-robo → fee and limit inputs appear
3. Save → Firestore `antiRobo`, `antiRoboFee`, `antiRoboLimit` update

- [ ] **Step 3: Commit**

```bash
git add js/tabs/liga.js
git commit -m "feat: add Cláusulas section to liga tab"
```

---

## Task 9: Liga tab — Miembros section

**Files:**
- Modify: `js/tabs/liga.js`

Context: Lists all members. Admin cannot kick themselves. Kick removes member from `members` array and `memberNames` map. Invite link shows the league code share link.

- [ ] **Step 1: Add `getShareLink` import**

In `js/tabs/liga.js`, update the import from `../leagues.js`:
```js
import { updateLeague, kickMember, getShareLink } from '../leagues.js';
```

- [ ] **Step 2: Implement `renderMiembros`**

Replace the `renderMiembros` stub:
```js
function renderMiembros(container, league, myUid, ctx) {
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
      name.innerHTML = `<div style="font-size:13px;font-weight:600;color:${uid===myUid?'var(--accent)':'#fff'}">${league.memberNames[uid] || '—'}${uid===myUid?' <small style="color:var(--muted)">(Tú)</small>':''}</div><div style="font-size:10px;color:var(--muted)">${uid.slice(0,8)}…</div>`;
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
          } catch { showToast('Error al expulsar', 'error'); kickBtn.disabled = false; }
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
```

- [ ] **Step 3: Verify in browser**

1. ⚙️ Liga → Miembros shows all members with kick buttons (except self)
2. Click "Expulsar" on a test member → confirm dialog → member disappears from list
3. "Copiar enlace de invitación" copies link or opens share sheet

- [ ] **Step 4: Commit**

```bash
git add js/tabs/liga.js
git commit -m "feat: add Miembros section to liga tab"
```

---

## Task 10: Update `publishJornada` to distribute money and bonus

**Files:**
- Modify: `js/admin.js`

Context: After calculating each team's `totalPts` for a jornada, we:
1. Add `moneyPerPoint × totalPts` to the team's `money` field in `leagueTeams`
2. Track each league's top scorer(s) and distribute `jornadaBonus` equally among ties
3. Increment `jornadasPublished` on the league doc (used to lock scoring mode)

The existing `publishJornada` already loops over users × leagues and writes `totalPts`. We extend that loop.

- [ ] **Step 1: Add data structures for per-league tracking**

Inside `publishJornada`, after `const leagueCache = {}; let updated = 0;` add:
```js
// Per-league: track pts per team for bonus calculation
const leaguePts = {}; // { leagueCode: { uid: totalPts, ... } }
```

- [ ] **Step 2: Capture pts per team during the loop**

Inside the inner try block of the user loop, after computing `totalPts` and before the `setDoc` call, add:
```js
if (!leaguePts[leagueCode]) leaguePts[leagueCode] = {};
leaguePts[leagueCode][userDoc.id] = totalPts;
```

Also extend the existing `setDoc` call to merge `money` increment. Replace:
```js
await setDoc(
  doc(db, 'users', userDoc.id, 'leagueTeams', leagueCode),
  { totalPts },
  { merge: true }
);
```
with:
```js
const leagueData  = leagueCache[leagueCode];
const moneyEarned = (leagueData.moneyPerPoint ?? 0) * totalPts;
await setDoc(
  doc(db, 'users', userDoc.id, 'leagueTeams', leagueCode),
  { totalPts, ...(moneyEarned > 0 ? { money: (teamSnap.data().money ?? (leagueData.startingMoney ?? 100)) + moneyEarned } : {}) },
  { merge: true }
);
```

- [ ] **Step 3: Distribute jornada bonus and increment jornadasPublished**

After the users loop (after `btn.textContent = ...` line), add:
```js
// Distribute jornada bonus and increment jornadasPublished per league
const { updateDoc, increment } = await import("https://www.gstatic.com/firebasejs/10.7.0/firebase-firestore.js");
for (const [leagueCode, ptsMap] of Object.entries(leaguePts)) {
  try {
    const leagueData = leagueCache[leagueCode];

    // Increment jornadasPublished
    await updateDoc(doc(db, 'leagues', leagueCode), {
      jornadasPublished: (leagueData.jornadasPublished ?? 0) + 1,
    });

    // Distribute bonus
    const bonus = leagueData.jornadaBonus;
    if (!bonus) continue;
    const maxPts = Math.max(...Object.values(ptsMap));
    const winners = Object.keys(ptsMap).filter(uid => ptsMap[uid] === maxPts);
    const share = Math.floor(bonus / winners.length);
    for (const uid of winners) {
      const teamRef  = doc(db, 'users', uid, 'leagueTeams', leagueCode);
      const teamSnap = await getDoc(teamRef);
      if (!teamSnap.exists()) continue;
      const currentMoney = teamSnap.data().money ?? (leagueData.startingMoney ?? 100);
      await setDoc(teamRef, { money: currentMoney + share }, { merge: true });
    }
  } catch { /* skip */ }
}
```

Note: `updateDoc` and `getDoc` are already imported at the top of admin.js. Remove the dynamic import line and use the existing imports instead. The static import at top of file already includes `getDoc`:
```js
import {
  doc, setDoc, getDoc, collection, getDocs, arrayUnion, updateDoc,
} from "https://www.gstatic.com/firebasejs/10.7.0/firebase-firestore.js";
```

Add `updateDoc` to the existing import if not present.

- [ ] **Step 4: Verify in browser admin panel**

1. Open `/admin.html` → enter stats for jornada 1 → click "Publicar jornada"
2. After publish: check Firestore `leagues/{code}.jornadasPublished` → should be 1
3. Check `users/{uid}/leagueTeams/{code}.money` → should be `startingMoney + (pts × moneyPerPoint)`
4. If jornadaBonus configured: top scorer's `money` gets bonus added

- [ ] **Step 5: Commit**

```bash
git add js/admin.js
git commit -m "feat: distribute money/bonus on jornada publish, increment jornadasPublished"
```

---

## Self-Review

**Spec coverage check:**
- ✅ League admin role: `adminUid` in createLeague, conditional nav tab
- ✅ Tab ⚙️: conditionally shown, league selector if multiple admin leagues
- ✅ General: name, scoring mode (locked after jornadasPublished > 0), newspaper
- ✅ Plantillas: formations checkboxes
- ✅ Economía: startingMoney, moneyPerPoint, jornadaBonus (split on tie)
- ✅ Mercado: marketOpen toggle, maxStolenPerTeam
- ✅ Cláusulas: clauseMode (locked), antiRobo, antiRoboFee, antiRoboLimit
- ✅ Miembros: kick, share link
- ✅ money initialized on create (Task 2) and join (Task 2 step 3)
- ✅ jornadasPublished incremented on publish (Task 10)
- ✅ money distributed per point on publish (Task 10)
- ✅ jornadaBonus split on tie (Task 10)

**Note:** `clausula` field on individual players (per the data model) is not implemented in this plan — it will be part of the mercado/transfer system (a future spec). The scoring mode lock and antiRobo data structures are in place for when that system is built.

**Note:** Multi-league admin support (league selector in the ⚙️ tab) relies on the existing pattern from ranking.js — it uses `window.NET11.ctx.league` which is already the active league. If the user is admin of multiple leagues, they switch between them using the existing league selector in Perfil or Ranking. The ⚙️ tab always edits the currently active league.
