import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Users, Stethoscope, Pill, Building2, UserPlus, FileText } from 'lucide-react';
import { StatCard, IconTile, ErrorState } from '../../components/ui/Misc';
import Banner from '../../components/ui/Banner';
import { useAuth } from '../../context/AuthContext';
import { api } from '../../lib/api';
import { useAudit, auditLabel, auditTime } from '../../lib/audit';
import '../../styles/dashboard.css';

/** Hospital administrator home: hospital-wide roster and activity overview.
 *  (No DDI analytics or pharmacy/report queues here: those are clinical
 *  workflows owned by doctors and pharmacists.) */
export default function HospitalAdminDashboard() {
  const { user } = useAuth();
  const nav = useNavigate();
  const [data, setData] = useState({ org: null, staff: [], patients: null });
  const [failed, setFailed] = useState([]);
  const [loading, setLoading] = useState(true);
  const activity = useAudit('activity', 5);
  const security = useAudit('security', 200);

  const load = useCallback(async () => {
    setLoading(true);
    const [orgs, users, patients] = await Promise.allSettled([api.listOrganizations(), api.adminListUsers(), api.listPatients()]);
    const val = (r, d) => (r.status === 'fulfilled' ? r.value : d);
    setData({ org: val(orgs, [])[0] || null, staff: val(users, []), patients: patients.status === 'fulfilled' ? patients.value : null });
    setFailed([['hospital details', orgs], ['staff list', users], ['patient roster', patients]].filter(([, r]) => r.status === 'rejected').map(([n]) => n));
    setLoading(false);
  }, []);
  useEffect(() => { document.title = 'Hospital dashboard — MediGuard AI'; load(); }, [load]);

  const { org, staff, patients } = data;
  const staffKnown = !failed.includes('staff list');
  const count = (role) => staff.filter((u) => u.role === role).length;
  const hospitalName = org?.name || user.org || 'your hospital';
  const orgAudit = (activity.rows || []).slice(0, 5);
  const shown = (v) => (loading ? '…' : v ?? '—');

  const isToday = (ts) => !!ts && new Date(ts * 1000).toDateString() === new Date().toDateString();
  const newToday = patients ? patients.filter((p) => isToday(p.created_at)).length : null;
  const activePatients = patients ? patients.filter((p) => (p.status || 'Active') === 'Active').length : null;
  const inactivePatients = patients ? patients.filter((p) => p.status === 'Inactive').length : null;

  return (
    <>
      <Banner title={hospitalName} subtitle={loading ? 'Loading your hospital’s overview…' : (org?.address ? `${org.address} · Hospital operations overview` : 'Hospital operations overview')}>
        <button className="btn btn-accent" onClick={() => nav('/app/intake')}><UserPlus size={16} />Start patient intake</button>
        <button className="btn btn-outline btn-on-dark" style={{ background: 'transparent' }} onClick={() => nav('/app/reports')}><FileText size={16} />Final reports</button>
      </Banner>

      {failed.length > 0 && <ErrorState title="Some information couldn’t be loaded" message={`Unavailable: ${failed.join(', ')}. The numbers below marked “—” are unknown, not zero.`} onRetry={load} />}

      <h2 className="card-title mt-16 mb-8">Hospital at a Glance</h2>
      <div className="grid cols-4">
        <StatCard icon={Users} tone="teal" label="Total Patients" value={shown(patients ? patients.length : null)} onClick={() => nav('/app/patients')} />
        <StatCard icon={Stethoscope} tone="info" label="Doctors" value={shown(staffKnown ? count('doctor') : null)} onClick={() => nav('/app/admin/users')} />
        <StatCard icon={Pill} tone="low" label="Pharmacists" value={shown(staffKnown ? count('pharmacist') : null)} onClick={() => nav('/app/admin/users')} />
        <StatCard icon={UserPlus} tone="moderate" label="New Patients Today" value={shown(newToday)} onClick={() => nav('/app/patients')} />
      </div>

      <div className="split-grid mt-16">
        <section className="card card-flush">
          <div className="card-head" style={{ paddingBottom: 12 }}>
            <h2 className="card-title">Recent Hospital Activity</h2>
            <button className="link-btn" onClick={() => nav('/app/admin/audit')}>View audit trail</button>
          </div>
          {orgAudit.length === 0 ? (
            <div className="empty"><h3>No activity yet</h3><p>Actions taken by your hospital’s staff will show up here.</p></div>
          ) : (
            <div className="table-wrap"><table className="table">
              <thead><tr><th>Time</th><th>User</th><th>Action</th><th>Resource</th></tr></thead>
              <tbody>{orgAudit.map((a) => (
                <tr key={a.id}><td className="muted">{auditTime(a)}</td><td>{a.actor.name}</td><td>{auditLabel(a.action)}</td><td className="muted">{a.resource_type} {a.resource_id}</td></tr>
              ))}</tbody>
            </table></div>
          )}
        </section>
        <section className="card">
          <div className="card-head"><h2 className="card-title">Hospital Snapshot</h2><button className="link-btn" onClick={() => nav('/app/patients')}>Manage patients</button></div>
          <div className="card-body">
            <ul className="health">
              <li><div className="grow"><b><Users size={14} /> Active patients</b></div><b className="mono">{shown(activePatients)}</b></li>
              <li><div className="grow"><b><Users size={14} /> Inactive patients</b></div><b className="mono">{shown(inactivePatients)}</b></li>
              <li><div className="grow"><b>Total hospital staff</b><span className="d">Doctors + pharmacists</span></div><b className="mono">{shown(staffKnown ? count('doctor') + count('pharmacist') : null)}</b></li>
              <li><div className="grow"><b>Security events</b><span className="d">Sign-ins, account changes</span></div><b className="mono">{(security.rows || []).length}</b></li>
            </ul>
          </div>
        </section>
      </div>

      <section className="card card-pad mt-16">
        <h2 className="card-title mb-12">Quick Actions</h2>
        <div className="quick">
          <button className="quick-tile" onClick={() => nav('/app/intake')}><IconTile icon={UserPlus} tone="low" /><div><b>Start patient intake</b><span>Search or register a patient and assign a doctor</span></div></button>
          <button className="quick-tile" onClick={() => nav('/app/patients')}><IconTile icon={Users} tone="info" /><div><b>Patient Records</b><span>View and edit patient information</span></div></button>
          <button className="quick-tile" onClick={() => nav('/app/admin/users')}><IconTile icon={UserPlus} /><div><b>Add staff or patient</b><span>Onboard a doctor, pharmacist or patient</span></div></button>
          <button className="quick-tile" onClick={() => nav('/app/admin/organizations')}><IconTile icon={Building2} tone="info" /><div><b>Hospital details</b><span>Name, address and contact information</span></div></button>
        </div>
      </section>
    </>
  );
}
