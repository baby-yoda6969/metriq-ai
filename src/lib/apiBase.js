import { Capacitor } from "@capacitor/core";

/** LAN host that builds six-face pack models (override in Settings or env). */
export const DEFAULT_3D_API_BASE = "http://10.22.81.94:3000";

/**
 * Mobile APK loads from the device origin, so /api must hit a reachable
 * backend (laptop on LAN, or a hosted URL). Web/dev keeps relative /api.
 *
 * Override at runtime: localStorage.setItem("metriq.apiBase", "http://192.168.x.x:3000")
 * Or build-time: VITE_API_BASE_URL=https://your-api.example.com
 */
export function getApiBase() {
  try {
    const stored = localStorage.getItem("metriq.apiBase");
    if (stored && /^https?:\/\//i.test(stored.trim())) {
      return stored.trim().replace(/\/$/, "");
    }
  } catch {
    /* ignore */
  }
  const fromEnv = (import.meta.env.VITE_API_BASE_URL || "").trim().replace(/\/$/, "");
  if (fromEnv) return fromEnv;
  if (Capacitor.isNativePlatform()) {
    return DEFAULT_3D_API_BASE;
  }
  return "";
}

/** Where six-face GLB builds are posted (can differ from general API base). */
export function get3dApiBase() {
  try {
    const stored = localStorage.getItem("metriq.3dApiBase");
    if (stored && /^https?:\/\//i.test(stored.trim())) {
      return stored.trim().replace(/\/$/, "");
    }
  } catch {
    /* ignore */
  }
  const fromEnv = (import.meta.env.VITE_3D_API_BASE || "").trim().replace(/\/$/, "");
  if (fromEnv) return fromEnv;
  const general = getApiBase();
  if (general) return general;
  return DEFAULT_3D_API_BASE;
}

export function apiUrl(path) {
  const base = getApiBase();
  const p = path.startsWith("/") ? path : `/${path}`;
  return base ? `${base}${p}` : p;
}

export function threeDApiUrl(path) {
  const base = get3dApiBase();
  const p = path.startsWith("/") ? path : `/${path}`;
  return `${base}${p}`;
}

export function isNativeApp() {
  return Capacitor.isNativePlatform();
}
