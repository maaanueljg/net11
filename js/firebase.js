import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.0/firebase-app.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.7.0/firebase-firestore.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.7.0/firebase-auth.js";

const firebaseConfig = {
  apiKey:            "AIzaSyA-7gmBuFQOz6zaOVT0ZzKeEhEawvmjISA",
  authDomain:        "net11-1fc08.firebaseapp.com",
  projectId:         "net11-1fc08",
  storageBucket:     "net11-1fc08.firebasestorage.app",
  messagingSenderId: "162439869863",
  appId:             "1:162439869863:web:45b2a9b3c8a5a68dc37282",
  measurementId:     "G-QFKJEKEW8S"
};

const app = initializeApp(firebaseConfig);
export const db   = getFirestore(app);
export const auth = getAuth(app);
