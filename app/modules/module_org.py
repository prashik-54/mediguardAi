"""
Module 9: Hospital / Organization management.

An Organization represents a hospital or clinic that bundles doctors,
pharmacists and patients together under one roof. The platform admin
creates organizations; a hospital administrator can view and edit their
own hospital's details and create/manage the doctor, pharmacist and
patient accounts inside it — turning this into a mini hospital-management
system on top of the DDI analysis engine.

Persisted to MongoDB (collection "organizations"); falls back to the
in-memory store from app.db when Mongo isn't reachable, same as every
other module in this project.
"""
import time
from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field

from app.db import get_db, next_id

ORG_TYPES = ["Hospital", "Clinic", "Pharmacy Network", "Diagnostic Center", "Other"]


# ------------------------------------------------------------------ schemas
class OrganizationCreate(BaseModel):
    name: str = Field(..., min_length=2)
    type: Optional[str] = "Hospital"
    address: Optional[str] = ""
    phone: Optional[str] = ""
    email: Optional[str] = ""


class OrganizationUpdate(BaseModel):
    name: Optional[str] = None
    type: Optional[str] = None
    address: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    status: Optional[str] = None  # "Active" | "Inactive"


# ------------------------------------------------------------------- store
class OrganizationStore:
    def __init__(self):
        self._seq = 100

    @property
    def col(self):
        return get_db()["organizations"]

    def _next_id(self) -> str:
        return next_id(self.col, "ORG-", 0, floor=100)

    def create(self, payload: OrganizationCreate, created_by: Optional[str] = None) -> Dict:
        doc = {
            "id": self._next_id(),
            "name": payload.name.strip(),
            "type": payload.type or "Hospital",
            "address": payload.address or "",
            "phone": payload.phone or "",
            "email": (payload.email or "").lower().strip(),
            "status": "Active",
            "created_by": created_by,
            "created_at": time.time(),
        }
        self.col.insert_one(doc)
        return doc

    def get(self, org_id: str) -> Optional[Dict]:
        return self.col.find_one({"id": org_id})

    def get_by_name(self, name: str) -> Optional[Dict]:
        target = (name or "").strip().lower()
        if not target:
            return None
        for row in self.col.find({}):
            if (row.get("name") or "").strip().lower() == target:
                return row
        return None

    def find_or_create(self, name: str, created_by: Optional[str] = None) -> Dict:
        """Look up a hospital by name (case-insensitive); create it if it
        doesn't exist yet. Used to attach hospital-scoped self-signups
        (hospital administrator / doctor / pharmacist) to a real org_id
        instead of leaving them unattached."""
        existing = self.get_by_name(name)
        if existing:
            return existing
        return self.create(OrganizationCreate(name=name.strip()), created_by=created_by)

    def list_all(self) -> List[Dict]:
        rows = self.col.find({})
        return sorted(rows, key=lambda d: d.get("created_at", 0), reverse=True)

    def update(self, org_id: str, patch: Dict[str, Any]) -> Optional[Dict]:
        clean = {k: v for k, v in patch.items() if v is not None}
        if clean:
            self.col.update_one({"id": org_id}, {"$set": clean})
        return self.get(org_id)

    def delete(self, org_id: str) -> bool:
        result = self.col.delete_one({"id": org_id})
        return bool(result.get("deleted"))


org_store = OrganizationStore()
