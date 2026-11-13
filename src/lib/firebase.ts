import { initializeApp } from "firebase/app";
import { getFirestore, connectFirestoreEmulator } from "firebase/firestore";
import { getStorage, connectStorageEmulator } from "firebase/storage";
import { getAuth, GoogleAuthProvider, connectAuthEmulator } from "firebase/auth";
import { getFunctions, connectFunctionsEmulator } from "firebase/functions";
import { getAnalytics } from "firebase/analytics";


const firebaseConfig = {
    apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
    authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
    projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
    storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
    appId: import.meta.env.VITE_FIREBASE_APP_ID,
    measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Initialize Firestore, Storage, and Auth
// The archive's database comes from functions/.env.<project id>, the same file the
// Cloud Functions' Firestore triggers are bound by, so the app and the triggers
// always use one database — in the emulator too. With any other database the
// triggers never fire: no role claims, so no uploads, and no privacy syncing.
const useEmulator = import.meta.env.VITE_USE_FIREBASE_EMULATOR === 'true';
export const db = getFirestore(app, __ARCHIVE_DATABASE__);
export const storage = getStorage(app);
export const auth = getAuth(app);
export const functions = getFunctions(app);
export const googleProvider = new GoogleAuthProvider();

if (useEmulator) {
  console.log("🔥 CONNECTING TO FIREBASE EMULATORS 🔥");
  connectFirestoreEmulator(db, '127.0.0.1', 8080);
  connectAuthEmulator(auth, 'http://127.0.0.1:9099');
  connectStorageEmulator(storage, '127.0.0.1', 9199);
  // Without this, callables such as syncMyRoleClaim went to the production
  // functions with an emulator token and failed.
  connectFunctionsEmulator(functions, '127.0.0.1', 5001);
}

export const analytics = typeof window !== 'undefined' && window.location.hostname !== 'localhost' && firebaseConfig.measurementId
  ? getAnalytics(app)
  : null;
