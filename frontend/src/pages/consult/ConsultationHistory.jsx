import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { NotebookPen, Pill } from 'lucide-react';
import { Avatar, EmptyState, ErrorState, LoadingState, PageHead } from '../../components/ui/Misc';
import { StatusBadge } from '../../components/ui/Badges';
import { api } from '../../lib/api';
import { fmtDate } from '../../lib/format';
import '../../styles/patients.css';

/** Read-only view of a single past consultation, opened in a new tab from
 * the "Previous consultations" list on the live Consultation page, so a
 * doctor can review an earlier visit's notes/diagnosis/prescription
 * side-by-side with the current one instead of it replacing that page. */
export default function ConsultationHistory() {
  const { encounterId } = useParams();
  const [encounter, setEncounter] = useState(null);
  const [patient, setPatient] = useState(null);
  const [rx, setRx] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    document.title = 'Past consultation — MediGuard AI';
    let live = true;
    (async () => {
      setLoading(true); setError('');
      try {
        const enc = await api.getEncounter(encounterId);
        const [p, rows] = await Promise.all([
          api.getPatient(enc.patient_id).catch(() => null),
          api.encounterPrescriptions(encounterId).catch(() => []),
        ]);
        if (!live) return;
        setEncounter(enc); setPatient(p);
        setRx(rows.find((r) => r.status === 'Finalized') || rows.find((r) => r.status !== 'Cancelled') || null);
      } catch (ex) {
        if (live) setError(ex.message || 'Could not load this consultation.');
      } finally { if (live) setLoading(false); }
    })();
    return () => { live = false; };
  }, [encounterId]);

  if (loading) return <LoadingState label="Loading consultation" rows={4} />;
  if (error || !encounter) return <ErrorState title="Could not open this consultation" message={error} />;

  const rxItems = (rx?.items || []).filter((i) => (i.medicine_name || '').trim());

  return (
    <>
      <PageHead title={`Consultation — ${fmtDate(encounter.created_at * 1000)}`}
                subtitle="Read-only view of a past visit.">
        <StatusBadge status={encounter.status} />
      </PageHead>

      {patient && (
        <section className="card card-pad mb-16">
          <div className="row gap-12" style={{ alignItems: 'center' }}>
            <Avatar name={patient.name} />
            <div>
              <b>{patient.name}</b>
              <div className="small muted">{[patient.age != null && `${patient.age} yrs`, patient.gender].filter(Boolean).join(' · ')}</div>
            </div>
          </div>
        </section>
      )}

      <section className="card card-pad">
        <div className="row gap-8 mb-4"><h2 className="card-title row gap-8"><NotebookPen size={17} />Consultation notes</h2></div>
        <div className="grid" style={{ gap: 14 }}>
          {[['Consultation notes', encounter.notes], ['Clinical findings', encounter.clinical_findings],
            ['Diagnosis', encounter.diagnosis], ['Assessment', encounter.assessment], ['Follow-up instructions', encounter.follow_up]]
            .map(([label, val]) => (
              <div key={label}>
                <h3 style={{ fontSize: 13 }}>{label}</h3>
                <p className="small mt-4" style={{ lineHeight: 1.7 }}>{val || '—'}</p>
              </div>
            ))}
        </div>
      </section>

      <section className="card card-pad mt-16">
        <h2 className="card-title row gap-8 mb-8"><Pill size={17} />Prescribed medicine</h2>
        {rxItems.length === 0 ? (
          <EmptyState icon={Pill} title="No prescription">No prescription was finalized for this visit.</EmptyState>
        ) : (
          <div className="table-wrap"><table className="table">
            <thead><tr><th>Medicine</th><th>Dose</th><th>Frequency</th><th>Duration</th><th>Instructions</th></tr></thead>
            <tbody>{rxItems.map((it, i) => (
              <tr key={i}>
                <td><b>{it.medicine_name}</b></td>
                <td>{[it.dose, it.unit].filter(Boolean).join(' ') || '—'}</td>
                <td>{it.frequency || '—'}</td>
                <td>{it.duration || '—'}</td>
                <td className="muted">{it.instructions || '—'}</td>
              </tr>
            ))}</tbody>
          </table></div>
        )}
      </section>
    </>
  );
}
