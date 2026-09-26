"""
Phase 2 — authentication, RBAC and hospital isolation.

Two hospitals (A and B) each get an administrator, doctors, a pharmacist and
patients. The tests then try to cross every boundary CLAUDE.md §7.19 calls
out (cross-hospital, cross-patient, cross-role, unassigned doctor, suspended
user) and assert the BACKEND refuses — never relying on frontend hiding.

Run:  pytest tests/test_rbac_isolation.py -v
"""
from types import SimpleNamespace

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.core.permissions import can_access_patient, notification_visible_to
from app.modules.module1_patient import patient_service
from app.modules.module5_reviews import review_store
from app.modules.module6_notifications import notification_store
from app.modules.module7_analyses import analysis_store
from app.modules.module8_appointments import AppointmentCreate, appointment_store
from app.modules.module_auth import create_token, user_store
from app.modules.module_org import OrganizationCreate, org_store

client = TestClient(app)
PW = "Passw0rd!xyz"


def H(user):
    return {"Authorization": f"Bearer {create_token(user)}"}


def mk(name, email, role, org=None, patient_id=None):
    return user_store.create(name, email, PW, role, org=(org or {}).get("name", ""),
                             org_id=(org or {}).get("id"), patient_id=patient_id)


def assign(patient, doctor, org, status=None):
    apt = appointment_store.create(
        AppointmentCreate(patient_id=patient["id"], doctor_id=doctor["id"], reason="Fever",
                          appointment_date="2026-09-25"), org_id=org["id"], created_by="test")
    if status:
        appointment_store.update_status(apt["id"], status)
    return apt


@pytest.fixture
def w():
    A = org_store.create(OrganizationCreate(name="Hospital A"))
    B = org_store.create(OrganizationCreate(name="Hospital B"))
    ns = SimpleNamespace(A=A, B=B)
    ns.root = mk("Root Admin", "root@x.io", "admin")
    ns.adminA = mk("Admin A", "adminA@x.io", "administrator", A)
    ns.adminB = mk("Admin B", "adminB@x.io", "administrator", B)
    ns.docA1 = mk("Doc A1", "docA1@x.io", "doctor", A)
    ns.docA2 = mk("Doc A2", "docA2@x.io", "doctor", A)
    ns.docB = mk("Doc B", "docB@x.io", "doctor", B)
    ns.pharmA = mk("Pharm A", "pharmA@x.io", "pharmacist", A)
    ns.pharmB = mk("Pharm B", "pharmB@x.io", "pharmacist", B)
    rec = lambda name, org, owner: patient_service.create_full_record(
        {"name": name, "phone": "999", "age": 40, "gender": "Male", "egfr": 90, "alt": 20, "org_id": org["id"]},
        owner_id=owner["id"])
    ns.PA1 = rec("Alice A1", A, ns.adminA)   # assigned to docA1
    ns.PA2 = rec("Alan A2", A, ns.adminA)    # assigned to docA2
    ns.PA3 = rec("Amy A3", A, ns.adminA)     # unassigned
    ns.PB = rec("Bob B", B, ns.adminB)
    ns.patA = mk("Alice Login", "alice@x.io", "patient", A, patient_id=ns.PA1["id"])
    ns.patB = mk("Bob Login", "bob@x.io", "patient", B, patient_id=ns.PB["id"])
    assign(ns.PA1, ns.docA1, A)
    assign(ns.PA2, ns.docA2, A)
    return ns


def ids(resp):
    assert resp.status_code == 200, resp.text
    return {r["id"] for r in resp.json()}


# ============================================================ patient list
def test_unauthenticated_requests_are_rejected():
    for method, url in [("get", "/api/patients"), ("get", "/api/reviews"), ("get", "/api/notifications"),
                        ("get", "/api/analyses"), ("get", "/api/dashboard/stats"),
                        ("post", "/api/patient/register")]:
        assert getattr(client, method)(url).status_code in (401, 422), url


def test_hospital_admin_sees_only_own_hospital(w):
    assert ids(client.get("/api/patients", headers=H(w.adminA))) == {w.PA1["id"], w.PA2["id"], w.PA3["id"]}
    assert ids(client.get("/api/patients", headers=H(w.adminB))) == {w.PB["id"]}


def test_platform_admin_sees_everything(w):
    assert len(ids(client.get("/api/patients", headers=H(w.root)))) == 4


def test_doctor_sees_only_assigned_patients(w):
    assert ids(client.get("/api/patients", headers=H(w.docA1))) == {w.PA1["id"]}
    assert ids(client.get("/api/patients", headers=H(w.docA2))) == {w.PA2["id"]}
    assert ids(client.get("/api/patients", headers=H(w.docB))) == set()


def test_cancelled_appointment_removes_doctor_access(w):
    assign(w.PA3, w.docA1, w.A, status="Cancelled")
    assert w.PA3["id"] not in ids(client.get("/api/patients", headers=H(w.docA1)))


def test_patient_sees_only_self(w):
    assert ids(client.get("/api/patients", headers=H(w.patA))) == {w.PA1["id"]}
    assert ids(client.get("/api/patients", headers=H(w.patB))) == {w.PB["id"]}


def test_pharmacist_has_no_patients_until_pharmacy_work_exists(w):
    assert ids(client.get("/api/patients", headers=H(w.pharmA))) == set()
    review_store.create(w.PA1["id"], "Doc A1", org_id=w.A["id"], requested_by_id=w.docA1["id"])
    assert ids(client.get("/api/patients", headers=H(w.pharmA))) == {w.PA1["id"]}
    assert ids(client.get("/api/patients", headers=H(w.pharmB))) == set()


# ============================================================ patient read
@pytest.mark.parametrize("actor,target,expected", [
    ("adminA", "PA1", 200), ("adminA", "PB", 404),       # hospital admin A -> hospital B
    ("adminB", "PA1", 404),
    ("docA1", "PA1", 200), ("docA1", "PA2", 404),        # doctor A -> doctor B's patient
    ("docA1", "PB", 404), ("docB", "PA1", 404),          # doctor A -> hospital B
    ("patA", "PA1", 200), ("patA", "PA2", 404),          # patient A -> other patient
    ("patA", "PB", 404), ("patB", "PA1", 404),
    ("pharmA", "PA1", 404),                              # no pharmacy work yet
    ("root", "PB", 200),
])
def test_get_patient_matrix(w, actor, target, expected):
    r = client.get(f"/api/patients/{getattr(w, target)['id']}", headers=H(getattr(w, actor)))
    assert r.status_code == expected, r.text


# ============================================================ patient write
def test_hospital_admin_creates_patient_in_own_hospital_only(w):
    r = client.post("/api/patients", headers=H(w.adminA),
                    json={"name": "New Person", "phone": "5", "org_id": w.B["id"], "owner_id": "hacker"})
    assert r.status_code == 200, r.text
    assert r.json()["org_id"] == w.A["id"]        # client org_id ignored
    assert r.json()["owner_id"] == w.adminA["id"]  # client owner_id ignored


def test_server_generates_id_when_client_proposal_collides(w):
    r = client.post("/api/patients", headers=H(w.adminB), json={"name": "Clash", "id": w.PA1["id"]})
    assert r.status_code == 200 and r.json()["id"] != w.PA1["id"]
    assert patient_service.get_patient(w.PA1["id"])["org_id"] == w.A["id"]  # A's record untouched


def test_patient_and_pharmacist_cannot_create_patients(w):
    for u in (w.patA, w.pharmA):
        assert client.post("/api/patients", headers=H(u), json={"name": "X Y"}).status_code == 403


def test_cannot_move_patient_to_another_hospital_via_update(w):
    r = client.put(f"/api/patients/{w.PA1['id']}", headers=H(w.adminA),
                   json={"phone": "123", "org_id": w.B["id"], "owner_id": "x"})
    assert r.status_code == 200
    stored = patient_service.get_patient(w.PA1["id"])
    assert stored["org_id"] == w.A["id"] and stored["phone"] == "123"


def test_hospital_admin_cannot_edit_prescribing_data(w):
    client.put(f"/api/patients/{w.PA1['id']}", headers=H(w.adminA),
               json={"meds": [{"name": "Warfarin"}], "phone": "777"})
    stored = patient_service.get_patient(w.PA1["id"])
    assert stored["meds"] == [] and stored["phone"] == "777"


@pytest.mark.parametrize("actor,target,expected", [
    ("adminA", "PB", 404), ("docA1", "PA2", 404), ("docA1", "PA1", 200),
    ("docB", "PA1", 404), ("pharmA", "PA1", 403), ("patA", "PA1", 403),
])
def test_update_patient_matrix(w, actor, target, expected):
    r = client.put(f"/api/patients/{getattr(w, target)['id']}", headers=H(getattr(w, actor)), json={"phone": "1"})
    assert r.status_code == expected, r.text


@pytest.mark.parametrize("actor,target,expected", [
    ("docA1", "PA1", 403), ("pharmA", "PA1", 403), ("patA", "PA1", 403),   # never for these roles
    ("adminB", "PA1", 404), ("adminA", "PB", 404), ("adminA", "PA3", 200),
])
def test_delete_patient_matrix(w, actor, target, expected):
    r = client.delete(f"/api/patients/{getattr(w, target)['id']}", headers=H(getattr(w, actor)))
    assert r.status_code == expected, r.text


def test_medications_are_doctor_only_and_assignment_scoped(w):
    url = lambda p: f"/api/patients/{p['id']}/medications"
    meds = [{"name": "Aspirin"}]
    assert client.put(url(w.PA1), headers=H(w.docA1), json=meds).status_code == 200
    assert client.put(url(w.PA2), headers=H(w.docA1), json=meds).status_code == 404
    assert client.put(url(w.PA1), headers=H(w.adminA), json=meds).status_code == 403
    assert client.put(url(w.PA1), headers=H(w.pharmA), json=meds).status_code == 403
    assert client.put(url(w.PA1), headers=H(w.patA), json=meds).status_code == 403


# ============================================== /api/patient/register (P0-H)
def _profile(pid, **kw):
    return {"patient_id": pid, "age": 50, "gender": "Male", "kidney_function_egfr": 80.0,
            "liver_function_alt": 30.0, "active_medications": ["Aspirin"], **kw}


def test_register_requires_authentication():
    assert client.post("/api/patient/register", json=_profile("P-777")).status_code == 401


def test_register_cannot_overwrite_other_hospitals_or_unassigned_patients(w):
    assert client.post("/api/patient/register", headers=H(w.docA1), json=_profile(w.PB["id"])).status_code == 404
    assert client.post("/api/patient/register", headers=H(w.docA1), json=_profile(w.PA2["id"])).status_code == 404
    assert patient_service.get_patient(w.PB["id"])["age"] == 40  # unchanged


def test_register_assigned_ok_and_new_record_is_scoped_to_callers_hospital(w):
    assert client.post("/api/patient/register", headers=H(w.docA1), json=_profile(w.PA1["id"])).status_code == 200
    assert client.post("/api/patient/register", headers=H(w.docA1), json=_profile("P-900")).status_code == 200
    assert patient_service.get_patient("P-900")["org_id"] == w.A["id"]


def test_register_denied_for_other_roles(w):
    for u in (w.pharmA, w.patA, w.adminA):
        assert client.post("/api/patient/register", headers=H(u), json=_profile(w.PA1["id"])).status_code == 403


# ==================================================================== DDI
def test_pipeline_role_and_scope(w):
    q = "/api/pipeline/process-and-fuse?patient_id={}&drug_a_brand=warfarin&drug_b_brand=aspirin"
    assert client.post(q.format(w.PA1["id"]), headers=H(w.patA)).status_code == 403     # patient
    assert client.post(q.format(w.PA1["id"]), headers=H(w.adminA)).status_code == 403   # reception
    assert client.post(q.format(w.PA2["id"]), headers=H(w.docA1)).status_code == 404    # unassigned
    assert client.post(q.format(w.PB["id"]), headers=H(w.docA1)).status_code == 404     # other hospital
    assert client.post(q.format(w.PA1["id"]), headers=H(w.docA1)).status_code == 200    # assigned doctor
    rows = analysis_store.list_for_org(w.A["id"])
    assert rows and rows[0]["org_id"] == w.A["id"]


# ================================================================= analyses
def test_analyses_are_scoped_and_never_visible_to_reception_or_patients(w):
    analysis_store.record(w.PA1["id"], "a", "b", "High", True, "Doc", {}, org_id=w.A["id"])
    analysis_store.record(w.PA2["id"], "a", "b", "Low", True, "Doc", {}, org_id=w.A["id"])
    analysis_store.record(w.PB["id"], "a", "b", "Low", True, "Doc", {}, org_id=w.B["id"])
    a1 = client.get("/api/analyses", headers=H(w.docA1)).json()
    assert {r["patient_id"] for r in a1} == {w.PA1["id"]}
    assert client.get(f"/api/analyses?patient_id={w.PB['id']}", headers=H(w.docA1)).status_code == 404
    assert client.get(f"/api/analyses?patient_id={w.PA2['id']}", headers=H(w.docA1)).status_code == 404
    assert client.get("/api/analyses", headers=H(w.adminA)).status_code == 403
    assert client.get("/api/analyses", headers=H(w.patA)).status_code == 403
    assert len(client.get("/api/analyses", headers=H(w.root)).json()) == 3


# ================================================================== reviews
def test_reviews_are_hospital_scoped(w):
    rv_a = review_store.create(w.PA1["id"], "Doc A1", org_id=w.A["id"], requested_by_id=w.docA1["id"])
    rv_b = review_store.create(w.PB["id"], "Doc B", org_id=w.B["id"], requested_by_id=w.docB["id"])
    assert ids(client.get("/api/reviews", headers=H(w.pharmA))) == {rv_a["id"]}
    assert ids(client.get("/api/reviews", headers=H(w.pharmB))) == {rv_b["id"]}
    assert ids(client.get("/api/reviews", headers=H(w.adminA))) == {rv_a["id"]}
    assert ids(client.get("/api/reviews", headers=H(w.docA1))) == {rv_a["id"]}
    assert ids(client.get("/api/reviews", headers=H(w.docA2))) == set()   # not their patient
    assert client.get("/api/reviews", headers=H(w.patA)).json() == []
    assert len(ids(client.get("/api/reviews", headers=H(w.root)))) == 2


def test_review_create_and_submit_isolation(w):
    r = client.post("/api/reviews", headers=H(w.docA1), json={"patient_id": w.PA1["id"], "priority": "High"})
    assert r.status_code == 200 and r.json()["org_id"] == w.A["id"]
    assert client.post("/api/reviews", headers=H(w.docA1), json={"patient_id": w.PB["id"]}).status_code == 404
    assert client.post("/api/reviews", headers=H(w.docA1), json={"patient_id": w.PA2["id"]}).status_code == 404
    assert client.post("/api/reviews", headers=H(w.patA), json={"patient_id": w.PA1["id"]}).status_code == 403
    rid = r.json()["id"]
    assert client.post(f"/api/reviews/{rid}/submit", headers=H(w.pharmB), json={"decision": "Approve"}).status_code == 404
    assert client.post(f"/api/reviews/{rid}/submit", headers=H(w.docA1), json={"decision": "Approve"}).status_code == 403
    assert client.post(f"/api/reviews/{rid}/submit", headers=H(w.pharmA), json={"decision": "Approve"}).status_code == 200


# ============================================================= notifications
def test_notifications_are_user_targeted_and_hospital_scoped(w):
    mine = notification_store.push_to_user(w.docA1["id"], "t", "b", org_id=w.A["id"])
    theirs = notification_store.push_to_user(w.docA2["id"], "t", "b", org_id=w.A["id"])
    grp_a = notification_store.push("clinician", "t", "b", org_id=w.A["id"])
    grp_b = notification_store.push("clinician", "t", "b", org_id=w.B["id"])
    seen = ids(client.get("/api/notifications", headers=H(w.docA1)))
    assert seen == {mine["id"], grp_a["id"]}
    assert ids(client.get("/api/notifications", headers=H(w.docB))) == {grp_b["id"]}
    assert ids(client.get("/api/notifications", headers=H(w.patA))) == set()  # groups never reach patients


def test_cannot_read_or_dismiss_someone_elses_notification(w):
    theirs = notification_store.push_to_user(w.docA2["id"], "t", "b", org_id=w.A["id"])
    grp_b = notification_store.push("clinician", "t", "b", org_id=w.B["id"])
    for nid in (theirs["id"], grp_b["id"]):
        assert client.post(f"/api/notifications/{nid}/read", headers=H(w.docA1)).status_code == 404
        assert client.delete(f"/api/notifications/{nid}", headers=H(w.docA1)).status_code == 404
    assert notification_store.col.find_one({"id": theirs["id"]})["unread"] is True


def test_read_all_only_touches_own_notifications(w):
    mine = notification_store.push_to_user(w.docA1["id"], "t", "b", org_id=w.A["id"])
    other = notification_store.push_to_user(w.docA2["id"], "t", "b", org_id=w.A["id"])
    grp_b = notification_store.push("clinician", "t", "b", org_id=w.B["id"])
    assert client.post("/api/notifications/read-all", headers=H(w.docA1)).json()["marked"] == 1
    assert notification_store.col.find_one({"id": mine["id"]})["unread"] is False
    assert notification_store.col.find_one({"id": other["id"]})["unread"] is True
    assert notification_store.col.find_one({"id": grp_b["id"]})["unread"] is True


def test_notification_visibility_helper_requires_hospital_for_group_items():
    orgless = {"id": "U-1", "role": "doctor", "org_id": None}
    assert notification_visible_to(orgless, {"group": "clinician", "org_id": None}) is False


# ========================================================== dashboard stats
def test_dashboard_stats_are_scoped(w):
    assert client.get("/api/dashboard/stats", headers=H(w.docA1)).json()["total_patients"] == 1
    assert client.get("/api/dashboard/stats", headers=H(w.adminA)).json()["total_patients"] == 3
    assert client.get("/api/dashboard/stats", headers=H(w.root)).json()["total_patients"] == 4
    assert client.get("/api/dashboard/stats", headers=H(w.patA)).json()["total_patients"] == 1


# ================================================== users / hospital / roles
def test_hospital_admin_cannot_manage_other_hospitals_users(w):
    assert client.get(f"/api/admin/users/{w.docB['id']}", headers=H(w.adminA)).status_code == 403
    assert client.post(f"/api/admin/users/{w.docB['id']}/status", headers=H(w.adminA),
                       json={"status": "suspended"}).status_code == 403
    listed = client.get("/api/admin/users", headers=H(w.adminA)).json()
    assert {u["org_id"] for u in listed} == {w.A["id"]}
    assert all(u["role"] in ("doctor", "pharmacist", "patient") for u in listed)


def test_hospital_admin_cannot_create_privileged_accounts(w):
    for role in ("admin", "administrator"):
        r = client.post("/api/admin/users", headers=H(w.adminA),
                        json={"name": "Evil Twin", "email": f"{role}@x.io", "password": PW, "role": role})
        assert r.status_code == 403, role


def test_hospital_admin_cannot_link_login_to_other_hospitals_patient(w):
    r = client.post("/api/admin/users", headers=H(w.adminA),
                    json={"name": "Sneaky", "email": "sneaky@x.io", "password": PW, "role": "patient",
                          "patient_id": w.PB["id"]})
    assert r.status_code == 404


def test_hospital_admin_cannot_promote_or_move_accounts(w):
    assert client.put(f"/api/admin/users/{w.docA1['id']}", headers=H(w.adminA), json={"role": "admin"}).status_code == 403
    assert client.put(f"/api/admin/users/{w.docA1['id']}", headers=H(w.adminA),
                      json={"org_id": w.B["id"]}).status_code == 403
    # ...and cannot touch the platform admin or another hospital administrator
    assert client.put(f"/api/admin/users/{w.root['id']}", headers=H(w.adminA), json={"name": "x y"}).status_code == 403
    assert client.put(f"/api/admin/users/{w.adminB['id']}", headers=H(w.adminA), json={"name": "x y"}).status_code == 403


def test_self_profile_update_cannot_change_role_or_hospital(w):
    client.put("/api/auth/me", headers=H(w.adminA),
               json={"name": "Renamed Admin", "role": "admin", "org_id": w.B["id"], "org": "Hospital B"})
    me = user_store.get_by_id(w.adminA["id"])
    assert me["name"] == "Renamed Admin" and me["role"] == "administrator" and me["org_id"] == w.A["id"]


def test_org_less_administrator_matches_nothing(w):
    ghost = mk("Ghost Admin", "ghost@x.io", "administrator")  # no hospital
    orphan = patient_service.create_full_record({"name": "Orphan", "org_id": None}, owner_id="x")
    assert client.get("/api/admin/users", headers=H(ghost)).status_code == 403
    assert client.get(f"/api/patients/{orphan['id']}", headers=H(ghost)).status_code == 404
    assert ids(client.get("/api/patients", headers=H(ghost))) == set()
    assert client.get(f"/api/admin/users/{w.docA1['id']}", headers=H(ghost)).status_code == 403


def test_platform_admin_must_attach_hospital_roles_to_a_hospital(w):
    r = client.post("/api/admin/users", headers=H(w.root),
                    json={"name": "Loose Admin", "email": "loose@x.io", "password": PW, "role": "administrator"})
    assert r.status_code == 400
    ok = client.post("/api/admin/users", headers=H(w.root),
                     json={"name": "Proper Admin", "email": "proper@x.io", "password": PW,
                           "role": "administrator", "org_id": w.A["id"]})
    assert ok.status_code == 200 and ok.json()["org_id"] == w.A["id"]


def test_hospital_admin_cannot_use_platform_hospital_apis(w):
    assert client.post("/api/organizations", headers=H(w.adminA), json={"name": "Rogue Hospital"}).status_code == 403
    assert client.delete(f"/api/organizations/{w.B['id']}", headers=H(w.adminA)).status_code == 403
    assert client.put(f"/api/organizations/{w.B['id']}", headers=H(w.adminA), json={"name": "Hacked"}).status_code == 403
    assert client.get(f"/api/organizations/{w.B['id']}", headers=H(w.adminA)).status_code == 403
    assert [o["id"] for o in client.get("/api/organizations", headers=H(w.adminA)).json()] == [w.A["id"]]


# =========================================== sign-up / suspension / tokens
@pytest.mark.parametrize("role", ["admin", "administrator"])
def test_privileged_roles_cannot_self_register(role):
    r = client.post("/api/auth/register", json={"name": "Attacker", "email": f"{role}@evil.io",
                                                "password": PW, "role": role})
    assert r.status_code == 422


def test_self_registered_account_has_no_hospital_access():
    r = client.post("/api/auth/register", json={"name": "New Doc", "email": "newdoc@x.io", "password": PW, "role": "doctor"})
    assert r.status_code == 200
    token = {"Authorization": f"Bearer {r.json()['token']}"}
    assert r.json()["user"]["org_id"] is None
    assert client.get("/api/patients", headers=token).json() == []


def test_suspended_user_cannot_use_existing_token(w):
    headers = H(w.docA1)
    assert client.get("/api/patients", headers=headers).status_code == 200
    user_store.set_status(w.docA1["id"], "suspended")
    assert client.get("/api/patients", headers=headers).status_code == 403
    assert client.get("/api/auth/me", headers=headers).status_code == 403


def test_inactive_hospital_locks_its_staff_out_but_not_the_platform_admin(w):
    org_store.update(w.A["id"], {"status": "Inactive"})
    assert client.get("/api/patients", headers=H(w.docA1)).status_code == 403
    assert client.get("/api/patients", headers=H(w.adminA)).status_code == 403
    assert client.get("/api/patients", headers=H(w.root)).status_code == 200


def test_garbage_and_missing_tokens_are_rejected():
    assert client.get("/api/patients", headers={"Authorization": "Bearer nonsense"}).status_code == 401
    assert client.get("/api/patients", headers={"Authorization": "Token abc"}).status_code == 401


# ============================================================ unit: helpers
def test_can_access_patient_unit_matrix(w):
    p = patient_service.get_patient(w.PA1["id"])
    assert can_access_patient(w.docA1, p, "read") and can_access_patient(w.docA1, p, "write")
    assert not can_access_patient(w.docA1, p, "delete")          # doctors never delete
    assert not can_access_patient(w.docA2, p, "read")            # unassigned doctor
    assert can_access_patient(w.adminA, p, "delete")
    assert not can_access_patient(w.adminA, p, "prescribe")      # reception never prescribes
    assert not can_access_patient(w.pharmA, p, "write")
    assert can_access_patient(w.patA, p, "read") and not can_access_patient(w.patA, p, "write")
    assert not can_access_patient(w.patB, p, "read")


def test_patient_ids_are_never_reused_after_delete(w):
    patient_service.delete_patient(w.PA1["id"])
    new = patient_service.create_full_record({"name": "Fresh", "org_id": w.A["id"]})
    assert new["id"] not in {w.PA2["id"], w.PA3["id"], w.PB["id"]}
