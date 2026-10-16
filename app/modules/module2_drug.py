import os
import pandas as pd
from typing import Any, Dict, List
from difflib import get_close_matches
from app.modules.module3_pipeline import ClinicalDataPreprocessor

class DrugKnowledgeBase:
    def __init__(self):
        self.processor = ClinicalDataPreprocessor()

        base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
        self.indian_csv_path = os.path.join(base_dir, "..", "data", "indian_medicine_data.csv")
        self.ddi_csv_path = os.path.join(base_dir, "..", "data", "ddi_interactions.csv")
        self.model_drug_table_path = os.path.join(base_dir, "ml", "assets", "drug_table.parquet")

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

        # Load DataFrames
        self.indian_drugs_df, self.brand_col, self.comp_col = self._load_and_index_indian_data()
        self.ddi_df, self.d1_col, self.d2_col = self._load_and_index_ddi_data()
        self.model_drugs_df = self._load_model_drug_catalog()
        self.model_drug_aliases = {}
        for row in self.model_drugs_df.itertuples():
            generic = str(row.generic_key).strip()
            if not generic or generic.lower() == "nan":
                continue
            for alias in (row.generic_key, row.drug_name):
                clean_alias = self.processor.clean_text(str(alias))
                if clean_alias:
                    self.model_drug_aliases.setdefault(clean_alias, generic)

    def _load_model_drug_catalog(self):
        if not os.path.isfile(self.model_drug_table_path):
            return pd.DataFrame(columns=["generic_key", "drug_name"])
        try:
            df = pd.read_parquet(self.model_drug_table_path)
            required = {"generic_key", "drug_name"}
            if not required.issubset(df.columns):
                raise ValueError("DGAT drug table must contain generic_key and drug_name columns.")
            return df[["generic_key", "drug_name"]].dropna().drop_duplicates()
        except Exception as exc:
            print(f" [Warning] DGAT medicine catalog error: {exc}")
            return pd.DataFrame(columns=["generic_key", "drug_name"])

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
            "dgat_medicine_records_loaded": len(self.model_drugs_df),
            "status": "Full Datasets Active and Indexed" if not self.indian_drugs_df.empty else "Fallback Mode"
        }

    def medicine_catalog(self) -> List[str]:
        """Return the complete DGAT vocabulary plus reference medicine aliases."""
        names: Dict[str, str] = {}
        model_names = self.model_drugs_df["drug_name"] if not self.model_drugs_df.empty else []
        for name in model_names:
            value = str(name).strip()
            if value and value.lower() != "nan":
                names.setdefault(value.casefold(), value)
        for alias in self.canonical_chemical_map:
            names.setdefault(alias.casefold(), alias.title())
        return sorted(names.values(), key=str.casefold)

    def search_medicines(self, query: str, limit: int = 50) -> List[str]:
        """Search dataset brand and DGAT vocabulary names for prescription autocomplete."""
        clean_query = self.processor.clean_text(query)
        if len(clean_query) < 2:
            return []
        limit = max(1, min(limit, 100))
        results: Dict[str, str] = {}

        def add(name: Any) -> None:
            if name is None:
                return
            value = str(name).strip()
            if value and value.lower() != "nan":
                results.setdefault(value.casefold(), value)

        if not self.indian_drugs_df.empty and self.brand_col:
            matches = self.indian_drugs_df[
                self.indian_drugs_df["clean_brand_search"].str.contains(clean_query, regex=False, na=False)
            ]
            for name in matches[self.brand_col].head(limit):
                add(name)

        if not self.model_drugs_df.empty:
            generic = self.model_drugs_df["generic_key"].astype(str)
            drug_name = self.model_drugs_df["drug_name"].astype(str)
            matches = self.model_drugs_df[
                generic.str.contains(clean_query, case=False, regex=False, na=False)
                | drug_name.str.contains(clean_query, case=False, regex=False, na=False)
            ]
            for name in matches["drug_name"].head(limit):
                add(name)
        return sorted(results.values(), key=lambda name: (not name.casefold().startswith(clean_query), name.casefold()))[:limit]

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
        brand_col = self.brand_col
        if not self.indian_drugs_df.empty and brand_col and 'clean_brand_search' in self.indian_drugs_df.columns:
            matches = self.indian_drugs_df[self.indian_drugs_df['clean_brand_search'].str.contains(cleaned_query, regex=False, na=False)]
            
            if not matches.empty:
                matched_row = matches.iloc[0]
                raw_comp = str(matched_row[self.comp_col]) if self.comp_col else cleaned_query
                official_brand = str(matched_row[brand_col])
                extracted_tokens = self.processor.extract_generic_tokens(raw_comp)
                
                # Normalize through Canonical Resolver
                canonical_salts = [self._canonicalize_chemical_name(t) for t in extracted_tokens]

                return {
                    "generics": canonical_salts,
                    "source": "Full CDSCO Indian Medicine CSV Dataset",
                    "official_matched_brand": official_brand,
                    "raw_composition_field": raw_comp
                }

        model_generic = self.model_drug_aliases.get(cleaned_query)
        if model_generic:
            return {
                "generics": [model_generic],
                "source": "DGAT model medicine dataset",
                "official_matched_brand": drug_name,
                "raw_composition_field": model_generic,
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

        # 2. Return default response when external CSV record is absent (DGAT model predicts)
        return {
            "interaction_found": False,
            "interaction_type": "None",
            "known_severity": "Low",
            "description": f"No explicit static database record for pair ({norm_a}, {norm_b}).",
            "data_source": "External CSV Not Indexed (DGAT Model Active)"
        }