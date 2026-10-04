"""
model.py - Hierarchical Directed Graph Attention Network for DDI link prediction.

    atoms/bonds --[MicroEncoder: PyG MessagePassing]--> chemical embedding per drug
    chemical embeddings + DDI topology --[MacroDGAT: multi-head GATConv, in/out channels]--> z_i
    (z_i, z_j) --[PairDecoder]--> logit ;  P(DDI) = sigmoid(logit / T)

Design notes
  * Micro encoder: custom `MolMPLayer(MessagePassing)` (GINE-style, bond-aware) + mean/max readout.
    Atom/bond features are the categorical codes produced by PyG `from_smiles`, embedded per column.
  * Macro encoder: every layer attends over *predecessors* (edge_index) and *successors*
    (edge_index flipped) with SEPARATE GATConv parameters, so the layer is direction-aware and
    works unchanged if you later feed genuinely directed edges (e.g. prescribing order from
    MIMIC-IV). On the symmetric TWOSIDES graph both channels see the same neighbours but learn
    different attention/transform weights.
  * Decoder is symmetric - score(i,j) == score(j,i) - because a DDI is not ordered. This also
    removes any "node-order" shortcut between positives and sampled negatives.
  * `temperature` is a buffer fitted on the validation set (train.py) for probability calibration.
    It never changes the 0.5 decision boundary, only the confidence of the probabilities.
"""
from __future__ import annotations

from dataclasses import asdict, dataclass
from pathlib import Path

import torch
import torch.nn as nn
import torch.nn.functional as F
from torch import Tensor
from torch_geometric.data import Batch
from torch_geometric.nn import GATConv, MessagePassing, global_max_pool, global_mean_pool
from torch_geometric.utils.smiles import e_map, x_map

ATOM_DIMS = [len(v) for v in x_map.values()]   # categorical cardinalities of atom features
BOND_DIMS = [len(v) for v in e_map.values()]   # ... and of bond features


@dataclass
class ModelConfig:
    chem_dim: int = 128        # size of the micro (molecular) embedding
    hidden_dim: int = 128      # macro hidden / output size
    micro_layers: int = 3
    macro_layers: int = 2
    heads: int = 4
    dropout: float = 0.2
    decoder: str = "mlp"       # "mlp" (projection head) or "dot" (scaled dot product)


# --------------------------------------------------------------------------- #
# Micro encoder: molecular graph -> fixed-size vector
# --------------------------------------------------------------------------- #
class CategoricalEmbedding(nn.Module):
    """Sum of one embedding table per categorical feature column (OGB-style)."""

    def __init__(self, dims: list[int], out_dim: int):
        super().__init__()
        self.dims = dims
        self.tables = nn.ModuleList(nn.Embedding(d, out_dim) for d in dims)
        for t in self.tables:
            nn.init.xavier_uniform_(t.weight)

    def forward(self, x: Tensor) -> Tensor:
        out = 0
        for i, table in enumerate(self.tables):
            out = out + table(x[:, i].clamp(0, self.dims[i] - 1))
        return out


class MolMPLayer(MessagePassing):
    """h_i' = MLP((1+eps)*h_i + sum_{j in N(i)} ReLU(h_j + W e_ij))  - a bond-aware GIN layer."""

    def __init__(self, dim: int):
        super().__init__(aggr="add")
        self.bond_proj = nn.Linear(dim, dim)
        self.eps = nn.Parameter(torch.zeros(1))
        self.mlp = nn.Sequential(nn.Linear(dim, 2 * dim), nn.BatchNorm1d(2 * dim), nn.ReLU(),
                                 nn.Linear(2 * dim, dim))

    def forward(self, x: Tensor, edge_index: Tensor, edge_attr: Tensor) -> Tensor:
        agg = self.propagate(edge_index, x=x, edge_attr=edge_attr)
        return self.mlp((1 + self.eps) * x + agg)

    def message(self, x_j: Tensor, edge_attr: Tensor) -> Tensor:
        return F.relu(x_j + self.bond_proj(edge_attr))


class MicroEncoder(nn.Module):
    def __init__(self, dim: int, layers: int, dropout: float):
        super().__init__()
        self.atom_emb = CategoricalEmbedding(ATOM_DIMS, dim)
        self.bond_emb = CategoricalEmbedding(BOND_DIMS, dim)
        self.layers = nn.ModuleList(MolMPLayer(dim) for _ in range(layers))
        self.norms = nn.ModuleList(nn.BatchNorm1d(dim) for _ in range(layers))
        self.dropout = dropout
        self.readout = nn.Sequential(nn.Linear(2 * dim, dim), nn.ReLU(), nn.Linear(dim, dim))

    def forward(self, mol: Batch) -> Tensor:
        h = self.atom_emb(mol.x)
        e = self.bond_emb(mol.edge_attr)
        for layer, norm in zip(self.layers, self.norms):
            h_new = F.relu(norm(layer(h, mol.edge_index, e)))
            h = h + F.dropout(h_new, self.dropout, self.training)      # residual
        g = torch.cat([global_mean_pool(h, mol.batch), global_max_pool(h, mol.batch)], dim=-1)
        return self.readout(g)


# --------------------------------------------------------------------------- #
# Macro encoder: directional multi-head graph attention over the DDI network
# --------------------------------------------------------------------------- #
class DirectionalGATLayer(nn.Module):
    def __init__(self, in_dim: int, out_dim: int, heads: int, dropout: float):
        super().__init__()
        assert out_dim % heads == 0, "hidden_dim must be divisible by heads"
        self.dropout = dropout
        # attention over predecessors (j -> i) incl. self loop, and over successors (i -> j)
        self.gat_in = GATConv(in_dim, out_dim // heads, heads=heads, dropout=dropout, add_self_loops=True)
        self.gat_out = GATConv(in_dim, out_dim // heads, heads=heads, dropout=dropout, add_self_loops=False)
        self.fuse = nn.Linear(2 * out_dim, out_dim)
        self.skip = nn.Linear(in_dim, out_dim)
        self.norm = nn.LayerNorm(out_dim)

    def forward(self, x: Tensor, edge_index: Tensor) -> Tensor:
        h_in = self.gat_in(x, edge_index)
        h_out = self.gat_out(x, edge_index.flip(0))
        h = self.fuse(torch.cat([h_in, h_out], dim=-1)) + self.skip(x)
        return F.dropout(F.elu(self.norm(h)), self.dropout, self.training)


class MacroDGAT(nn.Module):
    def __init__(self, in_dim: int, hidden: int, layers: int, heads: int, dropout: float):
        super().__init__()
        dims = [in_dim] + [hidden] * layers
        self.layers = nn.ModuleList(DirectionalGATLayer(dims[i], dims[i + 1], heads, dropout)
                                    for i in range(layers))

    def forward(self, x: Tensor, edge_index: Tensor) -> Tensor:
        for layer in self.layers:
            x = layer(x, edge_index)
        return x


# --------------------------------------------------------------------------- #
# Decoder + full model
# --------------------------------------------------------------------------- #
class PairDecoder(nn.Module):
    """Symmetric pair scorer. 'dot' = <z_i, z_j>; 'mlp' = MLP([z_i*z_j, |z_i-z_j|])."""

    def __init__(self, dim: int, kind: str, dropout: float):
        super().__init__()
        self.kind = kind
        if kind == "mlp":
            self.net = nn.Sequential(nn.Linear(2 * dim, dim), nn.ReLU(), nn.Dropout(dropout), nn.Linear(dim, 1))
        elif kind == "dot":
            self.scale = nn.Parameter(torch.tensor(1.0 / dim ** 0.5))
            self.bias = nn.Parameter(torch.zeros(1))
        else:
            raise ValueError(f"unknown decoder '{kind}'")

    def forward(self, z: Tensor, pairs: Tensor) -> Tensor:
        zi, zj = z[pairs[0]], z[pairs[1]]
        if self.kind == "dot":
            return (zi * zj).sum(-1) * self.scale + self.bias
        return self.net(torch.cat([zi * zj, (zi - zj).abs()], dim=-1)).squeeze(-1)


class DGATDDI(nn.Module):
    def __init__(self, cfg: ModelConfig):
        super().__init__()
        self.cfg = cfg
        self.micro = MicroEncoder(cfg.chem_dim, cfg.micro_layers, cfg.dropout)
        self.macro = MacroDGAT(cfg.chem_dim, cfg.hidden_dim, cfg.macro_layers, cfg.heads, cfg.dropout)
        self.decoder = PairDecoder(cfg.hidden_dim, cfg.decoder, cfg.dropout)
        self.register_buffer("temperature", torch.ones(1))

    def encode(self, mol: Batch, edge_index: Tensor) -> Tensor:
        """All drugs -> node embeddings z (N, hidden_dim), using `edge_index` for message passing."""
        return self.macro(self.micro(mol), edge_index)

    def decode(self, z: Tensor, pairs: Tensor) -> Tensor:
        return self.decoder(z, pairs)

    def forward(self, mol: Batch, edge_index: Tensor, pairs: Tensor) -> Tensor:
        return self.decode(self.encode(mol, edge_index), pairs)

    def calibrated_proba(self, logits: Tensor) -> Tensor:
        return torch.sigmoid(logits / self.temperature)


# --------------------------------------------------------------------------- #
# Shared I/O helpers (used by train / evaluate / inference)
# --------------------------------------------------------------------------- #
def load_drug_batch(path: Path, device: torch.device | str = "cpu") -> Batch:
    """Stack all molecular graphs into one Batch; graph k <-> node index k."""
    graphs = torch.load(path, weights_only=False)["graphs"]
    return Batch.from_data_list(graphs).to(device)


def load_checkpoint(path: Path, device: torch.device | str = "cpu") -> tuple[DGATDDI, dict]:
    ckpt = torch.load(path, map_location=device, weights_only=False)
    model = DGATDDI(ModelConfig(**ckpt["config"])).to(device)
    model.load_state_dict(ckpt["state_dict"])
    model.eval()
    return model, ckpt


def config_dict(cfg: ModelConfig) -> dict:
    return asdict(cfg)


def count_parameters(model: nn.Module) -> int:
    return sum(p.numel() for p in model.parameters() if p.requires_grad)
