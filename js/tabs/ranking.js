import {
  doc, getDoc, onSnapshot,
} from "https://www.gstatic.com/firebasejs/10.7.0/firebase-firestore.js";
import { db } from '../firebase.js';
import { getLeague } from '../leagues.js';
import { loadTeam } from '../state.js';

export function render(wrap, ctx) {
  const { user, profile, league } = ctx;

  if (!user || !profile) {
    wrap.innerHTML = `<div class="plantilla-empty" style="margin:24px 16px">Inicia sesión para ver el ranking.</div>`;
    return null;
  }

  if (!league) {
    wrap.innerHTML = `
      <div class="sec-title">🏆 <span>RANKING</span></div>
      <div class="plantilla-empty" style="margin:16px">
        No estás en ninguna liga todavía.<br>Crea o únete a una desde <strong>👤 Perfil</strong>.
      </div>`;
    return null;
  }

  return renderLeagueRanking(wrap, ctx);
}

function renderLeagueRanking(wrap, ctx) {
  const { user, profile, league } = ctx;

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

  const hero = document.createElement('div');
  hero.className = 'ranking-hero';
  hero.innerHTML = `
    <div class="rh-label">Cargando ranking...</div>
    <div class="rh-pos" id="rh-my-pos">—</div>
    <div class="rh-pts" id="rh-my-pts">${profile.teamName}</div>`;
  wrap.appendChild(hero);

  const liveEl = document.createElement('div');
  liveEl.style.cssText = 'display:flex;align-items:center;gap:6px;padding:0 18px 8px;font-size:11px;color:var(--muted)';
  liveEl.innerHTML = `<div style="width:6px;height:6px;border-radius:50%;background:var(--accent);animation:pulse-slot 1.5s infinite"></div> En vivo`;
  wrap.appendChild(liveEl);

  const list = document.createElement('div');
  list.style.padding = '0 16px';
  wrap.appendChild(list);

  const unsubs = league.members.map(uid => {
    return onSnapshot(
      doc(db, 'users', uid, 'leagueTeams', league.code),
      () => refreshRanking(league, user.uid, profile.teamName, list, hero)
    );
  });

  refreshRanking(league, user.uid, profile.teamName, list, hero);

  return () => unsubs.forEach(u => u());
}

async function refreshRanking(league, myUid, myTeamName, listEl, heroEl) {
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
