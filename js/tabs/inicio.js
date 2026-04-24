import { PLAYERS, getPlayer } from '../players.js';
import { calcPoints } from '../scoring.js';
import { db } from '../firebase.js';
import {
  doc, getDoc,
} from "https://www.gstatic.com/firebasejs/10.7.0/firebase-firestore.js";

const MEDALS   = ['🥇', '🥈', '🥉'];
const POS_COLOR = { POR: 'var(--por)', DEF: 'var(--def)', MED: 'var(--med)', DEL: 'var(--del)' };

/* ── Shared card shell ───────────────────────────────────── */

function buildCard(title, subtitle) {
  const card = document.createElement('div');
  card.style.cssText = 'margin:0 16px 16px;background:var(--bg3);border:1px solid var(--border);border-radius:14px;overflow:hidden';

  const header = document.createElement('div');
  header.style.cssText = 'display:flex;justify-content:space-between;align-items:center;padding:12px 14px 10px;border-bottom:1px solid var(--border)';
  header.innerHTML = `
    <span style="font-size:13px;font-weight:700;color:var(--text)">${title}</span>
    <span style="font-size:11px;color:var(--muted)">${subtitle}</span>`;

  const body = document.createElement('div');
  body.className = 'inicio-body';
  body.style.cssText = 'padding:6px 14px 10px';

  card.appendChild(header);
  card.appendChild(body);
  return card;
}

/* ── 🏟️ Última jornada ───────────────────────────────────── */

function buildJornadaCard(memberData, jornadaDoc, jornada, scoringMode) {
  const card = buildCard('🏟️ Última jornada', `J${jornada}`);
  const body = card.querySelector('.inicio-body');

  if (!jornadaDoc) {
    body.innerHTML = '<div class="plantilla-empty" style="padding:12px;margin:0">Jornada pendiente de publicar.</div>';
    return card;
  }

  const entries = memberData
    .map(({ name, data }) => {
      const team = (data?.team || []).filter(Boolean);
      const pts = team.reduce((sum, pid) => {
        const p = getPlayer(pid);
        return p ? sum + calcPoints(jornadaDoc.players?.[pid] || {}, p.pos, scoringMode) : sum;
      }, 0);
      return { name, pts };
    })
    .sort((a, b) => b.pts - a.pts)
    .slice(0, 3);

  entries.forEach((e, i) => {
    const row = document.createElement('div');
    row.style.cssText = 'display:flex;align-items:center;gap:10px;padding:7px 0;border-bottom:1px solid var(--border)';
    row.innerHTML = `
      <span style="font-size:18px;width:24px;text-align:center">${MEDALS[i]}</span>
      <span style="flex:1;font-size:13px;font-weight:600;color:var(--text)">${e.name}</span>
      <span style="font-size:13px;font-weight:700;color:var(--accent)">${e.pts} pts</span>`;
    body.appendChild(row);
  });

  return card;
}

/* ── 📆 Equipo del mes ───────────────────────────────────── */

function buildMensualCard(memberData, monthKey) {
  const monthLabel = new Date(monthKey + '-02').toLocaleString('es-ES', { month: 'long', year: 'numeric' });
  const card = buildCard('📆 Equipo del mes', monthLabel);
  const body = card.querySelector('.inicio-body');

  const withPts = memberData
    .map(m => ({ name: m.name, pts: m.data?.monthlyPts?.[monthKey] ?? 0 }))
    .filter(e => e.pts > 0)
    .sort((a, b) => b.pts - a.pts || a.name.localeCompare(b.name));

  if (withPts.length === 0) {
    body.innerHTML = '<div class="plantilla-empty" style="padding:12px;margin:0">Sin puntos mensuales aún.</div>';
    return card;
  }

  const mkRow = (icon, name, pts, color) => {
    const row = document.createElement('div');
    row.style.cssText = 'display:flex;align-items:center;gap:10px;padding:7px 0';
    row.innerHTML = `
      <span style="font-size:18px;width:24px;text-align:center">${icon}</span>
      <span style="flex:1;font-size:13px;font-weight:600;color:var(--text)">${name}</span>
      <span style="font-size:13px;font-weight:700;color:${color}">${pts} pts</span>`;
    return row;
  };

  body.appendChild(mkRow('🥇', withPts[0].name, withPts[0].pts, 'var(--accent)'));

  if (withPts.length > 1) {
    const sep = document.createElement('div');
    sep.style.cssText = 'height:1px;background:var(--border);margin:2px 0';
    body.appendChild(sep);
    const worst = withPts[withPts.length - 1];
    body.appendChild(mkRow('📉', worst.name, worst.pts, 'var(--danger)'));
  }

  return card;
}

/* ── ⚽ Mejores jugadores de la jornada ──────────────────── */

function buildTopPlayersCard(jornadaDoc, scoringMode) {
  const card = buildCard('⚽ Mejores jugadores', 'Esta jornada');
  const body = card.querySelector('.inicio-body');

  const ranked = PLAYERS
    .map(p => ({ ...p, jornadaPts: calcPoints(jornadaDoc.players?.[p.id] || {}, p.pos, scoringMode) }))
    .filter(p => p.jornadaPts > 0)
    .sort((a, b) => b.jornadaPts - a.jornadaPts)
    .slice(0, 5);

  if (ranked.length === 0) {
    body.innerHTML = '<div class="plantilla-empty" style="padding:12px;margin:0">Sin datos de puntuación.</div>';
    return card;
  }

  ranked.forEach(p => {
    const row = document.createElement('div');
    row.style.cssText = 'display:flex;align-items:center;gap:10px;padding:7px 0;border-bottom:1px solid var(--border)';
    row.innerHTML = `
      <span style="font-size:20px">${p.emoji}</span>
      <span style="flex:1;font-size:13px;font-weight:600;color:var(--text)">${p.name}</span>
      <span style="font-size:10px;padding:2px 6px;border-radius:4px;background:${POS_COLOR[p.pos]}22;color:${POS_COLOR[p.pos]};font-weight:700">${p.pos}</span>
      <span style="font-size:13px;font-weight:700;color:var(--accent)">${p.jornadaPts}</span>`;
    body.appendChild(row);
  });

  return card;
}

/* ── 🔍 Libres destacados ────────────────────────────────── */

function buildLibresCard(jornadaDoc, scoringMode, ownedPids) {
  const subtitle = jornadaDoc ? 'Por puntos en la jornada' : 'Por valor de mercado';
  const card = buildCard('🔍 Libres destacados', subtitle);
  const body = card.querySelector('.inicio-body');

  const libres = PLAYERS.filter(p => !ownedPids.has(p.id));

  const ranked = jornadaDoc
    ? libres
        .map(p => ({ ...p, jornadaPts: calcPoints(jornadaDoc.players?.[p.id] || {}, p.pos, scoringMode) }))
        .filter(p => p.jornadaPts > 0)
        .sort((a, b) => b.jornadaPts - a.jornadaPts)
        .slice(0, 3)
    : libres
        .sort((a, b) => b.val - a.val)
        .slice(0, 3)
        .map(p => ({ ...p, jornadaPts: null }));

  if (ranked.length === 0) {
    body.innerHTML = '<div class="plantilla-empty" style="padding:12px;margin:0">Todos los jugadores están fichados.</div>';
    return card;
  }

  ranked.forEach(p => {
    const row = document.createElement('div');
    row.style.cssText = 'display:flex;align-items:center;gap:10px;padding:7px 0;border-bottom:1px solid var(--border)';
    const ptsPart = p.jornadaPts !== null
      ? `<span style="font-size:13px;font-weight:700;color:var(--accent)">${p.jornadaPts} pts</span>`
      : `<span style="font-size:12px;color:var(--muted)">${(p.val * 1_000_000).toLocaleString('es-ES')} €</span>`;
    row.innerHTML = `
      <span style="font-size:20px">${p.emoji}</span>
      <span style="flex:1;font-size:13px;font-weight:600;color:var(--text)">${p.name}</span>
      <span style="font-size:10px;padding:2px 6px;border-radius:4px;background:${POS_COLOR[p.pos]}22;color:${POS_COLOR[p.pos]};font-weight:700">${p.pos}</span>
      ${ptsPart}`;
    body.appendChild(row);
  });

  return card;
}

/* ── Main render ─────────────────────────────────────────── */

export async function render(wrap, ctx) {
  const { user, league } = ctx;

  if (!user || !league) {
    wrap.innerHTML = `<div class="plantilla-empty" style="margin:24px 16px">Únete a una liga para ver el resumen.</div>`;
    return;
  }

  wrap.innerHTML = `<div class="sec-title">🏠 <span>INICIO</span></div>`;

  const loadingEl = document.createElement('div');
  loadingEl.className = 'plantilla-empty';
  loadingEl.style.cssText = 'margin:16px;padding:28px;text-align:center;color:var(--muted)';
  loadingEl.textContent = 'Cargando...';
  wrap.appendChild(loadingEl);

  const currentJornada = league.currentJornada ?? 1;
  const scoringMode    = league.scoringMode || 'base';
  const monthKey       = new Date().toISOString().slice(0, 7);

  const [jornadaSnap, ...teamSnaps] = await Promise.all([
    getDoc(doc(db, 'jornadas', String(currentJornada))).catch(() => null),
    ...league.members.map(uid =>
      getDoc(doc(db, 'users', uid, 'leagueTeams', league.code)).catch(() => null)
    ),
  ]);

  loadingEl.remove();

  const jornadaDoc = jornadaSnap?.exists() ? jornadaSnap.data() : null;

  const memberData = league.members.map((uid, i) => ({
    uid,
    name: league.memberNames[uid] || '—',
    data: teamSnaps[i]?.exists() ? teamSnaps[i].data() : null,
  }));

  const ownedPids = new Set(
    memberData.flatMap(m => [
      ...(m.data?.team  || []).filter(Boolean),
      ...(m.data?.bench || []),
    ])
  );

  wrap.appendChild(buildJornadaCard(memberData, jornadaDoc, currentJornada, scoringMode));
  wrap.appendChild(buildMensualCard(memberData, monthKey));
  if (jornadaDoc) wrap.appendChild(buildTopPlayersCard(jornadaDoc, scoringMode));
  wrap.appendChild(buildLibresCard(jornadaDoc, scoringMode, ownedPids));
}
