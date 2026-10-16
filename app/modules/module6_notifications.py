"""
Module 6: Notifications.

Notifications are grouped by role ("clinician" = doctor + pharmacist,
"patient", "admin") rather than per-user, matching the original UI design
(frontend/src/context/NotificationsContext.jsx). Real events in the system
(e.g. a high-severity interaction found during analysis) push a notification
here so the bell icon reflects genuine activity instead of static seed data.

CLAUDE.md Phase 1 asks for "notifications with recipient IDs" (see the
target Notification shape in section 8: `recipient_user_id`, `org_id`,
`type`, `reference_type`, `reference_id`). `push_to_user()` below adds that
shape as a new, additive capability -- every field the existing
group-based `push()`/`list_for_group()` path relies on is untouched, so the
current DDI-alert and admin/user-management notifications (see
app/main.py) keep working exactly as before. Actually routing every
existing `push()` call site over to `push_to_user()` is a hospital-
isolation concern that belongs to Phase 2, not this data-layer phase.
"""
import time
from typing import Any, Dict, List, Optional

from app.db import get_db, next_id

GROUPS = ("clinician", "patient", "admin", "administrator")


def group_for_role(role: str) -> str:
    if role == "patient":
        return "patient"
    if role == "admin":
        return "admin"
    if role == "administrator":
        return "administrator"
    return "clinician"


class NotificationStore:
    def __init__(self):
        self._seq = 0

    @property
    def col(self):
        return get_db()["notifications"]

    def _next_id(self) -> str:
        return next_id(self.col, "N-", 4)

    def push(self, group: str, title: str, body: str, tone: str = "info",
              icon: str = "info", kind: str = "System", org_id: Optional[str] = None) -> Dict:
        doc = {
            "id": self._next_id(),
            "group": group,
            "recipient_user_id": None,
            "org_id": org_id,
            "type": kind,
            "reference_type": None,
            "reference_id": None,
            "icon": icon,
            "tone": tone,
            "title": title,
            "body": body,
            "kind": kind,
            "unread": True,
            "created_at": time.time(),
        }
        self.col.insert_one(doc)
        return doc

    def push_to_user(self, recipient_user_id: str, title: str, body: str,
                      org_id: Optional[str] = None, type_: str = "System",
                      reference_type: Optional[str] = None, reference_id: Optional[str] = None,
                      tone: str = "info", icon: str = "info") -> Dict:
        """User-targeted variant matching CLAUDE.md's target Notification
        shape. Does not use `group` at all -- `list_for_user()` is the only
        reader for these."""
        doc = {
            "id": self._next_id(),
            "group": None,
            "recipient_user_id": recipient_user_id,
            "org_id": org_id,
            "type": type_,
            "reference_type": reference_type,
            "reference_id": reference_id,
            "icon": icon,
            "tone": tone,
            "title": title,
            "body": body,
            "kind": type_,
            "unread": True,
            "created_at": time.time(),
        }
        self.col.insert_one(doc)
        return doc

    def list_for_group(self, group: str, org_id: Optional[str] = None) -> List[Dict]:
        query: Dict = {"group": group}
        if org_id:
            query["org_id"] = org_id
        rows = [r for r in self.col.find(query)]
        return sorted(rows, key=lambda r: r.get("created_at", 0), reverse=True)

    def list_for_user(self, recipient_user_id: str) -> List[Dict]:
        rows = [r for r in self.col.find({"recipient_user_id": recipient_user_id})]
        return sorted(rows, key=lambda r: r.get("created_at", 0), reverse=True)

    def mark_read(self, notif_id: str) -> Optional[Dict]:
        self.col.update_one({"id": notif_id}, {"$set": {"unread": False}})
        return self.col.find_one({"id": notif_id})

    def mark_all_read(self, group: str) -> int:
        rows = self.list_for_group(group)
        for r in rows:
            self.col.update_one({"id": r["id"]}, {"$set": {"unread": False}})
        return len(rows)

    def _mark_group(self, notif_id: str, user_id: str, field: str) -> Optional[Dict]:
        doc = self.col.find_one({"id": notif_id})
        if doc:
            seen = list(doc.get(field, []))
            if user_id not in seen:
                seen.append(user_id)
            self.col.update_one({"id": notif_id}, {"$set": {field: seen}})
        return self.col.find_one({"id": notif_id})

    def mark_read_for(self, notif_id: str, user_id: str) -> Optional[Dict]:
        """Per-user read state: a user-targeted row is simply marked read; a shared
        role-group row only records THIS user, so it stays unread for everyone else."""
        doc = self.col.find_one({"id": notif_id})
        if doc and doc.get("recipient_user_id"):
            return self.mark_read(notif_id)
        return self._mark_group(notif_id, user_id, "read_by")

    def dismiss_for(self, notif_id: str, user_id: str) -> bool:
        doc = self.col.find_one({"id": notif_id})
        if doc and not doc.get("recipient_user_id"):
            self._mark_group(notif_id, user_id, "dismissed_by")
            return True
        return self.dismiss(notif_id)

    def dismiss(self, notif_id: str) -> bool:
        result = self.col.delete_one({"id": notif_id})
        return bool(result.get("deleted"))


notification_store = NotificationStore()
