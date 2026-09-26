import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';
import { CircleCheck, CircleAlert, Info } from 'lucide-react';

const ToastCtx = createContext(null);
const ICONS = { success: CircleCheck, error: CircleAlert, info: Info };

export function ToastProvider({ children }) {
  const [items, setItems] = useState([]);
  const idRef = useRef(0);

  const push = useCallback((message, kind = 'success') => {
    const id = (idRef.current += 1);
    setItems((s) => [...s, { id, message, kind }]);
    setTimeout(() => setItems((s) => s.filter((t) => t.id !== id)), 3800);
  }, []);

  const api = useMemo(() => ({
    success: (m) => push(m, 'success'),
    error: (m) => push(m, 'error'),
    info: (m) => push(m, 'info'),
  }), [push]);

  return (
    <ToastCtx.Provider value={api}>
      {children}
      <div className="toasts" role="status" aria-live="polite">
        {items.map((t) => {
          const I = ICONS[t.kind];
          return <div key={t.id} className={`toast ${t.kind}`}><I size={18} /><span>{t.message}</span></div>;
        })}
      </div>
    </ToastCtx.Provider>
  );
}

export const useToast = () => useContext(ToastCtx);
