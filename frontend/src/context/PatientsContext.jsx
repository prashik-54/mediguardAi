import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { ageFromDob, bmi, fmtDate, daysAgo } from '../lib/format';
import { api } from '../lib/api';
import { useAuth } from './AuthContext';

const Ctx = createContext(null);

/** Turns the registration form into a full patient record. */
function fromForm(form, id) {
  const age = ageFromDob(form.dob) ?? Number(form.age) ?? 0;
  return {
    id,
    name: form.name.trim(), age, dob: form.dob, gender: form.gender, phone: form.phone, email: form.email, city: form.city || '',
    height: Number(form.height) || null, weight: Number(form.weight) || null, bloodGroup: form.bloodGroup,
    egfr: Number(form.egfr) || 90, creatinine: Number(form.creatinine) || 1.0, alt: Number(form.alt) || 25, ast: Number(form.ast) || 25,
    conditions: form.conditions, allergies: form.allergies, meds: form.meds,
    emergency: { name: form.emergencyName, relation: form.emergencyRelation, phone: form.emergencyPhone },
    status: form.status || 'Active',
  };
}

/** Fills in display-friendly fields (formatted dates etc.) for a patient
 * document coming back from the backend/MongoDB. */
function normalize(p) {
  const meds = (p.meds || []).map((m) => ({
    name: m.name,
    dose: m.dose || '',
    freq: m.freq || 'Once daily',
    indication: m.indication || 'Not specified',
    since: m.since || (m.since_days_ago != null ? fmtDate(daysAgo(m.since_days_ago)) : fmtDate(new Date())),
  }));
  const rawHistory = p.history && p.history.length ? p.history : [{ date: null, text: 'Patient registered' }];
  const history = rawHistory.map((h) => ({ date: h.date || fmtDate(new Date()), text: h.text }));
  return {
    ...p,
    meds,
    history,
    conditions: p.conditions || [],
    allergies: p.allergies || [],
    emergency: p.emergency || { name: '', relation: '', phone: '' },
    lastVisitDays: p.lastVisitDays ?? 0,
    registeredDays: p.registeredDays ?? (p.lastVisitDays ?? 0),
    status: p.status || 'Active',
  };
}

/**
 * Patient records come ONLY from the backend (Phase 12): no bundled demo patients, no local-only edits.
 * `loadState`: 'idle' (signed out) | 'loading' | 'live' | 'error'. An empty backend list stays empty.
 * Every mutation waits for the server and throws on failure so callers can show the error.
 */
export function PatientsProvider({ children }) {
  const { user } = useAuth();
  const [patients, setPatients] = useState([]);
  const [loadState, setLoadState] = useState('idle');
  const [loadError, setLoadError] = useState(null);

  const refresh = useCallback(async () => {
    setLoadState((s) => (s === 'live' ? s : 'loading'));
    try {
      const remote = await api.listPatients();
      setPatients(Array.isArray(remote) ? remote.map(normalize) : []);
      setLoadState('live'); setLoadError(null);
    } catch (e) {
      setLoadState('error'); setLoadError(e.message || 'The patient list could not be loaded.');
    }
  }, []);

  // Load real patients once a session exists; drop them on sign-out so nothing leaks between sessions.
  useEffect(() => {
    if (user) refresh();
    else { setPatients([]); setLoadState('idle'); setLoadError(null); }
  }, [user?.id]); // eslint-disable-line

  const addPatient = useCallback(async (form) => {
    const payload = { ...fromForm(form), lastVisitDays: 0, registeredDays: 0, history: [{ date: fmtDate(new Date()), text: 'Patient registered' }] };
    const saved = normalize(await api.createPatient(payload));
    setPatients((list) => [saved, ...list.filter((p) => p.id !== saved.id)]);
    return saved;
  }, []);

  const updatePatient = useCallback(async (id, form) => {
    const current = patients.find((p) => p.id === id);
    if (!current) throw new Error('Patient not found.');
    const saved = normalize(await api.updatePatient(id, { ...current, ...fromForm(form, id) }));
    setPatients((list) => list.map((p) => (p.id === id ? saved : p)));
    return saved;
  }, [patients]);

  const removePatient = useCallback(async (id) => {
    await api.deletePatient(id);
    setPatients((list) => list.filter((p) => p.id !== id));
  }, []);

  const setMeds = useCallback(async (id, meds) => {
    await api.setMedications(id, meds);
    setPatients((list) => list.map((p) => (p.id === id ? { ...p, meds } : p)));
  }, []);

  const getPatient = useCallback((id) => patients.find((p) => p.id === id), [patients]);

  // Re-pulls one patient from the backend and merges it into the cached list.
  // The cached list is only ever loaded once per session (above) and otherwise
  // updated locally by the mutators in this file, so anything that changes a
  // patient record from elsewhere in the app (a doctor's checkup -- clinical
  // profile edits, and medications synced in from a finalized prescription)
  // never reaches this context on its own. Pages that display a single
  // patient's full record call this on mount so they show what's actually on
  // the server rather than a stale snapshot from login.
  const refreshPatient = useCallback(async (id) => {
    const saved = normalize(await api.getPatient(id));
    setPatients((list) => (list.some((p) => p.id === id) ? list.map((p) => (p.id === id ? saved : p)) : [saved, ...list]));
    return saved;
  }, []);

  const value = useMemo(() => ({ patients, loadState, loadError, addPatient, updatePatient, removePatient, setMeds, getPatient, refreshPatient, bmi, refresh }), [patients, loadState, loadError, addPatient, updatePatient, removePatient, setMeds, getPatient, refreshPatient, refresh]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export const usePatients = () => useContext(Ctx);
