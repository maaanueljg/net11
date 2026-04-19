import { db } from './firebase.js';
import {
  doc, setDoc, getDoc, updateDoc, arrayUnion, arrayRemove, deleteField, runTransaction,
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
    formations      = ['4-3-3', '4-4-2', '4-2-3-1', '4-5-1', '3-5-2', '5-3-2', '3-4-3', '5-4-1'],
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
  await updateDoc(doc(db, 'leagues', code.toUpperCase()), fields);
}

export async function kickMember(code, memberUid) {
  await updateDoc(doc(db, 'leagues', code.toUpperCase()), {
    members:                        arrayRemove(memberUid),
    [`memberNames.${memberUid}`]:   deleteField(),
  });
}
