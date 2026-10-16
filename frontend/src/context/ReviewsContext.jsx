import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { usePatients } from './PatientsContext';
import { useAuth } from './AuthContext';
import { api } from '../lib/api';
import { patientRisk } from '../lib/risk';

const Ctx = createContext(null);

/** Pharmacist review queue — backend-authoritative (Phase 12): no bundled fallback queue, cleared on sign-out.
 *  Mutations wait for the server and throw on failure so callers can show the error. */
export function ReviewsProvider({ children }) {
  const { user } = useAuth();
  const { patients } = usePatients();
  const [raw, setRaw] = useState([]);
  const [error, setError] = useState(null);

  const refresh = useCallback(async () => {
    try {
      const remote = await api.listReviews();
      setRaw(Array.isArray(remote) ? remote : []);
      setError(null);
    } catch (e) { setError(e.message || 'The review queue could not be loaded.'); }
  }, []);

  useEffect(() => { if (user) refresh(); else { setRaw([]); setError(null); } }, [user?.id]); // eslint-disable-line

  const queue = useMemo(() => raw.map((r) => {
    const patient = patients.find((p) => p.id === r.patient_id);
    if (!patient) return null;
    const risk = patientRisk(patient);
    const hoursWaiting = Math.max(0, Math.round((Date.now() / 1000 - (r.created_at || 0)) / 3600));
    return {
      id: r.id, patient, patientId: patient.id, hoursWaiting,
      requestedBy: r.requested_by, priority: r.priority || (risk.level === 'High' ? 'High' : risk.level === 'Medium' ? 'Medium' : 'Low'),
      interactions: risk.interactions, risk, status: r.status || 'Pending', review: r.review || undefined,
    };
  }).filter(Boolean), [raw, patients]);

  const submitReview = useCallback(async (id, review) => {
    await api.submitReview(id, review);
    await refresh();
  }, [refresh]);

  const requestReview = useCallback(async (patientId, { priority = 'Medium', note } = {}) => {
    const created = await api.createReview({ patient_id: patientId, priority, note });
    await refresh();
    return created;
  }, [refresh]);

  const pending = queue.filter((q) => q.status === 'Pending');
  const value = useMemo(() => ({ queue, pending, error, refresh, submitReview, requestReview }), [queue, pending, error, refresh, submitReview, requestReview]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export const useReviews = () => useContext(Ctx);
