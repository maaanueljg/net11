import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.0/firebase-app.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.7.0/firebase-firestore.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.7.0/firebase-auth.js";

const firebaseConfig = {
  apiKey:            "AIzaSyCwg7W6HVJr6wZAwvySy7aIjf616_29EyY",
  authDomain:        "net11-0099.firebaseapp.com",
  projectId:         "net11-0099",
  storageBucket:     "net11-0099.firebasestorage.app",
  messagingSenderId: "763723083720",
  appId:             "1:763723083720:web:a9ae33e8dd2561ea659afd",
  measurementId:     "G-3RLVCTYB9N"
};

const app = initializeApp(firebaseConfig);
export const db   = getFirestore(app);
export const auth = getAuth(app);
