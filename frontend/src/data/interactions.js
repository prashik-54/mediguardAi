// Curated demo interaction knowledge. Severity, mechanism, clinical impact and
// recommendation text feed the "explainable" panels. When the FastAPI backend is
// reachable, its baseline lookup (Module 2) is merged on top — see lib/api.js.
// NOTE: illustrative content for a decision-support prototype, not clinical guidance.
export const INTERACTIONS = [
  {
    a: 'Metformin', b: 'Omeprazole', severity: 'High', type: 'Pharmacokinetic', confidence: 91,
    mechanism: 'Omeprazole may increase the serum concentration of Metformin by reducing its renal clearance.',
    effects: ['Increased risk of lactic acidosis', 'Higher exposure in patients with reduced kidney function'],
    recommendation: 'Consider an alternative acid-suppression therapy, or monitor renal function and lactate closely.',
    evidence: 'Cohort study, n = 4,120 · DrugBank / CDSCO cross-reference',
  },
  {
    a: 'Atorvastatin', b: 'Amlodipine', severity: 'Moderate', type: 'Pharmacokinetic', confidence: 78,
    mechanism: 'Amlodipine weakly inhibits CYP3A4, which can raise atorvastatin exposure.',
    effects: ['Increased statin exposure', 'Possible myalgia at higher statin doses'],
    recommendation: 'Keep atorvastatin at the lowest effective dose and ask the patient to report muscle pain.',
    evidence: 'Pharmacokinetic study, n = 32 · Moderate confidence',
  },
  {
    a: 'Warfarin', b: 'Amiodarone', severity: 'High', type: 'Pharmacokinetic', confidence: 96,
    mechanism: 'Amiodarone inhibits CYP2C9 and CYP3A4, reducing the metabolic clearance of warfarin.',
    effects: ['Markedly raised INR', 'Major bleeding risk in the first weeks of co-administration'],
    recommendation: 'Reduce the warfarin dose by 30–50% on initiation and check INR twice weekly for four weeks.',
    evidence: 'Randomised trial, n = 860 · High confidence',
  },
  {
    a: 'Warfarin', b: 'Aspirin', severity: 'High', type: 'Pharmacodynamic', confidence: 94,
    mechanism: 'Aspirin adds antiplatelet activity and gastric mucosal injury on top of warfarin anticoagulation.',
    effects: ['Major gastrointestinal bleeding', 'Systemic haemorrhage risk'],
    recommendation: 'Avoid the combination unless clearly indicated; add gastroprotection and monitor INR and haemoglobin.',
    evidence: 'Meta-analysis, 9 studies · High confidence',
  },
  {
    a: 'Aspirin', b: 'Ibuprofen', severity: 'High', type: 'Pharmacodynamic', confidence: 88,
    mechanism: 'Ibuprofen competes for the COX-1 site, blunting aspirin\u2019s antiplatelet effect while adding GI toxicity.',
    effects: ['Increased GI bleeding', 'Reduced cardioprotection from low-dose aspirin'],
    recommendation: 'Separate dosing (aspirin at least 30 minutes before ibuprofen) or switch to paracetamol for pain.',
    evidence: 'Pharmacodynamic study + label warnings · Well established',
  },
  {
    a: 'Aspirin', b: 'Clopidogrel', severity: 'Moderate', type: 'Pharmacodynamic', confidence: 85,
    mechanism: 'Dual antiplatelet effect through COX-1 and P2Y12 inhibition.',
    effects: ['Additive bleeding risk with prolonged dual therapy'],
    recommendation: 'Add a PPI for gastroprotection and reassess the planned duration of dual therapy each visit.',
    evidence: 'Meta-analysis, 12 studies · Well established',
  },
  {
    a: 'Clopidogrel', b: 'Omeprazole', severity: 'Moderate', type: 'Pharmacokinetic', confidence: 82,
    mechanism: 'Omeprazole inhibits CYP2C19, which converts clopidogrel to its active metabolite.',
    effects: ['Reduced antiplatelet efficacy', 'Higher risk of stent thrombosis in high-risk patients'],
    recommendation: 'Prefer pantoprazole when a PPI is needed alongside clopidogrel.',
    evidence: 'Registry data + regulatory advisory · Moderate confidence',
  },
  {
    a: 'Pantoprazole', b: 'Clopidogrel', severity: 'Moderate', type: 'Pharmacokinetic', confidence: 64,
    mechanism: 'Proton pump inhibitors can decrease hepatic activation of clopidogrel; pantoprazole has the weakest effect.',
    effects: ['Small reduction in antiplatelet response'],
    recommendation: 'Acceptable when gastroprotection is required; monitor for clinical events.',
    evidence: 'Observational data · Low\u2013moderate confidence',
  },
  {
    a: 'Metformin', b: 'Ciprofloxacin', severity: 'Moderate', type: 'Pharmacodynamic', confidence: 73,
    mechanism: 'Fluoroquinolones can disturb glucose homeostasis and enhance the glucose-lowering effect of metformin.',
    effects: ['Hypoglycaemia', 'Occasional hyperglycaemia'],
    recommendation: 'Monitor blood glucose during the antibiotic course and counsel the patient on symptoms.',
    evidence: 'Case series + label warnings · Moderate confidence',
  },
  {
    a: 'Telmisartan', b: 'Spironolactone', severity: 'High', type: 'Pharmacodynamic', confidence: 90,
    mechanism: 'ARBs reduce aldosterone-driven potassium excretion, and spironolactone blocks it further.',
    effects: ['Hyperkalaemia', 'Cardiac arrhythmia risk, especially with reduced eGFR'],
    recommendation: 'Check potassium and creatinine within one week of starting and after each dose change.',
    evidence: 'Randomised trials + registry · High confidence',
  },
  {
    a: 'Losartan', b: 'Ibuprofen', severity: 'Moderate', type: 'Pharmacodynamic', confidence: 80,
    mechanism: 'NSAIDs reduce renal prostaglandins and blunt the effect of ARBs on glomerular pressure.',
    effects: ['Acute kidney injury risk', 'Reduced blood-pressure control'],
    recommendation: 'Avoid regular NSAID use; if unavoidable use the lowest dose for the shortest time and check renal function.',
    evidence: 'Cohort study, n = 12,000 · Well established',
  },
  {
    a: 'Sertraline', b: 'Ibuprofen', severity: 'Moderate', type: 'Pharmacodynamic', confidence: 76,
    mechanism: 'SSRIs deplete platelet serotonin while NSAIDs impair platelet function and irritate the gastric lining.',
    effects: ['Increased upper GI bleeding risk'],
    recommendation: 'Consider paracetamol instead, or add gastroprotection if the NSAID is needed.',
    evidence: 'Meta-analysis, 6 studies · Moderate confidence',
  },
  {
    a: 'Losartan', b: 'Furosemide', severity: 'Low', type: 'Pharmacodynamic', confidence: 58,
    mechanism: 'Combined effect may potentiate hypotension and mild electrolyte shifts.',
    effects: ['Occasional dizziness on standing'],
    recommendation: 'Advise slow postural changes and recheck electrolytes at the next routine visit.',
    evidence: 'Observational registry · Low confidence',
  },
];

const key = (a, b) => [a, b].map((s) => s.toLowerCase()).sort().join('|');
const INDEX = new Map(INTERACTIONS.map((i) => [key(i.a, i.b), i]));

export function findInteraction(a, b) {
  return INDEX.get(key(a, b)) || null;
}

export const SEVERITY_RANK = { High: 3, Moderate: 2, Low: 1, None: 0 };
