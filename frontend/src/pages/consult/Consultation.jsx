import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  CheckCircle2, ClipboardX, FilePlus2, HeartPulse,
  Pill, Plus, Save, Trash2, UserX, ArrowRight, NotebookPen, AlertTriangle,
} from 'lucide-react';
import { Avatar, EmptyState, LoadingState } from '../../components/ui/Misc';
import { SeverityBadge, StatusBadge } from '../../components/ui/Badges';
import { ChipInput, Field, SelectField, SuggestionChips, TextAreaField, TextField } from '../../components/ui/Field';
import { ConfirmDialog } from '../../components/ui/Modal';
import { useToast } from '../../context/ToastContext';
import { api } from '../../lib/api';
import { fmtDate } from '../../lib/format';
import { kidneyStatus, liverStatus } from '../../lib/risk';
import {
  COMMON_ALLERGENS, COMMON_CONDITIONS, DIAGNOSIS_SUGGESTIONS, FINDINGS_SUGGESTIONS,
  FOLLOWUP_SUGGESTIONS,
} from '../../data/catalog';
import '../../styles/patients.css';

const FIELDS = [
  { key: 'notes', label: 'Consultation notes', hint: 'What the patient reports, examination observations…' },
  { key: 'clinical_findings', label: 'Clinical findings', suggestions: FINDINGS_SUGGESTIONS },
  { key: 'diagnosis', label: 'Diagnosis', suggestions: DIAGNOSIS_SUGGESTIONS },
  { key: 'assessment', label: 'Assessment' },
  { key: 'follow_up', label: 'Follow-up instructions', suggestions: FOLLOWUP_SUGGESTIONS },
];

const clinicalFormFrom = (p) => ({
  egfr: p?.egfr ?? '', alt: p?.alt ?? '',
  conditions: [...(p?.conditions || [])],
  allergies: (p?.allergies || []).map((a) => ({ ...a })),
});

/** Fields the hospital administrator may leave blank at intake, but which
 * must be confirmed by the assigned doctor before a consultation can be
 * completed (kept in sync with app/modules/module1_patient.py). */
function missingRequiredClinical(p) {
  const missing = [];
  if (p?.age == null || p?.age === '') missing.push('Age');
  if (!p?.gender) missing.push('Gender');
  if (p?.egfr === undefined || p?.egfr === null || p?.egfr === '') missing.push('Kidney function (eGFR)');
  if (p?.alt === undefined || p?.alt === null || p?.alt === '') missing.push('Liver function (ALT)');
  return missing;
}

export default function Consultation() {
  const { appointmentId } = useParams();
  const nav = useNavigate();
  const toast = useToast();
  const [confirmNoShow, setConfirmNoShow] = useState(false);
  const [apt, setApt] = useState(null);
  const [patient, setPatient] = useState(null);
  const [encounter, setEncounter] = useState(null);
  const [history, setHistory] = useState([]);
  const [form, setForm] = useState({ notes: '', clinical_findings: '', diagnosis: '', assessment: '', follow_up: '' });
  const [clinical, setClinical] = useState(clinicalFormFrom(null));
  const [clinicalErr, setClinicalErr] = useState({});
  const [savingClinical, setSavingClinical] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [completing, setCompleting] = useState(false);
  const [notFound, setNotFound] = useState(false);

  // ---- Prescription summary only -- the full workspace (medicine items,
  // DDI review, doctor decision, finalize) lives on its own page so the
  // consultation flow is: check patient -> open the prescription page if
  // medicine is needed -> come back here to write up consultation notes
  // (which now render below the prescription section, so the doctor's
  // notes can reflect what was actually prescribed) -> finalize the
  // consultation. See pages/consult/Prescription.jsx. ----
  const [rx, setRx] = useState(null);
  const [rxLoading, setRxLoading] = useState(true);
  const [rxStarting, setRxStarting] = useState(false);
  const [ddi, setDdi] = useState(null);

  // ---- Previous consultations: each row links to a dedicated read-only
  // page (ConsultationHistory) which the doctor opens in a new tab, so an
  // earlier visit's notes/diagnosis and what was prescribed can be reviewed
  // side-by-side with the current consultation instead of replacing it. ----

  const loadRx = async (encounterId) => {
    setRxLoading(true);
    try {
      const rows = await api.encounterPrescriptions(encounterId);
      const active = rows.find((r) => r.status !== 'Cancelled') || null;
      setRx(active);
      if (active) {
        try { setDdi(await api.latestDdiAnalysis(active.id)); }
        catch { setDdi(null); }
      } else { setDdi(null); }
    } catch (ex) { toast.error(ex.message || 'Could not load the prescription status.'); }
    finally { setRxLoading(false); }
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
      setClinical(clinicalFormFrom(p));
      const e = enc || await api.startEncounter(appointmentId);
      setEncounter(e);
      setForm({ notes: e.notes || '', clinical_findings: e.clinical_findings || '', diagnosis: e.diagnosis || '', assessment: e.assessment || '', follow_up: e.follow_up || '' });
      api.patientEncounters(a.patient_id).then((rows) => setHistory(rows.filter((r) => r.id !== e.id))).catch(() => setHistory([]));
      loadRx(e.id);
    } catch (ex) {
      if (ex.status === 404) setNotFound(true); else toast.error(ex.message || 'Could not load this consultation.');
    } finally { setLoading(false); }
  };

  useEffect(() => { document.title = 'Consultation — MediGuard AI'; load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [appointmentId]);
  // Refresh the prescription summary whenever we return to this page (e.g.
  // navigating back from the prescription workspace) so the status/severity
  // badge here never goes stale.
  useEffect(() => { if (encounter) loadRx(encounter.id); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [encounter?.id]);

  const done = encounter?.status === 'Completed';
  const missing = missingRequiredClinical(patient);
  // Diagnosis or assessment is expected before a consultation is finalized;
  // surfaced as a gentle heads-up on the notes section rather than a hard block.
  const notesIncomplete = !done && !(form.diagnosis || '').trim() && !(form.assessment || '').trim();

  const saveClinical = async () => {
    const e = {};
    if (clinical.egfr === '' || Number.isNaN(Number(clinical.egfr))) e.egfr = 'Enter eGFR (mL/min/1.73m²)';
    if (clinical.alt === '' || Number.isNaN(Number(clinical.alt))) e.alt = 'Enter ALT (U/L)';
    setClinicalErr(e);
    if (Object.keys(e).length) return;
    setSavingClinical(true);
    try {
      const updated = await api.updatePatient(patient.id, {
        egfr: Number(clinical.egfr), alt: Number(clinical.alt),
        conditions: clinical.conditions,
        allergies: clinical.allergies.filter((a) => (a.substance || '').trim()),
      });
      setPatient(updated);
      setClinical(clinicalFormFrom(updated));
      toast.success('Patient clinical profile updated.');
    } catch (ex) { toast.error(ex.message || 'Could not save clinical details.'); }
    finally { setSavingClinical(false); }
  };

  /** Appends a quick-pick suggestion into a free-text field instead of replacing
   * whatever the doctor has already typed. */
  const appendSuggestion = (key, text) => setForm((f) => {
    const cur = (f[key] || '').trim();
    if (!cur) return { ...f, [key]: text };
    const sep = /[.,;]$/.test(cur) ? ' ' : '. ';
    return { ...f, [key]: `${cur}${sep}${text}` };
  });

  const save = async () => {
    setSaving(true);
    try { setEncounter(await api.updateEncounter(encounter.id, form)); toast.success('Consultation notes saved.'); }
    catch (ex) { toast.error(ex.message || 'Could not save notes.'); }
    finally { setSaving(false); }
  };

  const complete = async () => {
    if (missing.length) { toast.error(`Complete the patient's clinical details first: ${missing.join(', ')}.`); return; }
    if (rx && rx.status !== 'Finalized' && rx.status !== 'Cancelled') {
      toast.error('Finalize (or cancel) the open prescription before completing this consultation.');
      return;
    }
    setCompleting(true);
    try {
      await api.updateEncounter(encounter.id, form);
      const e = await api.completeEncounter(encounter.id);
      setEncounter(e);
      setApt((a) => ({ ...a, status: 'Completed' }));
      toast.success('Consultation completed.');
    } catch (ex) { toast.error(ex.message || 'Add a diagnosis or assessment before completing.'); }
    finally { setCompleting(false); }
  };

  const markNoShow = async () => {
    try { await api.setAppointmentStatus(appointmentId, 'No Show'); setApt((a) => ({ ...a, status: 'No Show' })); toast.success('Marked as no-show.'); }
    catch (ex) { toast.error(ex.message || 'Could not update the visit.'); }
  };

  const rxHref = `/app/consult/${appointmentId}/prescription`;

  // ---- Start a draft prescription, then jump straight into its dedicated
  // workspace page to add medicine items and run the DDI check. ----
  const startDraft = async () => {
    setRxStarting(true);
    try {
      const created = await api.createPrescription(encounter.id, { items: [] });
      setRx(created);
      nav(rxHref);
    } catch (ex) { toast.error(ex.message || 'Could not start a prescription.'); }
    finally { setRxStarting(false); }
  };

  if (loading) return <p className="muted">Loading consultation…</p>;
  if (notFound || !apt || !patient) {
    return <EmptyState icon={UserX} title="Consultation not found" action={<Link className="btn btn-primary" to="/app/queue">Back to queue</Link>}>This visit may not be assigned to you.</EmptyState>;
  }

  return (
    <>
      <nav className="breadcrumbs mb-8" aria-label="Breadcrumb"><Link to="/app/queue">My Queue</Link><span>/</span><span className="cur">{patient.name}</span></nav>
      <div className="page-head">
        <div className="profile-head">
          <Avatar name={patient.name} size="lg" />
          <div>
            <h1>{patient.name}</h1>
            <div className="row gap-8 wrap small muted mt-4">
              <span className="pid">{patient.id}</span><span>·</span><span>{patient.gender}</span><span>·</span><span>{patient.age} years</span>
              <StatusBadge status={apt.status} />
            </div>
          </div>
        </div>
        <div className="page-actions">
          {!done && apt.status !== 'No Show' && <><button className="btn btn-outline" onClick={() => setConfirmNoShow(true)}><ClipboardX size={15} />Mark no-show</button>{confirmNoShow && <ConfirmDialog danger title="Mark this visit as a no-show?" message="The patient will be recorded as not having attended. This closes the visit and can only be reversed by the hospital administrator." confirmLabel="Mark no-show" onConfirm={markNoShow} onClose={() => setConfirmNoShow(false)} />}</>}
          <Link className="btn btn-outline" to={`/app/patients/${patient.id}`}>View full profile</Link>
          <a className="btn btn-outline" href="#prescription"><Pill size={15} />Prescription</a>
          <a className="btn btn-primary" href="#consultation-notes"><NotebookPen size={15} />Consultation notes</a>
        </div>
      </div>

      <div className="profile-grid mt-16">
        <section className="card card-pad"><h2 className="card-title mb-8">Reason for visit</h2><p>{apt.reason}</p></section>
        <section className="card card-pad"><h2 className="card-title mb-8">Conditions & allergies</h2>
          <div className="chips mb-8">{(patient.conditions || []).length ? patient.conditions.map((c) => <span className="tag" key={c}>{c}</span>) : <span className="muted small">No conditions recorded</span>}</div>
          {(patient.allergies || []).length ? patient.allergies.map((a) => <div key={a.substance} className="tiny muted">{a.substance} — {a.reaction}</div>) : <p className="muted small">No known allergies.</p>}
        </section>
        <section className="card card-pad"><h2 className="card-title mb-8">Current medications</h2>
          {(patient.meds || []).length ? patient.meds.map((m) => <div key={m.name} className="tiny">{m.name} {m.dose}</div>) : <p className="muted small">No active medications.</p>}
        </section>
      </div>

      <section className="card card-pad mt-16">
        <div className="row between mb-12">
          <h2 className="card-title row gap-8"><HeartPulse size={17} />Patient clinical profile</h2>
          {missing.length === 0 && <span className="callout callout-ok" style={{ padding: '4px 10px' }}><CheckCircle2 size={14} /> Complete</span>}
        </div>
        {missing.length > 0 && (
          <div className="callout callout-warn mb-12">
            <b>Required before this consultation can be completed:</b> {missing.join(', ')}. Reception may have left these blank at intake — please confirm them now.
          </div>
        )}
        <div className="grid cols-2">
          <TextField label="Kidney function — eGFR (mL/min/1.73m²) *" type="number" value={clinical.egfr} error={clinicalErr.egfr} disabled={done}
                     onChange={(e) => setClinical({ ...clinical, egfr: e.target.value })}
                     hint={clinical.egfr !== '' && !Number.isNaN(Number(clinical.egfr)) ? kidneyStatus(Number(clinical.egfr)).label : 'Required'} />
          <TextField label="Liver function — ALT (U/L) *" type="number" value={clinical.alt} error={clinicalErr.alt} disabled={done}
                     onChange={(e) => setClinical({ ...clinical, alt: e.target.value })}
                     hint={clinical.alt !== '' && !Number.isNaN(Number(clinical.alt)) ? liverStatus(Number(clinical.alt)).label : 'Required'} />
        </div>
        <div className="grid cols-2 mt-8">
          <Field label="Existing conditions">
            <ChipInput items={clinical.conditions} placeholder="e.g. Hypertension" suggestions={COMMON_CONDITIONS} disabled={done}
                       onAdd={(c) => setClinical({ ...clinical, conditions: [...clinical.conditions, c] })}
                       onRemove={(c) => setClinical({ ...clinical, conditions: clinical.conditions.filter((x) => x !== c) })} />
          </Field>
          <Field label="Known allergies">
            {clinical.allergies.length === 0 && <p className="muted small mb-8">No known allergies recorded.</p>}
            <div className="grid" style={{ gap: 8 }}>
              {clinical.allergies.map((a, i) => (
                <div className="row-edit allergy" key={i}>
                  <TextField label="Substance" list="common-allergens" value={a.substance} disabled={done}
                             onChange={(e) => setClinical({ ...clinical, allergies: clinical.allergies.map((x, j) => (j === i ? { ...x, substance: e.target.value } : x)) })} />
                  <TextField label="Reaction" value={a.reaction || ''} disabled={done}
                             onChange={(e) => setClinical({ ...clinical, allergies: clinical.allergies.map((x, j) => (j === i ? { ...x, reaction: e.target.value } : x)) })} />
                  <SelectField label="Severity" value={a.severity || 'Mild'} options={['Mild', 'Moderate', 'Severe']} disabled={done}
                               onChange={(e) => setClinical({ ...clinical, allergies: clinical.allergies.map((x, j) => (j === i ? { ...x, severity: e.target.value } : x)) })} />
                  {!done && <button type="button" className="icon-btn" aria-label="Remove allergy" onClick={() => setClinical({ ...clinical, allergies: clinical.allergies.filter((_, j) => j !== i) })}><Trash2 size={15} /></button>}
                </div>
              ))}
            </div>
            {!done && <button type="button" className="btn btn-outline btn-sm mt-8" style={{ justifySelf: 'start' }} onClick={() => setClinical({ ...clinical, allergies: [...clinical.allergies, { substance: '', reaction: '', severity: 'Mild' }] })}><Plus size={14} />Add allergy</button>}
            <datalist id="common-allergens">{COMMON_ALLERGENS.map((a) => <option key={a} value={a} />)}</datalist>
          </Field>
        </div>
        {!done && (
          <div className="row gap-8 mt-12">
            <button className="btn btn-outline" disabled={savingClinical} onClick={saveClinical}><Save size={15} />{savingClinical ? 'Saving…' : 'Save clinical details'}</button>
          </div>
        )}
      </section>

      {history.length > 0 && (
        <section className="card card-flush mt-16">
          <div className="card-head" style={{ paddingBottom: 12 }}><h2 className="card-title">Previous consultations</h2></div>
          <div className="table-wrap"><table className="table">
            <thead><tr><th>Date</th><th>Diagnosis</th><th>Assessment</th><th>Status</th><th /></tr></thead>
            <tbody>{history.map((h) => (
              <tr key={h.id} className="clickable" tabIndex={-1}
                  onClick={() => window.open(`#/app/consult/history/${h.id}`, '_blank', 'noopener')}>
                <td className="muted">{fmtDate(h.created_at * 1000)}</td><td>{h.diagnosis || '—'}</td><td>{h.assessment || '—'}</td><td><StatusBadge status={h.status} /></td>
                <td className="right">
                  <a className="link-btn" href={`#/app/consult/history/${h.id}`} target="_blank" rel="noopener noreferrer"
                     onClick={(e) => e.stopPropagation()} title="Open this consultation in a new tab">View <ArrowRight size={12} /></a>
                </td>
              </tr>
            ))}</tbody>
          </table></div>
        </section>
      )}

      {/* ---- Prescription: a compact status card that links out to the
          dedicated prescription workspace page (medicine items + DDI
          review + doctor decision + finalize live there). ---- */}
      <section id="prescription" className="card card-pad mt-16" style={{ scrollMarginTop: 16 }}>
        <div className="row between mb-4">
          <h2 className="card-title row gap-8"><Pill size={17} />Prescription</h2>
          {rx && <div className="row gap-8 wrap small muted"><span>Version {rx.version}</span><StatusBadge status={rx.status} /></div>}
        </div>
        <p className="tiny muted mb-12">Add medicine and run the DDI interaction check in the dedicated prescription workspace, then come back here to finalize the consultation.</p>

        {rxLoading ? (
          <LoadingState label="Loading prescription status" rows={2} />
        ) : !rx ? (
          <EmptyState icon={FilePlus2} title="No prescription yet" action={<button className="btn btn-primary" disabled={rxStarting} onClick={startDraft}><FilePlus2 size={15} />{rxStarting ? 'Starting…' : 'Start prescription'}</button>}>
            If this patient needs medicine, start a prescription to open the medicine + DDI workspace.
          </EmptyState>
        ) : (
          <div className="row between wrap" style={{ alignItems: 'center', gap: 12 }}>
            <div className="row gap-12 wrap" style={{ alignItems: 'center' }}>
              <span className="small">{(rx.items || []).length} medicine item{(rx.items || []).length === 1 ? '' : 's'}</span>
              {ddi && <span className="row gap-6 small muted" style={{ alignItems: 'center' }}>DDI: <SeverityBadge level={ddi.overall_severity} /></span>}
              {!ddi && rx.status !== 'Cancelled' && <span className="small muted">DDI analysis not run yet.</span>}
              {rx.status === 'Awaiting Doctor Decision' && <span className="callout callout-high" style={{ padding: '4px 10px' }}>Decision required</span>}
            </div>
            <Link className="btn btn-primary" to={rxHref}><Pill size={15} />Open prescription workspace<ArrowRight size={14} /></Link>
          </div>
        )}
      </section>

      {/* ---- Consultation notes: comes after the prescription so the doctor's
          narrative (findings, diagnosis, assessment, follow-up) reflects
          whatever was prescribed, rather than being written blind beforehand. ---- */}
      <section id="consultation-notes" className="card card-pad mt-16" style={{ scrollMarginTop: 16 }}>
        <div className="row between mb-4">
          <h2 className="card-title row gap-8"><NotebookPen size={17} />Consultation notes</h2>
          {done
            ? <span className="callout callout-ok" style={{ padding: '4px 10px' }}><CheckCircle2 size={14} /> Completed</span>
            : notesIncomplete && <span className="callout callout-warn" style={{ padding: '4px 10px' }}><AlertTriangle size={14} /> Diagnosis needed</span>}
        </div>
        <p className="tiny muted mb-12">Record what the patient reports, your findings, and the diagnosis. Add these any time — before or after prescribing.</p>
        <div className="grid" style={{ gap: 14 }}>
          {FIELDS.map((f) => (
            <div key={f.key}>
              {!done && f.suggestions && <SuggestionChips options={f.suggestions} onPick={(text) => appendSuggestion(f.key, text)} label={`${f.label} suggestions`} />}
              <TextAreaField label={f.label} hint={f.hint} rows={f.key === 'notes' ? 4 : 2} disabled={done}
                              value={form[f.key]} onChange={(e) => setForm({ ...form, [f.key]: e.target.value })} />
            </div>
          ))}
        </div>
      </section>

      {!done && (
        <div className="row gap-8 mt-16">
          <button className="btn btn-outline" disabled={saving} onClick={save}><Save size={15} />{saving ? 'Saving…' : 'Save notes'}</button>
          <button className="btn btn-primary" disabled={completing || missing.length > 0} title={missing.length ? `Missing: ${missing.join(', ')}` : (rx && rx.status !== 'Finalized' && rx.status !== 'Cancelled' ? 'Finalize the open prescription first' : undefined)}
                  onClick={complete}><CheckCircle2 size={15} />{completing ? 'Completing…' : 'Complete consultation'}</button>
        </div>
      )}

    </>
  );
}
