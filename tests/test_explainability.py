"""
Unit and integration tests for Module 16: SHAP Explainability Engine.

Covers:
- Direct SHAP clinical biomarker attribution & efficiency property: sum(phi) == f(x) - E[f(x)]
- Latent neural interaction decomposition (PairDecoder)
- Chemical substructure attribution
- Storage & caching in explainability_records
- Prescription-linked explainability endpoint (/api/prescriptions/{id}/explainability)
- Ad-hoc pair explainability endpoint (/api/ddi/explain)
- Role-based authorization & hospital scoping
"""
from types import SimpleNamespace
import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.ml.shap_explainer import shap_explainability_engine
from app.modules.module1_patient import patient_service
from app.modules.module16_explainability import explainability_store
from app.modules.module_auth import create_token, user_store
from app.modules.module_org import OrganizationCreate, org_store

client = TestClient(app)
PW = "Passw0rd!xyz"


def H(user):
    return {"Authorization": f"Bearer {create_token(user)}"}


def mk(name, email, role, org=None):
    return user_store.create(name, email, PW, role, org=(org or {}).get("name", ""), org_id=(org or {}).get("id"))


def _apt_payload(patient_id, doctor_id, **extra):
    return {
        "patient_id": patient_id,
        "doctor_id": doctor_id,
        "reason": "Explainability Check",
        "appointment_date": "2026-10-05",
        **extra,
    }


@pytest.fixture
def w():
    A = org_store.create(OrganizationCreate(name="Hospital Alpha"))
    B = org_store.create(OrganizationCreate(name="Hospital Beta"))
    ns = SimpleNamespace(A=A, B=B)
    ns.adminA = mk("Admin Alpha", "exp-adminA@x.io", "administrator", A)
    ns.docA = mk("Doc Alpha", "exp-docA@x.io", "doctor", A)
    ns.docB = mk("Doc Beta", "exp-docB@x.io", "doctor", B)
    ns.PA = patient_service.create_full_record(
        {
            "name": "Alice Expl",
            "phone": "9777777777",
            "email": "alice.exp@x.io",
            "age": 72,
            "gender": "Female",
            "egfr": 42.0,
            "alt": 58.0,
            "org_id": A["id"],
        },
        owner_id=ns.adminA["id"],
    )
    ns.apt = client.post("/api/appointments", json=_apt_payload(ns.PA["id"], ns.docA["id"]), headers=H(ns.adminA)).json()
    ns.enc = client.post("/api/encounters", json={"appointment_id": ns.apt["id"]}, headers=H(ns.docA)).json()
    return ns


# ===========================================================================
# 1. CORE ENGINE TESTS (SHAP Engine)
# ===========================================================================
def test_shap_engine_health():
    status = shap_explainability_engine.health()
    assert "status" in status
    assert status["shap_package"] is True
    assert len(status["methods"]) >= 3


def test_shap_clinical_risk_efficiency_property():
    """Verify that sum(phi_i) == predicted_score - base_value (Shapley efficiency)."""
    patient = {"age": 75, "egfr": 35.0, "alt": 65.0, "gender": "Female"}
    prescription = {"items": [{"medicine_name": "Aspirin"}, {"medicine_name": "Warfarin"}, {"medicine_name": "Metformin"}]}

    res = shap_explainability_engine.explain_clinical_risk(
        patient_data=patient,
        prescription_data=prescription,
        highest_severity="High",
        dgat_prob=0.82,
    )

    assert res["status"] == "computed"
    assert "base_value" in res
    assert "predicted_score" in res
    assert len(res["contributions"]) > 0

    # Efficiency property test
    sum_phi = sum(item["shap_value"] for item in res["contributions"])
    delta = res["predicted_score"] - res["base_value"]
    assert pytest.approx(sum_phi, abs=0.2) == delta

    # Ensure low eGFR (renal risk) positively increases risk
    egfr_contrib = next(c for c in res["contributions"] if "Kidney Function" in c["feature_name"])
    assert egfr_contrib["shap_value"] > 0
    assert egfr_contrib["direction"] == "increases_risk"


def test_shap_latent_neural_attribution():
    res = shap_explainability_engine.explain_latent_pair(
        drug_a="Aspirin",
        drug_b="Warfarin",
        model_prediction={"probability": 0.78, "model_flag": True, "is_recorded_in_twosides": True},
    )
    assert res["status"] == "computed"
    assert res["predicted_probability"] == 0.78
    assert len(res["latent_factors"]) == 2
    synergy = next(f for f in res["latent_factors"] if "Synergy" in f["component"])
    assert synergy["shap_contribution"] > 0
    assert synergy["direction"] == "increases_risk"


def test_chemical_property_attribution():
    res = shap_explainability_engine.explain_chemical_properties("Aspirin", "Ibuprofen")
    assert "drug_a" in res
    assert "drug_b" in res
    assert len(res["substructure_attributions"]) > 0


# ===========================================================================
# 2. MODULE 16 DOMAIN STORE TESTS
# ===========================================================================
def test_explainability_store_lifecycle():
    dummy_analysis = {
        "id": "DA-99999",
        "encounter_id": "ENC-1",
        "prescription_id": "RX-1",
        "overall_severity": "High",
        "pairs": [
            {"drug_a": "Aspirin", "drug_b": "Warfarin", "severity": "High", "interaction_found": True}
        ],
    }
    dummy_patient = {"id": "P-1", "age": 70, "egfr": 45, "alt": 30, "gender": "Male"}
    dummy_rx = {"id": "RX-1", "items": [{"medicine_name": "Aspirin"}, {"medicine_name": "Warfarin"}]}

    # Generate
    rec = explainability_store.generate_for_analysis(
        analysis_doc=dummy_analysis,
        patient_doc=dummy_patient,
        prescription_doc=dummy_rx,
        doctor_id="U-1",
        org_id="ORG-1",
    )

    assert rec["id"].startswith("EXP-")
    assert rec["analysis_id"] == "DA-99999"
    assert len(rec["pairs"]) == 1

    # Cache hit check
    rec_cached = explainability_store.get_for_analysis("DA-99999")
    assert rec_cached["id"] == rec["id"]


# ===========================================================================
# 3. HTTP ENDPOINTS & RBAC TESTS
# ===========================================================================
def test_prescription_explainability_endpoint(w):
    # 1. Create prescription
    items = [
        {"medicine_name": "Aspirin", "dose": "75", "unit": "mg", "frequency": "Once daily"},
        {"medicine_name": "Warfarin", "dose": "5", "unit": "mg", "frequency": "Once daily"},
    ]
    rx = client.post("/api/prescriptions", json={"encounter_id": w.enc["id"], "items": items}, headers=H(w.docA)).json()

    # 2. Before DDI analysis, explainability endpoint rejects with 400
    r_early = client.get(f"/api/prescriptions/{rx['id']}/explainability", headers=H(w.docA))
    assert r_early.status_code == 400

    # 3. Run DDI analysis
    client.post(f"/api/prescriptions/{rx['id']}/ddi-analysis", headers=H(w.docA))

    # 4. Now explainability endpoint returns complete SHAP result
    r_exp = client.get(f"/api/prescriptions/{rx['id']}/explainability", headers=H(w.docA))
    assert r_exp.status_code == 200
    data = r_exp.json()
    assert data["id"].startswith("EXP-")
    assert data["prescription_id"] == rx["id"]
    assert "overall_biomarker_attribution" in data
    assert len(data["pairs"]) == 1
    assert data["pairs"][0]["drug_a"] == "Aspirin"
    assert data["pairs"][0]["drug_b"] == "Warfarin"
    assert "clinical_biomarker_attribution" in data["pairs"][0]

    # 5. Doctor B from Hospital B cannot access (hospital isolation / non-existent to other tenants)
    r_forbidden = client.get(f"/api/prescriptions/{rx['id']}/explainability", headers=H(w.docB))
    assert r_forbidden.status_code in (403, 404)



def test_adhoc_ddi_explain_endpoint(w):
    payload = {
        "patient_id": w.PA["id"],
        "drug_a": "Aspirin",
        "drug_b": "Metformin",
    }
    r = client.post("/api/ddi/explain", json=payload, headers=H(w.docA))
    assert r.status_code == 200
    data = r.json()
    assert data["drug_a"] == "Aspirin"
    assert data["drug_b"] == "Metformin"
    assert "clinical_biomarker_attribution" in data
    assert "latent_neural_attribution" in data
    assert "chemical_attribution" in data
    assert "summary" in data

