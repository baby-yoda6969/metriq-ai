// Tiny deterministic string hash, used to seed demo/fixture data (the
// fake batch ledger) so the same input always
// produces the same-looking output within a session, without a real backend.
export function hashSeed(str) {
  let h = 0;
  for (let i = 0; i < String(str).length; i++) h = (h * 31 + str.charCodeAt(i)) >>> 0;
  return h;
}
