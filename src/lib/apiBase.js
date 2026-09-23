import { Capacitor } from "@capacitor/core";

/** LAN host that builds six-face pack models (override in Settings or env). */
export const DEFAULT_3D_API_BASE = "http://10.22.81.94:3000";

function envBase(name) {
  return (import.meta.env[name] || "").trim().replace(/\/$/, "");
}

/** Laptop and loopback addresses are not reachable by teammates off that Wi-Fi. */
function isPrivateHttpUrl(value) {
  try {
    const host = new URL(value).hostname.toLowerCase();
    if (host === "localhost" || host.endsWith(".local") || host === "0.0.0.0" || host === "::1") return true;
    if (/^127\./.test(host) || /^10\./.test(host) || /^192\.168\./.test(host)) return true;
    if (/^172\.(1[6-9]|2\d|3[0-1])\./.test(host)) return true;
    return false;
  } catch {
    return false;
  }
}

function storedBase(key, fromEnv) {
  try {
    const stored = localStorage.getItem(key);
    if (!stored || !/^https?:\/\//i.test(stored.trim())) return "";
    const clean = stored.trim().replace(/\/$/, "");
    if (fromEnv && isPrivateHttpUrl(clean) && !isPrivateHttpUrl(fromEnv)) return "";
    return clean;
  } catch {
    return "";
  }
}

/**
 * Mobile APK loads from the device origin, so /api must hit a reachable
 * backend (laptop on LAN, or a hosted URL). Web/dev keeps relative /api.
 *
 * Override at runtime: localStorage.setItem("metriq.apiBase", "http://192.168.x.x:3000")
 * Or build-time: VITE_API_BASE_URL=https://your-api.example.com
 * A saved private LAN address does not override a public build-time URL.
 */
export function getApiBase() {
  const fromEnv = envBase("VITE_API_BASE_URL");
  const stored = storedBase("metriq.apiBase", fromEnv);
  if (stored) return stored;
  if (fromEnv) return fromEnv;
  if (Capacitor.isNativePlatform()) {
    return DEFAULT_3D_API_BASE;
  }
  return "";
}

/** Where six-face GLB builds are posted (can differ from general API base). */
export function get3dApiBase() {
  const fromEnv = envBase("VITE_3D_API_BASE");
  const stored = storedBase("metriq.3dApiBase", fromEnv);
  if (stored) return stored;
  if (fromEnv) return fromEnv;
  const general = getApiBase();
  if (general) return general;
  if (Capacitor.isNativePlatform()) {
    return DEFAULT_3D_API_BASE;
  }
  return "";
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
