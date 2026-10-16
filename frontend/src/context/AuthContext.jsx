import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api, getToken, setToken } from '../lib/api';

const AuthCtx = createContext(null);
const USER_KEY = 'mediguard.user';

function loadCachedUser() {
  try { return JSON.parse(localStorage.getItem(USER_KEY)) || null; } catch { return null; }
}
function cacheUser(user) {
  try { user ? localStorage.setItem(USER_KEY, JSON.stringify(user)) : localStorage.removeItem(USER_KEY); } catch { /* storage unavailable */ }
}

/**
 * Real, backend-backed auth. `login`/`signup` call the FastAPI + MongoDB
 * API (see app/modules/module_auth.py) and store a JWT; the rest of the
 * app only reads `user.role` and `user.patientId`.
 */
export function AuthProvider({ children }) {
  const [user, setUser] = useState(loadCachedUser);
  const [ready, setReady] = useState(false);

  // Revalidate the cached session against the backend on load (token may
  // have expired, or the server may have restarted with a fresh in-memory
  // fallback store).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const token = getToken();
      if (!token) { setReady(true); return; }
      try {
        const fresh = await api.me();
        if (!cancelled) { setUser(fresh); cacheUser(fresh); }
      } catch {
        if (!cancelled) { setToken(null); setUser(null); cacheUser(null); }
      } finally {
        if (!cancelled) setReady(true);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const login = useCallback(async ({ email, password }) => {
    const { token, user: next } = await api.login({ email, password });
    setToken(token); setUser(next); cacheUser(next);
    return next;
  }, []);

  const signup = useCallback(async ({ name, email, password, role, org }) => {
    const { token, user: next } = await api.register({ name, email, password, role, org });
    setToken(token); setUser(next); cacheUser(next);
    return next;
  }, []);

  const logout = useCallback(() => { setToken(null); setUser(null); cacheUser(null); }, []);

  const updateProfile = useCallback(async (patch) => {
    const next = await api.updateProfile(patch);
    setUser(next); cacheUser(next);
    return next;
  }, []);

  const value = useMemo(() => ({ user, ready, login, signup, logout, updateProfile }), [user, ready, login, signup, logout, updateProfile]);
  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>;
}

export const useAuth = () => useContext(AuthCtx);
