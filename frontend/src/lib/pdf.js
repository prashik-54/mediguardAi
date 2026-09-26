// Matches the site's CSS tokens (styles/tokens.css) exactly, so the
// downloaded PDF, the on-screen preview, and the browser print output
// (which renders the same HTML as the preview) never disagree visually.
const NAVY = [10, 42, 57];       // --navy-900
const ACCENT = [10, 106, 120];   // --primary
const SLATE = [95, 119, 132];    // --muted
const LIGHT = [246, 250, 251];   // --surface-2
const BORDER = [221, 232, 235];  // --border
const INFO_BG = [234, 240, 255]; // --info-bg
const HIGH = [212, 48, 74];      // --high
const HIGH_BG = [253, 236, 239]; // --high-bg
const HIGH_LINE = [246, 198, 207]; // --high-line

const fmt = (ts) => (ts ? new Date(ts * 1000).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—');
const fmtDT = (ts) => (ts ? new Date(ts * 1000).toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—');

/**
 * Builds the patient-facing prescription report PDF client-side from the
 * backend's allowlisted report view (GET /api/reports/{id}). The view
 * contains no DDI/interaction data, and this function only reads the
 * fields below, so none can be added by accident.
 */
export async function downloadReportPdf(report) {
  const { jsPDF } = await import('jspdf'); // loaded on demand to keep the main bundle small
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const W = 210, PAGE_H = 297, M = 15, CW = W - 2 * M;
  const TOP = 40, BOTTOM = 24;
  let y = TOP;
  let page = 1;

  const h = report.hospital || {}; const p = report.patient || {}; const d = report.doctor || {};
  const v = report.visit || {}; const rx = report.prescription || {}; const cp = report.clinical_profile || {};
  const meds = report.medicines || [];

  const drawHeader = () => {
    doc.setFillColor(...NAVY); doc.rect(0, 0, W, 30, 'F');
    doc.setFillColor(...ACCENT); doc.rect(0, 30, W, 1.4, 'F');
    doc.setTextColor(255); doc.setFont('helvetica', 'bold'); doc.setFontSize(15);
    doc.text(h.name || 'Hospital', M, 13);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8.3);
    doc.text([h.address, h.phone, h.email].filter(Boolean).join('   ·   ') || 'Clinical prescription report', M, 20);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(10.5);
    doc.text('PATIENT MEDICAL REPORT', W - M, 12, { align: 'right' });
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8.3);
    doc.text(`Report No. ${report.report_number || '—'}`, W - M, 18, { align: 'right' });
    doc.text(`Generated ${fmt(report.generated_at)}`, W - M, 23.5, { align: 'right' });
  };

  const drawFooter = () => {
    doc.setDrawColor(...BORDER); doc.setLineWidth(0.2);
    doc.line(M, PAGE_H - BOTTOM + 2, W - M, PAGE_H - BOTTOM + 2);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(7.6); doc.setTextColor(...SLATE);
    doc.text('This report is confidential and intended solely for the named patient.', M, PAGE_H - BOTTOM + 7);
    doc.text(`${h.name || 'Hospital'} · Report ${report.report_number || '—'}`, M, PAGE_H - BOTTOM + 11.5);
    doc.text(`Page ${page}`, W - M, PAGE_H - BOTTOM + 7, { align: 'right' });
  };

  const newPage = () => { drawFooter(); doc.addPage(); page += 1; drawHeader(); y = TOP; };
  const ensure = (hgt) => { if (y + hgt > PAGE_H - BOTTOM) newPage(); };

  drawHeader();

  // Patient / Doctor info card
  const infoRows = 5;
  const padX = 6, padY = 9, rowGap = 11.5;
  const cardH = padY + (infoRows - 1) * rowGap + 8;
  ensure(cardH + 8);
  doc.setDrawColor(...BORDER); doc.setFillColor(...LIGHT);
  doc.roundedRect(M, y, CW, cardH, 2, 2, 'FD');
  const colW = CW / 2;
  const field = (x, yy, label, value) => {
    doc.setFont('helvetica', 'bold'); doc.setFontSize(7); doc.setTextColor(...SLATE);
    doc.text(label.toUpperCase(), x, yy);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9.3); doc.setTextColor(20, 26, 34);
    const l = doc.splitTextToSize(String(value ?? '—'), colW - padX - 4);
    doc.text(l, x, yy + 4.6);
  };
  field(M + padX, y + padY, 'Patient', `${p.name || '—'}  (ID: ${p.id || '—'})`);
  field(M + padX, y + padY + rowGap, 'Age / Gender', [p.age != null ? `${p.age} yrs` : null, p.gender].filter(Boolean).join(' · ') || '—');
  field(M + padX, y + padY + rowGap * 2, 'Date of Birth', p.dob || '—');
  field(M + padX, y + padY + rowGap * 3, 'Contact Number', p.phone || '—');
  field(M + padX, y + padY + rowGap * 4, 'Physical', [p.blood_group && `Blood group ${p.blood_group}`, p.height_cm && `${p.height_cm} cm`, p.weight_kg && `${p.weight_kg} kg`].filter(Boolean).join(' · ') || '—');
  field(M + colW + padX, y + padY, 'Attending Doctor', `${d.name || '—'}${d.specialization ? `  (${d.specialization})` : ''}`);
  field(M + colW + padX, y + padY + rowGap, 'Doctor ID', d.id || '—');
  field(M + colW + padX, y + padY + rowGap * 2, 'Visit Date', fmt(v.date));
  field(M + colW + padX, y + padY + rowGap * 3, 'Report Status', report.status || (report.patient_visible ? 'Finalized' : 'Draft'));
  field(M + colW + padX, y + padY + rowGap * 4, 'Lab Values', [cp.egfr != null && `eGFR ${cp.egfr}`, cp.alt != null && `ALT ${cp.alt} U/L`, cp.creatinine != null && `Creatinine ${cp.creatinine}`, cp.ast != null && `AST ${cp.ast} U/L`].filter(Boolean).join(' · ') || '—');
  y += cardH + 10;

  // Prescription reference strip
  ensure(9);
  doc.setFont('helvetica', 'bold'); doc.setFontSize(7.6); doc.setTextColor(...SLATE);
  doc.text(`PRESCRIPTION ${rx.id ? `#${rx.id}` : '—'}${rx.version ? `  ·  Version ${rx.version}` : ''}`, M, y);
  y += 7;

  const section = (t) => {
    ensure(10);
    doc.setFillColor(...ACCENT); doc.rect(M, y - 3.6, 2.2, 5, 'F');
    doc.setFont('helvetica', 'bold'); doc.setFontSize(10.5); doc.setTextColor(...NAVY);
    doc.text(t, M + 5, y);
    y += 6;
  };
  const paragraph = (t) => {
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9.2); doc.setTextColor(45, 55, 68);
    const l = doc.splitTextToSize(t, CW);
    ensure(l.length * 4.6 + 2);
    doc.text(l, M, y);
    y += l.length * 4.6 + 4;
  };

  // Allergies — safety-critical, called out in a highlighted box
  if ((cp.allergies || []).length > 0) {
    const names = cp.allergies.map((a) => a.substance).filter(Boolean).join(', ');
    const lines = doc.splitTextToSize(`Known allergies: ${names}`, CW - 12);
    const boxH = lines.length * 4.6 + 7;
    ensure(boxH + 6);
    doc.setDrawColor(...HIGH_LINE); doc.setFillColor(...HIGH_BG); doc.setLineWidth(0.4);
    doc.roundedRect(M, y, CW, boxH, 2, 2, 'FD');
    doc.setFont('helvetica', 'bold'); doc.setFontSize(9.2); doc.setTextColor(...HIGH);
    doc.text(lines, M + 5, y + 6);
    y += boxH + 6;
  }

  if ((cp.conditions || []).length || (cp.current_medications || []).length) {
    section('Clinical profile');
    if ((cp.conditions || []).length) paragraph(`Existing conditions: ${cp.conditions.join(', ')}`);
    if ((cp.current_medications || []).length) paragraph(`Current medications (prior to this visit): ${cp.current_medications.join(', ')}`);
  }

  if (v.diagnosis || v.assessment || v.clinical_findings || v.notes) {
    section('Diagnosis & assessment');
    if (v.diagnosis) paragraph(`Diagnosis: ${v.diagnosis}`);
    if (v.assessment) paragraph(`Assessment: ${v.assessment}`);
    if (v.clinical_findings) paragraph(`Clinical findings: ${v.clinical_findings}`);
    if (v.notes) paragraph(`Notes: ${v.notes}`);
  }

  // Medicines table
  section(`Prescribed medicines (${meds.length})`);
  const cols = [
    { key: '#', w: 7, align: 'center' },
    { key: 'Medicine', w: 34 },
    { key: 'Dose', w: 18 },
    { key: 'Freq / Timing', w: 28 },
    { key: 'Duration', w: 18 },
    { key: 'Route', w: 16 },
    { key: 'Qty', w: 11, align: 'center' },
    { key: 'Instructions', w: CW - (7 + 34 + 18 + 28 + 18 + 16 + 11) },
  ];
  const rowLineH = 4.4, rowPadY = 2.6;

  const drawTableHeader = () => {
    ensure(9);
    doc.setFillColor(...NAVY);
    doc.rect(M, y, CW, 7.5, 'F');
    let x = M;
    doc.setFont('helvetica', 'bold'); doc.setFontSize(7.6); doc.setTextColor(255);
    cols.forEach((c) => {
      doc.text(c.key.toUpperCase(), c.align === 'center' ? x + c.w / 2 : x + 2, y + 5, c.align === 'center' ? { align: 'center' } : undefined);
      x += c.w;
    });
    y += 7.5;
  };
  drawTableHeader();

  meds.forEach((m, i) => {
    const doseTxt = [m.dose, m.unit].filter(Boolean).join(' ') || '—';
    const freqTxt = [m.frequency, m.timing].filter(Boolean).join(' · ') || '—';
    const durTxt = m.duration || '—';
    const routeTxt = m.route || '—';
    const qtyTxt = m.quantity != null ? String(m.quantity) : '—';
    const instrTxt = m.instructions || '—';
    const nameTxt = m.name || '—';

    const wrap = (txt, w) => doc.splitTextToSize(String(txt), w - 4);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8.4);
    const cells = [String(i + 1), nameTxt, doseTxt, freqTxt, durTxt, routeTxt, qtyTxt, instrTxt];
    const wrapped = cells.map((c, idx) => wrap(c, cols[idx].w));
    const lines = Math.max(...wrapped.map((w) => w.length), 1);
    const rowH = lines * rowLineH + rowPadY * 2;

    if (y + rowH > PAGE_H - BOTTOM) { newPage(); drawTableHeader(); }

    if (i % 2 === 1) { doc.setFillColor(...LIGHT); doc.rect(M, y, CW, rowH, 'F'); }
    doc.setDrawColor(...BORDER); doc.setLineWidth(0.15);
    doc.line(M, y + rowH, M + CW, y + rowH);

    let x = M;
    doc.setTextColor(30, 38, 48);
    cols.forEach((c, idx) => {
      doc.setFont('helvetica', idx === 1 ? 'bold' : 'normal'); doc.setFontSize(8.4);
      const txtLines = wrapped[idx];
      const align = c.align === 'center' ? { align: 'center' } : undefined;
      doc.text(txtLines, c.align === 'center' ? x + c.w / 2 : x + 2, y + rowPadY + 3.2, align);
      x += c.w;
    });
    y += rowH;
  });
  doc.setDrawColor(...BORDER); doc.line(M, y, M + CW, y);
  y += 8;

  if (rx.clinical_instructions) { section('Clinical instructions'); paragraph(rx.clinical_instructions); }
  if (v.follow_up) { section('Follow-up'); paragraph(v.follow_up); }

  ensure(20);
  doc.setDrawColor(80, 130, 220); doc.setFillColor(...INFO_BG);
  doc.setLineWidth(0.3);
  doc.roundedRect(M, y, CW, 16, 2, 2, 'FD');
  doc.setFont('helvetica', 'bold'); doc.setFontSize(8.6); doc.setTextColor(...NAVY);
  doc.text('IMPORTANT', M + 4, y + 6);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(8.4); doc.setTextColor(50, 60, 72);
  doc.text(doc.splitTextToSize('Take medicines exactly as prescribed. Do not stop or change any medication without consulting your doctor. Contact the hospital immediately if you experience side effects.', CW - 8), M + 4, y + 11);

  drawFooter();
  doc.save(`report-${report.report_number || 'draft'}-${p.id || 'patient'}.pdf`);
}
