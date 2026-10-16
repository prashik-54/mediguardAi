import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Pill, CircleCheck, Clock, ClipboardCheck, PackageCheck } from 'lucide-react';
import { StatCard, Avatar, EmptyState, LoadingState, ErrorState, rowProps } from '../../components/ui/Misc';
import Banner from '../../components/ui/Banner';
import { StatusBadge } from '../../components/ui/Badges';
import { useAuth } from '../../context/AuthContext';
import { useReviews } from '../../context/ReviewsContext';
import { api } from '../../lib/api';
import { greeting } from './DoctorDashboard';
import '../../styles/dashboard.css';

/** Pharmacist home: dispensing work first (real orders); the review queue is secondary. */
export default function PharmacistDashboard() {
  const { user } = useAuth();
  const { pending } = useReviews();
  const nav = useNavigate();
  const [orders, setOrders] = useState(null);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setError('');
    try { setOrders(await api.listPharmacyOrders()); } catch (e) { setOrders(null); setError(e.message || 'Could not load pharmacy orders.'); }
  }, []);
  useEffect(() => { document.title = 'Dashboard — MediGuard AI'; load(); }, [load]);

  const open = (orders || []).filter((o) => !o.completed_at);
  const fresh = open.filter((o) => o.status === 'Sent');
  const doneCount = (orders || []).length - open.length;

  return (
    <>
      <Banner title={`${greeting()}, ${user.name.split(' ')[0]}`} subtitle={orders ? `${fresh.length} new prescription${fresh.length === 1 ? '' : 's'} waiting to be accepted.` : 'Your dispensing work for today.'}>
        <button className="btn btn-accent" onClick={() => nav('/app/pharmacy')}><Pill size={16} />Open pharmacy orders</button>
      </Banner>

      {error ? <ErrorState title="Couldn’t load pharmacy orders" message={error} onRetry={load} /> : orders === null ? <LoadingState label="Loading pharmacy orders" rows={4} /> : (
        <>
          <div className="grid cols-4">
            <StatCard icon={Pill} tone="high" label="New orders" value={fresh.length} note={fresh.length ? 'Accept to start' : undefined} onClick={() => nav('/app/pharmacy')} />
            <StatCard icon={Clock} tone="moderate" label="In progress" value={open.length - fresh.length} />
            <StatCard icon={CircleCheck} tone="low" label="Completed" value={doneCount} />
            <StatCard icon={ClipboardCheck} tone="info" label="Review requests" value={pending.length} note="Legacy review queue" onClick={() => nav('/app/review')} />
          </div>
          <section className="card card-flush mt-16">
            <div className="card-head" style={{ paddingBottom: 12 }}><h2 className="card-title">Next up</h2><button className="link-btn" onClick={() => nav('/app/pharmacy')}>See all orders</button></div>
            {open.length === 0 ? <EmptyState icon={PackageCheck} title="No open orders" art={false}>New prescriptions sent by the hospital administrator appear here.</EmptyState> : (
              <div className="table-wrap"><table className="table">
                <thead><tr><th>Patient</th><th>Medicines</th><th>Status</th><th /></tr></thead>
                <tbody>
                  {open.slice(0, 5).map((o) => (
                    <tr key={o.id} className="clickable" {...rowProps(() => nav('/app/pharmacy'))}>
                      <td><div className="row" style={{ gap: 10 }}><Avatar name={o.patient.name} size="sm" /><div><b>{o.patient.name}</b><div className="tiny muted">{o.patient.id}</div></div></div></td>
                      <td>{o.items.length}</td>
                      <td><StatusBadge status={o.status} /></td>
                      <td className="right"><button className="btn btn-outline btn-sm" onClick={(e) => { e.stopPropagation(); nav('/app/pharmacy'); }}>Open</button></td>
                    </tr>
                  ))}
                </tbody>
              </table></div>
            )}
          </section>
        </>
      )}
    </>
  );
}
