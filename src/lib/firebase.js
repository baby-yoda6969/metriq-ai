import { initializeApp } from "firebase/app";
import { getAnalytics, isSupported as analyticsSupported } from "firebase/analytics";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID,
};

export const firebaseReady = Boolean(
  firebaseConfig.apiKey &&
  firebaseConfig.projectId &&
  firebaseConfig.appId
);

export const app = firebaseReady ? initializeApp(firebaseConfig) : null;
export const auth = app ? getAuth(app) : null;
export const db = app ? getFirestore(app) : null;
export const storage = app && firebaseConfig.storageBucket ? getStorage(app) : null;

let analyticsPromise = null;
export function initAnalytics() {
  if (!app || !firebaseConfig.measurementId || analyticsPromise) return analyticsPromise;
  analyticsPromise = analyticsSupported()
    .then((ok) => (ok ? getAnalytics(app) : null))
    .catch(() => null);
  return analyticsPromise;
}
