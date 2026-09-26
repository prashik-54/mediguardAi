"""
Phase 6 — Doctor-Only DDI Integration.

Covers: running the Module 2-4 pipeline against a prescription's medicine
pairs, persisting the result via module11 linked to
prescription/encounter/patient/doctor, doctor-own + hospital scoping,
ground-truth severity (not the Module 4 placeholder) driving
`overall_severity`, the Draft -> "Under DDI Review" transition, and history
listing. Phase 7 (high-severity doctor decision / finalize) is deliberately
NOT exercised here.

Run:  pytest tests/test_doctor_ddi_analysis.py -v
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
    return {"patient_id": patient_id, "doctor_id": doctor_id, "reason": "Anticoagulation follow-up",
            "appointment_date": "2026-09-25", **extra}


HIGH_RISK_ITEMS = [
    {"medicine_name": "Aspirin", "dose": "75", "unit": "mg", "frequency": "Once daily"},
    {"medicine_name": "Warfarin", "dose": "5", "unit": "mg", "frequency": "Once daily"},
]
SAFE_ITEM = [{"medicine_name": "Paracetamol", "dose": "500", "unit": "mg", "frequency": "As needed"}]


@pytest.fixture
def w():
    A = org_store.create(OrganizationCreate(name="Hospital A"))
    B = org_store.create(OrganizationCreate(name="Hospital B"))
    ns = SimpleNamespace(A=A, B=B)
    ns.adminA = mk("Admin A", "ddi-adminA@x.io", "administrator", A)
    ns.docA = mk("Doc A", "ddi-docA@x.io", "doctor", A)
    ns.docA2 = mk("Doc A2", "ddi-docA2@x.io", "doctor", A)
    ns.docB = mk("Doc B", "ddi-docB@x.io", "doctor", B)
    ns.PA = patient_service.create_full_record(
        {"name": "Bob A", "phone": "9222222222", "age": 70, "gender": "Male", "egfr": 90, "alt": 20,
         "org_id": A["id"]}, owner_id=ns.adminA["id"])
    ns.apt = client.post("/api/appointments", json=_apt_payload(ns.PA["id"], ns.docA["id"]), headers=H(ns.adminA)).json()
    ns.enc = client.post("/api/encounters", json={"appointment_id": ns.apt["id"]}, headers=H(ns.docA)).json()
    return ns


def _mk_rx(w, items):
    return client.post("/api/prescriptions", json={"encounter_id": w.enc["id"], "items": items}, headers=H(w.docA)).json()


# ================================================================= running
def test_doctor_runs_analysis_and_high_severity_moves_to_awaiting_decision(w):
    """Phase 7 superseded behavior: a High result routes to 'Awaiting
    Doctor Decision', not the plain 'Under DDI Review' (see
    test_high_severity_decision_workflow.py for the Low/Moderate case)."""
    rx = _mk_rx(w, HIGH_RISK_ITEMS)
    r = client.post(f"/api/prescriptions/{rx['id']}/ddi-analysis", headers=H(w.docA))
    assert r.status_code == 200
    body = r.json()
    assert body["prescription_id"] == rx["id"] and body["encounter_id"] == w.enc["id"]
    assert body["patient_id"] == w.PA["id"] and body["doctor_id"] == w.docA["id"]
    assert len(body["pairs"]) == 1
    assert body["overall_severity"] == "High"
    assert "ml_placeholder" in body and "fused_tensor_shape" in body["ml_placeholder"]
    updated_rx = client.get(f"/api/prescriptions/{rx['id']}", headers=H(w.docA)).json()
    assert updated_rx["status"] == "Awaiting Doctor Decision"


def test_low_risk_pair_reports_low_severity(w):
    rx = _mk_rx(w, SAFE_ITEM + [{"medicine_name": "Vitamin D", "dose": "1000", "unit": "IU"}])
    r = client.post(f"/api/prescriptions/{rx['id']}/ddi-analysis", headers=H(w.docA))
    assert r.status_code == 200 and r.json()["overall_severity"] == "Low"


def test_single_item_prescription_has_no_pairs(w):
    rx = _mk_rx(w, SAFE_ITEM)
    r = client.post(f"/api/prescriptions/{rx['id']}/ddi-analysis", headers=H(w.docA))
    assert r.status_code == 200 and r.json()["pairs"] == [] and r.json()["overall_severity"] == "Low"


def test_empty_prescription_cannot_be_analyzed(w):
    rx = _mk_rx(w, [])
    r = client.post(f"/api/prescriptions/{rx['id']}/ddi-analysis", headers=H(w.docA))
    assert r.status_code == 400


def test_running_again_is_allowed_while_under_review(w):
    rx = _mk_rx(w, SAFE_ITEM + [{"medicine_name": "Vitamin D", "dose": "1000", "unit": "IU"}])
    client.post(f"/api/prescriptions/{rx['id']}/ddi-analysis", headers=H(w.docA))
    r2 = client.post(f"/api/prescriptions/{rx['id']}/ddi-analysis", headers=H(w.docA))
    assert r2.status_code == 200


def test_running_again_is_blocked_once_awaiting_doctor_decision(w):
    """Phase 7: a High result moves the prescription out of the re-runnable
    states -- the doctor must record a decision (or start a new version)
    instead of silently re-analyzing the same unedited items."""
    rx = _mk_rx(w, HIGH_RISK_ITEMS)
    client.post(f"/api/prescriptions/{rx['id']}/ddi-analysis", headers=H(w.docA))
    r2 = client.post(f"/api/prescriptions/{rx['id']}/ddi-analysis", headers=H(w.docA))
    assert r2.status_code == 400


def test_cannot_analyze_a_cancelled_prescription(w):
    rx = _mk_rx(w, HIGH_RISK_ITEMS)
    client.post(f"/api/prescriptions/{rx['id']}/new-version", headers=H(w.docA))
    r = client.post(f"/api/prescriptions/{rx['id']}/ddi-analysis", headers=H(w.docA))
    assert r.status_code == 400


# =============================================================== isolation
def test_other_doctor_cannot_run_or_read_analysis(w):
    rx = _mk_rx(w, HIGH_RISK_ITEMS)
    assert client.post(f"/api/prescriptions/{rx['id']}/ddi-analysis", headers=H(w.docA2)).status_code == 404
    client.post(f"/api/prescriptions/{rx['id']}/ddi-analysis", headers=H(w.docA))
    assert client.get(f"/api/prescriptions/{rx['id']}/ddi-analysis", headers=H(w.docA2)).status_code == 404
    assert client.get(f"/api/prescriptions/{rx['id']}/ddi-analyses", headers=H(w.docA2)).status_code == 404


def test_cross_hospital_doctor_gets_404(w):
    rx = _mk_rx(w, HIGH_RISK_ITEMS)
    assert client.post(f"/api/prescriptions/{rx['id']}/ddi-analysis", headers=H(w.docB)).status_code == 404


def test_administrator_and_platform_admin_cannot_access_ddi_routes(w):
    rx = _mk_rx(w, HIGH_RISK_ITEMS)
    client.post(f"/api/prescriptions/{rx['id']}/ddi-analysis", headers=H(w.docA))
    assert client.post(f"/api/prescriptions/{rx['id']}/ddi-analysis", headers=H(w.adminA)).status_code == 403
    assert client.get(f"/api/prescriptions/{rx['id']}/ddi-analysis", headers=H(w.adminA)).status_code == 403
    assert client.get(f"/api/prescriptions/{rx['id']}/ddi-analyses", headers=H(w.adminA)).status_code == 403


# =================================================================== reads
def test_latest_analysis_404_before_any_run(w):
    rx = _mk_rx(w, HIGH_RISK_ITEMS)
    assert client.get(f"/api/prescriptions/{rx['id']}/ddi-analysis", headers=H(w.docA)).status_code == 404


def test_history_lists_newest_first(w):
    rx = _mk_rx(w, SAFE_ITEM + [{"medicine_name": "Vitamin D", "dose": "1000", "unit": "IU"}])  # Phase 7: a High result blocks re-analysis, so use a non-High pair
    client.post(f"/api/prescriptions/{rx['id']}/ddi-analysis", headers=H(w.docA))
    client.post(f"/api/prescriptions/{rx['id']}/ddi-analysis", headers=H(w.docA))
    rows = client.get(f"/api/prescriptions/{rx['id']}/ddi-analyses", headers=H(w.docA)).json()
    assert len(rows) == 2
    assert rows[0]["created_at"] >= rows[1]["created_at"]
    latest = client.get(f"/api/prescriptions/{rx['id']}/ddi-analysis", headers=H(w.docA)).json()
    assert latest["id"] == rows[0]["id"]
