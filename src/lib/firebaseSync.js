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
import { getDownloadURL, ref, uploadString } from "firebase/storage";
import { auth, db, firebaseReady, initAnalytics, storage } from "./firebase.js";

const MAX_INLINE_IMAGE = 280_000;

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

function isDataUrl(value) {
  return typeof value === "string" && value.startsWith("data:");
}

function looksHeavy(value) {
  return typeof value === "string" && (value.length > MAX_INLINE_IMAGE || isDataUrl(value) && value.length > 120_000);
}

async function uploadDataUrl(path, dataUrl) {
  if (!storage || !isDataUrl(dataUrl)) return dataUrl;
  try {
    const storageRef = ref(storage, path);
    await uploadString(storageRef, dataUrl, "data_url");
    return getDownloadURL(storageRef);
  } catch (err) {
    // Storage may be unset on the project — keep a trimmed inline copy when possible.
    const msg = String(err?.message || err || "");
    if (/storage|bucket|404|403|unauthorized/i.test(msg)) {
      return looksHeavy(dataUrl) ? null : dataUrl;
    }
    throw err;
  }
}

/**
 * Move large inline data URLs (photos / GLB) into Storage and keep URLs in Firestore.
 */
export async function prepareScanForCloud(scan, { uid } = {}) {
  const next = { ...scan };
  const scanId = String(scan.id || `scan-${Date.now()}`);
  const owner = uid || scan.ownerUid || auth?.currentUser?.uid || "anon";
  const base = `scans/${owner}/${scanId}`;

  next.id = scanId;
  next.ownerUid = owner;
  next.syncedAt = new Date().toISOString();

  try {
    if (looksHeavy(next.imageDataUrl)) {
      next.imageDataUrl = await uploadDataUrl(`${base}/front.jpg`, next.imageDataUrl);
      next.imageSynced = true;
    }
  } catch {
    if (typeof next.imageDataUrl === "string" && next.imageDataUrl.length > MAX_INLINE_IMAGE) {
      next.imageDataUrl = null;
      next.imageSynced = false;
    }
  }

  if (next.additionalPhotos && typeof next.additionalPhotos === "object") {
    const photos = { ...next.additionalPhotos };
    for (const key of Object.keys(photos)) {
      try {
        if (looksHeavy(photos[key])) {
          photos[key] = await uploadDataUrl(`${base}/${key}.jpg`, photos[key]);
        }
      } catch {
        if (typeof photos[key] === "string" && photos[key].length > MAX_INLINE_IMAGE) photos[key] = null;
      }
    }
    next.additionalPhotos = photos;
  }

  if (next.packModel && typeof next.packModel === "object") {
    const model = { ...next.packModel };
    try {
      if (looksHeavy(model.glb) || (typeof model.glb === "string" && model.glb.startsWith("data:model"))) {
        model.glb = await uploadDataUrl(`${base}/pack-model.glb`, model.glb);
        model.glbSynced = true;
      }
    } catch {
      if (typeof model.glb === "string" && model.glb.length > MAX_INLINE_IMAGE) {
        model.glb = null;
        model.glbSynced = false;
      }
    }
    if (Array.isArray(model.facePhotos)) {
      const faces = [];
      for (let i = 0; i < model.facePhotos.length; i++) {
        const face = { ...model.facePhotos[i] };
        try {
          if (looksHeavy(face.dataUrl)) {
            face.dataUrl = await uploadDataUrl(`${base}/faces/${face.face || i}.jpg`, face.dataUrl);
          }
        } catch {
          if (typeof face.dataUrl === "string" && face.dataUrl.length > MAX_INLINE_IMAGE) face.dataUrl = null;
        }
        faces.push(face);
      }
      model.facePhotos = faces;
    }
    next.packModel = model;
  }

  next.updatedAt = new Date().toISOString();
  return stripUndefined(next);
}

/** Sync-safe strip without Storage (used for batch seed). */
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
  if (next.packModel?.glb && typeof next.packModel.glb === "string" && next.packModel.glb.length > MAX_INLINE_IMAGE) {
    next.packModel = { ...next.packModel, glb: null, glbSynced: false };
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
    settings: data.settings || null,
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

export async function upsertUserSettings(uid, settings) {
  if (!db || !uid) return;
  await setDoc(
    doc(db, "users", uid),
    {
      settings: stripUndefined({
        ...settings,
        updatedAt: new Date().toISOString(),
      }),
      updatedAt: new Date().toISOString(),
      syncedAt: serverTimestamp(),
    },
    { merge: true }
  );
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

export function subscribeUserSettings(uid, onChange, onError) {
  if (!db || !uid) {
    onChange(null);
    return () => {};
  }
  return onSnapshot(
    doc(db, "users", uid),
    (snap) => {
      if (!snap.exists()) {
        onChange(null);
        return;
      }
      onChange(snap.data()?.settings || null);
    },
    (err) => onError?.(err)
  );
}

export async function upsertScan(scan, { uid } = {}) {
  if (!db || !scan?.id) return null;
  const payload = await prepareScanForCloud(scan, { uid });
  await setDoc(doc(db, "scans", String(payload.id)), payload, { merge: true });
  return payload;
}

export async function upsertScans(scans, { uid } = {}) {
  if (!db || !scans?.length) return;
  // Storage uploads can't batch with Firestore writes — prepare then batch metadata.
  const prepared = [];
  for (const scan of scans) {
    if (!scan?.id) continue;
    prepared.push(await prepareScanForCloud(scan, { uid }));
  }
  const batch = writeBatch(db);
  for (const scan of prepared) {
    batch.set(doc(db, "scans", String(scan.id)), scan, { merge: true });
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
