import {
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
  updateProfile,
} from "firebase/auth";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  writeBatch,
} from "firebase/firestore";
import { auth, db, firebaseReady, initAnalytics } from "./firebase.js";

const MAX_INLINE_IMAGE = 350_000;

function employeeEmail(employeeId) {
  const local = String(employeeId || "user")
    .toLowerCase()
    .replace(/[^a-z0-9._-]/g, "")
    .slice(0, 48) || "user";
  return `${local}@metriqai.app`;
}

function stripUndefined(value) {
  if (Array.isArray(value)) return value.map(stripUndefined);
  if (value && typeof value === "object") {
    const out = {};
    for (const [k, v] of Object.entries(value)) {
      if (v === undefined) continue;
      out[k] = stripUndefined(v);
    }
    return out;
  }
  return value;
}

export function sanitizeScanForCloud(scan) {
  const next = { ...scan };
  if (typeof next.imageDataUrl === "string" && next.imageDataUrl.length > MAX_INLINE_IMAGE) {
    next.imageDataUrl = null;
    next.imageSynced = false;
  }
  if (next.additionalPhotos && typeof next.additionalPhotos === "object") {
    const photos = { ...next.additionalPhotos };
    for (const key of Object.keys(photos)) {
      if (typeof photos[key] === "string" && photos[key].length > MAX_INLINE_IMAGE) {
        photos[key] = null;
      }
    }
    next.additionalPhotos = photos;
  }
  next.updatedAt = new Date().toISOString();
  return stripUndefined(next);
}

export function sanitizeRuleForCloud(rule) {
  return stripUndefined({
    ...rule,
    updatedAt: new Date().toISOString(),
  });
}

export function watchAuth(callback) {
  if (!firebaseReady || !auth) {
    callback(null);
    return () => {};
  }
  initAnalytics();
  return onAuthStateChanged(auth, callback);
}

export async function loadUserProfile(uid) {
  if (!db || !uid) return null;
  const snap = await getDoc(doc(db, "users", uid));
  if (!snap.exists()) return null;
  const data = snap.data();
  return {
    uid,
    name: data.name,
    employeeId: data.employeeId,
    role: data.role,
  };
}

async function upsertUserProfile(uid, session) {
  const payload = {
    name: session.name,
    employeeId: session.employeeId,
    role: session.role,
    updatedAt: new Date().toISOString(),
    syncedAt: serverTimestamp(),
  };
  await setDoc(doc(db, "users", uid), payload, { merge: true });
  return { uid, ...session };
}

/**
 * Sign in with employee ID + password (creates the account on first use).
 * Email is derived as {employeeId}@metriqai.app for Firebase Auth.
 */
export async function signInWithSession(session, password) {
  if (!firebaseReady || !auth || !db) {
    throw new Error("Firebase is not configured.");
  }
  const email = employeeEmail(session.employeeId);
  const pass = password || "welcome@123";
  let cred;
  try {
    cred = await signInWithEmailAndPassword(auth, email, pass);
  } catch (err) {
    const code = err?.code || "";
    if (code === "auth/user-not-found" || code === "auth/invalid-credential" || code === "auth/invalid-login-credentials") {
      try {
        cred = await createUserWithEmailAndPassword(auth, email, pass);
      } catch (createErr) {
        if (createErr?.code === "auth/email-already-in-use") {
          cred = await signInWithEmailAndPassword(auth, email, pass);
        } else {
          throw createErr;
        }
      }
    } else {
      throw err;
    }
  }
  if (session.name) {
    await updateProfile(cred.user, { displayName: session.name }).catch(() => {});
  }
  return upsertUserProfile(cred.user.uid, session);
}

export async function firebaseSignOut() {
  if (!auth) return;
  await signOut(auth);
}

export function subscribeScans(onChange, onError) {
  if (!db) {
    onChange(null);
    return () => {};
  }
  const q = query(collection(db, "scans"), orderBy("date", "desc"));
  return onSnapshot(
    q,
    (snap) => {
      const rows = snap.docs.map((d) => {
        const data = d.data();
        return { ...data, id: data.id || d.id };
      });
      onChange(rows);
    },
    (err) => onError?.(err)
  );
}

export function subscribeRuleVersions(onChange, onError) {
  if (!db) {
    onChange(null);
    return () => {};
  }
  const q = query(collection(db, "ruleVersions"), orderBy("date", "desc"));
  return onSnapshot(
    q,
    (snap) => {
      onChange(snap.docs.map((d) => d.data()));
    },
    (err) => onError?.(err)
  );
}

export async function upsertScan(scan) {
  if (!db || !scan?.id) return;
  const payload = sanitizeScanForCloud(scan);
  await setDoc(doc(db, "scans", String(scan.id)), payload, { merge: true });
}

export async function upsertScans(scans) {
  if (!db || !scans?.length) return;
  const batch = writeBatch(db);
  for (const scan of scans) {
    if (!scan?.id) continue;
    batch.set(doc(db, "scans", String(scan.id)), sanitizeScanForCloud(scan), { merge: true });
  }
  await batch.commit();
}

export async function upsertRuleVersion(rule) {
  if (!db || !rule?.version) return;
  const id = String(rule.version).replace(/[^\w.-]/g, "_");
  await setDoc(doc(db, "ruleVersions", id), sanitizeRuleForCloud(rule), { merge: true });
}

export async function seedCloudIfEmpty({ scans, rules }) {
  if (!db) return { seeded: false };
  const existing = await getDocs(query(collection(db, "scans"), limit(1)));
  if (!existing.empty) return { seeded: false };

  const batch = writeBatch(db);
  for (const scan of scans || []) {
    if (!scan?.id) continue;
    batch.set(doc(db, "scans", String(scan.id)), sanitizeScanForCloud(scan), { merge: true });
  }
  for (const rule of rules || []) {
    if (!rule?.version) continue;
    const id = String(rule.version).replace(/[^\w.-]/g, "_");
    batch.set(doc(db, "ruleVersions", id), sanitizeRuleForCloud(rule), { merge: true });
  }
  await batch.commit();
  return { seeded: true };
}

export { firebaseReady };
