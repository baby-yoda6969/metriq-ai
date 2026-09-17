// Phone → laptop scan handoff: talks to the session relay added to
// server/index.js (POST /api/handoff/create, GET/stream /api/handoff/:code,
// POST /api/handoff/:code/scan). The laptop creates a session and listens
// over Server-Sent Events; the phone joins with the same code and posts its
// one matched product once the camera scan completes.

export async function createHandoffSession() {
  const res = await fetch("/api/handoff/create", { method: "POST" });
  if (!res.ok) throw new Error("Couldn't start a handoff session (HTTP " + res.status + ").");
  const data = await res.json();
  return data.code;
}

export async function checkHandoffSession(code) {
  try {
    const res = await fetch("/api/handoff/" + encodeURIComponent(code));
    if (!res.ok) return false;
    const data = await res.json();
    return !!data.valid;
  } catch (e) {
    return false;
  }
}

// Opens an SSE connection for `code` and calls onResult(matchKey) the
// moment the phone posts a scan. Returns a cleanup function that closes the
// connection — always call it on unmount, otherwise the browser keeps the
// connection (and the server keeps the listener) open indefinitely.
export function subscribeHandoff(code, onResult, onError) {
  const source = new EventSource("/api/handoff/" + encodeURIComponent(code) + "/stream");
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
  const res = await fetch("/api/handoff/" + encodeURIComponent(code) + "/scan", {
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

// The URL the phone should open to join a given session: same origin the
// laptop is currently on (so it works over LAN/tunnel exactly as reachable
// today), plus a `handoff` query param main.jsx checks for on load.
export function buildHandoffJoinUrl(code) {
  const url = new URL(window.location.href);
  url.search = "?handoff=" + encodeURIComponent(code);
  url.hash = "";
  return url.toString();
}
