"""
Phase 5 — Prescription Workflow.

Covers: draft prescription creation from a doctor's own encounter, item
editing (dose/frequency/timing/duration/instructions/quantity), Draft-only
edit gating, versioning (new-version cancels the prior draft and opens the
next), doctor-own + hospital scoping, and patient/encounter history views.
DDI review/finalization is Phase 6-7 and is deliberately NOT exercised here
beyond confirming there is no route that finalizes a prescription yet.

Run:  pytest tests/test_prescription_workflow.py -v
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
    return {"patient_id": patient_id, "doctor_id": doctor_id, "reason": "Hypertension follow-up",
            "appointment_date": "2026-09-25", **extra}


ITEM = {"medicine_name": "Metformin", "dose": "500", "unit": "mg", "frequency": "Twice daily",
        "timing": "After meals", "duration": "30 days", "instructions": "Take with water", "quantity": 60}


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
    ns.enc = client.post("/api/encounters", json={"appointment_id": ns.apt["id"]}, headers=H(ns.docA)).json()
    return ns


# ================================================================== create
def test_doctor_creates_draft_prescription_on_own_encounter(w):
    r = client.post("/api/prescriptions", json={"encounter_id": w.enc["id"], "items": [ITEM]}, headers=H(w.docA))
    assert r.status_code == 200
    rx = r.json()
    assert rx["status"] == "Draft" and rx["version"] == 1 and rx["patient_id"] == w.PA["id"]
    assert len(rx["items"]) == 1 and rx["items"][0]["medicine_name"] == "Metformin"
    assert rx["items"][0]["id"] and rx["items"][0]["prescription_id"] == rx["id"]


def test_other_doctor_cannot_create_prescription_on_unassigned_encounter(w):
    r = client.post("/api/prescriptions", json={"encounter_id": w.enc["id"], "items": []}, headers=H(w.docA2))
    assert r.status_code == 404


def test_administrator_cannot_create_prescription(w):
    r = client.post("/api/prescriptions", json={"encounter_id": w.enc["id"], "items": []}, headers=H(w.adminA))
    assert r.status_code == 403


def test_only_one_active_prescription_per_encounter(w):
    client.post("/api/prescriptions", json={"encounter_id": w.enc["id"], "items": []}, headers=H(w.docA))
    r2 = client.post("/api/prescriptions", json={"encounter_id": w.enc["id"], "items": []}, headers=H(w.docA))
    assert r2.status_code == 409


# =================================================================== items
def test_doctor_can_edit_items_and_instructions_while_draft(w):
    rx = client.post("/api/prescriptions", json={"encounter_id": w.enc["id"], "items": [ITEM]}, headers=H(w.docA)).json()
    r = client.put(f"/api/prescriptions/{rx['id']}",
                    json={"items": [ITEM, {"medicine_name": "Aspirin", "dose": "75", "unit": "mg"}],
                          "clinical_instructions": "Review in 2 weeks"},
                    headers=H(w.docA))
    assert r.status_code == 200
    updated = r.json()
    assert len(updated["items"]) == 2 and updated["clinical_instructions"] == "Review in 2 weeks"


def test_other_doctor_cannot_read_or_edit_prescription(w):
    rx = client.post("/api/prescriptions", json={"encounter_id": w.enc["id"], "items": [ITEM]}, headers=H(w.docA)).json()
    assert client.get(f"/api/prescriptions/{rx['id']}", headers=H(w.docA2)).status_code == 404
    assert client.put(f"/api/prescriptions/{rx['id']}", json={"items": []}, headers=H(w.docA2)).status_code == 404


def test_cross_hospital_doctor_gets_404(w):
    rx = client.post("/api/prescriptions", json={"encounter_id": w.enc["id"], "items": [ITEM]}, headers=H(w.docA)).json()
    assert client.get(f"/api/prescriptions/{rx['id']}", headers=H(w.docB)).status_code == 404


def test_administrator_can_view_but_not_edit_prescription(w):
    rx = client.post("/api/prescriptions", json={"encounter_id": w.enc["id"], "items": [ITEM]}, headers=H(w.docA)).json()
    assert client.get(f"/api/prescriptions/{rx['id']}", headers=H(w.adminA)).status_code == 200
    assert client.put(f"/api/prescriptions/{rx['id']}", json={"items": []}, headers=H(w.adminA)).status_code == 403


# ============================================================== versioning
def test_new_version_cancels_prior_and_carries_items_forward(w):
    rx = client.post("/api/prescriptions", json={"encounter_id": w.enc["id"], "items": [ITEM]}, headers=H(w.docA)).json()
    r = client.post(f"/api/prescriptions/{rx['id']}/new-version", headers=H(w.docA))
    assert r.status_code == 200
    revised = r.json()
    assert revised["version"] == 2 and revised["status"] == "Draft"
    assert revised["items"][0]["medicine_name"] == "Metformin"
    assert client.get(f"/api/prescriptions/{rx['id']}", headers=H(w.docA)).json()["status"] == "Cancelled"


def test_cannot_edit_a_cancelled_version(w):
    rx = client.post("/api/prescriptions", json={"encounter_id": w.enc["id"], "items": [ITEM]}, headers=H(w.docA)).json()
    client.post(f"/api/prescriptions/{rx['id']}/new-version", headers=H(w.docA))
    r = client.put(f"/api/prescriptions/{rx['id']}", json={"items": []}, headers=H(w.docA))
    assert r.status_code == 400


def test_encounter_prescription_list_returns_all_versions_newest_first(w):
    rx = client.post("/api/prescriptions", json={"encounter_id": w.enc["id"], "items": [ITEM]}, headers=H(w.docA)).json()
    client.post(f"/api/prescriptions/{rx['id']}/new-version", headers=H(w.docA))
    rows = client.get(f"/api/encounters/{w.enc['id']}/prescriptions", headers=H(w.docA)).json()
    assert [r["version"] for r in rows] == [2, 1]


# ================================================================= history
def test_patient_prescription_history_scoped_to_clinical_staff(w):
    client.post("/api/prescriptions", json={"encounter_id": w.enc["id"], "items": [ITEM]}, headers=H(w.docA))
    r = client.get(f"/api/patients/{w.PA['id']}/prescriptions", headers=H(w.docA))
    assert r.status_code == 200 and len(r.json()) == 1
    assert client.get(f"/api/patients/{w.PA['id']}/prescriptions", headers=H(w.docA2)).status_code == 404


# ================================================= no finalize route yet
def test_cannot_finalize_a_draft_without_ddi_review(w):
    rx = client.post("/api/prescriptions", json={"encounter_id": w.enc["id"], "items": [ITEM]}, headers=H(w.docA)).json()
    assert client.post(f"/api/prescriptions/{rx['id']}/finalize", headers=H(w.docA)).status_code == 400  # Phase 7: route exists, Draft is refused
