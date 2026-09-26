"""
Module 9: Encounter / Consultation.

Created once a doctor opens an assigned appointment (target workflow
Step 4). Holds the doctor's notes, findings, diagnosis and assessment for
that visit, and is the object a Prescription (module10) links back to.

Domain/data layer only -- see module8_appointments.py's module docstring
for why no route is added here yet.
"""
import time
from typing import Dict, List, Optional

from pydantic import BaseModel

from app.db import get_db, next_id

STATUSES = ("In Progress", "Completed")


# ------------------------------------------------------------------ schemas
class EncounterCreate(BaseModel):
    appointment_id: str
    patient_id: str
    doctor_id: str


class EncounterUpdate(BaseModel):
    notes: Optional[str] = None
    clinical_findings: Optional[str] = None
    diagnosis: Optional[str] = None
    assessment: Optional[str] = None
    follow_up: Optional[str] = None


# ------------------------------------------------------------------- store
class EncounterStore:
    def __init__(self):
        self._seq = 0

    @property
    def col(self):
        return get_db()["encounters"]

    def _next_id(self) -> str:
        return next_id(self.col, "ENC-", 4)

    def create(self, payload: EncounterCreate, org_id: str) -> Dict:
        doc = {
            "id": self._next_id(),
            "org_id": org_id,
            "appointment_id": payload.appointment_id,
            "patient_id": payload.patient_id,
            "doctor_id": payload.doctor_id,
            "notes": "",
            "clinical_findings": "",
            "diagnosis": "",
            "assessment": "",
            "follow_up": "",
            "status": "In Progress",
            "started_at": time.time(),
            "completed_at": None,
            "created_at": time.time(),
            "updated_at": time.time(),
        }
        self.col.insert_one(doc)
        return doc

    def get(self, encounter_id: str) -> Optional[Dict]:
        return self.col.find_one({"id": encounter_id})

    def get_for_appointment(self, appointment_id: str) -> Optional[Dict]:
        return self.col.find_one({"appointment_id": appointment_id})

    def list_for_doctor(self, doctor_id: str, org_id: Optional[str] = None) -> List[Dict]:
        query: Dict = {"doctor_id": doctor_id}
        if org_id:
            query["org_id"] = org_id
        rows = self.col.find(query)
        return sorted(rows, key=lambda e: e.get("created_at", 0), reverse=True)

    def list_for_patient(self, patient_id: str) -> List[Dict]:
        rows = self.col.find({"patient_id": patient_id})
        return sorted(rows, key=lambda e: e.get("created_at", 0), reverse=True)

    def update(self, encounter_id: str, patch: EncounterUpdate) -> Optional[Dict]:
        if not self.get(encounter_id):
            return None
        clean = {k: v for k, v in patch.model_dump(exclude_none=True).items()}
        clean["updated_at"] = time.time()
        self.col.update_one({"id": encounter_id}, {"$set": clean})
        return self.get(encounter_id)

    def complete(self, encounter_id: str) -> Optional[Dict]:
        if not self.get(encounter_id):
            return None
        now = time.time()
        self.col.update_one({"id": encounter_id}, {"$set": {"status": "Completed", "completed_at": now, "updated_at": now}})
        return self.get(encounter_id)


encounter_store = EncounterStore()
