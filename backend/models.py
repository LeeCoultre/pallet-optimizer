from __future__ import annotations
from typing import Optional, Literal, Dict, List, Any
from pydantic import BaseModel, Field


# ── Box / Pallet input ────────────────────────────────────────────

class BoxInput(BaseModel):
    id: str
    name: str = ""
    length: float
    width: float
    height: float
    quantity: int
    color: str = "#888888"
    allowed_orientations: List[Literal["flat", "stand"]] = ["flat", "stand"]
    weight_kg: Optional[float] = None


class PalletConfig(BaseModel):
    length: float = 120.0
    width: float = 80.0
    pallet_height: float = 14.4
    max_total_height: float = 180.0

    @property
    def max_stack_height(self) -> float:
        return self.max_total_height - self.pallet_height


class ZoneDefinition(BaseModel):
    id: str
    rect: Dict[str, float]   # {x, y, l, w}
    box_ids: List[str]


class ForcedGrid(BaseModel):
    """Override the natural packing grid for a specific box type."""
    cols: int
    rows: int
    box_l: float   # box footprint dimension along pallet length axis
    box_w: float   # box footprint dimension along pallet width axis


class FixedObstacle(BaseModel):
    """A locked region of the pallet — boxes already physically placed.
    The packer treats these as immovable: new boxes cannot overlap, but
    can rest ON TOP of them (they count as supporters)."""
    x: float
    y: float
    z: float
    l: float
    w: float
    h: float
    type_id: Optional[str] = None  # for color rendering


class PackOptions(BaseModel):
    overhang_pct: float = 0.0
    max_kontovka_columns: int = 3
    zones: List[ZoneDefinition] = []
    preferred_mode: Literal["auto", "guillotine", "layered", "cpsat"] = "auto"
    """Algorithm mode:
      • auto: tries layered + guillotine, picks best (fast, ≈0.2 s)
      • guillotine: column-hybrid only
      • layered: zoned-columns + strip-clean variants
      • cpsat: provably-optimal CP-SAT solver (slow, ≈1–60 s)
    """
    forced_grids: Optional[Dict[str, ForcedGrid]] = None
    """Map of box_id → ForcedGrid, bypassing grid auto-detection for that type."""
    cpsat_time_limit_s: float = 30.0
    """Time budget for CP-SAT solver. Returns best-found if not optimal in time."""
    fixed_obstacles: List[FixedObstacle] = []
    """Locked boxes from previous Optimize runs (CP-SAT mode only).
    Pack new boxes around them, may use them as supporters."""


class PackRequest(BaseModel):
    boxes: List[BoxInput]
    pallet: PalletConfig = Field(default_factory=PalletConfig)
    options: PackOptions = Field(default_factory=PackOptions)


# ── Packing result ────────────────────────────────────────────────

class Orientation(BaseModel):
    l: float
    w: float
    h: float
    kind: Literal["flat", "stand"]


class PlacedBox(BaseModel):
    id: str
    type_id: str
    x: float
    y: float
    z: float
    l: float
    w: float
    h: float
    ori_kind: Literal["flat", "stand"]
    layer_index: int
    zone_id: Optional[str] = None
    support_fraction: float = 1.0


class ZoneDesc(BaseModel):
    label: str
    text: str


class LayerDescription(BaseModel):
    headline: str
    body: str
    zones: List[ZoneDesc] = []


class LayerRecord(BaseModel):
    index: int
    z_bottom: float
    z_top: float
    kind: Literal["pure", "half-split", "tri-split", "mixed-edge", "center-cap"]
    type_breakdown: Dict[str, int]
    description: LayerDescription
    count: int


class ZoneResult(BaseModel):
    id: str
    rect: Dict[str, float]
    type_id: str
    orientation: Orientation
    grid: Dict[str, int]
    tiers: int
    boxes: int
    z_top: float


class PackStats(BaseModel):
    total_boxes: int
    requested: int
    layer_count: int
    total_height: float
    fill_pct: float
    efficiency: float
    unplaced: Dict[str, int]
    mode: str


class PackResponse(BaseModel):
    mode: Literal["column-hybrid", "layered"]
    placed_boxes: List[PlacedBox]
    layers: List[LayerRecord]
    zones: List[ZoneResult]
    stats: PackStats


# ── Single-layer (Layer Builder mode) ────────────────────────────

class SingleLayerBox(BaseModel):
    """Minimal box spec for single-layer endpoint."""
    id: str
    name: str = ""
    length: float
    width: float
    height: float
    allowed_orientations: List[Literal["flat", "stand"]] = ["flat", "stand"]


class SingleLayerRequest(BaseModel):
    box: SingleLayerBox
    pallet: PalletConfig = Field(default_factory=PalletConfig)
    current_z: float = 0.0
    max_kontovka: int = 3
    overhang_pct: float = 0.05


class SingleLayerResponse(BaseModel):
    positions: List[PlacedBox]
    layer_h: float
    count: int
    kind: Literal["pure", "mixed-edge"]
    headline: str
    flat_count: int = 0
    stand_count: int = 0


# ── xlsx import ───────────────────────────────────────────────────

class ImportedBox(BaseModel):
    name: str
    length: float
    width: float
    height: float
    max_per_pallet: Optional[int] = None


class ImportResponse(BaseModel):
    boxes_found: int
    boxes: List[ImportedBox]
    warnings: List[str]
