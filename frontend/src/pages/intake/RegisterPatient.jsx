import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Trash2, UserPlus } from 'lucide-react';
import { PageHead } from '../../components/ui/Misc';
import { TextField, SelectField, Field, ChipInput } from '../../components/ui/Field';
import { useToast } from '../../context/ToastContext';
import { api } from '../../lib/api';
import { ageFromDob, isEmail } from '../../lib/format';
import { kidneyStatus, liverStatus } from '../../lib/risk';
import { COMMON_ALLERGENS, COMMON_CONDITIONS, BLOOD_GROUPS } from '../../data/catalog';
import '../../styles/patients.css';

const EMPTY_REG = {
  name: '', dob: '', gender: '', phone: '', email: '', city: '',
  // Emergency contact — matches the fields collected on the "Edit patient" form,
  // so a record started at intake doesn't need a follow-up edit just to add this.
  emergencyName: '', emergencyRelation: '', emergencyPhone: '',
  // A portal account is created together with every new registration, so
  // the administrator sets the patient's initial password right here.
  password: '',
  // Optional clinical details (Phase 14): admin may leave these blank at
  // intake — the assigned doctor must fill any gaps in before checkout.
  height: '', weight: '', bloodGroup: '', egfr: '', creatinine: '', alt: '', ast: '', conditions: [], allergies: [],
};

/** Its own page (not an inline card in Patient Intake) so registering a new
 * patient doesn't require scrolling past the search box and the full roster
 * table first, and so the long form has room to breathe on its own screen. */
export default function RegisterPatient() {
  const nav = useNavigate();
  const toast = useToast();
  const [reg, setReg] = useState(EMPTY_REG);
  const [err, setErr] = useState({});
  const [dup, setDup] = useState(null);
  const [saving, setSaving] = useState(false);

  const backToIntake = (patient) => nav('/app/intake', patient ? { state: { patient } } : undefined);

  const validate = () => {
    const e = {};
    if (reg.name.trim().length < 2) e.name = 'Enter the patient’s full name';
    if (!reg.dob) e.dob = 'Select a date of birth';
    if (!reg.gender) e.gender = 'Select a gender';
    if (!reg.email) e.email = 'Enter an email address — it will be the patient’s portal login';
    else if (!isEmail(reg.email)) e.email = 'Enter a valid email address';
    if (reg.password.length < 8) e.password = 'Set an initial password of at least 8 characters';
    setErr(e);
    return Object.keys(e).length === 0;
  };

  const register = async (allowDuplicate = false) => {
    if (!allowDuplicate && !validate()) return;
    setSaving(true);
    setDup(null);
    try {
      const created = await api.createPatient({
        name: reg.name.trim(), dob: reg.dob, age: ageFromDob(reg.dob) ?? 0, gender: reg.gender,
        phone: reg.phone, email: reg.email, city: reg.city, allow_duplicate: allowDuplicate,
        // A portal account is created together with the patient record —
        // no separate invite step. The patient can change this password
        // after their first login.
        password: reg.password,
        // Emergency contact — sent only if the admin filled in at least one field.
        ...(reg.emergencyName || reg.emergencyRelation || reg.emergencyPhone
          ? { emergency: { name: reg.emergencyName, relation: reg.emergencyRelation, phone: reg.emergencyPhone } } : {}),
        // Clinical details are optional at intake — only sent if the admin
        // filled them in; the assigned doctor confirms/fills the rest later.
        ...(reg.height !== '' ? { height: Number(reg.height) } : {}),
        ...(reg.weight !== '' ? { weight: Number(reg.weight) } : {}),
        ...(reg.bloodGroup ? { bloodGroup: reg.bloodGroup } : {}),
        ...(reg.egfr !== '' ? { egfr: Number(reg.egfr) } : {}),
        ...(reg.creatinine !== '' ? { creatinine: Number(reg.creatinine) } : {}),
        ...(reg.alt !== '' ? { alt: Number(reg.alt) } : {}),
        ...(reg.ast !== '' ? { ast: Number(reg.ast) } : {}),
        ...(reg.conditions.length ? { conditions: reg.conditions } : {}),
        ...(reg.allergies.length ? { allergies: reg.allergies.filter((a) => (a.substance || '').trim()) } : {}),
      });
      toast.success(`${created.name} registered and their portal account was created.`);
      backToIntake(created);
    } catch (ex) {
      if (ex.status === 409 && ex.detail?.existing_patient_id) {
        setDup(ex.detail);
      } else {
        toast.error(ex.message || 'Could not register this patient.');
      }
    } finally {
      setSaving(false);
    }
  };

  const useExisting = async (id) => {
    setSaving(true);
    try { backToIntake(await api.getPatient(id)); }
    catch (ex) { toast.error(ex.message || 'Could not load that patient.'); setSaving(false); }
  };

  return (
    <>
      <PageHead title="Register New Patient" subtitle="Create a clinical profile and portal account, then assign a doctor.">
        <button className="btn btn-outline" onClick={() => backToIntake()}>Cancel</button>
      </PageHead>

      <section className="card card-pad">
        <div className="grid" style={{ gap: 14 }}>
          <TextField label="Full name" value={reg.name} error={err.name} onChange={(e) => setReg({ ...reg, name: e.target.value })} />
          <div className="grid cols-2">
            <TextField label="Date of birth" type="date" max={new Date().toISOString().slice(0, 10)} value={reg.dob} error={err.dob}
                       onChange={(e) => setReg({ ...reg, dob: e.target.value })} />
            <SelectField label="Gender" value={reg.gender} error={err.gender} placeholder="Select gender" options={['Male', 'Female', 'Other']}
                         onChange={(e) => setReg({ ...reg, gender: e.target.value })} />
          </div>
          <div className="grid cols-2">
            <TextField label="Phone" value={reg.phone} onChange={(e) => setReg({ ...reg, phone: e.target.value })} hint="Optional" />
            <TextField label="Email" type="email" value={reg.email} error={err.email}
                       onChange={(e) => setReg({ ...reg, email: e.target.value })}
                       hint="Used as the patient's portal login" />
          </div>
          <TextField label="City" value={reg.city} onChange={(e) => setReg({ ...reg, city: e.target.value })} />
          <div className="grid cols-3">
            <TextField label="Emergency contact" value={reg.emergencyName} onChange={(e) => setReg({ ...reg, emergencyName: e.target.value })} hint="Optional" />
            <TextField label="Relationship" value={reg.emergencyRelation} onChange={(e) => setReg({ ...reg, emergencyRelation: e.target.value })} hint="Optional" />
            <TextField label="Contact phone" value={reg.emergencyPhone} onChange={(e) => setReg({ ...reg, emergencyPhone: e.target.value })} hint="Optional" />
          </div>

          <div className="callout" style={{ padding: '10px 12px' }}>
            <b>Portal account</b>
            <div className="small muted mt-4">A patient account is created automatically with this registration — no invite is sent. Set an initial password below; the patient can change it after logging in.</div>
          </div>
          <TextField label="Initial password" type="text" value={reg.password} error={err.password}
                     onChange={(e) => setReg({ ...reg, password: e.target.value })}
                     hint="At least 8 characters — share this with the patient" />

          <div className="callout" style={{ padding: '10px 12px' }}>
            <b>Clinical details (optional)</b>
            <div className="small muted mt-4">Fill these in now if available. Anything left blank will need to be confirmed by the doctor during the checkup.</div>
          </div>
          <div className="grid cols-3">
            <TextField label="Height (cm)" type="number" value={reg.height}
                       onChange={(e) => setReg({ ...reg, height: e.target.value })} hint="Optional" />
            <TextField label="Weight (kg)" type="number" value={reg.weight}
                       onChange={(e) => setReg({ ...reg, weight: e.target.value })} hint="Optional" />
            <SelectField label="Blood group" value={reg.bloodGroup} placeholder="Select" options={BLOOD_GROUPS}
                         onChange={(e) => setReg({ ...reg, bloodGroup: e.target.value })} />
          </div>
          <div className="grid cols-2">
            <TextField label="Kidney function — eGFR (mL/min/1.73m²)" type="number" value={reg.egfr}
                       onChange={(e) => setReg({ ...reg, egfr: e.target.value })}
                       hint={reg.egfr ? kidneyStatus(Number(reg.egfr)).label : 'Optional'} />
            <TextField label="Creatinine (mg/dL)" type="number" step="0.1" value={reg.creatinine}
                       onChange={(e) => setReg({ ...reg, creatinine: e.target.value })} hint="Optional" />
            <TextField label="Liver function — ALT (U/L)" type="number" value={reg.alt}
                       onChange={(e) => setReg({ ...reg, alt: e.target.value })}
                       hint={reg.alt ? liverStatus(Number(reg.alt)).label : 'Optional'} />
            <TextField label="AST (U/L)" type="number" value={reg.ast}
                       onChange={(e) => setReg({ ...reg, ast: e.target.value })} hint="Optional" />
          </div>
          <Field label="Existing conditions (optional)">
            <ChipInput items={reg.conditions} placeholder="e.g. Hypertension" suggestions={COMMON_CONDITIONS}
                       onAdd={(c) => setReg({ ...reg, conditions: [...reg.conditions, c] })}
                       onRemove={(c) => setReg({ ...reg, conditions: reg.conditions.filter((x) => x !== c) })} />
          </Field>
          <Field label="Known allergies (optional)">
            <div className="grid" style={{ gap: 8 }}>
              {reg.allergies.map((a, i) => (
                <div className="row-edit allergy" key={i}>
                  <TextField label="Substance" list="intake-allergens" value={a.substance}
                             onChange={(e) => setReg({ ...reg, allergies: reg.allergies.map((x, j) => (j === i ? { ...x, substance: e.target.value } : x)) })} />
                  <TextField label="Reaction" value={a.reaction || ''}
                             onChange={(e) => setReg({ ...reg, allergies: reg.allergies.map((x, j) => (j === i ? { ...x, reaction: e.target.value } : x)) })} />
                  <SelectField label="Severity" value={a.severity || 'Mild'} options={['Mild', 'Moderate', 'Severe']}
                               onChange={(e) => setReg({ ...reg, allergies: reg.allergies.map((x, j) => (j === i ? { ...x, severity: e.target.value } : x)) })} />
                  <button type="button" className="icon-btn" aria-label="Remove allergy" onClick={() => setReg({ ...reg, allergies: reg.allergies.filter((_, j) => j !== i) })}><Trash2 size={15} /></button>
                </div>
              ))}
            </div>
            <datalist id="intake-allergens">{COMMON_ALLERGENS.map((a) => <option key={a} value={a} />)}</datalist>
            <button type="button" className="btn btn-outline btn-sm mt-8" style={{ justifySelf: 'start' }} onClick={() => setReg({ ...reg, allergies: [...reg.allergies, { substance: '', reaction: '', severity: 'Mild' }] })}><Plus size={14} />Add allergy</button>
          </Field>
          <p className="muted tiny">Current medications aren't set here — they're prescribed and recorded by the treating doctor during the consultation.</p>

          {dup && (
            <div className="callout callout-warn">
              <div><b>Possible duplicate:</b> {dup.message}</div>
              <div className="row gap-8 mt-8">
                <button className="btn btn-outline btn-sm" onClick={() => useExisting(dup.existing_patient_id)}>
                  Use {dup.existing_patient_name || 'existing patient'} instead
                </button>
                <button className="btn btn-ghost btn-sm" onClick={() => register(true)}>This is a different person — register anyway</button>
              </div>
            </div>
          )}

          <div className="row gap-8">
            <button className="btn btn-primary" disabled={saving} onClick={() => register(false)}><UserPlus size={15} />{saving ? 'Registering…' : 'Register patient'}</button>
            <button className="btn btn-outline" onClick={() => backToIntake()}>Cancel</button>
          </div>
        </div>
      </section>
    </>
  );
}
