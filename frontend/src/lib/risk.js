import { findInteraction, SEVERITY_RANK } from '../data/interactions';

/** All interacting pairs inside a medication list (names only). */
export function analyzeMedications(medNames) {
  const results = [];
  for (let i = 0; i < medNames.length; i += 1) {
    for (let j = i + 1; j < medNames.length; j += 1) {
      const hit = findInteraction(medNames[i], medNames[j]);
      if (hit) results.push({ ...hit, a: medNames[i], b: medNames[j], key: `${medNames[i]}|${medNames[j]}` });
    }
  }
  return results.sort((x, y) => SEVERITY_RANK[y.severity] - SEVERITY_RANK[x.severity]);
}

export function kidneyStatus(egfr) {
  if (egfr >= 90) return { label: 'Normal', tone: 'low' };
  if (egfr >= 60) return { label: 'Mildly reduced', tone: 'low' };
  if (egfr >= 45) return { label: 'Moderately reduced', tone: 'moderate' };
  if (egfr >= 30) return { label: 'Moderately–severely reduced', tone: 'high' };
  return { label: 'Severely reduced', tone: 'high' };
}

export function liverStatus(alt) {
  if (alt <= 40) return { label: 'Normal', tone: 'low' };
  if (alt <= 120) return { label: 'Elevated', tone: 'moderate' };
  return { label: 'Markedly elevated', tone: 'high' };
}

/** Patient-specific factors that modify interaction risk (mirrors app/main.py rules). */
export function riskFactors(patient, medCount) {
  if (!patient) return [];
  const n = medCount ?? patient.meds.length;
  const f = [];
  f.push({ id: 'age', label: `Age ${patient.age}`, note: patient.age > 65 ? 'Older adults are more sensitive to adverse drug events' : 'Below the geriatric threshold (65)', flagged: patient.age > 65, weight: 12 });
  const k = kidneyStatus(patient.egfr);
  const kWeight = patient.egfr < 45 ? 18 : patient.egfr < 60 ? 12 : 0;
  f.push({ id: 'kidney', label: `Kidney function (eGFR ${patient.egfr})`, note: patient.egfr < 60 ? 'Impaired clearance raises exposure to renally cleared drugs' : k.label, flagged: patient.egfr < 60, weight: kWeight });
  f.push({ id: 'liver', label: `Liver function (ALT ${patient.alt} U/L)`, note: patient.alt > 50 ? 'Altered hepatic metabolism' : 'Within the normal range', flagged: patient.alt > 50, weight: patient.alt > 50 ? 8 : 0 });
  f.push({ id: 'poly', label: `${n} active medications`, note: n >= 5 ? 'Polypharmacy increases interaction burden' : n >= 4 ? 'Multiple medications — review periodically' : 'Small regimen', flagged: n >= 4, weight: n >= 5 ? 6 : 0 });
  return f;
}

/** 0–100 patient-adjusted risk score with the contribution of each part. */
export function riskScore(patient, interactions, medCount) {
  const top = interactions[0]?.severity || 'None';
  const base = { High: 60, Moderate: 35, Low: 15, None: 0 }[top];
  const extra = interactions.length > 1 ? Math.min(16, (interactions.length - 1) * 8) : 0;
  const factors = riskFactors(patient, medCount).filter((x) => x.flagged && x.weight > 0);
  const factorPts = factors.reduce((s, x) => s + x.weight, 0);
  const score = Math.min(100, base + extra + factorPts);
  const level = score >= 70 ? 'High' : score >= 30 ? 'Medium' : 'Low';
  return { score, level, parts: [
    { label: top === 'None' ? 'No known interactions' : `Highest interaction (${top})`, points: base },
    ...(extra ? [{ label: `${interactions.length} interacting pairs`, points: extra }] : []),
    ...factors.map((x) => ({ label: x.label, points: x.weight })),
  ] };
}

const cache = new WeakMap();
/** Memoised risk summary for a patient object. */
export function patientRisk(patient) {
  if (cache.has(patient) && cache.get(patient).meds === patient.meds) return cache.get(patient).value;
  const interactions = analyzeMedications(patient.meds.map((m) => m.name));
  const value = { ...riskScore(patient, interactions), interactions };
  cache.set(patient, { meds: patient.meds, value });
  return value;
}
