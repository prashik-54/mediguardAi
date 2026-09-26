import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Pencil, FlaskConical, Plus, Trash2, UserX, FileText } from 'lucide-react';
import { Avatar, EmptyState } from '../../components/ui/Misc';
import { Tabs } from '../../components/ui/Tabs';
import { RiskBadge, SeverityBadge, StatusBadge } from '../../components/ui/Badges';
import { SelectField } from '../../components/ui/Field';
import PatientForm, { toForm } from './PatientForm';
import { usePatients } from '../../context/PatientsContext';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { api } from '../../lib/api';
import { CATALOG, FREQUENCIES, findDrug } from '../../data/catalog';
import { analyzeMedications, kidneyStatus, liverStatus, patientRisk } from '../../lib/risk';
import { bmi, bmiLabel, daysAgo, fmtDate } from '../../lib/format';
import '../../styles/patients.css';

const TONE_BADGE = { low: 'badge-low', moderate: 'badge-moderate', high: 'badge-high' };

export default function PatientProfile() {
  const { id } = useParams();
  const nav = useNavigate();
  const toast = useToast();
  const { user } = useAuth();
  const [params, setParams] = useSearchParams();
  const { getPatient, updatePatient, setMeds, refreshPatient } = usePatients();
  const p = getPatient(id);
  const [tab, setTab] = useState(params.get('tab') || 'overview');
  const [editing, setEditing] = useState(false);
  const [pick, setPick] = useState({ name: '', dose: '', freq: 'Once daily' });
  const canEdit = user.role === 'doctor' || user.role === 'administrator';
  const canEditMeds = user.role === 'doctor';
  const isDoctor = user.role === 'doctor';
  useEffect(() => { document.title = `${p?.name || 'Patient'} — MediGuard AI`; }, [p]);
  // The cached patient list can be stale (e.g. a completed checkup synced new
  // meds/clinical values server-side) -- pull this one record fresh whenever
  // its profile is opened.
  useEffect(() => { refreshPatient(id).catch(() => {}); }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  const risk = useMemo(() => (p ? patientRisk(p) : null), [p]);
  // Real saved analyses from the backend (doctor / pharmacist / platform admin only) — nothing is synthesized here.
  const [history, setHistory] = useState([]);
  const [histState, setHistState] = useState('loading');
  const canSeeAnalyses = ['doctor', 'pharmacist', 'admin'].includes(user.role);
  useEffect(() => {
    if (!p || !canSeeAnalyses) { setHistState('na'); return undefined; }
    let live = true; setHistState('loading');
    api.listAnalyses(p.id).then((rows) => { if (live) { setHistory(Array.isArray(rows) ? rows : []); setHistState('ok'); } }).catch(() => { if (live) setHistState('error'); });
    return () => { live = false; };
  }, [p?.id, canSeeAnalyses]); // eslint-disable-line

  if (!p) return <EmptyState icon={UserX} title="Patient not found" action={<Link className="btn btn-primary" to="/app/patients">Back to patients</Link>}>This record may have been deleted or the link is incorrect.</EmptyState>;

  const kidney = kidneyStatus(p.egfr); const liver = liverStatus(p.alt); const b = bmi(p.height, p.weight);
  const addMed = async () => {
    const d = findDrug(pick.name);
    if (!d) return toast.error('Choose a medication from the list.');
    if (p.meds.some((m) => m.name === d.name)) return toast.error(`${d.name} is already on the list.`);
    const meds = [...p.meds, { name: d.name, dose: pick.dose || d.dose, freq: pick.freq, indication: 'Not specified', since: fmtDate(new Date()) }];
    try { await setMeds(p.id, meds); } catch (ex) { return toast.error(ex.message || 'The medication list could not be saved.'); }
    const found = analyzeMedications(meds.map((m) => m.name)).filter((i) => i.a === d.name || i.b === d.name);
    found.length ? toast.error(`${d.name} added — ${found.length} possible interaction${found.length > 1 ? 's' : ''} found.`) : toast.success(`${d.name} added.`);
    setPick({ name: '', dose: '', freq: 'Once daily' });
  };
  const changeTab = (t) => { setTab(t); setParams(t === 'overview' ? {} : { tab: t }, { replace: true }); };

  return (
    <>
      <nav className="breadcrumbs mb-8" aria-label="Breadcrumb"><Link to="/app/patients">Patients</Link><span>/</span><span className="cur">{p.name}</span></nav>
      <div className="page-head">
        <div className="profile-head">
          <Avatar name={p.name} size="lg" />
          <div>
            <h1>{p.name}</h1>
            <div className="row gap-8 wrap small muted mt-4"><span className="pid">{p.id}</span><span>·</span><span>{p.gender}</span><span>·</span><span>{p.age} years</span><StatusBadge status={p.status} /><RiskBadge level={risk.level} /></div>
          </div>
        </div>
        <div className="page-actions">
          {isDoctor && <button className="btn btn-outline" onClick={() => nav(`/app/ddi?patient=${p.id}`)}><FlaskConical size={15} />Run DDI analysis</button>}
          {canEdit && <button className="btn btn-primary" onClick={() => setEditing(true)}><Pencil size={15} />Edit Profile</button>}
        </div>
      </div>

      <div className="card card-pad" style={{ paddingBottom: 0 }}>
        <Tabs value={tab} onChange={changeTab} tabs={[{ id: 'overview', label: 'Overview' }, { id: 'medications', label: 'Medications' }, { id: 'history', label: 'History' }, { id: 'analysis', label: 'Analysis' }, { id: 'reports', label: 'Reports' }]} />
      </div>

      {tab === 'overview' && (
        <div className="mt-16 grid" style={{ gap: 16 }}>
          <div className="profile-grid">
            <section className="card card-pad"><h2 className="card-title mb-8">Personal Information</h2>
              <dl className="kvs">
                <div className="kv"><dt>Name</dt><dd>{p.name}</dd></div><div className="kv"><dt>Age / Gender</dt><dd>{p.age} / {p.gender}</dd></div>
                <div className="kv"><dt>Phone</dt><dd>{p.phone || '—'}</dd></div><div className="kv"><dt>Email</dt><dd className="truncate" style={{ maxWidth: 190 }}>{p.email || '—'}</dd></div>
                <div className="kv"><dt>City</dt><dd>{p.city || '—'}</dd></div>
                <div className="kv"><dt>Emergency contact</dt><dd>{p.emergency?.name ? `${p.emergency.name} (${p.emergency.relation})` : '—'}<div className="tiny muted" style={{ fontWeight: 500 }}>{p.emergency?.phone}</div></dd></div>
              </dl>
            </section>
            <section className="card card-pad"><h2 className="card-title mb-8">Clinical Information</h2>
              <dl className="kvs">
                <div className="kv"><dt>Height</dt><dd>{p.height ? `${p.height} cm` : '—'}</dd></div><div className="kv"><dt>Weight</dt><dd>{p.weight ? `${p.weight} kg` : '—'}</dd></div>
                <div className="kv"><dt>BMI</dt><dd>{b ?? '—'} <span className="muted" style={{ fontWeight: 500 }}>({bmiLabel(b)})</span></dd></div><div className="kv"><dt>Blood group</dt><dd>{p.bloodGroup || '—'}</dd></div>
              </dl>
              <div className="label mt-12 mb-8">Medical conditions</div>
              <div className="chips">{p.conditions.length ? p.conditions.map((c) => <span className="tag" key={c}>{c}</span>) : <span className="muted small">None recorded</span>}</div>
            </section>
            <div className="col gap-16">
              <section className="card card-pad"><div className="row between"><h2 className="card-title">Kidney Function</h2><span className={`badge ${TONE_BADGE[kidney.tone]}`}>{kidney.label}</span></div>
                <div className="lab"><span className="muted small">eGFR</span><span className="v">{p.egfr}<span className="u">mL/min/1.73m²</span></span></div>
                <div className="lab"><span className="muted small">Creatinine</span><span className="v">{p.creatinine}<span className="u">mg/dL</span></span></div></section>
              <section className="card card-pad"><div className="row between"><h2 className="card-title">Liver Function</h2><span className={`badge ${TONE_BADGE[liver.tone]}`}>{liver.label}</span></div>
                <div className="lab"><span className="muted small">ALT</span><span className="v">{p.alt}<span className="u">U/L</span></span></div>
                <div className="lab"><span className="muted small">AST</span><span className="v">{p.ast}<span className="u">U/L</span></span></div></section>
            </div>
          </div>
          <div className="profile-grid">
            <section className="card card-pad"><h2 className="card-title mb-12">Allergies</h2>
              {p.allergies.length ? <div className="col gap-8">{p.allergies.map((a) => <div className="med-mini" key={a.substance}><div className="grow"><b>{a.substance}</b><span>{a.reaction}</span></div><SeverityBadge level={a.severity === 'Severe' ? 'High' : a.severity === 'Moderate' ? 'Moderate' : 'Low'} noDot /></div>)}</div> : <p className="muted small">No known allergies.</p>}
            </section>
            <section className="card card-pad" style={{ gridColumn: 'span 2' }}>
              <div className="row between mb-12"><h2 className="card-title">Current Medications ({p.meds.length})</h2><button className="link-btn" onClick={() => changeTab('medications')}>Manage</button></div>
              <div className="grid cols-2" style={{ gap: 10 }}>{p.meds.map((m) => <div className="med-mini" key={m.name}><div className="grow"><b>{m.name} {m.dose}</b><span>{m.indication}</span></div></div>)}{!p.meds.length && <p className="muted small">No active medications.</p>}</div>
            </section>
          </div>
          <section className="card card-pad">
            <div className="row between wrap gap-12"><div><h2 className="card-title">Recent Analysis</h2><p className="small muted mt-4">Indicative check of the current medication list (built-in reference interaction data) · {risk.interactions.length ? `${risk.interactions.length} interaction${risk.interactions.length > 1 ? 's' : ''} — highest ${risk.interactions[0].severity}` : 'No interactions found'}</p></div>
              <button className="btn btn-outline btn-sm" onClick={() => changeTab('analysis')}>{risk.interactions.length ? `${risk.interactions.length} interactions · View details` : 'View history'}</button></div>
          </section>
        </div>
      )}

      {tab === 'medications' && (
        <section className="card card-flush mt-16">
          {!canEditMeds && <p className="muted small" style={{ padding: '12px 16px 0' }}>Medications are prescribed and managed by the treating doctor.</p>}
          {canEditMeds && (
            <div className="filters" style={{ alignItems: 'end' }}>
              <div className="field" style={{ flex: '1 1 200px' }}><label htmlFor="pm-name">Add medication</label><input id="pm-name" className="input" list="pm-list" placeholder="Search generic or brand name" value={pick.name} onChange={(e) => setPick({ ...pick, name: e.target.value })} /><datalist id="pm-list">{CATALOG.map((d) => <option key={d.name} value={d.name}>{d.brands.join(', ')}</option>)}</datalist></div>
              <div className="field" style={{ width: 110 }}><label htmlFor="pm-dose">Dose</label><input id="pm-dose" className="input" placeholder={findDrug(pick.name)?.dose || '500mg'} value={pick.dose} onChange={(e) => setPick({ ...pick, dose: e.target.value })} /></div>
              <SelectField label="Frequency" value={pick.freq} options={FREQUENCIES} onChange={(e) => setPick({ ...pick, freq: e.target.value })} />
              <button className="btn btn-navy" onClick={addMed}><Plus size={15} />Add</button>
            </div>
          )}
          {p.meds.length === 0 ? <EmptyState title="No medications recorded">Add a medication to run an interaction check.</EmptyState> : (
            <div className="table-wrap"><table className="table"><thead><tr><th>Medication</th><th>Dose</th><th>Frequency</th><th>Indication</th><th>Since</th>{canEditMeds && <th />}</tr></thead>
              <tbody>{p.meds.map((m) => <tr key={m.name}><td><b>{m.name}</b></td><td>{m.dose}</td><td>{m.freq}</td><td className="muted">{m.indication}</td><td className="muted">{m.since}</td>
                {canEditMeds && <td className="right"><button className="icon-btn plain" aria-label={`Remove ${m.name}`} onClick={async () => { try { await setMeds(p.id, p.meds.filter((x) => x.name !== m.name)); toast.success(`${m.name} removed.`); } catch (ex) { toast.error(ex.message || 'The medication could not be removed.'); } }}><Trash2 size={15} /></button></td>}</tr>)}</tbody></table></div>
          )}
        </section>
      )}

      {tab === 'history' && (
        <section className="card card-pad mt-16"><h2 className="card-title mb-16">Medical history</h2>
          <ul className="timeline">{p.history.map((h, i) => <li key={i}><div className="d">{h.date}</div><div>{h.text}</div></li>)}</ul></section>
      )}

      {tab === 'analysis' && (
        <section className="card card-flush mt-16">
          <div className="card-head" style={{ paddingBottom: 12 }}><h2 className="card-title">Analysis history</h2>{isDoctor && <button className="btn btn-primary btn-sm" onClick={() => nav(`/app/ddi?patient=${p.id}`)}><FlaskConical size={14} />New analysis</button>}</div>
          <div className="table-wrap"><table className="table"><thead><tr><th>Analysis</th><th>Date</th><th>Medication pair</th><th>Interaction found</th><th>Severity</th><th>Requested by</th></tr></thead>
            <tbody>
              {histState === 'loading' && <tr><td colSpan={6} className="muted">Loading saved analyses…</td></tr>}
              {histState === 'error' && <tr><td colSpan={6} className="muted">Saved analyses could not be loaded.</td></tr>}
              {histState === 'na' && <tr><td colSpan={6} className="muted">Analysis history is only available to clinical staff.</td></tr>}
              {histState === 'ok' && history.length === 0 && <tr><td colSpan={6} className="muted">No saved analyses for this patient yet.</td></tr>}
              {history.map((h) => <tr key={h.id}><td className="pid">{h.id}</td><td>{fmtDate(new Date((h.created_at || 0) * 1000))}</td><td>{h.drug_a} + {h.drug_b}</td><td className="num">{h.interaction_found ? 'Yes' : 'No'}</td><td><SeverityBadge level={h.severity || 'None'} /></td><td className="muted">{h.requested_by || '—'}</td></tr>)}</tbody></table></div>
        </section>
      )}

      {tab === 'reports' && (
        <section className="card card-pad mt-16"><div className="row between mb-8"><h2 className="card-title">Reports</h2><button className="btn btn-outline btn-sm" onClick={() => nav('/app/reports')}><FileText size={14} />Open final reports</button></div>
          <p className="muted small">Final prescription reports are generated from finalized prescriptions and listed under Reports.</p>
        </section>
      )}

      {editing && <PatientForm mode="edit" initial={toForm(p)} onClose={() => setEditing(false)} lockMeds={!canEditMeds} onSubmit={async (data) => { try { await updatePatient(p.id, { ...data, allergies: data.allergies.filter((a) => a.substance.trim()) }); setEditing(false); toast.success('Profile updated.'); } catch (ex) { toast.error(ex.message || 'The profile could not be saved.'); } }} />}
    </>
  );
}
