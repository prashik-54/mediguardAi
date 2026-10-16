import { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Search, UserPlus, Stethoscope, CheckCircle2, ArrowLeft, RotateCcw, Users, ChevronDown, ChevronUp, KeyRound } from 'lucide-react';
import { PageHead, EmptyState, Avatar } from '../../components/ui/Misc';
import { StatusBadge } from '../../components/ui/Badges';
import { TextField } from '../../components/ui/Field';
import { useToast } from '../../context/ToastContext';
import { api } from '../../lib/api';
import { isEmail } from '../../lib/format';
import '../../styles/patients.css';

/** Portal access column used in both the roster and search-results tables.
 * New registrations always get a portal account up front (see
 * `FindPatient` below), so this only ever shows an action for legacy
 * records created before that — the administrator sets the patient's
 * initial password directly here too; there's no invite/temp password. */
function PortalAccessCell({ patient, onGranted }) {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState(patient.email || '');
  const [password, setPassword] = useState('');
  const [saving, setSaving] = useState(false);

  if (patient.has_login) return <StatusBadge status="Portal Access" />;

  if (!open) {
    return <button type="button" className="btn btn-outline btn-sm" onClick={() => setOpen(true)}><KeyRound size={13} />Create account</button>;
  }

  const submit = async () => {
    if (!isEmail(email)) { toast.error('Enter a valid email address.'); return; }
    if (password.length < 8) { toast.error('Set an initial password of at least 8 characters.'); return; }
    setSaving(true);
    try {
      await api.createPatientLogin(patient.id, { email, password, phone: patient.phone || '' });
      toast.success(`Portal account created for ${patient.name}.`);
      setOpen(false);
      onGranted?.(patient.id);
    } catch (ex) { toast.error(ex.message || 'Could not create a portal account.'); }
    finally { setSaving(false); }
  };

  return (
    <div className="row gap-6" onClick={(e) => e.stopPropagation()}>
      <input className="input input-sm" style={{ width: 150 }} placeholder="Patient's email" value={email}
             onChange={(e) => setEmail(e.target.value)} aria-label={`Portal email for ${patient.name}`} />
      <input className="input input-sm" style={{ width: 130 }} placeholder="Initial password" type="text" value={password}
             onChange={(e) => setPassword(e.target.value)} aria-label={`Initial password for ${patient.name}`} />
      <button className="btn btn-primary btn-sm" disabled={saving} onClick={submit}>{saving ? 'Creating…' : 'Create'}</button>
      <button className="btn btn-ghost btn-sm" onClick={() => setOpen(false)}>Cancel</button>
    </div>
  );
}

const STEPS = ['Find patient', 'Visit & doctor', 'Confirm'];

/** All patients already registered at this hospital, so reception can jump
 * straight to an existing record instead of only searching. */
function PatientRoster({ onSelect, saving }) {
  const toast = useToast();
  const [rows, setRows] = useState(null);
  const [open, setOpen] = useState(true);

  useEffect(() => {
    let cancelled = false;
    api.listPatients().then((r) => { if (!cancelled) setRows(r); })
      .catch((ex) => { if (!cancelled) { setRows([]); toast.error(ex.message || 'Could not load the patient list.'); } });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="card card-pad">
      <button type="button" className="row between" style={{ width: '100%', textAlign: 'left', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
              onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        <span className="row gap-8"><Users size={16} /><b>Registered patients{rows ? ` (${rows.length})` : ''}</b></span>
        {open ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
      </button>
      {open && (
        rows === null ? (
          <p className="muted small mt-8">Loading patient list…</p>
        ) : rows.length === 0 ? (
          <p className="muted small mt-8">No patients registered at your hospital yet. Register the first one below.</p>
        ) : (
          <div className="table-wrap mt-8"><table className="table">
            <thead><tr><th>Patient</th><th>ID</th><th>Age</th><th>Phone</th><th>Status</th><th>Portal access</th><th /></tr></thead>
            <tbody>{rows.map((p) => (
              <tr key={p.id}>
                <td className="row gap-8"><Avatar name={p.name} /><b>{p.name}</b></td>
                <td className="mono muted">{p.id}</td><td>{p.age ?? '—'}</td><td>{p.phone || '—'}</td>
                <td><StatusBadge status={p.status || 'Active'} /></td>
                <td><PortalAccessCell patient={p} onGranted={(id) => setRows((rs) => rs.map((r) => (r.id === id ? { ...r, has_login: true } : r)))} /></td>
                <td><button className="btn btn-outline btn-sm" disabled={saving} onClick={() => onSelect(p.id)}>Select</button></td>
              </tr>
            ))}</tbody>
          </table></div>
        )
      )}
    </div>
  );
}

/** Step 1: search-or-register. Returns a selected patient record via onSelect.
 * Registering a new patient is its own page (`RegisterPatient.jsx`) rather
 * than an inline card here, so it isn't buried below the search box and the
 * full patient roster. */
function FindPatient({ onSelect }) {
  const nav = useNavigate();
  const toast = useToast();
  const [q, setQ] = useState('');
  const [results, setResults] = useState(null);
  const [searching, setSearching] = useState(false);
  const [saving, setSaving] = useState(false);

  const runSearch = async (e) => {
    e?.preventDefault();
    const term = q.trim();
    if (!term) { setResults([]); return; }
    setSearching(true);
    try { setResults(await api.searchPatients(term)); }
    catch (ex) { toast.error(ex.message || 'Search failed.'); setResults([]); }
    finally { setSearching(false); }
  };

  const useExisting = async (id) => {
    setSaving(true);
    try { onSelect(await api.getPatient(id)); }
    catch (ex) { toast.error(ex.message || 'Could not load that patient.'); }
    finally { setSaving(false); }
  };

  return (
    <div className="grid" style={{ gap: 16 }}>
      <form className="row gap-8" onSubmit={runSearch} style={{ maxWidth: 480 }}>
        <div className="input-icon grow">
          <Search size={16} />
          <input className="input" placeholder="Search by name, phone, email, patient ID or DOB…" value={q}
                 onChange={(e) => setQ(e.target.value)} aria-label="Search patients" />
        </div>
        <button type="submit" className="btn btn-primary btn-sm" disabled={searching}>{searching ? 'Searching…' : 'Search'}</button>
      </form>

      {results && (
        results.length === 0 ? (
          <EmptyState icon={Search} title="No matching patient" art={false}>
            This person isn’t registered at your hospital yet. Register them to start a visit.
          </EmptyState>
        ) : (
          <div className="table-wrap"><table className="table">
            <thead><tr><th>Patient</th><th>ID</th><th>Phone</th><th>Email</th><th>Status</th><th>Portal access</th><th /></tr></thead>
            <tbody>{results.map((p) => (
              <tr key={p.id}>
                <td className="row gap-8"><Avatar name={p.name} /><b>{p.name}</b></td>
                <td className="mono muted">{p.id}</td><td>{p.phone || '—'}</td><td>{p.email || '—'}</td>
                <td><StatusBadge status={p.status || 'Active'} /></td>
                <td><PortalAccessCell patient={p} onGranted={(id) => setResults((rs) => rs.map((r) => (r.id === id ? { ...r, has_login: true } : r)))} /></td>
                <td><button className="btn btn-outline btn-sm" disabled={saving} onClick={() => useExisting(p.id)}>Select</button></td>
              </tr>
            ))}</tbody>
          </table></div>
        )
      )}

      <PatientRoster saving={saving} onSelect={useExisting} />

      <div className="card card-pad">
        <button className="btn btn-outline" onClick={() => nav('/app/intake/register')}><UserPlus size={15} />Register a new patient</button>
      </div>
    </div>
  );
}

/** Step 2: reason, doctor, date/time. */
function AssignVisit({ patient, onCreated, onBack }) {
  const toast = useToast();
  const [doctors, setDoctors] = useState(null);
  const [reason, setReason] = useState('');
  const [doctorId, setDoctorId] = useState('');
  const [filter, setFilter] = useState('');
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [time, setTime] = useState('');
  const [err, setErr] = useState({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    api.adminListUsers({ role: 'doctor' }).then((rows) => { if (!cancelled) setDoctors(rows); })
      .catch((ex) => { if (!cancelled) { setDoctors([]); toast.error(ex.message || 'Could not load doctors.'); } });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const available = useMemo(() => {
    const rows = (doctors || []).filter((d) => (d.status || 'active') === 'active');
    const t = filter.trim().toLowerCase();
    return t ? rows.filter((d) => `${d.name} ${d.specialization || ''}`.toLowerCase().includes(t)) : rows;
  }, [doctors, filter]);

  const submit = async () => {
    const e = {};
    if (reason.trim().length < 2) e.reason = 'Enter the reason for this visit';
    if (!doctorId) e.doctor = 'Choose a doctor';
    if (!date) e.date = 'Choose an appointment date';
    setErr(e);
    if (Object.keys(e).length) return;
    setSaving(true);
    try {
      const apt = await api.createAppointment({ patient_id: patient.id, doctor_id: doctorId, reason: reason.trim(), appointment_date: date, appointment_time: time || null });
      onCreated(apt, doctors.find((d) => d.id === doctorId));
    } catch (ex) { toast.error(ex.message || 'Could not create the appointment.'); }
    finally { setSaving(false); }
  };

  return (
    <div className="grid" style={{ gap: 16 }}>
      <div className="card card-pad row gap-12">
        <Avatar name={patient.name} />
        <div className="grow"><b>{patient.name}</b><div className="small muted">{patient.id} · {patient.gender}{patient.age ? ` · ${patient.age} yrs` : ''}</div></div>
        <button className="btn btn-ghost btn-sm" onClick={onBack}><ArrowLeft size={14} />Change patient</button>
      </div>

      <div className="field">
        <label>Reason for visit</label>
        <textarea className="textarea" rows={2} placeholder="e.g. Persistent fever and cough for 3 days" value={reason} onChange={(e) => setReason(e.target.value)} />
        {err.reason && <span className="err small" role="alert">{err.reason}</span>}
      </div>

      <div className="grid" style={{ gap: 10 }}>
        <label>Doctor</label>
        <input className="input" placeholder="Filter by name or specialization…" value={filter} onChange={(e) => setFilter(e.target.value)} style={{ maxWidth: 320 }} />
        {doctors === null ? (
          <p className="muted small">Loading available doctors…</p>
        ) : available.length === 0 ? (
          <EmptyState icon={Stethoscope} title="No doctors available" art={false}>No active doctor matches this filter at your hospital.</EmptyState>
        ) : (
          <div className="grid cols-2" style={{ gap: 10 }}>
            {available.map((d) => (
              <button type="button" key={d.id} onClick={() => setDoctorId(d.id)}
                      className={`card card-pad row gap-10 ${doctorId === d.id ? 'selected' : ''}`}
                      style={{ textAlign: 'left', cursor: 'pointer', border: doctorId === d.id ? '2px solid var(--primary)' : undefined }}>
                <Avatar name={d.name} />
                <div><b>{d.name}</b><div className="small muted">{d.specialization || 'General Medicine'}</div></div>
              </button>
            ))}
          </div>
        )}
        {err.doctor && <span className="err small" role="alert">{err.doctor}</span>}
      </div>

      <div className="grid cols-2">
        <TextField label="Appointment date" type="date" value={date} error={err.date} onChange={(e) => setDate(e.target.value)} />
        <TextField label="Appointment time (optional)" type="time" value={time} onChange={(e) => setTime(e.target.value)} hint="Leave blank for a queue-only visit" />
      </div>

      <div className="row gap-8">
        <button className="btn btn-primary" disabled={saving} onClick={submit}>{saving ? 'Creating…' : 'Assign doctor & create visit'}</button>
      </div>
    </div>
  );
}

function Confirmation({ patient, doctor, appointment, onStartOver }) {
  return (
    <div className="grid" style={{ gap: 16 }}>
      <div className="callout callout-ok row gap-10">
        <CheckCircle2 size={20} />
        <div><b>Visit created.</b> {patient.name} is now assigned to {doctor?.name || 'the selected doctor'}.</div>
      </div>
      <div className="review-grid">
        <div className="review-block"><h4>Patient</h4><b>{patient.name}</b><div className="small muted">{patient.id}</div></div>
        <div className="review-block"><h4>Doctor</h4><b>{doctor?.name || appointment.doctor_id}</b><div className="small muted">{doctor?.specialization || ''}</div></div>
        <div className="review-block"><h4>Queue</h4><b>#{appointment.queue_number}</b><div className="small muted">{appointment.appointment_date}{appointment.appointment_time ? ` · ${appointment.appointment_time}` : ''}</div></div>
        <div className="review-block"><h4>Reason</h4><div className="small">{appointment.reason}</div></div>
      </div>
      <button className="btn btn-outline" style={{ justifySelf: 'start' }} onClick={onStartOver}><RotateCcw size={15} />Start a new intake</button>
    </div>
  );
}

export default function PatientIntake() {
  const nav = useNavigate();
  const location = useLocation();
  const [step, setStep] = useState(0);
  const [patient, setPatient] = useState(null);
  const [result, setResult] = useState(null); // { appointment, doctor }

  useEffect(() => { document.title = 'Patient Intake — MediGuard AI'; }, []);

  // A patient just created on the standalone Register New Patient page comes
  // back here via router state — jump straight to "Visit & doctor" for them
  // instead of landing back on the search step.
  useEffect(() => {
    const created = location.state?.patient;
    if (created) {
      setPatient(created);
      setStep(1);
      nav(location.pathname, { replace: true, state: null });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.state]);

  const reset = () => { setStep(0); setPatient(null); setResult(null); };

  return (
    <>
      <PageHead title="Patient Intake" subtitle="Find or register a patient, then assign a doctor and create their visit.">
        <button className="btn btn-outline" onClick={() => nav('/app/dashboard')}>Back to dashboard</button>
      </PageHead>

      <div className="stepper mb-16" aria-label="Progress">
        {STEPS.map((s, i) => <div key={s} className={`step ${i < step ? 'done' : i === step ? 'on' : ''}`}><i />{s}</div>)}
      </div>

      <section className="card card-pad">
        {step === 0 && <FindPatient onSelect={(p) => { setPatient(p); setStep(1); }} />}
        {step === 1 && patient && (
          <AssignVisit patient={patient} onBack={() => setStep(0)}
                       onCreated={(apt, doc) => { setResult({ appointment: apt, doctor: doc }); setStep(2); }} />
        )}
        {step === 2 && result && <Confirmation patient={patient} doctor={result.doctor} appointment={result.appointment} onStartOver={reset} />}
      </section>
    </>
  );
}
