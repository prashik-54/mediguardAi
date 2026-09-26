import re
import numpy as np
import pandas as pd
from sklearn.preprocessing import MinMaxScaler
import torch

class ClinicalDataPreprocessor:
    def __init__(self):
        self.scaler = MinMaxScaler()
        dummy_bounds = np.array([
            [0, 0, 0],
            [100, 140, 200]
        ])
        self.scaler.fit(dummy_bounds)

    def clean_text(self, text: str) -> str:
        """Cleans messy brand and chemical strings."""
        if not isinstance(text, str):
            return ""
        
        text = text.lower()
        # Remove common dosage specs (e.g., 500mg, 1gm, 500, sr, duo, tablet, capsule)
        text = re.sub(r'\d+(\.\d+)?\s*(mg|g|gm|mcg|ml|iu|tablet|capsule|injection|sr|er|duo|xl)', '', text)
        text = re.sub(r'\b\d+(\.\d+)?\b', '', text)
        text = re.sub(r'[^a-zA-Z\s,\+]', ' ', text)
        return ' '.join(text.split())

    def extract_generic_tokens(self, composition_string: str) -> list[str]:
        """Extracts active chemical ingredients from messy composition strings."""
        cleaned = self.clean_text(composition_string)
        raw_tokens = re.split(r'[\+\,\/]|and', cleaned)
        
        tokens = []
        for token in raw_tokens:
            token = token.strip()
            # Ignore non-chemical dosage words
            if len(token) > 2 and token not in ['mg', 'ml', 'tablet', 'duo', 'capsule', 'sustained', 'release']:
                tokens.append(token)
        return tokens if tokens else [cleaned]

    def match_column_name(self, df: pd.DataFrame, possible_names: list[str]) -> str:
        """Dynamically finds column headers in CSV files."""
        df_cols_clean = {re.sub(r'[^a-zA-Z0-9]', '', str(c)).lower(): c for c in df.columns}
        for name in possible_names:
            clean_search = re.sub(r'[^a-zA-Z0-9]', '', name).lower()
            if clean_search in df_cols_clean:
                return df_cols_clean[clean_search]
        return None

    def preprocess_patient_features(self, patient_dict: dict) -> torch.Tensor:
        age = patient_dict.get("age", 50)
        egfr = patient_dict.get("kidney_function_egfr", 90.0)
        alt = patient_dict.get("liver_function_alt", 25.0)
        
        continuous_raw = np.array([[age, egfr, alt]])
        continuous_scaled = self.scaler.transform(continuous_raw).flatten()

        gender = str(patient_dict.get("gender", "Male")).lower()
        gender_encoded = [1.0, 0.0] if gender == "male" else [0.0, 1.0]

        kidney_flag = 1.0 if egfr < 60.0 else 0.0
        liver_flag = 1.0 if alt > 50.0 else 0.0
        
        organ_flags = [kidney_flag, liver_flag]
        combined_vector = np.concatenate([continuous_scaled, gender_encoded, organ_flags])
        
        return torch.tensor(combined_vector, dtype=torch.float32)