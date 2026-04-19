# Scoring System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implementar los tres modos de puntuación (Base, Cronistas, Puras-stub) con motor de cálculo compartido, UI de admin por modo, y visualización real de puntos por jornada.

**Architecture:** `js/scoring.js` es el motor de cálculo puro. `js/leagues.js` almacena `scoringMode` y `newspaper` en la liga. El admin panel recoge estadísticas brutas por jugador y calcula pts al publicar usando el modo de cada liga. `js/tabs/jornada.js` carga el doc de jornada de Firestore y recalcula pts cliente-side.

**Tech Stack:** Vanilla JS ES Modules, Firebase 10.7.0 Firestore.

> **Nota sobre testing:** Sin test runner. Verificación en navegador/consola tras cada tarea.

---

## Mapa de ficheros

| Fichero | Acción | Responsabilidad |
|---|---|---|
| `js/scoring.js` | Crear | `calcPoints(stats, pos, mode)`, constantes de puntuación |
| `js/leagues.js` | Modificar | `createLeague` acepta `scoringMode` y `newspaper` |
| `js/tabs/perfil.js` | Modificar | Modal crear liga añade selector de modo + campo periódico |
| `js/admin.js` | Modificar | UI de stats por modo, usa `calcPoints` al publicar |
| `js/tabs/jornada.js` | Modificar | Carga jornada desde Firestore, muestra pts reales |

---

## Task 1: js/scoring.js — Motor de puntuación

**Files:**
- Create: `js/scoring.js`

- [ ] **Step 1: Crear js/scoring.js**

```javascript
const PTS_GOALS        = { POR: 6, DEF: 6, MED: 5, DEL: 4 };
const PTS_CLEAN_SHEET  = { POR: 4, DEF: 3, MED: 2, DEL: 1 };
const PTS_GOALS_AGAINST = { POR: -2, DEF: -2, MED: -1, DEL: -1 };
const LOST_BALLS_THRESH = { POR: 12, DEF: 12, MED: 10, DEL: 8 };

/**
 * Calcula los puntos de un jugador para una jornada.
 * @param {Object} s    - Estadísticas brutas del jugador (ver estructura en jornadas/{id}/players)
 * @param {string} pos  - Posición: 'POR'|'DEF'|'MED'|'DEL'
 * @param {string} mode - Modo de la liga: 'base'|'cronistas'|'puras'
 * @returns {number}
 */
export function calcPoints(s, pos, mode) {
  if (!s) return 0;
  let pts = 0;

  // Picas (solo modo cronistas)
  if (mode === 'cronistas') pts += (s.picas || 0);

  // Goles
  pts += (s.goals || 0) * (PTS_GOALS[pos] || 0);

  // Asistencias
  pts += (s.assists || 0) * 3;
  pts += (s.assistChance || 0) * 1;

  // Portería a cero (solo modo base, requiere >60 min)
  if (mode === 'base' && s.cleanSheet && (s.minutesPlayed || 0) > 60) {
    pts += PTS_CLEAN_SHEET[pos] || 0;
  }

  // Penaltis
  if (pos === 'POR') pts += (s.penaltySaved || 0) * 5;
  pts += (s.penaltyWon || 0) * 2;
  pts -= (s.penaltyMissed || 0) * 2;

  // Tarjetas
  // yellowCards: 0 o 1 (amarilla simple)
  // doubleYellow: true si recibió segunda amarilla (total = -2, ya incluye la primera)
  // redCard: true si roja directa (-5)
  if (s.doubleYellow) {
    pts -= 2; // dos amarillas = -2
  } else {
    pts -= (s.yellowCards || 0) * 1;
  }
  if (s.redCard) pts -= 5;

  // Goles recibidos (cada 2)
  pts += Math.floor((s.goalsAgainst || 0) / 2) * (PTS_GOALS_AGAINST[pos] || 0);

  // Acciones positivas y balones perdidos (solo modo base y cronistas parcial)
  // En cronistas estos los cubre la nota subjetiva, así que solo en base
  if (mode === 'base') {
    pts += Math.floor((s.positiveActions || 0) / 2);
    const threshold = LOST_BALLS_THRESH[pos] || 10;
    pts -= Math.floor((s.lostBalls || 0) / threshold);
  }

  return pts;
}
```

- [ ] **Step 2: Verificar en consola del navegador**

Con la app desplegada, abrir DevTools → Console:
```javascript
import('/js/scoring.js').then(m => {
  const pts = m.calcPoints(
    { goals: 1, assists: 1, cleanSheet: true, minutesPlayed: 90 },
    'DEF',
    'base'
  );
  console.log('Esperado: 6+3+3 = 12, obtenido:', pts);
});
```

- [ ] **Step 3: Commit**

```bash
git add js/scoring.js
git commit -m "feat: add scoring engine with calcPoints"
```

---

## Task 2: js/leagues.js — Añadir scoringMode y newspaper

**Files:**
- Modify: `js/leagues.js`

- [ ] **Step 1: Actualizar la firma de `createLeague` y el documento Firestore**

Reemplazar la función `createLeague` completa:

```javascript
export async function createLeague(adminUid, adminTeamName, name, competition, scoringMode = 'base', newspaper = null) {
  let code;
  let attempts = 0;
  const data = {
    name,
    competition,
    scoringMode,
    newspaper:      newspaper || null,
    adminUid,
    members:        [adminUid],
    memberNames:    { [adminUid]: adminTeamName },
    createdAt:      new Date().toISOString(),
    currentJornada: 1,
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

- [ ] **Step 2: Commit**

```bash
git add js/leagues.js
git commit -m "feat: add scoringMode and newspaper to createLeague"
```

---

## Task 3: js/tabs/perfil.js — Selector de modo en crear liga

**Files:**
- Modify: `js/tabs/perfil.js`

- [ ] **Step 1: Añadir import de COMPETITIONS al principio del fichero** (ya está importado, verificar)

El fichero ya tiene `import { COMPETITIONS } from '../players.js';`. No hay que cambiar imports.

- [ ] **Step 2: Actualizar `showCreateLeagueModal` para incluir selector de modo y campo periódico**

Reemplazar la función `showCreateLeagueModal` completa:

```javascript
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
      <div style="font-size:12px;color:var(--muted);margin-bottom:8px;text-transform:uppercase;letter-spacing:1px">Sistema de puntuación</div>
      <div id="cl-mode-grid" style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;margin-bottom:10px"></div>
      <div id="cl-newspaper-wrap" style="display:none;margin-bottom:10px">
        <input id="cl-newspaper" type="text" class="search-box" placeholder="Periódico fuente (ej: Marca, AS…)" maxlength="40">
      </div>
      <div id="cl-error" style="color:var(--danger);font-size:12px;min-height:18px;margin-bottom:8px"></div>
      <div style="display:flex;gap:8px">
        <button id="cl-cancel" class="modal-close" style="flex:1;background:var(--bg4);color:var(--text)">Cancelar</button>
        <button id="cl-save"   class="modal-close" style="flex:1">Crear liga</button>
      </div>
    </div>`;

  let selectedComp = null;
  let selectedMode = 'base';

  // Competición
  const compGrid = overlay.querySelector('#cl-comp-grid');
  Object.values(COMPETITIONS).forEach(c => {
    const btn = document.createElement('button');
    btn.style.cssText = 'padding:10px;border-radius:var(--r-sm);border:1px solid var(--border);background:var(--bg3);color:var(--text);cursor:pointer;font-family:var(--font-body);font-size:12px;font-weight:600;transition:all 0.18s';
    btn.textContent = c.label;
    btn.onclick = () => {
      compGrid.querySelectorAll('button').forEach(b => { b.style.borderColor = 'var(--border)'; b.style.background = 'var(--bg3)'; });
      btn.style.borderColor = 'var(--accent)';
      btn.style.background  = 'rgba(0,230,118,0.1)';
      selectedComp = c.key;
    };
    compGrid.appendChild(btn);
  });

  // Modo de puntuación
  const modeGrid = overlay.querySelector('#cl-mode-grid');
  const MODES = [
    { key: 'base',      label: '📊 Base' },
    { key: 'cronistas', label: '📰 Cronistas' },
    { key: 'puras',     label: '🔌 Puras' },
  ];
  const newspaperWrap = overlay.querySelector('#cl-newspaper-wrap');

  MODES.forEach(m => {
    const btn = document.createElement('button');
    btn.style.cssText = 'padding:10px;border-radius:var(--r-sm);border:1px solid var(--border);background:var(--bg3);color:var(--text);cursor:pointer;font-family:var(--font-body);font-size:12px;font-weight:600;transition:all 0.18s;text-align:center';
    btn.textContent = m.label;
    if (m.key === 'base') {
      btn.style.borderColor = 'var(--accent)';
      btn.style.background  = 'rgba(0,230,118,0.1)';
    }
    btn.onclick = () => {
      modeGrid.querySelectorAll('button').forEach(b => { b.style.borderColor = 'var(--border)'; b.style.background = 'var(--bg3)'; });
      btn.style.borderColor = 'var(--accent)';
      btn.style.background  = 'rgba(0,230,118,0.1)';
      selectedMode = m.key;
      newspaperWrap.style.display = m.key === 'cronistas' ? 'block' : 'none';
    };
    modeGrid.appendChild(btn);
  });

  overlay.querySelector('#cl-cancel').onclick = () => overlay.remove();
  overlay.querySelector('#cl-save').onclick = async () => {
    const name      = overlay.querySelector('#cl-name').value.trim();
    const newspaper = overlay.querySelector('#cl-newspaper').value.trim();
    const errEl     = overlay.querySelector('#cl-error');
    if (!name)         { errEl.textContent = 'Introduce un nombre'; return; }
    if (!selectedComp) { errEl.textContent = 'Elige una competición'; return; }
    if (selectedMode === 'cronistas' && !newspaper) { errEl.textContent = 'Introduce el periódico fuente'; return; }
    try {
      const { user, profile } = ctx;
      const code   = await createLeague(user.uid, profile.teamName, name, selectedComp, selectedMode, newspaper || null);
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
```

- [ ] **Step 3: Verificar en navegador**

Abrir tab Perfil → "Crear nueva liga". Debe aparecer el selector de modo (Base/Cronistas/Puras). Al seleccionar Cronistas debe aparecer el campo de periódico. Crear una liga en modo Cronistas y verificar en Firebase Console que el documento `leagues/{code}` tiene `scoringMode: "cronistas"` y `newspaper: "..."`.

- [ ] **Step 4: Commit**

```bash
git add js/tabs/perfil.js
git commit -m "feat: add scoring mode selector to create league modal"
```

---

## Task 4: js/admin.js — UI de stats por modo y calcPoints al publicar

**Files:**
- Modify: `js/admin.js`

- [ ] **Step 1: Añadir import de calcPoints y PLAYERS al fichero**

Al principio de `js/admin.js`, añadir el import de scoring:

```javascript
import { calcPoints } from './scoring.js';
```

El import de `PLAYERS` ya existe.

- [ ] **Step 2: Cambiar la estructura de `jornadaData`**

Reemplazar la variable global `let jornadaPts = {};` por:

```javascript
let jornadaData = {}; // { [playerId]: { goals, assists, assistChance, cleanSheet, minutesPlayed, penaltySaved, penaltyWon, penaltyMissed, yellowCards, doubleYellow, redCard, goalsAgainst, positiveActions, lostBalls, picas } }
```

- [ ] **Step 3: Actualizar `loadJornada`**

Reemplazar la función `loadJornada`:

```javascript
async function loadJornada(num) {
  currentJornada = num;
  document.getElementById('jornada-num').textContent = num;
  try {
    const snap = await getDoc(doc(db, 'jornadas', String(num)));
    jornadaData = snap.exists() ? (snap.data().players || {}) : {};
  } catch { jornadaData = {}; }
  renderPlayerTable();
}
```

- [ ] **Step 4: Reemplazar `renderPlayerTable` con UI de stats completas**

Reemplazar la función `renderPlayerTable` completa:

```javascript
function renderPlayerTable() {
  const tbody = document.getElementById('players-tbody');
  tbody.innerHTML = '';
  PLAYERS.forEach(p => {
    const s  = jornadaData[p.id] || {};
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td style="white-space:nowrap">${p.emoji} ${p.name}</td>
      <td><span style="font-size:10px;padding:2px 6px;border-radius:4px;background:rgba(255,255,255,0.08)">${p.pos}</span></td>
      <td><input type="number" min="0" max="20" value="${s.goals ?? 0}"            class="si" onchange="updateStat(${p.id},'goals',+this.value)"            style="width:44px"></td>
      <td><input type="number" min="0" max="20" value="${s.assists ?? 0}"          class="si" onchange="updateStat(${p.id},'assists',+this.value)"          style="width:44px"></td>
      <td><input type="number" min="0" max="20" value="${s.assistChance ?? 0}"     class="si" onchange="updateStat(${p.id},'assistChance',+this.value)"     style="width:44px"></td>
      <td><input type="checkbox" ${s.cleanSheet ? 'checked' : ''}                             onchange="updateStat(${p.id},'cleanSheet',this.checked)"></td>
      <td><input type="number" min="0" max="120" value="${s.minutesPlayed ?? 90}"  class="si" onchange="updateStat(${p.id},'minutesPlayed',+this.value)"    style="width:52px"></td>
      ${p.pos === 'POR' ? `<td><input type="number" min="0" max="20" value="${s.penaltySaved ?? 0}" class="si" onchange="updateStat(${p.id},'penaltySaved',+this.value)" style="width:44px"></td>` : '<td style="color:var(--muted);text-align:center">—</td>'}
      <td><input type="number" min="0" max="5"  value="${s.penaltyWon ?? 0}"       class="si" onchange="updateStat(${p.id},'penaltyWon',+this.value)"       style="width:44px"></td>
      <td><input type="number" min="0" max="5"  value="${s.penaltyMissed ?? 0}"    class="si" onchange="updateStat(${p.id},'penaltyMissed',+this.value)"    style="width:44px"></td>
      <td>
        <select class="si" onchange="updateCard(${p.id},this.value)" style="background:var(--bg3);border:1px solid var(--border);border-radius:4px;color:var(--text);padding:3px;font-family:var(--font-body);font-size:12px">
          <option value="none"       ${(!s.yellowCards && !s.doubleYellow && !s.redCard) ? 'selected':''}>—</option>
          <option value="yellow"     ${(s.yellowCards===1 && !s.doubleYellow) ? 'selected':''}>🟨 Amarilla</option>
          <option value="doubleYellow" ${s.doubleYellow ? 'selected':''}>🟨🟨 2ª Amarilla</option>
          <option value="red"        ${s.redCard ? 'selected':''}>🟥 Roja directa</option>
        </select>
      </td>
      <td><input type="number" min="0" max="20" value="${s.goalsAgainst ?? 0}"     class="si" onchange="updateStat(${p.id},'goalsAgainst',+this.value)"     style="width:44px"></td>
      <td><input type="number" min="0" max="50" value="${s.positiveActions ?? 0}"  class="si" onchange="updateStat(${p.id},'positiveActions',+this.value)"  style="width:44px"></td>
      <td><input type="number" min="0" max="50" value="${s.lostBalls ?? 0}"        class="si" onchange="updateStat(${p.id},'lostBalls',+this.value)"        style="width:44px"></td>
      <td id="picas-cell-${p.id}"></td>
      <td id="pts-preview-${p.id}" style="font-weight:700;color:var(--accent)">—</td>`;
    tbody.appendChild(tr);
  });
  refreshPicasColumn();
  refreshPtsPreview();
}

function refreshPicasColumn() {
  PLAYERS.forEach(p => {
    const cell = document.getElementById(`picas-cell-${p.id}`);
    if (!cell) return;
    const s = jornadaData[p.id] || {};
    if (window._adminMode === 'cronistas') {
      cell.innerHTML = `
        <select class="si" onchange="updateStat(${p.id},'picas',+this.value)" style="background:var(--bg3);border:1px solid var(--border);border-radius:4px;color:var(--text);padding:3px;font-family:var(--font-body);font-size:12px">
          <option value="0" ${!s.picas ? 'selected':''}>—</option>
          <option value="1" ${s.picas===1 ? 'selected':''}>♣ (1)</option>
          <option value="2" ${s.picas===2 ? 'selected':''}>♣♣ (2)</option>
          <option value="3" ${s.picas===3 ? 'selected':''}>♣♣♣ (3)</option>
          <option value="4" ${s.picas===4 ? 'selected':''}>♣♣♣♣ (4)</option>
        </select>`;
    } else {
      cell.innerHTML = '<span style="color:var(--muted);font-size:11px">—</span>';
    }
  });
}

function refreshPtsPreview() {
  PLAYERS.forEach(p => {
    const el = document.getElementById(`pts-preview-${p.id}`);
    if (!el) return;
    const s   = jornadaData[p.id] || {};
    const pts = calcPoints(s, p.pos, window._adminMode || 'base');
    el.textContent = pts;
    el.style.color = pts > 0 ? 'var(--accent)' : pts < 0 ? 'var(--danger)' : 'var(--muted)';
  });
}
```

- [ ] **Step 5: Actualizar `window.updatePts` por `window.updateStat` y añadir `window.updateCard`**

Reemplazar `window.updatePts` y añadir las nuevas funciones globales:

```javascript
window.updateStat = (id, field, val) => {
  if (!jornadaData[id]) jornadaData[id] = {};
  jornadaData[id][field] = val;
  refreshPtsPreview();
};

window.updateCard = (id, val) => {
  if (!jornadaData[id]) jornadaData[id] = {};
  jornadaData[id].yellowCards  = 0;
  jornadaData[id].doubleYellow = false;
  jornadaData[id].redCard      = false;
  if (val === 'yellow')       jornadaData[id].yellowCards  = 1;
  if (val === 'doubleYellow') jornadaData[id].doubleYellow = true;
  if (val === 'red')          jornadaData[id].redCard      = true;
  refreshPtsPreview();
};
```

- [ ] **Step 6: Actualizar `publishJornada` para guardar stats brutas y calcular pts por liga**

Reemplazar la función `window.publishJornada`:

```javascript
window.publishJornada = async () => {
  const btn = document.getElementById('btn-publish');
  btn.disabled = true;
  btn.textContent = 'Publicando...';
  try {
    await setDoc(doc(db, 'jornadas', String(currentJornada)), {
      published: true,
      date:      new Date().toISOString(),
      players:   jornadaData,
    });

    const usersSnap  = await getDocs(collection(db, 'users'));
    const leagueCache = {};
    let updated = 0;

    for (const userDoc of usersSnap.docs) {
      const profile = userDoc.data();
      const leagues = profile.leagues || [];
      for (const leagueCode of leagues) {
        try {
          // Obtener modo de la liga (con caché para no releer)
          if (!leagueCache[leagueCode]) {
            const ls = await getDoc(doc(db, 'leagues', leagueCode));
            leagueCache[leagueCode] = ls.exists() ? ls.data() : { scoringMode: 'base' };
          }
          const leagueData  = leagueCache[leagueCode];
          const scoringMode = leagueData.scoringMode || 'base';
          if (scoringMode === 'puras') continue; // stub: no calculamos aún

          const teamSnap = await getDoc(doc(db, 'users', userDoc.id, 'leagueTeams', leagueCode));
          if (!teamSnap.exists()) continue;
          const team = teamSnap.data().team || [];

          // Importar PLAYERS para obtener pos de cada jugador
          const totalPts = team.filter(Boolean).reduce((sum, pid) => {
            const player = PLAYERS.find(p => p.id === pid);
            if (!player) return sum;
            return sum + calcPoints(jornadaData[pid] || {}, player.pos, scoringMode);
          }, 0);

          await setDoc(
            doc(db, 'users', userDoc.id, 'leagueTeams', leagueCode),
            { totalPts },
            { merge: true }
          );
          updated++;
        } catch { /* skip */ }
      }
    }

    btn.textContent = `✅ Publicado · ${updated} equipos actualizados`;
    setTimeout(() => { btn.disabled = false; btn.textContent = '🚀 Publicar jornada'; }, 3000);
  } catch (err) {
    btn.disabled = false;
    btn.textContent = '❌ Error: ' + err.message;
  }
};
```

- [ ] **Step 7: Mostrar modo de la liga activa en el panel y guardar en `window._adminMode`**

Dentro de la función `onAuthStateChanged`, justo después de `loadJornada(currentJornada);`, añadir:

```javascript
window._adminMode = 'base'; // default
```

Y actualizar el encabezado del panel en `admin.html` para mostrar el modo. Más abajo en este paso se actualiza también el encabezado de la tabla en `admin.html` (ver Task 5).

- [ ] **Step 8: Añadir estilos `.si` en `admin.html`**

En el bloque `<style>` de `admin.html`, añadir:

```css
.si {
  background: var(--bg3);
  border: 1px solid var(--border);
  border-radius: 4px;
  color: var(--text);
  padding: 3px 4px;
  font-family: var(--font-body);
  font-size: 12px;
}
```

- [ ] **Step 9: Commit**

```bash
git add js/admin.js
git commit -m "feat: update admin panel with per-stat inputs and calcPoints"
```

---

## Task 5: admin.html — Actualizar cabecera de tabla y modo

**Files:**
- Modify: `admin.html`

- [ ] **Step 1: Reemplazar el bloque `<table>` completo en admin.html**

Reemplazar desde `<table>` hasta `</table>` (la tabla de jugadores):

```html
<div id="mode-badge" style="font-size:12px;color:var(--muted);margin-bottom:10px">Modo: <strong id="mode-label" style="color:var(--accent)">Base</strong></div>
<div style="overflow-x:auto">
<table>
  <thead>
    <tr>
      <th>Jugador</th>
      <th>Pos</th>
      <th title="Goles">⚽ Goles</th>
      <th title="Asistencias que provocan gol">🎯 Ast.</th>
      <th title="Asistencias en ocasión manifiesta">🎯 Oc.</th>
      <th title="Portería a cero">🧱 P0</th>
      <th title="Minutos jugados">⏱ Min</th>
      <th title="Penaltis parados">🧤 PenP</th>
      <th title="Penaltis provocados">💥 PenW</th>
      <th title="Penaltis fallados">❌ PenF</th>
      <th title="Tarjeta">🟨 Tarj.</th>
      <th title="Goles recibidos">🥅 GR</th>
      <th title="Acciones positivas (paradas+tiros+regates+llegadas)">✨ Acc+</th>
      <th title="Balones perdidos">💨 BP</th>
      <th title="Picas (modo Cronistas)">♣ Picas</th>
      <th>Pts</th>
    </tr>
  </thead>
  <tbody id="players-tbody"></tbody>
</table>
</div>
```

- [ ] **Step 2: Commit**

```bash
git add admin.html
git commit -m "feat: update admin table headers for full stats"
```

---

## Task 6: js/tabs/jornada.js — Puntos reales desde Firestore

**Files:**
- Modify: `js/tabs/jornada.js`

- [ ] **Step 1: Reemplazar el contenido completo de js/tabs/jornada.js**

```javascript
import { getPlayer } from '../players.js';
import { calcPoints } from '../scoring.js';
import { db } from '../firebase.js';
import {
  doc, getDoc,
} from "https://www.gstatic.com/firebasejs/10.7.0/firebase-firestore.js";

export async function render(wrap, ctx) {
  const { user, league, teamState } = ctx;

  if (!user || !league || !teamState) {
    wrap.innerHTML = `<div class="plantilla-empty" style="margin:24px 16px">Únete a una liga para ver la jornada.</div>`;
    return;
  }

  const jornada     = league.currentJornada ?? 1;
  const scoringMode = league.scoringMode || 'base';

  wrap.innerHTML = `<div class="sec-title">📅 JORNADA <span>${jornada}</span></div>`;

  const jh = document.createElement('div');
  jh.className = 'jornada-header';
  jh.innerHTML = `
    <div class="jh-info">
      <div class="jh-label">Temporada 24/25</div>
      <div class="jh-num">Jornada ${jornada}</div>
    </div>
    <div class="jh-pts">
      <div class="jh-total" id="jh-total-pts">—</div>
      <div class="jh-sub">puntos acumulados</div>
    </div>`;
  wrap.appendChild(jh);

  if (scoringMode === 'puras') {
    const note = document.createElement('div');
    note.className = 'plantilla-empty';
    note.style.margin = '16px';
    note.textContent = '🔌 Modo Estadísticas Puras — Próximamente.';
    wrap.appendChild(note);
    return;
  }

  // Cargar jornada desde Firestore
  let jornadaDoc = null;
  try {
    const snap = await getDoc(doc(db, 'jornadas', String(jornada)));
    if (snap.exists()) jornadaDoc = snap.data();
  } catch { /* sin datos de jornada aún */ }

  const players = teamState.team
    .filter(Boolean)
    .map(id => getPlayer(id))
    .filter(Boolean);

  const list = document.createElement('div');
  list.style.padding = '0 16px';

  if (players.length === 0) {
    list.innerHTML = '<div class="plantilla-empty">Ficha jugadores para ver sus puntuaciones.</div>';
    wrap.appendChild(list);
    return;
  }

  if (!jornadaDoc) {
    list.innerHTML = '<div class="plantilla-empty" style="margin-top:8px">La jornada aún no ha sido publicada por el administrador.</div>';
    wrap.appendChild(list);
    return;
  }

  const POS_COLOR = { POR:'var(--por)', DEF:'var(--def)', MED:'var(--med)', DEL:'var(--del)' };

  const playersWithPts = players
    .map(p => ({
      ...p,
      jornadaPts: calcPoints(jornadaDoc.players?.[p.id] || {}, p.pos, scoringMode),
    }))
    .sort((a, b) => b.jornadaPts - a.jornadaPts);

  const totalJornadaPts = playersWithPts.reduce((s, p) => s + p.jornadaPts, 0);
  document.getElementById('jh-total-pts').textContent = totalJornadaPts;

  const maxPts = Math.max(...playersWithPts.map(p => p.jornadaPts), 1);

  playersWithPts.forEach(p => {
    const pct = Math.round((Math.max(p.jornadaPts, 0) / maxPts) * 100);
    const col = POS_COLOR[p.pos];
    const bar = document.createElement('div');
    bar.className = 'pts-bar';
    bar.innerHTML = `
      <div class="pb-emoji">${p.emoji}</div>
      <div class="pb-info">
        <div class="pb-name">${p.name}</div>
        <div class="pb-track">
          <div class="pb-fill" style="width:${pct}%;background:${col}"></div>
        </div>
      </div>
      <div class="pb-val" style="color:${p.jornadaPts>0?'var(--accent)':p.jornadaPts<0?'var(--danger)':'var(--muted)'}">${p.jornadaPts}</div>`;
    list.appendChild(bar);
  });

  wrap.appendChild(list);
}
```

- [ ] **Step 2: Actualizar el import en js/app.js**

La función `render` de `jornada.js` es ahora `async`. Actualizar en `js/app.js` la línea donde se llama:

```javascript
else if (currentTab === 'jornada') renderJornada(wrap, ctx);
```

Cambiar a:

```javascript
else if (currentTab === 'jornada') renderJornada(wrap, ctx).catch(console.error);
```

- [ ] **Step 3: Verificar en navegador**

1. Publicar una jornada desde el panel admin con algún gol/asistencia.
2. Ir a la tab Jornada en la app. Debe mostrar los puntos reales del jugador, no los estáticos.
3. Jugadores sin datos de jornada deben mostrar 0.

- [ ] **Step 4: Commit**

```bash
git add js/tabs/jornada.js js/app.js
git commit -m "feat: jornada tab loads real pts from Firestore via calcPoints"
```

---

## Task 7: Deploy y verificación final

**Files:**
- No hay cambios de código.

- [ ] **Step 1: Deploy completo**

```bash
firebase deploy --project net11-0099
```

- [ ] **Step 2: Verificar flujo completo**

1. Crear una liga en modo **Base** → fichar jugadores → ir a admin → publicar jornada con goles y tarjetas → comprobar tab Jornada muestra pts correctos.
2. Crear una liga en modo **Cronistas** → publicar jornada con picas + goles → comprobar pts = picas + goles.
3. Crear una liga en modo **Puras** → tab Jornada debe mostrar "Próximamente".

- [ ] **Step 3: Commit final**

```bash
git add .
git commit -m "chore: deploy scoring system"
```
