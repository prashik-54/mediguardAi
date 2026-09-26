"""
Module 13: Clinical / Patient Report.

This is the object the Hospital Administrator prints/downloads and hands to
the patient (target workflow Step 8), and the only thing the patient (Step
10) or hospital admin is ever allowed to see for a visit. It is a separate
record from the Prescription and the DDI Analysis on purpose.

`build_patient_view()` is the enforcement point for CLAUDE.md Rule 8 ("DDI
is not the patient report") and the domain-model note: "Do not simply
serialize the prescription + DDI document together." It takes the
underlying encounter/prescription/report documents and returns only an
explicit allow-list of fields -- there is no code path in this function
that can leak a DDI/interaction field, because DDI documents are never
passed into it at all.

Phase 8: wired into the authenticated `/api/reports/*` routes in main.py.
"""
import time
from typing import Any, Dict, List, Optional

from pydantic import BaseModel

from app.db import get_db, next_id

STATUSES = ("Draft", "Finalized")


class ReportCreate(BaseModel):
    encounter_id: str
    patient_id: str
    doctor_id: str
    prescription_id: str


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


# ---------------------------------------------------------------------------
# Safe patient/admin-facing serialization. This function is the enforcement
# boundary: only fields explicitly listed here can ever reach a patient or
# hospital-admin response. No DDI/interaction/severity field name appears
# anywhere below.
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
                        prescription: Dict[str, Any]) -> Dict[str, Any]:
    """Assemble the printable/downloadable report from approved fields only.
    Every value is read from a specific, named field on a specific document
    -- nothing is passed through generically, so a DDI analysis document
    could not leak here even if a caller mistakenly supplied one. Includes
    the patient's own clinical profile (conditions/allergies/home meds/labs)
    -- this is the patient's own record, not a DDI/interaction finding, so
    Rule 8 (no DDI in the patient report) is unaffected."""
    return {
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
            "notes": encounter.get("notes"),
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
            }
            for item in prescription.get("items", [])
        ],
    }
