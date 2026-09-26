import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams, Navigate } from 'react-router-dom';
import { Search, UserPlus, Download, ShieldAlert, MoreVertical, Ban, RotateCcw, Building2, Trash2, Pencil, Users as UsersIcon } from 'lucide-react';
import { Avatar, EmptyState, PageHead, Popover } from '../../components/ui/Misc';
import { Modal, ConfirmDialog } from '../../components/ui/Modal';
import { StatusBadge, SeverityBadge } from '../../components/ui/Badges';
import { Tabs } from '../../components/ui/Tabs';
import { TextField, SelectField, PasswordField, Toggle } from '../../components/ui/Field';
import { useToast } from '../../context/ToastContext';
import { useAuth } from '../../context/AuthContext';
import { api } from '../../lib/api';
import { CONFIG_DEFAULTS, PERMISSIONS, ROLE_MATRIX } from '../../data/misc';
import { useAudit, auditLabel, auditSeverity, auditTime, auditDetail } from '../../lib/audit';
import { isEmail } from '../../lib/format';
import '../../styles/admin.css';

const ALL_TABS = [{ id: 'users', label: 'Users' }, { id: 'organizations', label: 'Hospitals' }, { id: 'roles', label: 'Roles & Permissions' }, { id: 'audit', label: 'Audit Trail' }, { id: 'security', label: 'Security Events' }, { id: 'config', label: 'Configuration' }];
// A hospital administrator manages operations inside their own hospital
// only — no cross-hospital "Hospitals" list and no platform-wide "Roles &
// Permissions" policy editor. Their "Hospitals" tab becomes a single-row
// "My Hospital" view (see Organizations() below).
const HOSPITAL_TABS = ALL_TABS.filter((t) => t.id !== 'roles').map((t) => (t.id === 'organizations' ? { ...t, label: 'My Hospital' } : t));

const ALL_ROLE_OPTIONS = [
  { value: 'doctor', label: 'Doctor' },
  { value: 'pharmacist', label: 'Pharmacist' },
  { value: 'patient', label: 'Patient' },
  { value: 'administrator', label: 'Hospital Administrator' },
  { value: 'admin', label: 'Platform Admin' },
];
const HOSPITAL_ROLE_OPTIONS = ALL_ROLE_OPTIONS.filter((r) => ['doctor', 'pharmacist', 'patient'].includes(r.value));

function genPassword() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#$%';
  let out = '';
  for (let i = 0; i < 12; i += 1) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}

const EMPTY_USER_FORM = { name: '', email: '', password: '', role: 'doctor', org_id: '', phone: '', specialization: '', age: '', gender: '' };

/** Admin-managed accounts: create/suspend/reactivate/delete doctor,
 * pharmacist, patient, hospital administrator and platform admin accounts,
 * and bundle each into a hospital organization. A hospital administrator
 * only ever sees/creates doctor, pharmacist and patient accounts scoped to
 * their own hospital — enforced both here and in /api/admin/users
 * (see app/main.py). */
function Users() {
  const toast = useToast();
  const nav = useNavigate();
  const { user } = useAuth();
  const isPlatform = user.role === 'admin';
  const ROLE_OPTIONS = isPlatform ? ALL_ROLE_OPTIONS : HOSPITAL_ROLE_OPTIONS;
  const [users, setUsers] = useState([]);
  const [orgs, setOrgs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState(''); const [role, setRole] = useState('All');
  const [create, setCreate] = useState(false);
  const [saving, setSaving] = useState(false);
  const [toDelete, setToDelete] = useState(null);
  const [toSuspend, setToSuspend] = useState(null);
  const [f, setF] = useState(EMPTY_USER_FORM); const [err, setErr] = useState({});
  const [patientQ, setPatientQ] = useState('');
  const [patientResults, setPatientResults] = useState(null);
  const [patientSearching, setPatientSearching] = useState(false);
  const [linkedPatient, setLinkedPatient] = useState(null);

  const load = async () => {
    setLoading(true);
    try {
      const [u, o] = await Promise.all([api.adminListUsers(), api.listOrganizations()]);
      setUsers(u); setOrgs(o);
    } catch (e) { toast.error(e.message || 'Could not load users.'); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  const orgName = (id) => orgs.find((o) => o.id === id)?.name;
  const rows = users.filter((u) => (role === 'All' || u.role === role) && `${u.name} ${u.email}`.toLowerCase().includes(q.toLowerCase()));

  const openCreate = () => { setF({ ...EMPTY_USER_FORM, password: genPassword() }); setErr({}); setCreate(true); setLinkedPatient(null); setPatientQ(''); setPatientResults(null); };

  const searchPatientToLink = async () => {
    const term = patientQ.trim();
    if (!term) { setPatientResults([]); return; }
    setPatientSearching(true);
    try { setPatientResults(await api.searchPatients(term, isPlatform ? f.org_id : undefined)); }
    catch (ex) { toast.error(ex.message || 'Patient search failed.'); setPatientResults([]); }
    finally { setPatientSearching(false); }
  };

  const submit = async () => {
    const e = {};
    if (f.name.trim().length < 2) e.name = 'Enter a name';
    if (!isEmail(f.email)) e.email = 'Enter a valid email';
    if (f.password.length < 8) e.password = 'At least 8 characters';
    if (users.some((u) => u.email.toLowerCase() === f.email.toLowerCase())) e.email = 'This email already has an account';
    setErr(e); if (Object.keys(e).length) return;
    setSaving(true);
    try {
      const payload = { name: f.name.trim(), email: f.email, password: f.password, role: f.role, phone: f.phone, specialization: f.specialization };
      if (f.org_id) payload.org_id = f.org_id;
      if (f.role === 'patient') {
        if (linkedPatient) payload.patient_id = linkedPatient.id;
        if (f.age) payload.age = Number(f.age);
        if (f.gender) payload.gender = f.gender;
      }
      const created = await api.adminCreateUser(payload);
      setUsers([created, ...users]);
      toast.success(`${created.name}'s account was created. Share the password with them so they can sign in.`);
      setCreate(false);
    } catch (ex) { toast.error(ex.message || 'Could not create the account.'); }
    finally { setSaving(false); }
  };

  const setStatus = async (u, status) => {
    try {
      const updated = await api.adminSetUserStatus(u.id, status);
      setUsers(users.map((x) => (x.id === u.id ? updated : x)));
      toast.success(status === 'suspended' ? `${u.name}'s account was suspended.` : `${u.name}'s account was reactivated.`);
    } catch (ex) { toast.error(ex.message || 'Could not update the account.'); }
  };

  const remove = async () => {
    if (!toDelete) return;
    try {
      await api.adminDeleteUser(toDelete.id);
      setUsers(users.filter((x) => x.id !== toDelete.id));
      toast.success(`${toDelete.name}'s account was deleted.`);
    } catch (ex) { toast.error(ex.message || 'Could not delete the account.'); }
    finally { setToDelete(null); }
  };

  return (
    <section className="card card-flush">
      <div className="filters">
        <div className="input-icon"><Search size={16} /><input className="input" placeholder="Search users…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search users" /></div>
        <select className="select" value={role} onChange={(e) => setRole(e.target.value)} aria-label="Role">
          <option value="All">All roles</option>
          {ROLE_OPTIONS.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
        </select>
        <button className="btn btn-primary btn-sm" onClick={openCreate}><UserPlus size={14} />Create account</button>
      </div>
      {loading ? <div className="card-body muted small">Loading users…</div> : rows.length === 0 ? (
        <EmptyState title="No users found">Try a different search or role, or create the first account.</EmptyState>
      ) : (
        <div className="table-wrap"><table className="table"><thead><tr><th>User</th><th>Role</th><th>Hospital</th><th>Status</th><th /></tr></thead>
          <tbody>{rows.map((u) => (
            <tr key={u.id}><td><div className="row" style={{ gap: 10 }}><Avatar name={u.name} size="sm" /><div><b>{u.name}</b><div className="tiny muted">{u.email}</div></div></div></td>
              <td>{u.roleLabel || u.role}</td><td className="muted">{orgName(u.org_id) || u.org || '—'}</td>
              <td><StatusBadge status={u.status === 'suspended' ? 'Suspended' : 'Active'} /></td>
              <td className="right"><Popover trigger={({ toggle }) => <button className="icon-btn plain" aria-label={`Actions for ${u.name}`} onClick={toggle}><MoreVertical size={16} /></button>}>
                {u.role === 'patient' && u.patientId && !isPlatform && <button onClick={() => nav(`/app/patients/${u.patientId}`)}><UsersIcon size={15} />View patient record</button>}
                {u.status === 'suspended'
                  ? <button onClick={() => setStatus(u, 'active')}><RotateCcw size={15} />Reactivate</button>
                  : <button className="danger" onClick={() => setToSuspend(u)}><Ban size={15} />Suspend</button>}
                <button className="danger" onClick={() => setToDelete(u)}><Trash2 size={15} />Delete account</button>
              </Popover></td></tr>))}</tbody></table></div>
      )}
      {create && (
        <Modal title="Create account" subtitle={isPlatform ? 'Set up sign-in for a doctor, pharmacist, patient, hospital administrator or platform admin.' : 'Set up sign-in for a doctor, pharmacist or patient at your hospital.'} size="sm" onClose={() => setCreate(false)}
          footer={<><button className="btn btn-outline" onClick={() => setCreate(false)}>Cancel</button><button className="btn btn-primary" onClick={submit} disabled={saving}>{saving ? 'Creating…' : 'Create account'}</button></>}>
          <div className="grid" style={{ gap: 14 }}>
            <TextField label="Full name" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} error={err.name} />
            <TextField label="Email (used to sign in)" type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} error={err.email} />
            <PasswordField label="Temporary password" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} error={err.password} hint="Share this with the user — they can change it after signing in." />
            <SelectField label="Role" value={f.role} onChange={(e) => setF({ ...f, role: e.target.value })} options={ROLE_OPTIONS} />
            {isPlatform && <SelectField label="Hospital organization" value={f.org_id} onChange={(e) => setF({ ...f, org_id: e.target.value })} placeholder="No organization" options={orgs.map((o) => ({ value: o.id, label: o.name }))} />}
            <TextField label="Phone" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} />
            {f.role !== 'patient' && <TextField label="Specialization" value={f.specialization} onChange={(e) => setF({ ...f, specialization: e.target.value })} />}
            {f.role === 'patient' && (
              <div className="grid" style={{ gap: 8 }}>
                <label>Link to existing patient (optional)</label>
                {linkedPatient ? (
                  <div className="row between card card-pad" style={{ padding: 8 }}>
                    <span><b>{linkedPatient.name}</b> <span className="tiny muted mono">{linkedPatient.id}</span></span>
                    <button className="btn btn-ghost btn-sm" onClick={() => setLinkedPatient(null)}>Change</button>
                  </div>
                ) : (
                  <>
                    <div className="row gap-6">
                      <input className="input input-sm" placeholder="Search by name, phone, email or ID…" value={patientQ}
                             onChange={(e) => setPatientQ(e.target.value)}
                             disabled={isPlatform && !f.org_id}
                             onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); searchPatientToLink(); } }} />
                      <button type="button" className="btn btn-outline btn-sm" disabled={patientSearching || (isPlatform && !f.org_id)} onClick={searchPatientToLink}>{patientSearching ? 'Searching…' : 'Search'}</button>
                    </div>
                    {isPlatform && !f.org_id && <span className="tiny muted">Choose a hospital organization above first.</span>}
                    {patientResults && (
                      patientResults.length === 0 ? (
                        <span className="tiny muted">No matching patient record — a new one will be created for this account.</span>
                      ) : (
                        <div className="grid" style={{ gap: 4, maxHeight: 140, overflowY: 'auto' }}>
                          {patientResults.map((p) => (
                            <button type="button" key={p.id} className="row between card card-pad" disabled={p.has_login}
                                    style={{ padding: 8, textAlign: 'left', cursor: p.has_login ? 'not-allowed' : 'pointer', opacity: p.has_login ? 0.6 : 1 }}
                                    onClick={() => { if (!p.has_login) { setLinkedPatient(p); setPatientResults(null); setPatientQ(''); } }}>
                              <span><b>{p.name}</b> <span className="tiny muted">{p.phone || p.email || ''}</span></span>
                              {p.has_login ? <StatusBadge status="Portal Access" /> : null}
                            </button>
                          ))}
                        </div>
                      )
                    )}
                    <span className="tiny muted">Leave unlinked to auto-match an existing record by phone/email, or create one.</span>
                  </>
                )}
                <div className="row gap-8">
                  <TextField label="Age" type="number" min="0" max="120" value={f.age} onChange={(e) => setF({ ...f, age: e.target.value })} />
                  <SelectField label="Gender" value={f.gender} onChange={(e) => setF({ ...f, gender: e.target.value })} placeholder="Not set" options={['Male', 'Female', 'Other']} />
                </div>
              </div>
            )}
          </div>
        </Modal>
      )}
      {toSuspend && <ConfirmDialog danger title="Suspend account" confirmLabel="Suspend account" message={`${toSuspend.name} will be signed out and unable to sign in until an administrator reactivates the account. Their records are kept.`} onConfirm={() => setStatus(toSuspend, 'suspended')} onClose={() => setToSuspend(null)} />}
      {toDelete && <ConfirmDialog title="Delete account" danger confirmLabel="Delete account" message={`This permanently deletes ${toDelete.name}'s sign-in account. This can't be undone.`} onConfirm={remove} onClose={() => setToDelete(null)} />}
    </section>
  );
}

const EMPTY_ORG_FORM = { name: '', type: 'Hospital', address: '', phone: '', email: '' };

/** Hospital organizations — the "bundle" that doctor, pharmacist and
 * patient accounts belong to. Backed by /api/organizations. */
function Organizations() {
  const toast = useToast();
  const { user } = useAuth();
  const isPlatform = user.role === 'admin';
  const [orgs, setOrgs] = useState([]);
  const [counts, setCounts] = useState({});
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [editing, setEditing] = useState(null); // null = closed, {} = create, org = edit
  const [saving, setSaving] = useState(false);
  const [toDelete, setToDelete] = useState(null);
  const [f, setF] = useState(EMPTY_ORG_FORM); const [err, setErr] = useState({});

  const load = async () => {
    setLoading(true);
    try {
      const list = await api.listOrganizations();
      setOrgs(list);
      const pairs = await Promise.all(list.map(async (o) => [o.id, (await api.listOrganizationUsers(o.id)).length]));
      setCounts(Object.fromEntries(pairs));
    } catch (e) { toast.error(e.message || 'Could not load hospitals.'); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  const rows = orgs.filter((o) => `${o.name} ${o.address}`.toLowerCase().includes(q.toLowerCase()));

  const openCreate = () => { setF(EMPTY_ORG_FORM); setErr({}); setEditing({}); };
  const openEdit = (o) => { setF({ name: o.name, type: o.type, address: o.address || '', phone: o.phone || '', email: o.email || '' }); setErr({}); setEditing(o); };

  const submit = async () => {
    const e = {}; if (f.name.trim().length < 2) e.name = 'Enter a hospital name';
    setErr(e); if (Object.keys(e).length) return;
    setSaving(true);
    try {
      if (editing?.id) {
        const updated = await api.updateOrganization(editing.id, f);
        setOrgs(orgs.map((o) => (o.id === editing.id ? updated : o)));
        toast.success(`${updated.name} was updated.`);
      } else {
        const created = await api.createOrganization(f);
        setOrgs([created, ...orgs]);
        setCounts({ ...counts, [created.id]: 0 });
        toast.success(`${created.name} was added. You can now create staff and patient accounts under it.`);
      }
      setEditing(null);
    } catch (ex) { toast.error(ex.message || 'Could not save the hospital.'); }
    finally { setSaving(false); }
  };

  const remove = async () => {
    if (!toDelete) return;
    try {
      await api.deleteOrganization(toDelete.id);
      setOrgs(orgs.filter((o) => o.id !== toDelete.id));
      toast.success(`${toDelete.name} was removed.`);
    } catch (ex) { toast.error(ex.message || 'Could not remove this hospital.'); }
    finally { setToDelete(null); }
  };

  return (
    <section className="card card-flush">
      <div className="filters">
        <div className="input-icon"><Search size={16} /><input className="input" placeholder="Search hospitals…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search hospitals" /></div>
        {isPlatform && <button className="btn btn-primary btn-sm" onClick={openCreate}><Building2 size={14} />Add hospital</button>}
      </div>
      {loading ? <div className="card-body muted small">Loading hospitals…</div> : rows.length === 0 ? (
        <EmptyState icon={Building2} art={false} title="No hospitals yet">Add a hospital organization, then create doctor, pharmacist and patient accounts under it.</EmptyState>
      ) : (
        <div className="table-wrap"><table className="table"><thead><tr><th>Hospital</th><th>Type</th><th>Contact</th><th>Staff & patients</th><th>Status</th><th /></tr></thead>
          <tbody>{rows.map((o) => (
            <tr key={o.id}>
              <td><b>{o.name}</b><div className="tiny muted">{o.address || '—'}</div></td>
              <td className="muted">{o.type}</td>
              <td className="muted">{o.phone || o.email || '—'}</td>
              <td><span className="row gap-4"><UsersIcon size={14} />{counts[o.id] ?? '—'}</span></td>
              <td><StatusBadge status={o.status || 'Active'} /></td>
              <td className="right">{isPlatform ? (
                <Popover trigger={({ toggle }) => <button className="icon-btn plain" aria-label={`Actions for ${o.name}`} onClick={toggle}><MoreVertical size={16} /></button>}>
                  <button onClick={() => openEdit(o)}><Pencil size={15} />Edit details</button>
                  <button className="danger" onClick={() => setToDelete(o)}><Trash2 size={15} />Delete hospital</button>
                </Popover>
              ) : (
                <button className="btn btn-outline btn-sm" onClick={() => openEdit(o)}><Pencil size={14} />Edit details</button>
              )}</td>
            </tr>))}</tbody></table></div>
      )}
      {editing && (
        <Modal title={editing.id ? 'Edit hospital' : 'Add hospital'} subtitle="Doctors, pharmacists and patients can be bundled under this organization." size="sm" onClose={() => setEditing(null)}
          footer={<><button className="btn btn-outline" onClick={() => setEditing(null)}>Cancel</button><button className="btn btn-primary" onClick={submit} disabled={saving}>{saving ? 'Saving…' : editing.id ? 'Save changes' : 'Add hospital'}</button></>}>
          <div className="grid" style={{ gap: 14 }}>
            <TextField label="Hospital / organization name" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} error={err.name} />
            <SelectField label="Type" value={f.type} onChange={(e) => setF({ ...f, type: e.target.value })} options={['Hospital', 'Clinic', 'Pharmacy Network', 'Diagnostic Center', 'Other']} />
            <TextField label="Address" value={f.address} onChange={(e) => setF({ ...f, address: e.target.value })} />
            <div className="row gap-8">
              <TextField label="Phone" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} />
              <TextField label="Contact email" type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} />
            </div>
          </div>
        </Modal>
      )}
      {toDelete && <ConfirmDialog title="Delete hospital" danger confirmLabel="Delete hospital" message={`This removes ${toDelete.name}. You can only delete a hospital that has no staff or patients assigned to it.`} onConfirm={remove} onClose={() => setToDelete(null)} />}
    </section>
  );
}

function Roles() {
  const toast = useToast();
  const [m, setM] = useState(() => JSON.parse(JSON.stringify(ROLE_MATRIX)));
  const [dirty, setDirty] = useState(false);
  const toggle = (role, i, v) => { setM({ ...m, [role]: m[role].map((x, j) => (j === i ? (v ? 1 : 0) : x)) }); setDirty(true); };
  return (
    <section className="card card-flush">
      <div className="card-head" style={{ paddingBottom: 12 }}><div><h2 className="card-title">Role permissions</h2><p className="section-note">Choose what each role can do. Changes apply at next sign-in.</p></div></div>
      <div className="table-wrap"><table className="table perm-table"><thead><tr><th>Permission</th>{Object.keys(m).map((r) => <th key={r}>{r}</th>)}</tr></thead>
        <tbody>{PERMISSIONS.map((p, i) => <tr key={p}><td>{p}</td>{Object.keys(m).map((r) => <td key={r}><Toggle checked={!!m[r][i]} onChange={(v) => toggle(r, i, v)} label={`${r}: ${p}`} /></td>)}</tr>)}</tbody></table></div>
      {dirty && <div className="savebar" style={{ margin: 16 }}><span>You have unsaved permission changes.</span><div className="row gap-8"><button className="btn btn-sm btn-on-dark" onClick={() => { setM(JSON.parse(JSON.stringify(ROLE_MATRIX))); setDirty(false); }}>Discard</button><button className="btn btn-sm btn-accent" onClick={() => { setDirty(false); toast.success('Permissions saved.'); }}>Save changes</button></div></div>}
    </section>
  );
}

function AuditTable({ rows, error, reload, security }) {
  const toast = useToast();
  const [q, setQ] = useState('');
  if (rows === null) return <section className="card card-pad"><div className="spinner" style={{ margin: '24px auto' }} /></section>;
  const shown = rows.filter((a) => `${a.actor.name} ${auditLabel(a.action)} ${a.resource_type} ${a.resource_id}`.toLowerCase().includes(q.toLowerCase()));
  const exportCsv = () => {
    const csv = ['Time,User,Role,Action,Resource,Details', ...shown.map((r) => [auditTime(r), r.actor.name, r.actor.role, r.action, `${r.resource_type} ${r.resource_id}`, auditDetail(r)].map((c) => `"${String(c).replace(/"/g, '""')}"`).join(','))].join('\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' })); const a = document.createElement('a'); a.href = url; a.download = security ? 'security-events.csv' : 'audit-trail.csv'; a.click(); URL.revokeObjectURL(url); toast.success('Exported.');
  };
  return (
    <section className="card card-flush">
      <div className="filters">
        <div className="input-icon"><Search size={16} /><input className="input" placeholder="Search by user, action or resource…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search" /></div>
        <button className="btn btn-outline btn-sm" onClick={reload}>Refresh</button>
        <button className="btn btn-outline btn-sm" onClick={exportCsv} disabled={!shown.length}><Download size={14} />Export CSV</button>
      </div>
      {error ? <EmptyState title="Couldn’t load events" action={<button className="btn btn-outline btn-sm" onClick={reload}>Retry</button>}>{error}</EmptyState>
        : shown.length === 0 ? <EmptyState title={security ? 'No security events' : 'No events yet'}>{rows.length ? 'Adjust the search.' : 'Actions taken in this hospital are recorded here.'}</EmptyState> : security ? (
          shown.map((e) => (
            <div className="sec-event" key={e.id}>
              <ShieldAlert size={20} color={auditSeverity(e) === 'High' ? 'var(--high)' : auditSeverity(e) === 'Moderate' ? 'var(--mod)' : 'var(--muted)'} style={{ marginTop: 2 }} />
              <div className="grow" style={{ minWidth: 220 }}><div className="row gap-8 wrap"><b>{auditLabel(e.action)}</b><SeverityBadge level={auditSeverity(e)} /></div><div className="small muted mt-4">{e.actor.name} · {e.resource_type} {e.resource_id}{auditDetail(e) ? ` · ${auditDetail(e)}` : ''}</div><div className="tiny muted mt-4">{auditTime(e)}</div></div>
            </div>
          ))
        ) : (
          <div className="table-wrap"><table className="table"><thead><tr><th>Time</th><th>User</th><th>Action</th><th>Resource</th><th>Details</th></tr></thead>
            <tbody>{shown.map((a) => <tr key={a.id}><td className="muted" style={{ whiteSpace: 'nowrap' }}>{auditTime(a)}</td><td>{a.actor.name}<div className="tiny muted">{a.actor.role}</div></td><td>{auditLabel(a.action)}</td><td className="muted">{a.resource_type} {a.resource_id}</td><td className="muted small">{auditDetail(a) || '—'}</td></tr>)}</tbody></table></div>
        )}
    </section>
  );
}

function Audit() { const a = useAudit('activity', 200); return <AuditTable {...a} />; }
function Events() { const a = useAudit('security', 200); return <AuditTable {...a} security />; }

const Row = ({ title, desc, children }) => <div className="setting-row"><div><b>{title}</b><span className="d">{desc}</span></div>{children}</div>;

function Config() {
  const toast = useToast();
  const [c, setC] = useState(CONFIG_DEFAULTS);
  const [saved, setSaved] = useState(CONFIG_DEFAULTS);
  const dirty = JSON.stringify(c) !== JSON.stringify(saved);
  const set = (k) => (v) => setC({ ...c, [k]: v });
  const Sel = (k, opts) => <select className="select" value={c[k]} onChange={(e) => set(k)(e.target.value)} aria-label={k}>{opts.map((o) => <option key={o[0]} value={o[0]}>{o[1]}</option>)}</select>;
  return (
    <>
      <div className="sys-banner warn" role="status" style={{ borderRadius: 8, marginBottom: 16, border: '1px solid #f0d78a' }}><span><b>Read-only preview.</b> These platform settings are not stored or enforced by the server yet, so they cannot be changed here.</span></div>
      <fieldset disabled style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}>
      <div className="grid" style={{ gap: 16 }}>
        <section className="card card-pad"><h2 className="card-title">Security</h2>
          <Row title="Require multi-factor authentication" desc="All roles must verify with a second factor at sign-in."><Toggle checked={c.mfa} onChange={set('mfa')} label="Require MFA" /></Row>
          <Row title="Session timeout" desc="Sign users out after inactivity.">{Sel('sessionMinutes', [['15', '15 minutes'], ['30', '30 minutes'], ['60', '1 hour']])}</Row>
          <Row title="Minimum password length" desc="Applies to new and changed passwords.">{Sel('passwordMinLength', [['8', '8 characters'], ['10', '10 characters'], ['12', '12 characters']])}</Row>
          <Row title="Restrict sign-in to allowed IP ranges" desc="Only hospital networks can reach the platform."><Toggle checked={c.ipAllowlist} onChange={set('ipAllowlist')} label="IP allow-list" /></Row>
        </section>
        <section className="card card-pad"><h2 className="card-title">Clinical rules</h2>
          <Row title="Alert threshold" desc="Lowest severity that raises an alert to the clinician.">{Sel('severityThreshold', [['Low', 'Low and above'], ['Moderate', 'Moderate and above'], ['High', 'High only']])}</Row>
          <Row title="Require pharmacist review for high severity" desc="High severity results are added to the review queue automatically."><Toggle checked={c.requireReviewForHigh} onChange={set('requireReviewForHigh')} label="Require pharmacist review" /></Row>
          <Row title="Show model confidence" desc="Display confidence percentages next to interaction results."><Toggle checked={c.showConfidence} onChange={set('showConfidence')} label="Show confidence" /></Row>
        </section>
        <section className="card card-pad"><h2 className="card-title">Data & audit</h2>
          <Row title="Record retention" desc="How long clinical records are kept.">{Sel('retentionDays', [['180', '180 days'], ['365', '1 year'], ['1095', '3 years']])}</Row>
          <Row title="Log report exports" desc="Write every PDF export and print to the audit trail."><Toggle checked={c.auditExports} onChange={set('auditExports')} label="Log exports" /></Row>
        </section>
      </div>
      </fieldset>
    </>
  );
}

const VIEWS = { users: Users, organizations: Organizations, roles: Roles, audit: Audit, security: Events, config: Config };
const TITLES = {
  users: ['Users', 'Create and manage doctor, pharmacist, patient, hospital administrator and platform admin accounts.'],
  organizations: ['Hospitals', 'Bundle staff and patients into hospital organizations.'],
  roles: ['Roles & Permissions', 'Control what each role can access.'],
  audit: ['Audit Trail', 'Every sign-in, view, edit and export.'],
  security: ['Security Events', 'Anomalies that need a decision.'],
  config: ['Configuration', 'Platform security and clinical rules.'],
};
const HOSPITAL_TITLES = {
  ...TITLES,
  users: ['Staff & Patients', 'Create and manage doctor, pharmacist and patient accounts for your hospital.'],
  organizations: ['My Hospital', 'View and update your hospital\u2019s own details.'],
  audit: ['Audit Trail', 'Every sign-in, view, edit and export at your hospital.'],
  security: ['Security Events', 'Anomalies at your hospital that need a decision.'],
  config: ['Configuration', 'Security and clinical rules for your hospital.'],
};

export default function AdminSecurity() {
  const { tab } = useParams();
  const nav = useNavigate();
  const { user } = useAuth();
  const isPlatform = user.role === 'admin';
  const TABS = isPlatform ? ALL_TABS : HOSPITAL_TABS;
  const TITLE_MAP = isPlatform ? TITLES : HOSPITAL_TITLES;
  useEffect(() => { document.title = `${isPlatform ? 'Administration' : 'Hospital administration'} — MediGuard AI`; }, [isPlatform]);
  if (!VIEWS[tab] || !TABS.some((t) => t.id === tab)) return <Navigate to="/app/admin/users" replace />;
  const View = VIEWS[tab];
  return (
    <>
      <PageHead title={isPlatform ? 'Administration & Security' : 'Hospital Administration'} subtitle={TITLE_MAP[tab][1]} />
      <div className="mb-16"><Tabs value={tab} onChange={(t) => nav(`/app/admin/${t}`)} tabs={TABS} label="Administration sections" /></div>
      <View />
    </>
  );
}
