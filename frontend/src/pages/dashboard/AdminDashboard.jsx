import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Users, Stethoscope, Pill, FlaskConical } from 'lucide-react';
import { StatCard, LoadingState } from '../../components/ui/Misc';
import Banner from '../../components/ui/Banner';
import { StatusBadge } from '../../components/ui/Badges';
import { PlatformChart, RoleDonut } from '../../components/charts/Charts';
import { useAudit, auditLabel, auditTime } from '../../lib/audit';
import { useSystemStatus } from '../../context/SystemStatusContext';
import { api } from '../../lib/api';
import { lastMonths, bucketByMonth } from '../../lib/stats';
import '../../styles/dashboard.css';

const ROLES = [['doctor', 'Doctors', '#0b5c6f'], ['pharmacist', 'Pharmacists', '#1fc7b1'], ['patient', 'Patients', '#5b8def'], ['administrator', 'Hospital Admins', '#f0a63a'], ['admin', 'Platform Admins', '#a15bd6']];

/** Platform-admin dashboard — every number below comes from the backend (Phase 12); nothing is static. */
export default function AdminDashboard() {
  const activity = useAudit('activity', 5);
  const { online, info } = useSystemStatus();
  const nav = useNavigate();
  const [data, setData] = useState({ state: 'loading' });
  useEffect(() => { document.title = 'Platform admin dashboard — MediGuard AI'; }, []);
  useEffect(() => {
    let live = true;
    // allSettled (not all): one slow/unreachable endpoint no longer blanks the whole
    // dashboard -- every panel renders from whatever did come back, and only a fully
    // failed load falls back to the error banner.
    Promise.allSettled([api.adminListUsers(), api.dashboardStats(), api.listAnalyses(), api.listAudit('activity', 500)])
      .then(([users, stats, analyses, logins]) => {
        if (!live) return;
        const failures = [users, stats, analyses, logins].filter((r) => r.status === 'rejected');
        if (failures.length === 4) {
          setData({ state: 'error', message: failures[0].reason?.message || 'Platform statistics could not be loaded.' });
          return;
        }
        setData({
          state: 'ok',
          users: users.status === 'fulfilled' && Array.isArray(users.value) ? users.value : [],
          stats: (stats.status === 'fulfilled' && stats.value) || {},
          analyses: analyses.status === 'fulfilled' ? analyses.value : [],
          logins: logins.status === 'fulfilled' ? logins.value : [],
          partial: failures.length > 0,
        });
      });
    return () => { live = false; };
  }, []);

  const ok = data.state === 'ok';
  const roleMix = useMemo(() => (ok ? ROLES.map(([role, name, color]) => ({ name, color, value: data.users.filter((u) => u.role === role).length })) : []), [ok, data]);
  const series = useMemo(() => {
    if (!ok) return [];
    const months = lastMonths(6);
    const a = bucketByMonth(data.analyses, months);
    const l = bucketByMonth(data.logins, months, (r) => r.action === 'auth.login');
    return months.map((x, i) => ({ m: x.m, analyses: a[i], logins: l[i], users: data.users.filter((u) => (u.created_at || 0) < x.end).length }));
  }, [ok, data]);
  const count = (role) => (ok ? data.users.filter((u) => u.role === role).length.toLocaleString('en-IN') : '—');

  const health = [
    { name: 'API server', detail: online === false ? 'Unreachable' : `FastAPI${info.version ? ` · v${info.version}` : ''}`, status: online === false ? 'Blocked' : 'Operational' },
    { name: 'Database', detail: info.database === 'in-memory' ? 'In-memory — not persistent' : info.database || 'Unknown', status: info.database === 'mongodb' ? 'Operational' : 'Degraded' },
    { name: 'Drug knowledge base', detail: info.ddi_dataset === 'full' ? 'CDSCO + DDI datasets indexed' : 'Full DDI dataset not loaded — built-in reference interactions in use', status: info.ddi_dataset === 'full' ? 'Operational' : 'Degraded' },
    { name: 'Prediction engine', detail: 'Module 4, part 2 — in development', status: 'Not deployed' },
  ];

  return (
    <>
      <Banner title="Platform admin dashboard" subtitle="Every hospital, every account — a system-wide view of MediGuard AI." />
      {data.state === 'error' && <div className="sys-banner danger" role="alert" style={{ borderRadius: 8, marginBottom: 16, border: '1px solid #f3b4bb' }}><span><b>Could not load platform statistics.</b> {data.message}</span></div>}
      {data.state === 'ok' && data.partial && <div className="sys-banner" role="status" style={{ borderRadius: 8, marginBottom: 16, border: '1px solid #f0d58a' }}><span><b>Some platform statistics could not be loaded.</b> Showing the data that did come back; try refreshing in a moment.</span></div>}
      <div className="grid cols-4">
        <StatCard icon={Users} label="Total Users" value={ok ? data.users.length.toLocaleString('en-IN') : '—'} />
        <StatCard icon={Stethoscope} tone="low" label="Doctors" value={count('doctor')} />
        <StatCard icon={Pill} tone="info" label="Pharmacists" value={count('pharmacist')} />
        <StatCard icon={FlaskConical} tone="moderate" label="Saved analyses" value={ok ? Number(data.stats.total_analyses || 0).toLocaleString('en-IN') : '—'} />
      </div>
      <div className="split-grid mt-16">
        <section className="card"><div className="card-head"><h2 className="card-title">Platform Activity</h2><span className="muted small">Last 6 months</span></div>
          <div className="card-body">{ok ? <PlatformChart data={series} height={310} /> : data.state === 'error' ? <p className="muted">Unavailable — could not reach the server.</p> : <LoadingState label="Loading platform activity" rows={3} />}
            <p className="tiny muted mt-8">Built from the latest 200 saved analyses and 500 audit events; sign-ins counted from the audit trail.</p></div></section>
        <section className="card"><div className="card-head"><h2 className="card-title">User Roles</h2></div>
          <div className="card-body">{ok ? <><RoleDonut data={roleMix} />
            <ul className="legend-list">{roleMix.map((r) => <li key={r.name}><i style={{ background: r.color }} />{r.name}<b className="mono">{r.value}</b></li>)}</ul></> : data.state === 'error' ? <p className="muted">Unavailable — could not reach the server.</p> : <LoadingState label="Loading user roles" rows={3} />}
          </div></section>
      </div>
      <div className="split-grid mt-16">
        <section className="card card-flush">
          <div className="card-head" style={{ paddingBottom: 12 }}><h2 className="card-title">Recent Activity</h2><button className="link-btn" onClick={() => nav('/app/admin/audit')}>View audit trail</button></div>
          <div className="table-wrap"><table className="table">
            <thead><tr><th>Time</th><th>User</th><th>Action</th><th>Resource</th></tr></thead>
            <tbody>{(activity.rows || []).slice(0, 5).map((a) => <tr key={a.id}><td className="muted">{auditTime(a)}</td><td>{a.actor.name}</td><td>{auditLabel(a.action)}</td><td className="muted">{a.resource_type} {a.resource_id}</td></tr>)}</tbody>
          </table></div>
        </section>
        <section className="card">
          <div className="card-head"><h2 className="card-title">System Health</h2></div>
          <div className="card-body"><ul className="health">{health.map((h) => <li key={h.name}><div className="grow"><b>{h.name}</b><span className="d">{h.detail}</span></div><StatusBadge status={h.status} /></li>)}</ul></div>
        </section>
      </div>
    </>
  );
}
