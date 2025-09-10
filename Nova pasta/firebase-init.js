import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth, onAuthStateChanged, signOut, setPersistence, browserSessionPersistence, browserLocalPersistence, signInWithEmailAndPassword } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { getDatabase, ref, onValue, off, get, set, child, query, limitToFirst, startAt, orderByChild } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";

// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyCY9sq12w7H9X3hm9FLa_KkazKONpm1nJE",
  authDomain: "fasthub-9a206.firebaseapp.com",
  databaseURL: "https://fasthub-9a206-default-rtdb.firebaseio.com",
  projectId: "fasthub-9a206",
  storageBucket: "fasthub-9a206.appspot.com",
  messagingSenderId: "685686875831",
  appId: "1:685686875831:web:a31c42df4b9f6bd7b88f32"
};


// Initialize Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getDatabase(app);

export { app, auth, db, onAuthStateChanged, ref, onValue, off, signOut, setPersistence, browserSessionPersistence, browserLocalPersistence, signInWithEmailAndPassword, get, set, child, query, limitToFirst, startAt, orderByChild };