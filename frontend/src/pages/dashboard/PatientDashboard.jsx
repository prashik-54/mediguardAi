import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Pill, Stethoscope, FileText, Bell, RefreshCw } from 'lucide-react';
import { StatCard, IconTile, EmptyState, rowProps } from '../../components/ui/Misc';
import Banner from '../../components/ui/Banner';
import { Tabs } from '../../components/ui/Tabs';
import { StatusBadge } from '../../components/ui/Badges';
import { NamedIcon } from '../../components/ui/Icons';
import { useAuth } from '../../context/AuthContext';
import { useNotifications } from '../../context/NotificationsContext';
import { api } from '../../lib/api';
import { fmtDate } from '../../lib/format';
import { greeting } from './DoctorDashboard';
import { notifRoute } from '../../lib/audit';
import '../../styles/dashboard.css';

const TONES = { high: ['var(--high-bg)', 'var(--high)'], low: ['var(--low-bg)', 'var(--low)'], info: ['var(--info-bg)', 'var(--info)'], moderate: ['var(--mod-bg)', 'var(--mod)'] };
const ts = (t) => (t ? fmtDate(new Date(t * 1000)) : '—');
const dose = (m) => [m.dose && `${m.dose}${m.unit ? ` ${m.unit}` : ''}`, m.frequency, m.timing].filter(Boolean).join(' · ');
const TABS = { overview: 'Overview', appointments: 'Appointments', medications: 'Medications', reports: 'Reports', notifications: 'Notifications' };

/** Patient portal (Phase 10). Every call is self-scoped on the server (/api/portal/*,
 *  /api/reports, /api/notifications); nothing here is demo data and no DDI data exists in these APIs. */
export default function PatientDashboard({ initialTab = 'overview' }) {
  const { user } = useAuth();
  const nav = useNavigate();
  const { items, markRead } = useNotifications();
  const [tab, setTab] = useState(initialTab);
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => { document.title = 'My health — MediGuard AI'; }, []);
  useEffect(() => setTab(initialTab), [initialTab]);

  const load = useCallback(async () => {
    setError('');
    try {
      const [me, appointments, medications, reports] = await Promise.all([api.portalMe(), api.portalAppointments(), api.portalMedications(), api.listReports()]);
      setData({ me, appointments, medications, reports });
    } catch (e) { setData(null); setError(e.message || 'Could not load your records.'); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const first = user.name.split(' ')[0];
  if (error) return <EmptyState icon={FileText} title="We couldn’t load your records" action={<button className="btn btn-outline" onClick={load}><RefreshCw size={14} />Retry</button>}>{error}</EmptyState>;
  if (!data) return <div className="card card-pad"><div className="spinner" style={{ margin: '24px auto' }} /><p className="muted small" style={{ textAlign: 'center' }}>Loading your records…</p></div>;

  const { me, appointments, medications, reports } = data;
  const upcoming = [...appointments].reverse().find((a) => ['Scheduled', 'Checked In', 'In Consultation'].includes(a.status));
  const medCount = medications.reduce((n, p) => n + p.medicines.length, 0);
  const unread = items.filter((n) => n.unread).length;

  return (
    <>
      <Banner title={`${greeting()}, ${first}!`} subtitle={`Your records at ${me.hospital?.name || 'your hospital'}.`}>
        <button className="btn btn-accent" onClick={() => nav('/app/settings')}>View profile</button>
      </Banner>
      <div className="grid cols-3">
        <StatCard icon={Stethoscope} tone="info" label="Next Appointment" value={upcoming ? upcoming.appointment_date : '—'} note={upcoming ? `${upcoming.doctor.name || 'Doctor'}${upcoming.appointment_time ? ` · ${upcoming.appointment_time}` : ''}` : 'None scheduled'} onClick={() => setTab('appointments')} />
        <StatCard icon={Pill} label="My Medicines" value={medCount} note={<button className="link-btn" onClick={() => setTab('medications')}>View medications</button>} />
        <StatCard icon={FileText} tone="info" label="Reports" value={reports.length} note={<button className="link-btn" onClick={() => nav('/app/reports')}>Open reports</button>} />
      </div>

      <div className="card mt-16 card-pad" style={{ paddingBottom: 0 }}>
        <Tabs value={tab} onChange={setTab} tabs={Object.entries(TABS).map(([id, label]) => ({ id, label: id === 'notifications' && unread ? `${label} (${unread})` : label }))} />
      </div>

      {tab === 'overview' && (
        <div className="grid mt-16" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(min(320px, 100%), 1fr))' }}>
          <section className="card">
            <div className="card-head"><h2 className="card-title">Recent Reports</h2><button className="link-btn" onClick={() => setTab('reports')}>View all</button></div>
            <div className="card-body">
              {reports.length ? reports.slice(0, 3).map((r) => <div className="doc-row" key={r.id}><IconTile icon={FileText} tone="info" size={36} /><div className="grow"><b>{r.report_number}</b><span>{ts(r.generated_at)} · {r.doctor.name}</span></div><button className="link-btn" onClick={() => nav('/app/reports')}>View Report</button></div>) : <p className="muted small">Your reports will appear here once your hospital releases them.</p>}
            </div>
          </section>
          <section className="card">
            <div className="card-head"><h2 className="card-title">Latest Prescription</h2><button className="link-btn" onClick={() => setTab('medications')}>View all</button></div>
            <div className="card-body">
              {medications[0] ? <>
                {medications[0].medicines.map((m, i) => <div className="med-row" key={i}><IconTile icon={Pill} size={34} /><div className="grow"><b>{m.name}</b><div className="small muted">{dose(m)}</div></div></div>)}
                <p className="small muted mt-8">{medications[0].pharmacy_status}</p>
              </> : <p className="muted small">No prescriptions to show yet.</p>}
            </div>
          </section>
        </div>
      )}

      {tab === 'appointments' && (
        <section className="card card-pad mt-16">
          <h2 className="card-title mb-8">Your appointments</h2>
          {appointments.length ? appointments.map((a) => (
            <div className="doc-row" key={a.id}>
              <IconTile icon={Stethoscope} tone="info" size={36} />
              <div className="grow"><b>{a.doctor.name || 'Doctor'}{a.doctor.specialization ? ` · ${a.doctor.specialization}` : ''}</b><span>{a.appointment_date}{a.appointment_time ? ` at ${a.appointment_time}` : ''}{a.queue_number ? ` · Queue #${a.queue_number}` : ''}{a.reason ? ` · ${a.reason}` : ''}</span></div>
              <StatusBadge status={a.status} />
            </div>
          )) : <p className="muted small">You have no appointments yet.</p>}
        </section>
      )}

      {tab === 'medications' && (
        <section className="card card-pad mt-16">
          <h2 className="card-title mb-8">Your medications</h2>
          {medications.length ? medications.map((p) => (
            <div key={p.report_id} className="mb-16">
              <div className="row gap-8 small muted mb-8"><b>{p.report_number}</b><span>Prescribed {ts(p.prescribed_at)} by {p.doctor.name}</span><span className="badge badge-neutral no-dot">{p.pharmacy_status}</span></div>
              {p.medicines.map((m, i) => (
                <div className="med-row" key={i}>
                  <IconTile icon={Pill} size={38} />
                  <div className="grow"><b>{m.name}</b><div className="small muted">{dose(m)}{m.duration ? ` · for ${m.duration}` : ''}{m.instructions ? ` · ${m.instructions}` : ''}</div></div>
                  {m.dispense_status && <StatusBadge status={m.dispense_status} />}
                </div>
              ))}
              {p.instructions && <p className="small mt-8"><b>Doctor’s instructions:</b> {p.instructions}</p>}
            </div>
          )) : <p className="muted small">Medicines from your prescriptions appear here once your hospital releases your report.</p>}
          <div className="callout callout-info mt-16"><span>Never stop or change a medicine on your own. If something feels wrong, talk to your doctor or pharmacist.</span></div>
        </section>
      )}

      {tab === 'reports' && (
        <section className="card card-pad mt-16">
          <h2 className="card-title mb-8">Your reports</h2>
          {reports.length ? reports.map((r) => <div className="doc-row" key={r.id}><IconTile icon={FileText} tone="info" size={36} /><div className="grow"><b>{r.report_number}</b><span>{ts(r.generated_at)} · {r.doctor.name} · {r.medicine_count} medicine{r.medicine_count === 1 ? '' : 's'}</span></div><button className="btn btn-outline btn-sm" onClick={() => nav('/app/reports')}>Open</button></div>) : <p className="muted small">No reports have been released to you yet.</p>}
        </section>
      )}

      {tab === 'notifications' && (
        <section className="card card-flush mt-16">
          {items.length ? items.map((n) => (
            <div key={n.id} className={`notif ${n.unread ? 'unread' : ''}`} role="button" {...rowProps(() => { markRead(n.id); const to = notifRoute(n, 'patient'); if (to) nav(to); })}>
              <span style={{ width: 34, height: 34, borderRadius: '50%', background: (TONES[n.tone] || TONES.info)[0], color: (TONES[n.tone] || TONES.info)[1], display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><NamedIcon name={n.icon} /></span>
              <div className="grow"><b>{n.unread && <span className="unread-dot" />}{n.title}</b><p>{n.body}</p></div><time>{n.time}</time>
            </div>
          )) : <EmptyState icon={Bell} title="No notifications">You’re all caught up.</EmptyState>}
        </section>
      )}
    </>
  );
}
