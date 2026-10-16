"""
Phase 4 — Doctor Appointment and Consultation Workflow.

Covers: the doctor's own assigned-queue view, appointment status lifecycle,
and encounter (notes/findings/diagnosis/assessment/follow-up) CRUD — all
scoped to the doctor's own hospital AND own assignment (Rule 6), built on
top of Phase 2/3's RBAC + intake layers.

Run:  pytest tests/test_doctor_consultation.py -v
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


def _apt_payload(patient_id, doctor_id, **extra):
    return {"patient_id": patient_id, "doctor_id": doctor_id, "reason": "Fever and cough",
            "appointment_date": "2026-09-25", **extra}


@pytest.fixture
def w():
    A = org_store.create(OrganizationCreate(name="Hospital A"))
    B = org_store.create(OrganizationCreate(name="Hospital B"))
    ns = SimpleNamespace(A=A, B=B)
    ns.adminA = mk("Admin A", "adminA@x.io", "administrator", A)
    ns.docA = mk("Doc A", "docA@x.io", "doctor", A)
    ns.docA2 = mk("Doc A2", "docA2@x.io", "doctor", A)
    ns.docB = mk("Doc B", "docB@x.io", "doctor", B)
    ns.PA = patient_service.create_full_record(
        {"name": "Alice A", "phone": "9111111111", "age": 34, "gender": "Female", "egfr": 90, "alt": 20,
         "org_id": A["id"]}, owner_id=ns.adminA["id"])
    ns.apt = client.post("/api/appointments", json=_apt_payload(ns.PA["id"], ns.docA["id"]), headers=H(ns.adminA)).json()
    return ns


# ==================================================================== queue
def test_doctor_sees_own_appointments_only(w):
    mine = client.get("/api/doctor/appointments", headers=H(w.docA)).json()
    assert any(a["id"] == w.apt["id"] for a in mine)
    other = client.get("/api/doctor/appointments", headers=H(w.docA2)).json()
    assert all(a["id"] != w.apt["id"] for a in other)


def test_administrator_cannot_use_doctor_queue(w):
    assert client.get("/api/doctor/appointments", headers=H(w.adminA)).status_code == 403


def test_doctor_cannot_get_another_doctors_appointment(w):
    assert client.get(f"/api/appointments/{w.apt['id']}", headers=H(w.docA2)).status_code == 404
    assert client.get(f"/api/appointments/{w.apt['id']}", headers=H(w.docA)).status_code == 200


def test_cross_hospital_doctor_gets_404(w):
    assert client.get(f"/api/appointments/{w.apt['id']}", headers=H(w.docB)).status_code == 404


# ============================================================== status flow
def test_doctor_can_move_to_in_consultation_and_completed(w):
    r = client.patch(f"/api/appointments/{w.apt['id']}/status", json={"status": "In Consultation"}, headers=H(w.docA))
    assert r.status_code == 200 and r.json()["status"] == "In Consultation"


def test_doctor_cannot_set_reception_only_status(w):
    r = client.patch(f"/api/appointments/{w.apt['id']}/status", json={"status": "Checked In"}, headers=H(w.docA))
    assert r.status_code == 403


def test_doctor_cannot_change_another_doctors_appointment_status(w):
    r = client.patch(f"/api/appointments/{w.apt['id']}/status", json={"status": "Completed"}, headers=H(w.docA2))
    assert r.status_code == 404


def test_administrator_can_set_any_status(w):
    r = client.patch(f"/api/appointments/{w.apt['id']}/status", json={"status": "Checked In"}, headers=H(w.adminA))
    assert r.status_code == 200


# ================================================================ encounter
def test_start_encounter_is_idempotent_and_updates_appointment_status(w):
    e1 = client.post("/api/encounters", json={"appointment_id": w.apt["id"]}, headers=H(w.docA))
    assert e1.status_code == 200
    enc = e1.json()
    assert enc["status"] == "In Progress" and enc["patient_id"] == w.PA["id"]
    assert client.get(f"/api/appointments/{w.apt['id']}", headers=H(w.docA)).json()["status"] == "In Consultation"

    e2 = client.post("/api/encounters", json={"appointment_id": w.apt["id"]}, headers=H(w.docA))
    assert e2.status_code == 200 and e2.json()["id"] == enc["id"]  # no duplicate encounter


def test_other_doctor_cannot_start_encounter_on_unassigned_appointment(w):
    r = client.post("/api/encounters", json={"appointment_id": w.apt["id"]}, headers=H(w.docA2))
    assert r.status_code == 404


def test_doctor_can_update_notes_and_diagnosis(w):
    enc = client.post("/api/encounters", json={"appointment_id": w.apt["id"]}, headers=H(w.docA)).json()
    r = client.put(f"/api/encounters/{enc['id']}",
                    json={"notes": "Patient reports fever x3 days", "diagnosis": "Viral fever"},
                    headers=H(w.docA))
    assert r.status_code == 200
    assert r.json()["diagnosis"] == "Viral fever"


def test_other_doctor_cannot_read_or_edit_encounter(w):
    enc = client.post("/api/encounters", json={"appointment_id": w.apt["id"]}, headers=H(w.docA)).json()
    assert client.get(f"/api/encounters/{enc['id']}", headers=H(w.docA2)).status_code == 404
    assert client.put(f"/api/encounters/{enc['id']}", json={"notes": "x"}, headers=H(w.docA2)).status_code == 404


def test_administrator_can_view_but_not_edit_encounter(w):
    enc = client.post("/api/encounters", json={"appointment_id": w.apt["id"]}, headers=H(w.docA)).json()
    assert client.get(f"/api/encounters/{enc['id']}", headers=H(w.adminA)).status_code == 200
    assert client.put(f"/api/encounters/{enc['id']}", json={"notes": "x"}, headers=H(w.adminA)).status_code == 403


def test_complete_requires_diagnosis_or_assessment(w):
    enc = client.post("/api/encounters", json={"appointment_id": w.apt["id"]}, headers=H(w.docA)).json()
    r = client.post(f"/api/encounters/{enc['id']}/complete", headers=H(w.docA))
    assert r.status_code == 400

    client.put(f"/api/encounters/{enc['id']}", json={"diagnosis": "Viral fever"}, headers=H(w.docA))
    r2 = client.post(f"/api/encounters/{enc['id']}/complete", headers=H(w.docA))
    assert r2.status_code == 200 and r2.json()["status"] == "Completed"
    assert client.get(f"/api/appointments/{w.apt['id']}", headers=H(w.docA)).json()["status"] == "Completed"


def test_complete_requires_clinical_profile(w):
    """Phase 14: intake leaves kidney/liver function optional, but the
    assigned doctor must fill them in before closing the consultation."""
    bare = patient_service.create_full_record(
        {"name": "Bare Patient", "age": 30, "gender": "Male", "org_id": w.A["id"]}, owner_id=w.adminA["id"])
    apt = client.post("/api/appointments", json=_apt_payload(bare["id"], w.docA["id"]), headers=H(w.adminA)).json()
    enc = client.post("/api/encounters", json={"appointment_id": apt["id"]}, headers=H(w.docA)).json()
    client.put(f"/api/encounters/{enc['id']}", json={"diagnosis": "Viral fever"}, headers=H(w.docA))

    r = client.post(f"/api/encounters/{enc['id']}/complete", headers=H(w.docA))
    assert r.status_code == 400
    assert "eGFR" in str(r.json()["detail"]) or "Kidney" in str(r.json()["detail"])

    client.put(f"/api/patients/{bare['id']}", json={"egfr": 75, "alt": 18}, headers=H(w.docA))
    r2 = client.post(f"/api/encounters/{enc['id']}/complete", headers=H(w.docA))
    assert r2.status_code == 200 and r2.json()["status"] == "Completed"


def test_cannot_edit_or_recomplete_a_completed_encounter(w):
    enc = client.post("/api/encounters", json={"appointment_id": w.apt["id"]}, headers=H(w.docA)).json()
    client.put(f"/api/encounters/{enc['id']}", json={"diagnosis": "Viral fever"}, headers=H(w.docA))
    client.post(f"/api/encounters/{enc['id']}/complete", headers=H(w.docA))
    assert client.put(f"/api/encounters/{enc['id']}", json={"notes": "late edit"}, headers=H(w.docA)).status_code == 400
    assert client.post(f"/api/encounters/{enc['id']}/complete", headers=H(w.docA)).status_code == 400


def test_patient_history_endpoint_scoped_to_clinical_staff(w):
    client.post("/api/encounters", json={"appointment_id": w.apt["id"]}, headers=H(w.docA))
    r = client.get(f"/api/patients/{w.PA['id']}/encounters", headers=H(w.docA))
    assert r.status_code == 200 and len(r.json()) == 1
    assert client.get(f"/api/patients/{w.PA['id']}/encounters", headers=H(w.docA2)).status_code == 404
