import { apiUrl } from "./apiBase.js";

export async function createHandoffSession() {
  const res = await fetch(apiUrl("/api/handoff/create"), { method: "POST" });
  if (!res.ok) throw new Error("Couldn't start a handoff session (HTTP " + res.status + ").");
  const data = await res.json();
  return data.code;
}

export async function checkHandoffSession(code) {
  try {
    const res = await fetch(apiUrl("/api/handoff/" + encodeURIComponent(code)));
    if (!res.ok) return false;
    const data = await res.json();
    return !!data.valid;
  } catch (e) {
    return false;
  }
}

export function subscribeHandoff(code, onResult, onError) {
  const source = new EventSource(apiUrl("/api/handoff/" + encodeURIComponent(code) + "/stream"));
  source.addEventListener("scan", (e) => {
    try {
      const data = JSON.parse(e.data);
      if (data && typeof data.match === "string") onResult(data.match);
    } catch (err) {
      // Malformed payload — ignore rather than crash the listener.
    }
  });
  source.onerror = () => {
    if (onError) onError();
  };
  return () => source.close();
}

export async function sendHandoffScan(code, match) {
  const res = await fetch(apiUrl("/api/handoff/" + encodeURIComponent(code) + "/scan"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ match }),
  });
  if (!res.ok) {
    let message = "Couldn't send the scan result (HTTP " + res.status + ").";
    try {
      const data = await res.json();
      if (data && data.error) message = data.error;
    } catch (e) {
      // Keep the generic message above.
    }
    throw new Error(message);
  }
}

export function buildHandoffJoinUrl(code) {
  const url = new URL(window.location.href);
  url.search = "?handoff=" + encodeURIComponent(code);
  url.hash = "";
  return url.toString();
}
