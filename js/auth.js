import { auth, db } from './firebase.js';
import {
  GoogleAuthProvider, signInWithPopup,
  createUserWithEmailAndPassword, signInWithEmailAndPassword,
  signOut, onAuthStateChanged,
} from "https://www.gstatic.com/firebasejs/10.7.0/firebase-auth.js";
import {
  doc, getDoc, setDoc, updateDoc, arrayUnion,
} from "https://www.gstatic.com/firebasejs/10.7.0/firebase-firestore.js";

export function onAuthChange(callback) {
  return onAuthStateChanged(auth, callback);
}

export function getCurrentUser() {
  return auth.currentUser;
}

export async function loginWithGoogle() {
  const provider = new GoogleAuthProvider();
  return signInWithPopup(auth, provider);
}

export async function loginWithEmail(email, password) {
  return signInWithEmailAndPassword(auth, email, password);
}

export async function registerWithEmail(email, password) {
  return createUserWithEmailAndPassword(auth, email, password);
}

export async function logout() {
  return signOut(auth);
}

export async function getUserProfile(uid) {
  const snap = await getDoc(doc(db, 'users', uid));
  return snap.exists() ? snap.data() : null;
}

export async function createUserProfile(uid, displayName, teamName) {
  await setDoc(doc(db, 'users', uid), {
    displayName,
    teamName,
    leagues:   [],
    updatedAt: new Date().toISOString(),
  });
  return { displayName, teamName, leagues: [] };
}

export async function addLeagueToProfile(uid, leagueCode) {
  await updateDoc(doc(db, 'users', uid), {
    leagues:   arrayUnion(leagueCode),
    updatedAt: new Date().toISOString(),
  });
}
