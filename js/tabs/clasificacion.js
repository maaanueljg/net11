import { getPlayer } from '../players.js';
import { calcPoints } from '../scoring.js';
import { db } from '../firebase.js';
import { getLeague } from '../leagues.js';
import { loadTeam } from '../state.js';
import {
  doc, getDoc, onSnapshot,
} from "https://www.gstatic.com/firebasejs/10.7.0/firebase-firestore.js";

const MEDALS = ['🥇', '🥈', '🥉'];
const MONTHS = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];

export function render(wrap, ctx) {
  const { user, profile, league } = ctx;

  if (!user || !profile) {
    wrap.innerHTML = `<div class="plantilla-empty" style="margin:24px 16px">Inicia sesión para ver la clasificación.</div>`;
    return null;
  }

  if (!league) {
    wrap.innerHTML = `
      <div class="sec-title">🏆 <span>CLASIFICACIÓN</span></div>
      <div class="plantilla-empty" style="margin:16px">
        No estás en ninguna liga.<br>Crea o únete a una desde <strong>👤 Perfil</strong>.
      </div>`;
    return null;
  }

  const titleEl = document.createElement('div');
  titleEl.innerHTML = `<div class="sec-title">🏆 <span>CLASIFICACIÓN</span></div>`;
  wrap.appendChild(titleEl);

  if (profile.leagues && profile.leagues.length > 1) {
    const sel = document.createElement('div');
    sel.style.cssText = 'padding:0 16px 10px;display:flex;gap:6px;overflow-x:auto;scrollbar-width:none';
    profile.leagues.forEach(code => {
      const btn = document.createElement('button');
      btn.className = `filter-chip${code === league.code ? ' active-all' : ''}`;
      btn.textContent = code;
      btn.onclick = async () => {
        const nl = await getLeague(code);
        if (!nl) return;
        window.NET11.ctx.league    = nl;
        window.NET11.ctx.teamState = await loadTeam(user.uid, code, nl.competition);
        window.NET11.refresh();
      };
      sel.appendChild(btn);
    });
    wrap.appendChild(sel);
  }

  const SUB_TABS = [
    { key: 'jornada', label: '📅 Jornada' },
    { key: 'general', label: '🏆 General' },
    { key: 'mensual', label: '📆 Mensual' },
  ];

  let activeKey = 'general';
  let subUnsub  = null;

  const tabBar   = document.createElement('div');
  tabBar.style.cssText = 'display:flex;border-bottom:1px solid var(--border);margin:0 16px 4px';

  const contentEl = document.createElement('div');

  const switchSub = (key) => {
    if (subUnsub) { subUnsub(); subUnsub = null; }
    activeKey = key;
    tabBar.querySelectorAll('.cls-tab').forEach(b => {
      const isActive = b.dataset.key === key;
      b.style.borderBottom = isActive ? '2px solid var(--accent)' : '2px solid transparent';
      b.style.color        = isActive ? 'var(--accent)' : 'var(--muted)';
    });
    contentEl.innerHTML = '';
    if (key === 'jornada')       renderJornadaTab(contentEl, ctx);
    else if (key === 'general')  subUnsub = renderGeneralTab(contentEl, ctx);
    else if (key === 'mensual')  renderMensualTab(contentEl, ctx);
  };

  SUB_TABS.forEach(({ key, label }) => {
    const btn = document.createElement('button');
    btn.dataset.key = key;
    btn.className = 'cls-tab';
    btn.textContent = label;
    btn.style.cssText = `flex:1;padding:10px 0;background:none;border:none;border-bottom:2px solid transparent;color:var(--muted);font-family:var(--font-body);font-size:12px;font-weight:600;cursor:pointer;transition:all 0.18s`;
    btn.onclick = () => switchSub(key);
    tabBar.appendChild(btn);
  });

  wrap.appendChild(tabBar);
  wrap.appendChild(contentEl);

  switchSub(activeKey);

  return () => { if (subUnsub) subUnsub(); };
}

/* ── Jornada tab ─────────────────────────────────────────── */

function renderJornadaTab(el, ctx) {
  const { user, league } = ctx;
  let selectedJornada = league.currentJornada ?? 1;
  const maxJornada    = league.currentJornada ?? 1;

  const navEl  = document.createElement('div');
  navEl.style.cssText = 'display:flex;align-items:center;justify-content:space-between;padding:10px 16px 14px';
  const listEl = document.createElement('div');
  listEl.style.padding = '0 16px';
  el.appendChild(navEl);
  el.appendChild(listEl);

  const btnStyle = 'background:none;border:1px solid var(--border);border-radius:var(--r-sm);padding:6px 12px;color:var(--text);cursor:pointer;font-family:var(--font-body);font-size:12px';
  const prevBtn  = Object.assign(document.createElement('button'), { textContent: '← Ant.' });
  const nextBtn  = Object.assign(document.createElement('button'), { textContent: 'Sig. →' });
  prevBtn.style.cssText = nextBtn.style.cssText = btnStyle;

  const jorLabel = document.createElement('div');
  jorLabel.style.cssText = 'font-weight:700;font-size:14px;color:var(--text)';

  navEl.appendChild(prevBtn);
  navEl.appendChild(jorLabel);
  navEl.appendChild(nextBtn);

  const load = async (num) => {
    selectedJornada = num;
    jorLabel.textContent = `Jornada ${num}`;
    prevBtn.disabled = num <= 1;
    nextBtn.disabled = num >= maxJornada;
    listEl.innerHTML = '<div class="plantilla-empty">Cargando...</div>';

    let jornadaDoc = null;
    try {
      const snap = await getDoc(doc(db, 'jornadas', String(num)));
      if (snap.exists()) jornadaDoc = snap.data();
    } catch {}

    if (!jornadaDoc) {
      listEl.innerHTML = '<div class="plantilla-empty">Jornada no publicada aún.</div>';
      return;
    }

    const scoringMode = league.scoringMode || 'base';

    const teamData = await Promise.all(
      league.members.map(async uid => {
        try {
          const snap = await getDoc(doc(db, 'users', uid, 'leagueTeams', league.code));
          return { uid, team: snap.exists() ? (snap.data().team || []) : [] };
        } catch { return { uid, team: [] }; }
      })
    );

    const entries = teamData
      .map(({ uid, team }) => {
        const pts = team.filter(Boolean).reduce((sum, pid) => {
          const p = getPlayer(pid);
          return p ? sum + calcPoints(jornadaDoc.players?.[pid] || {}, p.pos, scoringMode) : sum;
        }, 0);
        return { uid, teamName: league.memberNames[uid] || '—', pts };
      })
      .sort((a, b) => b.pts - a.pts);

    listEl.innerHTML = '';
    entries.forEach((e, i) => {
      const item = document.createElement('div');
      item.className = `rank-item${e.uid === user.uid ? ' me' : ''}`;
      item.innerHTML = `
        <div class="rank-num" style="color:${i===0?'var(--gold)':i===1?'#aaa':i===2?'#cd7f32':'var(--muted)'}">
          ${MEDALS[i] || i + 1}
        </div>
        <div class="rank-info">
          <div class="rank-user${e.uid === user.uid ? ' me-label' : ''}">${e.teamName}${e.uid === user.uid ? ' <small style="color:var(--muted);font-size:11px">(Tú)</small>' : ''}</div>
        </div>
        <div class="rank-pts">${e.pts.toLocaleString()}</div>`;
      listEl.appendChild(item);
    });
  };

  prevBtn.onclick = () => load(selectedJornada - 1);
  nextBtn.onclick = () => load(selectedJornada + 1);
  load(selectedJornada);
}

/* ── General tab ─────────────────────────────────────────── */

function renderGeneralTab(el, ctx) {
  const { user, profile, league } = ctx;

  const hero = document.createElement('div');
  hero.className = 'ranking-hero';
  hero.innerHTML = `
    <div class="rh-label">Cargando...</div>
    <div class="rh-pos" id="rh-gen-pos">—</div>
    <div class="rh-pts" id="rh-gen-pts">${profile.teamName}</div>`;
  el.appendChild(hero);

  const liveEl = document.createElement('div');
  liveEl.style.cssText = 'display:flex;align-items:center;gap:6px;padding:0 18px 8px;font-size:11px;color:var(--muted)';
  liveEl.innerHTML = `<div style="width:6px;height:6px;border-radius:50%;background:var(--accent);animation:pulse-slot 1.5s infinite"></div> En vivo`;
  el.appendChild(liveEl);

  const listEl = document.createElement('div');
  listEl.style.padding = '0 16px';
  el.appendChild(listEl);

  const refresh = async () => {
    const snapshots = await Promise.all(
      league.members.map(async uid => {
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

    const myPos = entries.findIndex(e => e.uid === user.uid) + 1;
    const myPts = entries.find(e => e.uid === user.uid)?.totalPts ?? 0;

    const rpos = hero.querySelector('#rh-gen-pos');
    const rpts = hero.querySelector('#rh-gen-pts');
    if (rpos) rpos.textContent = `#${myPos}`;
    if (rpts) rpts.textContent = `${myPts.toLocaleString()} pts · ${profile.teamName}`;
    hero.querySelector('.rh-label').textContent = league.name;

    listEl.innerHTML = '';
    entries.forEach((e, i) => {
      const item = document.createElement('div');
      item.className = `rank-item${e.uid === user.uid ? ' me' : ''}`;
      item.innerHTML = `
        <div class="rank-num" style="color:${i===0?'var(--gold)':i===1?'#aaa':i===2?'#cd7f32':'var(--muted)'}">
          ${MEDALS[i] || i + 1}
        </div>
        <div class="rank-info">
          <div class="rank-user${e.uid === user.uid ? ' me-label' : ''}">${e.teamName}${e.uid === user.uid ? ' <small style="color:var(--muted);font-size:11px">(Tú)</small>' : ''}</div>
          <div class="rank-team">${e.uid.slice(0, 8)}…</div>
        </div>
        <div class="rank-pts">${e.totalPts.toLocaleString()}</div>`;
      listEl.appendChild(item);
    });
  };

  const unsubs = league.members.map(uid =>
    onSnapshot(doc(db, 'users', uid, 'leagueTeams', league.code), () => refresh())
  );
  refresh();
  return () => unsubs.forEach(u => u());
}

/* ── Mensual tab ─────────────────────────────────────────── */

function renderMensualTab(el, ctx) {
  const { user, league } = ctx;

  const now      = new Date();
  const monthKey = now.toISOString().slice(0, 7);
  const label    = `${MONTHS[now.getMonth()]} ${now.getFullYear()}`;

  const header = document.createElement('div');
  header.style.cssText = 'padding:10px 16px 14px;font-size:13px;font-weight:700;color:var(--text)';
  header.textContent = `📆 ${label}`;
  el.appendChild(header);

  const listEl = document.createElement('div');
  listEl.style.padding = '0 16px';
  listEl.innerHTML = '<div class="plantilla-empty">Cargando...</div>';
  el.appendChild(listEl);

  Promise.all(
    league.members.map(async uid => {
      try {
        const snap = await getDoc(doc(db, 'users', uid, 'leagueTeams', league.code));
        return { uid, data: snap.exists() ? snap.data() : null };
      } catch { return { uid, data: null }; }
    })
  ).then(snapshots => {
    const entries = snapshots
      .map(({ uid, data }) => ({
        uid,
        teamName: league.memberNames[uid] || '—',
        pts: data?.monthlyPts?.[monthKey] ?? 0,
      }))
      .sort((a, b) => b.pts - a.pts);

    listEl.innerHTML = '';

    if (!entries.some(e => e.pts > 0)) {
      listEl.innerHTML = '<div class="plantilla-empty">Sin datos para este mes.<br>Los puntos se acumulan al publicar jornadas.</div>';
      return;
    }

    entries.forEach((e, i) => {
      const item = document.createElement('div');
      item.className = `rank-item${e.uid === user.uid ? ' me' : ''}`;
      item.innerHTML = `
        <div class="rank-num" style="color:${i===0?'var(--gold)':i===1?'#aaa':i===2?'#cd7f32':'var(--muted)'}">
          ${MEDALS[i] || i + 1}
        </div>
        <div class="rank-info">
          <div class="rank-user${e.uid === user.uid ? ' me-label' : ''}">${e.teamName}${e.uid === user.uid ? ' <small style="color:var(--muted);font-size:11px">(Tú)</small>' : ''}</div>
        </div>
        <div class="rank-pts">${e.pts.toLocaleString()}</div>`;
      listEl.appendChild(item);
    });
  });
}
