import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { TriangleAlert, ArrowRight, Mail, MapPin, Phone, CircleCheck, Check, Languages, Brain, ClipboardCheck, GraduationCap, Layers, ShieldCheck } from 'lucide-react';
import { IconTile } from '../../components/ui/Misc';
import { TextField, SelectField, TextAreaField } from '../../components/ui/Field';
import { useToast } from '../../context/ToastContext';
import { isEmail } from '../../lib/format';
import { buildPatients } from '../../data/patients';
import { patientRisk } from '../../lib/risk';
import HeroScene from '../../components/art/HeroScene';
import Portrait from '../../components/art/Portraits';
import { Capsule, Tablet } from '../../components/art/Capsule';
import { SpotRisk, SpotExplain, SpotPatients, SpotSecure, StepRegister, StepMeds, StepAnalyze, StepReport, CtaArt } from '../../components/art/Spots';
import '../../styles/home.css';

// PLACEHOLDER marketing figures carried over from the reference design.
// Replace with verified numbers before any public release.
const STATS = [['10K+', 'Patients managed'], ['98%', 'Accuracy rate'], ['24/7', 'System availability']];

const FEATURES = [
  { art: SpotRisk, title: 'Personalised risk prediction', text: 'Risk is adjusted for age, kidney and liver function, allergies and the full medication list — not just the drug pair.' },
  { art: SpotExplain, title: 'Explainable interactions', text: 'See why an interaction was flagged, the mechanism behind it and what to do next, in plain clinical language.' },
  { art: SpotPatients, title: 'Patient management', text: 'Complete clinical profiles in one place: labs, conditions, allergies, medications and analysis history.' },
  { art: SpotSecure, title: 'Secure by design', text: 'Role-based access for doctors, pharmacists, patients and admins, with a full audit trail of every action.' },
];

const STEPS = [
  { art: StepRegister, title: 'Register the patient', text: 'Capture age, gender, kidney and liver function, allergies and existing conditions.' },
  { art: StepMeds, title: 'Add medications', text: 'Search by generic or Indian brand name. Brands are mapped to their active salts.' },
  { art: StepAnalyze, title: 'Run the analysis', text: 'Every pair is checked against the drug knowledge base and adjusted for the patient.' },
  { art: StepReport, title: 'Review and act', text: 'Read the explanation, request a pharmacist review, then export a report.' },
];

const ROLES = [
  { role: 'doctor', tone: '#d6f5ee', title: 'Doctors', text: 'Run analyses and act on the results.', points: ['Register patients and medication lists', 'See each alert with its reasoning', 'Request a pharmacist review'] },
  { role: 'pharmacist', tone: '#dbe7ff', title: 'Pharmacists', text: 'Review what has been flagged.', points: ['A queue ordered by priority', 'Approve, adjust or escalate with notes', 'Full patient context on one screen'] },
  { role: 'patient', tone: '#ffedcf', title: 'Patients', text: 'Understand your own medicines.', points: ['Plain-language interaction alerts', 'Medication reminders', 'Download your reports'] },
  { role: 'admin', tone: '#e6e0ff', title: 'Administrators', text: 'Keep operations safe and auditable — at your hospital or across the platform.', points: ['Hospital admins manage their own staff & patients', 'Platform admins oversee every hospital', 'An audit trail of every action'] },
];

/** Counts a leading number up when scrolled into view ("10K+" → 0…10 then "K+"). */
function useInView(threshold = 0.35) {
  const ref = useRef(null);
  const [seen, setSeen] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || seen) return undefined;
    if (typeof IntersectionObserver === 'undefined') { setSeen(true); return undefined; }
    const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) { setSeen(true); io.disconnect(); } }, { threshold });
    io.observe(el);
    return () => io.disconnect();
  }, [seen, threshold]);
  return [ref, seen];
}

function CountUp({ text, run }) {
  const m = /^(\d+(?:\.\d+)?)(.*)$/.exec(text);
  const [v, setV] = useState(m ? 0 : null);
  useEffect(() => {
    if (!m || !run) return undefined;
    const to = parseFloat(m[1]); const dec = (m[1].split('.')[1] || '').length;
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (reduce) { setV(to); return undefined; }
    let raf; const t0 = performance.now();
    const tick = (t) => { const k = Math.min(1, (t - t0) / 1300); setV(to * (1 - (1 - k) ** 3)); if (k < 1) raf = requestAnimationFrame(tick); };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [run]); // eslint-disable-line
  if (!m) return text;
  const dec = (m[1].split('.')[1] || '').length;
  return <>{(v ?? 0).toFixed(dec)}{m[2]}</>;
}

function HeroVisual() {
  return (
    <div className="hero-visual">
      <HeroScene />
      <div className="hero-cap a"><Capsule w={92} h={34} a="#2bd9b5" b="#ffffff" rot={-24} style={{ '--r': '-24deg' }} /></div>
      <div className="hero-cap b"><Tablet size={38} color="#dfeaff" shade="#7fa8f0" /></div>
      <div className="hero-cap c"><Capsule w={74} h={28} a="#f4b23f" b="#fff4dc" rot={18} style={{ '--r': '18deg' }} /></div>

      <div className="hero-card hc-alert" role="note">
        <div className="row gap-10" style={{ alignItems: 'flex-start' }}>
          <span className="ic"><TriangleAlert size={17} /></span>
          <div><b>High severity interaction</b><span className="d">Warfarin + Aspirin</span></div>
        </div>
        <div className="foot"><span>Bleeding risk raised</span><span className="badge badge-high">High</span></div>
      </div>

      <div className="hero-card hc-score">
        <div className="row gap-12">
          <div className="ring" aria-hidden="true"><i>92</i></div>
          <div><b>Patient-adjusted risk</b><span className="d">Age 67 · eGFR 52</span></div>
        </div>
      </div>

      <div className="hero-card hc-review">
        <Portrait role="pharmacist" size={34} />
        <div><b>Review requested</b><span>Pharmacist notified</span></div>
      </div>
    </div>
  );
}

function ExplainShowcase() {
  const [p] = useState(() => buildPatients().find((x) => x.name === 'Rajesh Kumar'));
  const [ref, seen] = useInView(0.3);
  const r = patientRisk(p);
  const max = Math.max(...r.parts.map((x) => x.points));
  return (
    <div className="why-wrap">
      <div className={`card why-card ${seen ? 'in' : ''}`} ref={ref}>
        <div className="row between wrap gap-8">
          <div><div className="muted small">Sample patient · {p.age} yrs · eGFR {p.egfr}</div><div className="strong" style={{ marginTop: 2 }}>{p.meds.map((m) => m.name).join(' · ')}</div></div>
          <span className="badge badge-high">{r.level} risk</span>
        </div>
        <div className="why-score mt-16"><b><CountUp text={String(r.score)} run={seen} /></b><span className="muted">/ 100 patient-adjusted risk</span></div>
        <div className="mt-12">
          {r.parts.map((x, i) => (
            <div className="bar-row" key={x.label}>
              <span className="truncate" title={x.label}>{x.label}</span>
              <span className="bar"><i style={{ '--w': `${(x.points / max) * 100}%`, '--i': i }} /></span>
              <span className="mono">+{x.points}</span>
            </div>
          ))}
        </div>
        <p className="tiny muted mt-8">Illustrative scoring example. The trained prediction engine (Module 4, part 2) will replace these rules.</p>
      </div>
    </div>
  );
}

function ContactForm() {
  const toast = useToast();
  const [f, setF] = useState({ name: '', email: '', topic: '', message: '' });
  const [err, setErr] = useState({});
  const [sent, setSent] = useState(false);
  const set = (k) => (e) => setF((s) => ({ ...s, [k]: e.target.value }));
  const submit = (e) => {
    e.preventDefault();
    const n = {};
    if (!f.name.trim()) n.name = 'Enter your name';
    if (!isEmail(f.email)) n.email = 'Enter a valid email address';
    if (!f.topic) n.topic = 'Choose a topic';
    if (f.message.trim().length < 10) n.message = 'Tell us a little more (at least 10 characters)';
    setErr(n);
    if (Object.keys(n).length) return;
    setSent(true); toast.success('Message sent. We reply within two working days.');
  };
  if (sent) {
    return (
      <div className="card card-pad center" style={{ padding: 44 }}>
        <div className="status-icon ok" style={{ margin: '0 auto 16px' }}><CircleCheck size={28} /></div>
        <h3>Thanks, {f.name.split(' ')[0]}</h3>
        <p className="muted mt-8">We’ve sent a confirmation to {f.email}. Someone from the team will reply within two working days.</p>
        <button className="btn btn-outline mt-16" onClick={() => { setSent(false); setF({ name: '', email: '', topic: '', message: '' }); }}>Send another message</button>
      </div>
    );
  }
  return (
    <form className="card card-pad grid" style={{ padding: 26 }} onSubmit={submit} noValidate>
      <div className="grid cols-2">
        <TextField label="Full name" value={f.name} onChange={set('name')} error={err.name} autoComplete="name" />
        <TextField label="Email" type="email" value={f.email} onChange={set('email')} error={err.email} autoComplete="email" />
      </div>
      <SelectField label="Topic" value={f.topic} onChange={set('topic')} error={err.topic} placeholder="Select a topic" options={['Request a demo', 'Research collaboration', 'Report an issue', 'Something else']} />
      <TextAreaField label="Message" value={f.message} onChange={set('message')} error={err.message} rows={5} />
      <div className="row between wrap gap-12"><span className="tiny muted">Please don’t include patient-identifiable information.</span><button className="btn btn-primary" type="submit">Send message</button></div>
    </form>
  );
}

export default function Home() {
  const nav = useNavigate();
  const [statsRef, statsSeen] = useInView(0.5);
  useEffect(() => { document.title = 'MediGuard AI — Smarter medication decisions through explainable AI'; }, []);
  return (
    <>
      <section className="hero" aria-labelledby="hero-title">
        <div className="container hero-inner">
          <div className="hero-copy">
            <h1 id="hero-title">Smarter medication decisions through explainable AI</h1>
            <p className="lead">Personalised drug–drug interaction analysis and clinical risk prediction for safer, better healthcare.</p>
            <div className="hero-cta">
              <Link to="/login" className="btn btn-accent btn-lg">Login <ArrowRight size={17} /></Link>
              <button className="btn btn-lg btn-outline btn-on-dark" style={{ background: 'transparent' }} onClick={() => document.getElementById('how')?.scrollIntoView({ behavior: 'smooth' })}>Explore Platform</button>
            </div>
            <ul className="hero-points">
              <li><span className="ico"><Languages size={15} /></span>Indian brand names mapped to their active salts</li>
              <li><span className="ico"><Brain size={15} /></span>Every risk score comes with its reasoning</li>
              <li><span className="ico"><ClipboardCheck size={15} /></span>Pharmacist review built into the workflow</li>
            </ul>
          </div>
          <HeroVisual />
        </div>
      </section>

      <section id="features" className="feature-strip" aria-label="Features">
        <div className="container">
          <div className="feature-cards">
            {FEATURES.map((f) => (
              <article className="feature-card" key={f.title}><div className="art"><f.art /></div><div className="body"><h3>{f.title}</h3><p>{f.text}</p></div></article>
            ))}
          </div>
          <div className="trust-bar" ref={statsRef}>
            <div><h3>Better insights. Safer decisions. Healthier lives.</h3><p className="small muted mt-4">This platform is a clinical decision-support tool and does not replace professional medical judgment.</p></div>
            <div className="trust-stats">{STATS.map(([n, l]) => <div key={l}><strong><CountUp text={n} run={statsSeen} /></strong><span>{l}</span></div>)}</div>
          </div>
        </div>
      </section>

      <section className="section">
        <div className="container why">
          <div>
            <div className="section-head" style={{ marginBottom: 0 }}>
              <h2>Every result shows its reasoning</h2>
              <p>A flagged interaction is only useful if a clinician can check it. MediGuard AI breaks each risk score into the interaction itself and the patient factors that raised it, so you can agree, adjust or challenge the result.</p>
            </div>
            <ul className="why-list mt-24 grid" style={{ gap: 14 }}>
              {['Mechanism and clinical impact in plain language', 'Patient factors that raised or lowered the risk', 'A recommended action and the evidence behind it'].map((t) => (
                <li key={t}><span className="tick"><Check size={15} strokeWidth={3} /></span>{t}</li>
              ))}
            </ul>
          </div>
          <ExplainShowcase />
        </div>
      </section>

      <section id="roles" className="section section-alt">
        <div className="container">
          <div className="section-head center"><h2>One platform, a view for every role</h2><p>The same patient record, shown the way each person needs to use it.</p></div>
          <div className="roles">
            {ROLES.map((r) => (
              <article className="role-card" key={r.role} style={{ '--tone': r.tone }}>
                <div className="who"><Portrait role={r.role} size={68} ring /></div>
                <h3>{r.title}</h3>
                <p className="d">{r.text}</p>
                <ul>{r.points.map((t) => <li key={t}><CircleCheck size={16} />{t}</li>)}</ul>
                <Link to="/login" className="btn btn-outline btn-sm">Sign in as {r.title.replace(/s$/, '').toLowerCase()}</Link>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section id="how" className="section">
        <div className="container">
          <div className="section-head"><h2>How it works</h2><p>From registration to a reviewed report in four steps.</p></div>
          <ol className="steps" style={{ listStyle: 'none', margin: 0, padding: 0 }}>
            {STEPS.map((s, i) => (
              <li className="step-item" key={s.title}>
                <div className="art"><s.art /></div>
                <div className="step-head"><div className="step-num">{i + 1}</div></div>
                <h3>{s.title}</h3><p>{s.text}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section id="about" className="section section-alt">
        <div className="container">
          <div style={{ maxWidth: 720 }}>
            <div className="section-head" style={{ marginBottom: 22 }}><h2>Built around Indian prescribing practice</h2></div>
            <p>Most interaction checkers are trained on Western datasets and look at drug pairs in isolation. MediGuard AI starts from the Indian drug ecosystem — CDSCO brand names mapped to generic salts — and combines it with public interaction databases and each patient’s clinical profile.</p>
            <div className="about-tags">
              <span><Layers size={15} />Six-module framework</span>
              <span><GraduationCap size={15} />Academic research project</span>
              <span><ShieldCheck size={15} />Role-based access</span>
            </div>
          </div>
        </div>
      </section>

      <section id="contact" className="section">
        <div className="container contact-grid">
          <div>
            <div className="section-head" style={{ marginBottom: 14 }}><h2>Talk to the team</h2><p>Questions, demo requests or research collaboration — we’re happy to help.</p></div>
            <ul className="contact-list">
              <li><IconTile icon={Mail} size={44} /><div><b>Email</b><span>contact@mediguard.ai</span></div></li>
              <li><IconTile icon={Phone} size={44} /><div><b>Phone</b><span>+91 712 000 0000 · Mon–Fri, 10:00–18:00 IST</span></div></li>
              <li><IconTile icon={MapPin} size={44} /><div><b>Campus</b><span>GH Raisoni College of Engineering, Nagpur</span></div></li>
            </ul>
          </div>
          <ContactForm />
        </div>
      </section>

      <section className="section section-alt" style={{ paddingTop: 64, paddingBottom: 80 }}>
        <div className="container grid" style={{ gap: 28 }}>
          <div className="disclaimer" role="note">
            <TriangleAlert size={22} style={{ flexShrink: 0, marginTop: 2 }} />
            <div>
              <h3>Clinical disclaimer</h3>
              <p>MediGuard AI is a clinical decision-support tool for healthcare professionals and researchers. It does not diagnose, prescribe or replace professional medical judgment. Results are based on available data and models and may be incomplete — always verify against current clinical guidelines and the patient’s full history before changing treatment. In an emergency, contact your local emergency services.</p>
            </div>
          </div>
          <div className="cta-band">
            <h2>Give your team a second opinion on every prescription.</h2>
            <div className="cta-actions"><button className="btn btn-accent btn-lg" onClick={() => nav('/login')}>Login <ArrowRight size={17} /></button></div>
            <CtaArt />
          </div>
        </div>
      </section>
    </>
  );
}
