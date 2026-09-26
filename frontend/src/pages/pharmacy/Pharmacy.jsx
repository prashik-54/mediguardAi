import { useCallback, useEffect, useState } from 'react';
import { Pill, RefreshCw, CircleCheck } from 'lucide-react';
import { PageHead, EmptyState, LoadingState } from '../../components/ui/Misc';
import { StatusBadge } from '../../components/ui/Badges';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { api } from '../../lib/api';
import { fmtDate } from '../../lib/format';
import '../../styles/reports.css';

const dt = (ts) => (ts ? fmtDate(new Date(ts * 1000)) : '—');

/** Pharmacy orders (Phase 9). Pharmacist: accept + record dispensing.
 *  Administrator: read-only status tracking. No DDI data exists in this API. */
export default function Pharmacy() {
  const { user } = useAuth();
  const toast = useToast();
  const isPharm = user.role === 'pharmacist';
  const [orders, setOrders] = useState(null);
  const [error, setError] = useState('');
  const [tab, setTab] = useState('open');
  const [sel, setSel] = useState(null);
  const [rows, setRows] = useState({}); // item id -> { status, qty }
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => { document.title = 'Pharmacy — MediGuard AI'; }, []);

  const load = useCallback(async () => {
    setError('');
    try { setOrders(await api.listPharmacyOrders()); } catch (e) { setOrders([]); setError(e.message || 'Could not load pharmacy orders.'); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const shown = (orders || []).filter((o) => (tab === 'open' ? !o.completed_at : !!o.completed_at));
  const order = (orders || []).find((o) => o.id === sel) || null;
  useEffect(() => { setRows({}); setNotes(''); }, [sel]);

  const apply = (o) => { setOrders((list) => list.map((x) => (x.id === o.id ? o : x))); setRows({}); setNotes(''); };
  const act = async (fn, okMsg) => {
    setBusy(true);
    try { apply(await fn()); toast.success(okMsg); } catch (e) { toast.error(e.message || 'Action failed.'); } finally { setBusy(false); }
  };
  const record = () => {
    const items = Object.entries(rows).filter(([, r]) => r.status).map(([item_id, r]) => ({
      item_id, status: r.status, quantity_dispensed: r.qty === '' || r.qty == null ? null : Number(r.qty),
    }));
    if (!items.length) { toast.error('Choose a status for at least one medicine.'); return; }
    act(() => api.dispensePharmacyOrder(order.id, { items, notes }), 'Dispensing recorded.');
  };
  const setRow = (id, patch) => setRows((r) => ({ ...r, [id]: { ...(r[id] || {}), ...patch } }));
  const editable = isPharm && order && !order.completed_at;

  return (
    <>
      <PageHead title="Pharmacy Orders" subtitle={isPharm ? 'Accept prescriptions and record dispensing.' : 'Track prescriptions sent to the pharmacy.'}>
        <button className="btn btn-outline btn-sm" onClick={load}><RefreshCw size={14} />Refresh</button>
      </PageHead>
      {error && <div className="callout callout-warn mb-8" role="alert"><span>{error}</span></div>}
      <div className="report-layout">
        <section className="card report-sheet" aria-label="Order detail">
          {orders === null ? <LoadingState label="Loading orders" /> : !order ? (
            <EmptyState icon={Pill} title="No order selected">Select an order to view its medicines.</EmptyState>
          ) : (
            <>
              <div className="report-bar">
                <div className="row gap-8"><b>{order.patient.name}</b><span className="badge badge-neutral no-dot">{order.patient.id}</span><StatusBadge status={order.status} /></div>
                {isPharm && order.status === 'Sent' && <button className="btn btn-primary btn-sm" disabled={busy} onClick={() => act(() => api.acceptPharmacyOrder(order.id), 'Order accepted.')}><CircleCheck size={14} />Accept order</button>}
              </div>
              <div className="report-doc">
                <p className="small muted">{[order.patient.age != null && `${order.patient.age} yrs`, order.patient.gender].filter(Boolean).join(' · ')} · Prescriber: {order.prescriber.name || '—'} · Sent {dt(order.sent_at)}</p>
                {order.patient.allergies.length > 0 && <div className="callout callout-warn mt-8"><span><b>Allergies:</b> {order.patient.allergies.join(', ')}</span></div>}
                <h3>Medicines</h3>
                <div className="table-wrap" style={{ border: '1px solid var(--border)', borderRadius: 10 }}><table className="table">
                  <thead><tr><th>Medicine</th><th>Dose / when</th><th>Duration</th><th>Qty</th><th>Status</th>{editable && <th>Record</th>}</tr></thead>
                  <tbody>{order.items.map((i) => {
                    const done = i.dispense_status === 'Dispensed' || i.dispense_status === 'Unavailable';
                    const r = rows[i.id] || {};
                    return (
                      <tr key={i.id}>
                        <td><b>{i.name}</b>{i.instructions && <div className="tiny muted">{i.instructions}</div>}</td>
                        <td>{[i.dose, i.unit].filter(Boolean).join(' ') || '—'}<div className="tiny muted">{[i.frequency, i.timing, i.route].filter(Boolean).join(', ')}</div></td>
                        <td>{i.duration || '—'}</td>
                        <td>{i.quantity ?? '—'}{i.quantity_dispensed != null && <div className="tiny muted">given {i.quantity_dispensed}</div>}</td>
                        <td><StatusBadge status={i.dispense_status} /></td>
                        {editable && <td>{done ? <span className="tiny muted">Closed</span> : (
                          <div className="row gap-8">
                            <select className="select" aria-label={`Status for ${i.name}`} value={r.status || ''} onChange={(e) => setRow(i.id, { status: e.target.value })}>
                              <option value="">—</option><option>Dispensed</option><option>Partially Dispensed</option><option>Unavailable</option>
                            </select>
                            <input className="input" style={{ width: 70 }} type="number" min="0" placeholder="Qty" aria-label={`Quantity for ${i.name}`} value={r.qty ?? ''} onChange={(e) => setRow(i.id, { qty: e.target.value })} />
                          </div>)}</td>}
                      </tr>
                    );
                  })}</tbody></table></div>
                {editable && (
                  <div className="mt-16">
                    <label htmlFor="disp-notes" className="small muted">Notes (optional)</label>
                    <textarea id="disp-notes" className="textarea" rows={2} maxLength={500} value={notes} onChange={(e) => setNotes(e.target.value)} />
                    <button className="btn btn-primary btn-sm mt-8" disabled={busy} onClick={record}>Record dispensing</button>
                  </div>
                )}
                {order.dispensing.length > 0 && (<><h3>Dispensing history</h3>
                  <ul className="bullets">{order.dispensing.map((d) => <li key={d.id}>{d.status} · {dt(d.dispensed_at)}{d.notes ? ` — ${d.notes}` : ''}</li>)}</ul></>)}
              </div>
            </>
          )}
        </section>
        <section className="card card-flush" aria-label="Orders">
          <div className="card-head" style={{ paddingBottom: 12 }}><h2 className="card-title">Orders</h2>
            <div className="row gap-8"><button className={`btn btn-sm ${tab === 'open' ? 'btn-primary' : 'btn-outline'}`} onClick={() => setTab('open')}>Open</button><button className={`btn btn-sm ${tab === 'done' ? 'btn-primary' : 'btn-outline'}`} onClick={() => setTab('done')}>Completed</button></div></div>
          {orders === null ? <LoadingState label="Loading pharmacy orders" /> : shown.length === 0 ? <EmptyState icon={Pill} title={tab === 'open' ? 'No open orders' : 'No completed orders'}>Orders appear here once a finalized prescription is sent to the pharmacy.</EmptyState> : shown.map((o) => (
            <button key={o.id} className="hist-item" aria-current={o.id === sel} onClick={() => setSel(o.id)}>
              <Pill size={18} color="var(--muted)" /><div className="grow"><b>{o.patient.name} — {o.id}</b><span>{o.status} · {o.items.length} medicine(s) · {dt(o.sent_at)}</span></div>
            </button>
          ))}
        </section>
      </div>
    </>
  );
}
