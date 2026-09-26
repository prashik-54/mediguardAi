import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  Activity, AlertTriangle, ArrowLeft, CheckCircle2, CircleCheck, FlaskConical, GitBranchPlus, Plus,
  Save, ShieldCheck, TriangleAlert, Trash2, UserX,
} from 'lucide-react';
import { Avatar, EmptyState, LoadingState, PageHead } from '../../components/ui/Misc';
import { SeverityBadge, StatusBadge } from '../../components/ui/Badges';
import { SelectField, TextAreaField } from '../../components/ui/Field';
import { ConfirmDialog, Drawer } from '../../components/ui/Modal';
import { Tabs } from '../../components/ui/Tabs';
import { useToast } from '../../context/ToastContext';
import { api } from '../../lib/api';
import { riskFactors, riskScore } from '../../lib/risk';
import { CATALOG, FREQUENCIES, findDrug } from '../../data/catalog';
import '../../styles/patients.css';
import '../../styles/ddi.css';

const BLANK_ITEM = { medicine_name: '', dose: '', unit: '', frequency: '', timing: '', duration: '', route: '', instructions: '', quantity: '' };
const TIMINGS = ['Before meals', 'After meals', 'With food', 'Empty stomach', 'At bedtime'];
const ROUTES = ['Oral', 'Topical', 'Subcutaneous', 'Intravenous', 'Intramuscular', 'Inhaled'];
const DURATIONS = ['3 days', '5 days', '7 days', '10 days', '14 days', '30 days', 'Ongoing'];
// Severities that warrant a visible clinical recommendation in the DDI
// review below (task 'show recommendation for High/Moderate severity').
// Low-severity pairs still show a description, but not a dedicated
// recommendation callout -- that's reserved for interactions worth
// pausing on.
const SEVERE = new Set(['High', 'Moderate', 'Moderate/High']);

const stripped = (items) => items
  .filter((i) => (i.medicine_name || '').trim())
  .map(({ id, prescription_id, ...rest }) => ({
    ...rest,
    quantity: rest.quantity === '' || rest.quantity === null || rest.quantity === undefined ? null : Number(rest.quantity),
  }));

// Same detail-drawer shape as the standalone DDI Analysis Workspace
// (pages/ddi/DDIWorkspace.jsx), adapted to the prescription pair shape
// (drug_a/drug_b instead of a/b) so both surfaces present a result the
// same way (task 'result of ddi analysis should be like DDI checker page').
function PairDrawer({ item, onClose }) {
  const [tab, setTab] = useState('overview');
  const sevColor = item.severity === 'High' ? 'var(--high)' : item.severity === 'Moderate' ? 'var(--mod)' : 'var(--low)';
  const effects = item.effects && item.effects.length ? item.effects : [item.description];
  return (
    <Drawer title="Interaction Details" onClose={onClose}>
      <div className={`detail-card ${item.severity}`}>
        <TriangleAlert size={22} color={sevColor} style={{ flexShrink: 0 }} />
        <div><b style={{ color: item.severity === 'High' ? 'var(--high)' : undefined }}>{item.severity} Severity</b><div className="strong">{item.drug_a} + {item.drug_b}</div><div className="small muted">{item.interaction_type} interaction</div></div>
      </div>
      <div className="mt-16"><Tabs value={tab} onChange={setTab} label="Interaction details" tabs={[{ id: 'overview', label: 'Overview' }, { id: 'mechanism', label: 'Mechanism' }, { id: 'impact', label: 'Clinical Impact' }, { id: 'evidence', label: 'Evidence' }]} /></div>
      <div className="mt-16">
        {tab === 'overview' && (<>
          <h3 style={{ fontSize: 14 }}>Summary</h3><p className="small mt-4" style={{ lineHeight: 1.7 }}>{item.mechanism || item.description}</p>
          <h3 style={{ fontSize: 14 }} className="mt-16">Possible effects</h3><ul className="bullets mt-8">{effects.map((e) => <li key={e}>{e}</li>)}</ul>
          {item.recommendation && <><h3 style={{ fontSize: 14 }} className="mt-16">Recommendation</h3><div className="callout callout-info mt-8">{item.recommendation}</div></>}
        </>)}
        {tab === 'mechanism' && (<><h3 style={{ fontSize: 14 }}>How it happens</h3><p className="small mt-8" style={{ lineHeight: 1.7 }}>{item.mechanism || item.description}</p><p className="small muted mt-12">Type: <b style={{ color: 'var(--text)' }}>{item.interaction_type}</b>.</p></>)}
        {tab === 'impact' && (<><h3 style={{ fontSize: 14 }}>What to watch for</h3><ul className="bullets mt-8">{effects.map((e) => <li key={e}>{e}</li>)}</ul>{item.recommendation && <div className="callout callout-info mt-16">{item.recommendation}</div>}</>)}
        {tab === 'evidence' && (<>
          {item.confidence != null && <><h3 style={{ fontSize: 14 }}>Confidence</h3><div className="conf mt-8"><div className="progress"><i style={{ width: `${item.confidence}%` }} /></div><b>{item.confidence}%</b></div></>}
          <h3 style={{ fontSize: 14 }} className="mt-16">Source</h3><p className="small mt-4">{item.evidence || item.description}</p><p className="tiny muted mt-8">Data source: {item.data_source}</p>
        </>)}
      </div>
    </Drawer>
  );
}

export default function Prescription() {
  const { appointmentId } = useParams();
  const nav = useNavigate();
  const toast = useToast();
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [apt, setApt] = useState(null);
  const [patient, setPatient] = useState(null);
  const [encounter, setEncounter] = useState(null);

  const [confirm, setConfirm] = useState(null);
  const [rx, setRx] = useState(null);
  const [versions, setVersions] = useState([]);
  const [items, setItems] = useState([{ ...BLANK_ITEM }]);
  const [instructions, setInstructions] = useState('');
  const [rxSaving, setRxSaving] = useState(false);
  const [versioning, setVersioning] = useState(false);
  const [ddi, setDdi] = useState(null);
  const [ddiLoading, setDdiLoading] = useState(false);
  const [ddiRunning, setDdiRunning] = useState(false);
  const [ack, setAck] = useState(false);
  const [decisionChoice, setDecisionChoice] = useState('Proceed');
  const [decisionReason, setDecisionReason] = useState('');
  const [decisionHistory, setDecisionHistory] = useState([]);
  const [deciding, setDeciding] = useState(false);
  const [finalizing, setFinalizing] = useState(false);
  const [ddiFilter, setDdiFilter] = useState('all');
  const [openPair, setOpenPair] = useState(null);

  const hydrateRx = (r) => {
    setRx(r);
    setItems(r.items?.length ? r.items.map((i) => ({ ...i, quantity: i.quantity ?? '' })) : [{ ...BLANK_ITEM }]);
    setInstructions(r.clinical_instructions || '');
  };

  const loadDdi = async (prescriptionId) => {
    setDdiLoading(true); setAck(false);
    try { setDdi(await api.latestDdiAnalysis(prescriptionId)); }
    catch (ex) { if (ex.status === 404) setDdi(null); else toast.error(ex.message || 'Could not load DDI analysis.'); }
    finally { setDdiLoading(false); }
    try { setDecisionHistory(await api.doctorDecisionHistory(prescriptionId)); }
    catch { setDecisionHistory([]); }
  };

  const load = async () => {
    setLoading(true);
    try {
      const a = await api.getAppointment(appointmentId);
      setApt(a);
      const [p, enc] = await Promise.all([
        api.getPatient(a.patient_id),
        api.getEncounterForAppointment(appointmentId).catch(() => null),
      ]);
      setPatient(p);
      const e = enc || await api.startEncounter(appointmentId);
      setEncounter(e);
      const rows = await api.encounterPrescriptions(e.id);
      setVersions(rows);
      const active = rows.find((r) => r.status !== 'Cancelled');
      if (active) { hydrateRx(active); loadDdi(active.id); }
      else {
        // Shouldn't normally happen -- Consultation.jsx starts the draft
        // before navigating here -- but start one anyway so this page
        // always works if opened directly.
        const created = await api.createPrescription(e.id, { items: [] });
        hydrateRx(created);
        setVersions([created]);
      }
    } catch (ex) {
      if (ex.status === 404) setNotFound(true); else toast.error(ex.message || 'Could not load the prescription workspace.');
    } finally { setLoading(false); }
  };

  useEffect(() => { document.title = 'Prescription — MediGuard AI'; load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [appointmentId]);

  // Editable as many times as needed from any status except
  // Finalized/Cancelled -- including after a DDI review or a high-severity
  // decision has already been recorded (task 'edit prescription as many
  // times as wanted'). Saving always drops the version back to Draft
  // server-side, so a fresh DDI run (and, if needed, a fresh decision) is
  // required before it can be finalized again.
  const editable = rx && rx.status !== 'Finalized' && rx.status !== 'Cancelled';
  const priorVersions = versions.filter((v) => v.id !== rx?.id);

  const setItem = (idx, key, val) => setItems((rows) => rows.map((r, i) => (i === idx ? { ...r, [key]: val } : r)));
  const setMedicineName = (idx, val) => setItems((rows) => rows.map((r, i) => {
    if (i !== idx) return r;
    const drug = findDrug(val);
    if (!drug) return { ...r, medicine_name: val };
    const [num, unit] = drug.dose.split(/(?<=\d)(?=\D)/).map((s) => s.trim());
    return { ...r, medicine_name: val, dose: r.dose || num || r.dose, unit: r.unit || unit || r.unit };
  }));
  const addItem = () => setItems((rows) => [...rows, { ...BLANK_ITEM }]);
  const removeItem = (idx) => setItems((rows) => rows.filter((_, i) => i !== idx));

  const saveRx = async () => {
    setRxSaving(true);
    try {
      const updated = await api.updatePrescription(rx.id, { items: stripped(items), clinical_instructions: instructions });
      hydrateRx(updated);
      setVersions((v) => v.map((r) => (r.id === updated.id ? updated : r)));
      toast.success('Prescription saved.');
    } catch (ex) { toast.error(ex.message || 'Could not save the prescription.'); }
    finally { setRxSaving(false); }
  };

  const runDdi = async () => {
    setDdiRunning(true);
    try {
      const result = await api.runDdiAnalysis(rx.id);
      setDdi(result); setAck(false);
      const updated = await api.getPrescription(rx.id);
      hydrateRx(updated);
      setVersions((v) => v.map((r) => (r.id === updated.id ? updated : r)));
      toast.success(`DDI analysis complete — overall severity: ${result.overall_severity}.`);
    } catch (ex) { toast.error(ex.message || 'Could not run DDI analysis.'); }
    finally { setDdiRunning(false); }
  };

  const revise = async () => {
    setVersioning(true);
    try {
      await api.updatePrescription(rx.id, { items: stripped(items), clinical_instructions: instructions });
      const revised = await api.newPrescriptionVersion(rx.id);
      setVersions((v) => [revised, ...v.map((r) => (r.id === rx.id ? { ...r, status: 'Cancelled' } : r))]);
      hydrateRx(revised);
      loadDdi(revised.id);
      toast.success(`Started version ${revised.version}.`);
    } catch (ex) { toast.error(ex.message || 'Could not start a new version.'); }
    finally { setVersioning(false); }
  };

  const decide = async () => {
    if (!decisionReason.trim()) { toast.error('A short reason is required to record this decision.'); return; }
    setDeciding(true);
    try {
      await api.recordDoctorDecision(rx.id, { decision: decisionChoice, reason: decisionReason.trim() });
      const updated = await api.getPrescription(rx.id);
      hydrateRx(updated);
      setVersions((v) => v.map((r) => (r.id === updated.id ? updated : r)));
      setDecisionHistory(await api.doctorDecisionHistory(rx.id));
      setDecisionReason('');
      toast.success('Decision recorded.');
    } catch (ex) { toast.error(ex.message || 'Could not record the decision.'); }
    finally { setDeciding(false); }
  };

  const finalize = async () => {
    setFinalizing(true);
    try {
      const finalized = await api.finalizePrescription(rx.id);
      hydrateRx(finalized);
      setVersions((v) => v.map((r) => (r.id === finalized.id ? finalized : r)));
      toast.success('Prescription finalized and ready to send on.');
    } catch (ex) { toast.error(ex.message || 'Could not finalize the prescription.'); }
    finally { setFinalizing(false); }
  };

  // ---- DDI-Workspace-style risk summary, built from the *real* server-side
  // result (ddi.pairs) instead of the local reference dataset, so this page
  // and the standalone DDI Analysis Workspace can never disagree about what
  // "the patient's medications" means. ----
  // Only the medicines on *this* prescription version count toward the risk
  // summary below -- the patient's other active medications are no longer
  // folded in, so this matches the DDI review's own current-medication-only
  // scope.
  const activeMedCount = useMemo(
    () => items.filter((i) => (i.medicine_name || '').trim()).length,
    [items],
  );

  const hitPairs = useMemo(() => (ddi?.pairs || []).filter((p) => p.interaction_found)
    .map((p) => ({ ...p, severity: p.severity === 'Moderate/High' ? 'High' : p.severity }))
    .sort((a, b) => ({ High: 2, Moderate: 1, Low: 0 }[b.severity] - { High: 2, Moderate: 1, Low: 0 }[a.severity])), [ddi]);
  const topHigh = hitPairs.find((p) => p.severity === 'High');
  const score = patient ? riskScore(patient, hitPairs, activeMedCount) : null;
  const factors = patient ? riskFactors(patient, activeMedCount) : [];
  // Analysis Results section shows only pairs where an interaction was
  // actually found -- same as the standalone DDI Analysis Workspace --
  // instead of every combination in ddi.pairs (which includes "None found"
  // rows for pairs the engine checked but found nothing on).
  const ddiCounts = { all: hitPairs.length, High: hitPairs.filter((p) => p.severity === 'High').length, Moderate: hitPairs.filter((p) => p.severity === 'Moderate').length };
  const shownPairs = ddiFilter === 'all' ? hitPairs : hitPairs.filter((p) => p.severity === ddiFilter);

  if (loading) return <p className="muted">Loading prescription workspace…</p>;
  if (notFound || !apt || !patient || !encounter) {
    return <EmptyState icon={UserX} title="Prescription not found" action={<Link className="btn btn-primary" to="/app/queue">Back to queue</Link>}>This visit may not be assigned to you.</EmptyState>;
  }

  return (
    <>
      <PageHead
        breadcrumbs={<><Link to="/app/queue">My Queue</Link><span>/</span><Link to={`/app/consult/${appointmentId}`}>{patient.name}</Link><span>/</span><span className="cur">Prescription</span></>}
        title="Prescription workspace" subtitle="Add medicine, run the DDI interaction check, and finalize this prescription.">
        <Link className="btn btn-outline" to={`/app/consult/${appointmentId}`}><ArrowLeft size={15} />Back to consultation</Link>
      </PageHead>

      <div className="card card-pad mb-16 row gap-12 wrap">
        <Avatar name={patient.name} />
        <div className="grow" style={{ minWidth: 180 }}>
          <b>{patient.name}</b>
          <div className="small muted">{patient.id} · {patient.age} yrs · {patient.gender} · eGFR {patient.egfr} · ALT {patient.alt}</div>
        </div>
        {rx && <div className="row gap-8 wrap small muted" style={{ alignItems: 'center' }}><span>Version {rx.version}</span><StatusBadge status={rx.status} /></div>}
      </div>

      {(patient.meds || []).length > 0 && (
        <div className="callout callout-info mb-16">
          <span>
            <b>Already taking:</b> {(patient.meds || []).map((m) => m.name).join(', ')}. For reference only —
            the DDI check below analyzes only the medicine items on this prescription.
          </span>
        </div>
      )}

      <div className="row between mb-12 mt-8"><h3 className="card-title" style={{ fontSize: 15 }}>Medicine items</h3>
        {editable && <button className="btn btn-outline btn-sm" onClick={addItem}><Plus size={14} />Add item</button>}
      </div>
      {!editable && (
        <p className="callout callout-warn" style={{ marginBottom: 12 }}>
          This version is {rx.status.toLowerCase()} and can no longer be edited directly. Start a new version to revise it.
        </p>
      )}
      <datalist id="med-catalog-names">{CATALOG.map((d) => <option key={d.name} value={d.name} />)}</datalist>
      <datalist id="med-units">{['mg', 'ml', 'g', 'mcg', 'units', 'tablet(s)', 'drop(s)'].map((u) => <option key={u} value={u} />)}</datalist>
      <datalist id="med-frequencies">{FREQUENCIES.map((f) => <option key={f} value={f} />)}</datalist>
      <datalist id="med-timings">{TIMINGS.map((t) => <option key={t} value={t} />)}</datalist>
      <datalist id="med-routes">{ROUTES.map((r) => <option key={r} value={r} />)}</datalist>
      <datalist id="med-durations">{DURATIONS.map((d) => <option key={d} value={d} />)}</datalist>
      <div className="card card-pad">
        <p className="tiny muted mb-8">Scroll sideways on smaller screens. Hover the medicine name to see if it matches the drug knowledge base.</p>
        <div className="rx-table-wrap">
          <div className="rx-table">
            <div className="rx-row rx-head">
              <span>Medicine</span><span>Dose</span><span>Unit</span><span>Frequency</span><span>Timing</span>
              <span>Duration</span><span>Route</span><span>Qty</span><span>Instructions</span><span />
            </div>
            {items.map((it, idx) => {
              const drug = findDrug(it.medicine_name);
              const nameTitle = drug ? `${drug.cls} · matches drug knowledge base`
                : it.medicine_name ? 'Not in the drug catalog — DDI check may not recognize this name' : 'Type to search the drug catalog';
              return (
                <div className="rx-row" key={idx}>
                  <input className={`input${it.medicine_name && !drug ? ' input-warn' : ''}`} aria-label={`Item ${idx + 1} medicine name`} list="med-catalog-names"
                         disabled={!editable} value={it.medicine_name} title={nameTitle} placeholder="Search medicine…"
                         onChange={(e) => setMedicineName(idx, e.target.value)} />
                  <input className="input" aria-label={`Item ${idx + 1} dose`} disabled={!editable} value={it.dose || ''} placeholder="500"
                         onChange={(e) => setItem(idx, 'dose', e.target.value)} />
                  <input className="input" aria-label={`Item ${idx + 1} unit`} list="med-units" disabled={!editable} value={it.unit || ''} placeholder="mg"
                         onChange={(e) => setItem(idx, 'unit', e.target.value)} />
                  <input className="input" aria-label={`Item ${idx + 1} frequency`} list="med-frequencies" disabled={!editable} value={it.frequency || ''} placeholder="Twice daily"
                         onChange={(e) => setItem(idx, 'frequency', e.target.value)} />
                  <input className="input" aria-label={`Item ${idx + 1} timing`} list="med-timings" disabled={!editable} value={it.timing || ''} placeholder="After meals"
                         onChange={(e) => setItem(idx, 'timing', e.target.value)} />
                  <input className="input" aria-label={`Item ${idx + 1} duration`} list="med-durations" disabled={!editable} value={it.duration || ''} placeholder="7 days"
                         onChange={(e) => setItem(idx, 'duration', e.target.value)} />
                  <input className="input" aria-label={`Item ${idx + 1} route`} list="med-routes" disabled={!editable} value={it.route || ''} placeholder="Oral"
                         onChange={(e) => setItem(idx, 'route', e.target.value)} />
                  <input className="input" aria-label={`Item ${idx + 1} quantity`} type="number" min="0" disabled={!editable} value={it.quantity}
                         onChange={(e) => setItem(idx, 'quantity', e.target.value)} />
                  <input className="input" aria-label={`Item ${idx + 1} instructions`} disabled={!editable} value={it.instructions || ''} placeholder="Optional"
                         onChange={(e) => setItem(idx, 'instructions', e.target.value)} />
                  {editable && items.length > 1
                    ? <button type="button" className="icon-btn plain" aria-label={`Remove item ${idx + 1}`} onClick={() => removeItem(idx)}><Trash2 size={15} /></button>
                    : <span />}
                </div>
              );
            })}
          </div>
        </div>
        <TextAreaField className="mt-16" label="Overall clinical instructions" rows={3} disabled={!editable}
                        value={instructions} onChange={(e) => setInstructions(e.target.value)} />
        {editable && (
          <div className="row gap-8 mt-16">
            <button className="btn btn-primary" disabled={rxSaving} onClick={saveRx}><Save size={15} />{rxSaving ? 'Saving…' : 'Save prescription'}</button>
          </div>
        )}
        {!editable && rx.status !== 'Cancelled' && (
          <div className="row gap-8 mt-16">
            <button className="btn btn-outline" disabled={versioning} onClick={() => setConfirm('revise')}><GitBranchPlus size={15} />{versioning ? 'Starting…' : 'Start new version'}</button>
            {confirm === 'revise' && <ConfirmDialog title="Start a new version?" message="The current version will be cancelled and a new editable draft opened with the same medicines. A new DDI review will be required before it can be finalized." confirmLabel="Start new version" onConfirm={revise} onClose={() => setConfirm(null)} />}
          </div>
        )}
      </div>

      {rx.status !== 'Cancelled' && (
        <section className="card card-pad mt-16">
          <div className="row between mb-12">
            <div><h2 className="card-title">DDI review (doctor-only)</h2><p className="tiny muted">Analyzes only the medicine items on this prescription version — same interaction engine as the DDI Analysis Workspace. Internal clinical decision support, never included in the patient report or pharmacy order.</p></div>
            <div className="row gap-8">
              <Link className="btn btn-outline btn-sm" to={`/app/ddi?patient=${encodeURIComponent(patient.id)}`}>
                <FlaskConical size={14} />Open DDI Workspace
              </Link>
              <button className="btn btn-primary btn-sm" disabled={ddiRunning || !items.some((i) => (i.medicine_name || '').trim())}
                      onClick={runDdi}>
                <Activity size={14} />{ddiRunning ? 'Analyzing…' : 'Run DDI analysis'}
              </button>
            </div>
          </div>
          {ddiLoading ? (
            <LoadingState label="Loading DDI review" rows={2} />
          ) : !ddi ? (
            <p className="muted small">No DDI analysis has been run for this version yet. Save your medicine items, then run the analysis before finalizing.</p>
          ) : (
            <>
              {rx.status === 'Draft' && (
                <div className="callout callout-warn mb-12">
                  <TriangleAlert size={16} />
                  <span>The prescription changed since this DDI result. Re-run the analysis before finalizing.</span>
                </div>
              )}
              {topHigh && !ack && (
                <div className="critical mb-12" role="alert">
                  <TriangleAlert size={22} color="var(--high)" />
                  <div className="grow"><b>Critical alert — high severity interaction</b><span className="small">{topHigh.drug_a} + {topHigh.drug_b} · Requires clinical review</span></div>
                  <button className="btn btn-outline btn-sm" onClick={() => setAck(true)}>Acknowledge</button>
                </div>
              )}
              <div className="ddi-lower mb-12">
                <div>
                  <div className="row gap-8 wrap mb-12">
                    <span className="small muted">Overall severity:</span>
                    <SeverityBadge level={ddi.overall_severity} />
                    <span className="small muted">· Engine: {ddi.engine_version} · Source: {ddi.source}</span>
                  </div>

                  <section className="card card-flush">
                    <div className="card-head" style={{ paddingBottom: 12 }}>
                      <h2 className="card-title" style={{ fontSize: 14 }}>Analysis Results</h2>
                      {hitPairs.length > 0 && <div className="pills" role="group" aria-label="Filter by severity">
                        {[['all', `All Interactions (${ddiCounts.all})`], ['High', `High Severity (${ddiCounts.High})`], ['Moderate', `Moderate (${ddiCounts.Moderate})`]].map(([k, l]) => (
                          <button key={k} className="pill" aria-pressed={ddiFilter === k} onClick={() => setDdiFilter(k)}>{l}</button>
                        ))}
                      </div>}
                    </div>
                    {hitPairs.length === 0 ? (
                      <div className="analysis-state"><div className="status-icon ok" style={{ margin: '0 auto 14px' }}><CircleCheck size={28} /></div><b>No known interactions detected</b><p className="muted small mt-4">Based on the current medicine list and patient profile.</p></div>
                    ) : shownPairs.length === 0 ? (
                      <p className="muted small" style={{ padding: '10px 20px 24px' }}>No interactions at this severity.</p>
                    ) : (
                      <div className="table-wrap"><table className="table">
                        <thead><tr><th>Medication A</th><th>Medication B</th><th>Severity</th><th>Type</th><th /></tr></thead>
                        <tbody>{shownPairs.map((p, i) => (
                          <tr key={i} className="clickable" onClick={() => setOpenPair(p)} tabIndex={0} onKeyDown={(e) => { if (e.key === 'Enter') setOpenPair(p); }}>
                            <td><b>{p.drug_a}</b>{p.drug_a_origin === 'existing' && <span className="badge badge-neutral no-dot" style={{ marginLeft: 6 }}>already active</span>}</td>
                            <td><b>{p.drug_b}</b>{p.drug_b_origin === 'existing' && <span className="badge badge-neutral no-dot" style={{ marginLeft: 6 }}>already active</span>}</td>
                            <td><SeverityBadge level={p.severity} /></td>
                            <td className="muted">{p.interaction_type}</td>
                            <td className="right"><span className="link-btn">Details</span></td>
                          </tr>
                        ))}</tbody>
                      </table></div>
                    )}
                  </section>

                  {ddi.patient_factors?.length > 0 && (
                    <ul className="small muted mt-12" style={{ paddingLeft: 18 }}>
                      {ddi.patient_factors.map((f, i) => <li key={i}>{f}</li>)}
                    </ul>
                  )}
                  {hitPairs.some((p) => SEVERE.has(p.severity) && p.recommendation) && (
                    <div className="mt-12" style={{ display: 'grid', gap: 8 }}>
                      <h3 className="card-title" style={{ fontSize: 13 }}>Recommendations</h3>
                      {hitPairs.filter((p) => SEVERE.has(p.severity) && p.recommendation).map((p, i) => (
                        <div key={i} className={`callout ${p.severity === 'High' ? 'callout-high' : 'callout-warn'}`}>
                          <TriangleAlert size={15} />
                          <span><b>{p.drug_a} + {p.drug_b}</b> — {p.severity} severity: {p.recommendation}</span>
                        </div>
                      ))}
                    </div>
                  )}
                  <p className="small muted mt-12">{ddi.ml_placeholder?.status}</p>
                </div>
                <section className="card card-pad">
                  <h2 className="card-title mb-12">Why this risk score</h2>
                  {score && (
                    <>
                      <div className="row gap-16">
                        <div className="score-ring" style={{ '--v': score.score, '--c': score.level === 'High' ? 'var(--high)' : score.level === 'Medium' ? '#f0a63a' : 'var(--low)' }}><div>{score.score}<small>of 100</small></div></div>
                        <div><SeverityBadge level={score.level} suffix=" risk" /><p className="small muted mt-8">Patient-adjusted score from every interacting pair found and this patient's factors.</p></div>
                      </div>
                      <div className="mt-12">{score.parts.map((p) => <div className="kv" key={p.label}><dt style={{ fontSize: 12.5 }}>{p.label}</dt><dd>+{p.points}</dd></div>)}</div>
                      <h3 className="card-title mt-16 mb-8" style={{ fontSize: 13 }}>Patient risk factors</h3>
                      {factors.map((f) => <div key={f.id} className={`factor ${f.flagged ? 'flag' : ''}`}><i className="dot" /><div><b style={{ fontWeight: 600 }}>{f.label}</b><span className="n">{f.note}</span></div></div>)}
                    </>
                  )}
                </section>
              </div>
            </>
          )}
        </section>
      )}

      {rx.status === 'Awaiting Doctor Decision' && (
        <section className="card card-pad mt-16">
          <div className="callout callout-high mb-12">
            <AlertTriangle size={16} />
            <span>
              This DDI result is High severity. Finalization is blocked until you explicitly review it and
              record your decision below. No automated substitute is applied for you — this engine has no
              safer-alternative dataset, so evaluate the options yourself.
            </span>
          </div>
          <h2 className="card-title mb-12">Decision required</h2>
          <SelectField label="Decision" value={decisionChoice} onChange={(e) => setDecisionChoice(e.target.value)}
                       options={['Proceed', 'Revise Prescription', 'Escalate to Pharmacist']} />
          <TextAreaField className="mt-8" label="Reason (required)" rows={2} value={decisionReason}
                         onChange={(e) => setDecisionReason(e.target.value)}
                         placeholder="Why is this the right call for this patient?" />
          <div className="row gap-8 mt-12">
            <button className="btn btn-primary" disabled={deciding} onClick={decide}>
              <ShieldCheck size={15} />{deciding ? 'Recording…' : 'Record decision'}
            </button>
          </div>
        </section>
      )}

      {(rx.status === 'Under DDI Review' || rx.status === 'Doctor Decision Recorded') && (
        <section className="card card-pad mt-16">
          <div className="row between">
            <div>
              <h2 className="card-title">Finalize prescription</h2>
              <p className="small muted mt-4">
                {rx.status === 'Doctor Decision Recorded'
                  ? 'Your high-severity decision is recorded. Finalizing sends this exact medication plan onward.'
                  : 'DDI review found no High-severity result. Confirm to finalize this prescription.'}
              </p>
            </div>
            <button className="btn btn-primary" disabled={finalizing} onClick={() => setConfirm('finalize')}>
              <CheckCircle2 size={15} />{finalizing ? 'Finalizing…' : 'Confirm & finalize'}
            </button>
            {confirm === 'finalize' && <ConfirmDialog title="Finalize this prescription?" message="A finalized prescription can no longer be edited (changes require a new version). It will be sent to the Hospital Administrator for the patient report and pharmacy hand-off." confirmLabel="Finalize prescription" onConfirm={finalize} onClose={() => setConfirm(null)} />}
          </div>
        </section>
      )}

      {rx.status === 'Finalized' && (
        <div className="callout callout-ok mt-16">
          <CheckCircle2 size={16} />
          <span>This prescription is finalized and ready to be sent to the Hospital Administrator / Pharmacy.</span>
        </div>
      )}
      {rx.status === 'Finalized' && (
        <div className="row gap-8 mt-16">
          <button className="btn btn-primary" onClick={() => nav(`/app/consult/${appointmentId}`)}><ArrowLeft size={15} />Back to consultation</button>
        </div>
      )}

      {decisionHistory.length > 0 && (
        <section className="card card-flush mt-16">
          <div className="card-head" style={{ paddingBottom: 12 }}><h2 className="card-title">Decision history</h2></div>
          <div className="table-wrap"><table className="table">
            <thead><tr><th>Decision</th><th>Reason</th></tr></thead>
            <tbody>{decisionHistory.map((d) => (
              <tr key={d.id}><td>{d.decision}</td><td className="small">{d.reason || '—'}</td></tr>
            ))}</tbody>
          </table></div>
        </section>
      )}

      {priorVersions.length > 0 && (
        <section className="card card-flush mt-16">
          <div className="card-head" style={{ paddingBottom: 12 }}><h2 className="card-title">Earlier versions</h2></div>
          <div className="table-wrap"><table className="table">
            <thead><tr><th>Version</th><th>Items</th><th>Status</th></tr></thead>
            <tbody>{priorVersions.map((v) => (
              <tr key={v.id}><td>{v.version}</td><td>{(v.items || []).map((i) => i.medicine_name).join(', ') || '—'}</td><td><StatusBadge status={v.status} /></td></tr>
            ))}</tbody>
          </table></div>
        </section>
      )}
      {openPair && <PairDrawer item={openPair} onClose={() => setOpenPair(null)} />}
    </>
  );
}
