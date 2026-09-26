"""
Phase 10 -- Patient portal.

A patient can only ever see their OWN appointments, released reports, medicines
and notifications; cannot reach another patient's ID/report/prescription/
notifications; cannot search patients; never sees DDI internals or internal
consultation data. Run:  pytest tests/test_patient_portal.py -v
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
FORBIDDEN = ("ddi", "severity", "interaction", "mechanism", "recommendation", "alternative", "reasoning", "decision", "consultation_notes", "clinical_findings")


def H(u):
    return {"Authorization": f"Bearer {create_token(u)}"}


def mk(name, email, role, org=None, **kw):
    return user_store.create(name, email, PW, role, org=(org or {}).get("name", ""), org_id=(org or {}).get("id"), **kw)


@pytest.fixture
def w():
    A = org_store.create(OrganizationCreate(name="Hospital A10"))
    B = org_store.create(OrganizationCreate(name="Hospital B10"))
    ns = SimpleNamespace(A=A, B=B)
    ns.adminA = mk("Admin A10", "p10-adminA@x.io", "administrator", A)
    ns.docA = mk("Doc A10", "p10-docA@x.io", "doctor", A)
    ns.pharmA = mk("Pharm A10", "p10-phA@x.io", "pharmacist", A)
    ns.PA = patient_service.create_full_record({"name": "Pat One", "phone": "9700000001", "age": 40, "gender": "Male",
                                                 "egfr": 80, "alt": 20, "org_id": A["id"]}, owner_id=ns.adminA["id"])
    ns.PB = patient_service.create_full_record({"name": "Pat Two", "phone": "9700000002", "age": 41, "gender": "Female",
                                                 "egfr": 80, "alt": 20, "org_id": A["id"]}, owner_id=ns.adminA["id"])
    ns.userA = mk("Pat One", "p10-patA@x.io", "patient", A, patient_id=ns.PA["id"])
    ns.userB = mk("Pat Two", "p10-patB@x.io", "patient", A, patient_id=ns.PB["id"])
    ns.unlinked = mk("No Record", "p10-none@x.io", "patient", A)
    return ns


def _visit(w, patient, release=True, dispense=False):
    apt = client.post("/api/appointments", json={"patient_id": patient["id"], "doctor_id": w.docA["id"],
                      "reason": "Follow-up visit", "appointment_date": "2026-09-25"}, headers=H(w.adminA)).json()
    enc = client.post("/api/encounters", json={"appointment_id": apt["id"]}, headers=H(w.docA)).json()
    client.put(f"/api/encounters/{enc['id']}", json={"notes": "SECRET-NOTE", "diagnosis": "Hypertension"}, headers=H(w.docA))
    rx = client.post("/api/prescriptions", json={"encounter_id": enc["id"], "items": ITEMS}, headers=H(w.docA)).json()
    client.post(f"/api/prescriptions/{rx['id']}/ddi-analysis", headers=H(w.docA))
    client.post(f"/api/prescriptions/{rx['id']}/decision", json={"decision": "Proceed", "reason": "Monitored"}, headers=H(w.docA))
    assert client.post(f"/api/prescriptions/{rx['id']}/finalize", headers=H(w.docA)).status_code == 200
    rep = client.post(f"/api/reports/from-prescription/{rx['id']}", headers=H(w.adminA)).json()
    if release:
        assert client.post(f"/api/reports/{rep['id']}/release", headers=H(w.adminA)).status_code == 200
    if dispense:
        o = client.post("/api/pharmacy/orders", json={"prescription_id": rx["id"]}, headers=H(w.adminA)).json()
        items = [{"item_id": i["id"], "status": "Dispensed"} for i in o["items"]]
        assert client.post(f"/api/pharmacy/orders/{o['id']}/dispense", json={"items": items}, headers=H(w.pharmA)).status_code == 200
    return apt, rx, rep


def test_profile_is_own_and_allowlisted(w):
    r = client.get("/api/portal/me", headers=H(w.userA))
    assert r.status_code == 200 and r.json()["id"] == w.PA["id"] and r.json()["hospital"]["name"] == "Hospital A10"
    assert "owner_id" not in r.json() and "org_id" not in r.json()


def test_unlinked_patient_account_gets_404(w):
    for path in ("me", "appointments", "medications"):
        assert client.get(f"/api/portal/{path}", headers=H(w.unlinked)).status_code == 404


def test_appointments_only_own(w):
    _visit(w, w.PA, release=False)
    _visit(w, w.PB, release=False)
    mine = client.get("/api/portal/appointments", headers=H(w.userA)).json()
    assert len(mine) == 1 and mine[0]["doctor"]["name"] == "Doc A10" and mine[0]["queue_number"]
    assert "patient_id" not in mine[0] and "org_id" not in mine[0]
    assert len(client.get("/api/portal/appointments", headers=H(w.userB)).json()) == 1


def test_medications_hidden_until_report_released(w):
    _visit(w, w.PA, release=False)
    assert client.get("/api/portal/medications", headers=H(w.userA)).json() == []


def test_medications_after_release_and_dispensing_progress(w):
    _visit(w, w.PA)
    meds = client.get("/api/portal/medications", headers=H(w.userA)).json()
    assert len(meds) == 1 and {m["name"] for m in meds[0]["medicines"]} == {"Aspirin", "Warfarin"}
    assert meds[0]["pharmacy_status"] == "Not yet sent to the pharmacy"
    assert all(m["dispense_status"] is None for m in meds[0]["medicines"])
    assert client.get("/api/portal/medications", headers=H(w.userB)).json() == []  # other patient sees nothing


def test_dispensed_status_visible_and_patient_notified(w):
    _visit(w, w.PA, dispense=True)
    meds = client.get("/api/portal/medications", headers=H(w.userA)).json()
    assert meds[0]["pharmacy_status"] == "Dispensed" and all(m["dispense_status"] == "Dispensed" for m in meds[0]["medicines"])
    notes = client.get("/api/notifications", headers=H(w.userA)).json()
    types = {n.get("type") for n in notes}
    assert {"APPOINTMENT", "REPORT_RELEASED", "MEDICATION_UPDATE"} <= types
    assert not client.get("/api/notifications", headers=H(w.userB)).json()


def test_no_ddi_or_internal_data_in_any_portal_response(w):
    _visit(w, w.PA, dispense=True)
    blobs = [client.get(f"/api/portal/{p}", headers=H(w.userA)).text for p in ("me", "appointments", "medications")]
    blobs.append(client.get("/api/reports", headers=H(w.userA)).text)
    blobs.append(client.get("/api/notifications", headers=H(w.userA)).text)
    for b in blobs:
        low = b.lower()
        assert "secret-note" not in low
        for word in FORBIDDEN:
            assert word not in low, word


def test_patient_reports_own_released_only_and_cross_patient_404(w):
    _, _, repA = _visit(w, w.PA)
    _, _, repB = _visit(w, w.PB)
    ids = [r["id"] for r in client.get("/api/reports", headers=H(w.userA)).json()]
    assert ids == [repA["id"]]
    assert client.get(f"/api/reports/{repA['id']}", headers=H(w.userA)).status_code == 200
    assert client.get(f"/api/reports/{repB['id']}", headers=H(w.userA)).status_code == 404
    assert client.post(f"/api/reports/{repB['id']}/log-access", json={}, headers=H(w.userA)).status_code == 404


def test_unreleased_report_not_visible_to_patient(w):
    _, _, rep = _visit(w, w.PA, release=False)
    assert client.get(f"/api/reports/{rep['id']}", headers=H(w.userA)).status_code == 404
    assert client.get("/api/reports", headers=H(w.userA)).json() == []


def test_patient_cannot_access_other_patient_or_search(w):
    assert client.get(f"/api/patients/{w.PA['id']}", headers=H(w.userA)).status_code == 200
    assert client.get(f"/api/patients/{w.PB['id']}", headers=H(w.userA)).status_code == 404
    assert [p["id"] for p in client.get("/api/patients", headers=H(w.userA)).json()] == [w.PA["id"]]
    assert client.get("/api/patients/search?q=Pat", headers=H(w.userA)).status_code == 403


def test_patient_cannot_modify_clinical_data(w):
    assert client.put(f"/api/patients/{w.PA['id']}", json={"name": "Hacked"}, headers=H(w.userA)).status_code == 403
    assert client.delete(f"/api/patients/{w.PA['id']}", headers=H(w.userA)).status_code == 403
    assert client.put(f"/api/patients/{w.PA['id']}/medications", json=[], headers=H(w.userA)).status_code in (403, 404, 422)


def test_patient_blocked_from_clinical_and_pharmacy_routes(w):
    apt, rx, _ = _visit(w, w.PA, dispense=True)
    for method, path in [("get", f"/api/prescriptions/{rx['id']}"), ("get", f"/api/prescriptions/{rx['id']}/ddi-analysis"),
                         ("get", f"/api/prescriptions/{rx['id']}/decisions"), ("get", f"/api/patients/{w.PA['id']}/prescriptions"),
                         ("get", f"/api/patients/{w.PA['id']}/encounters"), ("get", f"/api/appointments/{apt['id']}"),
                         ("get", "/api/appointments"), ("get", "/api/doctor/appointments"), ("get", "/api/pharmacy/orders"),
                         ("get", "/api/analyses")]:
        r = getattr(client, method)(path, headers=H(w.userA))
        assert r.status_code in (403, 404), (path, r.status_code)
    assert client.get("/api/reviews", headers=H(w.userA)).json() == []  # patients have no review queue


def test_notifications_are_own_only(w):
    _visit(w, w.PA, release=False)
    n = client.get("/api/notifications", headers=H(w.userA)).json()
    assert n
    nid = n[0]["id"]
    assert client.post(f"/api/notifications/{nid}/read", headers=H(w.userB)).status_code == 404
    assert client.delete(f"/api/notifications/{nid}", headers=H(w.userB)).status_code == 404
    assert client.post(f"/api/notifications/{nid}/read", headers=H(w.userA)).status_code == 200


def test_portal_is_patient_only(w):
    for u in (w.adminA, w.docA, w.pharmA):
        for path in ("me", "appointments", "medications"):
            assert client.get(f"/api/portal/{path}", headers=H(u)).status_code == 403
    assert client.get("/api/portal/me").status_code in (401, 403)
