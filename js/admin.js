import { auth, db } from './firebase.js';
import {
  onAuthStateChanged, GoogleAuthProvider, signInWithPopup,
} from "https://www.gstatic.com/firebasejs/10.7.0/firebase-auth.js";
import {
  doc, setDoc, getDoc, collection, getDocs,
} from "https://www.gstatic.com/firebasejs/10.7.0/firebase-firestore.js";
import { PLAYERS } from './players.js';

const ADMIN_UIDS = ['REPLACE_WITH_YOUR_ADMIN_UID'];

let currentJornada = 1;
let jornadaPts = {};

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
    await setDoc(doc(db, 'jornadas', String(currentJornada)), {
      published: true,
      date:      new Date().toISOString(),
      players:   jornadaPts,
    });

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

document.getElementById('btn-admin-login')?.addEventListener('click', async () => {
  await signInWithPopup(auth, new GoogleAuthProvider());
});
