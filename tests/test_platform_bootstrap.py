"""
Platform runtime behaviour: the platform always behaves like a production system.

Covers: /api/health, first-admin bootstrap, no seeded/demo accounts, and finalization working on the
built-in reference interaction map (sample DDI/medicine data is the only dummy data that remains).

Run:  pytest tests/test_platform_bootstrap.py -v
"""
from types import SimpleNamespace

import pytest
from fastapi.testclient import TestClient

from app.main import app, drug_service
from app.modules.module1_patient import patient_service
from app.modules.module_auth import create_token, user_store
from app.modules.module_org import OrganizationCreate, org_store
from app.seed import run_bootstrap_admin

client = TestClient(app)
PW = "Passw0rd!xyz"
SAFE_ITEMS = [
    {"medicine_name": "Paracetamol", "dose": "500", "unit": "mg", "frequency": "As needed"},
    {"medicine_name": "Vitamin D", "dose": "1000", "unit": "IU"},
]


def H(user):
    return {"Authorization": f"Bearer {create_token(user)}"}


def mk(name, email, role, org=None, password=PW):
    return user_store.create(name, email, password, role, org=(org or {}).get("name", ""), org_id=(org or {}).get("id"))


@pytest.fixture
def w():
    A = org_store.create(OrganizationCreate(name="Hospital A12"))
    ns = SimpleNamespace(A=A)
    ns.adminA = mk("Admin A12", "p12-adminA@x.io", "administrator", A)
    ns.docA = mk("Doc A12", "p12-docA@x.io", "doctor", A)
    ns.PA = patient_service.create_full_record(
        {"name": "Dee A", "phone": "9444444444", "age": 50, "gender": "Female", "egfr": 90, "alt": 20, "org_id": A["id"]},
        owner_id=ns.adminA["id"])
    apt = client.post("/api/appointments", json={"patient_id": ns.PA["id"], "doctor_id": ns.docA["id"], "reason": "Check",
                                                   "appointment_date": "2026-09-25"}, headers=H(ns.adminA)).json()
    ns.enc = client.post("/api/encounters", json={"appointment_id": apt["id"]}, headers=H(ns.docA)).json()
    return ns


def _analysed_rx(w):
    rx = client.post("/api/prescriptions", json={"encounter_id": w.enc["id"], "items": SAFE_ITEMS}, headers=H(w.docA)).json()
    ddi = client.post(f"/api/prescriptions/{rx['id']}/ddi-analysis", headers=H(w.docA)).json()
    return rx, ddi


# ------------------------------------------------------------------ environment probe
def test_health_reports_environment_publicly(monkeypatch):
    monkeypatch.setenv("APP_ENV", "development")
    body = client.get("/api/health").json()  # no auth required
    assert body["mode"] == "development" and body["ddi_dataset"] in ("full", "fallback")
    assert {"database", "admin_accounts_provisioned"} <= set(body)
    assert not any(k.startswith("demo") for k in body)  # no demo flags are exposed any more


# ------------------------------------------------------------------ first-admin bootstrap
def test_bootstrap_admin_creates_one_real_admin_on_empty_db(monkeypatch):
    monkeypatch.setenv("BOOTSTRAP_ADMIN_EMAIL", "owner@realhospitalgroup.io")
    monkeypatch.setenv("BOOTSTRAP_ADMIN_PASSWORD", "Sup3rS3cret!!")
    monkeypatch.setenv("BOOTSTRAP_ADMIN_NAME", "Real Owner")
    run_bootstrap_admin()
    users = user_store.list_all()
    assert len(users) == 1
    assert users[0]["role"] == "admin"
    assert users[0]["email"] == "owner@realhospitalgroup.io"
    assert users[0]["org_id"] is None  # platform admin, not scoped to any hospital
    login = client.post("/api/auth/login", json={"email": "owner@realhospitalgroup.io", "password": "Sup3rS3cret!!"})
    assert login.status_code == 200 and login.json()["user"]["role"] == "admin"


def test_bootstrap_admin_is_a_noop_without_both_env_vars_or_once_a_user_exists(monkeypatch):
    monkeypatch.delenv("BOOTSTRAP_ADMIN_EMAIL", raising=False)
    monkeypatch.delenv("BOOTSTRAP_ADMIN_PASSWORD", raising=False)
    run_bootstrap_admin()
    assert user_store.list_all() == []
    monkeypatch.setenv("BOOTSTRAP_ADMIN_EMAIL", "later@x.io")
    run_bootstrap_admin()  # password still unset
    assert user_store.list_all() == []
    mk("Existing Doc", "existing-doc@x.io", "doctor")
    monkeypatch.setenv("BOOTSTRAP_ADMIN_PASSWORD", "Whatever123!")
    run_bootstrap_admin()  # a user already exists — never overwrite
    assert len(user_store.list_all()) == 1
    assert user_store.list_all()[0]["email"] == "existing-doc@x.io"


def test_health_reports_whether_any_admin_account_is_provisioned():
    assert client.get("/api/health").json()["admin_accounts_provisioned"] is False
    mk("Hospital Admin", "hadmin@x.io", "administrator")
    assert client.get("/api/health").json()["admin_accounts_provisioned"] is True



# ------------------------------------------------------------------ no seeded accounts
def test_startup_never_seeds_users_or_hospitals():
    import app.seed as seed
    assert not hasattr(seed, "run_seed")
    assert user_store.list_all() == [] and org_store.list_all() == []


# ------------------------------------------------------------------ finalization on the reference DDI map
def test_finalize_works_on_reference_interaction_map(w, monkeypatch):
    monkeypatch.setattr(drug_service, "dataset_mode", lambda: "fallback")
    rx, ddi = _analysed_rx(w)
    assert "DEMO" not in ddi["source"].upper() and "data_mode" not in ddi and "clinical_use_allowed" not in ddi
    r = client.post(f"/api/prescriptions/{rx['id']}/finalize", headers=H(w.docA))
    assert r.status_code == 200 and r.json()["status"] == "Finalized"


def test_finalize_works_with_full_dataset(w, monkeypatch):
    monkeypatch.setattr(drug_service, "dataset_mode", lambda: "full")
    rx, _ = _analysed_rx(w)
    assert client.post(f"/api/prescriptions/{rx['id']}/finalize", headers=H(w.docA)).status_code == 200


# ------------------------------------------------------------------ platform admin can create things
def test_platform_admin_can_create_hospital_users_and_patients():
    admin = mk("Platform Owner", "owner@x.io", "admin")
    h = client.post("/api/organizations", json={"name": "Ghrce", "type": "Hospital", "address": "Hingna, Nagpur",
                                                 "phone": "9423610022", "email": "a@b.io"}, headers=H(admin))
    assert h.status_code == 200
    org = h.json()
    assert "_id" not in org and org["id"].startswith("ORG-")
    assert [o["id"] for o in client.get("/api/organizations", headers=H(admin)).json()] == [org["id"]]
    u = client.post("/api/admin/users", json={"name": "Hosp Admin", "email": "ha@x.io", "password": PW,
                                              "role": "administrator", "org_id": org["id"]}, headers=H(admin))
    assert u.status_code == 200 and u.json()["org_id"] == org["id"]
    p = client.post("/api/patients", json={"name": "Pat One", "phone": "9000000001", "age": 40, "gender": "Male",
                                           "org_id": org["id"]}, headers=H(admin))
    assert p.status_code == 200 and p.json()["org_id"] == org["id"]
    assert client.get("/api/patients", headers=H(admin)).status_code == 200
    assert client.get("/api/reviews", headers=H(admin)).status_code == 200
    assert client.delete(f"/api/organizations/{org['id']}", headers=H(admin)).status_code == 409  # has staff


def test_ids_never_repeat_after_delete():
    admin = mk("Platform Owner", "owner2@x.io", "admin")
    first = client.post("/api/organizations", json={"name": "One"}, headers=H(admin)).json()
    second = client.post("/api/organizations", json={"name": "Two"}, headers=H(admin)).json()
    client.delete(f"/api/organizations/{first['id']}", headers=H(admin))
    third = client.post("/api/organizations", json={"name": "Three"}, headers=H(admin)).json()
    assert len({first["id"], second["id"], third["id"]}) == 3
