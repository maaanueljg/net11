import { db } from './firebase.js';
import { doc, setDoc, getDoc } from "https://www.gstatic.com/firebasejs/10.7.0/firebase-firestore.js";
import { getPlayer } from './players.js';

export function defaultTeamState(competition) {
  return {
    budget:     100,
    formation:  '4-3-3',
    team:       Array(11).fill(null),
    totalPts:   0,
    competition,
  };
}

export function calcTotalPts(teamIds) {
  return teamIds
    .filter(Boolean)
    .reduce((sum, id) => sum + (getPlayer(id)?.pts ?? 0), 0);
}

export function getLocalTeam(leagueCode) {
  try {
    const raw = localStorage.getItem(`net11_team_${leagueCode}`);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

function setLocalTeam(leagueCode, state) {
  localStorage.setItem(`net11_team_${leagueCode}`, JSON.stringify(state));
}

let _saveTimer = null;

export async function saveTeam(uid, leagueCode, teamState) {
  setLocalTeam(leagueCode, teamState);
  clearTimeout(_saveTimer);
  _saveTimer = setTimeout(async () => {
    try {
      await setDoc(
        doc(db, 'users', uid, 'leagueTeams', leagueCode),
        { ...teamState, updatedAt: new Date().toISOString() },
        { merge: true }
      );
    } catch (err) {
      console.warn('Cloud save failed:', err);
    }
  }, 1500);
}

export async function loadTeam(uid, leagueCode, competition) {
  const local = getLocalTeam(leagueCode);
  try {
    const snap = await getDoc(doc(db, 'users', uid, 'leagueTeams', leagueCode));
    if (snap.exists()) {
      const data = snap.data();
      setLocalTeam(leagueCode, data);
      return data;
    }
  } catch (err) {
    console.warn('Cloud load failed:', err);
  }
  return local ?? defaultTeamState(competition);
}
