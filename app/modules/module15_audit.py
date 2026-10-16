"""
Module 15: Audit Log.

Records who did what and when for important workflow state transitions
(CLAUDE.md Rule 15). Per Rule 16, callers must pass IDs and event types in
`metadata` -- never raw patient names, diagnoses, or medication content.
`log()` does not attempt to enforce that (it cannot know what's sensitive
in an arbitrary dict), so every call site is responsible for keeping
`metadata` to identifiers/booleans/counts only. This module itself is
wired in nowhere yet; later phases call `audit_log.log(...)` from the
route handlers that perform the actual state changes.
"""
import time
from typing import Any, Dict, List, Optional

from app.db import get_db, next_id


class AuditLogStore:
    def __init__(self):
        self._seq = 0

    @property
    def col(self):
        return get_db()["audit_logs"]

    def _next_id(self) -> str:
        return next_id(self.col, "AUD-", 6)

    def log(self, org_id: Optional[str], actor_user_id: str, actor_role: str, action: str,
             resource_type: str, resource_id: str, metadata: Optional[Dict[str, Any]] = None) -> Dict:
        doc = {
            "id": self._next_id(),
            "org_id": org_id,
            "actor_user_id": actor_user_id,
            "actor_role": actor_role,
            "action": action,
            "resource_type": resource_type,
            "resource_id": resource_id,
            "metadata": metadata or {},
            "created_at": time.time(),
        }
        self.col.insert_one(doc)
        return doc

    def list_all(self, org_id: Optional[str] = None, resource_type: Optional[str] = None,
                 resource_id: Optional[str] = None, limit: int = 200) -> List[Dict]:
        query: Dict[str, Any] = {}
        if org_id:
            query["org_id"] = org_id
        if resource_type:
            query["resource_type"] = resource_type
        if resource_id:
            query["resource_id"] = resource_id
        rows = self.col.find(query) if query else self.col.find({})
        rows = sorted(rows, key=lambda r: r.get("created_at", 0), reverse=True)
        return rows[:limit]


audit_log_store = AuditLogStore()
