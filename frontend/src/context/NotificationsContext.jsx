import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useAuth } from './AuthContext';
import { api } from '../lib/api';
import { useToast } from './ToastContext';

const Ctx = createContext(null);

function relTime(createdAt) {
  if (!createdAt) return 'Just now';
  const seconds = Date.now() / 1000 - createdAt;
  if (seconds < 90) return 'Just now';
  const hours = seconds / 3600;
  if (hours < 1) return `${Math.max(1, Math.round(seconds / 60))} min ago`;
  if (hours < 24) return `${Math.round(hours)} hour${hours >= 1.5 ? 's' : ''} ago`;
  const days = Math.round(hours / 24);
  if (days === 1) return 'Yesterday';
  if (days < 7) return `${days} days ago`;
  return `${Math.round(days / 7)} week${days >= 14 ? 's' : ''} ago`;
}

export function NotificationsProvider({ children }) {
  const { user } = useAuth();
  const toast = useToast();
  const [raw, setRaw] = useState([]);
  const [error, setError] = useState(null);

  const refresh = useCallback(async () => {
    try {
      const remote = await api.listNotifications();
      setRaw(Array.isArray(remote) ? remote : []);
      setError(null);
    } catch (e) { setError(e.message || 'Notifications could not be loaded.'); }
  }, []);

  useEffect(() => { if (user) refresh(); else { setRaw([]); setError(null); } }, [user?.id]); // eslint-disable-line
  // Light polling so alerts raised by other users (e.g. a doctor's analysis
  // triggering a pharmacist notification) show up without a manual refresh.
  useEffect(() => {
    if (!user) return undefined;
    const t = setInterval(refresh, 20000);
    return () => clearInterval(t);
  }, [user?.id, refresh]);

  const items = useMemo(() => raw.map((n) => ({ ...n, time: relTime(n.created_at) })), [raw]);

  const markRead = useCallback((id) => {
    setRaw((list) => list.map((n) => (n.id === id ? { ...n, unread: false } : n)));
    api.markNotificationRead(id).catch((e) => { toast.error(e.message || 'Could not update the notification — reloaded the latest state.'); refresh(); });
  }, [refresh, toast]);
  const markAllRead = useCallback(() => {
    setRaw((list) => list.map((n) => ({ ...n, unread: false })));
    api.markAllNotificationsRead().catch((e) => { toast.error(e.message || 'Could not update the notification — reloaded the latest state.'); refresh(); });
  }, [refresh, toast]);
  const dismiss = useCallback((id) => {
    setRaw((list) => list.filter((n) => n.id !== id));
    api.dismissNotification(id).catch((e) => { toast.error(e.message || 'Could not update the notification — reloaded the latest state.'); refresh(); });
  }, [refresh, toast]);

  const value = useMemo(() => ({ items, error, unread: items.filter((n) => n.unread).length, markRead, markAllRead, dismiss, refresh }), [items, error, markRead, markAllRead, dismiss, refresh]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export const useNotifications = () => useContext(Ctx);
