import { auth, db } from './firebase.js';
import {
  onAuthStateChanged, GoogleAuthProvider, signInWithPopup,
} from "https://www.gstatic.com/firebasejs/10.7.0/firebase-auth.js";
import {
  doc, setDoc, getDoc, collection, getDocs, arrayUnion, updateDoc,
} from "https://www.gstatic.com/firebasejs/10.7.0/firebase-firestore.js";
import { PLAYERS } from './players.js';
import { calcPoints } from './scoring.js';

let currentJornada = 1;
let jornadaData = {};

async function getAdminUids() {
  try {
    const snap = await getDoc(doc(db, '_config', 'admins'));
    return snap.exists() ? (snap.data().uids || []) : [];
  } catch { return []; }
}

async function bootstrapAdmin(uid) {
  await setDoc(doc(db, '_config', 'admins'), { uids: [uid] });
}

onAuthStateChanged(auth, async user => {
  const loginBtn = document.getElementById('btn-admin-login');
  if (loginBtn) loginBtn.style.display = 'none';

  if (!user) {
    document.getElementById('admin-content').innerHTML = `
      <div style="text-align:center;padding:24px">
        <button id="btn-admin-login" style="padding:12px 24px;border-radius:10px;background:#fff;color:#1a1a1a;border:none;font-weight:700;cursor:pointer;font-family:var(--font-body);display:inline-flex;align-items:center;gap:8px">
          <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" width="18" alt="Google">
          Login con Google
        </button>
      </div>`;
    document.getElementById('btn-admin-login').addEventListener('click', async () => {
      await signInWithPopup(auth, new GoogleAuthProvider());
    });
    return;
  }

  document.getElementById('admin-user').textContent = user.email || user.uid;

  const adminUids = await getAdminUids();

  if (adminUids.length === 0) {
    // Bootstrap: no hay admins configurados todavía
    document.getElementById('admin-content').innerHTML = `
      <div style="background:var(--bg3);border:1px solid var(--accent);border-radius:14px;padding:20px;margin-bottom:16px">
        <div style="font-weight:700;font-size:16px;color:var(--accent);margin-bottom:8px">⚙️ Configuración inicial</div>
        <div style="font-size:13px;color:var(--muted);margin-bottom:12px">No hay administradores configurados. Pulsa el botón para convertirte en admin.</div>
        <div style="font-size:11px;color:var(--muted);margin-bottom:12px">Tu UID: <code style="color:#fff">${user.uid}</code></div>
        <button id="btn-bootstrap" style="padding:12px 24px;border-radius:10px;background:var(--accent);color:var(--bg);border:none;font-weight:700;cursor:pointer;font-family:var(--font-body)">
          Hacerme administrador
        </button>
      </div>`;
    document.getElementById('btn-bootstrap').addEventListener('click', async () => {
      await bootstrapAdmin(user.uid);
      location.reload();
    });
    return;
  }

  if (!adminUids.includes(user.uid)) {
    document.getElementById('admin-content').innerHTML =
      `<div style="color:#ff1744;padding:24px;text-align:center">⛔ Acceso denegado.<br><small style="color:var(--muted)">UID: ${user.uid}</small></div>`;
    return;
  }

  document.getElementById('admin-content').innerHTML = '';
  loadJornada(currentJornada);
});

async function loadJornada(num) {
  currentJornada = num;
  document.getElementById('jornada-num').textContent = num;
  try {
    const snap = await getDoc(doc(db, 'jornadas', String(num)));
    jornadaData = snap.exists() ? (snap.data().players || {}) : {};
  } catch { jornadaData = {}; }
  renderPlayerTable();
}

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
          <option value="none"         ${(!s.yellowCards && !s.doubleYellow && !s.redCard) ? 'selected':''}>—</option>
          <option value="yellow"       ${(s.yellowCards===1 && !s.doubleYellow) ? 'selected':''}>🟨 Amarilla</option>
          <option value="doubleYellow" ${s.doubleYellow ? 'selected':''}>🟨🟨 2ª Amarilla</option>
          <option value="red"          ${s.redCard ? 'selected':''}>🟥 Roja directa</option>
        </select>
      </td>
      <td><input type="number" min="0" max="20" value="${s.goalsAgainst ?? 0}"     class="si" onchange="updateStat(${p.id},'goalsAgainst',+this.value)"     style="width:44px"></td>
      <td><input type="number" min="0" max="50" value="${s.positiveActions ?? 0}"  class="si" onchange="updateStat(${p.id},'positiveActions',+this.value)"  style="width:44px"></td>
      <td><input type="number" min="0" max="50" value="${s.lostBalls ?? 0}"        class="si" onchange="updateStat(${p.id},'lostBalls',+this.value)"        style="width:44px"></td>
      <td>
        <select class="si" onchange="updateStat(${p.id},'picas',+this.value)" style="background:var(--bg3);border:1px solid var(--border);border-radius:4px;color:var(--text);padding:3px;font-family:var(--font-body);font-size:12px">
          <option value="0" ${!s.picas ? 'selected':''}>—</option>
          <option value="1" ${s.picas===1 ? 'selected':''}>♣ (1)</option>
          <option value="2" ${s.picas===2 ? 'selected':''}>♣♣ (2)</option>
          <option value="3" ${s.picas===3 ? 'selected':''}>♣♣♣ (3)</option>
          <option value="4" ${s.picas===4 ? 'selected':''}>♣♣♣♣ (4)</option>
        </select>
      </td>
      <td id="pts-preview-${p.id}" style="font-weight:700;color:var(--accent)">—</td>`;
    tbody.appendChild(tr);
  });
  refreshPtsPreview();
}

function refreshPtsPreview() {
  PLAYERS.forEach(p => {
    const el = document.getElementById(`pts-preview-${p.id}`);
    if (!el) return;
    const s   = jornadaData[p.id] || {};
    const pts = calcPoints(s, p.pos, 'base');
    el.textContent = pts;
    el.style.color = pts > 0 ? 'var(--accent)' : pts < 0 ? 'var(--danger)' : 'var(--muted)';
  });
}

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

window.changeJornada = (delta) => {
  const next = Math.max(1, currentJornada + delta);
  loadJornada(next);
};

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

    const usersSnap   = await getDocs(collection(db, 'users'));
    const leagueCache = {};
    const leaguePts = {}; // { leagueCode: { uid: totalPts } }
    let updated = 0;

    for (const userDoc of usersSnap.docs) {
      const profile = userDoc.data();
      const leagues = profile.leagues || [];
      for (const leagueCode of leagues) {
        try {
          if (!leagueCache[leagueCode]) {
            const ls = await getDoc(doc(db, 'leagues', leagueCode));
            leagueCache[leagueCode] = ls.exists() ? ls.data() : { scoringMode: 'base' };
          }
          const scoringMode = leagueCache[leagueCode].scoringMode || 'base';
          if (scoringMode === 'puras') continue;

          const teamSnap = await getDoc(doc(db, 'users', userDoc.id, 'leagueTeams', leagueCode));
          if (!teamSnap.exists()) continue;
          const team = teamSnap.data().team || [];

          const totalPts = team.filter(Boolean).reduce((sum, pid) => {
            const player = PLAYERS.find(p => p.id === pid);
            if (!player) return sum;
            return sum + calcPoints(jornadaData[pid] || {}, player.pos, scoringMode);
          }, 0);

          if (!leaguePts[leagueCode]) leaguePts[leagueCode] = {};
          leaguePts[leagueCode][userDoc.id] = totalPts;

          const leagueData  = leagueCache[leagueCode];
          const moneyEarned = (leagueData.moneyPerPoint ?? 0) * totalPts;
          const teamData    = { totalPts };
          if (moneyEarned > 0) {
            teamData.money = (teamSnap.data().money ?? (leagueData.startingMoney ?? 100)) + moneyEarned;
          }
          await setDoc(
            doc(db, 'users', userDoc.id, 'leagueTeams', leagueCode),
            teamData,
            { merge: true }
          );
          updated++;
        } catch { /* skip */ }
      }
    }

    btn.textContent = `✅ Publicado · ${updated} equipos actualizados`;

    // Distribute jornada bonus and increment jornadasPublished per league
    for (const [leagueCode, ptsMap] of Object.entries(leaguePts)) {
      try {
        const leagueData = leagueCache[leagueCode];

        await updateDoc(doc(db, 'leagues', leagueCode), {
          jornadasPublished: (leagueData.jornadasPublished ?? 0) + 1,
        });

        const bonus = leagueData.jornadaBonus;
        if (!bonus) continue;
        const maxPts  = Math.max(...Object.values(ptsMap));
        const winners = Object.keys(ptsMap).filter(uid => ptsMap[uid] === maxPts);
        const share   = Math.floor(bonus / winners.length);
        for (const uid of winners) {
          const teamRef  = doc(db, 'users', uid, 'leagueTeams', leagueCode);
          const teamSnap = await getDoc(teamRef);
          if (!teamSnap.exists()) continue;
          const currentMoney = teamSnap.data().money ?? (leagueData.startingMoney ?? 100);
          await setDoc(teamRef, { money: currentMoney + share }, { merge: true });
        }
      } catch { /* skip league */ }
    }

    setTimeout(() => { btn.disabled = false; btn.textContent = '🚀 Publicar jornada'; }, 3000);
  } catch (err) {
    btn.disabled = false;
    btn.textContent = '❌ Error: ' + err.message;
  }
};
