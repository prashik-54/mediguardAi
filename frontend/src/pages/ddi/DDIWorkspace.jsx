import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { FlaskConical, Pill, TriangleAlert, CircleCheck, RefreshCw, ClipboardCheck, Wifi, WifiOff, Info } from 'lucide-react';
import { Avatar, EmptyState } from '../../components/ui/Misc';
import { SeverityBadge } from '../../components/ui/Badges';
import { Drawer } from '../../components/ui/Modal';
import { Tabs } from '../../components/ui/Tabs';
import { PageHead } from '../../components/ui/Misc';
import { usePatients } from '../../context/PatientsContext';
import { useReviews } from '../../context/ReviewsContext';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { api } from '../../lib/api';
import { riskFactors, riskScore } from '../../lib/risk';
import { fmtDate } from '../../lib/format';
import '../../styles/ddi.css';

const sig = (meds) => meds.map((m) => m.name).sort().join('|');

function InteractionDrawer({ item, onClose, canRequest, patientId }) {
  const [tab, setTab] = useState('overview');
  const toast = useToast();
  const { requestReview } = useReviews();
  const request = async () => {
    try {
      await requestReview(patientId, { priority: item.severity, note: `${item.a} + ${item.b}` });
      toast.success('Pharmacist review requested.'); onClose();
    } catch (ex) { toast.error(ex.message || 'The review request could not be sent.'); }
  };
  return (
    <Drawer title="Interaction Details" onClose={onClose} footer={canRequest ? <button className="btn btn-primary btn-block" onClick={request}><ClipboardCheck size={16} />Request pharmacist review</button> : null}>
      <div className={`detail-card ${item.severity}`}>
        <TriangleAlert size={22} color={item.severity === 'High' ? 'var(--high)' : item.severity === 'Moderate' ? 'var(--mod)' : 'var(--low)'} style={{ flexShrink: 0 }} />
        <div>
          <b style={{ color: item.severity === 'High' ? 'var(--high)' : undefined }}>
            {item.modelOnly ? 'Model association signal' : `${item.severity} Severity`}
          </b>
          <div className="strong">{item.a} + {item.b}</div>
          <div className="small muted">{item.type}</div>
        </div>
      </div>
      <div className="mt-16"><Tabs value={tab} onChange={setTab} label="Interaction details" tabs={[{ id: 'overview', label: 'Overview' }, { id: 'mechanism', label: 'Mechanism' }, { id: 'impact', label: 'Clinical Impact' }, { id: 'evidence', label: 'Evidence' }]} /></div>
      <div className="mt-16">
        {tab === 'overview' && (<>
          <h3 style={{ fontSize: 14 }}>Summary</h3><p className="small mt-4" style={{ lineHeight: 1.7 }}>{item.mechanism}</p>
          <h3 style={{ fontSize: 14 }} className="mt-16">Possible effects</h3><ul className="bullets mt-8">{item.effects.map((e) => <li key={e}>{e}</li>)}</ul>
          <h3 style={{ fontSize: 14 }} className="mt-16">Recommendation</h3><div className="callout callout-info mt-8">{item.recommendation}</div>
        </>)}
        {tab === 'mechanism' && (<><h3 style={{ fontSize: 14 }}>How it happens</h3><p className="small mt-8" style={{ lineHeight: 1.7 }}>{item.mechanism}</p><p className="small muted mt-12">Type: <b style={{ color: 'var(--text)' }}>{item.type}</b>. {item.type === 'Pharmacokinetic' ? 'One drug changes how the body absorbs, metabolises or clears the other.' : 'The drugs act on overlapping or opposing pathways in the body.'}</p></>)}
        {tab === 'impact' && (<><h3 style={{ fontSize: 14 }}>What to watch for</h3><ul className="bullets mt-8">{item.effects.map((e) => <li key={e}>{e}</li>)}</ul><div className="callout callout-info mt-16">{item.recommendation}</div></>)}
        {tab === 'evidence' && (<>
          {item.modelPrediction?.status === 'scored' && (
            <div className="callout callout-info">
              <b>DGAT association score: {(item.modelPrediction.probability * 100).toFixed(1)}%</b>
              <p className="small mt-4">Population-level TWOSIDES association score; not a patient-specific probability or clinical severity.</p>
              <p className="small mt-4">{item.modelPrediction.interpretation}</p>
            </div>
          )}
          {item.confidence != null && <><h3 style={{ fontSize: 14 }}>Evidence confidence</h3><div className="conf mt-8"><div className="progress"><i style={{ width: `${item.confidence}%` }} /></div><b>{item.confidence}%</b></div></>}
          <h3 style={{ fontSize: 14 }} className="mt-16">Source</h3><p className="small mt-4">{item.evidence}</p><p className="tiny muted mt-8">Data source: {item.source}</p>
        </>)}
      </div>
    </Drawer>
  );
}

export default function DDIWorkspace() {
  const [params] = useSearchParams();
  const { patients, getPatient, loadState, refreshPatient } = usePatients();
  const wanted = params.get('patient');
  const patient = wanted ? getPatient(wanted) : patients[0];
  // A doctor typically lands here straight from a checkup/finalized prescription
  // (see PatientsContext.refreshPatient) -- re-pull the patient so this analysis
  // runs against their actual current medication list, not a cached snapshot
  // that may be missing the drug that was just prescribed.
  useEffect(() => { if (wanted) refreshPatient(wanted).catch(() => {}); }, [wanted]); // eslint-disable-line react-hooks/exhaustive-deps
  // A doctor commonly leaves this page open in one tab while finalizing a
  // prescription for the same patient in another tab/window (or this tab
  // just sits in the background for a while). Nothing about that reaches
  // this tab's own state on its own -- the effect above only runs once per
  // `wanted` value -- so re-pull the patient whenever this tab regains
  // focus/visibility, otherwise "Added Medications" can silently go stale.
  useEffect(() => {
    if (!wanted) return undefined;
    const onFocus = () => { refreshPatient(wanted).catch(() => {}); };
    const onVisible = () => { if (document.visibilityState === 'visible') onFocus(); };
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [wanted]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!patient) {
    return <EmptyState icon={FlaskConical} title={loadState === 'loading' ? 'Loading patients…' : wanted ? 'Patient not found' : 'No patient records to analyze'}>
      {loadState === 'loading' ? 'Fetching records from the server.' : 'Only patients you can access on the server are listed here.'}
    </EmptyState>;
  }
  return <Workspace key={patient.id} patient={patient} />;
}

function Workspace({ patient }) {
  const [, setParams] = useSearchParams();
  const { patients, refreshPatient } = usePatients();
  const { user } = useAuth();
  const toast = useToast();
  const patientId = patient.id;
  // The patient's current medication list already reflects only the latest
  // finalized prescription (see _sync_patient_medications on the backend --
  // it replaces, never merges, on each finalize), so pre-loading it here
  // *is* "current medication only", not existing+current combined.
  // Read-only: medications are only changed by a prescription during a consultation.
  const meds = patient.meds;
  const [state, setState] = useState('idle'); // idle | loading | done
  const [analysisError, setAnalysisError] = useState('');
  const [result, setResult] = useState(null);
  const [analysedSig, setAnalysedSig] = useState('');
  const [filter, setFilter] = useState('all');
  const [openItem, setOpenItem] = useState(null);
  const [ack, setAck] = useState(false);
  const runId = useRef(0);
  useEffect(() => { document.title = 'DDI Analysis — MediGuard AI'; }, []);

  const run = useCallback(async (list, p) => {
    const id = (runId.current += 1);
    setState('loading'); setAck(false); setAnalysisError('');
    try {
      const t0 = Date.now();
      const res = await api.analyze(p, list.map((m) => m.name));
      const wait = Math.max(0, 900 - (Date.now() - t0)); // keep the loading state visible long enough to read
      await new Promise((r) => setTimeout(r, wait));
      if (id !== runId.current) return;
      setResult({ ...res, at: new Date(), id: `DDI-${new Date().getFullYear()}-${String(Math.floor(Math.random() * 9000) + 1000)}` });
      setAnalysedSig(sig(list)); setState('done');
    } catch (ex) {
      if (id !== runId.current) return;
      setAnalysisError(ex.message || 'DDI analysis could not be completed.');
      setState('idle');
    }
  }, []);

  // Reset the working list and re-run whenever the selected patient changes,
  // or the patient's own medication list changes underneath us (the
  // DDIWorkspace-level refreshPatient() above can swap in a fresher
  // `patient` object for the same id once it resolves, e.g. right after a
  // checkup synced in a newly finalized prescription -- this component
  // doesn't remount in that case, so it has to notice via the signature).
  useEffect(() => { if (patient.meds.length > 1) run(patient.meds, patient); else { setState('idle'); setResult(null); setAnalysedSig(''); } }, [patient.id, sig(patient.meds)]); // eslint-disable-line

  const working = { ...patient, meds };
  const stale = state === 'done' && sig(meds) !== analysedSig;
  const pairs = result?.pairs || [];
  const counts = { all: pairs.length, High: pairs.filter((x) => x.severity === 'High').length, Moderate: pairs.filter((x) => x.severity === 'Moderate').length };
  const shown = filter === 'all' ? pairs : pairs.filter((x) => x.severity === filter);
  const factors = riskFactors(working, meds.length);
  const score = useMemo(() => riskScore(working, pairs.filter((x) => !x.modelOnly), meds.length), [pairs, patient, meds.length]); // eslint-disable-line
  const hitNames = new Set(pairs.flatMap((x) => [x.a, x.b]));
  const topHigh = pairs.find((x) => x.severity === 'High');

  return (
    <>
      <PageHead
        breadcrumbs={<><Link to="/app/patients">Patients</Link><span>/</span><Link to={`/app/patients/${patient.id}`}>{patient.name}</Link><span>/</span><span className="cur">DDI Analysis</span></>}
        title="DDI Analysis Workspace" subtitle="Analyze potential drug–drug interactions in the patient’s current medications.">
        {state === 'done' && <span className={`badge ${result.engine === 'live' ? 'badge-low' : 'badge-neutral'}`} title={result.engine === 'live' ? 'Results include the FastAPI Module 2 lookup' : 'FastAPI backend not reachable — using the built-in reference interaction data'}>{result.engine === 'live' ? <><Wifi size={12} />Live engine</> : <><WifiOff size={12} />Reference data</>}</span>}
        {state === 'done' && <span className={`badge ${result.modelInfo?.status === 'ready' ? 'badge-info' : 'badge-neutral'}`} title="DGAT score is a population-level TWOSIDES association, not patient-specific clinical risk.">
          {result.modelInfo?.status === 'ready' ? 'DGAT model ready' : 'DGAT model unavailable'}
        </span>}
        {state === 'done' && <div className="small muted" style={{ textAlign: 'right' }}><span className="badge badge-low no-dot" style={{ marginRight: 8 }}><CircleCheck size={12} />Analysis Complete</span><div className="mt-4">Analysis ID: {result.id} · {fmtDate(result.at)}</div></div>}
      </PageHead>

      {state === 'done' && result.engine === 'reference' && (
        <div className="sys-banner warn" role="status" style={{ borderRadius: 8, marginBottom: 16 }}>
          <span><b>DDI engine not reachable.</b> This check used the built-in reference interaction data. It is not saved to a prescription; run the prescription DDI analysis for the recorded result.</span>
        </div>
      )}
      {analysisError && <div className="sys-banner warn" role="alert" style={{ borderRadius: 8, marginBottom: 16 }}>{analysisError}</div>}
      {state === 'done' && result.modelInfo?.status !== 'ready' && result.engine === 'live' && (
        <div className="sys-banner warn" role="status" style={{ borderRadius: 8, marginBottom: 16 }}>
          <span><b>DGAT model unavailable.</b> The baseline database and patient-factor analysis still ran, but no trained-model score was produced.</span>
        </div>
      )}
      <div className="card card-pad mb-16 row gap-12 wrap">
        <Avatar name={patient.name} />
        <div className="grow" style={{ minWidth: 180 }}><b>{patient.name}</b><div className="small muted">{patient.id} · {patient.age} yrs · {patient.gender} · eGFR {patient.egfr} · ALT {patient.alt}</div></div>
        <div className="field" style={{ minWidth: 'min(220px, 100%)' }}>
          <label htmlFor="patient-pick" className="sr-only">Patient</label>
          <select id="patient-pick" className="select" value={patient.id} onChange={(e) => setParams({ patient: e.target.value })}>{patients.slice(0, 60).map((p) => <option key={p.id} value={p.id}>{p.id} — {p.name}</option>)}</select>
        </div>
      </div>

      <div className="ddi-grid">
        <section className="card card-pad">
          <div className="callout callout-info" style={{ display: 'flex', gap: 8 }}><Info size={16} style={{ flexShrink: 0, marginTop: 2 }} /><span>Medications can only be changed by a prescription during a consultation. This checker analyses the patient’s current list.</span></div>
          <div className="row between mt-16 mb-8">
            <h2 className="card-title">Added Medications ({meds.length})</h2>
            <div className="row gap-12">
              <button className="link-btn" title="Reload this patient's medications from their record -- use this if a prescription was just finalized in another tab" onClick={async () => { try { await refreshPatient(patient.id); toast.success('Medication list refreshed from the patient record.'); } catch (ex) { toast.error(ex.message || 'Could not refresh the medication list.'); } }}>Refresh</button>
            </div>
          </div>
          {meds.length === 0 ? <p className="muted small">This patient needs at least two current medications to check for interactions. Medications are added through a prescription in a consultation.</p> : meds.map((m) => (
            <div className="med-item" key={m.name}>
              <span className={`ico ${state === 'done' && hitNames.has(m.name) ? 'hit' : ''}`}><Pill size={17} /></span>
              <div className="grow"><b>{m.name}</b><span>{m.dose} · {m.freq}</span></div>
            </div>
          ))}
          <button className="btn btn-primary btn-block mt-16" disabled={meds.length < 2 || state === 'loading'} onClick={() => run(meds, working)}>{state === 'loading' ? <><span className="spinner sm" style={{ borderTopColor: '#fff', borderColor: 'rgba(255,255,255,.35)' }} />Analyzing…</> : <><RefreshCw size={15} />{state === 'done' ? 'Re-run analysis' : 'Run analysis'}</>}</button>
        </section>

        <div className="ddi-right">
          {stale && <div className="callout callout-warn"><TriangleAlert size={16} /><span>The medication list changed after the last analysis. Re-run the analysis to update these results.</span></div>}
          {state === 'done' && topHigh && !ack && (
            <div className="critical" role="alert"><TriangleAlert size={22} color="var(--high)" /><div className="grow"><b>Critical alert — high severity interaction</b><span className="small">{topHigh.a} + {topHigh.b} · Requires clinical review</span></div>
              <button className="btn btn-danger btn-sm" onClick={() => setOpenItem(topHigh)}>View Details</button><button className="btn btn-outline btn-sm" onClick={() => setAck(true)}>Acknowledge</button></div>
          )}

          <section className="card card-flush">
            <div className="card-head" style={{ paddingBottom: 12 }}>
              <h2 className="card-title">Analysis Results</h2>
              {state === 'done' && <div className="pills" role="group" aria-label="Filter by severity">
                {[['all', `All Interactions (${counts.all})`], ['High', `High Severity (${counts.High})`], ['Moderate', `Moderate (${counts.Moderate})`]].map(([k, l]) => <button key={k} className="pill" aria-pressed={filter === k} onClick={() => setFilter(k)}>{l}</button>)}
              </div>}
            </div>
            {state === 'loading' && <div className="analysis-state"><div className="spinner" style={{ margin: '0 auto 14px' }} /><b>Analyzing drug interactions…</b><p className="muted small mt-4">This may take a few seconds.</p><div className="indeterminate" style={{ maxWidth: 260, margin: '18px auto 0' }} /></div>}
            {state === 'idle' && <EmptyState icon={Pill} title="Ready when you are">Run the analysis to see interactions between the patient’s current medications.</EmptyState>}
            {state === 'done' && pairs.length === 0 && <div className="analysis-state"><div className="status-icon ok" style={{ margin: '0 auto 14px' }}><CircleCheck size={28} /></div><b>No known or above-threshold associations detected</b><p className="muted small mt-4">Based on the current medication list and available engines; an unflagged result does not establish safety.<br />Analysis completed {result.at.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}.</p></div>}
            {state === 'done' && pairs.length > 0 && (shown.length === 0 ? <p className="muted small" style={{ padding: '10px 20px 24px' }}>No interactions at this severity.</p> : (
              <div className="table-wrap"><table className="table"><thead><tr><th>Medication A</th><th>Medication B</th><th>Severity</th><th>Type</th><th /></tr></thead>
                <tbody>{shown.map((x) => (
                  <tr key={x.key} className="clickable" onClick={() => setOpenItem(x)} tabIndex={0} onKeyDown={(e) => { if (e.key === 'Enter') setOpenItem(x); }}>
                    <td><b>{x.a}</b></td><td><b>{x.b}</b></td><td>{x.modelOnly ? <span className="badge badge-info no-dot">Model signal</span> : <SeverityBadge level={x.severity} />}</td><td className="muted">{x.type}</td><td className="right"><span className="link-btn">Details</span></td>
                  </tr>))}</tbody></table></div>))}
          </section>

          <div className="ddi-lower">
            <section className="card card-pad">
              <h2 className="card-title mb-8">Patient Risk Factors</h2>
              {factors.map((f) => <div key={f.id} className={`factor ${f.flagged ? 'flag' : ''}`}><i className="dot" /><div><b style={{ fontWeight: 600 }}>{f.label}</b><span className="n">{f.note}</span></div></div>)}
            </section>
            <section className="card card-pad">
              <h2 className="card-title mb-12">Why this risk score</h2>
              {state === 'done' ? (<>
                <div className="row gap-16">
                  <div className="score-ring" style={{ '--v': score.score, '--c': score.level === 'High' ? 'var(--high)' : score.level === 'Medium' ? '#f0a63a' : 'var(--low)' }}><div>{score.score}<small>of 100</small></div></div>
                  <div><SeverityBadge level={score.level} suffix=" risk" /><p className="small muted mt-8">Patient-adjusted score from the interactions found and this patient’s factors.</p></div>
                </div>
                <div className="mt-12">{score.parts.map((p) => <div className="kv" key={p.label}><dt style={{ fontSize: 12.5 }}>{p.label}</dt><dd>+{p.points}</dd></div>)}</div>
              </>) : <p className="muted small">Run an analysis to see how the score is built.</p>}
            </section>
          </div>
        </div>
      </div>
      {openItem && <InteractionDrawer item={openItem} onClose={() => setOpenItem(null)} canRequest={user.role === 'doctor'} patientId={patient.id} />}
    </>
  );
}
