import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Download, Monitor, Smartphone } from 'lucide-react';
import { Avatar, PageHead } from '../../components/ui/Misc';
import { Tabs } from '../../components/ui/Tabs';
import { TextField, SelectField, PasswordField, Toggle, passwordStrength } from '../../components/ui/Field';
import { ConfirmDialog } from '../../components/ui/Modal';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { api } from '../../lib/api';
import { isEmail } from '../../lib/format';
import '../../styles/settings.css';
import '../../styles/admin.css';

const TABS = [{ id: 'personal', label: 'Personal Information' }, { id: 'security', label: 'Security' }, { id: 'privacy', label: 'Privacy' }, { id: 'notifications', label: 'Notifications' }, { id: 'preferences', label: 'Preferences' }];

function Personal() {
  const { user, updateProfile } = useAuth();
  const toast = useToast();
  const [f, setF] = useState({ name: user.name, email: user.email, phone: user.phone || '', specialization: user.specialization || '', org: user.org || '' });
  const [err, setErr] = useState({});
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const save = () => {
    const n = {};
    if (f.name.trim().length < 2) n.name = 'Enter your full name';
    if (!isEmail(f.email)) n.email = 'Enter a valid email address';
    setErr(n); if (Object.keys(n).length) return;
    updateProfile({ ...f, name: f.name.trim() }); toast.success('Profile saved.');
  };
  return (
    <>
      <div className="form-grid">
        <TextField label="Full Name" value={f.name} onChange={set('name')} error={err.name} autoComplete="name" />
        <TextField label="Email Address" type="email" value={f.email} onChange={set('email')} error={err.email} autoComplete="email" />
        <TextField label="Phone Number" value={f.phone} onChange={set('phone')} autoComplete="tel" />
        {user.role !== 'patient' && <TextField label="Specialization" value={f.specialization} onChange={set('specialization')} />}
        {user.role !== 'patient' && <TextField label="Organisation" value={f.org} onChange={set('org')} />}
      </div>
      <div className="form-actions"><button className="btn btn-outline" onClick={() => setF({ name: user.name, email: user.email, phone: user.phone || '', specialization: user.specialization || '', org: user.org || '' })}>Cancel</button><button className="btn btn-primary" onClick={save}>Save Changes</button></div>
    </>
  );
}

function Security() {
  const toast = useToast();
  const [f, setF] = useState({ cur: '', next: '', conf: '' });
  const [err, setErr] = useState({});
  const [saving, setSaving] = useState(false);
  const [mfa, setMfa] = useState(true);
  const submit = async () => {
    const n = {};
    if (!f.cur) n.cur = 'Enter your current password';
    if (passwordStrength(f.next) < 3) n.next = 'Use 8+ characters with upper and lower case letters and a number';
    if (f.next !== f.conf) n.conf = 'Passwords don’t match';
    setErr(n); if (Object.keys(n).length) return;
    setSaving(true);
    try {
      await api.changePassword(f.cur, f.next);
      setF({ cur: '', next: '', conf: '' });
      toast.success('Password updated.');
    } catch (ex) {
      if (ex.status === 400) setErr({ cur: ex.message || 'Current password is incorrect.' });
      else toast.error(ex.message || 'Could not update the password.');
    } finally { setSaving(false); }
  };
  return (
    <div className="grid" style={{ gap: 26, maxWidth: 760 }}>
      <div><h3 style={{ fontSize: 15 }} className="mb-12">Change password</h3>
        <div className="grid" style={{ gap: 14, maxWidth: 380 }}>
          <PasswordField label="Current password" value={f.cur} onChange={(e) => setF({ ...f, cur: e.target.value })} error={err.cur} autoComplete="current-password" />
          <div><PasswordField label="New password" value={f.next} onChange={(e) => setF({ ...f, next: e.target.value })} error={err.next} autoComplete="new-password" />{f.next && <div className="strength" data-level={passwordStrength(f.next)}><i /><i /><i /><i /></div>}</div>
          <PasswordField label="Confirm new password" value={f.conf} onChange={(e) => setF({ ...f, conf: e.target.value })} error={err.conf} autoComplete="new-password" />
          <button className="btn btn-primary" style={{ justifySelf: 'start' }} disabled={saving} onClick={submit}>{saving ? 'Updating…' : 'Update password'}</button>
        </div></div>
      <div className="setting-row"><div><b>Two-factor authentication</b><span className="d">Ask for a code from your authenticator app at sign-in.</span></div><Toggle checked={mfa} onChange={(v) => { setMfa(v); toast.success(v ? 'Two-factor authentication enabled.' : 'Two-factor authentication disabled.'); }} label="Two-factor authentication" /></div>
      <div><h3 style={{ fontSize: 15 }} className="mb-8">Active sessions</h3>
        {[[Monitor, 'Chrome on Windows', 'Nagpur · This device', true], [Smartphone, 'MediGuard app on Android', 'Nagpur · 2 days ago', false]].map(([I, n, d, cur]) => (
          <div className="setting-row" key={n}><div className="row gap-12"><I size={20} color="var(--muted)" /><div><b>{n}</b><span className="d">{d}</span></div></div>{cur ? <span className="badge badge-low">Current</span> : <button className="btn btn-outline btn-sm" onClick={() => toast.success('Session signed out.')}>Sign out</button>}</div>
        ))}</div>
    </div>
  );
}

function Privacy() {
  const { user, logout } = useAuth();
  const nav = useNavigate(); const toast = useToast();
  const [p, setP] = useState({ research: false, analytics: true, visibility: true });
  const [del, setDel] = useState(false);
  const exportData = () => {
    const url = URL.createObjectURL(new Blob([JSON.stringify({ account: user, privacy: p, exportedAt: new Date().toISOString() }, null, 2)], { type: 'application/json' }));
    const a = document.createElement('a'); a.href = url; a.download = 'mediguard-my-data.json'; a.click(); URL.revokeObjectURL(url); toast.success('Your data was downloaded.');
  };
  const Row = (k, t, d) => <div className="setting-row" style={{ maxWidth: 760 }}><div><b>{t}</b><span className="d">{d}</span></div><Toggle checked={p[k]} onChange={(v) => setP({ ...p, [k]: v })} label={t} /></div>;
  return (
    <>
      {Row('research', 'Share anonymised data for research', 'Helps improve interaction models. Names and contact details are always removed.')}
      {Row('analytics', 'Product usage analytics', 'Anonymous screen and feature usage to improve the app.')}
      {Row('visibility', 'Show my activity to organisation admins', 'Admins can see when you sign in and export reports.')}
      <div className="setting-row" style={{ maxWidth: 760 }}><div><b>Download my data</b><span className="d">A JSON file with your account details and settings.</span></div><button className="btn btn-outline btn-sm" onClick={exportData}><Download size={14} />Download</button></div>
      <div className="danger-zone mt-24"><div><b style={{ color: 'var(--high)' }}>Delete account</b><div className="small muted mt-4">Your access is removed immediately. Clinical records are kept as required by your organisation.</div></div><button className="btn btn-danger-outline" onClick={() => setDel(true)}>Delete account</button></div>
      {del && <ConfirmDialog danger title="Delete your account?" message="You will be signed out and lose access to this workspace. This can’t be undone." confirmLabel="Delete account" onConfirm={() => { logout(); nav('/'); }} onClose={() => setDel(false)} />}
    </>
  );
}

const CATS = [['High severity interaction alerts', 'When a high severity interaction is found'], ['Review updates', 'When a pharmacist review is submitted'], ['Weekly summary', 'A digest of analyses and reviews'], ['Product news', 'New features and maintenance notices']];
function Notifs() {
  const toast = useToast();
  const [m, setM] = useState(CATS.map((_, i) => [true, i < 2, i === 0]));
  const set = (i, j, v) => setM(m.map((r, a) => (a === i ? r.map((x, b) => (b === j ? v : x)) : r)));
  return (
    <>
      <table className="notif-matrix"><thead><tr><th>Notify me about</th><th>Email</th><th>In-app</th><th>SMS</th></tr></thead>
        <tbody>{CATS.map(([t, d], i) => <tr key={t}><td><b>{t}</b><span>{d}</span></td>{[0, 1, 2].map((j) => <td key={j}><Toggle checked={m[i][j]} onChange={(v) => set(i, j, v)} label={`${t} via ${['email', 'in-app', 'SMS'][j]}`} /></td>)}</tr>)}</tbody></table>
      <div className="form-actions"><button className="btn btn-primary" onClick={() => toast.success('Notification preferences saved.')}>Save preferences</button></div>
    </>
  );
}

function Prefs() {
  const toast = useToast();
  const [f, setF] = useState({ lang: 'English', tz: 'Asia/Kolkata', date: 'DD MMM YYYY', density: 'Comfortable' });
  return (
    <>
      <div className="form-grid">
        <SelectField label="Language" value={f.lang} onChange={(e) => setF({ ...f, lang: e.target.value })} options={['English', 'हिन्दी (Hindi)', 'मराठी (Marathi)']} hint="Interface text is currently English only." />
        <SelectField label="Time zone" value={f.tz} onChange={(e) => setF({ ...f, tz: e.target.value })} options={['Asia/Kolkata', 'UTC', 'Asia/Dubai']} />
        <SelectField label="Date format" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} options={['DD MMM YYYY', 'MM/DD/YYYY', 'YYYY-MM-DD']} />
        <SelectField label="Table density" value={f.density} onChange={(e) => setF({ ...f, density: e.target.value })} options={['Comfortable', 'Compact']} />
      </div>
      <div className="form-actions"><button className="btn btn-primary" onClick={() => toast.success('Preferences saved.')}>Save preferences</button></div>
    </>
  );
}

export default function Settings() {
  const { user } = useAuth();
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') || 'personal';
  useEffect(() => { document.title = 'Profile & Settings — MediGuard AI'; }, []);
  const View = { personal: Personal, security: Security, privacy: Privacy, notifications: Notifs, preferences: Prefs }[tab] || Personal;
  return (
    <>
      <PageHead title="Profile & Settings" subtitle="Manage your account, security and preferences." />
      <section className="card">
        <div className="card-pad settings-head" style={{ paddingBottom: 0 }}>
          <Avatar name={user.name} size="xl" />
          <div><h2 style={{ fontSize: 19 }}>{user.name}</h2><div className="muted small mt-4">{user.roleLabel}{user.email ? ` · ${user.email}` : ''}</div></div>
        </div>
        <div style={{ padding: '18px 20px 0' }}><Tabs value={tab} onChange={(t) => setParams({ tab: t }, { replace: true })} tabs={TABS} label="Settings sections" /></div>
        <div style={{ padding: '24px 20px 26px' }}><View key={`${tab}-${user.role}`} /></div>
      </section>
    </>
  );
}
