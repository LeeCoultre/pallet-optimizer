"""
Port of orientations() from src/utils/packColumns.js
Returns up to 6 unique (l, w, h, kind) tuples for a box.
"""
from __future__ import annotations
from typing import List, Tuple

Orientation = Tuple[float, float, float, str]  # (l, w, h, kind)


def get_orientations(length: float, width: float, height: float,
                     allowed: List[str] | None = None) -> List[Orientation]:
    """All unique orientations of a box (l×w×h).
    kind = 'flat' (H stays as height) or 'stand' (rotated so H is footprint dim).
    """
    L, W, H = (round(x * 100) / 100 for x in (length, width, height))
    allowed = allowed or ["flat", "stand"]

    raw: List[Orientation] = []
    if "flat" in allowed:
        raw += [
            (L, W, H, "flat"),
            (W, L, H, "flat"),
        ]
    if "stand" in allowed:
        raw += [
            (L, H, W, "stand"),
            (H, L, W, "stand"),
            (W, H, L, "stand"),
            (H, W, L, "stand"),
        ]

    seen: set[Tuple[float, float, float]] = set()
    out: List[Orientation] = []
    for o in raw:
        rl, rw, rh = round(o[0] * 100) / 100, round(o[1] * 100) / 100, round(o[2] * 100) / 100
        key = (rl, rw, rh)
        if key in seen:
            continue
        seen.add(key)
        out.append((rl, rw, rh, o[3]))
    return out


def flat_orientations(length: float, width: float, height: float,
                      allowed: List[str] | None = None) -> List[Orientation]:
    return [o for o in get_orientations(length, width, height, allowed) if o[3] == "flat"]
