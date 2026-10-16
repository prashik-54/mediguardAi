import time
from typing import Dict, List, Optional, Any

from pydantic import BaseModel, Field

from app.db import get_db, next_id

# ---------------------------------------------------------------------------
# Step 1: Input validation schema for the Module 1-4 clinical pipeline.
# (Kept field-compatible with the original project so app/main.py's
#  /api/pipeline/process-and-fuse endpoint and module3's preprocessor are
#  untouched.)
# ---------------------------------------------------------------------------
class PatientClinicalProfile(BaseModel):
    patient_id: str = Field(..., json_schema_extra={"example": "PAT_1001"})
    age: int = Field(..., ge=0, le=120, json_schema_extra={"example": 65})
    gender: str = Field(..., json_schema_extra={"example": "Male"})
    kidney_function_egfr: float = Field(..., json_schema_extra={"example": 45.5})
    liver_function_alt: float = Field(..., json_schema_extra={"example": 35.0})
    existing_diseases: List[str] = Field(default=[], json_schema_extra={"example": ["Hypertension", "Type-2 Diabetes"]})
    active_medications: List[str] = Field(..., json_schema_extra={"example": ["Metformin", "Amlodipine"]})
    prescriptive_drugs: List[str] = Field(default=[], json_schema_extra={"example": ["Aspirin", "Ibuprofen"]})
    allergy_history: Optional[List[str]] = Field(default=[], json_schema_extra={"example": ["Penicillin"]})


def _mirror_clinical_aliases(doc: Dict[str, Any]) -> Dict[str, Any]:
    """Fills in the UI-friendly aliases (egfr/alt/meds/...) from clinical field
    names, and vice versa, so a patient created via either the clinical
    pipeline schema or the full Patients CRUD UI can be read by both sides."""
    if "egfr" not in doc and "kidney_function_egfr" in doc:
        doc["egfr"] = doc["kidney_function_egfr"]
    if "kidney_function_egfr" not in doc and "egfr" in doc:
        doc["kidney_function_egfr"] = doc["egfr"]
    if "alt" not in doc and "liver_function_alt" in doc:
        doc["alt"] = doc["liver_function_alt"]
    if "liver_function_alt" not in doc and "alt" in doc:
        doc["liver_function_alt"] = doc["alt"]
    if "conditions" not in doc and "existing_diseases" in doc:
        doc["conditions"] = doc["existing_diseases"]
    if "existing_diseases" not in doc and "conditions" in doc:
        doc["existing_diseases"] = doc["conditions"]
    if "active_medications" not in doc and "meds" in doc:
        doc["active_medications"] = [m.get("name") if isinstance(m, dict) else m for m in doc.get("meds", [])]
    return doc


# ---------------------------------------------------------------------------
# Step 2: Patient Record Manager — MongoDB backed (falls back to an
# in-memory store automatically if MongoDB isn't reachable; see app/db.py).
# ---------------------------------------------------------------------------
class PatientManager:
    def __init__(self):
        self._seq = 0

    @property
    def col(self):
        return get_db()["patients"]

    def _next_id(self) -> str:
        # Race-safe, O(1)-after-first-scan id generation (same helper every
        # other module uses) -- this used to re-scan the whole collection
        # unlocked on every call, which both duplicated patient IDs under
        # concurrent registrations in the in-memory fallback (no unique-index
        # enforcement there to catch it) and was O(n) per insert on Mongo.
        return next_id(self.col, "P-", 3)

    def save_patient(self, profile: PatientClinicalProfile, org_id: Optional[str] = None,
                     owner_id: Optional[str] = None) -> Dict:
        """Used by the Module 1-4 pipeline (/api/patient/register). Upserts
        clinical fields into the shared `patients` collection."""
        data = profile.model_dump()
        data = _mirror_clinical_aliases(data)
        data["updated_at"] = time.time()
        existing = self.col.find_one({"id": profile.patient_id})
        if existing:
            self.col.update_one({"id": profile.patient_id}, {"$set": data})
        else:
            data["id"] = profile.patient_id
            data.setdefault("name", profile.patient_id)
            data.setdefault("created_at", time.time())
            data.setdefault("meds", [{"name": m} for m in profile.active_medications])
            data.setdefault("allergies", [{"substance": a, "reaction": "", "severity": "Unknown"} for a in (profile.allergy_history or [])])
            data.setdefault("status", "Active")
            data["org_id"] = org_id          # set server-side, never from the client
            data["owner_id"] = owner_id
            self.col.insert_one(data)
        return {"status": "success", "message": f"Patient {profile.patient_id} recorded successfully."}

    def get_patient(self, patient_id: str) -> Optional[Dict]:
        doc = self.col.find_one({"id": patient_id})
        if doc:
            doc = _mirror_clinical_aliases(dict(doc))
        return doc

    # ---------------------------------------------------------- full CRUD
    def list_patients(self, owner_id: Optional[str] = None, org_id: Optional[str] = None) -> List[Dict]:
        query: Dict = {}
        if owner_id:
            query["owner_id"] = owner_id
        if org_id:
            query["org_id"] = org_id
        rows = self.col.find(query) if query else self.col.find({})
        return [_mirror_clinical_aliases(dict(r)) for r in rows]

    def create_full_record(self, data: Dict, owner_id: Optional[str] = None) -> Dict:
        data = dict(data)
        if not data.get("id"):
            data["id"] = self._next_id()
        if self.col.find_one({"id": data["id"]}):
            raise ValueError(f"Patient {data['id']} already exists.")
        data = _mirror_clinical_aliases(data)
        data.setdefault("status", "Active")
        data.setdefault("history", [])
        data.setdefault("meds", [])
        data.setdefault("conditions", [])
        data.setdefault("allergies", [])
        data["owner_id"] = owner_id
        data["created_at"] = time.time()
        data["updated_at"] = time.time()
        self.col.insert_one(data)
        return data

    def update_full_record(self, patient_id: str, patch: Dict) -> Optional[Dict]:
        if not self.col.find_one({"id": patient_id}):
            return None
        patch = _mirror_clinical_aliases(dict(patch))
        patch["updated_at"] = time.time()
        patch.pop("id", None)
        self.col.update_one({"id": patient_id}, {"$set": patch})
        return self.get_patient(patient_id)

    def delete_patient(self, patient_id: str) -> bool:
        result = self.col.delete_one({"id": patient_id})
        return bool(result.get("deleted"))

    def set_medications(self, patient_id: str, meds: List[Dict]) -> Optional[Dict]:
        return self.update_full_record(patient_id, {"meds": meds})

    # ------------------------------------------------------- intake (Phase 3)
    def search(self, org_id: Optional[str], query: str) -> List[Dict]:
        """Hospital-administrator patient lookup (target workflow Step 2).
        Matches patient id, name, phone, email or dob by substring, scoped
        to one hospital (or platform-wide when org_id is None)."""
        q = (query or "").strip().lower()
        if not q:
            return []
        rows = self.col.find({"org_id": org_id}) if org_id else self.col.find({})
        out = []
        for r in rows:
            haystack = [str(r.get(f, "")) for f in ("id", "name", "phone", "email", "dob")]
            if any(q in h.lower() for h in haystack if h):
                out.append(_mirror_clinical_aliases(dict(r)))
        return out

    def find_duplicate(self, org_id: Optional[str], phone: Optional[str] = None,
                        email: Optional[str] = None, dob: Optional[str] = None) -> Optional[Dict]:
        """Safe-identifying-field duplicate check for new registrations
        (target workflow Step 2 / CLAUDE.md Phase 3 'duplicate prevention').
        A match on email alone, or on phone AND (matching/blank) dob, counts
        as the same person; name is intentionally NOT used (too many
        false positives from common names)."""
        if not org_id:
            return None
        phone = (phone or "").strip()
        email = (email or "").strip().lower()
        dob = (dob or "").strip()
        if not phone and not email:
            return None
        for r in self.col.find({"org_id": org_id}):
            r_email = str(r.get("email", "")).strip().lower()
            if email and r_email and email == r_email:
                return _mirror_clinical_aliases(dict(r))
            r_phone = str(r.get("phone", "")).strip()
            r_dob = str(r.get("dob", "")).strip()
            if phone and r_phone and phone == r_phone and (not dob or not r_dob or dob == r_dob):
                return _mirror_clinical_aliases(dict(r))
        return None


# Module-level singleton so other modules (app.main, app.seed) share one store.
patient_service = PatientManager()


# ---------------------------------------------------------------------------
# Clinical-profile completeness (Phase 14 hardening): a hospital administrator
# fills these in as OPTIONAL fields during intake (target workflow Step 2),
# but the assigned doctor must confirm/complete them during the checkup
# before the consultation can be closed out.
# ---------------------------------------------------------------------------
CLINICAL_REQUIRED_FIELDS = (
    ("age", "Age"),
    ("gender", "Gender"),
    ("kidney_function_egfr", "Kidney function (eGFR)"),
    ("liver_function_alt", "Liver function (ALT)"),
)


def missing_clinical_fields(patient: Dict) -> List[str]:
    """Labels of any required clinical field not yet recorded on `patient`
    (aliases already mirrored by get_patient/list_patients/search)."""
    missing = []
    for key, label in CLINICAL_REQUIRED_FIELDS:
        val = patient.get(key)
        if val is None or (isinstance(val, str) and not val.strip()):
            missing.append(label)
    return missing
