"""
Phase 11 -- Notifications and audit trail.

Covers: audit API scoping (platform admin vs hospital administrator vs others),
security-event filtering, audit of login/failed login/account changes/patient
registration/doctor assignment/finalization/dispensing, no PHI in audit
metadata or notification bodies, per-user read/dismiss of shared notifications.
Run:  pytest tests/test_notifications_audit.py -v
"""
from types import SimpleNamespace

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.modules.module1_patient import patient_service
from app.modules.module6_notifications import group_for_role, notification_store
from app.modules.module_auth import create_token, user_store
from app.modules.module_org import OrganizationCreate, org_store

client = TestClient(app)
PW = "Passw0rd!xyz"
ITEMS = [{"medicine_name": "Aspirin", "dose": "75", "unit": "mg", "frequency": "Once daily", "duration": "30 days", "quantity": 30},
         {"medicine_name": "Warfarin", "dose": "5", "unit": "mg", "frequency": "Once daily", "quantity": 30}]


def H(u):
    return {"Authorization": f"Bearer {create_token(u)}"}


def mk(name, email, role, org=None, **kw):
    return user_store.create(name, email, PW, role, org=(org or {}).get("name", ""), org_id=(org or {}).get("id"), **kw)


def audit(u, **params):
    r = client.get("/api/audit", params=params, headers=H(u))
    assert r.status_code == 200, r.text
    return r.json()


@pytest.fixture
def w():
    A = org_store.create(OrganizationCreate(name="Hospital A11"))
    B = org_store.create(OrganizationCreate(name="Hospital B11"))
    ns = SimpleNamespace(A=A, B=B)
    ns.platform = mk("Platform 11", "p11-plat@x.io", "admin")
    ns.adminA = mk("Admin A11", "p11-adminA@x.io", "administrator", A)
    ns.adminB = mk("Admin B11", "p11-adminB@x.io", "administrator", B)
    ns.docA = mk("Doc A11", "p11-docA@x.io", "doctor", A)
    ns.pharm1 = mk("Pharm 1", "p11-ph1@x.io", "pharmacist", A)
    ns.pharm2 = mk("Pharm 2", "p11-ph2@x.io", "pharmacist", A)
    ns.PA = patient_service.create_full_record({"name": "Zed Patient", "phone": "9800000001", "age": 50, "gender": "Male",
                                                 "egfr": 80, "alt": 20, "org_id": A["id"]}, owner_id=ns.adminA["id"])
    return ns


def _finalized(w):
    apt = client.post("/api/appointments", json={"patient_id": w.PA["id"], "doctor_id": w.docA["id"],
                      "reason": "Chest pain follow-up", "appointment_date": "2026-09-25"}, headers=H(w.adminA)).json()
    enc = client.post("/api/encounters", json={"appointment_id": apt["id"]}, headers=H(w.docA)).json()
    rx = client.post("/api/prescriptions", json={"encounter_id": enc["id"], "items": ITEMS}, headers=H(w.docA)).json()
    client.post(f"/api/prescriptions/{rx['id']}/ddi-analysis", headers=H(w.docA))
    client.post(f"/api/prescriptions/{rx['id']}/decision", json={"decision": "Proceed", "reason": "Monitored"}, headers=H(w.docA))
    assert client.post(f"/api/prescriptions/{rx['id']}/finalize", headers=H(w.docA)).status_code == 200
    return apt, rx


def test_audit_api_roles(w):
    for u in (w.docA, w.pharm1):
        assert client.get("/api/audit", headers=H(u)).status_code == 403
    assert client.get("/api/audit").status_code in (401, 403)
    assert client.get("/api/audit?kind=bogus", headers=H(w.adminA)).status_code == 400


def test_login_and_failed_login_are_audited_without_email(w):
    assert client.post("/api/auth/login", json={"email": w.docA["email"], "password": PW}).status_code == 200
    assert client.post("/api/auth/login", json={"email": w.docA["email"], "password": "wrong"}).status_code == 401
    assert client.post("/api/auth/login", json={"email": "nobody@x.io", "password": "x"}).status_code == 401
    rows = audit(w.adminA)
    acts = [r["action"] for r in rows]
    assert "auth.login" in acts and "auth.login_failed" in acts
    assert "@" not in str(rows) .replace("Admin A11", "")  # no email addresses stored in events
    plat = audit(w.platform, kind="security")
    assert any(r["metadata"].get("known_account") is False for r in plat)      # unknown account: platform admin only
    assert not any(r["metadata"].get("known_account") is False for r in audit(w.adminA, kind="security"))


def test_admin_account_changes_audited_and_security_kind(w):
    u = client.post("/api/admin/users", json={"name": "New Doc", "email": "p11-new@x.io", "password": PW, "role": "doctor"},
                    headers=H(w.adminA)).json()
    client.put(f"/api/admin/users/{u['id']}", json={"phone": "123"}, headers=H(w.adminA))
    client.post(f"/api/admin/users/{u['id']}/status", json={"status": "suspended"}, headers=H(w.adminA))
    client.delete(f"/api/admin/users/{u['id']}", headers=H(w.adminA))
    acts = {r["action"] for r in audit(w.adminA, kind="security")}
    assert {"user.create", "user.update", "user.status", "user.delete"} <= acts
    assert "patient.create" not in acts  # activity-only events are not security events


def test_patient_registration_audited_with_ids_only(w):
    r = client.post("/api/patients", json={"name": "Secret Name", "phone": "9811111111", "age": 30, "gender": "Female"},
                    headers=H(w.adminA))
    assert r.status_code == 200
    rows = [x for x in audit(w.adminA) if x["action"] == "patient.create"]
    assert rows and rows[0]["resource_id"] == r.json()["id"]
    assert "Secret Name" not in str(rows) and "9811111111" not in str(rows)


def test_workflow_actions_audited(w):
    apt, rx = _finalized(w)
    o = client.post("/api/pharmacy/orders", json={"prescription_id": rx["id"]}, headers=H(w.adminA)).json()
    client.post(f"/api/pharmacy/orders/{o['id']}/dispense",
                json={"items": [{"item_id": i["id"], "status": "Dispensed"} for i in o["items"]]}, headers=H(w.pharm1))
    acts = {r["action"] for r in audit(w.platform, org_id=w.A["id"])}
    assert {"appointment.create", "ddi_analysis.run", "doctor_decision.record", "prescription.finalize",
            "pharmacy_order.dispense"} <= acts


def test_audit_scoping_and_doctor_only_metadata_hidden(w):
    _finalized(w)
    client.post("/api/patients", json={"name": "B Pat", "phone": "9822222222", "age": 22, "gender": "Male"}, headers=H(w.adminB))
    a = audit(w.adminA)
    assert a and all(r["org_id"] == w.A["id"] for r in a)                      # own hospital only
    assert all(r["org_id"] == w.B["id"] for r in audit(w.adminB))
    assert audit(w.adminA, org_id=w.B["id"]) == a                              # org_id param ignored for hospital admin
    ddi = [r for r in a if r["action"].startswith(("ddi_analysis.", "doctor_decision."))]
    assert ddi and all(r["metadata"] == {} for r in ddi)                       # DDI details withheld from reception
    plat = [r for r in audit(w.platform, org_id=w.A["id"]) if r["action"] == "ddi_analysis.run"]
    assert plat and "overall_severity" in plat[0]["metadata"]
    assert {r["org_id"] for r in audit(w.platform)} >= {w.A["id"], w.B["id"]}  # platform-wide


def test_notification_bodies_have_no_phi(w):
    _finalized(w)
    doc = client.get("/api/notifications", headers=H(w.docA)).json()
    assert doc and all("Zed" not in n["body"] and "Chest pain" not in n["body"] for n in doc)
    assert any(n.get("reference_type") == "appointment" and n.get("reference_id") for n in doc)


def test_shared_notifications_read_and_dismiss_per_user(w):
    n = notification_store.push(group_for_role("pharmacist"), "Shared alert", "Shared body", org_id=w.A["id"])
    r1 = {x["id"]: x for x in client.get("/api/notifications", headers=H(w.pharm1)).json()}
    assert r1[n["id"]]["unread"] is True
    assert client.post(f"/api/notifications/{n['id']}/read", headers=H(w.pharm1)).status_code == 200
    mine = {x["id"]: x for x in client.get("/api/notifications", headers=H(w.pharm1)).json()}
    theirs = {x["id"]: x for x in client.get("/api/notifications", headers=H(w.pharm2)).json()}
    assert mine[n["id"]]["unread"] is False and theirs[n["id"]]["unread"] is True   # other pharmacist unaffected
    assert client.delete(f"/api/notifications/{n['id']}", headers=H(w.pharm1)).status_code == 200
    assert n["id"] not in {x["id"] for x in client.get("/api/notifications", headers=H(w.pharm1)).json()}
    assert n["id"] in {x["id"] for x in client.get("/api/notifications", headers=H(w.pharm2)).json()}


def test_notifications_hospital_scoped(w):
    n = notification_store.push(group_for_role("pharmacist"), "A-only", "x", org_id=w.A["id"])
    pB = mk("Pharm B", "p11-phB@x.io", "pharmacist", w.B)
    assert n["id"] not in {x["id"] for x in client.get("/api/notifications", headers=H(pB)).json()}
    assert client.post(f"/api/notifications/{n['id']}/read", headers=H(pB)).status_code == 404
