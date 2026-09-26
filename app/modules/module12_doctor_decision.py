"""
Module 12: Doctor Decision.

Records what the doctor actually chose after reviewing a DDI Analysis
(target workflow Step 7). CLAUDE.md Rule 9 and Rule 10 both apply directly
to how this record must be used later: the platform must never invent a
result or a "safer alternative" and silently apply it -- this store only
persists the doctor's own explicit choice.

Domain/data layer only -- see module8_appointments.py's module docstring
for why no route is added here yet.
"""
import time
from typing import Dict, List, Optional

from pydantic import BaseModel

from app.db import get_db, next_id

DECISIONS = ("Proceed", "Revise Prescription", "Escalate to Pharmacist")


class DoctorDecisionCreate(BaseModel):
    encounter_id: str
    prescription_id: str
    doctor_id: str
    analysis_id: str
    decision: str
    selected_alternatives: List[str] = []
    reason: Optional[str] = ""


class DoctorDecisionStore:
    def __init__(self):
        self._seq = 0

    @property
    def col(self):
        return get_db()["doctor_decisions"]

    def _next_id(self) -> str:
        return next_id(self.col, "DEC-", 4)

    def create(self, payload: DoctorDecisionCreate, org_id: str) -> Dict:
        if payload.decision not in DECISIONS:
            raise ValueError(f"decision must be one of {', '.join(DECISIONS)}")
        doc = {
            "id": self._next_id(),
            "org_id": org_id,
            "encounter_id": payload.encounter_id,
            "prescription_id": payload.prescription_id,
            "doctor_id": payload.doctor_id,
            "analysis_id": payload.analysis_id,
            "decision": payload.decision,
            "selected_alternatives": payload.selected_alternatives,
            "reason": payload.reason or "",
            "created_at": time.time(),
        }
        self.col.insert_one(doc)
        return doc

    def get(self, decision_id: str) -> Optional[Dict]:
        return self.col.find_one({"id": decision_id})

    def list_for_prescription(self, prescription_id: str) -> List[Dict]:
        rows = self.col.find({"prescription_id": prescription_id})
        return sorted(rows, key=lambda d: d.get("created_at", 0), reverse=True)


doctor_decision_store = DoctorDecisionStore()
