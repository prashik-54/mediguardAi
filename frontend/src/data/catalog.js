// Medication catalog used by the DDI workspace search and patient forms.
// Generic names match the canonical names used by the backend Drug Knowledge Base
// (app/modules/module2_drug.py), so a lookup here maps 1:1 to an API call.
export const CATALOG = [
  { name: 'Metformin', cls: 'Biguanide', brands: ['Glycomet', 'Glucophage'], dose: '500mg' },
  { name: 'Atorvastatin', cls: 'Statin', brands: ['Lipitor', 'Atorva'], dose: '10mg' },
  { name: 'Amlodipine', cls: 'Calcium channel blocker', brands: ['Amlopress', 'Norvasc'], dose: '5mg' },
  { name: 'Omeprazole', cls: 'Proton pump inhibitor', brands: ['Omez', 'Prilosec'], dose: '20mg' },
  { name: 'Pantoprazole', cls: 'Proton pump inhibitor', brands: ['Pan', 'Pantocid'], dose: '40mg' },
  { name: 'Warfarin', cls: 'Anticoagulant', brands: ['Warf', 'Coumadin'], dose: '3mg' },
  { name: 'Amiodarone', cls: 'Antiarrhythmic', brands: ['Cordarone'], dose: '200mg' },
  { name: 'Aspirin', cls: 'Antiplatelet / NSAID', brands: ['Ecosprin', 'Disprin'], dose: '75mg' },
  { name: 'Clopidogrel', cls: 'Antiplatelet', brands: ['Clopilet', 'Plavix'], dose: '75mg' },
  { name: 'Ibuprofen', cls: 'NSAID', brands: ['Brufen', 'Combiflam'], dose: '400mg' },
  { name: 'Losartan', cls: 'ARB', brands: ['Losar', 'Cozaar'], dose: '50mg' },
  { name: 'Telmisartan', cls: 'ARB', brands: ['Telma'], dose: '40mg' },
  { name: 'Spironolactone', cls: 'Potassium-sparing diuretic', brands: ['Aldactone'], dose: '25mg' },
  { name: 'Furosemide', cls: 'Loop diuretic', brands: ['Lasix'], dose: '40mg' },
  { name: 'Sertraline', cls: 'SSRI', brands: ['Zoloft', 'Serta'], dose: '50mg' },
  { name: 'Ciprofloxacin', cls: 'Fluoroquinolone', brands: ['Ciplox'], dose: '500mg' },
  { name: 'Paracetamol', cls: 'Analgesic', brands: ['Crocin', 'Calpol'], dose: '500mg' },
  { name: 'Insulin Glargine', cls: 'Basal insulin', brands: ['Lantus', 'Basalog'], dose: '10 units' },
];

export const FREQUENCIES = ['Once daily', 'Twice daily', 'Three times daily', 'At night', 'As needed'];
export const BLOOD_GROUPS = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];
export const COMMON_CONDITIONS = [
  'Hypertension', 'Type 2 Diabetes', 'Hyperlipidemia', 'GERD', 'Atrial Fibrillation',
  'Coronary Artery Disease', 'Osteoarthritis', 'Depression', 'Heart Failure', 'Chronic Kidney Disease',
];

export const COMMON_ALLERGENS = [
  'Penicillin', 'Sulfa drugs', 'Aspirin', 'Ibuprofen (NSAIDs)', 'Latex', 'Peanuts', 'Iodine / contrast dye', 'Eggs', 'Shellfish',
];

// Short, doctor-editable starting phrases for free-text consultation fields — clicking
// one appends it rather than replacing what's already been typed.
export const DIAGNOSIS_SUGGESTIONS = [
  'Upper respiratory tract infection', 'Hypertension, uncontrolled', 'Type 2 Diabetes Mellitus',
  'Acute gastroenteritis', 'Viral fever', 'Migraine', 'Urinary tract infection', 'Acid reflux (GERD)',
];
export const FINDINGS_SUGGESTIONS = [
  'Afebrile, vitals stable', 'Mild tenderness on palpation', 'Chest clear on auscultation',
  'Throat mildly inflamed', 'No signs of distress', 'BP elevated on repeat measurement',
];
export const FOLLOWUP_SUGGESTIONS = [
  'Review in 7 days', 'Review in 2 weeks', 'Return if symptoms worsen', 'Repeat blood work before next visit',
  'Continue current medications', 'Refer to specialist if no improvement',
];

export function findDrug(name) {
  const q = (name || '').trim().toLowerCase();
  return CATALOG.find((d) => d.name.toLowerCase() === q || d.brands.some((b) => b.toLowerCase() === q));
}
