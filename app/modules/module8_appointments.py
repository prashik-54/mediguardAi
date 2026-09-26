"""
Module 8: Appointment / Visit.

The hospital administrator creates one of these after finding/registering a
patient and picking a doctor + time (target workflow Step 3). It is the
object a doctor's "assigned patients" queue is built from (Step 4).

This module only builds the domain/data layer (schema + store). It is not
wired into any FastAPI route yet -- the Hospital Administrator intake UI and
its authenticated endpoints are Phase 3's job. Kept deliberately small per
CLAUDE.md Rule 13 (small, purposeful APIs) and Rule 14 (service layer, thin
routes later).
"""
import time
from typing import Dict, List, Optional

from pydantic import BaseModel, Field

from app.db import get_db, next_id

STATUSES = ("Scheduled", "Checked In", "In Consultation", "Completed", "Cancelled", "No Show")
OPEN_STATUSES = ("Scheduled", "Checked In", "In Consultation")


# ------------------------------------------------------------------ schemas
class AppointmentCreate(BaseModel):
    """Payload a hospital administrator submits to assign a doctor + slot
    to a patient. `org_id` and `created_by` are set server-side from the
    authenticated caller, never trusted from the client."""
    patient_id: str
    doctor_id: str
    reason: str = Field(..., min_length=2)
    appointment_date: str          # "YYYY-MM-DD"
    appointment_time: Optional[str] = None  # "HH:MM"; queue-only visits may omit this


class AppointmentStatusUpdate(BaseModel):
    status: str


# ------------------------------------------------------------------- store
class AppointmentStore:
    def __init__(self):
        self._seq = 0

    @property
    def col(self):
        return get_db()["appointments"]

    def _next_id(self) -> str:
        return next_id(self.col, "APT-", 4)

    def _next_queue_number(self, org_id: str, appointment_date: str) -> int:
        same_day = [
            a for a in self.col.find({"org_id": org_id, "appointment_date": appointment_date})
        ]
        return len(same_day) + 1

    def create(self, payload: AppointmentCreate, org_id: str, created_by: str) -> Dict:
        doc = {
            "id": self._next_id(),
            "org_id": org_id,
            "patient_id": payload.patient_id,
            "doctor_id": payload.doctor_id,
            "created_by": created_by,
            "reason": payload.reason,
            "appointment_date": payload.appointment_date,
            "appointment_time": payload.appointment_time,
            "status": "Scheduled",
            "queue_number": self._next_queue_number(org_id, payload.appointment_date),
            "created_at": time.time(),
            "updated_at": time.time(),
        }
        self.col.insert_one(doc)
        return doc

    def get(self, appointment_id: str) -> Optional[Dict]:
        return self.col.find_one({"id": appointment_id})

    def list_for_org(self, org_id: str) -> List[Dict]:
        rows = self.col.find({"org_id": org_id})
        return sorted(rows, key=lambda a: a.get("created_at", 0), reverse=True)

    def list_for_doctor(self, doctor_id: str, org_id: Optional[str] = None,
                         open_only: bool = False) -> List[Dict]:
        query: Dict = {"doctor_id": doctor_id}
        if org_id:
            query["org_id"] = org_id
        rows = self.col.find(query)
        if open_only:
            rows = [r for r in rows if r.get("status") in OPEN_STATUSES]
        return sorted(rows, key=lambda a: a.get("created_at", 0), reverse=True)

    def list_for_patient(self, patient_id: str) -> List[Dict]:
        rows = self.col.find({"patient_id": patient_id})
        return sorted(rows, key=lambda a: a.get("created_at", 0), reverse=True)

    def update_status(self, appointment_id: str, status: str) -> Optional[Dict]:
        if status not in STATUSES:
            raise ValueError(f"status must be one of {', '.join(STATUSES)}")
        if not self.get(appointment_id):
            return None
        self.col.update_one({"id": appointment_id}, {"$set": {"status": status, "updated_at": time.time()}})
        return self.get(appointment_id)


appointment_store = AppointmentStore()
