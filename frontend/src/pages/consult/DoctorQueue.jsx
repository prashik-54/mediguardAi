import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Stethoscope, RefreshCcw } from 'lucide-react';
import { PageHead, EmptyState, Avatar, ErrorState, LoadingState, rowProps } from '../../components/ui/Misc';
import { StatusBadge } from '../../components/ui/Badges';
import { Tabs } from '../../components/ui/Tabs';
import { useToast } from '../../context/ToastContext';
import { api } from '../../lib/api';
import '../../styles/patients.css';

const TABS = [
  { id: 'open', label: 'Open' },
  { id: 'all', label: 'All' },
];

export default function DoctorQueue() {
  const nav = useNavigate();
  const toast = useToast();
  const [tab, setTab] = useState('open');
  const [rows, setRows] = useState(null);
  const [patients, setPatients] = useState({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const load = async (t = tab) => {
    setLoading(true); setError('');
    try {
      const [apts, mine] = await Promise.all([
        api.myAppointments(t === 'open' ? 'open' : undefined),
        api.listPatients().catch(() => []),
      ]);
      setRows(apts);
      setPatients(Object.fromEntries(mine.map((p) => [p.id, p])));
    } catch (ex) { setError(ex.message || 'Could not load your queue.'); setRows([]); }
    finally { setLoading(false); }
  };

  useEffect(() => { document.title = 'My Queue — MediGuard AI'; }, []);
  useEffect(() => { load(tab); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [tab]);

  const sorted = useMemo(() => (rows || []).slice().sort((a, b) => (a.queue_number || 0) - (b.queue_number || 0)), [rows]);

  return (
    <>
      <PageHead title="My Queue" subtitle="Patients assigned to you today, in queue order.">
        <button className="btn btn-outline" onClick={() => load(tab)} disabled={loading}><RefreshCcw size={15} />Refresh</button>
      </PageHead>

      <div className="mb-16"><Tabs tabs={TABS} value={tab} onChange={setTab} label="Queue filter" /></div>

      <section className="card card-flush">
        {rows === null ? (
          <LoadingState label="Loading your queue" />
        ) : error ? (
          <ErrorState title="Couldn’t load your queue" message={error} onRetry={() => load(tab)} />
        ) : sorted.length === 0 ? (
          <EmptyState icon={Stethoscope} title="No patients in your queue" art={false}>
            {tab === 'open' ? 'You have no open visits right now.' : 'No visits have been assigned to you yet.'}
          </EmptyState>
        ) : (
          <div className="table-wrap"><table className="table">
            <thead><tr><th>#</th><th>Patient</th><th>Reason</th><th>Date</th><th>Time</th><th>Status</th><th /></tr></thead>
            <tbody>
              {sorted.map((a) => (
                <tr key={a.id} className="clickable" {...rowProps(() => nav(`/app/consult/${a.id}`))}>
                  <td className="mono muted">{a.queue_number}</td>
                  <td className="row gap-8"><Avatar name={patients[a.patient_id]?.name || a.patient_id} size="sm" /><div><b>{patients[a.patient_id]?.name || a.patient_id}</b><div className="tiny muted">{a.patient_id}</div></div></td>
                  <td>{a.reason}</td>
                  <td className="muted">{a.appointment_date}</td>
                  <td className="muted">{a.appointment_time || '—'}</td>
                  <td><StatusBadge status={a.status} /></td>
                  <td className="right"><button className="btn btn-outline btn-sm" onClick={(e) => { e.stopPropagation(); nav(`/app/consult/${a.id}`); }}>Open</button></td>
                </tr>
              ))}
            </tbody>
          </table></div>
        )}
      </section>
    </>
  );
}
