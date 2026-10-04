"""
Module 13: Clinical / Patient Report.

This is the patient-facing finalized report. It remains separate from
prescription and analysis records: `build_patient_view()` serializes an
explicit allow-list plus a separately constructed, patient-safe screening
summary. Raw DDI documents and clinician decisions are never passed through.

Reports are published when the prescription is finalized and are scoped to
the patient's own account by the authenticated `/api/reports/*` routes.
"""
import time
from math import factorial
from typing import Any, Dict, List, Optional

from pydantic import BaseModel

from app.db import get_db, next_id

STATUSES = ("Draft", "Finalized")


class ReportCreate(BaseModel):
    encounter_id: str
    patient_id: str
    doctor_id: str
    prescription_id: Optional[str] = None


class ReportStore:
    def __init__(self):
        self._seq = 0

    @property
    def col(self):
        return get_db()["reports"]

    def _next_id(self) -> str:
        return next_id(self.col, "RPT-", 4)

    def _next_report_number(self) -> str:
        highest = 2040
        for row in self.col.find({}, {"report_number": 1}):
            tail = str(row.get("report_number") or "")[2:]
            if str(row.get("report_number") or "").startswith("R-") and tail.isdigit():
                highest = max(highest, int(tail))
        return f"R-{highest + 1}"

    def create(self, payload: ReportCreate, org_id: str) -> Dict:
        doc = {
            "id": self._next_id(),
            "org_id": org_id,
            "encounter_id": payload.encounter_id,
            "patient_id": payload.patient_id,
            "doctor_id": payload.doctor_id,
            "prescription_id": payload.prescription_id,
            "report_number": self._next_report_number(),
            "status": "Draft",
            "patient_visible": False,
            "created_at": time.time(),
            "finalized_at": None,
        }
        self.col.insert_one(doc)
        return doc

    def get(self, report_id: str) -> Optional[Dict]:
        return self.col.find_one({"id": report_id})

    def list_for_patient(self, patient_id: str, visible_only: bool = True) -> List[Dict]:
        rows = self.col.find({"patient_id": patient_id})
        if visible_only:
            rows = [r for r in rows if r.get("patient_visible")]
        return sorted(rows, key=lambda r: r.get("created_at", 0), reverse=True)

    def get_for_prescription(self, prescription_id: str) -> Optional[Dict]:
        return self.col.find_one({"prescription_id": prescription_id})

    def get_for_encounter(self, encounter_id: str) -> Optional[Dict]:
        return self.col.find_one({"encounter_id": encounter_id})

    def list_for_org(self, org_id: str) -> List[Dict]:
        rows = self.col.find({"org_id": org_id})
        return sorted(rows, key=lambda r: r.get("created_at", 0), reverse=True)

    def finalize(self, report_id: str, patient_visible: bool = True) -> Optional[Dict]:
        if not self.get(report_id):
            return None
        now = time.time()
        self.col.update_one(
            {"id": report_id},
            {"$set": {"status": "Finalized", "patient_visible": patient_visible, "finalized_at": now}},
        )
        return self.get(report_id)


report_store = ReportStore()


def _risk_features(patient: Dict[str, Any], prescription: Dict[str, Any],
                   findings: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    features: List[Dict[str, Any]] = []
    if findings:
        rank = {"low": 1, "moderate": 2, "high": 3}
        highest = max(findings, key=lambda item: rank[item["level"].lower()])
        points = {"Low": 15, "Moderate": 35, "High": 60}[highest["level"]]
        features.append({
            "term": "Highest recorded medicine-pair risk",
            "points": points,
            "reason": f"{len(findings)} known medicine-pair finding(s); highest recorded level is {highest['level']}.",
        })
        extra = min(16, max(0, len(findings) - 1) * 8)
        if extra:
            features.append({
                "term": "Additional medicine-pair findings",
                "points": extra,
                "reason": f"{len(findings) - 1} additional known pair finding(s) increase the screening score.",
            })

    age = patient.get("age")
    if isinstance(age, (int, float)) and age > 65:
        features.append({
            "term": "Age factor",
            "points": 12,
            "reason": f"Age {age} is above the screening rule's 65-year threshold.",
        })

    egfr = patient.get("kidney_function_egfr", patient.get("egfr"))
    if isinstance(egfr, (int, float)) and egfr < 60:
        features.append({
            "term": "Kidney function",
            "points": 18 if egfr < 45 else 12,
            "reason": f"eGFR {egfr} is below 60; reduced kidney function can affect medicine clearance.",
        })

    alt = patient.get("liver_function_alt", patient.get("alt"))
    if isinstance(alt, (int, float)) and alt > 50:
        features.append({
            "term": "Liver function",
            "points": 8,
            "reason": f"ALT {alt} U/L is above the screening rule's 50 U/L threshold.",
        })

    medication_count = len(prescription.get("items") or [])
    if medication_count >= 5:
        features.append({
            "term": "Number of prescribed medicines",
            "points": 6,
            "reason": f"{medication_count} medicines are on this prescription; five or more meets the screening rule's polypharmacy threshold.",
        })
    return features


def _exact_shapley_values(features: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Calculate exact Shapley contributions for the additive, capped report score."""
    count = len(features)
    if not count:
        return []

    denominator = factorial(count)
    output = []
    for index, feature in enumerate(features):
        contribution = 0.0
        for mask in range(1 << count):
            if mask & (1 << index):
                continue
            included = mask.bit_count()
            weight = factorial(included) * factorial(count - included - 1) / denominator
            without = min(100, sum(features[j]["points"] for j in range(count) if mask & (1 << j)))
            with_feature = min(100, without + feature["points"])
            contribution += weight * (with_feature - without)
        output.append({
            "term": feature["term"],
            "contribution": round(contribution, 2),
            "reason": feature["reason"],
        })
    return output


def build_safety_assessment(patient: Dict[str, Any], prescription: Dict[str, Any],
                            analysis: Optional[Dict[str, Any]]) -> Dict[str, Any]:
    """Create the patient-safe screening summary and its exact score attribution."""
    if not analysis:
        return {
            "status": "unavailable",
            "message": "A safety assessment is not available for this report.",
        }

    findings = []
    known_pairs = []
    for pair in analysis.get("pairs") or []:
        model = pair.get("model_prediction") or {}
        if pair.get("interaction_found"):
            level = str(pair.get("severity") or "Low")
            if level.lower() == "moderate/high":
                level = "High"
            if level.lower() not in ("low", "moderate", "high"):
                level = "Low"
            known_pairs.append({
                "medicines": [pair.get("drug_a"), pair.get("drug_b")],
                "level": level.title(),
                "explanation": pair.get("description") or "A known medicine-pair finding was recorded.",
            })
        elif model.get("status") == "scored" and (
            model.get("model_flag") or model.get("is_recorded_in_twosides")
        ):
            findings.append({
                "medicines": [pair.get("drug_a"), pair.get("drug_b")],
                "level": "Model signal",
                "association_percent": round(float(model["probability"]) * 100, 1),
                "explanation": (
                    "This pair is recorded in the TWOSIDES dataset; the association score is "
                    "population-level and is not a patient-specific risk estimate."
                    if model.get("is_recorded_in_twosides") else
                    "Population-level model association only; this is not a patient-specific risk estimate."
                ),
            })

    features = _risk_features(patient, prescription, known_pairs)
    score = min(100, sum(feature["points"] for feature in features))
    level = "High" if score >= 70 else "Medium" if score >= 30 else "Low"
    tone = "high" if level == "High" else "moderate" if level == "Medium" else "low"
    shap_values = _exact_shapley_values(features)
    findings = known_pairs + findings
    return {
        "status": "available",
        "score": score,
        "level": level,
        "tone": tone,
        "findings": findings,
        "explainability": {
            "method": "Exact Shapley (SHAP) values for the rule-based screening score",
            "baseline_score": 0,
            "contributions": shap_values,
        },
        "caveat": "The score is a screening aid, not a probability, diagnosis, or substitute for a clinician's judgment. An unflagged result does not prove a medicine combination is safe.",
    }


# ---------------------------------------------------------------------------
# Safe patient/admin-facing serialization. Only explicitly allowlisted report
# fields and the patient-safe safety assessment can reach these responses.
# ---------------------------------------------------------------------------
def _norm_allergies(raw) -> List[Dict[str, Any]]:
    out = []
    for a in (raw or []):
        if isinstance(a, dict):
            out.append({"substance": a.get("substance") or a.get("name"), "reaction": a.get("reaction"),
                        "severity": a.get("severity")})
        elif a:
            out.append({"substance": a, "reaction": None, "severity": None})
    return out


def build_patient_view(report: Dict[str, Any], hospital: Dict[str, Any], patient: Dict[str, Any],
                        doctor: Dict[str, Any], encounter: Dict[str, Any],
                        prescription: Dict[str, Any], analysis: Optional[Dict[str, Any]] = None,
                        safety_assessment: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    """Assemble the printable/downloadable report from approved fields only.
    Every value is read from a specific, named field on a specific document
    -- nothing is passed through generically, so a DDI analysis document
    could not leak here even if a caller mistakenly supplied one. Includes
    the patient's own clinical profile (conditions/allergies/home meds/labs)
    -- and separately constructed patient-safe alerts and screening summary.
    Raw analysis documents and clinician decisions are never serialized."""
    flagged = set()
    for pr in ((analysis or {}).get("pairs") or []):
        if pr.get("interaction_found") and str(pr.get("severity")).lower() == "high":
            for k in ("drug_a", "drug_b"):
                if pr.get(k):
                    flagged.add(str(pr[k]).strip().lower())
    rx_names = {str(i.get("medicine_name") or "").strip().lower() for i in prescription.get("items", [])}
    flagged_rx = sorted(n for n in flagged if n in rx_names)
    high_risk_alerts = {
        "medicines": [i.get("medicine_name") for i in prescription.get("items", [])
                      if str(i.get("medicine_name") or "").strip().lower() in flagged_rx],
        "doctor_instruction": prescription.get("clinical_instructions")
        or "Take these medicines exactly as prescribed and contact your doctor if you notice unusual symptoms.",
    } if flagged_rx else None
    return {
        "high_risk_alerts": high_risk_alerts,
        "report_number": report.get("report_number"),
        "status": report.get("status"),
        "generated_at": report.get("finalized_at") or report.get("created_at"),
        "id": report.get("id"),
        "patient_visible": bool(report.get("patient_visible")),
        "hospital": {
            "name": hospital.get("name"),
            "address": hospital.get("address"),
            "phone": hospital.get("phone"),
            "email": hospital.get("email"),
        },
        "patient": {
            "id": patient.get("id"),
            "name": patient.get("name"),
            "age": patient.get("age"),
            "gender": patient.get("gender"),
            "dob": patient.get("dob"),
            "phone": patient.get("phone"),
            "email": patient.get("email"),
            "blood_group": patient.get("bloodGroup") or patient.get("blood_group"),
            "height_cm": patient.get("height"),
            "weight_kg": patient.get("weight"),
        },
        "clinical_profile": {
            "conditions": list(patient.get("existing_diseases") or patient.get("conditions") or []),
            "allergies": _norm_allergies(patient.get("allergies") or patient.get("allergy_history")),
            "current_medications": list(patient.get("active_medications") or []),
            "egfr": patient.get("kidney_function_egfr") or patient.get("egfr"),
            "creatinine": patient.get("creatinine"),
            "alt": patient.get("liver_function_alt") or patient.get("alt"),
            "ast": patient.get("ast"),
        },
        "doctor": {
            "id": doctor.get("id"),
            "name": doctor.get("name"),
            "specialization": doctor.get("specialization"),
        },
        "visit": {
            "diagnosis": encounter.get("diagnosis"),
            "assessment": encounter.get("assessment"),
            "clinical_findings": encounter.get("clinical_findings"),
            "follow_up": encounter.get("follow_up"),
            "date": encounter.get("started_at"),
        },
        "prescription": {
            "id": prescription.get("id"),
            "version": prescription.get("version"),
            "clinical_instructions": prescription.get("clinical_instructions"),
        },
        "medicines": [
            {
                "name": item.get("medicine_name"),
                "dose": item.get("dose"),
                "unit": item.get("unit"),
                "frequency": item.get("frequency"),
                "timing": item.get("timing"),
                "duration": item.get("duration"),
                "route": item.get("route"),
                "instructions": item.get("instructions"),
                "quantity": item.get("quantity"),
                "high_risk_flag": str(item.get("medicine_name") or "").strip().lower() in flagged_rx,
            }
            for item in prescription.get("items", [])
        ],
        "safety_assessment": safety_assessment or {
            "status": "unavailable",
            "message": "A safety assessment is not available for this report.",
        },
    }
