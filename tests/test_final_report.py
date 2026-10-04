"""
Final Patient/Admin Report.

Covers: report auto-created and published on finalize, allowlisted content
including the patient-safe risk summary and exact SHAP explanations, and access
control (patient own-only, administrator own hospital, doctor own reports,
pharmacist denied, cross-hospital 404).

Run:  pytest tests/test_final_report.py -v
"""
import json
from types import SimpleNamespace

import pytest
from fastapi.testclient import TestClient

from app.main import app, drug_service
from app.modules.module1_patient import patient_service
from app.modules.module_auth import create_token, user_store
from app.modules.module_org import OrganizationCreate, org_store
from app.modules.module13_reports import build_safety_assessment, report_store

client = TestClient(app)
PW = "Passw0rd!xyz"
HIGH = [{"medicine_name": "Aspirin", "dose": "75", "unit": "mg", "frequency": "Once daily", "duration": "30 days", "quantity": 30},
        {"medicine_name": "Warfarin", "dose": "5", "unit": "mg", "frequency": "Once daily", "timing": "Evening"}]
INTERNAL_FIELDS = ("overall_severity", "model_info", "engine_version", "doctor_decision", "internal_reason")


def H(u):
    return {"Authorization": f"Bearer {create_token(u)}"}


def mk(name, email, role, org=None, **kw):
    return user_store.create(name, email, PW, role, org=(org or {}).get("name", ""), org_id=(org or {}).get("id"), **kw)


@pytest.fixture
def w():
    A = org_store.create(OrganizationCreate(name="Hospital A8", address="1 Main St", phone="555-0100"))
    B = org_store.create(OrganizationCreate(name="Hospital B8"))
    ns = SimpleNamespace(A=A, B=B)
    ns.adminA = mk("Admin A8", "p8-adminA@x.io", "administrator", A)
    ns.adminB = mk("Admin B8", "p8-adminB@x.io", "administrator", B)
    ns.docA = mk("Doc A8", "p8-docA@x.io", "doctor", A, specialization="Cardiology")
    ns.docA2 = mk("Doc A28", "p8-docA2@x.io", "doctor", A)
    ns.pharmA = mk("Pharm A8", "p8-pharmA@x.io", "pharmacist", A)
    ns.PA = patient_service.create_full_record({"name": "Dana A", "phone": "9444444444", "age": 61, "gender": "Female",
                                                 "egfr": 80, "alt": 20, "org_id": A["id"]}, owner_id=ns.adminA["id"])
    ns.PA2 = patient_service.create_full_record({"name": "Eli A", "phone": "9555555555", "age": 40, "gender": "Male",
                                                  "egfr": 80, "alt": 20, "org_id": A["id"]}, owner_id=ns.adminA["id"])
    ns.patUserA = mk("Dana Login", "p8-pat@x.io", "patient", A, patient_id=ns.PA["id"])
    ns.patUserA2 = mk("Eli Login", "p8-pat2@x.io", "patient", A, patient_id=ns.PA2["id"])
    return ns


def _finalized_rx(w, patient, items=HIGH, high_decision=True):
    apt = client.post("/api/appointments", json={"patient_id": patient["id"], "doctor_id": w.docA["id"],
                      "reason": "Follow-up", "appointment_date": "2026-09-25"}, headers=H(w.adminA)).json()
    enc = client.post("/api/encounters", json={"appointment_id": apt["id"]}, headers=H(w.docA)).json()
    client.put(f"/api/encounters/{enc['id']}", json={"diagnosis": "Atrial fibrillation", "assessment": "Stable",
               "follow_up": "Review in 2 weeks", "notes": "PRIVATE-NOTE-XYZ"}, headers=H(w.docA))
    rx = client.post("/api/prescriptions", json={"encounter_id": enc["id"], "items": items,
                     "clinical_instructions": "Avoid NSAIDs"}, headers=H(w.docA)).json()
    client.post(f"/api/prescriptions/{rx['id']}/ddi-analysis", headers=H(w.docA))
    if high_decision:
        client.post(f"/api/prescriptions/{rx['id']}/decision",
                    json={"decision": "Proceed", "reason": "PRIVATE-REASON-XYZ"}, headers=H(w.docA))
    r = client.post(f"/api/prescriptions/{rx['id']}/finalize", headers=H(w.docA))
    assert r.status_code == 200
    return rx


def _rpt(w, rx):
    lst = client.get("/api/reports", headers=H(w.adminA)).json()
    row = next(x for x in lst if x["id"] and client.get(f"/api/reports/{x['id']}", headers=H(w.adminA)).json()["prescription"]["id"] == rx["id"])
    return row["id"]


def test_report_created_on_finalize_and_admin_notified(w):
    rx = _finalized_rx(w, w.PA)
    rid = _rpt(w, rx)
    body = client.get(f"/api/reports/{rid}", headers=H(w.adminA)).json()
    assert body["status"] == "Finalized" and body["patient_visible"] is True
    notes = client.get("/api/notifications", headers=H(w.adminA)).json()
    assert any(n.get("reference_id") == rid for n in notes)
    patient_notes = client.get("/api/notifications", headers=H(w.patUserA)).json()
    assert any(n.get("reference_id") == rid and n.get("type") == "REPORT_RELEASED" for n in patient_notes)


def test_report_content_has_patient_safe_risk_and_shap_explanations(w):
    rx = _finalized_rx(w, w.PA)
    rid = _rpt(w, rx)
    body = client.get(f"/api/reports/{rid}", headers=H(w.adminA)).json()
    assert body["hospital"]["name"] == "Hospital A8" and body["patient"]["name"] == "Dana A"
    assert body["doctor"]["specialization"] == "Cardiology"
    assert body["visit"]["diagnosis"] == "Atrial fibrillation" and body["visit"]["follow_up"] == "Review in 2 weeks"
    assert [m["name"] for m in body["medicines"]] == ["Aspirin", "Warfarin"]
    assert body["medicines"][0]["quantity"] == 30 and body["medicines"][1]["timing"] == "Evening"
    assert body["prescription"]["clinical_instructions"] == "Avoid NSAIDs"
    assert body["high_risk_alerts"]["medicines"] == ["Aspirin", "Warfarin"]
    assert body["high_risk_alerts"]["doctor_instruction"] == "Avoid NSAIDs"
    assert all(m["high_risk_flag"] for m in body["medicines"])
    safety = body["safety_assessment"]
    assert safety["status"] == "available"
    assert safety["score"] == 60 and safety["level"] == "Medium"
    assert safety["tone"] == "moderate"
    assert safety["findings"][0]["medicines"] == ["Aspirin", "Warfarin"]
    assert safety["explainability"]["method"].startswith("Exact Shapley (SHAP)")
    assert sum(item["contribution"] for item in safety["explainability"]["contributions"]) == safety["score"]
    blob = json.dumps(body).lower()
    for bad in INTERNAL_FIELDS:
        assert bad not in blob, bad
    assert "private-note-xyz" not in blob and "private-reason-xyz" not in blob


def test_patient_safe_assessment_is_consistent_for_authorized_roles(w):
    rx = _finalized_rx(w, w.PA)
    rid = _rpt(w, rx)
    for u in (w.adminA, w.docA, w.patUserA):
        for path in ("/api/reports", f"/api/reports/{rid}"):
            response = client.get(path, headers=H(u))
            assert response.status_code == 200
            blob = response.text.lower()
            for bad in INTERNAL_FIELDS:
                assert bad not in blob, (path, bad)
            if path.endswith(rid):
                body = response.json()
                assert "safety_assessment" in body
                assert body["high_risk_alerts"]["medicines"] == ["Aspirin", "Warfarin"]
                assert "private-reason-xyz" not in blob


def test_patient_sees_own_report_immediately_and_cannot_see_another_patient(w):
    rx = _finalized_rx(w, w.PA)
    rid = _rpt(w, rx)
    assert client.get(f"/api/reports/{rid}", headers=H(w.patUserA)).status_code == 200
    assert [r["id"] for r in client.get("/api/reports", headers=H(w.patUserA)).json()] == [rid]
    assert client.get(f"/api/reports/{rid}", headers=H(w.patUserA2)).status_code == 404
    assert client.get("/api/reports", headers=H(w.patUserA2)).json() == []
    notes = client.get("/api/notifications", headers=H(w.patUserA)).json()
    assert any(n.get("reference_id") == rid for n in notes)


def test_patient_report_history_publishes_legacy_finalized_reports(w):
    rx = _finalized_rx(w, w.PA)
    rid = _rpt(w, rx)
    report_store.col.update_one(
        {"id": rid},
        {"$set": {"status": "Draft", "patient_visible": False, "finalized_at": None}},
    )

    rows = client.get("/api/reports", headers=H(w.patUserA)).json()
    assert [row["id"] for row in rows] == [rid]
    assert client.get(f"/api/reports/{rid}", headers=H(w.patUserA)).json()["patient_visible"] is True


def test_patient_cannot_release_or_generate(w):
    rx = _finalized_rx(w, w.PA)
    rid = _rpt(w, rx)
    assert client.post(f"/api/reports/{rid}/release", headers=H(w.patUserA)).status_code == 403
    assert client.post(f"/api/reports/from-prescription/{rx['id']}", headers=H(w.patUserA)).status_code == 403


def test_doctor_can_search_model_and_fallback_medicine_catalog(w):
    complete_catalog = client.get("/api/drugs/catalog", headers=H(w.docA))
    assert complete_catalog.status_code == 200 and len(complete_catalog.json()) >= 645
    assert drug_service.map_to_generic("ASPIRIN")["generics"] == ["aspirin"]
    model_matches = client.get("/api/drugs/catalog?q=aspirin", headers=H(w.docA))
    assert model_matches.status_code == 200 and any("aspirin" in name.lower() for name in model_matches.json())
    fallback_matches = client.get("/api/drugs/catalog?q=warf", headers=H(w.docA))
    assert fallback_matches.status_code == 200 and any(name.lower() == "warfarin" for name in fallback_matches.json())
    assert client.get("/api/drugs/catalog?q=asp", headers=H(w.patUserA)).status_code == 403
    assert client.get("/api/drugs/catalog?q=a", headers=H(w.docA)).status_code == 422


def test_model_only_signal_is_not_mislabeled_as_patient_risk_and_shap_respects_cap():
    model_only = build_safety_assessment(
        {"age": 40, "egfr": 90, "alt": 20},
        {"items": [{"medicine_name": "A"}, {"medicine_name": "B"}]},
        {"pairs": [{
            "drug_a": "A", "drug_b": "B", "interaction_found": False,
            "model_prediction": {
                "status": "scored", "model_flag": False,
                "is_recorded_in_twosides": True, "probability": 0.83,
            },
        }]},
    )
    assert model_only["score"] == 0
    assert model_only["findings"][0]["level"] == "Model signal"
    assert model_only["findings"][0]["association_percent"] == 83.0

    capped = build_safety_assessment(
        {"age": 80, "egfr": 35, "alt": 90},
        {"items": [{"medicine_name": str(i)} for i in range(5)]},
        {"pairs": [
            {"drug_a": str(i), "drug_b": str(i + 1), "interaction_found": True, "severity": "High"}
            for i in range(4)
        ]},
    )
    assert capped["score"] == 100
    assert sum(item["contribution"] for item in capped["explainability"]["contributions"]) == 100


def test_cross_hospital_and_role_denials(w):
    rx = _finalized_rx(w, w.PA)
    rid = _rpt(w, rx)
    assert client.get(f"/api/reports/{rid}", headers=H(w.adminB)).status_code == 404
    assert client.post(f"/api/reports/{rid}/release", headers=H(w.adminB)).status_code == 404
    assert client.get("/api/reports", headers=H(w.adminB)).json() == []
    assert client.get(f"/api/reports/{rid}", headers=H(w.docA2)).status_code == 404  # other doctor, same hospital
    assert client.get("/api/reports", headers=H(w.docA2)).json() == []
    assert client.get("/api/reports", headers=H(w.pharmA)).status_code == 403
    assert client.get(f"/api/reports/{rid}", headers=H(w.pharmA)).status_code == 403


def test_from_prescription_requires_finalized_and_is_idempotent(w):
    apt = client.post("/api/appointments", json={"patient_id": w.PA["id"], "doctor_id": w.docA["id"],
                      "reason": "Routine follow-up", "appointment_date": "2026-09-25"}, headers=H(w.adminA)).json()
    enc = client.post("/api/encounters", json={"appointment_id": apt["id"]}, headers=H(w.docA)).json()
    rx = client.post("/api/prescriptions", json={"encounter_id": enc["id"], "items": HIGH}, headers=H(w.docA)).json()
    assert client.post(f"/api/reports/from-prescription/{rx['id']}", headers=H(w.adminA)).status_code == 400
    rx2 = _finalized_rx(w, w.PA2)
    a = client.post(f"/api/reports/from-prescription/{rx2['id']}", headers=H(w.adminA)).json()
    b = client.post(f"/api/reports/from-prescription/{rx2['id']}", headers=H(w.docA)).json()
    assert a["id"] == b["id"]
    assert len(client.get("/api/reports", headers=H(w.adminA)).json()) == 1
    assert client.post(f"/api/reports/from-prescription/{rx2['id']}", headers=H(w.adminB)).status_code == 404


def test_release_is_idempotent_and_log_access_audited(w):
    rx = _finalized_rx(w, w.PA)
    rid = _rpt(w, rx)
    assert client.post(f"/api/reports/{rid}/release", headers=H(w.adminA)).status_code == 200
    assert client.post(f"/api/reports/{rid}/release", headers=H(w.adminA)).status_code == 200
    assert client.post(f"/api/reports/{rid}/log-access", json={"action": "print"}, headers=H(w.patUserA)).status_code == 200
    assert client.post(f"/api/reports/{rid}/log-access", json={"action": "download"}, headers=H(w.patUserA2)).status_code == 404
