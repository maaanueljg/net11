# Net11 Fantasy Fútbol — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transformar el prototipo monolítico en una PWA multijugador funcional con auth real, ligas privadas por competición y ranking en tiempo real.

**Architecture:** Vanilla JS ES Modules sin build step. `app.js` es el punto de entrada único; expone `window.NET11` con contexto global (`user`, `profile`, `league`, `teamState`). Cada tab es un módulo que exporta `render(container, ctx)`. Firebase Firestore como backend en tiempo real.

**Tech Stack:** Vanilla JS ES Modules, Firebase 10.7.0 (Auth + Firestore + Hosting), PWA (manifest + service worker).

> **Nota sobre testing:** No hay test runner en este proyecto (no-build-step). Los pasos de verificación usan el navegador y la consola del navegador. Cada tarea termina con un commit.

---

## Mapa de ficheros

| Fichero | Acción | Responsabilidad |
|---|---|---|
| `sw.js` | Crear | Service worker cache-first |
| `firebase.json` | Modificar | Rewrites /join/*, headers |
| `firestore.rules` | Modificar | Reglas para leagueTeams subcollección |
| `index.html` | Modificar | Shell: quitar JS inline, añadir modales auth/onboarding, cambiar nav |
| `js/firebase.js` | Crear | `initializeApp`, exporta `db` y `auth` |
| `js/players.js` | Crear | Datos de jugadores + helpers; campo `competition` en cada jugador |
| `js/ui.js` | Crear | `showToast`, `updateHeader`, `buildPlayerCard` |
| `js/state.js` | Crear | `saveTeam`, `loadTeam`, `defaultTeamState`, `calcTotalPts` |
| `js/auth.js` | Crear | Login Google/email, perfil Firestore, `onAuthChange` |
| `js/leagues.js` | Crear | `createLeague`, `joinLeague`, `getLeague`, `getShareLink` |
| `js/app.js` | Crear | Entry point, `window.NET11`, router de tabs, manejo /join/ URL |
| `js/tabs/equipo.js` | Crear | Tab campo visual + plantilla |
| `js/tabs/mercado.js` | Crear | Tab mercado filtrado por competición de la liga |
| `js/tabs/ranking.js` | Crear | Tab ranking en tiempo real con `onSnapshot` |
| `js/tabs/jornada.js` | Crear | Tab jornada activa con puntos |
| `js/tabs/perfil.js` | Crear | Tab perfil: crear/unirse a ligas, cerrar sesión |
| `admin.html` | Crear | Panel admin (shell HTML + CSS) |
| `js/admin.js` | Crear | Gestión de jornadas y jugadores |

---

## Task 1: Service Worker

**Files:**
- Create: `sw.js`

- [ ] **Step 1: Crear sw.js**

```javascript
const CACHE = 'net11-v1';
const ASSETS = [
  '/', '/index.html', '/manifest.json',
  '/icon-192.png', '/icon-512.png',
  '/js/app.js', '/js/firebase.js', '/js/players.js',
  '/js/ui.js', '/js/state.js', '/js/auth.js', '/js/leagues.js',
  '/js/tabs/equipo.js', '/js/tabs/mercado.js',
  '/js/tabs/ranking.js', '/js/tabs/jornada.js', '/js/tabs/perfil.js',
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    caches.match(e.request).then(cached => cached || fetch(e.request).then(res => {
      const clone = res.clone();
      caches.open(CACHE).then(c => c.put(e.request, clone));
      return res;
    }))
  );
});
```

- [ ] **Step 2: Verificar en navegador**

Abrir `index.html` (con servidor local o tras deploy). En DevTools → Application → Service Workers: debe aparecer `sw.js` como "activated and running".

- [ ] **Step 3: Commit**

```bash
git add sw.js
git commit -m "feat: add cache-first service worker"
```

---

## Task 2: Actualizar firebase.json y firestore.rules

**Files:**
- Modify: `firebase.json`
- Modify: `firestore.rules`

- [ ] **Step 1: Actualizar firebase.json**

Reemplazar el contenido de `firebase.json` con:

```json
{
  "hosting": {
    "public": ".",
    "ignore": ["firebase.json", ".firebaserc", "docs/**", "firestore.rules", "*.md"],
    "rewrites": [
      { "source": "/join/**", "destination": "/index.html" }
    ],
    "headers": [
      {
        "source": "**/*.js",
        "headers": [{ "key": "Cache-Control", "value": "no-cache" }]
      }
    ]
  }
}
```

- [ ] **Step 2: Actualizar firestore.rules**

Reemplazar el contenido de `firestore.rules` con:

```
rules_version = '2';

service cloud.firestore {
  match /databases/{database}/documents {

    match /users/{userId} {
      allow read: if request.auth != null;
      allow write: if request.auth != null && request.auth.uid == userId;

      match /leagueTeams/{leagueCode} {
        allow read: if request.auth != null;
        allow write: if request.auth != null && request.auth.uid == userId;
      }
    }

    match /leagues/{leagueCode} {
      allow read:   if request.auth != null;
      allow create: if request.auth != null;
      allow update: if request.auth != null
                    && request.auth.uid in resource.data.members;
    }

    match /jornadas/{jornadaId} {
      allow read:  if request.auth != null;
      allow write: if request.auth != null
                   && request.auth.uid in ['REPLACE_WITH_YOUR_ADMIN_UID'];
    }
  }
}
```

- [ ] **Step 3: Commit**

```bash
git add firebase.json firestore.rules
git commit -m "feat: update hosting config and firestore rules"
```

---

## Task 3: js/firebase.js — Módulo Firebase

**Files:**
- Create: `js/firebase.js`

- [ ] **Step 1: Crear js/firebase.js**

```javascript
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.0/firebase-app.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.7.0/firebase-firestore.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.7.0/firebase-auth.js";

const firebaseConfig = {
  apiKey:            "AIzaSyA-7gmBuFQOz6zaOVT0ZzKeEhEawvmjISA",
  authDomain:        "net11-1fc08.firebaseapp.com",
  projectId:         "net11-1fc08",
  storageBucket:     "net11-1fc08.firebasestorage.app",
  messagingSenderId: "162439869863",
  appId:             "1:162439869863:web:45b2a9b3c8a5a68dc37282",
  measurementId:     "G-QFKJEKEW8S"
};

const app = initializeApp(firebaseConfig);
export const db   = getFirestore(app);
export const auth = getAuth(app);
```

- [ ] **Step 2: Commit**

```bash
git add js/firebase.js
git commit -m "feat: add firebase module"
```

---

## Task 4: js/players.js — Datos de jugadores

**Files:**
- Create: `js/players.js`

- [ ] **Step 1: Crear js/players.js**

```javascript
export const COMPETITIONS = {
  laliga:     { key: 'laliga',     label: '🇪🇸 LaLiga' },
  premier:    { key: 'premier',    label: '🏴󠁧󠁢󠁥󠁮󠁧󠁿 Premier League' },
  bundesliga: { key: 'bundesliga', label: '🇩🇪 Bundesliga' },
  seriea:     { key: 'seriea',     label: '🇮🇹 Serie A' },
  ligue1:     { key: 'ligue1',     label: '🇫🇷 Ligue 1' },
  champions:  { key: 'champions',  label: '⭐ Champions League' },
};

export const FORMATIONS = {
  "4-3-3": [
    {pos:"POR",r:1,c:3},
    {pos:"DEF",r:2,c:1},{pos:"DEF",r:2,c:2},{pos:"DEF",r:2,c:4},{pos:"DEF",r:2,c:5},
    {pos:"MED",r:3,c:2},{pos:"MED",r:3,c:3},{pos:"MED",r:3,c:4},
    {pos:"DEL",r:4,c:1},{pos:"DEL",r:4,c:3},{pos:"DEL",r:4,c:5},
  ],
  "4-4-2": [
    {pos:"POR",r:1,c:3},
    {pos:"DEF",r:2,c:1},{pos:"DEF",r:2,c:2},{pos:"DEF",r:2,c:4},{pos:"DEF",r:2,c:5},
    {pos:"MED",r:3,c:1},{pos:"MED",r:3,c:2},{pos:"MED",r:3,c:4},{pos:"MED",r:3,c:5},
    {pos:"DEL",r:4,c:2},{pos:"DEL",r:4,c:4},
  ],
  "3-5-2": [
    {pos:"POR",r:1,c:3},
    {pos:"DEF",r:2,c:2},{pos:"DEF",r:2,c:3},{pos:"DEF",r:2,c:4},
    {pos:"MED",r:3,c:1},{pos:"MED",r:3,c:2},{pos:"MED",r:3,c:3},{pos:"MED",r:3,c:4},{pos:"MED",r:3,c:5},
    {pos:"DEL",r:4,c:2},{pos:"DEL",r:4,c:4},
  ],
};

export const PLAYERS = [
  // ── LaLiga ────────────────────────────────────────────
  {id:1,  name:"T. Courtois",    team:"Real Madrid",  pos:"POR", val:12, pts:87,  competition:"laliga",     emoji:"🧤"},
  {id:2,  name:"M. Oblak",       team:"Atlético",     pos:"POR", val:11, pts:79,  competition:"laliga",     emoji:"🧤"},
  {id:3,  name:"I. Peña",        team:"Barcelona",    pos:"POR", val: 7, pts:65,  competition:"laliga",     emoji:"🧤"},
  {id:4,  name:"D. Carvajal",    team:"Real Madrid",  pos:"DEF", val:10, pts:74,  competition:"laliga",     emoji:"🛡️"},
  {id:5,  name:"F. Mendy",       team:"Real Madrid",  pos:"DEF", val: 8, pts:68,  competition:"laliga",     emoji:"🛡️"},
  {id:6,  name:"J. Gayà",        team:"Valencia",     pos:"DEF", val: 7, pts:61,  competition:"laliga",     emoji:"🛡️"},
  {id:7,  name:"R. Le Normand",  team:"Atlético",     pos:"DEF", val: 9, pts:70,  competition:"laliga",     emoji:"🛡️"},
  {id:8,  name:"Pedri",          team:"Barcelona",    pos:"MED", val:14, pts:88,  competition:"laliga",     emoji:"⚡"},
  {id:9,  name:"F. Valverde",    team:"Real Madrid",  pos:"MED", val:13, pts:85,  competition:"laliga",     emoji:"⚡"},
  {id:10, name:"T. Kroos",       team:"Real Madrid",  pos:"MED", val:12, pts:82,  competition:"laliga",     emoji:"⚡"},
  {id:11, name:"Gavi",           team:"Barcelona",    pos:"MED", val:11, pts:78,  competition:"laliga",     emoji:"⚡"},
  {id:12, name:"Vinicius Jr",    team:"Real Madrid",  pos:"DEL", val:20, pts:98,  competition:"laliga",     emoji:"🔥"},
  {id:13, name:"R. Lewandowski", team:"Barcelona",    pos:"DEL", val:18, pts:94,  competition:"laliga",     emoji:"🔥"},
  {id:14, name:"Bellingham",     team:"Real Madrid",  pos:"DEL", val:19, pts:96,  competition:"laliga",     emoji:"🔥"},
  {id:15, name:"A. Griezmann",   team:"Atlético",     pos:"DEL", val:15, pts:89,  competition:"laliga",     emoji:"🔥"},
  {id:16, name:"Rodrygo",        team:"Real Madrid",  pos:"DEL", val:14, pts:84,  competition:"laliga",     emoji:"🔥"},
  {id:17, name:"A. Yamal",       team:"Barcelona",    pos:"DEL", val:17, pts:92,  competition:"laliga",     emoji:"🔥"},
  // ── Premier League ────────────────────────────────────
  {id:20, name:"A. Raya",        team:"Arsenal",      pos:"POR", val:10, pts:80,  competition:"premier",    emoji:"🧤"},
  {id:21, name:"E. Martínez",    team:"Aston Villa",  pos:"POR", val:11, pts:82,  competition:"premier",    emoji:"🧤"},
  {id:22, name:"A. Arnold",      team:"Liverpool",    pos:"DEF", val:13, pts:86,  competition:"premier",    emoji:"🛡️"},
  {id:23, name:"K. Walker",      team:"Man City",     pos:"DEF", val:10, pts:74,  competition:"premier",    emoji:"🛡️"},
  {id:24, name:"B. White",       team:"Arsenal",      pos:"DEF", val: 9, pts:72,  competition:"premier",    emoji:"🛡️"},
  {id:25, name:"M. Salah",       team:"Liverpool",    pos:"DEL", val:20, pts:99,  competition:"premier",    emoji:"🔥"},
  {id:26, name:"E. Haaland",     team:"Man City",     pos:"DEL", val:22, pts:101, competition:"premier",    emoji:"🔥"},
  {id:27, name:"B. Saka",        team:"Arsenal",      pos:"DEL", val:18, pts:93,  competition:"premier",    emoji:"🔥"},
  {id:28, name:"P. Foden",       team:"Man City",     pos:"MED", val:16, pts:90,  competition:"premier",    emoji:"⚡"},
  {id:29, name:"M. De Bruyne",   team:"Man City",     pos:"MED", val:17, pts:88,  competition:"premier",    emoji:"⚡"},
  {id:30, name:"D. Rice",        team:"Arsenal",      pos:"MED", val:14, pts:83,  competition:"premier",    emoji:"⚡"},
  {id:31, name:"C. Palmer",      team:"Chelsea",      pos:"MED", val:16, pts:89,  competition:"premier",    emoji:"⚡"},
  {id:32, name:"O. Watkins",     team:"Aston Villa",  pos:"DEL", val:14, pts:85,  competition:"premier",    emoji:"🔥"},
  {id:33, name:"Son H-M",        team:"Tottenham",    pos:"DEL", val:14, pts:82,  competition:"premier",    emoji:"🔥"},
  // ── Champions League ──────────────────────────────────
  {id:40, name:"G. Donnarumma",  team:"PSG",          pos:"POR", val:12, pts:84,  competition:"champions",  emoji:"🧤"},
  {id:41, name:"M. Neuer",       team:"Bayern",       pos:"POR", val:10, pts:75,  competition:"champions",  emoji:"🧤"},
  {id:42, name:"T. Hernández",   team:"Bayern",       pos:"DEF", val:11, pts:78,  competition:"champions",  emoji:"🛡️"},
  {id:43, name:"R. Hakimi",      team:"PSG",          pos:"DEF", val:12, pts:80,  competition:"champions",  emoji:"🛡️"},
  {id:44, name:"A. Davies",      team:"Bayern",       pos:"DEF", val:10, pts:74,  competition:"champions",  emoji:"🛡️"},
  {id:45, name:"K. Mbappé",      team:"Real Madrid",  pos:"DEL", val:22, pts:97,  competition:"champions",  emoji:"🔥"},
  {id:46, name:"H. Kane",        team:"Bayern",       pos:"DEL", val:19, pts:95,  competition:"champions",  emoji:"🔥"},
  {id:47, name:"V. Osimhen",     team:"Napoli",       pos:"DEL", val:16, pts:88,  competition:"champions",  emoji:"🔥"},
  {id:48, name:"J. Musiala",     team:"Bayern",       pos:"MED", val:15, pts:86,  competition:"champions",  emoji:"⚡"},
  {id:49, name:"N. Barella",     team:"Inter",        pos:"MED", val:13, pts:82,  competition:"champions",  emoji:"⚡"},
  {id:50, name:"Vítinha",        team:"PSG",          pos:"MED", val:13, pts:81,  competition:"champions",  emoji:"⚡"},
  // ── Bundesliga ────────────────────────────────────────
  {id:60, name:"O. Baumann",     team:"B. München",   pos:"POR", val: 8, pts:71,  competition:"bundesliga", emoji:"🧤"},
  {id:61, name:"G. ter Stegen",  team:"Barcelona",    pos:"POR", val:10, pts:76,  competition:"bundesliga", emoji:"🧤"},
  {id:62, name:"J. Kimmich",     team:"B. München",   pos:"DEF", val:13, pts:84,  competition:"bundesliga", emoji:"🛡️"},
  {id:63, name:"D. Raum",        team:"Leipzig",      pos:"DEF", val: 9, pts:69,  competition:"bundesliga", emoji:"🛡️"},
  {id:64, name:"M. Hummels",     team:"Dortmund",     pos:"DEF", val: 8, pts:66,  competition:"bundesliga", emoji:"🛡️"},
  {id:65, name:"L. Goretzka",    team:"B. München",   pos:"MED", val:11, pts:79,  competition:"bundesliga", emoji:"⚡"},
  {id:66, name:"F. Wirtz",       team:"Leverkusen",   pos:"MED", val:18, pts:95,  competition:"bundesliga", emoji:"⚡"},
  {id:67, name:"G. Xhaka",       team:"Leverkusen",   pos:"MED", val:12, pts:80,  competition:"bundesliga", emoji:"⚡"},
  {id:68, name:"S. Gnabry",      team:"B. München",   pos:"DEL", val:13, pts:82,  competition:"bundesliga", emoji:"🔥"},
  {id:69, name:"V. Boniface",    team:"Leverkusen",   pos:"DEL", val:15, pts:87,  competition:"bundesliga", emoji:"🔥"},
  {id:70, name:"H. Füllkrug",    team:"Dortmund",     pos:"DEL", val:12, pts:78,  competition:"bundesliga", emoji:"🔥"},
  {id:71, name:"J. Beier",       team:"Hoffenheim",   pos:"DEL", val:11, pts:74,  competition:"bundesliga", emoji:"🔥"},
  // ── Serie A ───────────────────────────────────────────
  {id:80, name:"G. Donnarumma",  team:"PSG/Italia",   pos:"POR", val:11, pts:78,  competition:"seriea",     emoji:"🧤"},
  {id:81, name:"M. Maignan",     team:"AC Milan",     pos:"POR", val:10, pts:75,  competition:"seriea",     emoji:"🧤"},
  {id:82, name:"G. Di Lorenzo",  team:"Napoli",       pos:"DEF", val:10, pts:73,  competition:"seriea",     emoji:"🛡️"},
  {id:83, name:"A. Bastoni",     team:"Inter",        pos:"DEF", val:11, pts:77,  competition:"seriea",     emoji:"🛡️"},
  {id:84, name:"F. Acerbi",      team:"Inter",        pos:"DEF", val: 8, pts:65,  competition:"seriea",     emoji:"🛡️"},
  {id:85, name:"N. Barella",     team:"Inter",        pos:"MED", val:14, pts:83,  competition:"seriea",     emoji:"⚡"},
  {id:86, name:"H. Calhanoglu",  team:"Inter",        pos:"MED", val:12, pts:80,  competition:"seriea",     emoji:"⚡"},
  {id:87, name:"F. Chiesa",      team:"Juventus",     pos:"DEL", val:13, pts:79,  competition:"seriea",     emoji:"🔥"},
  {id:88, name:"L. Martinez",    team:"Inter",        pos:"DEL", val:17, pts:91,  competition:"seriea",     emoji:"🔥"},
  {id:89, name:"V. Osimhen",     team:"Napoli",       pos:"DEL", val:18, pts:93,  competition:"seriea",     emoji:"🔥"},
  {id:90, name:"R. Leão",        team:"AC Milan",     pos:"DEL", val:16, pts:88,  competition:"seriea",     emoji:"🔥"},
  {id:91, name:"P. Dybala",      team:"Roma",         pos:"DEL", val:14, pts:82,  competition:"seriea",     emoji:"🔥"},
  // ── Ligue 1 ───────────────────────────────────────────
  {id:100,name:"G. Donnarumma",  team:"PSG",          pos:"POR", val:12, pts:81,  competition:"ligue1",     emoji:"🧤"},
  {id:101,name:"B. Samba",       team:"Lens",         pos:"POR", val: 8, pts:70,  competition:"ligue1",     emoji:"🧤"},
  {id:102,name:"N. Mukiele",     team:"PSG",          pos:"DEF", val: 9, pts:68,  competition:"ligue1",     emoji:"🛡️"},
  {id:103,name:"W. Saliba",      team:"Arsenal/Fr",   pos:"DEF", val:11, pts:76,  competition:"ligue1",     emoji:"🛡️"},
  {id:104,name:"T. Hernández",   team:"AC Milan/Fr",  pos:"DEF", val:11, pts:74,  competition:"ligue1",     emoji:"🛡️"},
  {id:105,name:"Vítinha",        team:"PSG",          pos:"MED", val:13, pts:80,  competition:"ligue1",     emoji:"⚡"},
  {id:106,name:"W. Fofana",      team:"PSG",          pos:"MED", val:10, pts:72,  competition:"ligue1",     emoji:"⚡"},
  {id:107,name:"K. Mbappé",      team:"PSG/France",   pos:"DEL", val:22, pts:99,  competition:"ligue1",     emoji:"🔥"},
  {id:108,name:"O. Dembélé",     team:"PSG",          pos:"DEL", val:16, pts:87,  competition:"ligue1",     emoji:"🔥"},
  {id:109,name:"M. Thuram",      team:"Inter/Fr",     pos:"DEL", val:14, pts:83,  competition:"ligue1",     emoji:"🔥"},
  {id:110,name:"T. Weah",        team:"Juventus/Fr",  pos:"DEL", val:10, pts:68,  competition:"ligue1",     emoji:"🔥"},
];

export function getPlayer(id) {
  return PLAYERS.find(p => p.id === id);
}

export function getByCompetition(competition) {
  return PLAYERS.filter(p => p.competition === competition);
}
```

- [ ] **Step 2: Verificar en consola del navegador**

Abrir DevTools → Console y ejecutar:
```javascript
import('/js/players.js').then(m => console.log('Total jugadores:', m.PLAYERS.length));
// Esperado: "Total jugadores: 79" (aprox.)
```

- [ ] **Step 3: Commit**

```bash
git add js/players.js
git commit -m "feat: add players module with 6 competitions"
```

---

## Task 5: js/ui.js — Helpers de UI compartidos

**Files:**
- Create: `js/ui.js`

- [ ] **Step 1: Crear js/ui.js**

```javascript
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

export function updateHeader({ budget, teamCount, pts, formation }) {
  const budgetEl = document.getElementById('budget-display');
  if (budgetEl) {
    budgetEl.textContent = budget.toFixed(1) + 'M€';
    budgetEl.className = 'amount ' + (budget < 10 ? 'low' : 'ok');
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
    <div class="pc-emoji">${p.emoji}</div>
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

  const btn = card.querySelector('button');
  if (!btn.disabled) {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      inTeam ? onSell() : onBuy();
    });
  }
  return card;
}
```

- [ ] **Step 2: Commit**

```bash
git add js/ui.js
git commit -m "feat: add shared UI helpers module"
```

---

## Task 6: js/state.js — Estado del equipo por liga

**Files:**
- Create: `js/state.js`

- [ ] **Step 1: Crear js/state.js**

```javascript
import { db } from './firebase.js';
import { doc, setDoc, getDoc } from "https://www.gstatic.com/firebasejs/10.7.0/firebase-firestore.js";
import { getPlayer } from './players.js';

export function defaultTeamState(competition) {
  return {
    budget:     100,
    formation:  '4-3-3',
    team:       Array(11).fill(null),
    totalPts:   0,
    competition,
  };
}

export function calcTotalPts(teamIds) {
  return teamIds
    .filter(Boolean)
    .reduce((sum, id) => sum + (getPlayer(id)?.pts ?? 0), 0);
}

export function getLocalTeam(leagueCode) {
  try {
    const raw = localStorage.getItem(`net11_team_${leagueCode}`);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

function setLocalTeam(leagueCode, state) {
  localStorage.setItem(`net11_team_${leagueCode}`, JSON.stringify(state));
}

let _saveTimer = null;

export async function saveTeam(uid, leagueCode, teamState) {
  setLocalTeam(leagueCode, teamState);
  clearTimeout(_saveTimer);
  _saveTimer = setTimeout(async () => {
    try {
      await setDoc(
        doc(db, 'users', uid, 'leagueTeams', leagueCode),
        { ...teamState, updatedAt: new Date().toISOString() },
        { merge: true }
      );
    } catch (err) {
      console.warn('Cloud save failed:', err);
    }
  }, 1500);
}

export async function loadTeam(uid, leagueCode, competition) {
  const local = getLocalTeam(leagueCode);
  try {
    const snap = await getDoc(doc(db, 'users', uid, 'leagueTeams', leagueCode));
    if (snap.exists()) {
      const data = snap.data();
      setLocalTeam(leagueCode, data);
      return data;
    }
  } catch (err) {
    console.warn('Cloud load failed:', err);
  }
  return local ?? defaultTeamState(competition);
}
```

- [ ] **Step 2: Commit**

```bash
git add js/state.js
git commit -m "feat: add per-league team state module"
```

---

## Task 7: js/auth.js — Autenticación y perfiles

**Files:**
- Create: `js/auth.js`

- [ ] **Step 1: Crear js/auth.js**

```javascript
import { auth, db } from './firebase.js';
import {
  GoogleAuthProvider, signInWithPopup,
  createUserWithEmailAndPassword, signInWithEmailAndPassword,
  signOut, onAuthStateChanged,
} from "https://www.gstatic.com/firebasejs/10.7.0/firebase-auth.js";
import {
  doc, getDoc, setDoc, updateDoc, arrayUnion,
} from "https://www.gstatic.com/firebasejs/10.7.0/firebase-firestore.js";

export function onAuthChange(callback) {
  return onAuthStateChanged(auth, callback);
}

export function getCurrentUser() {
  return auth.currentUser;
}

export async function loginWithGoogle() {
  const provider = new GoogleAuthProvider();
  return signInWithPopup(auth, provider);
}

export async function loginWithEmail(email, password) {
  return signInWithEmailAndPassword(auth, email, password);
}

export async function registerWithEmail(email, password) {
  return createUserWithEmailAndPassword(auth, email, password);
}

export async function logout() {
  return signOut(auth);
}

export async function getUserProfile(uid) {
  const snap = await getDoc(doc(db, 'users', uid));
  return snap.exists() ? snap.data() : null;
}

export async function createUserProfile(uid, displayName, teamName) {
  await setDoc(doc(db, 'users', uid), {
    displayName,
    teamName,
    leagues:   [],
    updatedAt: new Date().toISOString(),
  });
  return { displayName, teamName, leagues: [] };
}

export async function addLeagueToProfile(uid, leagueCode) {
  await updateDoc(doc(db, 'users', uid), {
    leagues:   arrayUnion(leagueCode),
    updatedAt: new Date().toISOString(),
  });
}
```

- [ ] **Step 2: Verificar en Firebase Console**

Tras implementar el modal de login (Task 9) y arrancar la app, hacer login con Google y verificar que aparece el usuario en Firebase Console → Authentication → Users.

- [ ] **Step 3: Commit**

```bash
git add js/auth.js
git commit -m "feat: add auth module (Google + email)"
```

---

## Task 8: js/leagues.js — Sistema de ligas

**Files:**
- Create: `js/leagues.js`

- [ ] **Step 1: Crear js/leagues.js**

```javascript
import { db } from './firebase.js';
import {
  doc, setDoc, getDoc, updateDoc, arrayUnion,
} from "https://www.gstatic.com/firebasejs/10.7.0/firebase-firestore.js";

function generateCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const rand3 = () => Array.from({ length: 3 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
  return `NET-${rand3()}`;
}

export function getShareLink(code) {
  return `${location.origin}/join/${code}`;
}

export async function createLeague(adminUid, adminTeamName, name, competition) {
  const code = generateCode();
  await setDoc(doc(db, 'leagues', code), {
    name,
    competition,
    adminUid,
    members:        [adminUid],
    memberNames:    { [adminUid]: adminTeamName },
    createdAt:      new Date().toISOString(),
    currentJornada: 1,
  });
  return code;
}

export async function getLeague(code) {
  const snap = await getDoc(doc(db, 'leagues', code.toUpperCase()));
  if (!snap.exists()) return null;
  return { code: snap.id, ...snap.data() };
}

export async function joinLeague(code, uid, teamName) {
  const league = await getLeague(code);
  if (!league)                      throw new Error('Liga no encontrada');
  if (league.members.length >= 20)  throw new Error('La liga está llena (máx. 20)');
  if (league.members.includes(uid)) throw new Error('Ya eres miembro de esta liga');

  await updateDoc(doc(db, 'leagues', code.toUpperCase()), {
    members:                 arrayUnion(uid),
    [`memberNames.${uid}`]:  teamName,
  });
  return { ...league, members: [...league.members, uid] };
}
```

- [ ] **Step 2: Commit**

```bash
git add js/leagues.js
git commit -m "feat: add leagues module (create/join/invite)"
```

---

## Task 9: index.html — Refactorizar a shell

**Files:**
- Modify: `index.html`

- [ ] **Step 1: Eliminar todo el bloque `<script type="module">` al final del body**

Eliminar desde la línea `<script type="module">` hasta `</script>` (las últimas ~670 líneas de JS).

- [ ] **Step 2: Cambiar el nav tab de Firebase por Perfil**

Reemplazar el botón nav de Firebase:
```html
<!-- ANTES -->
<button class="nav-btn" data-tab="firebase" onclick="showFirebaseModal()">
  <div class="nav-icon">🔥</div>
  <div class="nav-label">Firebase</div>
  <div class="nav-dot"></div>
</button>
```
por:
```html
<!-- DESPUÉS -->
<button class="nav-btn" data-tab="perfil" onclick="switchTab('perfil',this)">
  <div class="nav-icon">👤</div>
  <div class="nav-label">Perfil</div>
  <div class="nav-dot"></div>
</button>
```

- [ ] **Step 3: Eliminar el modal de Firebase (`#firebase-modal`) y el banner de instalación**

Eliminar el bloque `<!-- FIREBASE MODAL -->` y el bloque `<!-- INSTALL BANNER -->` del HTML. El banner de instalación se generará dinámicamente desde app.js.

- [ ] **Step 4: Añadir modal de login al final del `<body>` (antes del cierre)**

```html
<!-- MODAL LOGIN -->
<div class="modal-overlay hidden" id="login-modal">
  <div class="modal-sheet" style="max-height:90vh;overflow-y:auto">
    <div class="modal-handle"></div>
    <div class="modal-title">👋 Bienvenido a <span style="color:var(--accent)">Net11</span></div>
    <div class="modal-sub">Inicia sesión para guardar tu equipo y competir con amigos.</div>

    <button id="btn-google-login" style="
      width:100%;padding:13px;border-radius:var(--r);
      background:#fff;color:#1a1a1a;border:none;
      font-weight:700;font-size:15px;cursor:pointer;
      font-family:var(--font-body);display:flex;align-items:center;
      justify-content:center;gap:10px;margin-bottom:14px">
      <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" width="20" height="20" alt="Google">
      Continuar con Google
    </button>

    <div style="text-align:center;color:var(--muted);font-size:12px;margin-bottom:14px">— o con email —</div>

    <input id="auth-email" type="email" class="search-box" placeholder="Email" style="margin-bottom:8px">
    <input id="auth-password" type="password" class="search-box" placeholder="Contraseña" style="margin-bottom:8px">
    <div id="auth-error" style="color:var(--danger);font-size:12px;min-height:18px;margin-bottom:6px"></div>

    <div style="display:flex;gap:8px">
      <button id="btn-email-login" class="modal-close" style="flex:1;background:var(--bg4);color:var(--text)">Entrar</button>
      <button id="btn-email-register" class="modal-close" style="flex:1">Registrarse</button>
    </div>
  </div>
</div>

<!-- MODAL ONBOARDING (nombre de equipo) -->
<div class="modal-overlay hidden" id="onboarding-modal">
  <div class="modal-sheet">
    <div class="modal-handle"></div>
    <div class="modal-title">⚽ Tu equipo</div>
    <div class="modal-sub">¿Cómo se llama tu equipo? Esto aparecerá en el ranking.</div>
    <input id="onboarding-team-name" type="text" class="search-box"
      placeholder="Ej: Los Galácticos" maxlength="24" style="margin-bottom:8px">
    <div id="onboarding-error" style="color:var(--danger);font-size:12px;min-height:18px;margin-bottom:6px"></div>
    <button id="btn-onboarding-save" class="modal-close">Guardar y empezar ✓</button>
  </div>
</div>
```

- [ ] **Step 5: Añadir el script module al final del `<body>`**

```html
<script type="module" src="js/app.js"></script>
```

- [ ] **Step 6: Verificar que index.html carga sin errores JS**

Abrir en navegador. La consola no debe tener errores. La UI debe mostrar el shell (header + nav) aunque los tabs estén vacíos por ahora.

- [ ] **Step 7: Commit**

```bash
git add index.html
git commit -m "feat: refactor index.html to shell, add auth modals"
```

---

## Task 10: js/app.js — Punto de entrada

**Files:**
- Create: `js/app.js`

- [ ] **Step 1: Crear js/app.js**

```javascript
import { onAuthChange, getCurrentUser, loginWithGoogle, loginWithEmail, registerWithEmail, getUserProfile, createUserProfile, addLeagueToProfile } from './auth.js';
import { loadTeam, defaultTeamState } from './state.js';
import { getLeague, joinLeague } from './leagues.js';
import { showToast } from './ui.js';
import { render as renderEquipo }  from './tabs/equipo.js';
import { render as renderMercado } from './tabs/mercado.js';
import { render as renderRanking } from './tabs/ranking.js';
import { render as renderJornada } from './tabs/jornada.js';
import { render as renderPerfil }  from './tabs/perfil.js';

// ── Contexto global ────────────────────────────────────
window.NET11 = {
  ctx: { user: null, profile: null, league: null, teamState: null },
  activeSlot: null,
  refresh: () => renderCurrentTab(),
  switchTab: (tab) => {
    currentTab = tab;
    document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
    const btn = document.querySelector(`[data-tab="${tab}"]`);
    if (btn) btn.classList.add('active');
    renderCurrentTab();
  },
};

let currentTab = 'equipo';
let rankingUnsub = null;

// ── Router de tabs ─────────────────────────────────────
function renderCurrentTab() {
  if (rankingUnsub) { rankingUnsub(); rankingUnsub = null; }
  const c = document.getElementById('content');
  c.innerHTML = '';
  const wrap = document.createElement('div');
  wrap.className = 'fade-in';
  const ctx = window.NET11.ctx;

  if      (currentTab === 'equipo')  renderEquipo(wrap, ctx);
  else if (currentTab === 'mercado') renderMercado(wrap, ctx);
  else if (currentTab === 'ranking') { rankingUnsub = renderRanking(wrap, ctx); }
  else if (currentTab === 'jornada') renderJornada(wrap, ctx);
  else if (currentTab === 'perfil')  renderPerfil(wrap, ctx);

  c.appendChild(wrap);
}

// Exponer switchTab globalmente para el onclick del nav
window.switchTab = (tab, btn) => {
  currentTab = tab;
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
  if (btn) btn.classList.add('active');
  renderCurrentTab();
};

// ── Auth modals ────────────────────────────────────────
function showLoginModal() {
  document.getElementById('login-modal').classList.remove('hidden');
}
function hideLoginModal() {
  document.getElementById('login-modal').classList.add('hidden');
}
function showOnboardingModal() {
  document.getElementById('onboarding-modal').classList.remove('hidden');
}
function hideOnboardingModal() {
  document.getElementById('onboarding-modal').classList.add('hidden');
}

document.getElementById('btn-google-login').addEventListener('click', async () => {
  try {
    await loginWithGoogle();
  } catch (err) {
    document.getElementById('auth-error').textContent = err.message;
  }
});

document.getElementById('btn-email-login').addEventListener('click', async () => {
  const email = document.getElementById('auth-email').value.trim();
  const pass  = document.getElementById('auth-password').value;
  try {
    await loginWithEmail(email, pass);
  } catch (err) {
    document.getElementById('auth-error').textContent = 'Email o contraseña incorrectos';
  }
});

document.getElementById('btn-email-register').addEventListener('click', async () => {
  const email = document.getElementById('auth-email').value.trim();
  const pass  = document.getElementById('auth-password').value;
  if (pass.length < 6) {
    document.getElementById('auth-error').textContent = 'La contraseña debe tener al menos 6 caracteres';
    return;
  }
  try {
    await registerWithEmail(email, pass);
  } catch (err) {
    document.getElementById('auth-error').textContent = 'Error al registrar: ' + err.message;
  }
});

document.getElementById('btn-onboarding-save').addEventListener('click', async () => {
  const name = document.getElementById('onboarding-team-name').value.trim();
  if (!name) {
    document.getElementById('onboarding-error').textContent = 'Introduce un nombre para tu equipo';
    return;
  }
  const user = getCurrentUser();
  try {
    const profile = await createUserProfile(user.uid, user.displayName || user.email, name);
    window.NET11.ctx.profile = profile;
    hideOnboardingModal();
    renderCurrentTab();
    showToast('¡Bienvenido a Net11! 🎉');
  } catch (err) {
    document.getElementById('onboarding-error').textContent = 'Error al guardar. Inténtalo de nuevo.';
  }
});

// ── /join/ URL handling ────────────────────────────────
function getJoinCodeFromUrl() {
  const match = window.location.pathname.match(/^\/join\/([A-Z0-9-]+)$/i);
  return match ? match[1].toUpperCase() : null;
}

async function handleJoinFromUrl(code) {
  const user    = getCurrentUser();
  const profile = window.NET11.ctx.profile;
  if (!user || !profile) return;
  try {
    const league = await joinLeague(code, user.uid, profile.teamName);
    await addLeagueToProfile(user.uid, code);
    window.NET11.ctx.league    = league;
    window.NET11.ctx.teamState = defaultTeamState(league.competition);
    window.history.replaceState({}, '', '/');
    showToast(`✅ Te uniste a "${league.name}"`);
    renderCurrentTab();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

// ── Auth state change ──────────────────────────────────
onAuthChange(async (user) => {
  window.NET11.ctx.user = user;

  if (!user) {
    window.NET11.ctx = { user: null, profile: null, league: null, teamState: null };
    showLoginModal();
    renderCurrentTab();
    return;
  }

  hideLoginModal();
  const profile = await getUserProfile(user.uid);

  if (!profile) {
    showOnboardingModal();
    return;
  }

  window.NET11.ctx.profile = profile;

  // Cargar liga activa (primera de la lista si hay)
  if (profile.leagues && profile.leagues.length > 0) {
    const leagueCode = profile.leagues[0];
    const league     = await getLeague(leagueCode);
    if (league) {
      window.NET11.ctx.league    = league;
      window.NET11.ctx.teamState = await loadTeam(user.uid, leagueCode, league.competition);
    }
  }

  // Manejar link /join/
  const joinCode = getJoinCodeFromUrl();
  if (joinCode) {
    await handleJoinFromUrl(joinCode);
    return;
  }

  renderCurrentTab();
  showToast('☁️ Sesión activa', 'success');
});

// ── PWA install banner ─────────────────────────────────
let _deferredInstall = null;
window.addEventListener('beforeinstallprompt', e => {
  e.preventDefault();
  _deferredInstall = e;
  const banner = document.createElement('div');
  banner.id = 'install-banner';
  banner.className = 'visible';
  banner.innerHTML = `
    <div class="ib-text">
      <strong>📲 Instalar Net11</strong>
      <span>Añade la app a tu pantalla de inicio</span>
    </div>
    <button class="ib-btn" id="btn-install-pwa">Instalar</button>
    <button class="ib-close" id="btn-install-close">✕</button>`;
  document.body.appendChild(banner);
  document.getElementById('btn-install-pwa').onclick = () => {
    _deferredInstall.prompt();
    _deferredInstall.userChoice.then(() => { _deferredInstall = null; banner.remove(); });
  };
  document.getElementById('btn-install-close').onclick = () => banner.remove();
});

// ── Service Worker ─────────────────────────────────────
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(console.warn);
  });
}

// ── Render inicial ─────────────────────────────────────
renderCurrentTab();
```

- [ ] **Step 2: Verificar arranque**

Abrir la app en el navegador. Debe mostrar:
- El modal de login si no hay sesión
- El shell con header y nav
- Sin errores de consola

- [ ] **Step 3: Commit**

```bash
git add js/app.js
git commit -m "feat: add app entry point with auth flow and tab router"
```

---

## Task 11: js/tabs/equipo.js — Tab Mi Equipo

**Files:**
- Create: `js/tabs/equipo.js`

- [ ] **Step 1: Crear js/tabs/equipo.js**

```javascript
import { FORMATIONS, getPlayer, getByCompetition } from '../players.js';
import { showToast, updateHeader, buildPlayerCard } from '../ui.js';
import { saveTeam, calcTotalPts } from '../state.js';

export function render(wrap, ctx) {
  const { user, league, teamState } = ctx;

  if (!user) {
    wrap.innerHTML = `<div class="plantilla-empty" style="margin:24px 16px">Inicia sesión para gestionar tu equipo.</div>`;
    return;
  }
  if (!league || !teamState) {
    wrap.innerHTML = `<div class="plantilla-empty" style="margin:24px 16px">Únete o crea una liga desde la pestaña <strong>👤 Perfil</strong> para empezar a fichar.</div>`;
    return;
  }

  const { team, budget, formation, competition } = teamState;
  const slots = FORMATIONS[formation];

  updateHeader({
    budget,
    teamCount: team.filter(Boolean).length,
    pts: calcTotalPts(team),
    formation,
  });

  // ── Formation bar ──
  const titleEl = document.createElement('div');
  titleEl.innerHTML = `<div class="sec-title">👕 MI <span>EQUIPO</span></div>`;
  wrap.appendChild(titleEl);

  const bar = document.createElement('div');
  bar.className = 'formation-bar';
  Object.keys(FORMATIONS).forEach(f => {
    const btn = document.createElement('button');
    btn.className = 'fmbtn' + (formation === f ? ' active' : '');
    btn.textContent = f;
    btn.onclick = async () => {
      const newState = { ...teamState, formation: f, team: Array(11).fill(null), totalPts: 0 };
      ctx.teamState = newState;
      window.NET11.ctx.teamState = newState;
      await saveTeam(user.uid, league.code, newState);
      window.NET11.refresh();
    };
    bar.appendChild(btn);
  });
  wrap.appendChild(bar);

  // ── Pitch ──
  const pitchWrap = document.createElement('div');
  pitchWrap.className = 'pitch-wrap';
  pitchWrap.innerHTML = `
    <svg class="field-lines" viewBox="0 0 300 220" preserveAspectRatio="none"
      xmlns="http://www.w3.org/2000/svg"
      style="position:absolute;inset:0;width:100%;height:100%;opacity:0.07">
      <rect x="30" y="10" width="240" height="200" rx="2" fill="none" stroke="white" stroke-width="1"/>
      <line x1="30" y1="110" x2="270" y2="110" stroke="white" stroke-width="1"/>
      <circle cx="150" cy="110" r="28" fill="none" stroke="white" stroke-width="1"/>
      <rect x="100" y="10" width="100" height="30" fill="none" stroke="white" stroke-width="1"/>
      <rect x="100" y="180" width="100" height="30" fill="none" stroke="white" stroke-width="1"/>
    </svg>`;

  const grid = document.createElement('div');
  grid.className = 'pitch-grid';
  const POS_COLOR = { POR:'var(--por)', DEF:'var(--def)', MED:'var(--med)', DEL:'var(--del)' };

  slots.forEach((slot, idx) => {
    const player   = team[idx] ? getPlayer(team[idx]) : null;
    const posColor = POS_COLOR[slot.pos];
    const slotEl   = document.createElement('div');
    slotEl.className = 'slot';
    slotEl.style.gridColumn = slot.c;
    slotEl.style.gridRow    = slot.r;

    if (player) {
      slotEl.innerHTML = `
        <div class="slot-circle filled"
          style="color:${posColor};border-color:${posColor};background:${posColor}15;box-shadow:0 0 14px ${posColor}33">
          ${player.emoji}
        </div>
        <div class="slot-name">${player.name.split(' ').pop()}</div>
        <div class="slot-pts" style="color:${posColor}">${player.pts}p</div>`;
      slotEl.onclick = () => removePlayer(idx, ctx);
    } else {
      const isActive = window.NET11.activeSlot?.idx === idx;
      slotEl.innerHTML = `
        <div class="slot-circle empty ${isActive ? 'active-select' : ''}"
          style="${isActive ? 'border-color:var(--accent);color:var(--accent)' : ''}">
          ${isActive ? '★' : '+'}
        </div>
        <div class="slot-name" style="color:${posColor}88">${slot.pos}</div>`;
      slotEl.onclick = () => {
        window.NET11.activeSlot = { pos: slot.pos, idx };
        window.NET11.switchTab('mercado');
        showToast(`Selecciona un ${slot.pos} en el mercado`, 'warn');
      };
    }
    grid.appendChild(slotEl);
  });

  pitchWrap.appendChild(grid);
  wrap.appendChild(pitchWrap);

  // ── Plantilla list ──
  const plantTitle = document.createElement('div');
  plantTitle.className = 'sec-title';
  plantTitle.innerHTML = '📋 PLANTILLA <span>COMPLETA</span>';
  wrap.appendChild(plantTitle);

  const plantilla = document.createElement('div');
  plantilla.className = 'plantilla';

  const activePlayers = team.map((id, idx) => id ? { player: getPlayer(id), idx } : null).filter(Boolean);

  if (activePlayers.length === 0) {
    plantilla.innerHTML = `<div class="plantilla-empty">Toca un hueco en el campo<br>o ve al <strong>Mercado</strong> para fichar.<br><br>💡 Presupuesto: <strong>${budget}M€</strong></div>`;
  } else {
    activePlayers.forEach(({ player, idx }) => {
      const card = buildPlayerCard(player, true, {
        onSell: () => removePlayer(idx, ctx),
        canBuy: false,
        alreadyOwned: false,
      });
      plantilla.appendChild(card);
    });
  }
  wrap.appendChild(plantilla);
}

async function removePlayer(idx, ctx) {
  const { user, league, teamState } = ctx;
  const pid = teamState.team[idx];
  if (!pid) return;
  const p = getPlayer(pid);
  const newTeam = [...teamState.team];
  newTeam[idx] = null;
  const newState = {
    ...teamState,
    team:     newTeam,
    budget:   +(teamState.budget + p.val).toFixed(1),
    totalPts: calcTotalPts(newTeam),
  };
  window.NET11.ctx.teamState = newState;
  ctx.teamState = newState;
  await saveTeam(user.uid, league.code, newState);
  showToast(`🔴 ${p.name} vendido · +${p.val}M€`, 'error');
  window.NET11.refresh();
}

export async function buyPlayer(pid, ctx) {
  const { user, league, teamState } = ctx;
  const p = getPlayer(pid);
  if (!p) return;

  const teamIds = new Set(teamState.team.filter(Boolean));
  if (teamIds.has(pid)) return showToast('Ya está en tu equipo', 'warn');
  if (teamState.budget < p.val) return showToast('¡Sin presupuesto suficiente!', 'error');

  const slots  = FORMATIONS[teamState.formation];
  const active = window.NET11.activeSlot;
  let targetIdx = -1;

  if (active) {
    if (active.pos !== p.pos) return showToast(`Solo puedes poner un ${active.pos} ahí`, 'error');
    targetIdx = active.idx;
  } else {
    targetIdx = slots.findIndex((s, i) => s.pos === p.pos && !teamState.team[i]);
  }

  if (targetIdx === -1) return showToast(`No hay hueco de ${p.pos} libre`, 'error');

  const newTeam = [...teamState.team];
  newTeam[targetIdx] = pid;
  const newState = {
    ...teamState,
    team:     newTeam,
    budget:   +(teamState.budget - p.val).toFixed(1),
    totalPts: calcTotalPts(newTeam),
  };
  window.NET11.ctx.teamState = newState;
  ctx.teamState = newState;
  window.NET11.activeSlot = null;
  await saveTeam(user.uid, league.code, newState);
  showToast(`✅ ${p.name} fichado · -${p.val}M€`);
  window.NET11.switchTab('equipo');
}
```

- [ ] **Step 2: Verificar tab Equipo**

Hacer login, unirse a una liga (desde Perfil), volver a Equipo. Debe mostrar el campo vacío con huecos según la formación.

- [ ] **Step 3: Commit**

```bash
git add js/tabs/equipo.js
git commit -m "feat: add equipo tab"
```

---

## Task 12: js/tabs/mercado.js — Tab Mercado

**Files:**
- Create: `js/tabs/mercado.js`

- [ ] **Step 1: Crear js/tabs/mercado.js**

```javascript
import { getByCompetition } from '../players.js';
import { showToast, buildPlayerCard } from '../ui.js';
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
  const teamIds       = new Set(teamState.team.filter(Boolean));

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

  players.forEach(p => {
    const alreadyOwned = teamIds.has(p.id);
    const canBuy       = !alreadyOwned && teamState.budget >= p.val;
    const card = buildPlayerCard(p, false, {
      onBuy:        () => buyPlayer(p.id, ctx),
      onSell:       () => {},
      canBuy,
      alreadyOwned,
    });
    listWrap.appendChild(card);
  });
}
```

- [ ] **Step 2: Verificar mercado**

Abrir tab Mercado. Debe mostrar jugadores de la competición de tu liga activa. El filtro por posición debe funcionar. Al pulsar "Fichar" debe añadir el jugador al equipo.

- [ ] **Step 3: Commit**

```bash
git add js/tabs/mercado.js
git commit -m "feat: add mercado tab filtered by league competition"
```

---

## Task 13: js/tabs/ranking.js — Ranking en tiempo real

**Files:**
- Create: `js/tabs/ranking.js`

- [ ] **Step 1: Crear js/tabs/ranking.js**

```javascript
import {
  doc, getDoc, onSnapshot,
} from "https://www.gstatic.com/firebasejs/10.7.0/firebase-firestore.js";
import { db } from '../firebase.js';
import { getLeague } from '../leagues.js';
import { showToast } from '../ui.js';
import { addLeagueToProfile } from '../auth.js';
import { loadTeam, defaultTeamState } from '../state.js';

export function render(wrap, ctx) {
  const { user, profile, league } = ctx;

  if (!user || !profile) {
    wrap.innerHTML = `<div class="plantilla-empty" style="margin:24px 16px">Inicia sesión para ver el ranking.</div>`;
    return null;
  }

  if (!league) {
    renderNoLeague(wrap, ctx);
    return null;
  }

  return renderLeagueRanking(wrap, ctx);
}

function renderNoLeague(wrap, ctx) {
  wrap.innerHTML = `
    <div class="sec-title">🏆 <span>RANKING</span></div>
    <div class="plantilla-empty" style="margin:16px">
      No estás en ninguna liga todavía.<br>Crea o únete a una desde <strong>👤 Perfil</strong>.
    </div>`;
}

function renderLeagueRanking(wrap, ctx) {
  const { user, profile, league } = ctx;

  // ── Liga selector ──
  const titleWrap = document.createElement('div');
  titleWrap.innerHTML = `<div class="sec-title">🏆 <span>RANKING</span></div>`;
  wrap.appendChild(titleWrap);

  if (profile.leagues && profile.leagues.length > 1) {
    const sel = document.createElement('div');
    sel.style.cssText = 'padding:0 16px 10px;display:flex;gap:6px;overflow-x:auto;scrollbar-width:none';
    profile.leagues.forEach(code => {
      const btn = document.createElement('button');
      btn.className = `filter-chip${code === league.code ? ' active-all' : ''}`;
      btn.textContent = code;
      btn.onclick = async () => {
        const newLeague = await getLeague(code);
        if (!newLeague) return;
        window.NET11.ctx.league    = newLeague;
        window.NET11.ctx.teamState = await loadTeam(user.uid, code, newLeague.competition);
        window.NET11.refresh();
      };
      sel.appendChild(btn);
    });
    wrap.appendChild(sel);
  }

  // ── Hero (mi posición) ──
  const hero = document.createElement('div');
  hero.className = 'ranking-hero';
  hero.innerHTML = `
    <div class="rh-label">Cargando ranking...</div>
    <div class="rh-pos" id="rh-my-pos">—</div>
    <div class="rh-pts" id="rh-my-pts">${profile.teamName}</div>`;
  wrap.appendChild(hero);

  // ── Indicador live ──
  const liveEl = document.createElement('div');
  liveEl.style.cssText = 'display:flex;align-items:center;gap:6px;padding:0 18px 8px;font-size:11px;color:var(--muted)';
  liveEl.innerHTML = `<div style="width:6px;height:6px;border-radius:50%;background:var(--accent);animation:pulse-slot 1.5s infinite"></div> En vivo`;
  wrap.appendChild(liveEl);

  // ── Lista ──
  const list = document.createElement('div');
  list.style.padding = '0 16px';
  wrap.appendChild(list);

  // Escuchar cambios en tiempo real de todos los miembros
  const unsubs = league.members.map(uid => {
    return onSnapshot(
      doc(db, 'users', uid, 'leagueTeams', league.code),
      () => refreshRanking(league, user.uid, profile.teamName, list, hero)
    );
  });

  // Render inicial
  refreshRanking(league, user.uid, profile.teamName, list, hero);

  // Retornar función para cancelar subscripciones
  return () => unsubs.forEach(u => u());
}

async function refreshRanking(league, myUid, myTeamName, listEl, heroEl) {
  const members = league.members;

  const snapshots = await Promise.all(
    members.map(async uid => {
      try {
        const snap = await getDoc(doc(db, 'users', uid, 'leagueTeams', league.code));
        return { uid, data: snap.exists() ? snap.data() : null };
      } catch { return { uid, data: null }; }
    })
  );

  const entries = snapshots
    .map(({ uid, data }) => ({
      uid,
      teamName: league.memberNames[uid] || '—',
      totalPts: data?.totalPts ?? 0,
    }))
    .sort((a, b) => b.totalPts - a.totalPts);

  const myPos = entries.findIndex(e => e.uid === myUid) + 1;
  const myPts = entries.find(e => e.uid === myUid)?.totalPts ?? 0;

  const rpos = heroEl.querySelector('#rh-my-pos');
  const rpts = heroEl.querySelector('#rh-my-pts');
  if (rpos) rpos.textContent = `#${myPos}`;
  if (rpts) rpts.textContent = `${myPts.toLocaleString()} pts · ${myTeamName}`;
  heroEl.querySelector('.rh-label').textContent = league.name;

  listEl.innerHTML = '';
  const medals = ['🥇', '🥈', '🥉'];
  entries.forEach((e, i) => {
    const item = document.createElement('div');
    item.className = `rank-item${e.uid === myUid ? ' me' : ''}`;
    item.innerHTML = `
      <div class="rank-num" style="color:${i===0?'var(--gold)':i===1?'#aaa':i===2?'#cd7f32':'var(--muted)'}">
        ${medals[i] || i + 1}
      </div>
      <div class="rank-info">
        <div class="rank-user ${e.uid === myUid ? 'me-label' : ''}">${e.teamName}${e.uid === myUid ? ' <small style="color:var(--muted);font-size:11px">(Tú)</small>' : ''}</div>
        <div class="rank-team">${e.uid.slice(0, 8)}…</div>
      </div>
      <div class="rank-pts">${e.totalPts.toLocaleString()}</div>`;
    listEl.appendChild(item);
  });
}
```

- [ ] **Step 2: Verificar ranking en tiempo real**

Abrir la app con dos cuentas (una en móvil, otra en PC). Ambas en la misma liga. Cuando una ficha un jugador y el totalPts cambia, la otra debe ver el ranking actualizado en menos de 3 segundos sin recargar.

- [ ] **Step 3: Commit**

```bash
git add js/tabs/ranking.js
git commit -m "feat: add real-time ranking tab with onSnapshot"
```

---

## Task 14: js/tabs/jornada.js — Tab Jornada

**Files:**
- Create: `js/tabs/jornada.js`

- [ ] **Step 1: Crear js/tabs/jornada.js**

```javascript
import { getPlayer } from '../players.js';

export function render(wrap, ctx) {
  const { user, league, teamState } = ctx;

  if (!user || !league || !teamState) {
    wrap.innerHTML = `<div class="plantilla-empty" style="margin:24px 16px">Únete a una liga para ver la jornada.</div>`;
    return;
  }

  const jornada = league.currentJornada ?? 1;
  const players = teamState.team
    .filter(Boolean)
    .map(id => getPlayer(id))
    .filter(Boolean);

  wrap.innerHTML = `<div class="sec-title">📅 JORNADA <span>${jornada}</span></div>`;

  const jh = document.createElement('div');
  jh.className = 'jornada-header';
  const totalPts = teamState.totalPts ?? 0;
  jh.innerHTML = `
    <div class="jh-info">
      <div class="jh-label">Temporada 24/25</div>
      <div class="jh-num">Jornada ${jornada}</div>
    </div>
    <div class="jh-pts">
      <div class="jh-total">${players.length ? totalPts : '--'}</div>
      <div class="jh-sub">puntos acumulados</div>
    </div>`;
  wrap.appendChild(jh);

  const list = document.createElement('div');
  list.style.padding = '0 16px';

  if (players.length === 0) {
    list.innerHTML = '<div class="plantilla-empty">Ficha jugadores para ver sus puntuaciones.</div>';
  } else {
    const POS_COLOR = { POR:'var(--por)', DEF:'var(--def)', MED:'var(--med)', DEL:'var(--del)' };
    const maxPts    = Math.max(...players.map(p => p.pts));

    [...players].sort((a, b) => b.pts - a.pts).forEach(p => {
      const pct = Math.round((p.pts / maxPts) * 100);
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
        <div class="pb-val" style="color:${p.pts>=80?'var(--accent)':p.pts>=65?'var(--gold)':'var(--danger)'}">${p.pts}</div>`;
      list.appendChild(bar);
    });
  }

  wrap.appendChild(list);

  const note = document.createElement('p');
  note.style.cssText = 'text-align:center;color:var(--muted);font-size:11px;padding:12px 16px';
  note.textContent = 'Los puntos se actualizarán con datos reales en la Fase B.';
  wrap.appendChild(note);
}
```

- [ ] **Step 2: Commit**

```bash
git add js/tabs/jornada.js
git commit -m "feat: add jornada tab"
```

---

## Task 15: js/tabs/perfil.js — Tab Perfil + Gestión de ligas

**Files:**
- Create: `js/tabs/perfil.js`

- [ ] **Step 1: Crear js/tabs/perfil.js**

```javascript
import { logout, addLeagueToProfile } from '../auth.js';
import { createLeague, joinLeague, getLeague, getShareLink } from '../leagues.js';
import { showToast } from '../ui.js';
import { loadTeam, defaultTeamState } from '../state.js';
import { COMPETITIONS } from '../players.js';

export function render(wrap, ctx) {
  const { user, profile, league } = ctx;

  if (!user || !profile) {
    wrap.innerHTML = `<div class="plantilla-empty" style="margin:24px 16px">Inicia sesión para ver tu perfil.</div>`;
    return;
  }

  wrap.innerHTML = `<div class="sec-title">👤 <span>PERFIL</span></div>`;

  // ── Info usuario ──
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

  // ── Mis ligas ──
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

  // ── Acciones ──
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

// ── Modal crear liga ──────────────────────────────────
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
      const code    = await createLeague(user.uid, profile.teamName, name, selectedComp);
      const league  = await getLeague(code);
      await addLeagueToProfile(user.uid, code);
      ctx.profile.leagues = [...(ctx.profile.leagues || []), code];
      window.NET11.ctx.profile    = ctx.profile;
      window.NET11.ctx.league     = league;
      window.NET11.ctx.teamState  = { budget: 100, formation: '4-3-3', team: Array(11).fill(null), totalPts: 0, competition: selectedComp };
      overlay.remove();
      showToast(`✅ Liga "${name}" creada · Código: ${code}`);
      window.NET11.refresh();
    } catch (err) {
      overlay.querySelector('#cl-error').textContent = 'Error: ' + err.message;
    }
  };

  document.body.appendChild(overlay);
}

// ── Modal unirse a liga ───────────────────────────────
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
```

- [ ] **Step 2: Verificar flujo completo de liga**

1. Abrir tab Perfil
2. Pulsar "Crear nueva liga" → elegir nombre + competición → crear
3. Copiar el código
4. Abrir la app en otro navegador/cuenta → Perfil → "Unirse con código" → pegar código
5. Ambas cuentas deben aparecer en el ranking de esa liga

- [ ] **Step 3: Commit**

```bash
git add js/tabs/perfil.js
git commit -m "feat: add perfil tab with league create/join/share"
```

---

## Task 16: admin.html + js/admin.js — Panel de administración

**Files:**
- Create: `admin.html`
- Create: `js/admin.js`

- [ ] **Step 1: Obtener tu UID de administrador**

Hacer login en la app, abrir DevTools → Console y ejecutar:
```javascript
firebase.auth().currentUser?.uid
// O bien, desde la app ya cargada con app.js:
NET11.ctx.user?.uid
```
Copiar el UID resultante (será algo como `abc123xyz...`).

- [ ] **Step 2: Actualizar firestore.rules con tu UID real**

En `firestore.rules`, reemplazar `REPLACE_WITH_YOUR_ADMIN_UID` con el UID copiado:
```
allow write: if request.auth != null
             && request.auth.uid in ['TU_UID_REAL_AQUI'];
```

- [ ] **Step 3: Crear js/admin.js**

```javascript
import { auth, db } from './firebase.js';
import {
  onAuthStateChanged, GoogleAuthProvider, signInWithPopup,
} from "https://www.gstatic.com/firebasejs/10.7.0/firebase-auth.js";
import {
  doc, setDoc, getDoc, collection, getDocs,
} from "https://www.gstatic.com/firebasejs/10.7.0/firebase-firestore.js";
import { PLAYERS } from './players.js';

const ADMIN_UIDS = ['TU_UID_REAL_AQUI']; // Reemplazar igual que en firestore.rules

let currentJornada = 1;
let jornadaPts = {};   // { playerId: pts }

onAuthStateChanged(auth, async user => {
  if (!user || !ADMIN_UIDS.includes(user.uid)) {
    document.getElementById('admin-content').innerHTML =
      `<div style="color:#ff1744;padding:24px;text-align:center">⛔ Acceso denegado. Esta página es solo para administradores.</div>`;
    return;
  }
  document.getElementById('admin-user').textContent = user.email || user.uid;
  loadJornada(currentJornada);
});

async function loadJornada(num) {
  currentJornada = num;
  document.getElementById('jornada-num').textContent = num;
  try {
    const snap = await getDoc(doc(db, 'jornadas', String(num)));
    jornadaPts = snap.exists() ? (snap.data().players || {}) : {};
  } catch { jornadaPts = {}; }
  renderPlayerTable();
}

function renderPlayerTable() {
  const tbody = document.getElementById('players-tbody');
  tbody.innerHTML = '';
  PLAYERS.forEach(p => {
    const tr = document.createElement('tr');
    const currentPts = jornadaPts[p.id] ?? p.pts;
    tr.innerHTML = `
      <td>${p.emoji} ${p.name}</td>
      <td>${p.team}</td>
      <td><span style="font-size:10px;padding:2px 6px;border-radius:4px;background:rgba(255,255,255,0.08)">${p.pos}</span></td>
      <td><span style="font-size:10px;color:var(--muted)">${p.competition}</span></td>
      <td><input type="number" min="0" max="50" value="${currentPts}"
        style="width:60px;background:var(--bg3);border:1px solid var(--border);border-radius:4px;
               color:var(--text);padding:4px 6px;font-family:var(--font-body)"
        onchange="updatePts(${p.id}, this.value)"></td>`;
    tbody.appendChild(tr);
  });
}

window.updatePts = (id, val) => {
  jornadaPts[id] = parseInt(val, 10) || 0;
};

window.changeJornada = (delta) => {
  const next = Math.max(1, currentJornada + delta);
  loadJornada(next);
};

window.publishJornada = async () => {
  const btn = document.getElementById('btn-publish');
  btn.disabled = true;
  btn.textContent = 'Publicando...';
  try {
    // 1. Guardar puntos de la jornada
    await setDoc(doc(db, 'jornadas', String(currentJornada)), {
      published: true,
      date:      new Date().toISOString(),
      players:   jornadaPts,
    });

    // 2. Recalcular totalPts de todos los usuarios en todas sus ligas
    const usersSnap = await getDocs(collection(db, 'users'));
    let updated = 0;
    for (const userDoc of usersSnap.docs) {
      const profile  = userDoc.data();
      const leagues  = profile.leagues || [];
      for (const leagueCode of leagues) {
        try {
          const teamSnap = await getDoc(doc(db, 'users', userDoc.id, 'leagueTeams', leagueCode));
          if (!teamSnap.exists()) continue;
          const teamData = teamSnap.data();
          const team     = teamData.team || [];
          const totalPts = team.filter(Boolean).reduce((sum, pid) => sum + (jornadaPts[pid] ?? 0), 0);
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

// Login rápido para admin
document.getElementById('btn-admin-login')?.addEventListener('click', async () => {
  await signInWithPopup(auth, new GoogleAuthProvider());
});
```

- [ ] **Step 4: Crear admin.html**

```html
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1"/>
  <title>Net11 · Admin</title>
  <link rel="preconnect" href="https://fonts.googleapis.com"/>
  <link href="https://fonts.googleapis.com/css2?family=Anton&family=Outfit:wght@300;400;500;600;700&display=swap" rel="stylesheet"/>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    :root {
      --accent:#00e676; --danger:#ff1744; --gold:#ffd600;
      --bg:#080c10; --bg2:#0d1117; --bg3:#141c24; --bg4:#1c2733;
      --border:rgba(255,255,255,0.07); --text:#e8edf2; --muted:#5a6a7a;
      --font-head:'Anton',sans-serif; --font-body:'Outfit',sans-serif;
    }
    body { background:var(--bg); color:var(--text); font-family:var(--font-body); padding:20px; }
    h1 { font-family:var(--font-head); font-size:28px; color:var(--accent); margin-bottom:4px; }
    .subtitle { color:var(--muted); font-size:13px; margin-bottom:24px; }
    .card { background:var(--bg3); border:1px solid var(--border); border-radius:14px; padding:20px; margin-bottom:16px; }
    .jornada-ctrl { display:flex; align-items:center; gap:12px; margin-bottom:16px; }
    .jornada-ctrl button { background:var(--bg4); border:1px solid var(--border); color:var(--text); padding:8px 16px; border-radius:8px; cursor:pointer; font-family:var(--font-body); font-size:14px; }
    .jornada-ctrl .num { font-family:var(--font-head); font-size:24px; color:var(--accent); }
    table { width:100%; border-collapse:collapse; font-size:13px; }
    th { text-align:left; color:var(--muted); font-weight:600; padding:8px 10px; border-bottom:1px solid var(--border); font-size:11px; text-transform:uppercase; letter-spacing:0.5px; }
    td { padding:8px 10px; border-bottom:1px solid var(--border); }
    #btn-publish {
      width:100%; padding:14px; border-radius:10px; background:var(--accent);
      color:var(--bg); border:none; font-weight:700; font-size:15px;
      cursor:pointer; font-family:var(--font-body); margin-top:16px;
    }
    #btn-publish:disabled { opacity:0.6; cursor:not-allowed; }
    #btn-admin-login {
      padding:12px 24px; border-radius:10px; background:#fff; color:#1a1a1a;
      border:none; font-weight:700; cursor:pointer; font-family:var(--font-body);
      display:flex; align-items:center; gap:8px;
    }
  </style>
</head>
<body>
  <h1>Net11 Admin</h1>
  <p class="subtitle">Panel de administración · <span id="admin-user">—</span></p>

  <div id="admin-content">
    <button id="btn-admin-login">
      <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" width="18" alt="Google">
      Login con Google
    </button>
  </div>

  <div class="card">
    <div class="jornada-ctrl">
      <button onclick="changeJornada(-1)">◀</button>
      <span>Jornada</span>
      <span class="num" id="jornada-num">1</span>
      <button onclick="changeJornada(1)">▶</button>
    </div>
    <table>
      <thead>
        <tr>
          <th>Jugador</th><th>Equipo</th><th>Pos</th><th>Comp.</th><th>Puntos</th>
        </tr>
      </thead>
      <tbody id="players-tbody"></tbody>
    </table>
    <button id="btn-publish" onclick="publishJornada()">🚀 Publicar jornada</button>
  </div>

  <script type="module" src="js/admin.js"></script>
</body>
</html>
```

- [ ] **Step 5: Verificar panel admin**

Abrir `[hosting-url]/admin.html`. Hacer login con la cuenta de admin. La tabla de jugadores debe cargarse. Cambiar un punto y pulsar "Publicar jornada" — verificar en Firebase Console que se crea el documento `jornadas/1`.

- [ ] **Step 6: Commit**

```bash
git add admin.html js/admin.js firestore.rules
git commit -m "feat: add admin panel for jornada management"
```

---

## Task 17: Deploy y verificación en móvil

**Files:**
- No hay cambios de código en esta tarea

- [ ] **Step 1: Deploy completo**

```bash
firebase deploy
```

Salida esperada:
```
✔  Deploy complete!
Project Console: https://console.firebase.google.com/project/net11-1fc08/overview
Hosting URL: https://net11-1fc08.web.app
```

- [ ] **Step 2: Verificar en móvil**

1. Abrir `https://net11-1fc08.web.app` en Chrome (Android) o Safari (iOS)
2. El banner de instalación debe aparecer automáticamente (Chrome Android)
3. Pulsar "Instalar" → la app se añade a la pantalla de inicio
4. Abrir desde el icono → debe abrirse en modo standalone (sin barra del navegador)

- [ ] **Step 3: Verificar flujo completo**

Checklist en móvil:
- [ ] Login con Google funciona
- [ ] Crear una liga (nombre + competición)
- [ ] Compartir el código con otra persona
- [ ] La otra persona se une con el código
- [ ] Ambos fichan jugadores de la competición de la liga
- [ ] El ranking muestra a ambos con sus puntos
- [ ] El ranking se actualiza en tiempo real al fichar
- [ ] Cambiar de tab funciona con animación

- [ ] **Step 4: Commit final**

```bash
git add .
git commit -m "chore: initial working deployment"
```

---

## Resumen de tareas

| # | Tarea | Ficheros |
|---|---|---|
| 1 | Service Worker | `sw.js` |
| 2 | Config | `firebase.json`, `firestore.rules` |
| 3 | Firebase module | `js/firebase.js` |
| 4 | Players data | `js/players.js` |
| 5 | UI helpers | `js/ui.js` |
| 6 | State per league | `js/state.js` |
| 7 | Auth module | `js/auth.js` |
| 8 | Leagues CRUD | `js/leagues.js` |
| 9 | index.html shell | `index.html` |
| 10 | App entry point | `js/app.js` |
| 11 | Tab Equipo | `js/tabs/equipo.js` |
| 12 | Tab Mercado | `js/tabs/mercado.js` |
| 13 | Tab Ranking | `js/tabs/ranking.js` |
| 14 | Tab Jornada | `js/tabs/jornada.js` |
| 15 | Tab Perfil + ligas | `js/tabs/perfil.js` |
| 16 | Admin panel | `admin.html`, `js/admin.js` |
| 17 | Deploy | — |
