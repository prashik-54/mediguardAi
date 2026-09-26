import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { BellOff, ChevronDown, Search, Mail, Phone, Clock, X, CheckCheck } from 'lucide-react';
import { PageHead, EmptyState } from '../../components/ui/Misc';
import { Tabs } from '../../components/ui/Tabs';
import { TextField, SelectField, TextAreaField } from '../../components/ui/Field';
import { NamedIcon } from '../../components/ui/Icons';
import { useNotifications } from '../../context/NotificationsContext';
import { useToast } from '../../context/ToastContext';
import { FAQS } from '../../data/misc';
import { useAuth } from '../../context/AuthContext';
import { notifRoute } from '../../lib/audit';
import '../../styles/dashboard.css';
import '../../styles/settings.css';

const TONES = { high: ['var(--high-bg)', 'var(--high)'], low: ['var(--low-bg)', 'var(--low)'], info: ['var(--info-bg)', 'var(--info)'], moderate: ['var(--mod-bg)', 'var(--mod)'] };

function NotificationsTab() {
  const { user } = useAuth();
  const nav = useNavigate();
  const { items, unread, markRead, markAllRead, dismiss } = useNotifications();
  const [kind, setKind] = useState('All');
  const kinds = ['All', ...new Set(items.map((n) => n.kind))];
  const list = items.filter((n) => kind === 'All' || n.kind === kind);
  return (
    <section className="card card-flush">
      <div className="card-head" style={{ paddingBottom: 14 }}>
        <div className="pills" role="group" aria-label="Filter notifications">{kinds.map((k) => <button key={k} className="pill" aria-pressed={kind === k} onClick={() => setKind(k)}>{k}</button>)}</div>
        <button className="btn btn-outline btn-sm" disabled={!unread} onClick={markAllRead}><CheckCheck size={14} />Mark all read</button>
      </div>
      {list.length === 0 ? <EmptyState icon={BellOff} title="You’re all caught up">New alerts and updates will show up here.</EmptyState> : list.map((n) => (
        <div key={n.id} className={`notif ${n.unread ? 'unread' : ''}`}>
          <span style={{ width: 34, height: 34, borderRadius: '50%', background: (TONES[n.tone] || TONES.info)[0], color: (TONES[n.tone] || TONES.info)[1], display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><NamedIcon name={n.icon} /></span>
          <button className="grow" style={{ border: 0, background: 'none', textAlign: 'left', padding: 0 }} onClick={() => { markRead(n.id); const to = notifRoute(n, user.role); if (to) nav(to); }}><b>{n.unread && <span className="unread-dot" />}{n.title}</b><p>{n.body}</p></button>
          <time>{n.time}</time>
          <button className="icon-btn plain" aria-label={`Dismiss ${n.title}`} onClick={() => dismiss(n.id)}><X size={15} /></button>
        </div>
      ))}
    </section>
  );
}

function FaqTab() {
  const [q, setQ] = useState('');
  const list = FAQS.filter((f) => `${f.q} ${f.a}`.toLowerCase().includes(q.toLowerCase()));
  return (
    <section className="card card-flush">
      <div style={{ padding: 16, borderBottom: '1px solid var(--border)' }}><div className="input-icon"><Search size={16} /><input className="input" placeholder="Search frequently asked questions…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search FAQs" /></div></div>
      {list.length === 0 ? <EmptyState title="No answers found">Try different words, or contact support.</EmptyState> : list.map((f) => <details className="faq" key={f.q}><summary>{f.q}<ChevronDown size={18} /></summary><p>{f.a}</p></details>)}
    </section>
  );
}

const SUPPORT_EMAIL = 'support@mediguard.ai';

/** There is no support-ticket backend, so this composes an email instead of pretending to file a ticket. */
function SupportTab() {
  const toast = useToast();
  const [f, setF] = useState({ subject: '', topic: '', message: '' });
  const [err, setErr] = useState({});
  const submit = (e) => {
    e.preventDefault();
    const n = {}; if (f.subject.trim().length < 4) n.subject = 'Give the request a short title'; if (!f.topic) n.topic = 'Choose a topic'; if (f.message.trim().length < 15) n.message = 'Describe the problem in a sentence or two';
    setErr(n); if (Object.keys(n).length) return;
    window.location.href = `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(`[${f.topic}] ${f.subject.trim()}`)}&body=${encodeURIComponent(f.message.trim())}`;
    toast.info('Opening your email app to send this request.');
  };
  return (
    <div className="support-grid">
      <form className="card card-pad grid" style={{ gap: 14 }} onSubmit={submit} noValidate>
        <h2 className="card-title">Contact support</h2>
        <TextField label="Subject" value={f.subject} onChange={(e) => setF({ ...f, subject: e.target.value })} error={err.subject} />
        <SelectField label="Topic" value={f.topic} onChange={(e) => setF({ ...f, topic: e.target.value })} error={err.topic} placeholder="Select a topic" options={['Interaction results', 'Patient records', 'Reports & export', 'Account & access', 'Something else']} />
        <TextAreaField label="How can we help?" rows={5} value={f.message} onChange={(e) => setF({ ...f, message: e.target.value })} error={err.message} hint="Please don’t include patient names or IDs." />
        <button className="btn btn-primary" style={{ justifySelf: 'start' }} type="submit">Email support</button>
      </form>
      <div className="grid" style={{ gap: 16 }}>
        <section className="card card-pad"><h2 className="card-title mb-8">Reach us directly</h2>
          {[[Mail, SUPPORT_EMAIL, 'Replies within one working day'], [Phone, '+91 712 000 0000', 'Mon–Fri, 10:00–18:00 IST'], [Clock, 'Urgent clinical issue?', 'Follow your hospital’s escalation process']].map(([I, t, d]) => <div className="doc-row" key={t}><I size={18} color="var(--primary)" /><div><b>{t}</b><span>{d}</span></div></div>)}</section>
      </div>
    </div>
  );
}

/** Notifications — one job, one page (reached from the sidebar and the bell). */
export function NotificationsPage() {
  const { unread } = useNotifications();
  useEffect(() => { document.title = 'Notifications — MediGuard AI'; }, []);
  return (
    <>
      <PageHead title="Notifications" subtitle={unread ? `${unread} unread` : 'Alerts and updates for your work.'} />
      <NotificationsTab />
    </>
  );
}

/** Help & Support — FAQs and contact, separate from notifications. */
export function HelpPage() {
  const [tab, setTab] = useState('faqs');
  useEffect(() => { document.title = 'Help & Support — MediGuard AI'; }, []);
  const View = { faqs: FaqTab, support: SupportTab }[tab];
  return (
    <>
      <PageHead title="Help & Support" subtitle="Find answers or reach the support team." />
      <div className="mb-16"><Tabs value={tab} onChange={setTab} label="Help sections" tabs={[{ id: 'faqs', label: 'FAQs' }, { id: 'support', label: 'Contact support' }]} /></div>
      <View />
    </>
  );
}
