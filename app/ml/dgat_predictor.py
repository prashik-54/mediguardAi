from __future__ import annotations

import logging
import os
import re
import threading
from pathlib import Path
from typing import Any

logger = logging.getLogger(__name__)

_SALT_WORDS = {
    "hydrochloride", "hcl", "hydrobromide", "sodium", "potassium", "calcium", "magnesium",
    "maleate", "besylate", "besilate", "tartrate", "succinate", "mesylate", "sulfate",
    "sulphate", "phosphate", "acetate", "fumarate", "citrate", "bromide", "chloride",
    "dihydrate", "monohydrate", "hydrate", "nitrate",
}
_STRENGTH = re.compile(r"^[\d.,]+(mg|mcg|g|iu|ml|%|gm|ug)?$")
_SYNONYMS = {
    "paracetamol": "acetaminophen",
    "amoxycillin": "amoxicillin",
    "frusemide": "furosemide",
    "salbutamol": "albuterol",
    "rifampicin": "rifampin",
    "glibenclamide": "glyburide",
    "lignocaine": "lidocaine",
    "ciclosporin": "cyclosporine",
    "cefalexin": "cephalexin",
    "thyroxine": "levothyroxine",
    "valproate": "valproic acid",
    "acetylsalicylic acid": "aspirin",
}


def normalize_drug_name(name: str) -> str:
    value = re.sub(r"\([^)]*\)", " ", str(name).lower())
    value = re.sub(r"[^a-z0-9\s\-]", " ", value)
    tokens = [token for token in value.split()
              if token not in _SALT_WORDS and not _STRENGTH.match(token)]
    normalized = " ".join(tokens).strip()
    return _SYNONYMS.get(normalized, normalized)


class DGATPredictor:
    """Load the trained DGAT once and serve scores as supplemental DDI evidence."""

    def __init__(self, assets_dir: Path | None = None):
        configured_assets = os.environ.get("DDI_MODEL_ASSETS_DIR")
        self.assets_dir = assets_dir or Path(
            configured_assets or Path(__file__).resolve().parent / "assets"
        )
        self._lock = threading.RLock()
        self._status = "not_loaded"
        self._failure: str | None = None
        self._model = None
        self._embeddings = None
        self._device = None
        self._drug_to_idx: dict[str, int] = {}
        self._name_to_idx: dict[str, int] = {}
        self._known_pairs: dict[tuple[int, int], dict[str, Any]] = {}
        self._observed_edges: set[tuple[int, int]] = set()
        self._metadata: dict[str, Any] = {}

    def initialize(self) -> dict[str, Any]:
        with self._lock:
            if self._status == "ready":
                return self.health()

            self._status = "loading"
            try:
                import pandas as pd
                import torch
                from torch_geometric.data import Batch

                from app.ml.dgat_model import DGATDDI, ModelConfig

                required = {
                    "checkpoint": self.assets_dir / "dgat_ddi.pt",
                    "molecules": self.assets_dir / "processed_drug_graphs.pt",
                    "graph": self.assets_dir / "ddi_global_graph.pt",
                    "drug_table": self.assets_dir / "drug_table.parquet",
                    "pair_side_effects": self.assets_dir / "pair_side_effects.parquet",
                }
                missing = [str(path) for path in required.values() if not path.is_file()]
                if missing:
                    raise FileNotFoundError("Missing DGAT inference artifacts: " + ", ".join(missing))

                checkpoint = torch.load(required["checkpoint"], map_location="cpu", weights_only=False)
                model = DGATDDI(ModelConfig(**checkpoint["config"]))
                model.load_state_dict(checkpoint["state_dict"])
                model.eval()

                molecule_data = torch.load(required["molecules"], map_location="cpu", weights_only=False)
                molecules = Batch.from_data_list(molecule_data["graphs"])
                graph = torch.load(required["graph"], map_location="cpu", weights_only=False)
                if molecules.num_graphs != graph.num_nodes:
                    raise ValueError("DGAT molecular graphs and interaction graph have different node counts.")

                drug_table = pd.read_parquet(required["drug_table"])
                if len(drug_table) != graph.num_nodes:
                    raise ValueError("DGAT drug table and interaction graph have different node counts.")

                drug_to_idx_path = self.assets_dir / "drug_to_idx.pt"
                if drug_to_idx_path.is_file():
                    aliases = torch.load(drug_to_idx_path, map_location="cpu", weights_only=False)
                    self._drug_to_idx = {str(key).upper(): int(value) for key, value in aliases.items()}

                self._name_to_idx = {}
                for row in drug_table.itertuples():
                    idx = int(row.idx)
                    for raw_name in (row.generic_key, row.drug_name):
                        if isinstance(raw_name, str) and raw_name.strip():
                            key = normalize_drug_name(raw_name)
                            if key:
                                self._name_to_idx.setdefault(key, idx)

                with torch.inference_mode():
                    embeddings = model.encode(molecules, graph.edge_index)

                self._observed_edges = {
                    (min(int(a), int(b)), max(int(a), int(b)))
                    for a, b in graph.edge_index.t().tolist() if int(a) != int(b)
                }
                effects = pd.read_parquet(required["pair_side_effects"])
                self._known_pairs = {}
                for row in effects.itertuples():
                    key = (int(row.idx_a), int(row.idx_b))
                    examples = row.example_side_effects
                    if hasattr(examples, "tolist"):
                        examples = examples.tolist()
                    if not isinstance(examples, (list, tuple)):
                        examples = [] if examples is None else [examples]
                    self._known_pairs[key] = {
                        "n_side_effects": int(row.n_side_effects),
                        "examples": [str(effect) for effect in examples[:5]],
                    }

                self._model = model
                self._embeddings = embeddings
                self._device = torch.device("cpu")
                self._metadata = {
                    "version": "DGAT-TWOSIDES",
                    "checkpoint_epoch": checkpoint.get("epoch"),
                    "validation_roc_auc": checkpoint.get("val_auc"),
                    "threshold": 0.5,
                    "n_drugs": int(graph.num_nodes),
                    "n_observed_pairs": len(self._observed_edges),
                    "message_passing_graph": "full_observed_twosides_graph",
                }
                self._failure = None
                self._status = "ready"
                logger.info("DGAT predictor loaded: %s", self._metadata)
            except Exception as exc:
                self._model = None
                self._embeddings = None
                self._status = "unavailable"
                self._failure = f"{type(exc).__name__}: {exc}"
                logger.exception("Could not initialize the DGAT predictor")
            return self.health()

    def health(self) -> dict[str, Any]:
        status = {"status": self._status, "version": self._metadata.get("version"),
                  "threshold": self._metadata.get("threshold"),
                  "output": "Population-level TWOSIDES association score; not a clinical risk probability."}
        if self._status == "ready":
            status.update({key: value for key, value in self._metadata.items()
                           if key not in ("version", "threshold")})
        elif self._failure:
            status["detail"] = "DGAT model unavailable; see backend logs."
        return status

    def resolve(self, name: str) -> int | None:
        query = str(name).strip()
        if query.upper().startswith("CID") and query[3:].isdigit():
            return self._drug_to_idx.get(query.upper())
        if query.isdigit():
            # PubChem CID values are not used as graph indices.
            return None
        return self._name_to_idx.get(normalize_drug_name(query))

    def predict_pair(self, drug_a: str, drug_b: str) -> dict[str, Any]:
        if self._status in ("not_loaded", "loading"):
            self.initialize()
        if self._status != "ready":
            return {"status": "unavailable", "detail": "DGAT model is not available on this server."}

        idx_a, idx_b = self.resolve(drug_a), self.resolve(drug_b)
        if idx_a is None or idx_b is None:
            missing = [name for name, idx in ((drug_a, idx_a), (drug_b, idx_b)) if idx is None]
            return {"status": "unsupported_drug", "unsupported_drugs": missing,
                    "detail": "One or more medicines are not in the DGAT model vocabulary."}
        if idx_a == idx_b:
            return {"status": "same_drug", "detail": "Both names resolve to the same model drug."}

        key = (min(idx_a, idx_b), max(idx_a, idx_b))
        with self._lock:
            import torch

            pair = torch.tensor([[idx_a], [idx_b]], dtype=torch.long, device=self._device)
            with torch.inference_mode():
                logits = self._model.decode(self._embeddings, pair)
                probability = float(self._model.calibrated_proba(logits).item())

        recorded = key in self._observed_edges
        return {
            "status": "scored",
            "probability": round(probability, 6),
            "threshold": self._metadata["threshold"],
            "model_flag": probability >= self._metadata["threshold"],
            "is_recorded_in_twosides": recorded,
            "known_in_twosides": self._known_pairs.get(key),
            "interpretation": (
                "This pair is already present in the TWOSIDES graph used for message passing; "
                "the score is not an independent prediction for this known pair."
                if recorded else
                "Population-level association score for a pair not recorded in the supplied TWOSIDES graph."
            ),
            "patient_specific": False,
        }


dgat_predictor = DGATPredictor()
