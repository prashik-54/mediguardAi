import torch
import torch.nn as nn

class FeatureFusionLayer(nn.Module):
    """Module 4 (Part 1): Feature Fusion Layer.
    Fuses normalized patient features (7-dim) and drug pair embeddings (32-dim)
    into a unified multimodal tensor (32-dim) ready for deep learning models.
    """
    def __init__(self, patient_dim=7, drug1_dim=16, drug2_dim=16, fused_dim=32):
        super(FeatureFusionLayer, self).__init__()
        
        self.patient_proj = nn.Linear(patient_dim, 8)
        self.drug_proj = nn.Linear(drug1_dim + drug2_dim, 24)
        self.fusion_layer = nn.Linear(8 + 24, fused_dim)
        self.relu = nn.ReLU()

    def forward(self, patient_vec: torch.Tensor, drug1_embed: torch.Tensor, drug2_embed: torch.Tensor) -> torch.Tensor:
        p_out = self.relu(self.patient_proj(patient_vec))
        d_out = self.relu(self.drug_proj(torch.cat([drug1_embed, drug2_embed], dim=1)))
        
        fused = self.relu(self.fusion_layer(torch.cat([p_out, d_out], dim=1)))
        return fused