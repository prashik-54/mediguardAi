"""
Module 5: Authentication & User Management.

- Passwords are hashed with PBKDF2-HMAC-SHA256 (stdlib `hashlib`, no extra
  native dependency required).
- Sessions are stateless JSON Web Tokens (HS256, via PyJWT).
- Users are persisted to MongoDB (collection "users"); falls back to the
  in-memory store from app.db when Mongo isn't reachable.
"""
import os
import re
import time
import hashlib
import secrets
from typing import Dict, List, Optional

import jwt
from fastapi import Depends, Header, HTTPException
from pydantic import BaseModel, Field, field_validator

from app.db import get_db, next_id
from app.modules.module_org import org_store

APP_ENV = os.getenv("APP_ENV", "development").lower()
_DEV_SECRET = "ddi-framework-final-year-project-dev-secret"
SECRET_KEY = os.getenv("JWT_SECRET_KEY") or _DEV_SECRET
if SECRET_KEY == _DEV_SECRET and APP_ENV == "production":
    # Never run a production deployment on the publicly-known dev secret.
    raise RuntimeError("JWT_SECRET_KEY must be set when APP_ENV=production.")
TOKEN_ALGO = "HS256"
TOKEN_TTL_SECONDS = int(os.getenv("JWT_TTL_SECONDS", str(60 * 60 * 24 * 7)))  # 7 days

ROLES = ["doctor", "pharmacist", "patient", "administrator", "admin"]
# "administrator" = hospital administrator, scoped to operations inside their
# own hospital only (staff & patient accounts, hospital details, hospital
# audit trail). "admin" = platform admin, manages the whole platform: every
# hospital, every account (including administrator/admin accounts) and
# platform-wide configuration.
ROLE_LABELS = {
    "doctor": "Doctor",
    "pharmacist": "Clinical Pharmacist",
    "patient": "Patient",
    "administrator": "Hospital Administrator",
    "admin": "Platform Admin",
}
# Roles a hospital administrator is allowed to create/manage. Never includes
# "administrator" or "admin" themselves — those are platform-admin-only.
HOSPITAL_MANAGED_ROLES = ("doctor", "pharmacist", "patient")
# Roles selectable via public self sign-up. Per CLAUDE.md ("Signup only for
# approved roles/use cases"): only the roles a hospital administrator would
# themselves create inside their hospital (HOSPITAL_MANAGED_ROLES) are safe
# to hand out through an unauthenticated form. "administrator" and "admin"
# must never be self-signup roles -- this endpoint auto-attaches a
# hospital-scoped signup to any hospital matched BY NAME (find_or_create),
# so an open "administrator" role would let anyone claim full admin control
# of an existing real hospital just by typing its name, and an open "admin"
# role would let anyone grant themselves unrestricted platform-wide access.
# (A platform admin is seeded at first run -- see app/seed.py -- and further
# admin/administrator accounts are provisioned by an authenticated platform
# admin via AdminUserCreate, never through this public route.)
SIGNUP_ROLES = HOSPITAL_MANAGED_ROLES
EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


# ------------------------------------------------------------------ schemas
class UserSignup(BaseModel):
    name: str = Field(..., min_length=2)
    email: str
    password: str = Field(..., min_length=8)
    role: str = "doctor"
    org: Optional[str] = ""
    phone: Optional[str] = ""

    @field_validator("email")
    @classmethod
    def _valid_email(cls, v):
        if not EMAIL_RE.match(v or ""):
            raise ValueError("Enter a valid email address")
        return v.lower().strip()

    @field_validator("role")
    @classmethod
    def _valid_role(cls, v):
        if v not in SIGNUP_ROLES:
            raise ValueError(f"role must be one of {', '.join(SIGNUP_ROLES)}")
        return v


class UserLogin(BaseModel):
    email: str
    password: str


class ProfileUpdate(BaseModel):
    """Self-service profile edit. Role, hospital (org/org_id), status and
    patientId are deliberately NOT editable here."""
    name: Optional[str] = None
    phone: Optional[str] = None
    specialization: Optional[str] = None


class PasswordChange(BaseModel):
    """Self-service password change -- requires the caller to prove they
    know the CURRENT password (checked in the route below via
    verify_password) before a new one is set. This is deliberately separate
    from the admin-issued/patient-intake password paths above, which don't
    require knowing an old password."""
    current_password: str
    new_password: str = Field(..., min_length=8)


class AdminUserCreate(BaseModel):
    """Used by an admin to create/onboard a doctor, pharmacist, patient or
    another admin account directly (no self-signup needed), optionally
    bundling them into a hospital organization via org_id."""
    name: str = Field(..., min_length=2)
    email: str
    password: str = Field(..., min_length=8)
    role: str = "doctor"
    org_id: Optional[str] = None
    phone: Optional[str] = ""
    specialization: Optional[str] = ""
    patient_id: Optional[str] = None  # link to an existing patient record
    age: Optional[int] = None         # used only when auto-creating a patient record
    gender: Optional[str] = None      # used only when auto-creating a patient record

    @field_validator("email")
    @classmethod
    def _valid_email(cls, v):
        if not EMAIL_RE.match(v or ""):
            raise ValueError("Enter a valid email address")
        return v.lower().strip()

    @field_validator("role")
    @classmethod
    def _valid_role(cls, v):
        if v not in ROLES:
            raise ValueError(f"role must be one of {', '.join(ROLES)}")
        return v


class UserStatusUpdate(BaseModel):
    status: str  # "active" | "suspended"

    @field_validator("status")
    @classmethod
    def _valid_status(cls, v):
        if v not in ("active", "suspended"):
            raise ValueError("status must be 'active' or 'suspended'")
        return v


class PatientLoginCreate(BaseModel):
    """Used to attach a portal login to an EXISTING patient record that
    doesn't have one yet (legacy records registered before accounts were
    created automatically at intake). The administrator sets the patient's
    initial password directly — there is no invite/auto-generated password."""
    email: str
    password: str = Field(..., min_length=8)
    phone: Optional[str] = ""

    @field_validator("email")
    @classmethod
    def _valid_email(cls, v):
        if not EMAIL_RE.match(v or ""):
            raise ValueError("Enter a valid email address")
        return v.lower().strip()


class AdminUserUpdate(BaseModel):
    name: Optional[str] = None
    phone: Optional[str] = None
    specialization: Optional[str] = None
    org_id: Optional[str] = None
    role: Optional[str] = None

    @field_validator("role")
    @classmethod
    def _valid_role(cls, v):
        if v is not None and v not in ROLES:
            raise ValueError(f"role must be one of {', '.join(ROLES)}")
        return v


# ------------------------------------------------------------------ hashing
def hash_password(password: str) -> str:
    salt = secrets.token_hex(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt.encode("utf-8"), 100_000)
    return f"{salt}${digest.hex()}"


def verify_password(password: str, hashed: str) -> bool:
    try:
        salt, hex_digest = hashed.split("$", 1)
    except (ValueError, AttributeError):
        return False
    digest = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt.encode("utf-8"), 100_000)
    return secrets.compare_digest(digest.hex(), hex_digest)


def generate_temp_password() -> str:
    """A short, URL-safe auto-generated password for admin-issued portal logins."""
    return secrets.token_urlsafe(9)


# ---------------------------------------------------------------------- jwt
def create_token(user: Dict) -> str:
    payload = {
        "sub": user["id"],
        "email": user["email"],
        "role": user["role"],
        "iat": int(time.time()),
        "exp": int(time.time()) + TOKEN_TTL_SECONDS,
    }
    return jwt.encode(payload, SECRET_KEY, algorithm=TOKEN_ALGO)


def decode_token(token: str) -> Dict:
    try:
        return jwt.decode(token, SECRET_KEY, algorithms=[TOKEN_ALGO])
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Session expired. Please sign in again.")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid authentication token.")


def public_user(doc: Dict) -> Dict:
    """Strips the password hash before sending a user document to the client."""
    if not doc:
        return doc
    out = {k: v for k, v in doc.items() if k not in ("password_hash", "_id", "_seq")}
    out.setdefault("roleLabel", ROLE_LABELS.get(out.get("role"), out.get("role")))
    return out


# ------------------------------------------------------------------- store
class UserStore:
    def __init__(self):
        self._seq = 100

    @property
    def col(self):
        return get_db()["users"]

    def _next_id(self) -> str:
        return next_id(self.col, "U-", 0, floor=100)

    def create(self, name: str, email: str, password: str, role: str, org: str = "",
               phone: str = "", patient_id: Optional[str] = None, specialization: str = "",
               org_id: Optional[str] = None, status: str = "active") -> Dict:
        if self.col.find_one({"email": email}):
            raise HTTPException(status_code=409, detail="An account with this email already exists.")
        doc = {
            "id": self._next_id(),
            "name": name.strip(),
            "email": email.lower().strip(),
            "password_hash": hash_password(password),
            "role": role,
            "roleLabel": ROLE_LABELS.get(role, role),
            "org": org or "",
            "org_id": org_id,
            "phone": phone or "",
            "specialization": specialization or "",
            "patientId": patient_id,
            "status": status,
            "created_at": time.time(),
        }
        self.col.insert_one(doc)
        return doc

    def authenticate(self, email: str, password: str) -> Dict:
        doc = self.col.find_one({"email": email.lower().strip()})
        if not doc or not verify_password(password, doc.get("password_hash", "")):
            raise HTTPException(status_code=401, detail="Incorrect email or password.")
        if doc.get("status", "active") != "active":
            raise HTTPException(status_code=403, detail="This account has been suspended. Contact your hospital administrator.")
        return doc

    def get_by_id(self, user_id: str) -> Optional[Dict]:
        return self.col.find_one({"id": user_id})

    def get_by_email(self, email: str) -> Optional[Dict]:
        return self.col.find_one({"email": email.lower().strip()})

    def get_by_patient_id(self, patient_id: Optional[str]) -> Optional[Dict]:
        """Root-fix lookup: does this clinical patient record already have a
        portal login? Used to block duplicate logins for one patient."""
        if not patient_id:
            return None
        return self.col.find_one({"patientId": patient_id})

    def update_profile(self, user_id: str, patch: Dict) -> Optional[Dict]:
        clean = {k: v for k, v in patch.items() if v is not None}
        if clean:
            self.col.update_one({"id": user_id}, {"$set": clean})
        return self.get_by_id(user_id)

    def set_password(self, user_id: str, new_password: str) -> Optional[Dict]:
        self.col.update_one({"id": user_id}, {"$set": {"password_hash": hash_password(new_password)}})
        return self.get_by_id(user_id)

    def list_all(self) -> List[Dict]:
        return self.col.find({})

    def list_by_org(self, org_id: str) -> List[Dict]:
        return self.col.find({"org_id": org_id})

    def set_status(self, user_id: str, status: str) -> Optional[Dict]:
        if not self.get_by_id(user_id):
            return None
        self.col.update_one({"id": user_id}, {"$set": {"status": status}})
        return self.get_by_id(user_id)

    def delete(self, user_id: str) -> bool:
        result = self.col.delete_one({"id": user_id})
        return bool(result.get("deleted"))


user_store = UserStore()


# ------------------------------------------------------------ FastAPI deps
def get_current_user(authorization: Optional[str] = Header(None)) -> Dict:
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(status_code=401, detail="Missing or malformed Authorization header.")
    token = authorization.split(" ", 1)[1].strip()
    payload = decode_token(token)
    user = user_store.get_by_id(payload.get("sub"))
    if not user:
        raise HTTPException(status_code=401, detail="User no longer exists.")
    if user.get("status", "active") != "active":
        raise HTTPException(status_code=403, detail="This account has been suspended. Contact your hospital administrator.")
    if user.get("role") != "admin" and user.get("org_id"):
        org = org_store.get(user["org_id"])
        if org and org.get("status", "Active") != "Active":
            raise HTTPException(status_code=403, detail="Your hospital account is inactive. Contact the platform administrator.")
    return user


def require_roles(*roles: str):
    """FastAPI dependency factory: raises 403 unless the caller's role is in `roles`."""
    def _dep(user: Dict = Depends(get_current_user)) -> Dict:
        if user.get("role") not in roles:
            raise HTTPException(status_code=403, detail="You don't have permission to perform this action.")
        return user
    return _dep
