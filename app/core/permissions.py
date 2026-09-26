"""
Reusable authorization helpers (CLAUDE.md Phase 2).

Every sensitive route in app/main.py goes through these instead of doing its
own ad-hoc role/org checks, so the rules live in ONE place:

  * Platform admin  (role "admin")          -> platform-wide.
  * Hospital admin  (role "administrator")  -> their own hospital only.
  * Doctor                                  -> own hospital AND assigned
                                               patients only.
  * Pharmacist                              -> own hospital AND patients
                                               that have pharmacy work
                                               (pharmacy order / review).
  * Patient                                 -> their own record only.

Security rule used throughout: a non-platform user whose account is NOT
attached to a hospital (org_id missing) matches nothing. Without this, two
records that both lack an org_id would wrongly compare equal (None == None).

Inaccessible resources return 404 (not 403) so the API never confirms that a
guessed ID exists in another hospital. 403 is used only when the ROLE can
never perform the action at all.
"""
from typing import Any, Dict, List, Optional, Set

from fastapi import HTTPException

from app.db import get_db
from app.modules.module1_patient import patient_service
from app.modules.module6_notifications import group_for_role
from app.modules.module_auth import HOSPITAL_MANAGED_ROLES

PLATFORM_ADMIN = "admin"
HOSPITAL_ADMIN = "administrator"

# Which roles may perform which action on a patient record at all.
PATIENT_ACTION_ROLES = {
    "read": ("admin", "administrator", "doctor", "pharmacist", "patient"),
    "write": ("admin", "administrator", "doctor"),
    "delete": ("admin", "administrator"),
    "prescribe": ("doctor",),  # medication lists are a doctor-only decision
}

# Appointments in these states no longer give a doctor access to the patient.
_INACTIVE_APPOINTMENT = ("Cancelled", "No Show")

# Fields a client may never set/overwrite on a patient record.
PROTECTED_PATIENT_FIELDS = ("_id", "_seq", "org_id", "owner_id", "created_at", "updated_at")
# Prescribing data: a hospital administrator (reception) may not change it.
CLINICAL_ONLY_FIELDS = ("meds", "active_medications", "prescriptive_drugs")


# ------------------------------------------------------------------ roles
def is_platform_admin(user: Dict) -> bool:
    return user.get("role") == PLATFORM_ADMIN


def require_org(user: Dict) -> str:
    """Return the hospital id of a hospital-scoped user, or 403 when the
    account is not attached to any hospital."""
    org_id = user.get("org_id")
    if not org_id:
        raise HTTPException(status_code=403, detail="Your account is not attached to a hospital.")
    return org_id


def same_org(user: Dict, org_id: Optional[str]) -> bool:
    """True when `user` may touch a resource belonging to hospital `org_id`."""
    if is_platform_admin(user):
        return True
    return bool(user.get("org_id")) and user.get("org_id") == org_id


def require_own_hospital(current: Dict, org_id: Optional[str], message: str) -> None:
    """A hospital administrator may only touch their own hospital's data.
    Platform admins are never restricted here."""
    if not same_org(current, org_id):
        raise HTTPException(status_code=403, detail=message)


def require_hospital_managed_role(current: Dict, role: Optional[str], message: str) -> None:
    """A hospital administrator may only create/assign the clinical & patient
    roles that actually work inside a hospital — never admin/administrator."""
    if not is_platform_admin(current) and role is not None and role not in HOSPITAL_MANAGED_ROLES:
        raise HTTPException(status_code=403, detail=message)


# --------------------------------------------------- relationship look-ups
def assigned_patient_ids(doctor: Dict) -> Set[str]:
    """Patients a doctor is allowed to see: an active appointment or an
    encounter assigned to them, or a record they registered themselves."""
    org_id = doctor.get("org_id")
    if not org_id:
        return set()
    db = get_db()
    ids: Set[str] = set()
    for a in db["appointments"].find({"org_id": org_id, "doctor_id": doctor.get("id")}):
        if a.get("status") not in _INACTIVE_APPOINTMENT and a.get("patient_id"):
            ids.add(a["patient_id"])
    for e in db["encounters"].find({"org_id": org_id, "doctor_id": doctor.get("id")}):
        if e.get("patient_id"):
            ids.add(e["patient_id"])
    for p in db["patients"].find({"org_id": org_id, "owner_id": doctor.get("id")}):
        ids.add(p["id"])
    return ids


def pharmacy_patient_ids(pharmacist: Dict) -> Set[str]:
    """Patients a pharmacist may see: those with a pharmacy order or a
    pharmacist review in the pharmacist's own hospital."""
    org_id = pharmacist.get("org_id")
    if not org_id:
        return set()
    db = get_db()
    ids: Set[str] = set()
    for coll in ("pharmacy_orders", "reviews"):
        for row in db[coll].find({"org_id": org_id}):
            if row.get("patient_id"):
                ids.add(row["patient_id"])
    return ids


# ---------------------------------------------------------- patient access
def can_access_patient(user: Dict, patient: Dict, action: str = "read") -> bool:
    role = user.get("role")
    if role not in PATIENT_ACTION_ROLES.get(action, ()):
        return False
    if role == PLATFORM_ADMIN:
        return True
    pid = patient.get("id")
    if role == "patient":
        return bool(pid) and user.get("patientId") == pid
    org_id = user.get("org_id")
    if not org_id or patient.get("org_id") != org_id:
        return False
    if role == HOSPITAL_ADMIN:
        return True
    if role == "doctor":
        return pid in assigned_patient_ids(user)
    if role == "pharmacist":
        return pid in pharmacy_patient_ids(user)
    return False


def get_patient_for(current: Dict, patient_id: str, action: str = "read") -> Dict:
    """Load a patient record the caller may access, else 403 (role can never
    do this) / 404 (missing OR not accessible — indistinguishable on purpose)."""
    if current.get("role") not in PATIENT_ACTION_ROLES.get(action, ()):
        raise HTTPException(status_code=403, detail="You don't have permission to perform this action.")
    doc = patient_service.get_patient(patient_id)
    if not doc or not can_access_patient(current, doc, action):
        raise HTTPException(status_code=404, detail="Patient not found.")
    return doc


def list_accessible_patients(current: Dict) -> List[Dict]:
    """Every patient record the caller may read, already scoped."""
    role = current.get("role")
    if role == PLATFORM_ADMIN:
        return patient_service.list_patients()
    if role == "patient":
        pid = current.get("patientId")
        doc = patient_service.get_patient(pid) if pid else None
        return [doc] if doc else []
    org_id = current.get("org_id")
    if not org_id or role not in PATIENT_ACTION_ROLES["read"]:
        return []
    rows = patient_service.list_patients(org_id=org_id)
    if role == HOSPITAL_ADMIN:
        return rows
    allowed = assigned_patient_ids(current) if role == "doctor" else pharmacy_patient_ids(current)
    return [p for p in rows if p.get("id") in allowed]


def filter_by_patient_access(current: Dict, rows: List[Dict]) -> List[Dict]:
    """Keep only rows (reviews, analyses, ...) whose patient the caller may read."""
    if is_platform_admin(current):
        return rows
    allowed = {p.get("id") for p in list_accessible_patients(current)}
    return [r for r in rows if r.get("patient_id") in allowed]


def sanitize_patient_payload(payload: Dict[str, Any], current: Dict, *, drop_id: bool = True) -> Dict[str, Any]:
    """Remove fields a client must never control (hospital, owner, timestamps,
    and — for a hospital administrator — prescribing data)."""
    clean = dict(payload or {})
    for key in PROTECTED_PATIENT_FIELDS:
        clean.pop(key, None)
    if drop_id:
        clean.pop("id", None)
    if current.get("role") == HOSPITAL_ADMIN:
        for key in CLINICAL_ONLY_FIELDS:
            clean.pop(key, None)
    return clean


# ----------------------------------------------------------- notifications
def notification_visible_to(user: Dict, notif: Dict) -> bool:
    """A notification is visible if it was addressed to this user, or it is a
    legacy group notification for the user's role AND hospital. Patients only
    ever see notifications addressed to them personally."""
    if notif.get("recipient_user_id"):
        return notif["recipient_user_id"] == user.get("id")
    group = notif.get("group")
    role = user.get("role")
    if not group or role == "patient" or group != group_for_role(role):
        return False
    if role == PLATFORM_ADMIN:
        return True
    return bool(user.get("org_id")) and notif.get("org_id") == user.get("org_id")
