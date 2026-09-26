import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Search, Plus, MoreVertical, Download, ArrowUpDown, SlidersHorizontal, UserX, Eye, Pencil, FlaskConical, Trash2 } from 'lucide-react';
import { PageHead, Pager, Popover, rowProps } from '../../components/ui/Misc';
import { RiskBadge, StatusBadge } from '../../components/ui/Badges';
import { ConfirmDialog } from '../../components/ui/Modal';
import { EmptyState, Avatar } from '../../components/ui/Misc';
import PatientForm, { toForm } from './PatientForm';
import { usePatients } from '../../context/PatientsContext';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { patientRisk } from '../../lib/risk';
import { agoLabel } from '../../lib/format';
import '../../styles/patients.css';

const PAGE = 10;
const RISK_RANK = { High: 3, Medium: 2, Low: 1 };

export default function PatientList() {
  const nav = useNavigate();
  const toast = useToast();
  const { user } = useAuth();
  const isAdmin = user.role === 'administrator';
  const [params, setParams] = useSearchParams();
  const { patients, addPatient, updatePatient, removePatient, refresh } = usePatients();
  const [q, setQ] = useState(params.get('q') || '');
  const [status, setStatus] = useState('All');
  const [risk, setRisk] = useState(params.get('risk') || 'All');
  const [visit, setVisit] = useState('Any');
  const [gender, setGender] = useState('All');
  const [ageBand, setAgeBand] = useState('All');
  const [more, setMore] = useState(false);
  const [sort, setSort] = useState({ key: 'id', dir: 1 });
  const [page, setPage] = useState(1);
  const [form, setForm] = useState(params.get('new') ? { mode: 'add' } : null);
  const [confirm, setConfirm] = useState(null);

  useEffect(() => { document.title = 'Patients — MediGuard AI'; }, []);
  // The cached list only loads at login; re-pull it whenever this list is
  // opened so recently completed checkups/finalized prescriptions (which
  // update patients server-side without going through this context) show up.
  useEffect(() => { refresh(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { setQ(params.get('q') || ''); if (params.get('risk')) setRisk(params.get('risk')); }, [params]);
  useEffect(() => { setPage(1); }, [q, status, risk, visit, gender, ageBand, sort]);

  const rows = useMemo(() => patients.map((p) => ({ ...p, riskLevel: patientRisk(p).level })), [patients]);
  const stats = useMemo(() => ({ total: rows.length, active: rows.filter((r) => r.status === 'Active').length, high: rows.filter((r) => r.riskLevel === 'High').length, inactive: rows.filter((r) => r.status === 'Inactive').length }), [rows]);

  const filtered = useMemo(() => {
    const t = q.trim().toLowerCase();
    let out = rows.filter((p) => {
      if (t && !`${p.name} ${p.id} ${p.phone} ${p.email} ${p.meds.map((m) => m.name).join(' ')}`.toLowerCase().includes(t)) return false;
      if (status !== 'All' && p.status !== status) return false;
      if (risk !== 'All' && p.riskLevel !== risk) return false;
      if (visit === 'Last 7 days' && p.lastVisitDays > 7) return false;
      if (visit === 'Last 30 days' && p.lastVisitDays > 30) return false;
      if (visit === 'Over 30 days' && p.lastVisitDays <= 30) return false;
      if (gender !== 'All' && p.gender !== gender) return false;
      if (ageBand === 'Under 40' && p.age >= 40) return false;
      if (ageBand === '40–65' && (p.age < 40 || p.age > 65)) return false;
      if (ageBand === 'Over 65' && p.age <= 65) return false;
      return true;
    });
    const val = { id: (p) => p.id, name: (p) => p.name, age: (p) => p.age, risk: (p) => RISK_RANK[p.riskLevel], visit: (p) => p.lastVisitDays, meds: (p) => p.meds.length }[sort.key];
    out = [...out].sort((a, b) => (val(a) > val(b) ? 1 : val(a) < val(b) ? -1 : 0) * sort.dir);
    return out;
  }, [rows, q, status, risk, visit, gender, ageBand, sort]);

  const pageRows = filtered.slice((page - 1) * PAGE, page * PAGE);
  const th = (key, label) => (
    <th aria-sort={sort.key === key ? (sort.dir === 1 ? 'ascending' : 'descending') : 'none'}>
      <button className="th-sort" onClick={() => setSort((s) => ({ key, dir: s.key === key ? -s.dir : 1 }))}>{label}<ArrowUpDown size={12} opacity={sort.key === key ? 1 : .4} /></button>
    </th>
  );
  const activeFilters = [status !== 'All', risk !== 'All', visit !== 'Any', gender !== 'All', ageBand !== 'All', !!q].filter(Boolean).length;
  const reset = () => { setQ(''); setStatus('All'); setRisk('All'); setVisit('Any'); setGender('All'); setAgeBand('All'); setParams({}); };

  const exportCsv = () => {
    const head = ['Patient ID', 'Name', 'Age', 'Gender', 'Risk', 'Medications', 'Last visit', 'Status'];
    const lines = filtered.map((p) => [p.id, p.name, p.age, p.gender, p.riskLevel, p.meds.length, agoLabel(p.lastVisitDays), p.status].map((c) => `"${String(c).replace(/"/g, '""')}"`).join(','));
    const url = URL.createObjectURL(new Blob([[head.join(','), ...lines].join('\n')], { type: 'text/csv' }));
    const a = document.createElement('a'); a.href = url; a.download = 'patients.csv'; a.click(); URL.revokeObjectURL(url);
    toast.success(`Exported ${filtered.length} patients to CSV.`);
  };

  const submit = async (data) => {
    const clean = { ...data, allergies: data.allergies.filter((a) => a.substance.trim()) };
    try {
      if (form.mode === 'add') { const p = await addPatient(clean); toast.success(`${clean.name} registered as ${p.id}.`); setForm(null); setParams({}); nav(`/app/patients/${p.id}`); return; }
      await updatePatient(form.patient.id, clean); toast.success(`${clean.name} updated.`);
      setForm(null); setParams({});
    } catch (ex) { toast.error(ex.message || 'The patient record could not be saved.'); }
  };

  return (
    <>
      <PageHead title="Patient Management" subtitle="Search, register and update patient records.">
        <button className="btn btn-outline" onClick={exportCsv}><Download size={15} />Export CSV</button>
        <button className="btn btn-primary" onClick={() => setForm({ mode: 'add' })}><Plus size={16} />Add Patient</button>
      </PageHead>

      <div className="grid cols-4 mb-16">
        {[['Total Patients', stats.total, ''], ['Active', stats.active, 'var(--low)'], ['High Risk', stats.high, 'var(--high)'], ['Inactive', stats.inactive, 'var(--muted)']].map(([l, v, c]) => (
          <div className="card card-pad" key={l}><div className="muted small">{l}</div><div className="stat-value mono" style={{ color: c || undefined }}>{v}</div></div>
        ))}
      </div>

      <section className="card card-flush">
        <div className="filters">
          <div className="input-icon"><Search size={16} /><input className="input" placeholder="Search by name, ID, phone or medication…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search patients" /></div>
          <select className="select" value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Status"><option value="All">All Patients</option><option>Active</option><option>Inactive</option><option>Watchlist</option></select>
          <select className="select" value={risk} onChange={(e) => setRisk(e.target.value)} aria-label="Risk level"><option value="All">Risk Level</option><option>High</option><option>Medium</option><option>Low</option></select>
          <select className="select" value={visit} onChange={(e) => setVisit(e.target.value)} aria-label="Last visit"><option value="Any">Last Visit</option><option>Last 7 days</option><option>Last 30 days</option><option>Over 30 days</option></select>
          <button className={`btn btn-sm ${more ? 'btn-navy' : 'btn-outline'}`} onClick={() => setMore((m) => !m)} aria-expanded={more}><SlidersHorizontal size={14} />More Filters</button>
          {activeFilters > 0 && <button className="btn btn-ghost btn-sm" onClick={reset}>Clear ({activeFilters})</button>}
        </div>
        {more && (
          <div className="more-filters">
            <select className="select" style={{ width: 'auto', height: 36 }} value={gender} onChange={(e) => setGender(e.target.value)} aria-label="Gender"><option value="All">Any gender</option><option>Male</option><option>Female</option><option>Other</option></select>
            <select className="select" style={{ width: 'auto', height: 36 }} value={ageBand} onChange={(e) => setAgeBand(e.target.value)} aria-label="Age group"><option value="All">Any age</option><option>Under 40</option><option>40–65</option><option>Over 65</option></select>
          </div>
        )}

        {filtered.length === 0 ? (
          <EmptyState icon={UserX} title="No patients match these filters" action={<button className="btn btn-outline" onClick={reset}>Clear filters</button>}>Try a different name or ID, or remove a filter.</EmptyState>
        ) : (
          <div className="table-wrap"><table className="table">
            <thead><tr>{th('id', 'Patient ID')}{th('name', 'Name')}{th('age', 'Age')}<th>Gender</th>{th('risk', 'Risk Level')}{th('meds', 'Current Medications')}{th('visit', 'Last Visit')}<th>Status</th><th className="right">Actions</th></tr></thead>
            <tbody>
              {pageRows.map((p) => (
                <tr key={p.id} className="clickable" {...rowProps(() => nav(`/app/patients/${p.id}`))}>
                  <td className="pid">{p.id}</td><td><div className="row gap-10"><Avatar name={p.name} size="sm" /><b>{p.name}</b></div></td><td className="num">{p.age}</td><td>{p.gender}</td>
                  <td><RiskBadge level={p.riskLevel} /></td><td className="num">{p.meds.length}</td><td className="muted">{agoLabel(p.lastVisitDays)}</td><td><StatusBadge status={p.status} /></td>
                  <td className="right" onClick={(e) => e.stopPropagation()}>
                    <Popover trigger={({ toggle }) => <button className="icon-btn plain" aria-label={`Actions for ${p.name}`} onClick={toggle}><MoreVertical size={16} /></button>}>
                      <button onClick={() => nav(`/app/patients/${p.id}`)}><Eye size={15} />View profile</button>
                      <button onClick={() => setForm({ mode: 'edit', patient: p })}><Pencil size={15} />Edit</button>
                      {user.role === 'doctor' && <button onClick={() => nav(`/app/ddi?patient=${p.id}`)}><FlaskConical size={15} />Run DDI analysis</button>}
                      <hr /><button className="danger" onClick={() => setConfirm(p)}><Trash2 size={15} />Delete</button>
                    </Popover>
                  </td>
                </tr>
              ))}
            </tbody>
          </table></div>
        )}
        <Pager page={page} pageSize={PAGE} total={filtered.length} onPage={setPage} />
      </section>

      {form && <PatientForm mode={form.mode} initial={form.patient ? toForm(form.patient) : undefined} onSubmit={submit} onClose={() => { setForm(null); setParams({}); }} lockMeds={isAdmin} />}
      {confirm && <ConfirmDialog danger title="Delete patient record?" message={`${confirm.name} (${confirm.id}) and their analysis history will be removed.`} confirmLabel="Delete patient" onConfirm={async () => { try { await removePatient(confirm.id); toast.success(`${confirm.name} deleted.`); } catch (ex) { toast.error(ex.message || 'The patient record could not be deleted.'); } }} onClose={() => setConfirm(null)} />}
    </>
  );
}
