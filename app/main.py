import os
import re
from pathlib import Path
from typing import Any, Dict, List, Optional


def _load_dotenv():
    """Tiny .env loader (no extra dependency). Does not override variables
    that are already set in the real environment."""
    env_path = Path(__file__).resolve().parent.parent / ".env"
    if not env_path.exists():
        return
    for line in env_path.read_text().splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, value = line.partition("=")
        os.environ.setdefault(key.strip(), value.strip())


_load_dotenv()

from fastapi import Body, Depends, FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
import torch

from app.db import db_mode, ensure_indexes
from app.modules.module1_patient import PatientClinicalProfile, patient_service, missing_clinical_fields
from app.modules.module2_drug import DrugKnowledgeBase
from app.modules.module3_pipeline import ClinicalDataPreprocessor
from app.modules.module4_fusion import FeatureFusionLayer
from app.modules.module5_reviews import review_store
from app.modules.module6_notifications import notification_store, group_for_role
from app.modules.module7_analyses import analysis_store
from app.modules.module8_appointments import AppointmentCreate, AppointmentStatusUpdate, appointment_store
from app.modules.module9_encounters import EncounterCreate, EncounterUpdate, encounter_store
from app.modules.module10_prescriptions import PrescriptionCreate, PrescriptionItemIn, PrescriptionUpdate, prescription_store
from app.modules.module11_ddi_analysis import DDIAnalysisCreate, ddi_analysis_store
from app.modules.module12_doctor_decision import DoctorDecisionCreate, DECISIONS, doctor_decision_store
from app.modules.module13_reports import ReportCreate, report_store, build_patient_view
from app.modules.module14_pharmacy import (
    PharmacyOrderCreate, DispensingCreate, DISPENSE_STATUSES, pharmacy_order_store, dispensing_store,
)
from app.modules.module15_audit import audit_log_store
from app.modules.module_org import OrganizationCreate, OrganizationUpdate, org_store
from app.core.permissions import (
    is_platform_admin as _is_platform_admin, require_org, require_own_hospital as _require_own_hospital,
    require_hospital_managed_role as _require_hospital_managed_role, get_patient_for,
    list_accessible_patients, filter_by_patient_access, sanitize_patient_payload,
    can_access_patient, notification_visible_to, same_org,
)
from app.core.backfill import backfill_org_ids
from app.modules.module_auth import (
    UserSignup, UserLogin, ProfileUpdate, PasswordChange, AdminUserCreate, AdminUserUpdate, UserStatusUpdate,
    PatientLoginCreate, user_store, create_token, public_user, get_current_user, require_roles, ROLES,
    verify_password,
    HOSPITAL_MANAGED_ROLES,
)

app = FastAPI(
    title="Personalized DDI & Clinical Risk Framework",
    description="Backend Pipeline: Modules 1-4 (Patient, Drug KB, Preprocessing, Feature Fusion) "
                "+ Module 5 (Auth & Reviews) + Module 6 (Notifications) + Module 7 (Analysis History), "
                "all persisted to MongoDB. The Module 8 clinical dashboard (React) is served at /app once built.",
    version="2.0.0"
)

# Allow the Vite dev server (npm run dev in frontend/) to call the API directly.
# In production the built UI is served from this same app at /app, so no CORS is needed.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_methods=["*"],
    allow_headers=["*"],
)



@app.exception_handler(Exception)
async def _unhandled_error(request, exc):
    """Log the real cause server-side and answer with JSON so the UI can show a readable message
    (instead of a bare "500 Internal Server Error")."""
    import logging
    from fastapi.responses import JSONResponse
    logging.getLogger("uvicorn.error").exception("Unhandled error on %s %s", request.method, request.url.path, exc_info=exc)
    return JSONResponse(status_code=500, content={"detail": "Something went wrong on the server. Please try again; if it "
                                                            "keeps happening, check the server log."})


# Initialize Core Services & Fusion Layer
drug_service = DrugKnowledgeBase()
preprocessor = ClinicalDataPreprocessor()
fusion_layer = FeatureFusionLayer()


@app.on_event("startup")
def on_startup():
    from app.seed import run_bootstrap_admin
    print(f"[MongoDB] Storage mode: {db_mode()}")
    try:
        ensure_indexes()
    except Exception as exc:  # never block startup on indexing issues
        print(f"[Indexes] Skipped due to error: {exc}")
    try:
        fixed = backfill_org_ids()
        if fixed:
            print(f"[Backfill] Added hospital scope to {fixed} legacy record(s).")
    except Exception as exc:
        print(f"[Backfill] Skipped due to error: {exc}")
    try:
        run_bootstrap_admin()
    except Exception as exc:  # never block startup on bootstrap issues
        print(f"[Bootstrap] Skipped due to error: {exc}")


@app.get("/")
def root():
    return {
        "status": "Online",
        "progress_level": "Modules 1-7 Active (Deep learning predictor intentionally out of scope)",
        "dataset_memory_stats": drug_service.get_dataset_stats(),
        "database": db_mode(),
    }


@app.get("/api/health")
def health():
    """Public liveness/environment probe (no secrets, no patient data)."""
    from app.core.settings import app_env
    admin_roles_provisioned = any(u.get("role") in ("admin", "administrator") for u in user_store.list_all())
    return {
        "status": "ok", "version": app.version, "database": db_mode(),
        "mode": app_env(),
        "ddi_dataset": drug_service.dataset_mode(),
        # No PII: just whether ANY platform-admin/hospital-administrator account exists yet, so the
        # sign-in screen can tell a fresh deployment (no account provisioned) from a live one.
        "admin_accounts_provisioned": admin_roles_provisioned,
    }


def _audit(current: Optional[Dict], action: str, rtype: str, rid: str, org_id: Optional[str] = None,
           meta: Optional[Dict[str, Any]] = None) -> None:
    """Audit helper. Metadata must be identifiers/booleans/counts only (Rule 16)."""
    try:
        audit_log_store.log(org_id if org_id is not None else (current or {}).get("org_id"),
                             (current or {}).get("id", "anonymous"), (current or {}).get("role", "anonymous"),
                             action, rtype, rid, meta or {})
    except Exception:  # auditing must never break the user's request
        pass


# ===========================================================================
# MODULE 5: AUTHENTICATION
# ===========================================================================
@app.post("/api/auth/register")
def register(payload: UserSignup):
    org_id = None
    org_name = payload.org or ""
    # Hospital-scoped roles need a real org_id, not just a display string, or
    # they'd be stuck with no hospital access after signing up. Attach them
    # to the named hospital, creating it on first use.
    if payload.role in ("administrator", "doctor", "pharmacist") and org_name.strip():
        org = org_store.find_or_create(org_name)
        org_id = org["id"]
        org_name = org["name"]
    user = user_store.create(payload.name, payload.email, payload.password, payload.role,
                              org=org_name, phone=payload.phone, org_id=org_id)
    token = create_token(user)
    _audit(user, "auth.signup", "user", user["id"], org_id=org_id, meta={"role": user["role"]})
    return {"token": token, "user": public_user(user)}


@app.post("/api/auth/login")
def login(payload: UserLogin):
    try:
        user = user_store.authenticate(payload.email, payload.password)
    except HTTPException as exc:
        known = user_store.get_by_email(payload.email)  # no email/PII is stored in the event
        _audit(known, "auth.login_failed", "user", (known or {}).get("id", "unknown"),
               org_id=(known or {}).get("org_id"),
               meta={"known_account": bool(known), "reason": "suspended" if exc.status_code == 403 else "bad_credentials"})
        raise
    token = create_token(user)
    _audit(user, "auth.login", "user", user["id"])
    return {"token": token, "user": public_user(user)}


@app.get("/api/auth/me")
def me(current: Dict = Depends(get_current_user)):
    return public_user(current)


@app.put("/api/auth/me")
def update_me(payload: ProfileUpdate, current: Dict = Depends(get_current_user)):
    updated = user_store.update_profile(current["id"], payload.model_dump(exclude_none=True))
    _audit(current, "user.profile_update", "user", current["id"])
    return public_user(updated)


@app.put("/api/auth/me/password")
def change_my_password(payload: PasswordChange, current: Dict = Depends(get_current_user)):
    """Self-service password change: the caller must supply their current
    password (verified against the stored hash) before a new one is set --
    unlike the admin-issued/patient-intake password paths, which set a
    password without knowing the old one."""
    fresh = user_store.get_by_id(current["id"])  # re-read: `current` may be a shallow copy from the auth dependency
    if not fresh or not verify_password(payload.current_password, fresh.get("password_hash", "")):
        raise HTTPException(status_code=400, detail="Current password is incorrect.")
    if payload.new_password == payload.current_password:
        raise HTTPException(status_code=400, detail="New password must be different from the current password.")
    user_store.set_password(current["id"], payload.new_password)
    _audit(current, "user.password_change", "user", current["id"])
    return {"status": "ok"}


# ===========================================================================
# HOSPITAL ORGANIZATIONS — bundles doctors, pharmacists & patients together.
# Only the platform admin can create/delete a hospital or move it between
# owners; a hospital administrator can view and edit their OWN hospital's
# details (this is "operations inside the hospital"), but nothing wider.
# ===========================================================================
@app.post("/api/organizations")
def create_organization(payload: OrganizationCreate, current: Dict = Depends(require_roles("admin"))):
    org = org_store.create(payload, created_by=current["id"])
    _audit(current, "organization.create", "organization", org["id"], org_id=org["id"], meta={"name": org["name"]})
    return org


@app.get("/api/organizations")
def list_organizations(current: Dict = Depends(get_current_user)):
    orgs = org_store.list_all()
    if _is_platform_admin(current):
        return orgs
    return [o for o in orgs if o.get("id") == current.get("org_id")]


@app.get("/api/organizations/{org_id}")
def get_organization(org_id: str, current: Dict = Depends(get_current_user)):
    org = org_store.get(org_id)
    if not org:
        raise HTTPException(status_code=404, detail="Organization not found.")
    if not _is_platform_admin(current) and current.get("org_id") != org_id:
        raise HTTPException(status_code=403, detail="You can only view your own organization.")
    return org


@app.put("/api/organizations/{org_id}")
def update_organization(org_id: str, payload: OrganizationUpdate,
                         current: Dict = Depends(require_roles("admin", "administrator"))):
    _require_own_hospital(current, org_id, "You can only update your own hospital's details.")
    patch = payload.model_dump(exclude_none=True)
    if not _is_platform_admin(current):
        # Activating/deactivating a hospital is a platform-level decision.
        patch.pop("status", None)
    updated = org_store.update(org_id, patch)
    if not updated:
        raise HTTPException(status_code=404, detail="Organization not found.")
    _audit(current, "organization.update", "organization", org_id, org_id=org_id, meta={"fields": sorted(patch.keys())})
    return updated


@app.delete("/api/organizations/{org_id}")
def delete_organization(org_id: str, current: Dict = Depends(require_roles("admin"))):
    if user_store.list_by_org(org_id):
        raise HTTPException(status_code=409, detail="Reassign or remove this organization's staff and patients before deleting it.")
    ok = org_store.delete(org_id)
    if not ok:
        raise HTTPException(status_code=404, detail="Organization not found.")
    _audit(current, "organization.delete", "organization", org_id, org_id=org_id)
    return {"status": "deleted", "id": org_id}


@app.get("/api/organizations/{org_id}/users")
def list_organization_users(org_id: str, current: Dict = Depends(require_roles("admin", "administrator"))):
    _require_own_hospital(current, org_id, "You can only view your own hospital's staff.")
    return [public_user(u) for u in user_store.list_by_org(org_id)]


# ===========================================================================
# ADMIN — create & manage user accounts.
# A hospital administrator (role == "administrator") onboards doctor,
# pharmacist and patient accounts, scoped to their own hospital only.
# The platform admin (role == "admin") manages every account in every
# hospital, including other administrator and admin accounts.
# ===========================================================================
@app.get("/api/admin/users")
def admin_list_users(org_id: Optional[str] = None, role: Optional[str] = None,
                      current: Dict = Depends(require_roles("admin", "administrator"))):
    users = user_store.list_all()
    if not _is_platform_admin(current):
        # Hospital administrators only ever see their own hospital's
        # clinical staff and patients — never other hospitals, and never
        # other admin/administrator accounts.
        org_id = require_org(current)
        users = [u for u in users if u.get("role") in HOSPITAL_MANAGED_ROLES]
    if org_id:
        users = [u for u in users if u.get("org_id") == org_id]
    if role:
        users = [u for u in users if u.get("role") == role]
    users = sorted(users, key=lambda u: u.get("created_at", 0), reverse=True)
    return [public_user(u) for u in users]


@app.post("/api/admin/users")
def admin_create_user(payload: AdminUserCreate, current: Dict = Depends(require_roles("admin", "administrator"))):
    _require_hospital_managed_role(current, payload.role,
                                    "Hospital administrators can only create doctor, pharmacist and patient accounts.")
    if not _is_platform_admin(current):
        # Always their own hospital — never selectable by a hospital admin.
        payload.org_id = require_org(current)
    elif payload.role != "admin" and not payload.org_id:
        raise HTTPException(status_code=400, detail="Attach this account to a hospital (org_id is required).")

    org_name = ""
    if payload.org_id:
        org = org_store.get(payload.org_id)
        if not org:
            raise HTTPException(status_code=404, detail="Organization not found.")
        org_name = org["name"]

    patient_id = payload.patient_id
    if patient_id:
        # A login may only be linked to a patient record of the SAME hospital.
        linked = patient_service.get_patient(patient_id)
        if payload.role != "patient" or not linked or linked.get("org_id") != payload.org_id:
            raise HTTPException(status_code=404, detail="Patient record not found in this hospital.")
        if user_store.get_by_patient_id(patient_id):
            raise HTTPException(status_code=409, detail="This patient already has a portal login.")
    elif payload.role == "patient":
        # Root fix: no patient_id explicitly linked -> auto-match an existing
        # clinical record in this hospital by phone/email before ever
        # creating a duplicate, disconnected record.
        matched = patient_service.find_duplicate(payload.org_id, phone=payload.phone, email=payload.email)
        if matched:
            if user_store.get_by_patient_id(matched["id"]):
                raise HTTPException(status_code=409, detail=(
                    f"A patient record matching this phone/email ({matched.get('name', matched['id'])}) "
                    "already has a portal login."
                ))
            patient_id = matched["id"]
        else:
            # Truly no existing record: create a minimal clinical record so
            # the account has something for doctors/pharmacists to attach to.
            record = patient_service.create_full_record({
                "name": payload.name,
                "email": payload.email,
                "phone": payload.phone or "",
                "age": payload.age or 0,
                "gender": payload.gender or "",
                "org_id": payload.org_id,
            }, owner_id=current["id"])
            patient_id = record["id"]

    user = user_store.create(
        payload.name, payload.email, payload.password, payload.role,
        org=org_name, org_id=payload.org_id, phone=payload.phone or "",
        specialization=payload.specialization or "", patient_id=patient_id,
    )
    notification_store.push(
        "admin" if _is_platform_admin(current) else "administrator",
        "New account created",
        f"A new {payload.role} account was created" + (f" · {org_name}" if org_name else ""),
        tone="low", icon="user-check", kind="Users", org_id=payload.org_id,
    )
    _audit(current, "user.create", "user", user["id"], org_id=payload.org_id, meta={"role": payload.role})
    return public_user(user)


@app.get("/api/admin/users/{user_id}")
def admin_get_user(user_id: str, current: Dict = Depends(require_roles("admin", "administrator"))):
    user = user_store.get_by_id(user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found.")
    _require_own_hospital(current, user.get("org_id"), "You can only manage accounts within your own hospital.")
    _require_hospital_managed_role(current, user.get("role"),
                                    "Hospital administrators can only manage doctor, pharmacist and patient accounts.")
    return public_user(user)


@app.put("/api/admin/users/{user_id}")
def admin_update_user(user_id: str, payload: AdminUserUpdate, current: Dict = Depends(require_roles("admin", "administrator"))):
    target = user_store.get_by_id(user_id)
    if not target:
        raise HTTPException(status_code=404, detail="User not found.")
    _require_own_hospital(current, target.get("org_id"), "You can only manage accounts within your own hospital.")
    _require_hospital_managed_role(current, target.get("role"),
                                    "Hospital administrators can only manage doctor, pharmacist and patient accounts.")
    if not _is_platform_admin(current):
        if payload.role is not None and payload.role not in HOSPITAL_MANAGED_ROLES:
            raise HTTPException(status_code=403, detail="Hospital administrators can only assign the doctor, pharmacist or patient role.")
        if payload.org_id is not None and payload.org_id != current.get("org_id"):
            raise HTTPException(status_code=403, detail="You can't move an account to a different hospital.")
    patch = payload.model_dump(exclude_none=True)
    if "org_id" in patch:
        org = org_store.get(patch["org_id"]) if patch["org_id"] else None
        patch["org"] = org["name"] if org else ""
    updated = user_store.update_profile(user_id, patch)
    _audit(current, "user.update", "user", user_id, org_id=target.get("org_id"), meta={"fields": sorted(patch.keys())})
    return public_user(updated)


@app.post("/api/admin/users/{user_id}/status")
def admin_set_user_status(user_id: str, payload: UserStatusUpdate, current: Dict = Depends(require_roles("admin", "administrator"))):
    if current["id"] == user_id and payload.status == "suspended":
        raise HTTPException(status_code=400, detail="You cannot suspend your own account.")
    target = user_store.get_by_id(user_id)
    if not target:
        raise HTTPException(status_code=404, detail="User not found.")
    _require_own_hospital(current, target.get("org_id"), "You can only manage accounts within your own hospital.")
    _require_hospital_managed_role(current, target.get("role"),
                                    "Hospital administrators can only manage doctor, pharmacist and patient accounts.")
    updated = user_store.set_status(user_id, payload.status)
    if not updated:
        raise HTTPException(status_code=404, detail="User not found.")
    _audit(current, "user.status", "user", user_id, org_id=target.get("org_id"), meta={"status": payload.status})
    return public_user(updated)


@app.delete("/api/admin/users/{user_id}")
def admin_delete_user(user_id: str, current: Dict = Depends(require_roles("admin", "administrator"))):
    if current["id"] == user_id:
        raise HTTPException(status_code=400, detail="You cannot delete your own account.")
    target = user_store.get_by_id(user_id)
    if not target:
        raise HTTPException(status_code=404, detail="User not found.")
    _require_own_hospital(current, target.get("org_id"), "You can only manage accounts within your own hospital.")
    _require_hospital_managed_role(current, target.get("role"),
                                    "Hospital administrators can only manage doctor, pharmacist and patient accounts.")
    ok = user_store.delete(user_id)
    if not ok:
        raise HTTPException(status_code=404, detail="User not found.")
    _audit(current, "user.delete", "user", user_id, org_id=target.get("org_id"), meta={"role": target.get("role")})
    return {"status": "deleted", "id": user_id}


# ===========================================================================
# PATIENTS — full CRUD for the Patient Management UI (MongoDB backed).
# Every route: authenticate -> role check -> hospital/assignment/self scope
# (app/core/permissions.py) -> act. Client-supplied org_id/owner_id are never
# trusted; hospital scope is derived from the authenticated user.
# ===========================================================================
_PATIENT_ID_RE = re.compile(r"^P-\d+$")


def _patient_org_for_create(current: Dict, payload: Dict[str, Any]) -> str:
    """Hospital a new patient record belongs to: the caller's own hospital.
    Only the platform admin may choose one (and must pick an existing one)."""
    if _is_platform_admin(current):
        org_id = payload.get("org_id")
        if not org_id or not org_store.get(org_id):
            raise HTTPException(status_code=400, detail="Choose an existing hospital for this patient.")
        return org_id
    return require_org(current)


def _search_org_scope(current: Dict, org_id: Optional[str]) -> Optional[str]:
    """Hospital a reception search is scoped to: the caller's own hospital,
    or (platform admin only) an explicitly chosen existing one."""
    if _is_platform_admin(current):
        if not org_id or not org_store.get(org_id):
            raise HTTPException(status_code=400, detail="Choose an existing hospital to search.")
        return org_id
    return require_org(current)


def _annotate_has_login(current: Dict, patients: List[Dict]) -> List[Dict]:
    """Root fix: admin/administrator views need to see which clinical records
    already have a portal login, so intake can offer 'Create login' only for
    the ones that don't."""
    if current.get("role") not in ("admin", "administrator"):
        return patients
    for p in patients:
        p["has_login"] = user_store.get_by_patient_id(p.get("id")) is not None
    return patients


@app.get("/api/patients")
def list_patients(current: Dict = Depends(get_current_user)):
    return _annotate_has_login(current, list_accessible_patients(current))


@app.get("/api/patients/search")
def search_patients(q: str = "", org_id: Optional[str] = None,
                     current: Dict = Depends(require_roles("admin", "administrator"))):
    """Hospital Administrator patient lookup (target workflow Step 2):
    id / name / phone / email / dob, scoped to one hospital."""
    return _annotate_has_login(current, patient_service.search(_search_org_scope(current, org_id), q))


@app.get("/api/patients/{patient_id}")
def get_patient(patient_id: str, current: Dict = Depends(get_current_user)):
    doc = get_patient_for(current, patient_id, "read")
    if current.get("role") in ("admin", "administrator"):
        doc = dict(doc)
        doc["has_login"] = user_store.get_by_patient_id(patient_id) is not None
    return doc


@app.post("/api/patients")
def create_patient(payload: Dict[str, Any] = Body(...), current: Dict = Depends(require_roles("admin", "administrator", "doctor"))):
    org_id = _patient_org_for_create(current, payload)
    requested_id = payload.get("id")
    allow_duplicate = bool(payload.get("allow_duplicate"))
    initial_password = payload.get("password")
    data = sanitize_patient_payload(payload, current)
    data.pop("allow_duplicate", None)
    data.pop("password", None)

    # Every patient an administrator registers gets a portal account in the
    # same step — no separate "invite" flow. The administrator sets the
    # patient's initial password directly; the patient can change it after
    # logging in. (Doctor-created records, e.g. from the clinical pipeline,
    # are unaffected and stay account-less unless linked later.)
    creating_account = current.get("role") in ("admin", "administrator")
    email = (data.get("email") or "").strip().lower()
    if creating_account:
        if not email:
            raise HTTPException(status_code=422, detail="An email address is required to create the patient's portal account.")
        if not initial_password or len(initial_password) < 8:
            raise HTTPException(status_code=422, detail="Set an initial password (at least 8 characters) for the patient.")
        if user_store.get_by_email(email):
            raise HTTPException(status_code=409, detail="An account with this email already exists.")

    # Duplicate prevention using safe identifying fields (CLAUDE.md Phase 3):
    # same email, or same phone + (matching/blank) dob, inside this hospital.
    if not allow_duplicate:
        dup = patient_service.find_duplicate(org_id, phone=data.get("phone"),
                                              email=data.get("email"), dob=data.get("dob"))
        if dup:
            raise HTTPException(status_code=409, detail={
                "message": "A patient with this phone or email is already registered at this hospital.",
                "existing_patient_id": dup.get("id"), "existing_patient_name": dup.get("name"),
            })
    data["org_id"] = org_id
    # Optimistic UIs propose an ID; accept it only if well-formed and unused,
    # otherwise the server generates one (the response carries the real ID).
    if isinstance(requested_id, str) and _PATIENT_ID_RE.match(requested_id) and not patient_service.get_patient(requested_id):
        data["id"] = requested_id
    try:
        rec = patient_service.create_full_record(data, owner_id=current["id"])
    except ValueError as exc:
        raise HTTPException(status_code=409, detail=str(exc))
    _audit(current, "patient.create", "patient", rec["id"], org_id=org_id)

    if creating_account:
        org = org_store.get(org_id) if org_id else None
        user = user_store.create(
            rec.get("name") or rec["id"], email, initial_password, "patient",
            org=(org["name"] if org else ""), org_id=org_id,
            phone=data.get("phone", ""), patient_id=rec["id"],
        )
        _audit(current, "user.create", "user", user["id"], org_id=org_id,
               meta={"role": "patient", "patient_id": rec["id"], "via": "patient_registration"})
        rec = dict(rec)
        rec["has_login"] = True

    return rec


@app.put("/api/patients/{patient_id}")
def update_patient(patient_id: str, payload: Dict[str, Any] = Body(...), current: Dict = Depends(get_current_user)):
    get_patient_for(current, patient_id, "write")
    clean = sanitize_patient_payload(payload, current)
    updated = patient_service.update_full_record(patient_id, clean)
    if not updated:
        raise HTTPException(status_code=404, detail="Patient not found.")
    _audit(current, "patient.update", "patient", patient_id, org_id=updated.get("org_id"), meta={"fields": sorted(clean.keys())})
    return updated


@app.delete("/api/patients/{patient_id}")
def delete_patient(patient_id: str, current: Dict = Depends(get_current_user)):
    doc = get_patient_for(current, patient_id, "delete")
    ok = patient_service.delete_patient(patient_id)
    if not ok:
        raise HTTPException(status_code=404, detail="Patient not found.")
    _audit(current, "patient.delete", "patient", patient_id, org_id=doc.get("org_id"))
    return {"status": "deleted", "id": patient_id}


@app.put("/api/patients/{patient_id}/medications")
def set_patient_medications(patient_id: str, meds: List[Dict[str, Any]] = Body(...), current: Dict = Depends(get_current_user)):
    target = get_patient_for(current, patient_id, "prescribe")  # doctor-only
    updated = patient_service.set_medications(patient_id, meds)
    if not updated:
        raise HTTPException(status_code=404, detail="Patient not found.")
    _audit(current, "patient.medications_update", "patient", patient_id,
           org_id=target.get("org_id"), meta={"medication_count": len(meds)})
    return updated


@app.post("/api/patients/{patient_id}/login")
def create_patient_login(patient_id: str, payload: PatientLoginCreate,
                          current: Dict = Depends(require_roles("admin", "administrator"))):
    """Grants portal access to an EXISTING clinical record that doesn't have
    one yet (a legacy patient registered before accounts were created
    automatically at intake). The administrator sets the initial password
    here directly; the patient can change it after logging in. Blocks if
    this record already has a login."""
    patient = get_patient_for(current, patient_id, "write")
    if user_store.get_by_patient_id(patient_id):
        raise HTTPException(status_code=409, detail="This patient already has a portal login.")
    org_id = patient.get("org_id")
    org = org_store.get(org_id) if org_id else None
    user = user_store.create(
        patient.get("name") or patient_id, payload.email, payload.password, "patient",
        org=(org["name"] if org else ""), org_id=org_id,
        phone=payload.phone or patient.get("phone", ""), patient_id=patient_id,
    )
    notification_store.push(
        "admin" if _is_platform_admin(current) else "administrator",
        "Portal account created",
        f"Portal login created for {patient.get('name') or patient_id}",
        tone="low", icon="user-check", kind="Users", org_id=org_id,
    )
    _audit(current, "user.create", "user", user["id"], org_id=org_id,
           meta={"role": "patient", "patient_id": patient_id, "via": "intake_link"})
    return public_user(user)


@app.post("/api/patient/register")
def register_patient(patient: PatientClinicalProfile, current: Dict = Depends(require_roles("admin", "doctor"))):
    """Syncs clinical fields into a patient record before a DDI run. Now
    authenticated + scoped: an existing record needs write access; a new
    record is created inside the caller's own hospital only."""
    existing = patient_service.get_patient(patient.patient_id)
    if existing:
        get_patient_for(current, patient.patient_id, "write")
        return patient_service.save_patient(patient)
    if _is_platform_admin(current):
        raise HTTPException(status_code=400, detail="Platform admins cannot register patients without a hospital.")
    saved = patient_service.save_patient(patient, org_id=require_org(current), owner_id=current["id"])
    _audit(current, "patient.create", "patient", patient.patient_id, meta={"via": "pipeline_sync"})
    return saved


# ===========================================================================
# HOSPITAL ADMINISTRATOR INTAKE (Phase 3): doctor availability + appointment/
# queue creation. Target workflow Step 3. Reception-only — this is not the
# doctor's own queue view (Phase 4) or the patient's own visit list.
# ===========================================================================
def _doctor_in_hospital(org_id: str, doctor_id: str) -> Dict:
    doc = user_store.get_by_id(doctor_id)
    if not doc or doc.get("role") != "doctor" or doc.get("org_id") != org_id:
        raise HTTPException(status_code=404, detail="Doctor not found in your hospital.")
    if doc.get("status", "active") != "active":
        raise HTTPException(status_code=400, detail="This doctor's account is suspended.")
    return doc


@app.post("/api/appointments")
def create_appointment(payload: AppointmentCreate, current: Dict = Depends(require_roles("administrator"))):
    """Hospital Administrator assigns a doctor + slot to a patient, creating
    the visit/encounter the doctor's queue is built from (Phase 4)."""
    org_id = require_org(current)
    patient = get_patient_for(current, payload.patient_id, "write")  # 404s if outside this hospital
    doctor = _doctor_in_hospital(org_id, payload.doctor_id)
    apt = appointment_store.create(payload, org_id=org_id, created_by=current["id"])
    notification_store.push_to_user(
        doctor["id"], "New patient assigned",
        "A patient has been assigned to you. Open your queue for details.",
        org_id=org_id, type_="Appointment", reference_type="appointment", reference_id=apt["id"],
        tone="info", icon="user-plus",
    )
    _notify_patient(org_id, patient["id"], "Appointment scheduled",
                    "A visit has been scheduled for you. Open Appointments for details.",
                    "APPOINTMENT", "appointment", apt["id"])
    audit_log_store.log(org_id, current["id"], current["role"], "appointment.create",
                         "appointment", apt["id"],
                         {"patient_id": patient["id"], "doctor_id": doctor["id"]})
    return apt


@app.get("/api/appointments")
def list_appointments(current: Dict = Depends(require_roles("administrator"))):
    """Today's/upcoming queue for the hospital administrator's own hospital."""
    return appointment_store.list_for_org(require_org(current))


def _get_appointment_scoped(current: Dict, appointment_id: str) -> Dict:
    """Load an appointment the caller may see: administrator (own hospital,
    any appointment) or doctor (own hospital AND their own assignment only —
    Rule 6). 404 either way so a guessed ID never confirms existence."""
    apt = appointment_store.get(appointment_id)
    if not apt or not same_org(current, apt.get("org_id")):
        raise HTTPException(status_code=404, detail="Appointment not found.")
    if current["role"] == "doctor" and apt.get("doctor_id") != current["id"]:
        raise HTTPException(status_code=404, detail="Appointment not found.")
    return apt


@app.get("/api/appointments/{appointment_id}")
def get_appointment(appointment_id: str, current: Dict = Depends(require_roles("administrator", "doctor"))):
    return _get_appointment_scoped(current, appointment_id)


# Statuses a doctor may set from the consultation workspace. "Scheduled",
# "Checked In" and "Cancelled" stay reception-only (hospital administrator).
_DOCTOR_APPOINTMENT_STATUSES = ("In Consultation", "Completed", "No Show")


@app.patch("/api/appointments/{appointment_id}/status")
def update_appointment_status(appointment_id: str, payload: AppointmentStatusUpdate,
                               current: Dict = Depends(require_roles("administrator", "doctor"))):
    """Phase 4: appointment lifecycle transitions (task 'Appointment status
    changes')."""
    apt = _get_appointment_scoped(current, appointment_id)
    if current["role"] == "doctor" and payload.status not in _DOCTOR_APPOINTMENT_STATUSES:
        raise HTTPException(status_code=403, detail="A doctor may only set this visit to In Consultation, Completed, or No Show.")
    try:
        updated = appointment_store.update_status(appointment_id, payload.status)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    audit_log_store.log(apt["org_id"], current["id"], current["role"], "appointment.status",
                         "appointment", appointment_id, {"status": payload.status})
    return updated


# ===========================================================================
# DOCTOR CONSULTATION WORKFLOW (Phase 4): assigned-queue + encounter
# (notes/findings/diagnosis/assessment/follow-up). Target workflow Step 4.
# Doctor-only writes; administrator/platform admin get read-only visibility
# for hospital oversight. Full prescription/DDI integration is Phase 5-7.
# ===========================================================================
@app.get("/api/doctor/appointments")
def list_my_appointments(status: Optional[str] = None, current: Dict = Depends(require_roles("doctor"))):
    """The authenticated doctor's own queue, own hospital only (Rule 6).
    `?status=open` filters to Scheduled/Checked In/In Consultation."""
    return appointment_store.list_for_doctor(current["id"], org_id=require_org(current), open_only=(status == "open"))


def _get_encounter_scoped(current: Dict, encounter_id: str, *, require_own: bool = False) -> Dict:
    enc = encounter_store.get(encounter_id)
    if not enc or not same_org(current, enc.get("org_id")):
        raise HTTPException(status_code=404, detail="Consultation not found.")
    if current["role"] == "doctor" and enc.get("doctor_id") != current["id"]:
        raise HTTPException(status_code=404, detail="Consultation not found.")
    if require_own and current["role"] != "doctor":
        raise HTTPException(status_code=403, detail="Only the assigned doctor may edit this consultation.")
    return enc


@app.post("/api/encounters")
def start_encounter(payload: Dict[str, Any] = Body(...), current: Dict = Depends(require_roles("doctor"))):
    """Doctor opens an assigned appointment to begin the consultation
    (creates the encounter the notes/diagnosis attach to; idempotent)."""
    org_id = require_org(current)
    appointment_id = payload.get("appointment_id")
    apt = appointment_store.get(appointment_id) if appointment_id else None
    if not apt or not same_org(current, apt.get("org_id")) or apt.get("doctor_id") != current["id"]:
        raise HTTPException(status_code=404, detail="Appointment not found.")
    if apt.get("status") in ("Cancelled", "No Show"):
        raise HTTPException(status_code=400, detail=f"This visit is {apt['status'].lower()} and cannot be consulted.")
    existing = encounter_store.get_for_appointment(appointment_id)
    if existing:
        return existing
    enc = encounter_store.create(
        EncounterCreate(appointment_id=appointment_id, patient_id=apt["patient_id"], doctor_id=current["id"]),
        org_id=org_id,
    )
    if apt.get("status") != "In Consultation":
        appointment_store.update_status(appointment_id, "In Consultation")
    audit_log_store.log(org_id, current["id"], current["role"], "encounter.start", "encounter", enc["id"],
                         {"appointment_id": appointment_id, "patient_id": apt["patient_id"]})
    return enc


@app.get("/api/appointments/{appointment_id}/encounter")
def get_encounter_for_appointment(appointment_id: str, current: Dict = Depends(require_roles("administrator", "doctor"))):
    _get_appointment_scoped(current, appointment_id)
    enc = encounter_store.get_for_appointment(appointment_id)
    if not enc:
        raise HTTPException(status_code=404, detail="Consultation has not started yet.")
    return enc


@app.get("/api/encounters/{encounter_id}")
def get_encounter(encounter_id: str, current: Dict = Depends(require_roles("admin", "administrator", "doctor"))):
    return _get_encounter_scoped(current, encounter_id)


@app.put("/api/encounters/{encounter_id}")
def update_encounter(encounter_id: str, payload: EncounterUpdate, current: Dict = Depends(require_roles("doctor"))):
    """Doctor records notes/findings/diagnosis/assessment/follow-up
    (task 'Doctor can enter notes/findings/diagnosis')."""
    enc = _get_encounter_scoped(current, encounter_id, require_own=True)
    if enc.get("status") == "Completed":
        raise HTTPException(status_code=400, detail="This consultation is already completed and can no longer be edited.")
    updated = encounter_store.update(encounter_id, payload)
    audit_log_store.log(enc["org_id"], current["id"], current["role"], "encounter.update",
                         "encounter", encounter_id, {"appointment_id": enc["appointment_id"]})
    return updated


@app.post("/api/encounters/{encounter_id}/complete")
def complete_encounter(encounter_id: str, current: Dict = Depends(require_roles("doctor"))):
    """Marks the consultation done and closes the appointment. Completion
    requires at least a recorded diagnosis/assessment, and -- if this
    encounter has an open (non-Cancelled) prescription -- that prescription
    must already be Finalized. A prescription can only reach Finalized after
    a DDI analysis has been run against its current items (see
    /finalize above), so this is the server-side enforcement of 'DDI
    analysis must run before the consultation can be completed'; it can no
    longer be bypassed by calling this endpoint directly."""
    enc = _get_encounter_scoped(current, encounter_id, require_own=True)
    if enc.get("status") == "Completed":
        raise HTTPException(status_code=400, detail="This consultation is already completed.")
    patient = patient_service.get_patient(enc["patient_id"]) or {}
    missing = missing_clinical_fields(patient)
    if missing:
        raise HTTPException(status_code=400, detail={
            "message": "Complete the patient's clinical details before finishing this consultation.",
            "missing_fields": missing,
        })
    if not (enc.get("diagnosis") or "").strip() and not (enc.get("assessment") or "").strip():
        raise HTTPException(status_code=400, detail="Record a diagnosis or assessment before completing the consultation.")
    active_rx = next((r for r in prescription_store.list_for_encounter(encounter_id) if r.get("status") != "Cancelled"), None)
    if active_rx and active_rx.get("status") != "Finalized":
        raise HTTPException(status_code=400,
                             detail="Run the DDI analysis and finalize the open prescription before completing this consultation.")
    updated = encounter_store.complete(encounter_id)
    appointment_store.update_status(enc["appointment_id"], "Completed")
    audit_log_store.log(enc["org_id"], current["id"], current["role"], "encounter.complete",
                         "encounter", encounter_id, {"appointment_id": enc["appointment_id"], "patient_id": enc["patient_id"]})
    return updated


@app.get("/api/patients/{patient_id}/encounters")
def list_patient_encounters(patient_id: str, current: Dict = Depends(require_roles("admin", "administrator", "doctor"))):
    """Consultation history for a patient (task 'Patient history is
    available'). Patients get their sanitized report separately (Phase 8) —
    raw encounter notes stay clinical-staff-only."""
    get_patient_for(current, patient_id, "read")
    return encounter_store.list_for_patient(patient_id)


# ===========================================================================
# PRESCRIPTION WORKFLOW (Phase 5): draft prescription + items attached to a
# doctor's own encounter (target workflow Step 4, tail end). Doctor-only
# writes, Draft-only edits; administrator/platform admin get read-only
# visibility. A prescription cannot be finalized here -- Finalized only
# becomes reachable once the DDI review/high-severity decision workflow
# (Phase 6-7) has run, so that route is intentionally not added yet.
# ===========================================================================
def _get_prescription_scoped(current: Dict, prescription_id: str, *, require_own: bool = False) -> Dict:
    rx = prescription_store.get(prescription_id)
    if not rx or not same_org(current, rx.get("org_id")):
        raise HTTPException(status_code=404, detail="Prescription not found.")
    if current["role"] == "doctor" and rx.get("doctor_id") != current["id"]:
        raise HTTPException(status_code=404, detail="Prescription not found.")
    if require_own and current["role"] != "doctor":
        raise HTTPException(status_code=403, detail="Only the prescribing doctor may edit this prescription.")
    return rx


@app.post("/api/prescriptions")
def create_prescription(payload: Dict[str, Any] = Body(...), current: Dict = Depends(require_roles("doctor"))):
    """Doctor opens the prescription workspace for their own encounter
    (task 'Create draft prescription from encounter'). One active
    (non-Cancelled) prescription per encounter at a time -- edit the
    existing draft with PUT instead of creating another."""
    org_id = require_org(current)
    encounter_id = payload.get("encounter_id")
    enc = encounter_store.get(encounter_id) if encounter_id else None
    if not enc or not same_org(current, enc.get("org_id")) or enc.get("doctor_id") != current["id"]:
        raise HTTPException(status_code=404, detail="Consultation not found.")
    existing = prescription_store.list_for_encounter(encounter_id)
    active = next((r for r in existing if r.get("status") != "Cancelled"), None)
    if active:
        raise HTTPException(status_code=409, detail="A prescription already exists for this consultation. Edit it instead of creating a new one.")
    items = [PrescriptionItemIn(**i) for i in (payload.get("items") or [])]
    rx = prescription_store.create(
        PrescriptionCreate(encounter_id=encounter_id, patient_id=enc["patient_id"], doctor_id=current["id"],
                            clinical_instructions=payload.get("clinical_instructions") or "", items=items),
        org_id=org_id,
    )
    audit_log_store.log(org_id, current["id"], current["role"], "prescription.create", "prescription", rx["id"],
                         {"encounter_id": encounter_id, "patient_id": enc["patient_id"], "item_count": len(items)})
    return rx


@app.get("/api/encounters/{encounter_id}/prescriptions")
def list_encounter_prescriptions(encounter_id: str, current: Dict = Depends(require_roles("admin", "administrator", "doctor"))):
    """All versions for this encounter, newest version first (task
    'Prescription versioning')."""
    enc = _get_encounter_scoped(current, encounter_id)
    return prescription_store.list_for_encounter(enc["id"])


@app.get("/api/prescriptions/{prescription_id}")
def get_prescription(prescription_id: str, current: Dict = Depends(require_roles("admin", "administrator", "doctor"))):
    return _get_prescription_scoped(current, prescription_id)


@app.put("/api/prescriptions/{prescription_id}")
def update_prescription(prescription_id: str, payload: PrescriptionUpdate,
                         current: Dict = Depends(require_roles("doctor"))):
    """Doctor edits medicine items (name/dose/frequency/timing/duration/
    instructions/quantity) and/or the overall clinical instructions
    (tasks 'Add medicine items' through 'Instructions'). Editable as many
    times as the doctor needs, from any status except Finalized/Cancelled
    -- including after a DDI review or a High-severity decision has already
    been recorded. Any edit invalidates whatever DDI result/decision was
    made against the old items, so the prescription always drops back to
    Draft and a fresh /ddi-analysis run (and, if High severity comes back
    again, a fresh /decision) is required before it can be finalized."""
    rx = _get_prescription_scoped(current, prescription_id, require_own=True)
    if rx.get("status") in ("Finalized", "Cancelled"):
        raise HTTPException(status_code=400, detail=f"This prescription is {rx['status']} and can no longer be edited directly.")
    updated = prescription_store.update(prescription_id, payload)
    if rx.get("status") != "Draft":
        updated = prescription_store.update_status(prescription_id, "Draft")
    audit_log_store.log(rx["org_id"], current["id"], current["role"], "prescription.update", "prescription",
                         prescription_id, {"encounter_id": rx["encounter_id"], "item_count": len(updated.get("items", []))})
    return updated


@app.post("/api/prescriptions/{prescription_id}/new-version")
def new_prescription_version(prescription_id: str, current: Dict = Depends(require_roles("doctor"))):
    """Doctor revises a prescription (e.g. after a high-severity DDI
    result in Phase 7): cancels this version and opens the next, carrying
    the items forward for editing."""
    rx = _get_prescription_scoped(current, prescription_id, require_own=True)
    if rx.get("status") == "Cancelled":
        raise HTTPException(status_code=400, detail="This prescription is already cancelled.")
    revised = prescription_store.new_version(prescription_id)
    audit_log_store.log(rx["org_id"], current["id"], current["role"], "prescription.new_version", "prescription",
                         revised["id"], {"encounter_id": rx["encounter_id"], "previous_id": prescription_id, "version": revised["version"]})
    return revised


@app.get("/api/patients/{patient_id}/prescriptions")
def list_patient_prescriptions(patient_id: str, current: Dict = Depends(require_roles("admin", "administrator", "doctor"))):
    """Prescription history for a patient, across encounters -- same
    clinical-staff-only scoping as consultation history."""
    get_patient_for(current, patient_id, "read")
    return prescription_store.list_for_patient(patient_id)


# ===========================================================================
# PHASE 6: DOCTOR-ONLY DDI ANALYSIS (module 11, prescription-linked)
# Reuses Modules 2-4 exactly as the existing /api/pipeline/process-and-fuse
# route below does, but scoped to a doctor's own prescription instead of a
# free-form patient_id + two brand names, and persisted against
# encounter/prescription/patient/doctor via module11 (task 'Link analysis
# to prescription + encounter + patient + doctor'). Doctor-only end to end
# -- no administrator/pharmacist/patient route reads this data (task
# 'Doctor-only access'); see module13_reports.py for why it can never leak
# into the patient/admin report either.
# ===========================================================================
def _severity_rank(sev: Optional[str]) -> int:
    s = (sev or "").lower()
    if "high" in s:
        return 2
    if "moderate" in s:
        return 1
    return 0


_SEVERITY_LABEL = {0: "Low", 1: "Moderate", 2: "High"}


def _map_medicine_names(names: List[str], origin: str) -> List[Dict[str, Any]]:
    """Module 2: map a list of medicine names to their canonical generic,
    tagging each with where it came from (task 'Preserve current drug
    mapping ... modules'). Shared by both DDI entry points below so a name
    is never mapped two different ways depending on which page ran it."""
    mapped = []
    for name in names:
        name = (name or "").strip()
        if not name:
            continue
        m = drug_service.map_to_generic(name)
        primary = m["generics"][0] if m["generics"] else name
        mapped.append({"medicine_name": name, "canonical_name": primary, "mapping_source": m["source"], "origin": origin})
    return mapped


def _pairwise_ddi(mapped: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Module 2: ground-truth pairwise lookup across every combination of
    already-mapped medicines. The single shared implementation behind both
    /api/ddi/check (standalone DDI Analysis Workspace) and
    /api/prescriptions/{id}/ddi-analysis (prescription workspace) -- this is
    what guarantees the two pages can never disagree about a result."""
    pairs: List[Dict[str, Any]] = []
    for i in range(len(mapped)):
        for j in range(i + 1, len(mapped)):
            a, b = mapped[i], mapped[j]
            known = drug_service.query_known_interaction(a["canonical_name"], b["canonical_name"])
            pairs.append({
                "drug_a": a["medicine_name"], "drug_a_canonical": a["canonical_name"], "drug_a_origin": a["origin"],
                "drug_b": b["medicine_name"], "drug_b_canonical": b["canonical_name"], "drug_b_origin": b["origin"],
                "interaction_found": known.get("interaction_found", False),
                "severity": known.get("known_severity", "Low"),
                "interaction_type": known.get("interaction_type", "None"),
                "description": known.get("description", ""),
                "data_source": known.get("data_source", ""),
                "mechanism": known.get("mechanism"),
                "effects": known.get("effects"),
                "recommendation": known.get("recommendation"),
                "confidence": known.get("confidence"),
                "evidence": known.get("evidence"),
                "involves_existing_medication": a["origin"] == "existing" or b["origin"] == "existing",
            })
    return pairs


def _patient_ddi_factors(patient_data: Dict[str, Any]) -> List[str]:
    """Module 3: same patient-factor rules used everywhere a DDI result is
    computed, shared for the same reason as _pairwise_ddi above."""
    egfr_val = patient_data.get("kidney_function_egfr", patient_data.get("egfr", 90.0))
    alt_val = patient_data.get("liver_function_alt", patient_data.get("alt", 25.0))
    age_val = patient_data.get("age", 50)
    factors = []
    if egfr_val < 60.0:
        factors.append(f"RENAL IMPAIRMENT (eGFR = {egfr_val} mL/min) - impairs drug clearance")
    if alt_val > 50.0:
        factors.append(f"HEPATIC IMPAIRMENT (ALT = {alt_val} U/L) - alters hepatic drug metabolism")
    if age_val > 65:
        factors.append(f"GERIATRIC PATIENT (age {age_val}) - higher sensitivity to adverse drug events")
    return factors


class DDICheckRequest(BaseModel):
    patient_id: str
    medications: List[str] = []


@app.post("/api/ddi/check")
def ddi_check(payload: DDICheckRequest, current: Dict = Depends(require_roles("doctor"))):
    """Ad-hoc DDI check for the standalone DDI Analysis Workspace (task
    'result of ddi and suggestion should be same' as the prescription
    workspace): runs the *exact same* Module 2 ground-truth lookup and
    Module 3 patient-factor rules as /api/prescriptions/{id}/ddi-analysis
    below via the shared helpers above, so the two pages can never disagree.
    Not persisted -- this is exploratory (freely add/remove medicines from
    the list); the saved, authoritative record for a prescription is still
    only created by the prescription-linked route."""
    patient_data = get_patient_for(current, payload.patient_id, "read")
    mapped = _map_medicine_names(payload.medications, origin="existing")
    pairs = _pairwise_ddi(mapped)
    overall_severity = _SEVERITY_LABEL[max((_severity_rank(p["severity"]) for p in pairs), default=0)]
    return {
        "pairs": pairs, "overall_severity": overall_severity,
        "patient_factors": _patient_ddi_factors(patient_data),
        "engine_version": "modules-1-4",
        "source": "Baseline DDI ground truth + patient factor rules",
    }


@app.post("/api/prescriptions/{prescription_id}/ddi-analysis")
def run_ddi_analysis(prescription_id: str, current: Dict = Depends(require_roles("doctor"))):
    """Doctor runs DDI analysis on their own Draft/Under-DDI-Review
    prescription (task 'DDI starts from a prescription'). Every medicine
    pair on the prescription is checked against Module 2's ground-truth
    lookup (task 'Analyze all medication pairs') -- that lookup, not the
    Module 4 fusion placeholder, sets `overall_severity`, so a missing
    interaction can never be silently skipped."""
    rx = _get_prescription_scoped(current, prescription_id, require_own=True)
    if rx.get("status") not in ("Draft", "Under DDI Review"):
        raise HTTPException(status_code=400, detail=f"This prescription is {rx['status']}; DDI analysis only runs on an editable draft.")
    items = rx.get("items", [])
    if not items:
        raise HTTPException(status_code=400, detail="Add at least one medicine before running DDI analysis.")

    patient_data = get_patient_for(current, rx["patient_id"], "read")

    # Module 2: map every item to its canonical generic, via the same
    # helper /api/ddi/check uses (task 'Preserve current drug mapping ...
    # modules').
    mapped = _map_medicine_names([item.get("medicine_name", "") for item in items], origin="prescription")

    # Per product decision: DDI analysis on the prescription workspace only
    # covers the medicines currently written on *this* prescription version
    # -- it no longer pulls in the patient's other active medications, so
    # the result reflects exactly what the doctor entered here.
    existing_medication_count = 0

    # Module 2: ground-truth pairwise lookup across every combination --
    # including prescription-vs-existing-medication pairs, not only
    # prescription-vs-prescription ones. Same shared helper /api/ddi/check
    # uses, so the two pages can never disagree about a result.
    pairs = _pairwise_ddi(mapped)

    # Module 3: same patient-factor rules as /api/ddi/check, run once for
    # the whole prescription.
    patient_tensor = preprocessor.preprocess_patient_features(patient_data).unsqueeze(0)
    patient_factors = _patient_ddi_factors(patient_data)

    # Module 4 (part 1): fusion tensor reported as a separate, clearly
    # non-authoritative shape/readiness placeholder (task 'Keep ML
    # prediction placeholder separate from ground-truth lookup') -- it
    # never contributes to `overall_severity`.
    mock_drug1_embed = torch.randn(1, 16)
    mock_drug2_embed = torch.randn(1, 16)
    fused_tensor = fusion_layer(patient_tensor, mock_drug1_embed, mock_drug2_embed)
    ml_placeholder = {
        "fused_tensor_shape": list(fused_tensor.shape),
        "status": "Shape/readiness placeholder only -- not a trained interaction predictor. "
                  "The ground-truth lookup above is authoritative for severity.",
    }

    overall_severity = _SEVERITY_LABEL[max((_severity_rank(p["severity"]) for p in pairs), default=0)]

    analysis = ddi_analysis_store.record(
        DDIAnalysisCreate(
            encounter_id=rx["encounter_id"], prescription_id=rx["id"], patient_id=rx["patient_id"],
            doctor_id=current["id"], pairs=pairs, overall_severity=overall_severity,
            patient_factors=patient_factors, engine_version="modules-1-4",
            source="Baseline DDI ground truth + patient factor rules",
        ),
        org_id=rx["org_id"],
    )
    analysis["ml_placeholder"] = ml_placeholder  # engine/source shown clearly, never persisted as ground truth
    analysis["existing_medication_count"] = existing_medication_count  # how many pairs pulled in the
                                                                        # patient's other active medicines,
                                                                        # surfaced so the doctor understands
                                                                        # why a result may differ from a run
                                                                        # against this version's items alone

    # Phase 7 (task 'Detect highest severity'): a High result routes the
    # prescription into the decision-required state instead of the plain
    # review state, which is what blocks /finalize below until the doctor
    # explicitly records a decision (task 'Require explicit confirmation
    # before finalization'). Re-running analysis after edits re-evaluates
    # this every time, so an improved (or worsened) result is never stale.
    next_status = "Awaiting Doctor Decision" if overall_severity == "High" else "Under DDI Review"
    prescription_store.update_status(prescription_id, next_status)

    audit_log_store.log(rx["org_id"], current["id"], current["role"], "ddi_analysis.run", "prescription",
                         prescription_id, {"encounter_id": rx["encounter_id"], "pair_count": len(pairs),
                                            "overall_severity": overall_severity, "next_status": next_status})
    return analysis


@app.get("/api/prescriptions/{prescription_id}/ddi-analyses")
def list_ddi_analyses(prescription_id: str, current: Dict = Depends(require_roles("doctor"))):
    """History of DDI runs for this prescription version, newest first --
    doctor-own only, same as every other route in this section."""
    rx = _get_prescription_scoped(current, prescription_id, require_own=True)
    return ddi_analysis_store.list_for_prescription(rx["id"])


@app.get("/api/prescriptions/{prescription_id}/ddi-analysis")
def latest_ddi_analysis(prescription_id: str, current: Dict = Depends(require_roles("doctor"))):
    """Latest DDI run only -- what the prescription workspace polls after
    calling POST above."""
    rx = _get_prescription_scoped(current, prescription_id, require_own=True)
    latest = ddi_analysis_store.latest_for_prescription(rx["id"])
    if not latest:
        raise HTTPException(status_code=404, detail="No DDI analysis has been run for this prescription yet.")
    return latest


# ===========================================================================
# PHASE 7: HIGH-SEVERITY DOCTOR DECISION + FINALIZATION (module 12)
# A High-severity DDI result (set by run_ddi_analysis above) puts the
# prescription into "Awaiting Doctor Decision", which is the only status
# /finalize refuses outright -- the doctor must first call /decision here
# (task 'Record doctor's decision') before finalization becomes reachable
# again (task 'Require explicit confirmation before finalization'). Nothing
# in this file ever substitutes a medicine or a "safer alternative" on the
# doctor's behalf (task 'Never auto-replace a medicine' / CLAUDE.md Rule 10)
# -- module2_drug has no alternative-suggestion data source, so the response
# below says that plainly instead of inventing one (task 'Show possible
# alternatives only where supported by actual data').
# ===========================================================================
@app.post("/api/prescriptions/{prescription_id}/decision")
def record_doctor_decision(prescription_id: str, payload: Dict[str, Any] = Body(...),
                            current: Dict = Depends(require_roles("doctor"))):
    """Doctor reviews the High-severity alert and explicitly records what
    they chose to do (task 'Let doctor evaluate alternatives' / 'Record
    doctor's decision'). Only valid from 'Awaiting Doctor Decision', and
    only against the analysis that actually triggered it -- this can never
    be called speculatively to pre-clear a prescription that hasn't been
    (re-)analyzed since its last edit."""
    rx = _get_prescription_scoped(current, prescription_id, require_own=True)
    if rx.get("status") != "Awaiting Doctor Decision":
        raise HTTPException(status_code=400,
                             detail="A doctor decision is only required after a High-severity DDI result.")
    latest = ddi_analysis_store.latest_for_prescription(rx["id"])
    if not latest or latest.get("overall_severity") != "High":
        raise HTTPException(status_code=400, detail="No High-severity DDI analysis is pending review.")

    decision = payload.get("decision")
    if decision not in DECISIONS:
        raise HTTPException(status_code=400, detail=f"decision must be one of {', '.join(DECISIONS)}")
    reason = (payload.get("reason") or "").strip()
    if not reason:
        raise HTTPException(status_code=400,
                             detail="A short reason is required when recording a high-severity decision.")

    record = doctor_decision_store.create(
        DoctorDecisionCreate(
            encounter_id=rx["encounter_id"], prescription_id=rx["id"], doctor_id=current["id"],
            analysis_id=latest["id"], decision=decision,
            selected_alternatives=payload.get("selected_alternatives") or [], reason=reason,
        ),
        org_id=rx["org_id"],
    )
    prescription_store.update_status(prescription_id, "Doctor Decision Recorded")
    audit_log_store.log(rx["org_id"], current["id"], current["role"], "doctor_decision.record", "prescription",
                         prescription_id, {"encounter_id": rx["encounter_id"], "analysis_id": latest["id"],
                                            "decision": decision})
    return record


@app.get("/api/prescriptions/{prescription_id}/decisions")
def list_doctor_decisions(prescription_id: str, current: Dict = Depends(require_roles("doctor"))):
    """History of decisions recorded for this prescription version,
    newest first -- doctor-own only, same scoping as the DDI routes."""
    rx = _get_prescription_scoped(current, prescription_id, require_own=True)
    return doctor_decision_store.list_for_prescription(rx["id"])


@app.post("/api/prescriptions/{prescription_id}/finalize")
def finalize_prescription(prescription_id: str, current: Dict = Depends(require_roles("doctor"))):
    """The only route that can move a prescription to Finalized (task
    'Require explicit confirmation before finalization'). Low/Moderate
    results finalize straight from 'Under DDI Review'; a High result must
    have passed through /decision first ('Doctor Decision Recorded') --
    this is the actual server-side enforcement of 'a High interaction must
    block automatic prescription finalization', not just a frontend
    button state."""
    rx = _get_prescription_scoped(current, prescription_id, require_own=True)
    status = rx.get("status")
    if status == "Finalized":
        raise HTTPException(status_code=400, detail="This prescription is already finalized.")
    if status == "Cancelled":
        raise HTTPException(status_code=400, detail="This prescription is cancelled and cannot be finalized.")
    if status == "Draft":
        raise HTTPException(status_code=400, detail="Run DDI analysis before finalizing this prescription.")

    latest = ddi_analysis_store.latest_for_prescription(rx["id"])
    if not latest:
        raise HTTPException(status_code=400, detail="DDI analysis is required before finalization.")

    if latest.get("overall_severity") == "High":
        if status != "Doctor Decision Recorded":
            raise HTTPException(status_code=400,
                                 detail="This prescription has a High-severity interaction and requires an "
                                        "explicit doctor decision before it can be finalized.")
    elif status not in ("Under DDI Review", "Doctor Decision Recorded"):
        raise HTTPException(status_code=400, detail=f"This prescription is {status} and cannot be finalized yet.")

    finalized = prescription_store.finalize(prescription_id)
    audit_log_store.log(rx["org_id"], current["id"], current["role"], "prescription.finalize", "prescription",
                         prescription_id, {"encounter_id": rx["encounter_id"], "overall_severity":
                                            latest.get("overall_severity")})
    _ensure_report(finalized, current)  # Phase 8: hand the report to the hospital administrator
    _sync_patient_medications(finalized)  # keep patients.meds current so the next consultation's
                                           # "Current medications" card and DDI checks see this prescription
    return finalized


def _sync_patient_medications(finalized_rx: Dict) -> None:
    """Replaces `patients.meds` with exactly this just-finalized
    prescription's items -- not merged with whatever was there before --
    so `patients.meds` (what the DDI checker and DDI analysis treat as
    "current medications", and what the patient profile's "Already
    taking" card shows) always reflects only the *latest* consultation's
    medicines. Previously this merged by name, so a medicine dropped in a
    later prescription stayed in the DDI check forever; now finalizing a
    new prescription is what defines the patient's current medication
    list, full stop."""
    meds = []
    seen = set()
    for item in finalized_rx.get("items", []):
        name = (item.get("medicine_name") or "").strip()
        key = name.lower()
        if not name or key in seen:
            continue
        seen.add(key)
        meds.append({
            "name": name, "dose": " ".join(filter(None, [item.get("dose"), item.get("unit")])).strip(),
            "frequency": item.get("frequency"), "prescription_id": finalized_rx.get("id"),
        })
    patient_service.set_medications(finalized_rx.get("patient_id"), meds)


# ===========================================================================
# FINAL PATIENT/ADMIN REPORT (Phase 8). Built ONLY through
# module13.build_patient_view (explicit allowlist) from a Finalized
# prescription + its encounter. No DDI document is ever loaded here, so
# DDI/severity/score/reasoning cannot reach a report response.
# Lifecycle: Draft (auto-created on finalize, admin/doctor only) -> Finalized
# + patient_visible (released by the hospital administrator).
# ===========================================================================
def _ensure_report(rx: Dict, actor: Dict) -> Dict:
    """Idempotent: one report per finalized prescription. Notifies the
    hospital's active administrators (reference only -- no PHI)."""
    existing = report_store.get_for_prescription(rx["id"])
    if existing:
        return existing
    rpt = report_store.create(ReportCreate(encounter_id=rx["encounter_id"], patient_id=rx["patient_id"],
                                            doctor_id=rx["doctor_id"], prescription_id=rx["id"]), org_id=rx["org_id"])
    audit_log_store.log(rx["org_id"], actor["id"], actor["role"], "report.generate", "report", rpt["id"],
                         {"prescription_id": rx["id"], "patient_id": rx["patient_id"]})
    for u in user_store.list_by_org(rx["org_id"]):
        if u.get("role") == "administrator" and str(u.get("status", "active")).lower() == "active":
            notification_store.push_to_user(u["id"], "Report ready for release",
                                             "A finalized prescription report is ready for release.",
                                             org_id=rx["org_id"], type_="REPORT_READY",
                                             reference_type="report", reference_id=rpt["id"])
    return rpt


def _get_report_scoped(current: Dict, report_id: str) -> Dict:
    r = report_store.get(report_id)
    if not r:
        raise HTTPException(status_code=404, detail="Report not found.")
    role = current["role"]
    if role == "patient":
        if not current.get("patientId") or r.get("patient_id") != current["patientId"] \
                or not same_org(current, r.get("org_id")) or not r.get("patient_visible"):
            raise HTTPException(status_code=404, detail="Report not found.")
    elif not same_org(current, r.get("org_id")) or (role == "doctor" and r.get("doctor_id") != current["id"]):
        raise HTTPException(status_code=404, detail="Report not found.")
    return r


def _report_view(r: Dict) -> Dict:
    rx = prescription_store.get(r["prescription_id"]) or {}
    enc = encounter_store.get(r["encounter_id"]) or {}
    pat = patient_service.get_patient(r["patient_id"]) if hasattr(patient_service, "get_patient") else None
    pat = pat or {}
    doc = user_store.get_by_id(r["doctor_id"]) or {}
    hosp = org_store.get(r["org_id"]) or {}
    return build_patient_view(r, hosp, pat, doc, enc, rx)


_REPORT_ROLES = ("administrator", "doctor", "patient")


@app.post("/api/reports/from-prescription/{prescription_id}")
def report_from_prescription(prescription_id: str, current: Dict = Depends(require_roles("administrator", "doctor"))):
    rx = _get_prescription_scoped(current, prescription_id)
    if rx.get("status") != "Finalized":
        raise HTTPException(status_code=400, detail="A report can only be generated from a finalized prescription.")
    return _report_view(_ensure_report(rx, current))


@app.get("/api/reports")
def list_reports(current: Dict = Depends(require_roles(*_REPORT_ROLES))):
    """Report history. Patient: own released reports; administrator: own
    hospital; doctor: own reports. Summaries only (allowlisted view)."""
    role = current["role"]
    if role == "patient":
        rows = report_store.list_for_patient(current["patientId"], visible_only=True) if current.get("patientId") else []
        rows = [r for r in rows if same_org(current, r.get("org_id"))]
    else:
        rows = report_store.list_for_org(require_org(current))
        if role == "doctor":
            rows = [r for r in rows if r.get("doctor_id") == current["id"]]
    out = []
    for r in rows:
        v = _report_view(r)
        out.append({"id": v["id"], "report_number": v["report_number"], "status": v["status"],
                    "patient_visible": v["patient_visible"], "generated_at": v["generated_at"],
                    "patient": {"id": v["patient"]["id"], "name": v["patient"]["name"]},
                    "doctor": {"name": v["doctor"]["name"]}, "medicine_count": len(v["medicines"])})
    return out


@app.get("/api/reports/{report_id}")
def get_report(report_id: str, current: Dict = Depends(require_roles(*_REPORT_ROLES))):
    return _report_view(_get_report_scoped(current, report_id))


@app.post("/api/reports/{report_id}/release")
def release_report(report_id: str, current: Dict = Depends(require_roles("administrator"))):
    """Hospital administrator hands the report to the patient (Step 8)."""
    r = _get_report_scoped(current, report_id)
    if r.get("status") != "Finalized":
        r = report_store.finalize(report_id, patient_visible=True)
        audit_log_store.log(r["org_id"], current["id"], current["role"], "report.release", "report", report_id,
                             {"patient_id": r["patient_id"]})
        for u in user_store.list_by_org(r["org_id"]):
            if u.get("role") == "patient" and u.get("patientId") == r["patient_id"]:
                notification_store.push_to_user(u["id"], "Report available", "Your report is ready to view.",
                                                 org_id=r["org_id"], type_="REPORT_RELEASED",
                                                 reference_type="report", reference_id=report_id)
    return _report_view(r)


@app.post("/api/reports/{report_id}/log-access")
def log_report_access(report_id: str, payload: Dict[str, Any] = Body(...),
                       current: Dict = Depends(require_roles(*_REPORT_ROLES))):
    r = _get_report_scoped(current, report_id)
    action = "report.print" if payload.get("action") == "print" else "report.download"
    audit_log_store.log(r["org_id"], current["id"], current["role"], action, "report", report_id, {})
    return {"success": True}


# ===========================================================================
# MODULES 2-4: DRUG MAPPING, PREPROCESSING & FEATURE FUSION PIPELINE
# ===========================================================================
@app.post("/api/pipeline/process-and-fuse")
def process_and_fuse(patient_id: str, drug_a_brand: str, drug_b_brand: str,
                      current: Dict = Depends(require_roles("doctor"))):
    # Phase 6: doctor-only, per the CLAUDE.md Phase 2 known-limitation note
    # and CLAUDE.md 7.4's role table (pharmacist "Must NOT ... run doctor-
    # only DDI workflow"). The free-form two-drug workspace below and the
    # prescription-linked module11 analysis above share these same Module
    # 2-4 services but are otherwise independent records.
    # ------------------------------------------------------------------
    # 1. MODULE 1: PATIENT CLINICAL DATA RETRIEVAL
    # ------------------------------------------------------------------
    patient_data = get_patient_for(current, patient_id, "read")

    # ------------------------------------------------------------------
    # 2. MODULE 2 & 3: STEP-BY-STEP DRUG MAPPING & RESOLUTION
    # ------------------------------------------------------------------
    clean_a = preprocessor.clean_text(drug_a_brand)
    clean_b = preprocessor.clean_text(drug_b_brand)

    mapping_a = drug_service.map_to_generic(drug_a_brand)
    mapping_b = drug_service.map_to_generic(drug_b_brand)

    generics_a = mapping_a["generics"]
    generics_b = mapping_b["generics"]

    primary_generic_a = generics_a[0] if generics_a else drug_a_brand
    primary_generic_b = generics_b[0] if generics_b else drug_b_brand

    drug_mapping_process = {
        "drug_a": {
            "brand_input": drug_a_brand,
            "cleaned_string": clean_a,
            "extracted_generic_salts": generics_a,
            "canonical_active_compound": primary_generic_a,
            "data_source": mapping_a["source"]
        },
        "drug_b": {
            "brand_input": drug_b_brand,
            "cleaned_string": clean_b,
            "extracted_generic_salts": generics_b,
            "canonical_active_compound": primary_generic_b,
            "data_source": mapping_b["source"]
        }
    }

    # ------------------------------------------------------------------
    # 3. MODULE 2: BASELINE GROUND TRUTH DDI LOOKUP
    # ------------------------------------------------------------------
    known_ddi = drug_service.query_known_interaction(primary_generic_a, primary_generic_b)

    # ------------------------------------------------------------------
    # 4. MODULE 3: PATIENT CLINICAL FEATURE PREPROCESSING & IMPACT
    # ------------------------------------------------------------------
    patient_tensor = preprocessor.preprocess_patient_features(patient_data).unsqueeze(0)  # Shape: [1, 7]
    p_vec = patient_tensor.squeeze(0).tolist()

    egfr_val = patient_data.get("kidney_function_egfr", patient_data.get("egfr", 90.0))
    alt_val = patient_data.get("liver_function_alt", patient_data.get("alt", 25.0))
    age_val = patient_data.get("age", 50)

    affecting_patient_factors = []
    if egfr_val < 60.0:
        affecting_patient_factors.append(f"RENAL IMPAIRMENT DETECTED (eGFR = {egfr_val} mL/min) - Impairs drug clearance")
    if alt_val > 50.0:
        affecting_patient_factors.append(f"HEPATIC IMPAIRMENT DETECTED (ALT = {alt_val} U/L) - Alters hepatic drug metabolism")
    if age_val > 65:
        affecting_patient_factors.append(f"GERIATRIC PATIENT (Age = {age_val}) - Higher sensitivity to adverse drug events")

    patient_clinical_impact = {
        "age": age_val,
        "kidney_function_egfr": egfr_val,
        "liver_function_alt": alt_val,
        "patient_factors_affecting_ddi_risk": affecting_patient_factors if affecting_patient_factors else ["No organ impairment flags triggered."]
    }

    # ------------------------------------------------------------------
    # 5. MODULE 4 (PART 1): PYTORCH FEATURE FUSION LAYER
    # ------------------------------------------------------------------
    mock_drug1_embed = torch.randn(1, 16)
    mock_drug2_embed = torch.randn(1, 16)
    fused_tensor = fusion_layer(patient_tensor, mock_drug1_embed, mock_drug2_embed)

    feature_fusion_output = {
        "fused_multimodal_tensor_shape": list(fused_tensor.shape),
        "status": "Patient & Drug Vectors Successfully Fused (Ready for Module 4 Part 2 Deep Learning Predictor)"
    }

    print("\n" + "=" * 75)
    print("         DRUG MAPPING & FEATURE FUSION PIPELINE (MODULES 1 - 4.1)")
    print("=" * 75)
    print(" [1. DRUG MAPPING PROCESS]")
    print(f"     Drug A: '{drug_a_brand}' -> Cleaned: '{clean_a}' -> Active: '{primary_generic_a}'")
    print(f"     Drug B: '{drug_b_brand}' -> Cleaned: '{clean_b}' -> Active: '{primary_generic_b}'")
    print(" [2. PATIENT CLINICAL DATA CONNECTION]")
    print(f"     Patient ID : {patient_id} (Age {age_val})")
    print(f"     eGFR/Kidney: {egfr_val} (Flag: {p_vec[5]}) | ALT/Liver: {alt_val} (Flag: {p_vec[6]})")
    print(f"     Impact     : {affecting_patient_factors if affecting_patient_factors else 'Normal Physiological Range'}")
    print(f" [3. BASELINE DDI GROUND TRUTH]: Severity {known_ddi.get('known_severity', 'Low')}")
    print(f" [4. PATIENT FEATURE VECTOR]: Shape {list(patient_tensor.shape)} (7 Normalized Features)")
    print(f" [5. FUSED MULTIMODAL TENSOR]: Shape {list(fused_tensor.shape)} [1, 32]")
    print("=" * 75 + "\n")

    result = {
        "patient_id": patient_id,
        "drug_mapping_process": drug_mapping_process,
        "patient_clinical_impact": patient_clinical_impact,
        "baseline_ddi_ground_truth": known_ddi,
        "feature_fusion_layer_output": feature_fusion_output
    }

    # ------------------------------------------------------------------
    # MODULE 7: PERSIST ANALYSIS HISTORY + real-time notification/review
    # ------------------------------------------------------------------
    severity = known_ddi.get("known_severity", "Low") if known_ddi.get("interaction_found") else "Low"
    requested_by = current.get("name") if current else None
    analysis_store.record(patient_id, drug_a_brand, drug_b_brand, severity,
                           known_ddi.get("interaction_found", False), requested_by, result,
                           org_id=patient_data.get("org_id"))
    _audit(current, "ddi_pipeline.run", "patient", patient_id, org_id=patient_data.get("org_id"),
           meta={"severity": severity, "interaction_found": known_ddi.get("interaction_found", False)})

    if known_ddi.get("interaction_found") and str(severity).lower().startswith("high"):
        # Only the requesting clinician is alerted (no other doctor, no
        # patient), and the alert carries a reference instead of drug names.
        notification_store.push_to_user(
            current["id"], "High severity interaction detected",
            f"Patient {patient_id} — open the DDI workspace to review.",
            org_id=patient_data.get("org_id"), type_="Alerts",
            reference_type="patient", reference_id=patient_id, tone="high", icon="alert",
        )

    return result


# ===========================================================================
# MODULE 5: PHARMACIST REVIEW QUEUE (hospital-scoped)
# ===========================================================================
@app.get("/api/reviews")
def list_reviews(current: Dict = Depends(get_current_user)):
    role = current.get("role")
    if role == "patient":
        return []  # patients have no review queue
    if _is_platform_admin(current):
        return review_store.list_all()
    return filter_by_patient_access(current, review_store.list_for_org(require_org(current)))


@app.post("/api/reviews")
def create_review(payload: Dict[str, Any] = Body(...), current: Dict = Depends(require_roles("doctor", "pharmacist", "admin"))):
    patient = get_patient_for(current, str(payload.get("patient_id") or ""), "read")
    review = review_store.create(
        patient_id=patient["id"],
        requested_by=current.get("name", "Unknown"),
        requested_by_id=current["id"],
        priority=payload.get("priority", "Medium"),
        note=payload.get("note"),
        org_id=patient.get("org_id"),
    )
    notification_store.push("clinician", "Pharmacist review requested",
                             f"{patient['id']} · requested by {current.get('name', 'a clinician')}",
                             tone="moderate", icon="clipboard", kind="Reviews", org_id=patient.get("org_id"))
    return review


@app.post("/api/reviews/{review_id}/submit")
def submit_review(review_id: str, decision: Dict[str, Any] = Body(...),
                   current: Dict = Depends(require_roles("pharmacist", "admin"))):
    review = review_store.get(review_id)
    if not review or not can_access_patient(current, {"id": review.get("patient_id"), "org_id": review.get("org_id")}, "read"):
        raise HTTPException(status_code=404, detail="Review not found.")
    updated = review_store.submit(review_id, decision)
    if not updated:
        raise HTTPException(status_code=404, detail="Review not found.")
    body = f"{updated['patient_id']} · {decision.get('decision', 'Reviewed')} by {current.get('name')}"
    if updated.get("requested_by_id"):
        notification_store.push_to_user(updated["requested_by_id"], "Pharmacist review completed", body,
                                         org_id=updated.get("org_id"), type_="Reviews",
                                         reference_type="review", reference_id=review_id, tone="low", icon="user-check")
    else:
        notification_store.push("clinician", "Pharmacist review completed", body,
                                 tone="low", icon="user-check", kind="Reviews", org_id=updated.get("org_id"))
    return updated


# ===========================================================================
# PHARMACY ORDERS & DISPENSING (Phase 9). Hospital administrator sends a
# Finalized prescription; the pharmacist (same hospital only) accepts and
# records per-item dispensing. The pharmacy view is an explicit allowlist --
# patient identity/allergies, medicines and dispensing state only. No DDI
# analysis, decision or consultation notes are ever loaded here.
# ===========================================================================
_ITEM_FINAL = ("Dispensed", "Unavailable")


def _pharmacy_active_pharmacists(org_id: str) -> List[Dict]:
    return [u for u in user_store.list_by_org(org_id)
            if u.get("role") == "pharmacist" and str(u.get("status", "active")).lower() == "active"]


def _get_order_scoped(current: Dict, order_id: str) -> Dict:
    o = pharmacy_order_store.get(order_id)
    if not o or not same_org(current, o.get("org_id")):
        raise HTTPException(status_code=404, detail="Pharmacy order not found.")
    if current["role"] == "pharmacist" and o.get("pharmacist_id") not in (None, current["id"]):
        raise HTTPException(status_code=404, detail="Pharmacy order not found.")
    return o


def _item_states(order_id: str) -> Dict[str, Dict]:
    """Latest dispensing state per prescription item (records are append-only)."""
    state: Dict[str, Dict] = {}
    for rec in sorted(dispensing_store.list_for_order(order_id), key=lambda r: r.get("dispensed_at", 0)):
        for it in rec.get("items", []):
            state[it["item_id"]] = {"status": it["status"], "quantity_dispensed": it.get("quantity_dispensed")}
    return state


def _order_view(o: Dict) -> Dict:
    rx = prescription_store.get(o["prescription_id"]) or {}
    pat = patient_service.get_patient(o["patient_id"]) or {}
    doc = user_store.get_by_id(rx.get("doctor_id")) or {} if rx.get("doctor_id") else {}
    states = _item_states(o["id"])
    allergies = [a.get("substance") if isinstance(a, dict) else a for a in (pat.get("allergies") or [])]
    return {
        "id": o["id"], "status": o["status"], "sent_at": o.get("sent_at"), "updated_at": o.get("updated_at"),
        "completed_at": o.get("completed_at"), "pharmacist_id": o.get("pharmacist_id"),
        "prescription_id": o["prescription_id"],
        "patient": {"id": pat.get("id"), "name": pat.get("name"), "age": pat.get("age"),
                    "gender": pat.get("gender"), "allergies": [a for a in allergies if a]},
        "prescriber": {"name": doc.get("name"), "specialization": doc.get("specialization")},
        "items": [{
            "id": i.get("id"), "name": i.get("medicine_name"), "dose": i.get("dose"), "unit": i.get("unit"),
            "frequency": i.get("frequency"), "timing": i.get("timing"), "duration": i.get("duration"),
            "route": i.get("route"), "instructions": i.get("instructions"), "quantity": i.get("quantity"),
            "dispense_status": (states.get(i.get("id")) or {}).get("status", "Pending"),
            "quantity_dispensed": (states.get(i.get("id")) or {}).get("quantity_dispensed"),
        } for i in rx.get("items", [])],
        "dispensing": [{"id": d["id"], "status": d["status"], "notes": d.get("notes", ""),
                        "dispensed_at": d.get("dispensed_at"), "pharmacist_id": d.get("pharmacist_id")}
                       for d in dispensing_store.list_for_order(o["id"])],
    }


@app.post("/api/pharmacy/orders")
def send_to_pharmacy(payload: Dict[str, Any] = Body(...), current: Dict = Depends(require_roles("administrator"))):
    """Hospital administrator hands a Finalized prescription to the pharmacy (Step 9)."""
    org_id = require_org(current)
    rx = prescription_store.get(payload.get("prescription_id") or "")
    if not rx or not same_org(current, rx.get("org_id")):
        raise HTTPException(status_code=404, detail="Prescription not found.")
    if rx.get("status") != "Finalized":
        raise HTTPException(status_code=400, detail="Only a finalized prescription can be sent to the pharmacy.")
    if not rx.get("items"):
        raise HTTPException(status_code=400, detail="This prescription has no medicines to dispense.")
    if pharmacy_order_store.get_for_prescription(rx["id"]):
        raise HTTPException(status_code=409, detail="This prescription has already been sent to the pharmacy.")
    pharm_id = payload.get("pharmacist_id")
    if pharm_id and not any(u["id"] == pharm_id for u in _pharmacy_active_pharmacists(org_id)):
        raise HTTPException(status_code=404, detail="Pharmacist not found in this hospital.")
    order = pharmacy_order_store.create(PharmacyOrderCreate(prescription_id=rx["id"], patient_id=rx["patient_id"],
                                                             pharmacist_id=pharm_id), org_id=org_id, sent_by=current["id"])
    audit_log_store.log(org_id, current["id"], current["role"], "pharmacy_order.create", "pharmacy_order", order["id"],
                         {"prescription_id": rx["id"], "patient_id": rx["patient_id"]})
    for u in ([next(x for x in _pharmacy_active_pharmacists(org_id) if x["id"] == pharm_id)] if pharm_id
              else _pharmacy_active_pharmacists(org_id)):
        notification_store.push_to_user(u["id"], "New prescription to dispense", "A prescription is waiting in your queue.",
                                         org_id=org_id, type_="PHARMACY_ORDER", reference_type="pharmacy_order",
                                         reference_id=order["id"])
    return _order_view(order)


@app.get("/api/pharmacy/orders")
def list_pharmacy_orders(status: Optional[str] = None,
                          current: Dict = Depends(require_roles("administrator", "pharmacist"))):
    rows = pharmacy_order_store.list_for_org(require_org(current))
    if current["role"] == "pharmacist":
        rows = [o for o in rows if o.get("pharmacist_id") in (None, current["id"])]
    if status == "open":
        rows = [o for o in rows if not o.get("completed_at")]
    return [_order_view(o) for o in rows]


@app.get("/api/pharmacy/orders/{order_id}")
def get_pharmacy_order(order_id: str, current: Dict = Depends(require_roles("administrator", "pharmacist"))):
    return _order_view(_get_order_scoped(current, order_id))


@app.post("/api/pharmacy/orders/{order_id}/accept")
def accept_pharmacy_order(order_id: str, current: Dict = Depends(require_roles("pharmacist"))):
    o = _get_order_scoped(current, order_id)
    if o["status"] != "Sent":
        raise HTTPException(status_code=400, detail=f"This order is already {o['status']}.")
    pharmacy_order_store.assign(order_id, current["id"])
    o = pharmacy_order_store.update_status(order_id, "Accepted")
    audit_log_store.log(o["org_id"], current["id"], current["role"], "pharmacy_order.accept", "pharmacy_order", order_id, {})
    return _order_view(o)


@app.post("/api/pharmacy/orders/{order_id}/dispense")
def dispense_pharmacy_order(order_id: str, payload: Dict[str, Any] = Body(...),
                             current: Dict = Depends(require_roles("pharmacist"))):
    """Record per-item dispensing (Dispensed / Partially Dispensed / Unavailable).
    Append-only records; the order closes once every item is Dispensed or Unavailable."""
    o = _get_order_scoped(current, order_id)
    if o.get("completed_at"):
        raise HTTPException(status_code=400, detail="This order is already complete.")
    if o["status"] == "Sent":  # dispensing implies acceptance
        pharmacy_order_store.assign(order_id, current["id"])
        pharmacy_order_store.update_status(order_id, "Accepted")
    rx = prescription_store.get(o["prescription_id"]) or {}
    valid_ids = {i["id"] for i in rx.get("items", [])}
    entries = payload.get("items") or []
    if not entries:
        raise HTTPException(status_code=400, detail="Select at least one medicine to record.")
    clean, seen = [], set()
    names = {i["id"]: i.get("medicine_name") for i in rx.get("items", [])}
    for e in entries:
        iid, st = e.get("item_id"), e.get("status")
        if iid not in valid_ids or iid in seen:
            raise HTTPException(status_code=400, detail="Invalid or duplicate medicine in request.")
        if st not in DISPENSE_STATUSES:
            raise HTTPException(status_code=400, detail=f"status must be one of {', '.join(DISPENSE_STATUSES)}")
        qty = e.get("quantity_dispensed")
        if qty is not None and (not isinstance(qty, int) or isinstance(qty, bool) or qty < 0):
            raise HTTPException(status_code=400, detail="quantity_dispensed must be a non-negative whole number.")
        seen.add(iid)
        clean.append({"item_id": iid, "medicine_name": names[iid], "status": st, "quantity_dispensed": qty})
    statuses = {c["status"] for c in clean}
    rec_status = "Dispensed" if statuses == {"Dispensed"} else "Unavailable" if statuses == {"Unavailable"} else "Partially Dispensed"
    dispensing_store.create(DispensingCreate(pharmacy_order_id=order_id, prescription_id=o["prescription_id"],
                                              patient_id=o["patient_id"], pharmacist_id=current["id"], items=clean,
                                              status=rec_status, notes=(payload.get("notes") or "")[:500]),
                            org_id=o["org_id"])
    final = {iid: _item_states(order_id).get(iid, {}).get("status") for iid in valid_ids}
    if all(v in _ITEM_FINAL for v in final.values()):
        vals = set(final.values())
        outcome = "Dispensed" if vals == {"Dispensed"} else "Unable to Dispense" if vals == {"Unavailable"} else "Partially Dispensed"
        o = pharmacy_order_store.complete(order_id, outcome)
        _notify_patient(o["org_id"], o["patient_id"], "Medication update",
                        "There is an update on your medicines. Open Medications for details.",
                        "MEDICATION_UPDATE", "medication", o["prescription_id"])
    else:
        o = pharmacy_order_store.update_status(order_id, "Partially Dispensed" if any(
            v in ("Dispensed", "Partially Dispensed") for v in final.values()) else "Accepted")
    audit_log_store.log(o["org_id"], current["id"], current["role"], "pharmacy_order.dispense", "pharmacy_order", order_id,
                         {"order_status": o["status"], "item_count": len(clean)})
    return _order_view(o)


# ===========================================================================
# PHASE 10: PATIENT PORTAL -- self-scoped, patient-only, allowlisted views.
# The patient is resolved ONLY from the authenticated account's linked
# patientId (never from a request parameter), so there is no ID to guess.
# No DDI analyses/decisions, consultation notes or internal statuses are ever
# loaded here. Medications appear only once the hospital has RELEASED the
# report for that prescription (same gate as the report itself).
# ===========================================================================
_PORTAL_PHARMACY_LABEL = {
    "Sent": "Sent to pharmacy", "Accepted": "Being prepared", "Partially Dispensed": "Partly dispensed",
    "Dispensed": "Dispensed", "Unable to Dispense": "Not available - please contact the pharmacy",
}


def _notify_patient(org_id: str, patient_id: str, title: str, message: str, type_: str,
                     reference_type: str, reference_id: str) -> None:
    """Reference-only notification to the login account(s) linked to a patient record."""
    for u in user_store.list_by_org(org_id):
        if u.get("role") == "patient" and u.get("patientId") == patient_id:
            notification_store.push_to_user(u["id"], title, message, org_id=org_id, type_=type_,
                                             reference_type=reference_type, reference_id=reference_id)


def _portal_patient(current: Dict) -> Dict:
    pid = current.get("patientId")
    doc = patient_service.get_patient(pid) if pid else None
    if not doc or not same_org(current, doc.get("org_id")):
        raise HTTPException(status_code=404, detail="No patient record is linked to this account.")
    return doc


def _flat_names(items: Any) -> List[str]:
    out = []
    for a in items or []:
        v = a if isinstance(a, str) else (a.get("substance") or a.get("name") or a.get("condition")) if isinstance(a, dict) else None
        if v:
            out.append(str(v))
    return out


@app.get("/api/portal/me")
def portal_me(current: Dict = Depends(require_roles("patient"))):
    p = _portal_patient(current)
    hosp = org_store.get(p.get("org_id")) or {}
    return {"id": p.get("id"), "name": p.get("name"), "age": p.get("age"), "gender": p.get("gender"),
            "dob": p.get("dob"), "phone": p.get("phone"), "email": p.get("email"),
            "blood_group": p.get("blood_group"), "allergies": _flat_names(p.get("allergies")),
            "hospital": {"name": hosp.get("name"), "phone": hosp.get("phone"), "address": hosp.get("address")}}


@app.get("/api/portal/appointments")
def portal_appointments(current: Dict = Depends(require_roles("patient"))):
    p = _portal_patient(current)
    docs: Dict[str, Dict] = {}
    out = []
    for a in appointment_store.list_for_patient(p["id"]):
        if a.get("patient_id") != p["id"] or not same_org(current, a.get("org_id")):
            continue
        d = docs.setdefault(a.get("doctor_id"), user_store.get_by_id(a.get("doctor_id")) or {})
        out.append({"id": a["id"], "reason": a.get("reason"), "appointment_date": a.get("appointment_date"),
                    "appointment_time": a.get("appointment_time"), "status": a.get("status"),
                    "queue_number": a.get("queue_number"),
                    "doctor": {"name": d.get("name"), "specialization": d.get("specialization")}})
    return sorted(out, key=lambda x: (x.get("appointment_date") or "", x.get("appointment_time") or ""), reverse=True)


@app.get("/api/portal/medications")
def portal_medications(current: Dict = Depends(require_roles("patient"))):
    """Medicines from the patient's own Finalized prescriptions whose report has been
    released to them, with pharmacy/dispensing progress (no pharmacist identity, no DDI)."""
    p = _portal_patient(current)
    out = []
    for r in report_store.list_for_patient(p["id"], visible_only=True):
        rx = prescription_store.get(r["prescription_id"])
        if not rx or rx.get("status") != "Finalized" or rx.get("patient_id") != p["id"] \
                or not same_org(current, r.get("org_id")) or not same_org(current, rx.get("org_id")):
            continue
        doc = user_store.get_by_id(rx.get("doctor_id")) or {}
        order = pharmacy_order_store.get_for_prescription(rx["id"])
        states = _item_states(order["id"]) if order else {}
        out.append({
            "report_id": r["id"], "report_number": r.get("report_number"),
            "prescribed_at": r.get("finalized_at") or r.get("created_at"),
            "doctor": {"name": doc.get("name"), "specialization": doc.get("specialization")},
            "instructions": rx.get("clinical_instructions"),
            "pharmacy_status": _PORTAL_PHARMACY_LABEL.get(order["status"], order["status"]) if order else "Not yet sent to the pharmacy",
            "medicines": [{
                "name": i.get("medicine_name"), "dose": i.get("dose"), "unit": i.get("unit"),
                "frequency": i.get("frequency"), "timing": i.get("timing"), "duration": i.get("duration"),
                "route": i.get("route"), "instructions": i.get("instructions"), "quantity": i.get("quantity"),
                "dispense_status": (states.get(i.get("id")) or {}).get("status", "Pending") if order else None,
            } for i in rx.get("items", [])],
        })
    return sorted(out, key=lambda x: x.get("prescribed_at") or 0, reverse=True)


# ===========================================================================
# MODULE 6: NOTIFICATIONS — user-targeted, plus legacy role-group ones that
# are additionally scoped to the caller's hospital. A user can only read,
# mark or dismiss notifications that are visible to them.
# ===========================================================================
def _visible_notifications(current: Dict) -> List[Dict]:
    rows = list(notification_store.list_for_user(current["id"]))
    role = current.get("role")
    if role != "patient":
        group = group_for_role(role)
        shared = []
        if _is_platform_admin(current):
            shared = notification_store.list_for_group(group)
        elif current.get("org_id"):
            shared = notification_store.list_for_group(group, org_id=current["org_id"])
        for r in shared:  # shared rows carry PER-USER read/dismiss state
            if current["id"] in (r.get("dismissed_by") or []):
                continue
            rows.append({**r, "unread": current["id"] not in (r.get("read_by") or [])})
    return sorted(rows, key=lambda r: r.get("created_at", 0), reverse=True)


def _own_notification_or_404(current: Dict, notif_id: str) -> Dict:
    notif = next((n for n in _visible_notifications(current) if n.get("id") == notif_id), None)
    if not notif or not notification_visible_to(current, notif):
        raise HTTPException(status_code=404, detail="Notification not found.")
    return notif


@app.get("/api/notifications")
def list_notifications(current: Dict = Depends(get_current_user)):
    return _visible_notifications(current)


@app.post("/api/notifications/{notif_id}/read")
def mark_notification_read(notif_id: str, current: Dict = Depends(get_current_user)):
    _own_notification_or_404(current, notif_id)
    return {**notification_store.mark_read_for(notif_id, current["id"]), "unread": False}


@app.post("/api/notifications/read-all")
def mark_all_notifications_read(current: Dict = Depends(get_current_user)):
    rows = _visible_notifications(current)
    for r in rows:
        notification_store.mark_read_for(r["id"], current["id"])
    return {"marked": len(rows)}


@app.delete("/api/notifications/{notif_id}")
def dismiss_notification(notif_id: str, current: Dict = Depends(get_current_user)):
    _own_notification_or_404(current, notif_id)
    notification_store.dismiss_for(notif_id, current["id"])
    return {"status": "deleted", "id": notif_id}


# ===========================================================================
# PHASE 11: AUDIT API -- backend-backed audit trail / security events.
# Platform admin: platform-wide (optional org filter). Hospital administrator:
# own hospital only. Metadata is identifiers/counts only; for the hospital
# administrator DDI / doctor-decision metadata is withheld (doctor-only data).
# ===========================================================================
_SECURITY_ACTIONS = {"auth.login_failed", "auth.signup", "user.create", "user.update", "user.status", "user.delete"}
_DOCTOR_ONLY_AUDIT_PREFIXES = ("ddi_analysis.", "doctor_decision.")


@app.get("/api/audit")
def list_audit(kind: str = "activity", org_id: Optional[str] = None, action: Optional[str] = None,
               limit: int = 100, current: Dict = Depends(require_roles("admin", "administrator"))):
    if kind not in ("activity", "security"):
        raise HTTPException(status_code=400, detail="kind must be 'activity' or 'security'.")
    scope = require_org(current) if not _is_platform_admin(current) else org_id
    rows = audit_log_store.list_all(org_id=scope, limit=1000)
    if kind == "security":
        rows = [r for r in rows if r.get("action") in _SECURITY_ACTIONS]
    if action:
        rows = [r for r in rows if str(r.get("action", "")).startswith(action)]
    names: Dict[str, Dict] = {}
    out = []
    for r in rows[:max(1, min(limit, 500))]:
        actor_id = r.get("actor_user_id")
        if actor_id in names:
            actor = names[actor_id]  # cache hit -- skip the DB round trip entirely
        else:
            actor = user_store.get_by_id(actor_id) or {}
            names[actor_id] = actor
        hide = not _is_platform_admin(current) and str(r.get("action", "")).startswith(_DOCTOR_ONLY_AUDIT_PREFIXES)
        out.append({"id": r["id"], "action": r["action"], "resource_type": r.get("resource_type"),
                    "resource_id": r.get("resource_id"), "org_id": r.get("org_id"), "created_at": r.get("created_at"),
                    "actor": {"id": r.get("actor_user_id"), "name": actor.get("name") or "System / unknown",
                              "role": r.get("actor_role")},
                    "metadata": {} if hide else (r.get("metadata") or {})})
    return out


# ===========================================================================
# MODULE 7: ANALYSIS HISTORY & DASHBOARD STATS
# Analysis history is doctor-facing clinical decision-support data: it is
# never exposed to patients or to the hospital administrator (reception).
# ===========================================================================
@app.get("/api/analyses")
def list_analyses(patient_id: Optional[str] = None, current: Dict = Depends(require_roles("doctor", "pharmacist", "admin"))):
    if patient_id:
        get_patient_for(current, patient_id, "read")  # 404 if not accessible
    if _is_platform_admin(current):
        return analysis_store.list_all(patient_id=patient_id)
    rows = analysis_store.list_for_org(require_org(current), limit=100000)
    rows = filter_by_patient_access(current, rows)
    if patient_id:
        rows = [r for r in rows if r.get("patient_id") == patient_id]
    return rows[:200]


@app.get("/api/dashboard/stats")
def dashboard_stats(current: Dict = Depends(get_current_user)):
    if _is_platform_admin(current):
        reviews = review_store.list_all()
        patients = patient_service.list_patients()
        stats = analysis_store.stats()
        total_users = len(user_store.list_all())
        total_organizations = len(org_store.list_all())
    else:
        org_id = current.get("org_id")
        patients = list_accessible_patients(current)
        if current.get("role") == "patient" or not org_id:
            reviews, analyses, total_users, total_organizations = [], [], 0, 0
        else:
            reviews = filter_by_patient_access(current, review_store.list_for_org(org_id))
            analyses = filter_by_patient_access(current, analysis_store.list_for_org(org_id, limit=100000))
            total_users = len(user_store.list_by_org(org_id))
            total_organizations = 1
        stats = {
            "total_analyses": len(analyses),
            "high_severity_analyses": len([a for a in analyses if a.get("severity") == "High"]),
        }

    pending_reviews = [r for r in reviews if r.get("status") == "Pending"]
    return {
        "total_patients": len(patients),
        "pending_reviews": len(pending_reviews),
        "total_users": total_users,
        "total_organizations": total_organizations,
        **stats,
    }


# ----------------------------------------------------------------------
# MODULE 8: CLINICAL DASHBOARD (React build)
# Build once with:  cd frontend && npm install && npm run build
# Then open http://127.0.0.1:8000/app/  — registered last so it never shadows /api routes.
# ----------------------------------------------------------------------
FRONTEND_DIST = Path(__file__).resolve().parent.parent / "frontend" / "dist"
if FRONTEND_DIST.is_dir():
    app.mount("/app", StaticFiles(directory=str(FRONTEND_DIST), html=True), name="dashboard")
