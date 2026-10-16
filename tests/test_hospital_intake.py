"""
Phase 3 — Hospital Administrator Patient Intake.

Covers: patient search, duplicate prevention, doctor assignment, and
appointment/queue creation, all scoped to the hospital administrator's own
hospital (built on top of Phase 2's RBAC/isolation layer).

Run:  pytest tests/test_hospital_intake.py -v
"""
from types import SimpleNamespace

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.modules.module1_patient import patient_service
from app.modules.module_auth import create_token, user_store
from app.modules.module_org import OrganizationCreate, org_store

client = TestClient(app)
PW = "Passw0rd!xyz"


def H(user):
    return {"Authorization": f"Bearer {create_token(user)}"}


def mk(name, email, role, org=None):
    return user_store.create(name, email, PW, role, org=(org or {}).get("name", ""), org_id=(org or {}).get("id"))


@pytest.fixture
def w():
    A = org_store.create(OrganizationCreate(name="Hospital A"))
    B = org_store.create(OrganizationCreate(name="Hospital B"))
    ns = SimpleNamespace(A=A, B=B)
    ns.adminA = mk("Admin A", "adminA@x.io", "administrator", A)
    ns.adminB = mk("Admin B", "adminB@x.io", "administrator", B)
    ns.docA = mk("Doc A", "docA@x.io", "doctor", A)
    ns.docA_suspended = mk("Doc A2", "docA2@x.io", "doctor", A)
    user_store.set_status(ns.docA_suspended["id"], "suspended")
    ns.docB = mk("Doc B", "docB@x.io", "doctor", B)
    ns.PA = patient_service.create_full_record(
        {"name": "Alice A", "phone": "9111111111", "email": "alice@a.io", "dob": "1990-01-01",
         "age": 34, "gender": "Female", "egfr": 90, "alt": 20, "org_id": A["id"]}, owner_id=ns.adminA["id"])
    ns.PB = patient_service.create_full_record(
        {"name": "Bob B", "phone": "9222222222", "age": 40, "gender": "Male", "egfr": 90, "alt": 20,
         "org_id": B["id"]}, owner_id=ns.adminB["id"])
    return ns


# ============================================================ patient search
def test_search_by_name_phone_email(w):
    for q in ("Alice", "9111111111", "alice@a.io", "P-"):
        r = client.get(f"/api/patients/search?q={q}", headers=H(w.adminA))
        assert r.status_code == 200, r.text
        if q != "P-":
            assert any(p["id"] == w.PA["id"] for p in r.json())


def test_search_is_hospital_scoped(w):
    r = client.get("/api/patients/search?q=Bob", headers=H(w.adminA))
    assert r.status_code == 200
    assert all(p["id"] != w.PB["id"] for p in r.json())


def test_search_empty_query_returns_nothing(w):
    r = client.get("/api/patients/search?q=", headers=H(w.adminA))
    assert r.status_code == 200 and r.json() == []


def test_search_forbidden_for_doctor(w):
    r = client.get("/api/patients/search?q=Alice", headers=H(w.docA))
    assert r.status_code == 403


# ======================================================= duplicate prevention
def test_duplicate_email_blocked(w):
    r = client.post("/api/patients", json={"name": "Alice Again", "email": "alice@a.io", "age": 34, "gender": "Female"},
                     headers=H(w.adminA))
    assert r.status_code == 409
    assert r.json()["detail"]["existing_patient_id"] == w.PA["id"]


def test_duplicate_phone_same_dob_blocked(w):
    r = client.post("/api/patients",
                     json={"name": "Alice Typo", "phone": "9111111111", "dob": "1990-01-01", "age": 34, "gender": "Female"},
                     headers=H(w.adminA))
    assert r.status_code == 409


def test_same_phone_different_dob_is_not_blocked(w):
    r = client.post("/api/patients",
                     json={"name": "Different Person", "phone": "9111111111", "dob": "1975-05-05", "age": 50, "gender": "Male"},
                     headers=H(w.adminA))
    assert r.status_code == 200, r.text


def test_duplicate_across_hospitals_is_not_blocked(w):
    """Same phone number, different hospital -> not the same patient record."""
    r = client.post("/api/patients", json={"name": "Bob Clone", "phone": "9222222222", "age": 40, "gender": "Male"},
                     headers=H(w.adminA))
    assert r.status_code == 200, r.text


def test_allow_duplicate_override_creates_anyway(w):
    r = client.post("/api/patients",
                     json={"name": "Alice Twin", "email": "alice@a.io", "age": 34, "gender": "Female", "allow_duplicate": True},
                     headers=H(w.adminA))
    assert r.status_code == 200, r.text
    assert "allow_duplicate" not in r.json()  # never persisted onto the record


# ==================================================================== intake
def _apt_payload(patient_id, doctor_id, **extra):
    return {"patient_id": patient_id, "doctor_id": doctor_id, "reason": "Fever and cough",
            "appointment_date": "2026-09-25", **extra}


def test_administrator_can_assign_doctor_and_create_appointment(w):
    r = client.post("/api/appointments", json=_apt_payload(w.PA["id"], w.docA["id"]), headers=H(w.adminA))
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["org_id"] == w.A["id"] and body["status"] == "Scheduled" and body["queue_number"] == 1

    doctor_notifs = client.get("/api/notifications", headers=H(w.docA)).json()
    assert any(n.get("reference_id") == body["id"] for n in doctor_notifs)


def test_queue_number_increments_per_day(w):
    r1 = client.post("/api/appointments", json=_apt_payload(w.PA["id"], w.docA["id"]), headers=H(w.adminA)).json()
    P2 = patient_service.create_full_record({"name": "Second Patient", "age": 22, "gender": "Male", "egfr": 90,
                                              "alt": 20, "org_id": w.A["id"]}, owner_id=w.adminA["id"])
    r2 = client.post("/api/appointments", json=_apt_payload(P2["id"], w.docA["id"]), headers=H(w.adminA)).json()
    assert r1["queue_number"] == 1 and r2["queue_number"] == 2


def test_cannot_assign_patient_from_another_hospital(w):
    r = client.post("/api/appointments", json=_apt_payload(w.PB["id"], w.docA["id"]), headers=H(w.adminA))
    assert r.status_code == 404


def test_cannot_assign_doctor_from_another_hospital(w):
    r = client.post("/api/appointments", json=_apt_payload(w.PA["id"], w.docB["id"]), headers=H(w.adminA))
    assert r.status_code == 404


def test_cannot_assign_suspended_doctor(w):
    r = client.post("/api/appointments", json=_apt_payload(w.PA["id"], w.docA_suspended["id"]), headers=H(w.adminA))
    assert r.status_code == 400


def test_platform_admin_cannot_create_appointment(w):
    root = mk("Root", "root@x.io", "admin")
    r = client.post("/api/appointments", json=_apt_payload(w.PA["id"], w.docA["id"]), headers=H(root))
    assert r.status_code == 403


def test_doctor_cannot_create_appointment(w):
    r = client.post("/api/appointments", json=_apt_payload(w.PA["id"], w.docA["id"]), headers=H(w.docA))
    assert r.status_code == 403


def test_appointment_list_and_get_are_hospital_scoped(w):
    apt = client.post("/api/appointments", json=_apt_payload(w.PA["id"], w.docA["id"]), headers=H(w.adminA)).json()

    mine = client.get("/api/appointments", headers=H(w.adminA)).json()
    assert any(a["id"] == apt["id"] for a in mine)

    theirs = client.get("/api/appointments", headers=H(w.adminB)).json()
    assert all(a["id"] != apt["id"] for a in theirs)

    assert client.get(f"/api/appointments/{apt['id']}", headers=H(w.adminA)).status_code == 200
    assert client.get(f"/api/appointments/{apt['id']}", headers=H(w.adminB)).status_code == 404
