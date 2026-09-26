import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Users, FlaskConical, UserPlus, FileText, Stethoscope, Clock, CircleCheck } from 'lucide-react';
import { StatCard, Avatar, IconTile, EmptyState, LoadingState, ErrorState, rowProps } from '../../components/ui/Misc';
import Banner from '../../components/ui/Banner';
import { StatusBadge } from '../../components/ui/Badges';
import { NamedIcon } from '../../components/ui/Icons';
import { TrendChart } from '../../components/charts/Charts';
import { useAuth } from '../../context/AuthContext';
import { usePatients } from '../../context/PatientsContext';
import { api } from '../../lib/api';
import { useNotifications } from '../../context/NotificationsContext';
import { lastMonths, bucketByMonth } from '../../lib/stats';
import '../../styles/dashboard.css';

export const greeting = () => { const h = new Date().getHours(); return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening'; };
const TONE_VAR = { info: ['var(--info-bg)', 'var(--info)'], low: ['var(--low-bg)', 'var(--low)'], moderate: ['var(--mod-bg)', 'var(--mod)'], high: ['var(--high-bg)', 'var(--high)'] };
const CLOSED = ['Completed', 'Cancelled', 'No Show'];

/** Doctor home: today's queue first (the doctor's real work), analysis history second. */
export default function DoctorDashboard() {
  const { user } = useAuth();
  const nav = useNavigate();
  const { patients } = usePatients();
  const { items: notes } = useNotifications();
  const [visits, setVisits] = useState(null);
  const [visitsError, setVisitsError] = useState('');
  const [analyses, setAnalyses] = useState(null);
  const [analysesFailed, setAnalysesFailed] = useState(false);

  const loadVisits = useCallback(async () => {
    setVisitsError('');
    try { setVisits(await api.myAppointments()); } catch (e) { setVisits(null); setVisitsError(e.message || 'Could not load your queue.'); }
  }, []);
  useEffect(() => { document.title = 'Dashboard — MediGuard AI'; loadVisits(); }, [loadVisits]);
  useEffect(() => {
    let live = true;
    api.listAnalyses().then((rows) => { if (live) setAnalyses(Array.isArray(rows) ? rows : []); }).catch(() => { if (live) setAnalysesFailed(true); });
    return () => { live = false; };
  }, []);

  const byId = useMemo(() => Object.fromEntries(patients.map((p) => [p.id, p])), [patients]);
  const open = useMemo(() => (visits || []).filter((v) => !CLOSED.includes(v.status)).sort((a, b) => (a.queue_number || 0) - (b.queue_number || 0)), [visits]);
  const waiting = open.filter((v) => v.status === 'Scheduled' || v.status === 'Checked In').length;
  const inConsult = open.filter((v) => v.status === 'In Consultation').length;
  const completed = (visits || []).filter((v) => v.status === 'Completed').length;
  const trend = useMemo(() => {
    const months = lastMonths(7);
    const all = bucketByMonth(analyses, months); const high = bucketByMonth(analyses, months, (r) => r.severity === 'High');
    return months.map((x, i) => ({ m: x.m, analyses: all[i], high: high[i] }));
  }, [analyses]);
  const activity = notes.slice(0, 4).map((n) => ({ icon: n.icon, tone: n.tone || 'info', title: n.title, sub: n.body, time: n.time }));
  const nameOf = (v) => byId[v.patient_id]?.name || v.patient_id;

  return (
    <>
      <Banner title={`${greeting()}, ${user.name}`} subtitle={visits ? `${waiting} patient${waiting === 1 ? '' : 's'} waiting${inConsult ? `, ${inConsult} in consultation` : ''}.` : 'Your consultation queue for today.'}>
        <button className="btn btn-accent" onClick={() => nav('/app/queue')}><Stethoscope size={16} />Open my queue</button>
        <button className="btn btn-outline btn-on-dark" style={{ background: 'transparent' }} onClick={() => nav('/app/ddi')}><FlaskConical size={16} />Check interactions</button>
      </Banner>

      <div className="grid cols-4">
        <StatCard icon={Clock} tone="moderate" label="Waiting" value={visits ? waiting : '—'} note={waiting ? 'In queue order' : undefined} onClick={() => nav('/app/queue')} />
        <StatCard icon={Stethoscope} tone="info" label="In consultation" value={visits ? inConsult : '—'} />
        <StatCard icon={CircleCheck} tone="low" label="Completed visits" value={visits ? completed : '—'} />
        <StatCard icon={Users} label="My patients" value={patients.length} onClick={() => nav('/app/patients')} />
      </div>

      <section className="card card-flush mt-16">
        <div className="card-head" style={{ paddingBottom: 12 }}>
          <div><h2 className="card-title">Next patients</h2><p className="section-note">Open visits, in queue order.</p></div>
          <button className="link-btn" onClick={() => nav('/app/queue')}>See full queue</button>
        </div>
        {visitsError ? <ErrorState title="Couldn’t load your queue" message={visitsError} onRetry={loadVisits} /> : visits === null ? <LoadingState label="Loading your queue" /> : open.length === 0 ? (
          <EmptyState icon={Stethoscope} title="No open visits" art={false}>Patients checked in by the hospital administrator will appear here.</EmptyState>
        ) : (
          <div className="table-wrap"><table className="table">
            <thead><tr><th>#</th><th>Patient</th><th>Reason</th><th>Status</th><th /></tr></thead>
            <tbody>
              {open.slice(0, 5).map((v) => (
                <tr key={v.id} className="clickable" {...rowProps(() => nav(`/app/consult/${v.id}`))}>
                  <td className="mono muted">{v.queue_number}</td>
                  <td><div className="row" style={{ gap: 10 }}><Avatar name={nameOf(v)} size="sm" /><div><b>{nameOf(v)}</b><div className="tiny muted">{v.patient_id}</div></div></div></td>
                  <td>{v.reason}</td>
                  <td><StatusBadge status={v.status} /></td>
                  <td className="right"><button className="btn btn-outline btn-sm" onClick={(e) => { e.stopPropagation(); nav(`/app/consult/${v.id}`); }}>Open visit</button></td>
                </tr>
              ))}
            </tbody>
          </table></div>
        )}
      </section>

      <div className="dash-grid mt-16">
        <div className="col gap-16">
          <section className="card card-pad">
            <h2 className="card-title mb-12">Quick Actions</h2>
            <div className="quick">
              <button className="quick-tile" onClick={() => nav('/app/patients?new=1')}><IconTile icon={UserPlus} /><div><b>Add patient</b><span>Register a new clinical profile</span></div></button>
              <button className="quick-tile" onClick={() => nav('/app/ddi')}><IconTile icon={FlaskConical} tone="low" /><div><b>DDI checker</b><span>Check a medication list</span></div></button>
              <button className="quick-tile" onClick={() => nav('/app/reports')}><IconTile icon={FileText} tone="info" /><div><b>Patient reports</b><span>Finalized prescription reports</span></div></button>
            </div>
          </section>
          <section className="card">
            <div className="card-head"><h2 className="card-title">Recent Activity</h2></div>
            <div className="card-body">
              <ul className="activity">
                {activity.length === 0 && <li className="muted small">No recent activity yet.</li>}
                {activity.map((a) => (
                  <li key={a.title + a.time}>
                    <span style={{ width: 34, height: 34, borderRadius: '50%', background: (TONE_VAR[a.tone] || TONE_VAR.info)[0], color: (TONE_VAR[a.tone] || TONE_VAR.info)[1], display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><NamedIcon name={a.icon} /></span>
                    <div><b>{a.title}</b><span>{a.sub}</span></div>
                    <time>{a.time}</time>
                  </li>
                ))}
              </ul>
            </div>
          </section>
        </div>
        <section className="card">
          <div className="card-head"><h2 className="card-title">DDI checker usage</h2><span className="muted small">Saved analyses · last 7 months</span></div>
          <div className="card-body">{analysesFailed ? <p className="muted">Analysis history could not be loaded.</p> : analyses === null ? <LoadingState label="Loading analysis history" rows={4} /> : <TrendChart data={trend} height={320} />}</div>
        </section>
      </div>
    </>
  );
}
