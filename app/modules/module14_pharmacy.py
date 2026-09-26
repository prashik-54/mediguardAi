"""
Module 14: Pharmacy Order & Dispensing Record.

A Pharmacy Order is what the Hospital Administrator sends once a
prescription is finalized (target workflow Step 9). A Dispensing Record is
what the pharmacist writes back after fulfilling it (fully, partially, or
noting an unavailable medicine).

Phase 9: wired into `/api/pharmacy/*` routes in main.py. Order statuses:
Sent -> Accepted -> (Partially Dispensed while items remain open) -> a closed
outcome (Dispensed / Unable to Dispense / Partially Dispensed with shortages),
recorded via `completed_at`.
"""
import time
from typing import Any, Dict, List, Optional

from pydantic import BaseModel

from app.db import get_db, next_id

ORDER_STATUSES = ("Sent", "Accepted", "Dispensed", "Partially Dispensed", "Unable to Dispense")
DISPENSE_STATUSES = ("Dispensed", "Partially Dispensed", "Unavailable")


class PharmacyOrderCreate(BaseModel):
    prescription_id: str
    patient_id: str
    pharmacist_id: Optional[str] = None    # may be assigned later by the pharmacy queue


class DispensingCreate(BaseModel):
    pharmacy_order_id: str
    prescription_id: str
    patient_id: str
    pharmacist_id: str
    items: List[Dict[str, Any]] = []       # [{item_id, medicine_name, status, quantity_dispensed}]
    status: str
    notes: Optional[str] = ""


class PharmacyOrderStore:
    def __init__(self):
        self._seq = 0

    @property
    def col(self):
        return get_db()["pharmacy_orders"]

    def _next_id(self) -> str:
        return next_id(self.col, "PO-", 4)

    def create(self, payload: PharmacyOrderCreate, org_id: str, sent_by: str) -> Dict:
        doc = {
            "id": self._next_id(),
            "org_id": org_id,
            "prescription_id": payload.prescription_id,
            "patient_id": payload.patient_id,
            "sent_by": sent_by,
            "pharmacist_id": payload.pharmacist_id,
            "status": "Sent",
            "sent_at": time.time(),
            "updated_at": time.time(),
        }
        self.col.insert_one(doc)
        return doc

    def get(self, order_id: str) -> Optional[Dict]:
        return self.col.find_one({"id": order_id})

    def list_for_org(self, org_id: str) -> List[Dict]:
        rows = self.col.find({"org_id": org_id})
        return sorted(rows, key=lambda o: o.get("sent_at", 0), reverse=True)

    def list_for_pharmacist(self, pharmacist_id: str) -> List[Dict]:
        rows = self.col.find({"pharmacist_id": pharmacist_id})
        return sorted(rows, key=lambda o: o.get("sent_at", 0), reverse=True)

    def list_for_patient(self, patient_id: str) -> List[Dict]:
        rows = self.col.find({"patient_id": patient_id})
        return sorted(rows, key=lambda o: o.get("sent_at", 0), reverse=True)

    def assign(self, order_id: str, pharmacist_id: str) -> Optional[Dict]:
        self.col.update_one({"id": order_id}, {"$set": {"pharmacist_id": pharmacist_id, "updated_at": time.time()}})
        return self.get(order_id)

    def get_for_prescription(self, prescription_id: str) -> Optional[Dict]:
        rows = [o for o in self.col.find({"prescription_id": prescription_id}) if o.get("status") != "Cancelled"]
        return rows[0] if rows else None

    def complete(self, order_id: str, status: str) -> Optional[Dict]:
        self.update_status(order_id, status)
        self.col.update_one({"id": order_id}, {"$set": {"completed_at": time.time()}})
        return self.get(order_id)

    def update_status(self, order_id: str, status: str) -> Optional[Dict]:
        if status not in ORDER_STATUSES:
            raise ValueError(f"status must be one of {', '.join(ORDER_STATUSES)}")
        if not self.get(order_id):
            return None
        self.col.update_one({"id": order_id}, {"$set": {"status": status, "updated_at": time.time()}})
        return self.get(order_id)


class DispensingStore:
    def __init__(self):
        self._seq = 0

    @property
    def col(self):
        return get_db()["dispensing_records"]

    def _next_id(self) -> str:
        return next_id(self.col, "DISP-", 4)

    def create(self, payload: DispensingCreate, org_id: str) -> Dict:
        if payload.status not in DISPENSE_STATUSES:
            raise ValueError(f"status must be one of {', '.join(DISPENSE_STATUSES)}")
        doc = {
            "id": self._next_id(),
            "org_id": org_id,
            "pharmacy_order_id": payload.pharmacy_order_id,
            "prescription_id": payload.prescription_id,
            "patient_id": payload.patient_id,
            "pharmacist_id": payload.pharmacist_id,
            "items": payload.items,
            "status": payload.status,
            "notes": payload.notes or "",
            "dispensed_at": time.time(),
        }
        self.col.insert_one(doc)
        return doc

    def get(self, record_id: str) -> Optional[Dict]:
        return self.col.find_one({"id": record_id})

    def list_for_order(self, pharmacy_order_id: str) -> List[Dict]:
        rows = self.col.find({"pharmacy_order_id": pharmacy_order_id})
        return sorted(rows, key=lambda d: d.get("dispensed_at", 0), reverse=True)


pharmacy_order_store = PharmacyOrderStore()
dispensing_store = DispensingStore()
