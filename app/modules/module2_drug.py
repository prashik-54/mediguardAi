import os
import pandas as pd
from typing import Dict, List
from difflib import get_close_matches
from app.modules.module3_pipeline import ClinicalDataPreprocessor

class DrugKnowledgeBase:
    def __init__(self):
        self.processor = ClinicalDataPreprocessor()

        base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
        self.indian_csv_path = os.path.join(base_dir, "..", "data", "indian_medicine_data.csv")
        self.ddi_csv_path = os.path.join(base_dir, "..", "data", "ddi_interactions.csv")

        # 1. CANONICAL CHEMICAL DICTIONARY (Standardizes chemical naming variations)
        self.canonical_chemical_map = {
            "glycomet": "metformin",
            "metformin hcl": "metformin",
            "metformin hydrochloride": "metformin",
            "ciplox": "ciprofloxacin",
            "ciprofloxacin hcl": "ciprofloxacin",
            "ciprofloxacin hydrochloride": "ciprofloxacin",
            "ecosprin": "aspirin",
            "warf": "warfarin",
            "pan": "pantoprazole",
            "pantoprazole sodium": "pantoprazole",
            "clopilet": "clopidogrel",
            "clopidogrel bisulfate": "clopidogrel",
            "crocin": "paracetamol",
            "calpol": "paracetamol",
            "acetaminophen": "paracetamol",
            "disprin": "aspirin",
            "combiflam": "ibuprofen",
            "telma": "telmisartan",
            "aldactone": "spironolactone",
            "suhagra": "sildenafil",
            "sorbitrate": "isosorbide dinitrate"
        }

        # 2. BASELINE HIGH-RISK INTERACTION FALLBACK MAP
        # Single source of truth for every surface that runs a DDI check
        # (the standalone DDI Analysis Workspace's /api/ddi/check and the
        # prescription-linked /api/prescriptions/{id}/ddi-analysis both call
        # query_known_interaction() below) -- this used to be duplicated
        # (and drifted out of sync) in frontend/src/data/interactions.js;
        # that file's demo content has been merged in here so both surfaces
        # can never disagree about a result again. mechanism/effects/
        # recommendation/confidence/evidence are optional explainability
        # fields, passed through as-is by query_known_interaction.
        self.fallback_ddi_map = {
            ("aspirin", "warfarin"): {
                "interaction_type": "Severe Anticoagulant & Hemorrhage Risk",
                "known_severity": "High",
                "description": "Concomitant use of aspirin and warfarin significantly increases the risk of major gastrointestinal and systemic bleeding.",
                "mechanism": "Aspirin adds antiplatelet activity and gastric mucosal injury on top of warfarin anticoagulation.",
                "effects": ["Major gastrointestinal bleeding", "Systemic haemorrhage risk"],
                "recommendation": "Avoid the combination unless clearly indicated; add gastroprotection and monitor INR and haemoglobin.",
                "confidence": 94, "evidence": "Meta-analysis, 9 studies · High confidence",
            },
            ("ibuprofen", "aspirin"): {
                "interaction_type": "Pharmacodynamic Risk",
                "known_severity": "High",
                "description": "Increased risk of severe GI bleeding and blunting of aspirin's cardioprotective antiplatelet effects.",
                "mechanism": "Ibuprofen competes for the COX-1 site, blunting aspirin's antiplatelet effect while adding GI toxicity.",
                "effects": ["Increased GI bleeding", "Reduced cardioprotection from low-dose aspirin"],
                "recommendation": "Separate dosing (aspirin at least 30 minutes before ibuprofen) or switch to paracetamol for pain.",
                "confidence": 88, "evidence": "Pharmacodynamic study + label warnings · Well established",
            },
            ("metformin", "ciprofloxacin"): {
                "interaction_type": "Acute Hypoglycemia Risk",
                "known_severity": "Moderate/High",
                "description": "Ciprofloxacin enhances the blood-glucose-lowering effect of metformin, increasing the risk of severe hypoglycemia.",
                "mechanism": "Fluoroquinolones can disturb glucose homeostasis and enhance the glucose-lowering effect of metformin.",
                "effects": ["Hypoglycaemia", "Occasional hyperglycaemia"],
                "recommendation": "Monitor blood glucose during the antibiotic course and counsel the patient on symptoms.",
                "confidence": 73, "evidence": "Case series + label warnings · Moderate confidence",
            },
            ("telmisartan", "spironolactone"): {
                "interaction_type": "Hyperkalemia Risk",
                "known_severity": "High",
                "description": "Synergistic elevation of serum potassium levels leading to cardiac arrhythmia risk.",
                "mechanism": "ARBs reduce aldosterone-driven potassium excretion, and spironolactone blocks it further.",
                "effects": ["Hyperkalaemia", "Cardiac arrhythmia risk, especially with reduced eGFR"],
                "recommendation": "Check potassium and creatinine within one week of starting and after each dose change.",
                "confidence": 90, "evidence": "Randomised trials + registry · High confidence",
            },
            ("pantoprazole", "clopidogrel"): {
                "interaction_type": "Reduced Antiplatelet Efficacy",
                "known_severity": "Moderate",
                "description": "Proton pump inhibitor decreases hepatic activation of clopidogrel; pantoprazole has the weakest effect.",
                "mechanism": "Proton pump inhibitors can decrease hepatic activation of clopidogrel; pantoprazole has the weakest effect.",
                "effects": ["Small reduction in antiplatelet response"],
                "recommendation": "Acceptable when gastroprotection is required; monitor for clinical events.",
                "confidence": 64, "evidence": "Observational data · Low-moderate confidence",
            },
            ("metformin", "omeprazole"): {
                "interaction_type": "Pharmacokinetic Risk", "known_severity": "High",
                "description": "Omeprazole may increase the serum concentration of metformin by reducing its renal clearance.",
                "mechanism": "Omeprazole may increase the serum concentration of Metformin by reducing its renal clearance.",
                "effects": ["Increased risk of lactic acidosis", "Higher exposure in patients with reduced kidney function"],
                "recommendation": "Consider an alternative acid-suppression therapy, or monitor renal function and lactate closely.",
                "confidence": 91, "evidence": "Cohort study, n = 4,120 · DrugBank / CDSCO cross-reference",
            },
            ("atorvastatin", "amlodipine"): {
                "interaction_type": "Pharmacokinetic Risk", "known_severity": "Moderate",
                "description": "Amlodipine weakly inhibits CYP3A4, which can raise atorvastatin exposure.",
                "mechanism": "Amlodipine weakly inhibits CYP3A4, which can raise atorvastatin exposure.",
                "effects": ["Increased statin exposure", "Possible myalgia at higher statin doses"],
                "recommendation": "Keep atorvastatin at the lowest effective dose and ask the patient to report muscle pain.",
                "confidence": 78, "evidence": "Pharmacokinetic study, n = 32 · Moderate confidence",
            },
            ("warfarin", "amiodarone"): {
                "interaction_type": "Pharmacokinetic Risk", "known_severity": "High",
                "description": "Amiodarone inhibits CYP2C9 and CYP3A4, reducing the metabolic clearance of warfarin.",
                "mechanism": "Amiodarone inhibits CYP2C9 and CYP3A4, reducing the metabolic clearance of warfarin.",
                "effects": ["Markedly raised INR", "Major bleeding risk in the first weeks of co-administration"],
                "recommendation": "Reduce the warfarin dose by 30-50% on initiation and check INR twice weekly for four weeks.",
                "confidence": 96, "evidence": "Randomised trial, n = 860 · High confidence",
            },
            ("aspirin", "clopidogrel"): {
                "interaction_type": "Pharmacodynamic Risk", "known_severity": "Moderate",
                "description": "Dual antiplatelet effect through COX-1 and P2Y12 inhibition.",
                "mechanism": "Dual antiplatelet effect through COX-1 and P2Y12 inhibition.",
                "effects": ["Additive bleeding risk with prolonged dual therapy"],
                "recommendation": "Add a PPI for gastroprotection and reassess the planned duration of dual therapy each visit.",
                "confidence": 85, "evidence": "Meta-analysis, 12 studies · Well established",
            },
            ("clopidogrel", "omeprazole"): {
                "interaction_type": "Pharmacokinetic Risk", "known_severity": "Moderate",
                "description": "Omeprazole inhibits CYP2C19, which converts clopidogrel to its active metabolite.",
                "mechanism": "Omeprazole inhibits CYP2C19, which converts clopidogrel to its active metabolite.",
                "effects": ["Reduced antiplatelet efficacy", "Higher risk of stent thrombosis in high-risk patients"],
                "recommendation": "Prefer pantoprazole when a PPI is needed alongside clopidogrel.",
                "confidence": 82, "evidence": "Registry data + regulatory advisory · Moderate confidence",
            },
            ("losartan", "ibuprofen"): {
                "interaction_type": "Pharmacodynamic Risk", "known_severity": "Moderate",
                "description": "NSAIDs reduce renal prostaglandins and blunt the effect of ARBs on glomerular pressure.",
                "mechanism": "NSAIDs reduce renal prostaglandins and blunt the effect of ARBs on glomerular pressure.",
                "effects": ["Acute kidney injury risk", "Reduced blood-pressure control"],
                "recommendation": "Avoid regular NSAID use; if unavoidable use the lowest dose for the shortest time and check renal function.",
                "confidence": 80, "evidence": "Cohort study, n = 12,000 · Well established",
            },
            ("sertraline", "ibuprofen"): {
                "interaction_type": "Pharmacodynamic Risk", "known_severity": "Moderate",
                "description": "SSRIs deplete platelet serotonin while NSAIDs impair platelet function and irritate the gastric lining.",
                "mechanism": "SSRIs deplete platelet serotonin while NSAIDs impair platelet function and irritate the gastric lining.",
                "effects": ["Increased upper GI bleeding risk"],
                "recommendation": "Consider paracetamol instead, or add gastroprotection if the NSAID is needed.",
                "confidence": 76, "evidence": "Meta-analysis, 6 studies · Moderate confidence",
            },
            ("losartan", "furosemide"): {
                "interaction_type": "Pharmacodynamic Risk", "known_severity": "Low",
                "description": "Combined effect may potentiate hypotension and mild electrolyte shifts.",
                "mechanism": "Combined effect may potentiate hypotension and mild electrolyte shifts.",
                "effects": ["Occasional dizziness on standing"],
                "recommendation": "Advise slow postural changes and recheck electrolytes at the next routine visit.",
                "confidence": 58, "evidence": "Observational registry · Low confidence",
            },
        }

        # Load DataFrames
        self.indian_drugs_df, self.brand_col, self.comp_col = self._load_and_index_indian_data()
        self.ddi_df, self.d1_col, self.d2_col = self._load_and_index_ddi_data()

    def _load_and_index_indian_data(self):
        if os.path.exists(self.indian_csv_path):
            try:
                df = pd.read_csv(self.indian_csv_path, low_memory=False)
                brand_col = self.processor.match_column_name(
                    df, ['name', 'product_name', 'brand_name', 'medicine_name', 'drug_name', 'title']
                )
                comp_col = self.processor.match_column_name(
                    df, ['composition', 'salt_composition', 'active_ingredient', 'salt', 'ingredients', 'short_composition1']
                )

                if brand_col:
                    df['clean_brand_search'] = df[brand_col].astype(str).apply(self.processor.clean_text)
                    print(f" SUCCESS: Pre-indexed {len(df):,} Indian Medicine records.")
                return df, brand_col, comp_col
            except Exception as e:
                print(f" [Warning] Indian Medicine CSV error: {e}")
        return pd.DataFrame(), None, None

    def _load_and_index_ddi_data(self):
        if os.path.exists(self.ddi_csv_path):
            try:
                df = pd.read_csv(self.ddi_csv_path, low_memory=False)
                d1_col = self.processor.match_column_name(df, ['drug1', 'drug_1', 'drug_a', 'drug1_name', 'parent_drug_1'])
                d2_col = self.processor.match_column_name(df, ['drug2', 'drug_2', 'drug_b', 'drug2_name', 'parent_drug_2'])

                if d1_col and d2_col:
                    df['clean_d1'] = df[d1_col].astype(str).apply(self.processor.clean_text)
                    df['clean_d2'] = df[d2_col].astype(str).apply(self.processor.clean_text)
                    print(f" SUCCESS: Pre-indexed {len(df):,} DDI records.")
                return df, d1_col, d2_col
            except Exception as e:
                print(f" [Warning] DDI CSV error: {e}")
        return pd.DataFrame(), None, None

    def dataset_mode(self) -> str:
        """'full' when the DDI ground-truth CSV is indexed; otherwise 'fallback', which uses the built-in
        reference interaction map (sample interaction / medicine data)."""
        return "full" if not self.ddi_df.empty else "fallback"

    def get_dataset_stats(self) -> Dict:
        return {
            "ddi_dataset_mode": self.dataset_mode(),
            "indian_medicine_records_loaded": len(self.indian_drugs_df),
            "ddi_interaction_records_loaded": len(self.ddi_df),
            "status": "Full Datasets Active and Indexed" if not self.indian_drugs_df.empty else "Fallback Mode"
        }

    def _canonicalize_chemical_name(self, name: str) -> str:
        """Converts raw or chemical variations to standardized canonical salt names."""
        clean = self.processor.clean_text(name)
        # 1. Exact match in Canonical Dictionary
        if clean in self.canonical_chemical_map:
            return self.canonical_chemical_map[clean]
        
        # 2. Check if a key is a substring
        for key, canonical in self.canonical_chemical_map.items():
            if key in clean:
                return canonical
                
        return clean

    def map_to_generic(self, drug_name: str) -> Dict:
        cleaned_query = self.processor.clean_text(drug_name)

        # Step A: Search in CDSCO CSV Dataset
        if not self.indian_drugs_df.empty and 'clean_brand_search' in self.indian_drugs_df.columns:
            matches = self.indian_drugs_df[self.indian_drugs_df['clean_brand_search'].str.contains(cleaned_query, regex=False, na=False)]
            
            if not matches.empty:
                matched_row = matches.iloc[0]
                raw_comp = str(matched_row[self.comp_col]) if self.comp_col else cleaned_query
                official_brand = str(matched_row[self.brand_col])
                extracted_tokens = self.processor.extract_generic_tokens(raw_comp)
                
                # Normalize through Canonical Resolver
                canonical_salts = [self._canonicalize_chemical_name(t) for t in extracted_tokens]

                return {
                    "generics": canonical_salts,
                    "source": "Full CDSCO Indian Medicine CSV Dataset",
                    "official_matched_brand": official_brand,
                    "raw_composition_field": raw_comp
                }

        # Step B: Direct Canonical Normalization Fallback
        canonical = self._canonicalize_chemical_name(cleaned_query)
        return {
            "generics": [canonical],
            "source": "Canonical Chemical Normalizer",
            "official_matched_brand": drug_name,
            "raw_composition_field": canonical
        }

    def query_known_interaction(self, drug_a: str, drug_b: str) -> Dict:
        norm_a = self._canonicalize_chemical_name(drug_a)
        norm_b = self._canonicalize_chemical_name(drug_b)

        # 1. Search in DDI CSV Dataset with partial matching
        if not self.ddi_df.empty and 'clean_d1' in self.ddi_df.columns and 'clean_d2' in self.ddi_df.columns:
            match = self.ddi_df[
                ((self.ddi_df['clean_d1'].str.contains(norm_a, regex=False, na=False)) & (self.ddi_df['clean_d2'].str.contains(norm_b, regex=False, na=False))) |
                ((self.ddi_df['clean_d1'].str.contains(norm_b, regex=False, na=False)) & (self.ddi_df['clean_d2'].str.contains(norm_a, regex=False, na=False)))
            ]

            if not match.empty:
                row = match.iloc[0]
                desc_col = self.processor.match_column_name(self.ddi_df, ['description', 'interaction', 'effect', 'interaction_text'])
                sev_col = self.processor.match_column_name(self.ddi_df, ['severity', 'risk_level', 'level'])

                return {
                    "interaction_found": True,
                    "interaction_type": "Dataset Ground Truth Record",
                    "known_severity": str(row[sev_col]) if sev_col else "High",
                    "description": str(row[desc_col]) if desc_col else f"Known interaction record found between {norm_a} and {norm_b}.",
                    "data_source": "Full DrugBank DDI CSV Dataset"
                }

        # 2. Check High-Risk Fallback Map
        if (norm_a, norm_b) in self.fallback_ddi_map:
            res = self.fallback_ddi_map[(norm_a, norm_b)].copy()
            res["interaction_found"] = True
            res.setdefault("data_source", "High-Risk Baseline Resolver")
            return res
        elif (norm_b, norm_a) in self.fallback_ddi_map:
            res = self.fallback_ddi_map[(norm_b, norm_a)].copy()
            res["interaction_found"] = True
            res.setdefault("data_source", "High-Risk Baseline Resolver")
            return res

        # 3. Return structured response indicating static DB record was absent
        return {
            "interaction_found": False,
            "interaction_type": "None",
            "known_severity": "Low",
            "description": f"No explicit static database record for pair ({norm_a}, {norm_b}).",
            "data_source": "Full Dataset Search Complete"
        }