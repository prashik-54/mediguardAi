import { daysAgo, fmtDate } from '../lib/format';
import { findDrug } from './catalog';

// ---------------------------------------------------------------------------
// Demo patient registry. Eight hand-written patients (matching the reference
// designs) plus a deterministic generated cohort so search, filters and
// pagination behave like a real 248-patient database.
// Field names for clinical values mirror the backend PatientClinicalProfile:
// kidney_function_egfr → egfr, liver_function_alt → alt.
// ---------------------------------------------------------------------------

const med = (name, dose, freq, indication, sinceDays = 200) => ({ name, dose: dose ?? findDrug(name)?.dose ?? '', freq, indication, since: fmtDate(daysAgo(sinceDays)) });
const allergy = (substance, reaction, severity) => ({ substance, reaction, severity });
const ev = (days, text) => ({ date: fmtDate(daysAgo(days)), text });

const NAMED = [
  {
    name: 'John Doe', age: 45, gender: 'Male', dob: '1980-06-12', phone: '+91 98765 43210', email: 'john.doe@example.com', city: 'Pune',
    height: 175, weight: 72, bloodGroup: 'O+', egfr: 92, creatinine: 1.1, alt: 28, ast: 24,
    conditions: ['Hypertension', 'Type 2 Diabetes'], allergies: [allergy('Penicillin', 'Skin rash', 'Moderate')],
    emergency: { name: 'Jane Doe', relation: 'Spouse', phone: '+91 98765 43211' },
    meds: [med('Metformin', '500mg', 'Twice daily', 'Type 2 Diabetes', 420), med('Atorvastatin', '10mg', 'Once daily', 'Cholesterol', 380), med('Amlodipine', '5mg', 'Once daily', 'Hypertension', 250), med('Omeprazole', '20mg', 'Once daily', 'Acid reflux', 30)],
    history: [ev(2, 'DDI analysis run — 2 interactions found'), ev(30, 'Omeprazole 20mg added for acid reflux'), ev(250, 'Amlodipine 5mg prescribed'), ev(420, 'Diagnosed with Type 2 Diabetes')],
    status: 'Active', lastVisitDays: 2,
  },
  {
    name: 'Emily Carter', age: 62, gender: 'Female', dob: '1963-11-02', phone: '+91 98221 10234', email: 'emily.carter@example.com', city: 'Mumbai',
    height: 162, weight: 68, bloodGroup: 'A+', egfr: 58, creatinine: 1.6, alt: 41, ast: 38,
    conditions: ['Atrial Fibrillation', 'Chronic Kidney Disease'], allergies: [allergy('Sulfa drugs', 'Hives', 'Moderate'), allergy('Latex', 'Contact dermatitis', 'Mild')],
    emergency: { name: 'Robert Carter', relation: 'Son', phone: '+91 98221 10235' },
    meds: [med('Warfarin', '3mg', 'Once daily', 'Atrial Fibrillation', 500), med('Amiodarone', '200mg', 'Once daily', 'Atrial Fibrillation', 90), med('Furosemide', '20mg', 'Once daily', 'Fluid retention', 300), med('Losartan', '25mg', 'Once daily', 'Blood pressure', 300)],
    history: [ev(1, 'High-severity interaction flagged: Warfarin + Amiodarone'), ev(24, 'INR check — 3.8 (elevated)'), ev(90, 'Amiodarone 200mg started'), ev(120, 'Hospitalised — AF exacerbation')],
    status: 'Active', lastVisitDays: 1,
  },
  {
    name: 'Michael Brown', age: 38, gender: 'Male', dob: '1987-02-19', phone: '+91 90210 55678', email: 'michael.brown@example.com', city: 'Nagpur',
    height: 180, weight: 84, bloodGroup: 'B+', egfr: 108, creatinine: 0.9, alt: 22, ast: 20,
    conditions: ['GERD', 'Pre-diabetes'], allergies: [],
    emergency: { name: 'Sara Brown', relation: 'Spouse', phone: '+91 90210 55679' },
    meds: [med('Omeprazole', '20mg', 'Once daily', 'GERD', 120), med('Metformin', '500mg', 'Twice daily', 'Pre-diabetes', 150)],
    history: [ev(3, 'Moderate interaction flagged: Metformin + Omeprazole'), ev(120, 'Omeprazole 20mg started')],
    status: 'Active', lastVisitDays: 3,
  },
  {
    name: 'Sarah Johnson', age: 72, gender: 'Female', dob: '1953-08-30', phone: '+91 97865 12309', email: 'sarah.johnson@example.com', city: 'Pune',
    height: 158, weight: 60, bloodGroup: 'AB+', egfr: 42, creatinine: 1.8, alt: 33, ast: 30,
    conditions: ['Osteoarthritis', 'Hypertension', 'Depression'], allergies: [allergy('Aspirin', 'Bronchospasm', 'Severe')],
    emergency: { name: 'Tom Johnson', relation: 'Son', phone: '+91 97865 12310' },
    meds: [med('Losartan', '50mg', 'Once daily', 'Hypertension', 700), med('Ibuprofen', '400mg', 'As needed', 'Joint pain', 260), med('Sertraline', '50mg', 'Once daily', 'Depression', 340)],
    history: [ev(5, 'Placed on watchlist — declining renal function'), ev(50, 'Losartan increased to 50mg')],
    status: 'Watchlist', lastVisitDays: 5,
  },
  {
    name: 'David Wilson', age: 55, gender: 'Male', dob: '1970-04-08', phone: '+91 91234 65432', email: 'david.wilson@example.com', city: 'Nashik',
    height: 177, weight: 79, bloodGroup: 'O-', egfr: 98, creatinine: 1.0, alt: 26, ast: 24,
    conditions: ['Type 2 Diabetes'], allergies: [],
    emergency: { name: 'Nina Wilson', relation: 'Spouse', phone: '+91 91234 65433' },
    meds: [med('Metformin', '1000mg', 'Twice daily', 'Type 2 Diabetes', 900), med('Aspirin', '75mg', 'Once daily', 'Cardio-protection', 400)],
    history: [ev(7, 'Routine analysis — no interactions found')],
    status: 'Active', lastVisitDays: 7,
  },
  {
    name: 'Priya Nair', age: 29, gender: 'Female', dob: '1996-12-21', phone: '+91 99876 54321', email: 'priya.nair@example.com', city: 'Kochi',
    height: 164, weight: 58, bloodGroup: 'B-', egfr: 118, creatinine: 0.7, alt: 18, ast: 19,
    conditions: ['Migraine'], allergies: [allergy('Codeine', 'Nausea and vomiting', 'Mild')],
    emergency: { name: 'Arjun Nair', relation: 'Brother', phone: '+91 99876 54322' },
    meds: [med('Paracetamol', '500mg', 'As needed', 'Migraine', 60)],
    history: [ev(0, 'DDI analysis completed — no interactions')],
    status: 'Active', lastVisitDays: 0,
  },
  {
    name: 'Rajesh Kumar', age: 67, gender: 'Male', dob: '1958-09-14', phone: '+91 98111 22334', email: 'rajesh.kumar@example.com', city: 'Delhi',
    height: 170, weight: 76, bloodGroup: 'A-', egfr: 52, creatinine: 1.7, alt: 36, ast: 34,
    conditions: ['Coronary Artery Disease', 'Type 2 Diabetes'], allergies: [allergy('Iodine contrast', 'Rash', 'Moderate')],
    emergency: { name: 'Meena Kumar', relation: 'Wife', phone: '+91 98111 22335' },
    meds: [med('Warfarin', '5mg', 'Once daily', 'Post-stent', 210), med('Amiodarone', '100mg', 'Once daily', 'Arrhythmia', 60), med('Aspirin', '75mg', 'Once daily', 'Cardio-protection', 210)],
    history: [ev(0, 'High-severity interaction under pharmacist review: Warfarin + Amiodarone'), ev(60, 'Amiodarone 100mg started'), ev(210, 'Coronary stent placed')],
    status: 'Active', lastVisitDays: 0,
  },
  {
    name: 'Sheba Patel', age: 34, gender: 'Female', dob: '1991-05-27', phone: '+91 90000 11223', email: 'sheba.patel@example.com', city: 'Ahmedabad',
    height: 160, weight: 55, bloodGroup: 'O+', egfr: 115, creatinine: 0.8, alt: 20, ast: 21,
    conditions: ['Anxiety'], allergies: [],
    emergency: { name: 'Amit Patel', relation: 'Husband', phone: '+91 90000 11224' },
    meds: [med('Sertraline', '25mg', 'Once daily', 'Anxiety', 100), med('Ibuprofen', '200mg', 'As needed', 'Headache', 4)],
    history: [ev(0, 'Medication list updated — Ibuprofen added')],
    status: 'Active', lastVisitDays: 0,
  },
];

// ---- Deterministic generated cohort ----------------------------------------
function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s += 0x6d2b79f5;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const FIRST = ['Aarav', 'Vivaan', 'Aditya', 'Arjun', 'Rohan', 'Kabir', 'Ishaan', 'Karan', 'Manish', 'Suresh', 'Anil', 'Vikram', 'Neha', 'Anjali', 'Kavya', 'Meera', 'Pooja', 'Ritu', 'Sneha', 'Divya', 'Sunita', 'Lakshmi', 'Farah', 'Zoya', 'Imran', 'Harpreet', 'Gurmeet', 'Tanvi', 'Nikhil', 'Sanjay'];
const LAST = ['Sharma', 'Verma', 'Iyer', 'Menon', 'Reddy', 'Kulkarni', 'Deshmukh', 'Joshi', 'Gupta', 'Singh', 'Khan', 'Mehta', 'Shah', 'Bose', 'Das', 'Pillai', 'Rao', 'Patil', 'Chopra', 'Malhotra'];
const CITIES = ['Nagpur', 'Pune', 'Mumbai', 'Hyderabad', 'Bengaluru', 'Chennai', 'Kolkata', 'Jaipur', 'Indore', 'Lucknow'];
const BG = ['A+', 'A-', 'B+', 'B-', 'AB+', 'O+', 'O-', 'O+', 'B+', 'A+'];

// condition → candidate drugs (name, dose, frequency)
const PLAN = {
  Hypertension: [['Amlodipine', '5mg', 'Once daily'], ['Losartan', '50mg', 'Once daily'], ['Telmisartan', '40mg', 'Once daily']],
  'Type 2 Diabetes': [['Metformin', '500mg', 'Twice daily']],
  Hyperlipidemia: [['Atorvastatin', '10mg', 'Once daily']],
  GERD: [['Omeprazole', '20mg', 'Once daily'], ['Pantoprazole', '40mg', 'Once daily']],
  'Atrial Fibrillation': [['Warfarin', '3mg', 'Once daily'], ['Amiodarone', '200mg', 'Once daily']],
  'Coronary Artery Disease': [['Aspirin', '75mg', 'Once daily'], ['Clopidogrel', '75mg', 'Once daily']],
  Osteoarthritis: [['Ibuprofen', '400mg', 'As needed'], ['Paracetamol', '500mg', 'As needed']],
  Depression: [['Sertraline', '50mg', 'Once daily']],
  'Heart Failure': [['Furosemide', '40mg', 'Once daily'], ['Spironolactone', '25mg', 'Once daily']],
};
const CONDITION_POOL = ['Hypertension', 'Hypertension', 'Type 2 Diabetes', 'Type 2 Diabetes', 'Hyperlipidemia', 'GERD', 'Osteoarthritis', 'Depression', 'Coronary Artery Disease', 'Heart Failure', 'Atrial Fibrillation'];

function generate(index, r) {
  const pick = (arr) => arr[Math.floor(r() * arr.length)];
  const gender = r() < 0.5 ? 'Male' : 'Female';
  const name = `${pick(FIRST)} ${pick(LAST)}`;
  const age = 22 + Math.floor(r() * 62);
  const height = gender === 'Male' ? 162 + Math.floor(r() * 24) : 150 + Math.floor(r() * 22);
  const weight = Math.round((height - 100) * (0.85 + r() * 0.4));
  const egfrBase = age > 65 ? 45 + r() * 45 : 70 + r() * 50;
  const nCond = 1 + Math.floor(r() * 3);
  const conditions = [];
  while (conditions.length < nCond) { const c = pick(CONDITION_POOL); if (!conditions.includes(c)) conditions.push(c); }
  const meds = [];
  conditions.forEach((c) => {
    const opts = PLAN[c] || [];
    if (!opts.length) return;
    const chosen = c === 'Atrial Fibrillation' ? (r() < 0.6 ? [opts[0]] : opts) : [pick(opts)];
    chosen.forEach(([n, d, f]) => { if (!meds.find((m) => m.name === n)) meds.push(med(n, d, f, c, 30 + Math.floor(r() * 600))); });
  });
  const roll = r();
  const status = roll < 0.86 ? 'Active' : roll < 0.93 ? 'Inactive' : 'Watchlist';
  const lastVisitDays = status === 'Inactive' ? 60 + Math.floor(r() * 200) : Math.floor(r() * 30);
  const slug = name.toLowerCase().replace(/\s+/g, '.');
  return {
    name, age, gender, dob: `${2026 - age}-0${1 + Math.floor(r() * 9)}-${10 + Math.floor(r() * 18)}`,
    phone: `+91 9${Math.floor(1000 + r() * 8999)} ${Math.floor(10000 + r() * 89999)}`, email: `${slug}${index}@example.com`, city: pick(CITIES),
    height, weight, bloodGroup: pick(BG), egfr: Math.round(egfrBase), creatinine: Math.round((0.6 + (120 - egfrBase) / 70) * 10) / 10,
    alt: Math.round(16 + r() * (r() < 0.06 ? 90 : 26)), ast: Math.round(15 + r() * 25),
    conditions, allergies: r() < 0.25 ? [allergy(pick(['Penicillin', 'Sulfa drugs', 'NSAIDs', 'Latex']), pick(['Rash', 'Hives', 'Itching']), pick(['Mild', 'Moderate']))] : [],
    emergency: { name: `${pick(FIRST)} ${pick(LAST)}`, relation: pick(['Spouse', 'Son', 'Daughter', 'Sibling']), phone: `+91 9${Math.floor(1000 + r() * 8999)} ${Math.floor(10000 + r() * 89999)}` },
    meds,
    history: [ev(lastVisitDays, 'Clinic visit — medication list reviewed'), ev(lastVisitDays + 120, 'Patient registered')],
    status, lastVisitDays,
  };
}

export function buildPatients() {
  const r = rng(20260920);
  const generated = Array.from({ length: 240 }, (_, i) => generate(i + 9, r));
  return [...NAMED, ...generated].map((p, i) => ({ ...p, id: `P-${String(i + 1).padStart(3, '0')}`, registeredDays: p.lastVisitDays + 120 }));
}
