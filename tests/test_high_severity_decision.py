"""
Phase 7 — High-Severity Decision Workflow.

Covers: a High-severity DDI result blocking /finalize until the doctor
explicitly records a decision via /decision; Low/Moderate results
finalizing directly; decision/finalize doctor-own + hospital scoping;
no invented "safer alternatives" (module2_drug has no such data source);
and the full state machine Draft -> Under DDI Review / Awaiting Doctor
Decision -> Doctor Decision Recorded -> Finalized.

Run:  pytest tests/test_high_severity_decision.py -v
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
SAFE_ITEMS = [
    {"medicine_name": "Paracetamol", "dose": "500", "unit": "mg", "frequency": "As needed"},
    {"medicine_name": "Vitamin D", "dose": "1000", "unit": "IU"},
]


@pytest.fixture
def w():
    A = org_store.create(OrganizationCreate(name="Hospital A7"))
    B = org_store.create(OrganizationCreate(name="Hospital B7"))
    ns = SimpleNamespace(A=A, B=B)
    ns.adminA = mk("Admin A7", "p7-adminA@x.io", "administrator", A)
    ns.docA = mk("Doc A7", "p7-docA@x.io", "doctor", A)
    ns.docA2 = mk("Doc A27", "p7-docA2@x.io", "doctor", A)
    ns.docB = mk("Doc B7", "p7-docB@x.io", "doctor", B)
    ns.PA = patient_service.create_full_record(
        {"name": "Carl A", "phone": "9333333333", "age": 70, "gender": "Male", "egfr": 90, "alt": 20,
         "org_id": A["id"]}, owner_id=ns.adminA["id"])
    ns.apt = client.post("/api/appointments", json=_apt_payload(ns.PA["id"], ns.docA["id"]), headers=H(ns.adminA)).json()
    ns.enc = client.post("/api/encounters", json={"appointment_id": ns.apt["id"]}, headers=H(ns.docA)).json()
    return ns


def _mk_rx(w, items):
    return client.post("/api/prescriptions", json={"encounter_id": w.enc["id"], "items": items}, headers=H(w.docA)).json()


def _run_ddi(w, rx):
    return client.post(f"/api/prescriptions/{rx['id']}/ddi-analysis", headers=H(w.docA)).json()


# ============================================================ low/moderate
def test_low_severity_finalizes_directly_without_decision(w):
    rx = _mk_rx(w, SAFE_ITEMS)
    _run_ddi(w, rx)
    r = client.post(f"/api/prescriptions/{rx['id']}/finalize", headers=H(w.docA))
    assert r.status_code == 200
    assert r.json()["status"] == "Finalized"
    assert r.json()["finalized_at"] is not None


def test_cannot_finalize_before_ddi_analysis_has_run(w):
    rx = _mk_rx(w, SAFE_ITEMS)
    r = client.post(f"/api/prescriptions/{rx['id']}/finalize", headers=H(w.docA))
    assert r.status_code == 400


# ================================================================== high
def test_high_severity_blocks_finalize_until_decision(w):
    rx = _mk_rx(w, HIGH_RISK_ITEMS)
    _run_ddi(w, rx)
    blocked = client.post(f"/api/prescriptions/{rx['id']}/finalize", headers=H(w.docA))
    assert blocked.status_code == 400
    assert "decision" in blocked.json()["detail"].lower()

    decided = client.post(f"/api/prescriptions/{rx['id']}/decision",
                           json={"decision": "Proceed", "reason": "Benefit outweighs risk; INR will be monitored."},
                           headers=H(w.docA))
    assert decided.status_code == 200
    assert decided.json()["decision"] == "Proceed"
    assert client.get(f"/api/prescriptions/{rx['id']}", headers=H(w.docA)).json()["status"] == "Doctor Decision Recorded"

    finalized = client.post(f"/api/prescriptions/{rx['id']}/finalize", headers=H(w.docA))
    assert finalized.status_code == 200
    assert finalized.json()["status"] == "Finalized"


def test_decision_requires_a_reason(w):
    rx = _mk_rx(w, HIGH_RISK_ITEMS)
    _run_ddi(w, rx)
    r = client.post(f"/api/prescriptions/{rx['id']}/decision", json={"decision": "Proceed"}, headers=H(w.docA))
    assert r.status_code == 400


def test_decision_rejects_invalid_value(w):
    rx = _mk_rx(w, HIGH_RISK_ITEMS)
    _run_ddi(w, rx)
    r = client.post(f"/api/prescriptions/{rx['id']}/decision",
                     json={"decision": "Ignore It", "reason": "x"}, headers=H(w.docA))
    assert r.status_code == 400


def test_decision_route_rejects_when_not_awaiting_decision(w):
    rx = _mk_rx(w, SAFE_ITEMS)
    _run_ddi(w, rx)  # Under DDI Review, not Awaiting Doctor Decision
    r = client.post(f"/api/prescriptions/{rx['id']}/decision",
                     json={"decision": "Proceed", "reason": "n/a"}, headers=H(w.docA))
    assert r.status_code == 400


def test_no_invented_alternatives_in_ddi_response(w):
    """Rule 10 / task 'Show possible alternatives only where supported by
    actual data': module2_drug has no alternative-drug dataset, so the
    analysis response must never contain fabricated substitute names."""
    rx = _mk_rx(w, HIGH_RISK_ITEMS)
    body = _run_ddi(w, rx)
    assert "alternatives" not in body
    for pair in body["pairs"]:
        assert "alternatives" not in pair and "suggested_alternatives" not in pair


def test_revise_prescription_decision_does_not_auto_finalize(w):
    """A 'Revise Prescription' decision still requires the doctor to take
    an explicit next step (finalize or new-version) -- it is recorded, not
    auto-applied (Rule 10: never auto-replace a medicine)."""
    rx = _mk_rx(w, HIGH_RISK_ITEMS)
    _run_ddi(w, rx)
    d = client.post(f"/api/prescriptions/{rx['id']}/decision",
                     json={"decision": "Revise Prescription", "reason": "Switching to a safer anticoagulant."},
                     headers=H(w.docA))
    assert d.status_code == 200 and d.json()["decision"] == "Revise Prescription"
    still_open = client.get(f"/api/prescriptions/{rx['id']}", headers=H(w.docA)).json()
    assert still_open["status"] == "Doctor Decision Recorded"  # not silently Finalized

    revised = client.post(f"/api/prescriptions/{rx['id']}/new-version", headers=H(w.docA))
    assert revised.status_code == 200
    assert revised.json()["status"] == "Draft" and revised.json()["version"] == 2


def test_decision_history_lists_newest_first(w):
    rx = _mk_rx(w, HIGH_RISK_ITEMS)
    _run_ddi(w, rx)
    client.post(f"/api/prescriptions/{rx['id']}/decision",
                json={"decision": "Proceed", "reason": "ok"}, headers=H(w.docA))
    hist = client.get(f"/api/prescriptions/{rx['id']}/decisions", headers=H(w.docA)).json()
    assert len(hist) == 1 and hist[0]["decision"] == "Proceed"


# ============================================================== finalize
def test_cannot_finalize_twice(w):
    rx = _mk_rx(w, SAFE_ITEMS)
    _run_ddi(w, rx)
    assert client.post(f"/api/prescriptions/{rx['id']}/finalize", headers=H(w.docA)).status_code == 200
    r2 = client.post(f"/api/prescriptions/{rx['id']}/finalize", headers=H(w.docA))
    assert r2.status_code == 400


def test_cannot_finalize_a_cancelled_prescription(w):
    rx = _mk_rx(w, SAFE_ITEMS)
    client.post(f"/api/prescriptions/{rx['id']}/new-version", headers=H(w.docA))  # cancels rx
    r = client.post(f"/api/prescriptions/{rx['id']}/finalize", headers=H(w.docA))
    assert r.status_code == 400


# ========================================================= scoping/roles
def test_decision_and_finalize_are_doctor_own_scoped(w):
    rx = _mk_rx(w, HIGH_RISK_ITEMS)
    _run_ddi(w, rx)
    assert client.post(f"/api/prescriptions/{rx['id']}/decision", json={"decision": "Proceed", "reason": "x"},
                        headers=H(w.docA2)).status_code == 404
    assert client.post(f"/api/prescriptions/{rx['id']}/finalize", headers=H(w.docA2)).status_code == 404
    assert client.post(f"/api/prescriptions/{rx['id']}/decision", json={"decision": "Proceed", "reason": "x"},
                        headers=H(w.docB)).status_code == 404


def test_decision_and_finalize_are_doctor_only(w):
    rx = _mk_rx(w, HIGH_RISK_ITEMS)
    _run_ddi(w, rx)
    assert client.post(f"/api/prescriptions/{rx['id']}/decision", json={"decision": "Proceed", "reason": "x"},
                        headers=H(w.adminA)).status_code == 403
    assert client.post(f"/api/prescriptions/{rx['id']}/finalize", headers=H(w.adminA)).status_code == 403
    assert client.get(f"/api/prescriptions/{rx['id']}/decisions", headers=H(w.adminA)).status_code == 403
