import { useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { Modal } from '../../components/ui/Modal';
import { TextField, SelectField, Field, ChipInput } from '../../components/ui/Field';
import { SeverityBadge } from '../../components/ui/Badges';
import { BLOOD_GROUPS, CATALOG, COMMON_CONDITIONS, FREQUENCIES, findDrug } from '../../data/catalog';
import { analyzeMedications, kidneyStatus } from '../../lib/risk';
import { ageFromDob, isEmail } from '../../lib/format';

export const EMPTY_FORM = {
  name: '', dob: '', gender: '', phone: '', email: '', city: '', emergencyName: '', emergencyRelation: '', emergencyPhone: '',
  height: '', weight: '', bloodGroup: '', egfr: '', creatinine: '', alt: '', ast: '', conditions: [], allergies: [], meds: [], status: 'Active',
};

export const toForm = (p) => ({
  name: p.name, dob: p.dob || '', gender: p.gender, phone: p.phone || '', email: p.email || '', city: p.city || '',
  emergencyName: p.emergency?.name || '', emergencyRelation: p.emergency?.relation || '', emergencyPhone: p.emergency?.phone || '',
  height: p.height ?? '', weight: p.weight ?? '', bloodGroup: p.bloodGroup || '', egfr: p.egfr ?? '', creatinine: p.creatinine ?? '', alt: p.alt ?? '', ast: p.ast ?? '',
  conditions: [...p.conditions], allergies: p.allergies.map((a) => ({ ...a })), meds: p.meds.map((m) => ({ ...m })), status: p.status,
});

const STEPS = ['Personal', 'Clinical', 'Allergies', 'Medications', 'Review'];

function validate(step, f) {
  const e = {};
  if (step === 0) {
    if (f.name.trim().length < 2) e.name = 'Enter the patient’s full name';
    if (!f.dob) e.dob = 'Select a date of birth'; else if (ageFromDob(f.dob) == null || ageFromDob(f.dob) < 0 || ageFromDob(f.dob) > 120) e.dob = 'Enter a valid date of birth';
    if (!f.gender) e.gender = 'Select a gender';
    if (f.email && !isEmail(f.email)) e.email = 'Enter a valid email address';
    if (f.phone && f.phone.replace(/\D/g, '').length < 10) e.phone = 'Enter a 10-digit phone number';
  }
  if (step === 1) {
    if (f.egfr === '' || Number(f.egfr) <= 0 || Number(f.egfr) > 200) e.egfr = 'Enter eGFR between 1 and 200';
    if (f.alt === '' || Number(f.alt) <= 0 || Number(f.alt) > 2000) e.alt = 'Enter ALT in U/L';
    if (f.height && (Number(f.height) < 40 || Number(f.height) > 250)) e.height = 'Height in cm (40–250)';
    if (f.weight && (Number(f.weight) < 2 || Number(f.weight) > 400)) e.weight = 'Weight in kg (2–400)';
  }
  return e;
}

export default function PatientForm({ initial, mode = 'add', onSubmit, onClose, lockMeds = false }) {
  const [f, setF] = useState(initial || EMPTY_FORM);
  const [step, setStep] = useState(0);
  const [err, setErr] = useState({});
  const [pick, setPick] = useState({ name: '', dose: '', freq: 'Once daily', indication: '' });
  const set = (k) => (e) => setF((s) => ({ ...s, [k]: e.target.value }));

  const next = () => { const e = validate(step, f); setErr(e); if (!Object.keys(e).length) setStep((s) => s + 1); };
  const back = () => { setErr({}); setStep((s) => s - 1); };

  const addMed = () => {
    const drug = findDrug(pick.name);
    if (!drug) { setErr({ med: 'Choose a medication from the list' }); return; }
    if (f.meds.some((m) => m.name === drug.name)) { setErr({ med: `${drug.name} is already on the list` }); return; }
    setErr({});
    setF((s) => ({ ...s, meds: [...s.meds, { name: drug.name, dose: pick.dose || drug.dose, freq: pick.freq, indication: pick.indication || 'Not specified', since: new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) }] }));
    setPick({ name: '', dose: '', freq: 'Once daily', indication: '' });
  };

  const interactions = analyzeMedications(f.meds.map((m) => m.name));
  const age = ageFromDob(f.dob);
  const title = mode === 'add' ? 'Add Patient' : `Edit ${initial?.name || 'patient'}`;

  const footer = (
    <>
      <button className="btn btn-outline" onClick={onClose}>Cancel</button>
      {step > 0 && <button className="btn btn-outline" onClick={back}>Back</button>}
      {step < STEPS.length - 1 ? <button className="btn btn-navy" onClick={next}>Next</button> : <button className="btn btn-primary" onClick={() => onSubmit(f)}>{mode === 'add' ? 'Register patient' : 'Save changes'}</button>}
    </>
  );

  return (
    <Modal title={title} subtitle={`Step ${step + 1} of ${STEPS.length} — ${STEPS[step]}`} onClose={onClose} footer={footer}>
      <div className="stepper" aria-label="Progress">{STEPS.map((s, i) => <div key={s} className={`step ${i < step ? 'done' : i === step ? 'on' : ''}`}><i />{s}</div>)}</div>

      {step === 0 && (
        <div className="grid" style={{ gap: 14 }}>
          <TextField label="Full name" placeholder="Enter patient name" value={f.name} onChange={set('name')} error={err.name} />
          <div className="grid cols-2">
            <TextField label="Date of birth" type="date" max={new Date().toISOString().slice(0, 10)} value={f.dob} onChange={set('dob')} error={err.dob} hint={age != null && age >= 0 ? `Age: ${age}` : undefined} />
            <SelectField label="Gender" value={f.gender} onChange={set('gender')} error={err.gender} placeholder="Select gender" options={['Male', 'Female', 'Other']} />
          </div>
          <div className="grid cols-2">
            <TextField label="Phone" placeholder="+91 98765 43210" value={f.phone} onChange={set('phone')} error={err.phone} />
            <TextField label="Email" type="email" value={f.email} onChange={set('email')} error={err.email} />
          </div>
          <TextField label="City" value={f.city} onChange={set('city')} />
          <div className="grid cols-3">
            <TextField label="Emergency contact" value={f.emergencyName} onChange={set('emergencyName')} />
            <TextField label="Relationship" value={f.emergencyRelation} onChange={set('emergencyRelation')} />
            <TextField label="Contact phone" value={f.emergencyPhone} onChange={set('emergencyPhone')} />
          </div>
        </div>
      )}

      {step === 1 && (
        <div className="grid" style={{ gap: 14 }}>
          <div className="grid cols-3">
            <TextField label="Height (cm)" type="number" value={f.height} onChange={set('height')} error={err.height} />
            <TextField label="Weight (kg)" type="number" value={f.weight} onChange={set('weight')} error={err.weight} />
            <SelectField label="Blood group" value={f.bloodGroup} onChange={set('bloodGroup')} placeholder="Select" options={BLOOD_GROUPS} />
          </div>
          <div className="grid cols-2">
            <TextField label="Kidney function — eGFR (mL/min/1.73m²)" type="number" value={f.egfr} onChange={set('egfr')} error={err.egfr} hint={f.egfr ? kidneyStatus(Number(f.egfr)).label : 'Used to adjust interaction risk'} />
            <TextField label="Creatinine (mg/dL)" type="number" step="0.1" value={f.creatinine} onChange={set('creatinine')} />
            <TextField label="Liver function — ALT (U/L)" type="number" value={f.alt} onChange={set('alt')} error={err.alt} hint="Normal is up to about 40 U/L" />
            <TextField label="AST (U/L)" type="number" value={f.ast} onChange={set('ast')} />
          </div>
          <Field label="Medical conditions">
            <ChipInput items={f.conditions} placeholder="e.g. Hypertension" suggestions={COMMON_CONDITIONS} onAdd={(c) => setF((s) => ({ ...s, conditions: [...s.conditions, c] }))} onRemove={(c) => setF((s) => ({ ...s, conditions: s.conditions.filter((x) => x !== c) }))} />
          </Field>
        </div>
      )}

      {step === 2 && (
        <div className="grid" style={{ gap: 12 }}>
          <p className="muted small">Record known drug and other allergies. Leave empty if none are known.</p>
          <div className="rows-edit">
            {f.allergies.map((a, i) => (
              <div className="row-edit allergy" key={i}>
                <TextField label="Substance" value={a.substance} onChange={(e) => setF((s) => ({ ...s, allergies: s.allergies.map((x, j) => (j === i ? { ...x, substance: e.target.value } : x)) }))} />
                <TextField label="Reaction" value={a.reaction} onChange={(e) => setF((s) => ({ ...s, allergies: s.allergies.map((x, j) => (j === i ? { ...x, reaction: e.target.value } : x)) }))} />
                <SelectField label="Severity" value={a.severity} options={['Mild', 'Moderate', 'Severe']} onChange={(e) => setF((s) => ({ ...s, allergies: s.allergies.map((x, j) => (j === i ? { ...x, severity: e.target.value } : x)) }))} />
                <button type="button" className="icon-btn" aria-label="Remove allergy" onClick={() => setF((s) => ({ ...s, allergies: s.allergies.filter((_, j) => j !== i) }))}><Trash2 size={15} /></button>
              </div>
            ))}
          </div>
          <button type="button" className="btn btn-outline" style={{ justifySelf: 'start' }} onClick={() => setF((s) => ({ ...s, allergies: [...s.allergies, { substance: '', reaction: '', severity: 'Mild' }] }))}><Plus size={15} />Add allergy</button>
        </div>
      )}

      {step === 3 && (
        <div className="grid" style={{ gap: 12 }}>
          {lockMeds && <p className="muted small">Medications are prescribed and managed by the treating doctor and can’t be changed here.</p>}
          {!lockMeds && (
            <div className="row-edit tri">
              <div className="field"><label htmlFor="med-name">Medication</label><input id="med-name" className="input" list="cat-list" placeholder="Search generic or brand" value={pick.name} onChange={(e) => setPick({ ...pick, name: e.target.value })} /><datalist id="cat-list">{CATALOG.map((d) => <option key={d.name} value={d.name}>{d.brands.join(', ')}</option>)}</datalist></div>
              <TextField label="Dose" placeholder={findDrug(pick.name)?.dose || '500mg'} value={pick.dose} onChange={(e) => setPick({ ...pick, dose: e.target.value })} />
              <SelectField label="Frequency" value={pick.freq} options={FREQUENCIES} onChange={(e) => setPick({ ...pick, freq: e.target.value })} />
              <TextField label="Indication" className="" placeholder="e.g. Hypertension" value={pick.indication} onChange={(e) => setPick({ ...pick, indication: e.target.value })} />
              <button type="button" className="btn btn-navy" style={{ alignSelf: 'end' }} onClick={addMed}><Plus size={15} />Add</button>
            </div>
          )}
          {err.med && <span className="err small" style={{ color: 'var(--high)' }} role="alert">{err.med}</span>}
          {f.meds.length === 0 && <p className="muted small">No medications added yet.</p>}
          {f.meds.map((m) => (
            <div className="med-mini" key={m.name}><div className="grow"><b>{m.name} {m.dose}</b><span>{m.freq} · {m.indication}</span></div>
              {!lockMeds && <button type="button" className="icon-btn" aria-label={`Remove ${m.name}`} onClick={() => setF((s) => ({ ...s, meds: s.meds.filter((x) => x.name !== m.name) }))}><Trash2 size={15} /></button>}</div>
          ))}
        </div>
      )}

      {step === 4 && (
        <div className="grid" style={{ gap: 16 }}>
          <div className="review-grid">
            <div className="review-block"><h4>Patient</h4><b>{f.name}</b><div className="small muted">{age} yrs · {f.gender}{f.city ? ` · ${f.city}` : ''}</div><div className="small muted">{f.phone || 'No phone'} · {f.email || 'No email'}</div></div>
            <div className="review-block"><h4>Clinical</h4><div className="small">eGFR <b>{f.egfr}</b> · ALT <b>{f.alt}</b> U/L</div><div className="small muted">{f.height || '—'} cm · {f.weight || '—'} kg · {f.bloodGroup || 'Blood group not set'}</div></div>
            <div className="review-block"><h4>Conditions</h4><div className="small">{f.conditions.join(', ') || 'None recorded'}</div></div>
            <div className="review-block"><h4>Allergies</h4><div className="small">{f.allergies.filter((a) => a.substance).map((a) => a.substance).join(', ') || 'None recorded'}</div></div>
          </div>
          <div className="review-block"><h4>Medications ({f.meds.length})</h4><div className="small">{f.meds.map((m) => `${m.name} ${m.dose}`).join(', ') || 'None'}</div></div>
          {interactions.length > 0 ? (
            <div className="callout callout-warn"><div><b>{interactions.length} possible interaction{interactions.length > 1 ? 's' : ''} in this medication list</b>
              <div className="mt-8 col gap-6">{interactions.map((i) => <span key={i.key} className="row gap-8">{i.a} + {i.b} <SeverityBadge level={i.severity} /></span>)}</div></div></div>
          ) : <div className="callout callout-ok">No known interactions in this medication list.</div>}
        </div>
      )}
    </Modal>
  );
}
