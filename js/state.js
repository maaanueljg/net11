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

const _saveTimers = new Map();

export async function saveTeam(uid, leagueCode, teamState) {
  const stateWithTs = { ...teamState, updatedAt: new Date().toISOString() };
  setLocalTeam(leagueCode, stateWithTs);
  clearTimeout(_saveTimers.get(leagueCode));
  _saveTimers.set(leagueCode, setTimeout(async () => {
    _saveTimers.delete(leagueCode);
    if (!uid) return;
    try {
      await setDoc(
        doc(db, 'users', uid, 'leagueTeams', leagueCode),
        stateWithTs,
        { merge: true }
      );
    } catch (err) {
      console.warn('Cloud save failed:', err);
    }
  }, 1500));
}

export async function loadTeam(uid, leagueCode, competition) {
  const local = getLocalTeam(leagueCode);
  if (!uid) return local ?? defaultTeamState(competition);
  try {
    const snap = await getDoc(doc(db, 'users', uid, 'leagueTeams', leagueCode));
    if (snap.exists()) {
      const cloud = snap.data();
      if (!local?.updatedAt || cloud.updatedAt >= local.updatedAt) {
        setLocalTeam(leagueCode, cloud);
        return cloud;
      }
      return local;
    }
  } catch (err) {
    console.warn('Cloud load failed:', err);
  }
  return local ?? defaultTeamState(competition);
}
