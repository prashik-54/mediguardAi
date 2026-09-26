"""
Module 11: DDI Analysis (encounter/prescription-linked).

`app/modules/module7_analyses.py` already records every raw call to the
Module 1-4 pipeline (`/api/pipeline/process-and-fuse`) for the existing DDI
workspace, and CLAUDE.md Rule 3 says preserve that -- it is left untouched.

This module adds the *target-workflow-shaped* record from CLAUDE.md's
domain model: a DDI Analysis tied to a specific encounter/prescription (not
just a bare patient_id + drug pair), which is what Phase 5-7's doctor
decision workflow will read from and what a Doctor Decision (module12)
references by `analysis_id`. It intentionally never appears in any
patient-facing serialization -- see module13_reports.py.

Domain/data layer only -- see module8_appointments.py's module docstring
for why no route is added here yet.
"""
import time
from typing import Any, Dict, List, Optional

from pydantic import BaseModel

from app.db import get_db, next_id


class DDIAnalysisCreate(BaseModel):
    encounter_id: str
    prescription_id: str
    patient_id: str
    doctor_id: str
    pairs: List[Dict[str, Any]] = []       # one entry per drug-pair result
    overall_severity: str = "Low"          # Low | Moderate | High
    patient_factors: List[str] = []
    engine_version: str = "modules-1-4"
    source: str = "Baseline DDI ground truth + patient factor rules"


class DDIAnalysisStore:
    def __init__(self):
        self._seq = 0

    @property
    def col(self):
        return get_db()["ddi_analyses"]

    def _next_id(self) -> str:
        return next_id(self.col, "DA-", 5)

    def record(self, payload: DDIAnalysisCreate, org_id: str) -> Dict:
        doc = {
            "id": self._next_id(),
            "org_id": org_id,
            "encounter_id": payload.encounter_id,
            "prescription_id": payload.prescription_id,
            "patient_id": payload.patient_id,
            "doctor_id": payload.doctor_id,
            "pairs": payload.pairs,
            "overall_severity": payload.overall_severity,
            "patient_factors": payload.patient_factors,
            "engine_version": payload.engine_version,
            "source": payload.source,
            "created_at": time.time(),
        }
        self.col.insert_one(doc)
        return doc

    def get(self, analysis_id: str) -> Optional[Dict]:
        return self.col.find_one({"id": analysis_id})

    def list_for_prescription(self, prescription_id: str) -> List[Dict]:
        rows = self.col.find({"prescription_id": prescription_id})
        return sorted(rows, key=lambda a: a.get("created_at", 0), reverse=True)

    def list_for_encounter(self, encounter_id: str) -> List[Dict]:
        rows = self.col.find({"encounter_id": encounter_id})
        return sorted(rows, key=lambda a: a.get("created_at", 0), reverse=True)

    def latest_for_prescription(self, prescription_id: str) -> Optional[Dict]:
        rows = self.list_for_prescription(prescription_id)
        return rows[0] if rows else None


ddi_analysis_store = DDIAnalysisStore()
