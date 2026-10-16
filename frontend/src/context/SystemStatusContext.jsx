import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api } from '../lib/api';

const Ctx = createContext({ online: null, info: {}, refresh: () => {} });

/** Polls the public /api/health probe so the UI can tell when the server is offline
 *  or running without a database. */
export function SystemStatusProvider({ children }) {
  const [state, setState] = useState({ online: null, info: {} }); // online: null = still checking
  const refresh = useCallback(async () => {
    try { const info = await api.health(); setState({ online: true, info: info || {} }); }
    catch { setState((s) => ({ online: false, info: s.info })); }
  }, []);
  useEffect(() => {
    refresh();
    const t = setInterval(refresh, 60000);
    return () => clearInterval(t);
  }, [refresh]);
  const value = useMemo(() => ({ online: state.online, info: state.info, refresh }), [state, refresh]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export const useSystemStatus = () => useContext(Ctx);
