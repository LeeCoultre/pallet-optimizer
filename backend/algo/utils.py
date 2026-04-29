"""
Geometry helpers — port of packing.js utility functions.
"""
from __future__ import annotations
import math
from typing import List, Dict, Any

EPS = 1e-6
MIN_SUPPORT = 0.7


def rect_overlap_area(ax: float, ay: float, al: float, aw: float,
                      bx: float, by: float, bl: float, bw: float) -> float:
    ox = min(ax + al, bx + bl) - max(ax, bx)
    oy = min(ay + aw, by + bw) - max(ay, by)
    if ox <= EPS or oy <= EPS:
        return 0.0
    return ox * oy


def support_fraction(pos: Dict[str, float], placed: List[Dict[str, float]],
                     current_z: float) -> float:
    """Fraction of pos's footprint that is supported by boxes below it."""
    if current_z < EPS:
        return 1.0
    box_area = pos["l"] * pos["w"]
    if box_area < EPS:
        return 1.0
    covered = 0.0
    for p in placed:
        if abs(p["z"] + p["h"] - current_z) > 1e-3:
            continue
        covered += rect_overlap_area(pos["x"], pos["y"], pos["l"], pos["w"],
                                     p["x"], p["y"], p["l"], p["w"])
    return covered / box_area


def all_supported(positions: List[Dict], placed: List[Dict], current_z: float) -> bool:
    if current_z < EPS:
        return True
    return all(support_fraction(p, placed, current_z) >= MIN_SUPPORT for p in positions)


def centered_subset(positions: List[Dict], n: int,
                    pallet_l: float, pallet_w: float) -> List[Dict]:
    """Return n positions closest to pallet center."""
    if n >= len(positions):
        return list(positions)
    cx, cy = pallet_l / 2, pallet_w / 2
    ranked = sorted(
        positions,
        key=lambda p: math.hypot(p["x"] + p["l"] / 2 - cx, p["y"] + p["w"] / 2 - cy)
    )
    return ranked[:n]
