"""
Module 10: Prescription & Prescription Item.

A Prescription belongs to exactly one Encounter and moves through the
target workflow's DDI review states (Step 5-7) before it can be finalized
and handed to the Hospital Administrator (Step 8). Prescription Items are
stored embedded on the prescription document -- they share the exact same
lifecycle and are always read/written together with their parent, which is
the normal MongoDB modelling choice for a tightly-owned one-to-many list
(the same pattern already used for `patients.meds` / `patients.allergies`
elsewhere in this project). Each item still carries its own `id` and a
`prescription_id` back-reference so it remains independently addressable,
matching the shape in CLAUDE.md's target domain model.

Domain/data layer only -- see module8_appointments.py's module docstring
for why no route is added here yet.
"""
import time
import uuid
from typing import Dict, List, Optional

from pydantic import BaseModel, Field

from app.db import get_db, next_id

STATUSES = ("Draft", "Under DDI Review", "Awaiting Doctor Decision", "Doctor Decision Recorded",
            "Finalized", "Cancelled")


# ------------------------------------------------------------------ schemas
class PrescriptionItemIn(BaseModel):
    medicine_name: str = Field(..., min_length=1)
    canonical_name: Optional[str] = None
    dose: Optional[str] = None
    unit: Optional[str] = None
    frequency: Optional[str] = None
    timing: Optional[str] = None
    duration: Optional[str] = None
    route: Optional[str] = None
    instructions: Optional[str] = None
    quantity: Optional[int] = None


class PrescriptionCreate(BaseModel):
    encounter_id: str
    patient_id: str
    doctor_id: str
    clinical_instructions: Optional[str] = ""
    items: List[PrescriptionItemIn] = []


class PrescriptionUpdate(BaseModel):
    """Phase 5: doctor edits a Draft prescription's items/instructions.
    Both fields optional so a caller can patch just one; `items` (when
    given) always replaces the full list -- prescriptions are small
    doctor-authored lists, not incrementally-appended collections."""
    items: Optional[List[PrescriptionItemIn]] = None
    clinical_instructions: Optional[str] = None


# ------------------------------------------------------------------- store
class PrescriptionStore:
    def __init__(self):
        self._seq = 0
        self._item_seq = 0

    @property
    def col(self):
        return get_db()["prescriptions"]

    def _next_id(self) -> str:
        return next_id(self.col, "RX-", 4)

    def _next_item_id(self) -> str:
        # Random suffix: an in-process counter restarts at 1 on every server start and would repeat item ids.
        return f"RXI-{uuid.uuid4().hex[:10].upper()}"

    def _build_items(self, items: List[PrescriptionItemIn], prescription_id: str) -> List[Dict]:
        built = []
        for item in items:
            d = item.model_dump()
            d["id"] = self._next_item_id()
            d["prescription_id"] = prescription_id
            built.append(d)
        return built

    def create(self, payload: PrescriptionCreate, org_id: str) -> Dict:
        pid = self._next_id()
        doc = {
            "id": pid,
            "org_id": org_id,
            "encounter_id": payload.encounter_id,
            "patient_id": payload.patient_id,
            "doctor_id": payload.doctor_id,
            "status": "Draft",
            "version": 1,
            "clinical_instructions": payload.clinical_instructions or "",
            "items": self._build_items(payload.items, pid),
            "finalized_at": None,
            "created_at": time.time(),
            "updated_at": time.time(),
        }
        self.col.insert_one(doc)
        return doc

    def get(self, prescription_id: str) -> Optional[Dict]:
        return self.col.find_one({"id": prescription_id})

    def list_for_encounter(self, encounter_id: str) -> List[Dict]:
        rows = self.col.find({"encounter_id": encounter_id})
        return sorted(rows, key=lambda p: p.get("version", 1), reverse=True)

    def list_for_patient(self, patient_id: str) -> List[Dict]:
        rows = self.col.find({"patient_id": patient_id})
        return sorted(rows, key=lambda p: p.get("created_at", 0), reverse=True)

    def set_items(self, prescription_id: str, items: List[PrescriptionItemIn]) -> Optional[Dict]:
        if not self.get(prescription_id):
            return None
        built = self._build_items(items, prescription_id)
        self.col.update_one({"id": prescription_id}, {"$set": {"items": built, "updated_at": time.time()}})
        return self.get(prescription_id)

    def update(self, prescription_id: str, patch: PrescriptionUpdate) -> Optional[Dict]:
        """Phase 5: patch items and/or clinical_instructions in one call
        (route layer enforces Draft-only + doctor-own)."""
        if not self.get(prescription_id):
            return None
        changes: Dict = {"updated_at": time.time()}
        if patch.items is not None:
            changes["items"] = self._build_items(patch.items, prescription_id)
        if patch.clinical_instructions is not None:
            changes["clinical_instructions"] = patch.clinical_instructions
        self.col.update_one({"id": prescription_id}, {"$set": changes})
        return self.get(prescription_id)

    def update_status(self, prescription_id: str, status: str) -> Optional[Dict]:
        if status not in STATUSES:
            raise ValueError(f"status must be one of {', '.join(STATUSES)}")
        if not self.get(prescription_id):
            return None
        self.col.update_one({"id": prescription_id}, {"$set": {"status": status, "updated_at": time.time()}})
        return self.get(prescription_id)

    def finalize(self, prescription_id: str) -> Optional[Dict]:
        if not self.get(prescription_id):
            return None
        now = time.time()
        self.col.update_one({"id": prescription_id},
                             {"$set": {"status": "Finalized", "finalized_at": now, "updated_at": now}})
        return self.get(prescription_id)

    def new_version(self, prescription_id: str) -> Optional[Dict]:
        """Doctor revises a prescription after a high-severity DDI result
        (target workflow Step 7): the previous draft is cancelled and a new,
        incremented-version prescription is opened on the same encounter so
        the DDI/decision history stays attached to the version it was
        actually run against."""
        prior = self.get(prescription_id)
        if not prior:
            return None
        self.col.update_one({"id": prescription_id}, {"$set": {"status": "Cancelled", "updated_at": time.time()}})
        new_id = self._next_id()
        doc = {
            "id": new_id,
            "org_id": prior["org_id"],
            "encounter_id": prior["encounter_id"],
            "patient_id": prior["patient_id"],
            "doctor_id": prior["doctor_id"],
            "status": "Draft",
            "version": prior.get("version", 1) + 1,
            "clinical_instructions": prior.get("clinical_instructions", ""),
            "items": self._build_items(
                [PrescriptionItemIn(**{k: v for k, v in i.items() if k not in ("id", "prescription_id")})
                 for i in prior.get("items", [])],
                new_id,
            ),
            "finalized_at": None,
            "created_at": time.time(),
            "updated_at": time.time(),
        }
        self.col.insert_one(doc)
        return doc


prescription_store = PrescriptionStore()
