import { auth, db } from './firebase.js';
import {
  onAuthStateChanged, GoogleAuthProvider, signInWithPopup,
} from "https://www.gstatic.com/firebasejs/10.7.0/firebase-auth.js";
import {
  doc, setDoc, getDoc, collection, getDocs, arrayUnion,
} from "https://www.gstatic.com/firebasejs/10.7.0/firebase-firestore.js";
import { PLAYERS } from './players.js';

let currentJornada = 1;
let jornadaPts = {};

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
