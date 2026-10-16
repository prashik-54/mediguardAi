import { useCallback, useEffect, useState } from 'react';
import { api } from './api';

const LABELS = {
  'auth.login': 'Signed in', 'auth.login_failed': 'Failed sign-in', 'auth.signup': 'Account signed up',
  'user.create': 'Account created', 'user.update': 'Account updated', 'user.status': 'Account status changed',
  'user.delete': 'Account deleted', 'user.profile_update': 'Profile updated',
  'patient.create': 'Patient registered', 'patient.update': 'Patient record updated', 'patient.delete': 'Patient record deleted',
  'appointment.create': 'Doctor assigned / appointment created', 'appointment.status': 'Appointment status changed',
  'encounter.start': 'Consultation started', 'encounter.update': 'Consultation updated', 'encounter.complete': 'Consultation completed',
  'prescription.create': 'Prescription drafted', 'prescription.update': 'Prescription edited', 'prescription.new_version': 'Prescription new version',
  'prescription.finalize': 'Prescription finalized', 'ddi_analysis.run': 'DDI analysis run', 'doctor_decision.record': 'Doctor decision recorded',
  'report.generate': 'Report generated', 'report.release': 'Report released', 'report.print': 'Report printed', 'report.download': 'Report downloaded',
  'pharmacy_order.create': 'Sent to pharmacy', 'pharmacy_order.accept': 'Pharmacy order accepted', 'pharmacy_order.dispense': 'Medicines dispensed',
};
export const auditLabel = (a) => LABELS[a] || a;
export const auditSeverity = (r) => (r.action === 'auth.login_failed' ? 'High' : r.action === 'user.delete' || r.metadata?.status === 'suspended' ? 'Moderate' : 'Low');
export const auditTime = (r) => (r.created_at ? new Date(r.created_at * 1000).toLocaleString() : '—');
export const auditDetail = (r) => Object.entries(r.metadata || {}).map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(', ') : v}`).join(' · ');

/** Backend audit feed. rows === null while loading; error is a message string. */
export function useAudit(kind = 'activity', limit = 100) {
  const [rows, setRows] = useState(null);
  const [error, setError] = useState('');
  const load = useCallback(async () => {
    setError('');
    try { setRows(await api.listAudit(kind, limit)); } catch (e) { setRows([]); setError(e.message || 'Could not load the audit trail.'); }
  }, [kind, limit]);
  useEffect(() => { load(); }, [load]);
  return { rows, error, reload: load };
}

/** Where a notification's reference should take the user (reference-only notifications). */
export function notifRoute(n, role) {
  const t = n.reference_type;
  if (t === 'report') return '/app/reports';
  if (t === 'pharmacy_order') return '/app/pharmacy';
  if (t === 'medication') return '/app/medications';
  if (t === 'appointment') return role === 'patient' ? '/app/appointments' : role === 'doctor' ? '/app/queue' : null;
  return null;
}
