"""
Phase 9 -- Pharmacy orders and dispensing.

Covers: only Finalized prescriptions can be sent (administrator only, once),
pharmacist hospital scope + assignment, per-item dispensing lifecycle
(partial -> complete, unavailable, mixed), validation, no DDI data in any
pharmacy response, and cross-hospital / cross-role denials.

Run:  pytest tests/test_pharmacy.py -v
"""
import json
from types import SimpleNamespace

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.modules.module1_patient import patient_service
from app.modules.module_auth import create_token, user_store
from app.modules.module_org import OrganizationCreate, org_store

client = TestClient(app)
PW = "Passw0rd!xyz"
ITEMS = [{"medicine_name": "Aspirin", "dose": "75", "unit": "mg", "frequency": "Once daily", "duration": "30 days", "quantity": 30},
         {"medicine_name": "Warfarin", "dose": "5", "unit": "mg", "frequency": "Once daily", "timing": "Evening", "quantity": 30}]
FORBIDDEN = ("ddi", "severity", "interaction", "mechanism", "recommendation", "alternative", "reasoning", "decision")


def H(u):
    return {"Authorization": f"Bearer {create_token(u)}"}


def mk(name, email, role, org=None, **kw):
    return user_store.create(name, email, PW, role, org=(org or {}).get("name", ""), org_id=(org or {}).get("id"), **kw)


@pytest.fixture
def w():
    A = org_store.create(OrganizationCreate(name="Hospital A9"))
    B = org_store.create(OrganizationCreate(name="Hospital B9"))
    ns = SimpleNamespace(A=A, B=B)
    ns.adminA = mk("Admin A9", "p9-adminA@x.io", "administrator", A)
    ns.adminB = mk("Admin B9", "p9-adminB@x.io", "administrator", B)
    ns.docA = mk("Doc A9", "p9-docA@x.io", "doctor", A)
    ns.pharm1 = mk("Pharm 1", "p9-ph1@x.io", "pharmacist", A)
    ns.pharm2 = mk("Pharm 2", "p9-ph2@x.io", "pharmacist", A)
    ns.pharmB = mk("Pharm B", "p9-phB@x.io", "pharmacist", B)
    ns.PA = patient_service.create_full_record({"name": "Fay A", "phone": "9666666666", "age": 55, "gender": "Female",
                                                 "egfr": 80, "alt": 20, "org_id": A["id"]}, owner_id=ns.adminA["id"])
    return ns


def _finalized(w, decision=True):
    apt = client.post("/api/appointments", json={"patient_id": w.PA["id"], "doctor_id": w.docA["id"],
                      "reason": "Follow-up visit", "appointment_date": "2026-09-25"}, headers=H(w.adminA)).json()
    enc = client.post("/api/encounters", json={"appointment_id": apt["id"]}, headers=H(w.docA)).json()
    rx = client.post("/api/prescriptions", json={"encounter_id": enc["id"], "items": ITEMS}, headers=H(w.docA)).json()
    client.post(f"/api/prescriptions/{rx['id']}/ddi-analysis", headers=H(w.docA))
    client.post(f"/api/prescriptions/{rx['id']}/decision", json={"decision": "Proceed", "reason": "Monitored"}, headers=H(w.docA))
    assert client.post(f"/api/prescriptions/{rx['id']}/finalize", headers=H(w.docA)).status_code == 200
    return client.get(f"/api/prescriptions/{rx['id']}", headers=H(w.docA)).json()


def _send(w, rx, **kw):
    return client.post("/api/pharmacy/orders", json={"prescription_id": rx["id"], **kw}, headers=H(w.adminA))


def _dispense(w, user, oid, entries, notes=""):
    return client.post(f"/api/pharmacy/orders/{oid}/dispense", json={"items": entries, "notes": notes}, headers=H(user))


def test_send_requires_finalized_admin_only_and_once(w):
    apt = client.post("/api/appointments", json={"patient_id": w.PA["id"], "doctor_id": w.docA["id"],
                      "reason": "Follow-up visit", "appointment_date": "2026-09-25"}, headers=H(w.adminA)).json()
    enc = client.post("/api/encounters", json={"appointment_id": apt["id"]}, headers=H(w.docA)).json()
    draft = client.post("/api/prescriptions", json={"encounter_id": enc["id"], "items": ITEMS}, headers=H(w.docA)).json()
    assert _send(w, draft).status_code == 400


def test_send_flow_permissions_and_duplicate(w):
    rx = _finalized(w)
    for u in (w.docA, w.pharm1):
        assert client.post("/api/pharmacy/orders", json={"prescription_id": rx["id"]}, headers=H(u)).status_code == 403
    assert client.post("/api/pharmacy/orders", json={"prescription_id": rx["id"]}, headers=H(w.adminB)).status_code == 404
    r = _send(w, rx)
    assert r.status_code == 200 and r.json()["status"] == "Sent"
    assert _send(w, rx).status_code == 409
    for ph in (w.pharm1, w.pharm2):
        notes = client.get("/api/notifications", headers=H(ph)).json()
        assert any(n.get("reference_id") == r.json()["id"] for n in notes)
    assert not any(n.get("reference_id") == r.json()["id"] for n in client.get("/api/notifications", headers=H(w.pharmB)).json())


def test_pharmacy_view_has_dispensing_data_and_no_ddi(w):
    rx = _finalized(w)
    oid = _send(w, rx).json()["id"]
    body = client.get(f"/api/pharmacy/orders/{oid}", headers=H(w.pharm1))
    assert body.status_code == 200
    v = body.json()
    assert v["patient"]["name"] == "Fay A" and [i["name"] for i in v["items"]] == ["Aspirin", "Warfarin"]
    assert v["items"][1]["timing"] == "Evening" and v["items"][0]["dispense_status"] == "Pending"
    for path in ("/api/pharmacy/orders", f"/api/pharmacy/orders/{oid}"):
        blob = client.get(path, headers=H(w.pharm1)).text.lower()
        for bad in FORBIDDEN:
            assert bad not in blob, (path, bad)


def test_scope_cross_hospital_and_roles(w):
    oid = _send(w, _finalized(w)).json()["id"]
    assert client.get(f"/api/pharmacy/orders/{oid}", headers=H(w.pharmB)).status_code == 404
    assert client.get(f"/api/pharmacy/orders/{oid}", headers=H(w.adminB)).status_code == 404
    assert client.get("/api/pharmacy/orders", headers=H(w.pharmB)).json() == []
    assert client.get("/api/pharmacy/orders", headers=H(w.docA)).status_code == 403
    assert client.post(f"/api/pharmacy/orders/{oid}/accept", headers=H(w.pharmB)).status_code == 404
    assert client.post(f"/api/pharmacy/orders/{oid}/accept", headers=H(w.adminA)).status_code == 403
    assert len(client.get("/api/pharmacy/orders", headers=H(w.adminA)).json()) == 1


def test_accept_assigns_and_hides_from_other_pharmacist(w):
    oid = _send(w, _finalized(w)).json()["id"]
    r = client.post(f"/api/pharmacy/orders/{oid}/accept", headers=H(w.pharm1))
    assert r.status_code == 200 and r.json()["status"] == "Accepted" and r.json()["pharmacist_id"] == w.pharm1["id"]
    assert client.get(f"/api/pharmacy/orders/{oid}", headers=H(w.pharm2)).status_code == 404
    assert client.get("/api/pharmacy/orders", headers=H(w.pharm2)).json() == []
    assert client.post(f"/api/pharmacy/orders/{oid}/accept", headers=H(w.pharm1)).status_code == 400


def test_partial_then_complete_dispensing(w):
    rx = _finalized(w)
    oid = _send(w, rx).json()["id"]
    a, b = [i["id"] for i in rx["items"]]
    r = _dispense(w, w.pharm1, oid, [{"item_id": a, "status": "Dispensed", "quantity_dispensed": 30}], "first item")
    assert r.status_code == 200 and r.json()["status"] == "Partially Dispensed" and r.json()["completed_at"] is None
    r = _dispense(w, w.pharm1, oid, [{"item_id": b, "status": "Dispensed", "quantity_dispensed": 30}])
    v = r.json()
    assert v["status"] == "Dispensed" and v["completed_at"] and len(v["dispensing"]) == 2
    assert all(i["dispense_status"] == "Dispensed" for i in v["items"])
    assert v["dispensing"][0]["pharmacist_id"] == w.pharm1["id"] and v["dispensing"][0]["dispensed_at"]
    assert _dispense(w, w.pharm1, oid, [{"item_id": a, "status": "Dispensed"}]).status_code == 400
    assert client.get("/api/pharmacy/orders?status=open", headers=H(w.pharm1)).json() == []


def test_unavailable_and_mixed_outcomes(w):
    rx = _finalized(w)
    oid = _send(w, rx).json()["id"]
    a, b = [i["id"] for i in rx["items"]]
    v = _dispense(w, w.pharm1, oid, [{"item_id": a, "status": "Unavailable"}, {"item_id": b, "status": "Unavailable"}]).json()
    assert v["status"] == "Unable to Dispense" and v["completed_at"]


def test_dispense_validation(w):
    rx = _finalized(w)
    oid = _send(w, rx).json()["id"]
    a = rx["items"][0]["id"]
    assert _dispense(w, w.pharm1, oid, []).status_code == 400
    assert _dispense(w, w.pharm1, oid, [{"item_id": "NOPE", "status": "Dispensed"}]).status_code == 400
    assert _dispense(w, w.pharm1, oid, [{"item_id": a, "status": "Sold"}]).status_code == 400
    assert _dispense(w, w.pharm1, oid, [{"item_id": a, "status": "Dispensed", "quantity_dispensed": -1}]).status_code == 400
    assert _dispense(w, w.adminA, oid, [{"item_id": a, "status": "Dispensed"}]).status_code == 403
    assert _dispense(w, w.pharmB, oid, [{"item_id": a, "status": "Dispensed"}]).status_code == 404


def test_mixed_final_outcome_is_closed_partial(w):
    rx = _finalized(w)
    oid = _send(w, rx).json()["id"]
    a, b = [i["id"] for i in rx["items"]]
    _dispense(w, w.pharm1, oid, [{"item_id": a, "status": "Dispensed", "quantity_dispensed": 30}])
    v = _dispense(w, w.pharm1, oid, [{"item_id": b, "status": "Unavailable"}]).json()
    assert v["status"] == "Partially Dispensed" and v["completed_at"]
