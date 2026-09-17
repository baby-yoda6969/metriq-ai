import { createContext, useContext, useState } from 'react';
import { ROLE_ROUTES } from './routes.js';
const SessionContext = createContext(null);
const KEY = 'metriq-website-demo-session';
function readSession() {
  try {
    const value = JSON.parse(sessionStorage.getItem(KEY));
    return value && ROLE_ROUTES[value.role] && typeof value.name === 'string' && typeof value.employeeId === 'string' ? value : null;
  } catch { return null; }
}
// Demo identity only, never a password or authentication token. Real server
// authorization must replace this adapter when the simulated login is replaced.
export function SessionProvider({ children }) {
  const [session, setSession] = useState(readSession);
  function signIn({ name, employeeId, role }) {
    const next = { name, employeeId, role };
    setSession(next);
    try { sessionStorage.setItem(KEY, JSON.stringify(next)); } catch { /* memory fallback */ }
  }
  function signOut() {
    setSession(null);
    try { sessionStorage.removeItem(KEY); } catch { /* memory fallback */ }
  }
  return <SessionContext.Provider value={{ session, signIn, signOut }}>{children}</SessionContext.Provider>;
}
export function useSession() { return useContext(SessionContext); }
