import { Capacitor } from "@capacitor/core";

/**
 * Mobile APK loads from the device origin, so /api must hit a reachable
 * backend (laptop on LAN, or a hosted URL). Web/dev keeps relative /api.
 *
 * Override at runtime: localStorage.setItem("metriq.apiBase", "http://192.168.x.x:8787")
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
    // Sensible demo default: host machine loopback alias used by Android emulator.
    // Physical devices should set metriq.apiBase to the laptop's LAN IP.
    return "http://10.0.2.2:8787";
  }
  return "";
}

export function apiUrl(path) {
  const base = getApiBase();
  const p = path.startsWith("/") ? path : `/${path}`;
  return base ? `${base}${p}` : p;
}

export function isNativeApp() {
  return Capacitor.isNativePlatform();
}
