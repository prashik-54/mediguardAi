"""
Module 7: Analysis History.

Every run of the Module 1-4 pipeline (/api/pipeline/process-and-fuse) is
recorded here so the platform has a real, queryable audit trail of DDI
checks instead of only returning a result to the caller and forgetting it.
Used by GET /api/analyses and to compute dashboard stats.
"""
import time
from typing import Dict, List, Optional

from app.db import get_db, next_id


class AnalysisStore:
    def __init__(self):
        self._seq = 0

    @property
    def col(self):
        return get_db()["analyses"]

    def _next_id(self) -> str:
        return next_id(self.col, "DDI-", 5)

    def record(self, patient_id: str, drug_a: str, drug_b: str, severity: str,
               interaction_found: bool, requested_by: Optional[str], result: Dict,
               org_id: Optional[str] = None) -> Dict:
        doc = {
            "id": self._next_id(),
            "org_id": org_id,
            "patient_id": patient_id,
            "drug_a": drug_a,
            "drug_b": drug_b,
            "severity": severity,
            "interaction_found": interaction_found,
            "requested_by": requested_by,
            "result": result,
            "created_at": time.time(),
        }
        self.col.insert_one(doc)
        return doc

    def list_all(self, patient_id: Optional[str] = None, limit: int = 200) -> List[Dict]:
        query = {"patient_id": patient_id} if patient_id else {}
        rows = sorted(self.col.find(query), key=lambda r: r.get("created_at", 0), reverse=True)
        return rows[:limit]

    def list_for_org(self, org_id: str, limit: int = 200) -> List[Dict]:
        rows = sorted(self.col.find({"org_id": org_id}), key=lambda r: r.get("created_at", 0), reverse=True)
        return rows[:limit]

    def stats(self) -> Dict:
        rows = self.col.find({})
        total = len(rows)
        high = len([r for r in rows if r.get("severity") == "High"])
        return {"total_analyses": total, "high_severity_analyses": high}


analysis_store = AnalysisStore()
