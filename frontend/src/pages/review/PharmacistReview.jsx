import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Search, ClipboardCheck, CircleCheck, Inbox } from 'lucide-react';
import { Avatar, EmptyState, PageHead } from '../../components/ui/Misc';
import { RiskBadge, SeverityBadge, StatusBadge } from '../../components/ui/Badges';
import { Tabs } from '../../components/ui/Tabs';
import { SelectField, TextAreaField } from '../../components/ui/Field';
import { useReviews } from '../../context/ReviewsContext';
import { useToast } from '../../context/ToastContext';
import { kidneyStatus, liverStatus, riskFactors } from '../../lib/risk';
import '../../styles/review.css';

const DECISIONS = [
  ['Approve', 'Approve', 'Combination is acceptable as prescribed'],
  ['Approve with monitoring', 'Approve with monitoring', 'Acceptable with follow-up checks'],
  ['Recommend alternative', 'Recommend alternative', 'Suggest a different drug or dose'],
  ['Escalate', 'Escalate to physician', 'Needs urgent clinical attention'],
];
const TAGS = ['High risk', 'Renal dosing', 'Monitor INR', 'Bleeding risk', 'Dose adjustment', 'Patient counselling'];

export default function PharmacistReview() {
  const { queue, submitReview } = useReviews();
  const toast = useToast();
  const [params, setParams] = useSearchParams();
  const [q, setQ] = useState('');
  const [prio, setPrio] = useState('All');
  const [view, setView] = useState('Pending');
  const [tab, setTab] = useState('info');
  const [form, setForm] = useState({ interaction: 0, severity: 'High', decision: 'Approve with monitoring', comment: '', tags: [] });
  const [err, setErr] = useState({});
  useEffect(() => { document.title = 'Pharmacist review — MediGuard AI'; }, []);

  const list = useMemo(() => queue.filter((r) => (view === 'All' || (view === 'Pending' ? r.status === 'Pending' : r.status !== 'Pending')) && (prio === 'All' || r.priority === prio) && (!q || `${r.patient.name} ${r.patientId}`.toLowerCase().includes(q.toLowerCase()))), [queue, view, prio, q]);
  const selectedId = params.get('id') || list[0]?.id;
  const item = queue.find((r) => r.id === selectedId) || list[0];

  useEffect(() => { if (item) { setForm({ interaction: 0, severity: item.interactions[0]?.severity || 'Low', decision: 'Approve with monitoring', comment: '', tags: item.priority === 'High' ? ['High risk'] : [] }); setErr({}); setTab('info'); } }, [item?.id]); // eslint-disable-line

  const select = (id) => setParams({ id }, { replace: true });
  const submit = async () => {
    const e = {};
    if (form.comment.trim().length < 10) e.comment = 'Add a clinical note of at least 10 characters';
    setErr(e);
    if (Object.keys(e).length) return;
    try { await submitReview(item.id, { ...form, interactionLabel: item.interactions[form.interaction] ? `${item.interactions[form.interaction].a} + ${item.interactions[form.interaction].b}` : 'General' }); } catch (ex) { toast.error(ex.message || 'The review could not be saved.'); return; }
    toast.success(form.decision === 'Escalate' ? `${item.patient.name} escalated to the physician.` : `Review submitted for ${item.patient.name}.`);
    const nextPending = queue.find((r) => r.status === 'Pending' && r.id !== item.id);
    if (nextPending) select(nextPending.id);
  };

  const pendingCount = queue.filter((r) => r.status === 'Pending').length;
  const p = item?.patient;

  return (
    <>
      <PageHead title="Pharmacist Review Workspace" subtitle="Review flagged interactions and record a clinical decision." />
      <div className="review-layout">
        <section className="card card-flush" aria-label="Review queue">
          <div className="card-head" style={{ paddingBottom: 12 }}><h2 className="card-title">Review Queue ({pendingCount})</h2></div>
          <div style={{ padding: '0 14px 12px' }} className="col gap-8">
            <div className="input-icon"><Search size={15} /><input className="input" style={{ height: 36 }} placeholder="Search patient or ID…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search queue" /></div>
            <div className="row gap-8">
              <select className="select" style={{ height: 34, fontSize: 12.5 }} value={prio} onChange={(e) => setPrio(e.target.value)} aria-label="Priority"><option value="All">All priorities</option><option>High</option><option>Medium</option><option>Low</option></select>
              <select className="select" style={{ height: 34, fontSize: 12.5 }} value={view} onChange={(e) => setView(e.target.value)} aria-label="Status"><option>Pending</option><option>Completed</option><option>All</option></select>
            </div>
          </div>
          {list.length === 0 ? <EmptyState icon={Inbox} title="Nothing here">No reviews match this view.</EmptyState> : list.map((r) => (
            <button key={r.id} className={`queue-item ${r.status !== 'Pending' ? 'done' : ''}`} aria-current={item?.id === r.id} onClick={() => select(r.id)}>
              <Avatar name={r.patient.name} size="sm" />
              <div className="grow"><b>{r.patient.name}</b><div className="m">{r.patientId} · {r.interactions.length} interaction{r.interactions.length !== 1 ? 's' : ''}</div></div>
              {r.status === 'Pending' ? <RiskBadge level={r.priority} /> : <StatusBadge status={r.status} />}
            </button>
          ))}
        </section>

        {!item ? <section className="card"><EmptyState icon={CircleCheck} title="Queue cleared">Every flagged interaction has been reviewed.</EmptyState></section> : (
          <>
            <section className="card card-flush">
              <div style={{ padding: '16px 20px 0' }}>
                <div className="row between wrap gap-12">
                  <div className="row gap-12"><Avatar name={p.name} size="lg" /><div><h2 style={{ fontSize: 18 }}>{p.name}</h2><div className="small muted">{p.id} · {p.age} yrs · {p.gender} · requested by {item.requestedBy}</div></div></div>
                  <RiskBadge level={item.priority} />
                </div>
                <div className="mt-16"><Tabs value={tab} onChange={setTab} tabs={[{ id: 'info', label: 'Patient Information' }, { id: 'meds', label: 'Medications' }, { id: 'ints', label: `Interactions (${item.interactions.length})` }]} /></div>
              </div>
              <div style={{ padding: 20 }}>
                {tab === 'info' && (
                  <div className="grid cols-2" style={{ gap: 18 }}>
                    <dl className="kvs"><div className="kv"><dt>eGFR</dt><dd>{p.egfr} <span className={`badge no-dot badge-${kidneyStatus(p.egfr).tone}`}>{kidneyStatus(p.egfr).label}</span></dd></div><div className="kv"><dt>Creatinine</dt><dd>{p.creatinine} mg/dL</dd></div><div className="kv"><dt>ALT / AST</dt><dd>{p.alt} / {p.ast} U/L <span className={`badge no-dot badge-${liverStatus(p.alt).tone}`}>{liverStatus(p.alt).label}</span></dd></div><div className="kv"><dt>Conditions</dt><dd>{p.conditions.join(', ') || '—'}</dd></div><div className="kv"><dt>Allergies</dt><dd>{p.allergies.map((a) => a.substance).join(', ') || 'None known'}</dd></div></dl>
                    <div><div className="label mb-8">Risk factors</div>{riskFactors(p).map((f) => <div key={f.id} className="row gap-8 small" style={{ padding: '6px 0' }}><span style={{ width: 8, height: 8, borderRadius: '50%', background: f.flagged ? 'var(--high)' : 'var(--low)' }} />{f.label}</div>)}</div>
                  </div>
                )}
                {tab === 'meds' && p.meds.map((m) => <div className="med-mini mb-8" key={m.name}><div className="grow"><b>{m.name} {m.dose}</b><span>{m.freq} · {m.indication}</span></div></div>)}
                {tab === 'ints' && (item.interactions.length ? item.interactions.map((i) => (
                  <div className="int-card" key={i.key}><div className="row between wrap gap-8"><b>{i.a} + {i.b}</b><SeverityBadge level={i.severity} /></div><p className="small mt-8" style={{ lineHeight: 1.65 }}>{i.mechanism}</p><div className="callout callout-info mt-12">{i.recommendation}</div></div>
                )) : <p className="muted small">No interactions were flagged.</p>)}
                {item.review && (
                  <div className="callout callout-ok mt-16"><CircleCheck size={16} /><div><b>{item.review.decision}</b> — {item.review.comment}<div className="tiny muted mt-4">{item.review.interactionLabel} · severity {item.review.severity}</div></div></div>
                )}
              </div>
            </section>

            <section className="card card-pad review-form" aria-label="Review form">
              <h2 className="card-title mb-12"><ClipboardCheck size={16} style={{ verticalAlign: '-3px', marginRight: 6 }} />Review Form</h2>
              {item.status !== 'Pending' ? <div className="callout callout-ok">This review is {item.status.toLowerCase()}. It can’t be edited.</div> : (
                <div className="grid" style={{ gap: 14 }}>
                  {item.interactions.length > 0 && <SelectField label="Interaction" value={form.interaction} onChange={(e) => { const i = Number(e.target.value); setForm({ ...form, interaction: i, severity: item.interactions[i].severity }); }} options={item.interactions.map((x, i) => ({ value: i, label: `${x.a} + ${x.b}` }))} />}
                  <SelectField label="Assessed severity" value={form.severity} onChange={(e) => setForm({ ...form, severity: e.target.value })} options={['High', 'Moderate', 'Low']} />
                  <div className="field"><span className="label" id="dec-l">Decision</span>
                    <div className="col gap-8" role="radiogroup" aria-labelledby="dec-l">{DECISIONS.map(([v, l, d]) => <label className="radio-card" key={v}><input type="radio" name="decision" checked={form.decision === v} onChange={() => setForm({ ...form, decision: v })} /><div><b>{l}</b><span>{d}</span></div></label>)}</div></div>
                  <TextAreaField label="Clinical note" rows={4} placeholder="Explain your reasoning and any monitoring plan…" value={form.comment} onChange={(e) => setForm({ ...form, comment: e.target.value })} error={err.comment} />
                  <div className="field"><span className="label">Add tags</span><div className="chips">{TAGS.map((t) => <button key={t} type="button" className="tag-toggle" aria-pressed={form.tags.includes(t)} onClick={() => setForm({ ...form, tags: form.tags.includes(t) ? form.tags.filter((x) => x !== t) : [...form.tags, t] })}>{t}</button>)}</div></div>
                  <div className="row gap-8"><button className="btn btn-outline grow" onClick={() => setForm({ ...form, comment: '', tags: [] })}>Cancel</button><button className="btn btn-navy grow" onClick={submit}>Submit Review</button></div>
                </div>
              )}
            </section>
          </>
        )}
      </div>
    </>
  );
}
