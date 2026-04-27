import { db } from './firebase.js';
import {
  doc, getDoc, updateDoc, arrayUnion, arrayRemove, deleteField, runTransaction,
} from "https://www.gstatic.com/firebasejs/10.7.0/firebase-firestore.js";

function generateCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const rand3 = () => Array.from({ length: 3 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
  return `NET-${rand3()}`;
}

export function getShareLink(code) {
  return `${location.origin}/join/${code}`;
}

export async function createLeague(
  adminUid, adminTeamName, name, competition,
  scoringMode = 'base', newspaper = null,
  {
    clauseMode      = 'moderado',
    startingMoney   = 100,
    moneyPerPoint   = 0,
    jornadaBonus    = null,
    formations       = ['4-3-3', '4-4-2', '4-2-3-1', '4-5-1', '3-5-2', '5-3-2', '3-4-3', '5-4-1'],
    maxPlayersPerTeam = 15,
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
    maxPlayersPerTeam,
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

export async function getLeague(code) {
  const snap = await getDoc(doc(db, 'leagues', code.toUpperCase()));
  if (!snap.exists()) return null;
  return { code: snap.id, ...snap.data() };
}

export async function joinLeague(code, uid, teamName) {
  if (!uid || uid.includes('.')) throw new Error('UID inválido');
  const league = await getLeague(code);
  if (!league)                      throw new Error('Liga no encontrada');
  if (league.members.length >= 20)  throw new Error('La liga está llena (máx. 20)');
  if (league.members.includes(uid)) throw new Error('Ya eres miembro de esta liga');

  await updateDoc(doc(db, 'leagues', code.toUpperCase()), {
    members:                 arrayUnion(uid),
    [`memberNames.${uid}`]:  teamName,
  });
  return {
    ...league,
    members:     [...league.members, uid],
    memberNames: { ...league.memberNames, [uid]: teamName },
  };
}

export async function updateLeague(code, fields) {
  if (!fields || typeof fields !== 'object' || Object.keys(fields).length === 0) {
    throw new Error('updateLeague: fields must be a non-empty object');
  }
  await updateDoc(doc(db, 'leagues', code.toUpperCase()), fields);
}

export async function kickMember(code, memberUid) {
  const league = await getLeague(code);
  if (!league) throw new Error('Liga no encontrada');
  if (league.adminUid === memberUid) throw new Error('No se puede expulsar al administrador');
  await updateDoc(doc(db, 'leagues', code.toUpperCase()), {
    members:                        arrayRemove(memberUid),
    [`memberNames.${memberUid}`]:   deleteField(),
  });
}

/* ── Market offer helpers ───────────────────────────────── */

export async function placeOffer(leagueCode, pid, uid, amount) {
  await updateDoc(doc(db, 'leagues', leagueCode.toUpperCase()), {
    [`marketOffers.${pid}.${uid}`]: { amount, createdAt: new Date().toISOString() },
  });
}

export async function cancelOffer(leagueCode, pid, uid) {
  await updateDoc(doc(db, 'leagues', leagueCode.toUpperCase()), {
    [`marketOffers.${pid}.${uid}`]: deleteField(),
  });
}

export async function resolveMarketOffers(league, newPool) {
  const leagueRef = doc(db, 'leagues', league.code.toUpperCase());
  const results   = [];
  const now       = new Date().toISOString();

  await runTransaction(db, async tx => {
    const leagueSnap = await tx.get(leagueRef);
    if (!leagueSnap.exists()) return;
    const offers = leagueSnap.data().marketOffers || {};

    if (Object.keys(offers).length === 0) {
      tx.update(leagueRef, { marketPlayers: newPool, marketLastRefresh: now, marketResults: [] });
      return;
    }

    // Read team docs for every user who placed an offer
    const teamRefs  = {};
    const teamDatas = {};
    for (const pidOffers of Object.values(offers)) {
      for (const uid of Object.keys(pidOffers)) {
        if (!teamRefs[uid]) {
          const ref  = doc(db, 'users', uid, 'leagueTeams', league.code.toUpperCase());
          const snap = await tx.get(ref);
          teamRefs[uid]  = ref;
          teamDatas[uid] = snap.exists()
            ? { money: snap.data().money ?? 0, bench: [...(snap.data().bench || [])] }
            : null;
        }
      }
    }

    // In-flight state so a user winning multiple players is handled correctly
    const state = {};
    for (const [uid, d] of Object.entries(teamDatas)) {
      if (d) state[uid] = { money: d.money, bench: [...d.bench] };
    }

    for (const [pidStr, pidOffers] of Object.entries(offers)) {
      const pid    = Number(pidStr);
      const sorted = Object.entries(pidOffers)
        .sort(([, a], [, b]) => b.amount - a.amount || a.createdAt.localeCompare(b.createdAt));

      let winnerUid = null, winnerAmt = 0;
      for (const [uid, offer] of sorted) {
        if (state[uid] && state[uid].money >= offer.amount) {
          winnerUid = uid; winnerAmt = offer.amount; break;
        }
      }

      if (winnerUid) {
        state[winnerUid].money -= winnerAmt;
        state[winnerUid].bench.push(pid);
        results.push({ pid, winnerUid, winnerName: league.memberNames?.[winnerUid] || '?', amount: winnerAmt });
      } else {
        results.push({ pid, noWinner: true });
      }
    }

    // Write team updates
    for (const [uid, s] of Object.entries(state)) {
      const orig = teamDatas[uid];
      if (s.money !== orig.money || s.bench.length !== orig.bench.length) {
        tx.update(teamRefs[uid], { money: s.money, bench: s.bench });
      }
    }

    // Append won transfers to history (keep last 300)
    const prevHistory = leagueSnap.data().transferHistory || [];
    const newEntries  = results
      .filter(r => r.winnerUid)
      .map(r => ({ pid: r.pid, winnerUid: r.winnerUid, winnerName: r.winnerName, amount: r.amount, resolvedAt: now }));
    const transferHistory = [...prevHistory, ...newEntries].slice(-300);

    tx.update(leagueRef, {
      marketOffers:      {},
      marketResults:     results,
      marketPlayers:     newPool,
      marketLastRefresh: now,
      transferHistory,
    });
  });

  return { results, now };
}

export async function adjustMemberMoney(leagueCode, uid, amount) {
  if (!amount || isNaN(amount)) throw new Error('Importe inválido');
  const teamRef = doc(db, 'users', uid, 'leagueTeams', leagueCode.toUpperCase());
  const snap = await getDoc(teamRef);
  if (!snap.exists()) throw new Error('Equipo no encontrado');
  const current = snap.data().money ?? 0;
  await updateDoc(teamRef, { money: current + amount });
  return current + amount;
}
