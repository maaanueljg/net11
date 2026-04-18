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
