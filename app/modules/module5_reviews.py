"""
Module 5: Pharmacist Review Queue.

Stores review *requests* (a doctor/system flags a patient's medication list
for pharmacist sign-off) and the pharmacist's *decision*. The frontend joins
these with the live patient record + client-side risk scoring
(frontend/src/lib/risk.js) to render the review workspace, so this module
intentionally stays lightweight and just persists queue state.
"""
import time
from typing import Dict, List, Optional

from app.db import get_db, next_id


class ReviewStore:
    def __init__(self):
        self._seq = 0

    @property
    def col(self):
        return get_db()["reviews"]

    def _next_id(self) -> str:
        return next_id(self.col, "RV-", 3)

    def create(self, patient_id: str, requested_by: str, priority: str = "Medium",
               note: Optional[str] = None, org_id: Optional[str] = None,
               requested_by_id: Optional[str] = None) -> Dict:
        doc = {
            "id": self._next_id(),
            "org_id": org_id,
            "patient_id": patient_id,
            "requested_by": requested_by,
            "requested_by_id": requested_by_id,
            "priority": priority,
            "note": note or "",
            "status": "Pending",
            "review": None,
            "created_at": time.time(),
        }
        self.col.insert_one(doc)
        return doc

    def list_all(self) -> List[Dict]:
        rows = sorted(self.col.find({}), key=lambda r: r.get("created_at", 0), reverse=True)
        return rows

    def list_for_org(self, org_id: str) -> List[Dict]:
        rows = sorted(self.col.find({"org_id": org_id}), key=lambda r: r.get("created_at", 0), reverse=True)
        return rows

    def get(self, review_id: str) -> Optional[Dict]:
        return self.col.find_one({"id": review_id})

    def submit(self, review_id: str, decision: Dict) -> Optional[Dict]:
        if not self.get(review_id):
            return None
        status = "Escalated" if decision.get("decision") == "Escalate" else "Reviewed"
        review = {**decision, "at": time.time()}
        self.col.update_one({"id": review_id}, {"$set": {"status": status, "review": review}})
        return self.get(review_id)


review_store = ReviewStore()
