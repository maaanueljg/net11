import { getPlayer } from '../players.js';
import { calcPoints } from '../scoring.js';
import { db } from '../firebase.js';
import { getLeague } from '../leagues.js';
import { loadTeam } from '../state.js';
import {
  doc, getDoc, onSnapshot,
} from "https://www.gstatic.com/firebasejs/10.7.0/firebase-firestore.js";

const MEDALS     = ['🥇', '🥈', '🥉'];
const MONTHS     = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
const MONTHS_S   = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];

/* ── Animation helpers ───────────────────────────────────── */

function ensureAnim() {
  if (document.getElementById('cls-anim')) return;
  const s = document.createElement('style');
  s.id = 'cls-anim';
  s.textContent = '@keyframes cls-fade{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:translateY(0)}}';
  document.head.appendChild(s);
}

function fadeIn(el) {
  el.style.animation = 'none';
  el.offsetHeight; // force reflow
  el.style.animation = 'cls-fade 0.22s ease';
}

/* ── Chip bar helper ─────────────────────────────────────── */

function buildChipBar(items, activeIdx, onChange) {
  const bar = document.createElement('div');
  bar.style.cssText = 'display:flex;gap:6px;padding:8px 16px 12px;overflow-x:auto;scrollbar-width:none;-webkit-overflow-scrolling:touch';

  let activeBtn = null;
  items.forEach((item, i) => {
    const btn = document.createElement('button');
    btn.className = `filter-chip${i === activeIdx ? ' active-all' : ''}`;
    btn.style.cssText = 'flex-shrink:0';
    btn.textContent = item.label;
    btn.onclick = () => {
      if (activeBtn) activeBtn.className = 'filter-chip';
      btn.className = 'filter-chip active-all';
      activeBtn = btn;
      onChange(i, item);
    };
    bar.appendChild(btn);
    if (i === activeIdx) {
      activeBtn = btn;
      requestAnimationFrame(() => btn.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' }));
    }
  });

  return bar;
}

/* ── Rank list renderer ──────────────────────────────────── */

function buildRankList(entries, myUid) {
  const frag = document.createDocumentFragment();
  entries.forEach((e, i) => {
    const item = document.createElement('div');
    item.className = `rank-item${e.uid === myUid ? ' me' : ''}`;
    item.innerHTML = `
      <div class="rank-num" style="color:${i===0?'var(--gold)':i===1?'#aaa':i===2?'#cd7f32':'var(--muted)'}">
        ${MEDALS[i] || i + 1}
      </div>
      <div class="rank-info">
        <div class="rank-user${e.uid === myUid ? ' me-label' : ''}">${e.teamName}${e.uid === myUid ? ' <small style="color:var(--muted);font-size:11px">(Tú)</small>' : ''}</div>
        ${e.sub ? `<div class="rank-team">${e.sub}</div>` : ''}
      </div>
      <div class="rank-pts">${e.pts.toLocaleString()}</div>`;
    frag.appendChild(item);
  });
  return frag;
}

/* ── Main render ─────────────────────────────────────────── */

export function render(wrap, ctx) {
  const { user, profile, league } = ctx;
  ensureAnim();

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
  tabBar.style.cssText = 'display:flex;border-bottom:1px solid var(--border);margin:0 16px 0';

  const contentEl = document.createElement('div');

  const switchSub = (key) => {
    if (subUnsub) { subUnsub(); subUnsub = null; }
    activeKey = key;
    tabBar.querySelectorAll('.cls-tab').forEach(b => {
      const on = b.dataset.key === key;
      b.style.borderBottom = on ? '2px solid var(--accent)' : '2px solid transparent';
      b.style.color        = on ? 'var(--accent)' : 'var(--muted)';
    });
    contentEl.innerHTML = '';
    if (key === 'jornada')      renderJornadaTab(contentEl, ctx);
    else if (key === 'general') subUnsub = renderGeneralTab(contentEl, ctx);
    else if (key === 'mensual') renderMensualTab(contentEl, ctx);
  };

  SUB_TABS.forEach(({ key, label }) => {
    const btn = document.createElement('button');
    btn.dataset.key = key;
    btn.className = 'cls-tab';
    btn.textContent = label;
    btn.style.cssText = 'flex:1;padding:10px 0;background:none;border:none;border-bottom:2px solid transparent;color:var(--muted);font-family:var(--font-body);font-size:12px;font-weight:600;cursor:pointer;transition:all 0.18s';
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
  const maxJornada = league.currentJornada ?? 1;

  // Build chip items: J1 … Jmax
  const items = Array.from({ length: maxJornada }, (_, i) => ({ label: `J${i + 1}`, num: i + 1 }));
  const startIdx = maxJornada - 1;

  const listEl = document.createElement('div');
  listEl.style.padding = '0 16px';

  const load = async (num) => {
    listEl.innerHTML = '<div class="plantilla-empty">Cargando...</div>';

    let jornadaDoc = null;
    try {
      const snap = await getDoc(doc(db, 'jornadas', String(num)));
      if (snap.exists()) jornadaDoc = snap.data();
    } catch {}

    if (!jornadaDoc) {
      listEl.innerHTML = '<div class="plantilla-empty">Jornada no publicada aún.</div>';
      fadeIn(listEl);
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
    listEl.appendChild(buildRankList(entries, user.uid));
    fadeIn(listEl);
  };

  const bar = buildChipBar(items, startIdx, (_, item) => load(item.num));
  el.appendChild(bar);
  el.appendChild(listEl);
  load(maxJornada);
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
        pts:      data?.totalPts ?? 0,
        sub:      uid.slice(0, 8) + '…',
      }))
      .sort((a, b) => b.pts - a.pts);

    const myPos = entries.findIndex(e => e.uid === user.uid) + 1;
    const myPts = entries.find(e => e.uid === user.uid)?.pts ?? 0;

    const rpos = hero.querySelector('#rh-gen-pos');
    const rpts = hero.querySelector('#rh-gen-pts');
    if (rpos) rpos.textContent = `#${myPos}`;
    if (rpts) rpts.textContent = `${myPts.toLocaleString()} pts · ${profile.teamName}`;
    hero.querySelector('.rh-label').textContent = league.name;

    listEl.innerHTML = '';
    listEl.appendChild(buildRankList(entries, user.uid));
    fadeIn(listEl);
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
  const now = new Date();

  // Months of the current year up to today
  const items = Array.from({ length: now.getMonth() + 1 }, (_, i) => ({
    label:    MONTHS_S[i],
    monthKey: `${now.getFullYear()}-${String(i + 1).padStart(2, '0')}`,
    fullName: `${MONTHS[i]} ${now.getFullYear()}`,
  }));

  const activeIdx = items.length - 1;

  const header = document.createElement('div');
  header.style.cssText = 'padding:2px 16px 0;font-size:13px;font-weight:700;color:var(--text)';
  header.textContent = items[activeIdx].fullName;

  const listEl = document.createElement('div');
  listEl.style.padding = '0 16px';

  const loadMonth = async (item) => {
    header.textContent = item.fullName;
    listEl.innerHTML = '<div class="plantilla-empty">Cargando...</div>';

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
        pts:      data?.monthlyPts?.[item.monthKey] ?? 0,
      }))
      .sort((a, b) => b.pts - a.pts);

    listEl.innerHTML = '';

    if (!entries.some(e => e.pts > 0)) {
      listEl.innerHTML = '<div class="plantilla-empty">Sin datos para este mes.<br>Los puntos se acumulan al publicar jornadas.</div>';
      fadeIn(listEl);
      return;
    }

    listEl.appendChild(buildRankList(entries, user.uid));
    fadeIn(listEl);
  };

  const bar = buildChipBar(items, activeIdx, (_, item) => loadMonth(item));
  el.appendChild(header);
  el.appendChild(bar);
  el.appendChild(listEl);
  loadMonth(items[activeIdx]);
}
