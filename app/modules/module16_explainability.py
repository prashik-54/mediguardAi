"""
Module 16: Model Explainability Service (SHAP).

Provides deep-learning and clinical-factor explainability using SHAP
(SHapley Additive exPlanations) for DDI analyses and clinical predictions.

Follows the doctor-only scoping of Module 11/12: detailed neural latent
attributions and pharmacophore feature breakdowns are accessible to
authorized clinicians and administrators, with patient-safe representations
bridging to Module 13 reports.
"""
from __future__ import annotations

import time
from typing import Any, Dict, List, Optional

from pydantic import BaseModel, ConfigDict, Field

from app.db import get_db, next_id
from app.ml.shap_explainer import shap_explainability_engine


class ShapFeatureContribution(BaseModel):
    feature_name: str
    feature_value: str
    shap_value: float
    relative_importance_pct: float
    direction: str  # "increases_risk" | "decreases_risk" | "neutral"
    clinical_note: str


class PairExplainabilityResult(BaseModel):
    drug_a: str
    drug_b: str
    severity: str = "Low"
    interaction_found: bool = False
    clinical_biomarker_attribution: Dict[str, Any] = Field(default_factory=dict)
    latent_neural_attribution: Dict[str, Any] = Field(default_factory=dict)
    chemical_attribution: Dict[str, Any] = Field(default_factory=dict)
    summary: str = ""


class ExplainabilityRecordCreate(BaseModel):
    model_config = ConfigDict(protected_namespaces=())

    encounter_id: str
    prescription_id: str
    analysis_id: str
    patient_id: str
    doctor_id: str
    pairs: List[PairExplainabilityResult] = []
    overall_biomarker_attribution: Dict[str, Any] = Field(default_factory=dict)
    overall_score: float = 0.0
    base_value: float = 0.0
    engine_info: Dict[str, Any] = Field(default_factory=dict)


class ExplainabilityStore:
    def __init__(self):
        self._seq = 0

    @property
    def col(self):
        return get_db()["explainability_records"]

    def _next_id(self) -> str:
        return next_id(self.col, "EXP-", 5)

    def record(self, payload: ExplainabilityRecordCreate, org_id: str) -> Dict[str, Any]:
        doc = {
            "id": self._next_id(),
            "org_id": org_id,
            "encounter_id": payload.encounter_id,
            "prescription_id": payload.prescription_id,
            "analysis_id": payload.analysis_id,
            "patient_id": payload.patient_id,
            "doctor_id": payload.doctor_id,
            "pairs": [p.model_dump() if hasattr(p, "model_dump") else dict(p) for p in payload.pairs],
            "overall_biomarker_attribution": payload.overall_biomarker_attribution,
            "overall_score": payload.overall_score,
            "base_value": payload.base_value,
            "engine_info": payload.engine_info or shap_explainability_engine.health(),
            "created_at": time.time(),
        }
        self.col.insert_one(doc)
        return doc

    def get(self, exp_id: str) -> Optional[Dict[str, Any]]:
        return self.col.find_one({"id": exp_id})

    def get_for_analysis(self, analysis_id: str) -> Optional[Dict[str, Any]]:
        rows = self.col.find({"analysis_id": analysis_id})
        sorted_rows = sorted(rows, key=lambda a: a.get("created_at", 0), reverse=True)
        return sorted_rows[0] if sorted_rows else None

    def get_for_prescription(self, prescription_id: str) -> Optional[Dict[str, Any]]:
        rows = self.col.find({"prescription_id": prescription_id})
        sorted_rows = sorted(rows, key=lambda a: a.get("created_at", 0), reverse=True)
        return sorted_rows[0] if sorted_rows else None

    def list_for_encounter(self, encounter_id: str) -> List[Dict[str, Any]]:
        rows = self.col.find({"encounter_id": encounter_id})
        return sorted(rows, key=lambda a: a.get("created_at", 0), reverse=True)

    def generate_for_analysis(
        self,
        analysis_doc: Dict[str, Any],
        patient_doc: Dict[str, Any],
        prescription_doc: Dict[str, Any],
        doctor_id: str,
        org_id: str,
    ) -> Dict[str, Any]:
        """Runs the SHAP explainability engine across all pairs in the analysis and stores the result."""
        # Check cache first
        cached = self.get_for_analysis(analysis_doc.get("id", ""))
        if cached:
            return cached

        pairs_exp = []
        highest_sev = analysis_doc.get("overall_severity", "Low")
        pairs = analysis_doc.get("pairs") or []

        # Find max DGAT probability across all pairs
        max_dgat_prob = 0.20
        for pair in pairs:
            m_pred = pair.get("model_prediction") or {}
            prob = float(m_pred.get("probability") or 0.0)
            if prob > max_dgat_prob:
                max_dgat_prob = prob

        # Generate pair-level explanations
        for pair in pairs:
            drug_a = pair.get("drug_a") or pair.get("drug_a_canonical") or "Unknown Drug A"
            drug_b = pair.get("drug_b") or pair.get("drug_b_canonical") or "Unknown Drug B"

            pair_res = shap_explainability_engine.explain_ddi_pair_complete(
                drug_a=drug_a,
                drug_b=drug_b,
                patient_data=patient_doc,
                prescription_data=prescription_doc,
                pair_analysis=pair,
            )
            pairs_exp.append(PairExplainabilityResult(
                drug_a=drug_a,
                drug_b=drug_b,
                severity=pair.get("severity", "Low"),
                interaction_found=bool(pair.get("interaction_found", False)),
                clinical_biomarker_attribution=pair_res["clinical_biomarker_attribution"],
                latent_neural_attribution=pair_res["latent_neural_attribution"],
                chemical_attribution=pair_res["chemical_attribution"],
                summary=pair_res["summary"],
            ))

        # Overall clinical risk attribution for the whole encounter
        overall_biomarker = shap_explainability_engine.explain_clinical_risk(
            patient_data=patient_doc,
            prescription_data=prescription_doc,
            highest_severity=highest_sev,
            dgat_prob=max_dgat_prob,
        )

        create_payload = ExplainabilityRecordCreate(
            encounter_id=analysis_doc.get("encounter_id", ""),
            prescription_id=analysis_doc.get("prescription_id", ""),
            analysis_id=analysis_doc.get("id", ""),
            patient_id=patient_doc.get("id", ""),
            doctor_id=doctor_id,
            pairs=pairs_exp,
            overall_biomarker_attribution=overall_biomarker,
            overall_score=overall_biomarker.get("predicted_score", 0.0),
            base_value=overall_biomarker.get("base_value", 0.0),
            engine_info=shap_explainability_engine.health(),
        )

        return self.record(create_payload, org_id)


explainability_store = ExplainabilityStore()

