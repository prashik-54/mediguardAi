import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Download, Printer, FileText, Send, RefreshCw, Pill } from 'lucide-react';
import { PageHead, EmptyState, LoadingState } from '../../components/ui/Misc';
import { ConfirmDialog } from '../../components/ui/Modal';
import { StatusBadge } from '../../components/ui/Badges';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { api } from '../../lib/api';
import { fmtDate } from '../../lib/format';
import { downloadReportPdf } from '../../lib/pdf';
import '../../styles/reports.css';

const dt = (ts) => (ts ? fmtDate(new Date(ts * 1000)) : '—');

/** Final patient/admin prescription reports — backend-backed (Phase 8).
 *  The API returns an allowlisted view only: no DDI/interaction data exists here. */
export default function Reports() {
  const { user } = useAuth();
  const toast = useToast();
  const [confirm, setConfirm] = useState(null);
  const [params, setParams] = useSearchParams();
  const [list, setList] = useState(null);
  const [error, setError] = useState('');
  const [report, setReport] = useState(null);
  const [busy, setBusy] = useState(false);
  const selected = params.get('id');
  useEffect(() => { document.title = 'Reports — MediGuard AI'; }, []);

  const load = useCallback(async () => {
    setError('');
    try { setList(await api.listReports()); } catch (e) { setList([]); setError(e.message || 'Could not load reports.'); }
  }, []);
  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!selected) { setReport(null); return; }
    let live = true;
    api.getReport(selected).then((r) => live && setReport(r)).catch((e) => { if (live) { setReport(null); toast.error(e.message || 'Could not open report.'); } });
    return () => { live = false; };
  }, [selected]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { if (list?.length && !selected) setParams({ id: list[0].id }, { replace: true }); }, [list, selected, setParams]);

  const download = async () => {
    try { await downloadReportPdf(report); api.logReportAccess(report.id, 'download').catch(() => {}); toast.success('PDF downloaded.'); }
    catch { toast.error('Could not create the PDF.'); }
  };
  const print = () => { api.logReportAccess(report.id, 'print').catch(() => {}); window.print(); };
  const release = async () => {
    setBusy(true);
    try { setReport(await api.releaseReport(report.id)); toast.success('Report released to the patient.'); load(); }
    catch (e) { toast.error(e.message || 'Could not release the report.'); }
    finally { setBusy(false); }
  };

  const sendPharmacy = async () => {
    setBusy(true);
    try { await api.sendToPharmacy(report.prescription.id); toast.success('Prescription sent to the pharmacy.'); }
    catch (e) { toast.error(e.message || 'Could not send to the pharmacy.'); }
    finally { setBusy(false); }
  };
  const canRelease = user.role === 'administrator' && report && !report.patient_visible;
  const h = report?.hospital || {}; const p = report?.patient || {}; const d = report?.doctor || {}; const v = report?.visit || {};

  return (
    <>
      <PageHead title="Final Reports" subtitle="Official prescription reports from finalized consultations.">
        <button className="btn btn-outline btn-sm no-print" onClick={load}><RefreshCw size={14} />Refresh</button>
      </PageHead>
      {error && <div className="callout callout-warn mb-8" role="alert"><span>{error}</span></div>}

      <div className="report-layout">
        <section className="card report-sheet" aria-label="Report preview">
          {list === null ? <p className="muted small" style={{ padding: 24 }}>Loading reports…</p> : !report ? (
            <EmptyState icon={FileText} title="No report selected">Finalized prescription reports appear here.</EmptyState>
          ) : (
            <>
              <div className="report-bar no-print">
                <div className="row gap-8"><span className="badge badge-info no-dot">{p.name}</span><StatusBadge status={report.patient_visible ? 'Finalized' : 'Draft'} /><span className="small muted">{report.patient_visible ? 'Released to patient' : 'Not yet released'} · Patient-safe report: contains no DDI analysis</span></div>
                <div className="row gap-8 wrap">
                  {canRelease && <><button className="btn btn-primary btn-sm" disabled={busy} onClick={() => setConfirm('release')}><Send size={14} />Release to patient</button>{confirm === 'release' && <ConfirmDialog title="Release report to the patient?" message="The patient will be able to see this report in their portal and will be notified." confirmLabel="Release report" onConfirm={release} onClose={() => setConfirm(null)} />}</>}
                  {user.role === 'administrator' && <><button className="btn btn-outline btn-sm" disabled={busy} onClick={() => setConfirm('pharmacy')}><Pill size={14} />Send to pharmacy</button>{confirm === 'pharmacy' && <ConfirmDialog title="Send prescription to the pharmacy?" message="The pharmacists at your hospital will receive this finalized prescription for dispensing. Only one order can be created per prescription." confirmLabel="Send to pharmacy" onConfirm={sendPharmacy} onClose={() => setConfirm(null)} />}</>}
                  <button className="btn btn-outline btn-sm" onClick={download}><Download size={14} />Download PDF</button>
                  <button className="btn btn-outline btn-sm" onClick={print}><Printer size={14} />Print</button>
                </div>
              </div>
              <div className="report-doc">
                <div className="report-head">
                  <div><h2>{h.name}</h2><p className="small muted mt-4">{[h.address, h.phone, h.email].filter(Boolean).join(' · ') || 'Clinical prescription report'}</p></div>
                  <div className="report-head-right"><b>Patient Medical Report</b><span className="small muted">Report {report.report_number} · {dt(report.generated_at)}</span></div>
                </div>

                <div className="report-body">
                  {(() => { const cp = report.clinical_profile || {};
                    return (
                    <div className="report-info-card">
                      <div className="report-field"><label>Patient</label><div>{p.name} (ID: {p.id})</div></div>
                      <div className="report-field"><label>Age / Gender</label><div>{[p.age != null ? `${p.age} yrs` : null, p.gender].filter(Boolean).join(' · ') || '—'}</div></div>
                      <div className="report-field"><label>Date of birth</label><div>{p.dob || '—'}</div></div>
                      <div className="report-field"><label>Contact number</label><div>{p.phone || '—'}</div></div>
                      <div className="report-field"><label>Physical</label><div>{[p.blood_group && `Blood group ${p.blood_group}`, p.height_cm && `${p.height_cm} cm`, p.weight_kg && `${p.weight_kg} kg`].filter(Boolean).join(' · ') || '—'}</div></div>
                      <div className="report-field"><label>Attending doctor</label><div>{d.name}{d.specialization ? ` (${d.specialization})` : ''}</div></div>
                      <div className="report-field"><label>Doctor ID</label><div>{d.id || '—'}</div></div>
                      <div className="report-field"><label>Visit date</label><div>{v.date ? dt(v.date) : '—'}</div></div>
                      <div className="report-field"><label>Report status</label><div>{report.patient_visible ? 'Finalized' : 'Draft'}</div></div>
                      <div className="report-field"><label>Lab values</label><div>{[cp.egfr != null && `eGFR ${cp.egfr}`, cp.alt != null && `ALT ${cp.alt} U/L`, cp.creatinine != null && `Creatinine ${cp.creatinine}`, cp.ast != null && `AST ${cp.ast} U/L`].filter(Boolean).join(' · ') || '—'}</div></div>
                    </div>
                    ); })()}

                  {report.prescription?.id && <p className="report-rx-strip">Prescription #{report.prescription.id}{report.prescription.version ? ` · Version ${report.prescription.version}` : ''}</p>}

                  {(() => { const cp = report.clinical_profile || {}; const allergies = (cp.allergies || []).map((a) => a.substance).filter(Boolean);
                    return allergies.length > 0 ? <div className="report-allergy-box">Known allergies: {allergies.join(', ')}</div> : null; })()}

                  {(() => { const cp = report.clinical_profile || {}; const hasClinical = (cp.conditions || []).length || (cp.current_medications || []).length;
                    return hasClinical ? (
                    <>
                      <h3 className="report-section-title">Clinical profile</h3>
                      {(cp.conditions || []).length > 0 && <p className="small"><b>Existing conditions:</b> {cp.conditions.join(', ')}</p>}
                      {(cp.current_medications || []).length > 0 && <p className="small mt-4"><b>Current medications (prior to this visit):</b> {cp.current_medications.join(', ')}</p>}
                    </>
                    ) : null; })()}

                  {(v.diagnosis || v.assessment || v.clinical_findings || v.notes) && (
                    <>
                      <h3 className="report-section-title">Diagnosis &amp; assessment</h3>
                      {v.diagnosis && <p className="small"><b>Diagnosis:</b> {v.diagnosis}</p>}
                      {v.assessment && <p className="small mt-4"><b>Assessment:</b> {v.assessment}</p>}
                      {v.clinical_findings && <p className="small mt-4"><b>Clinical findings:</b> {v.clinical_findings}</p>}
                      {v.notes && <p className="small mt-4"><b>Notes:</b> {v.notes}</p>}
                    </>
                  )}

                  <h3 className="report-section-title">Prescribed medicines ({report.medicines.length})</h3>
                  {report.medicines.length === 0 ? <p className="small muted">No medicines on this prescription.</p> : (
                    <div className="table-wrap report-table"><table className="table">
                      <thead><tr><th>#</th><th>Medicine</th><th>Dose</th><th>Freq / Timing</th><th>Duration</th><th>Route</th><th>Qty</th><th>Instructions</th></tr></thead>
                      <tbody>{report.medicines.map((m, i) => <tr key={i}>
                        <td className="muted">{i + 1}</td><td><b>{m.name}</b></td><td>{[m.dose, m.unit].filter(Boolean).join(' ') || '—'}</td>
                        <td>{[m.frequency, m.timing].filter(Boolean).join(' · ') || '—'}</td><td>{m.duration || '—'}</td><td>{m.route || '—'}</td>
                        <td>{m.quantity != null ? m.quantity : '—'}</td><td className="muted">{m.instructions || '—'}</td>
                      </tr>)}</tbody>
                    </table></div>
                  )}
                  {report.prescription?.clinical_instructions && <><h3 className="report-section-title">Clinical instructions</h3><p className="small">{report.prescription.clinical_instructions}</p></>}
                  {v.follow_up && <><h3 className="report-section-title">Follow-up</h3><p className="small">{v.follow_up}</p></>}

                  <div className="report-important-box"><b>IMPORTANT</b><p>Take medicines exactly as prescribed. Do not stop or change any medication without consulting your doctor. Contact the hospital immediately if you experience side effects.</p></div>
                </div>
                <p className="report-footnote">This report is confidential and intended solely for the named patient. &nbsp;·&nbsp; {h.name} · Report {report.report_number}</p>
              </div>
            </>
          )}
        </section>

        <section className="card card-flush no-print" aria-label="Report history">
          <div className="card-head" style={{ paddingBottom: 12 }}><h2 className="card-title">Report history</h2></div>
          {list === null ? <LoadingState label="Loading reports" /> : list.length === 0 ? <EmptyState icon={FileText} title="No reports yet">Reports appear once a prescription is finalized{user.role === 'patient' ? ' and released to you' : ''}.</EmptyState> : list.map((r) => (
            <button key={r.id} className="hist-item" aria-current={r.id === selected} onClick={() => setParams({ id: r.id })}>
              <FileText size={18} color="var(--muted)" /><div className="grow"><b>{r.patient.name} — {r.report_number}</b><span>{dt(r.generated_at)} · {r.medicine_count} medicine(s) · {r.patient_visible ? 'Released' : 'Awaiting release'}</span></div>
            </button>
          ))}
        </section>
      </div>
    </>
  );
}
