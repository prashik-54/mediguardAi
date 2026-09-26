/**
 * Client for the FastAPI + MongoDB backend (app/main.py).
 *
 * - In dev, Vite proxies /api → http://127.0.0.1:8000 (see vite.config.js).
 * - When served by FastAPI at /app, /api is same-origin.
 * - Set VITE_API_URL to point at a remote API.
 * - The standalone DDI Analysis Workspace (`api.analyze`) calls the doctor-only
 *   /api/ddi/check endpoint, which shares its Module 2 ground-truth lookup and
 *   Module 3 patient-factor code with the prescription-linked DDI analysis below --
 *   so the two pages can never disagree about a result. Only when the backend is
 *   completely unreachable does it fall back to the built-in offline reference
 *   interaction data (clearly labelled 'reference' in the UI). Either way that
 *   result is never sent to a prescription: prescription DDI + finalization run
 *   server-side (POST /api/prescriptions/{id}/ddi-analysis and /finalize).
 *   Everything else (auth, patients, reviews, notifications) talks directly to the
 *   real backend and surfaces errors to the user.
 */
import { findInteraction, SEVERITY_RANK } from '../data/interactions';

const BASE = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '');
const TOKEN_KEY = 'mediguard.token';

export function getToken() {
  try { return localStorage.getItem(TOKEN_KEY); } catch { return null; }
}
export function setToken(token) {
  try { token ? localStorage.setItem(TOKEN_KEY, token) : localStorage.removeItem(TOKEN_KEY); } catch { /* storage unavailable */ }
}

async function request(path, options = {}, timeoutMs = 10000) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  const token = getToken();
  try {
    const res = await fetch(`${BASE}${path}`, {
      ...options,
      signal: ctrl.signal,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(options.headers || {}),
      },
    });
    if (!res.ok) {
      let detail = `${res.status} ${res.statusText}`;
      let raw = null;
      try {
        const body = await res.json();
        raw = body?.detail ?? null;
        if (typeof raw === 'string') detail = raw;
        else if (raw?.message) detail = raw.message; // structured detail, e.g. duplicate-patient 409
      } catch { /* ignore */ }
      const err = new Error(detail);
      err.status = res.status;
      err.detail = raw;
      throw err;
    }
    if (res.status === 204) return null;
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

/** Maps a UI patient record to the backend PatientClinicalProfile schema
 * (only used to prime the Module 1-4 pipeline before an analysis run). */
export function toBackendProfile(p) {
  return {
    patient_id: p.id,
    age: p.age,
    gender: p.gender,
    kidney_function_egfr: p.egfr,
    liver_function_alt: p.alt,
    existing_diseases: p.conditions || [],
    active_medications: (p.meds || []).map((m) => m.name),
    prescriptive_drugs: [],
    allergy_history: (p.allergies || []).map((a) => a.substance),
  };
}

export const api = {
  health: () => request('/api/health', {}, 2500),

  // ---------------------------------------------------------------- auth
  register: (payload) => request('/api/auth/register', { method: 'POST', body: JSON.stringify(payload) }),
  login: (payload) => request('/api/auth/login', { method: 'POST', body: JSON.stringify(payload) }),
  me: () => request('/api/auth/me'),
  updateProfile: (patch) => request('/api/auth/me', { method: 'PUT', body: JSON.stringify(patch) }),
  changePassword: (currentPassword, newPassword) => request('/api/auth/me/password', {
    method: 'PUT', body: JSON.stringify({ current_password: currentPassword, new_password: newPassword }),
  }),

  // -------------------------------------------------------- organizations
  listOrganizations: () => request('/api/organizations'),
  getOrganization: (id) => request(`/api/organizations/${encodeURIComponent(id)}`),
  createOrganization: (payload) => request('/api/organizations', { method: 'POST', body: JSON.stringify(payload) }),
  updateOrganization: (id, payload) => request(`/api/organizations/${encodeURIComponent(id)}`, { method: 'PUT', body: JSON.stringify(payload) }),
  deleteOrganization: (id) => request(`/api/organizations/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  listOrganizationUsers: (id) => request(`/api/organizations/${encodeURIComponent(id)}/users`),

  // --------------------------------------------------- admin user accounts
  adminListUsers: (params = {}) => {
    const qs = new URLSearchParams(Object.entries(params).filter(([, v]) => v));
    const suffix = qs.toString() ? `?${qs.toString()}` : '';
    return request(`/api/admin/users${suffix}`, {}, 15000);
  },
  adminCreateUser: (payload) => request('/api/admin/users', { method: 'POST', body: JSON.stringify(payload) }),
  adminUpdateUser: (id, payload) => request(`/api/admin/users/${encodeURIComponent(id)}`, { method: 'PUT', body: JSON.stringify(payload) }),
  adminSetUserStatus: (id, status) => request(`/api/admin/users/${encodeURIComponent(id)}/status`, { method: 'POST', body: JSON.stringify({ status }) }),
  adminDeleteUser: (id) => request(`/api/admin/users/${encodeURIComponent(id)}`, { method: 'DELETE' }),

  // ------------------------------------------------------------- patients
  listPatients: () => request('/api/patients'),
  searchPatients: (q, orgId) => request(`/api/patients/search?q=${encodeURIComponent(q)}${orgId ? `&org_id=${encodeURIComponent(orgId)}` : ''}`),
  getPatient: (id) => request(`/api/patients/${encodeURIComponent(id)}`),
  createPatient: (payload) => request('/api/patients', { method: 'POST', body: JSON.stringify(payload) }),
  updatePatient: (id, payload) => request(`/api/patients/${encodeURIComponent(id)}`, { method: 'PUT', body: JSON.stringify(payload) }),
  deletePatient: (id) => request(`/api/patients/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  setMedications: (id, meds) => request(`/api/patients/${encodeURIComponent(id)}/medications`, { method: 'PUT', body: JSON.stringify(meds) }),
  createPatientLogin: (id, payload) => request(`/api/patients/${encodeURIComponent(id)}/login`, { method: 'POST', body: JSON.stringify(payload) }),
  registerPatient: (p) => request('/api/patient/register', { method: 'POST', body: JSON.stringify(toBackendProfile(p)) }),

  // --------------------------------------------------------- appointments
  listAppointments: () => request('/api/appointments'),
  getAppointment: (id) => request(`/api/appointments/${encodeURIComponent(id)}`),
  createAppointment: (payload) => request('/api/appointments', { method: 'POST', body: JSON.stringify(payload) }),
  setAppointmentStatus: (id, status) => request(`/api/appointments/${encodeURIComponent(id)}/status`, { method: 'PATCH', body: JSON.stringify({ status }) }),

  // ------------------------------------------------ doctor consultation (Phase 4)
  myAppointments: (status) => request(`/api/doctor/appointments${status ? `?status=${encodeURIComponent(status)}` : ''}`),
  startEncounter: (appointmentId) => request('/api/encounters', { method: 'POST', body: JSON.stringify({ appointment_id: appointmentId }) }),
  getEncounterForAppointment: (appointmentId) => request(`/api/appointments/${encodeURIComponent(appointmentId)}/encounter`),
  getEncounter: (id) => request(`/api/encounters/${encodeURIComponent(id)}`),
  updateEncounter: (id, patch) => request(`/api/encounters/${encodeURIComponent(id)}`, { method: 'PUT', body: JSON.stringify(patch) }),
  completeEncounter: (id) => request(`/api/encounters/${encodeURIComponent(id)}/complete`, { method: 'POST' }),
  patientEncounters: (patientId) => request(`/api/patients/${encodeURIComponent(patientId)}/encounters`),

  // ------------------------------------------------- prescriptions (Phase 5)
  createPrescription: (encounterId, payload = {}) => request('/api/prescriptions', { method: 'POST', body: JSON.stringify({ encounter_id: encounterId, ...payload }) }),
  encounterPrescriptions: (encounterId) => request(`/api/encounters/${encodeURIComponent(encounterId)}/prescriptions`),
  getPrescription: (id) => request(`/api/prescriptions/${encodeURIComponent(id)}`),
  updatePrescription: (id, patch) => request(`/api/prescriptions/${encodeURIComponent(id)}`, { method: 'PUT', body: JSON.stringify(patch) }),
  newPrescriptionVersion: (id) => request(`/api/prescriptions/${encodeURIComponent(id)}/new-version`, { method: 'POST' }),
  patientPrescriptions: (patientId) => request(`/api/patients/${encodeURIComponent(patientId)}/prescriptions`),

  // -------------------------------------------- doctor-only DDI (Phase 6)
  // Ad-hoc, unsaved check used by the standalone DDI Analysis Workspace --
  // same Module 2 ground-truth lookup + Module 3 patient-factor rules as
  // runDdiAnalysis below (shared server-side code), so the two pages can
  // never disagree about a result.
  checkDdi: (patientId, medications) => request('/api/ddi/check', { method: 'POST', body: JSON.stringify({ patient_id: patientId, medications }) }, 8000),
  runDdiAnalysis: (prescriptionId) => request(`/api/prescriptions/${encodeURIComponent(prescriptionId)}/ddi-analysis`, { method: 'POST' }),
  latestDdiAnalysis: (prescriptionId) => request(`/api/prescriptions/${encodeURIComponent(prescriptionId)}/ddi-analysis`),
  ddiAnalysisHistory: (prescriptionId) => request(`/api/prescriptions/${encodeURIComponent(prescriptionId)}/ddi-analyses`),

  // ------------------------------- high-severity decision + finalize (Phase 7)
  recordDoctorDecision: (prescriptionId, payload) => request(`/api/prescriptions/${encodeURIComponent(prescriptionId)}/decision`, { method: 'POST', body: JSON.stringify(payload) }),
  doctorDecisionHistory: (prescriptionId) => request(`/api/prescriptions/${encodeURIComponent(prescriptionId)}/decisions`),
  finalizePrescription: (prescriptionId) => request(`/api/prescriptions/${encodeURIComponent(prescriptionId)}/finalize`, { method: 'POST' }),

  // ------------------------------------- final patient/admin reports (Phase 8)
  listReports: () => request('/api/reports'),
  getReport: (id) => request(`/api/reports/${encodeURIComponent(id)}`),
  releaseReport: (id) => request(`/api/reports/${encodeURIComponent(id)}/release`, { method: 'POST' }),
  reportFromPrescription: (prescriptionId) => request(`/api/reports/from-prescription/${encodeURIComponent(prescriptionId)}`, { method: 'POST' }),
  logReportAccess: (id, action) => request(`/api/reports/${encodeURIComponent(id)}/log-access`, { method: 'POST', body: JSON.stringify({ action }) }),

  // ------------------------------------------- pharmacy orders (Phase 9)
  sendToPharmacy: (prescriptionId) => request('/api/pharmacy/orders', { method: 'POST', body: JSON.stringify({ prescription_id: prescriptionId }) }),
  listPharmacyOrders: () => request('/api/pharmacy/orders'),
  listAudit: (kind = 'activity', limit = 100) => request(`/api/audit?kind=${encodeURIComponent(kind)}&limit=${limit}`, {}, 15000),
  portalMe: () => request('/api/portal/me'),
  portalAppointments: () => request('/api/portal/appointments'),
  portalMedications: () => request('/api/portal/medications'),
  acceptPharmacyOrder: (id) => request(`/api/pharmacy/orders/${encodeURIComponent(id)}/accept`, { method: 'POST' }),
  dispensePharmacyOrder: (id, payload) => request(`/api/pharmacy/orders/${encodeURIComponent(id)}/dispense`, { method: 'POST', body: JSON.stringify(payload) }),

  // -------------------------------------------------------------- reviews
  listReviews: () => request('/api/reviews'),
  createReview: (payload) => request('/api/reviews', { method: 'POST', body: JSON.stringify(payload) }),
  submitReview: (id, decision) => request(`/api/reviews/${encodeURIComponent(id)}/submit`, { method: 'POST', body: JSON.stringify(decision) }),

  // --------------------------------------------------------- notifications
  listNotifications: () => request('/api/notifications'),
  markNotificationRead: (id) => request(`/api/notifications/${encodeURIComponent(id)}/read`, { method: 'POST' }),
  markAllNotificationsRead: () => request('/api/notifications/read-all', { method: 'POST' }),
  dismissNotification: (id) => request(`/api/notifications/${encodeURIComponent(id)}`, { method: 'DELETE' }),

  // ------------------------------------------------------------ analyses
  listAnalyses: (patientId) => request(`/api/analyses${patientId ? `?patient_id=${encodeURIComponent(patientId)}` : ''}`, {}, 15000),
  dashboardStats: () => request('/api/dashboard/stats', {}, 15000),

  /**
   * Runs the doctor-only /api/ddi/check ad-hoc analysis (the same Module
   * 2-3 ground-truth lookup + patient-factor rules the prescription
   * workspace's /ddi-analysis uses server-side, via shared backend code) --
   * so the standalone DDI Analysis Workspace and the prescription workspace
   * can never disagree about a result. Falls back to the built-in offline
   * reference dataset only when the backend cannot be reached at all.
   * Returns { engine: 'live' | 'reference', pairs: [...] } — never throws.
   */
  async analyze(patient, medNames) {
    try {
      await this.health(); // skip the network round-trip entirely when the API isn't running
      await this.registerPatient(patient).catch(() => {}); // doctor-only sync; other roles still run the analysis
      const result = await this.checkDdi(patient.id, medNames);
      const pairs = (result.pairs || [])
        .filter((p) => p.interaction_found)
        .map((p) => ({
          a: p.drug_a, b: p.drug_b, key: `${p.drug_a}|${p.drug_b}`,
          severity: p.severity === 'Moderate/High' ? 'High' : p.severity,
          type: p.interaction_type || 'Pharmacodynamic',
          confidence: p.confidence ?? 70,
          mechanism: p.mechanism || p.description,
          effects: p.effects?.length ? p.effects : [p.interaction_type].filter(Boolean),
          recommendation: p.recommendation || 'Review with a clinical pharmacist before continuing the combination.',
          evidence: p.evidence || p.data_source || 'DDI engine',
          source: p.data_source || 'DDI engine',
        }))
        .sort((x, y) => SEVERITY_RANK[y.severity] - SEVERITY_RANK[x.severity]);
      return { engine: 'live', pairs };
    } catch {
      // Backend unreachable -- built-in offline reference data only (clearly
      // labelled in the UI as 'reference', never persisted to a prescription).
      const out = [];
      for (let i = 0; i < medNames.length; i += 1) {
        for (let j = i + 1; j < medNames.length; j += 1) {
          const hit = findInteraction(medNames[i], medNames[j]);
          if (hit) out.push({ ...hit, a: medNames[i], b: medNames[j], key: `${medNames[i]}|${medNames[j]}`, source: 'Built-in reference interaction data' });
        }
      }
      out.sort((x, y) => SEVERITY_RANK[y.severity] - SEVERITY_RANK[x.severity]);
      return { engine: 'reference', pairs: out };
    }
  },
};
