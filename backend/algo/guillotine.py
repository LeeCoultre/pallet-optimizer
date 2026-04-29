"""
Guillotine recursive packer — Python port of src/utils/packColumns.js.

The pallet footprint is recursively split by guillotine cuts.
Each leaf = one box type + one orientation, N tiers high.
"""
from __future__ import annotations
from typing import Dict, List, Optional, Any
from .orientations import get_orientations

EPS = 1e-6
MAX_DEPTH = 3
MAX_CUTS_PER_AXIS = 10
MAX_STAND_DEPTH = 3   # stand zone ≤ 3 cols/rows wide (physical stability)


def _grid_fits(ol: float, ow: float, rect_l: float, rect_w: float):
    return int((rect_l + EPS) / ol), int((rect_w + EPS) / ow)


def _cut_candidates(remaining: Dict[str, Any], length: float) -> List[float]:
    """Multiples of every box dimension that fall strictly inside [0, length]."""
    s: set[float] = set()
    for box in remaining.values():
        if box["qty"] <= 0:
            continue
        L, W, H = box["length"], box["width"], box["height"]
        for ori in get_orientations(L, W, H, box.get("allowed_orientations")):
            ol, ow = ori[0], ori[1]
            for step in (ol, ow):
                k = 1
                while True:
                    v = round(k * step * 100) / 100
                    if v >= length - EPS:
                        break
                    if v > EPS:
                        s.add(v)
                    k += 1
    arr = sorted(s)
    if len(arr) > MAX_CUTS_PER_AXIS:
        step = len(arr) / MAX_CUTS_PER_AXIS
        reduced: set[float] = set()
        for i in range(MAX_CUTS_PER_AXIS):
            reduced.add(arr[int(i * step)])
        arr = sorted(reduced)
    return arr


def _pack_leaf(rect: Dict, remaining: Dict[str, Any], max_z: float) -> Optional[Dict]:
    """Best single-type, single-orientation leaf for this rect."""
    best: Optional[Dict] = None
    rx, ry, rl, rw = rect["x"], rect["y"], rect["l"], rect["w"]
    for type_id, box in remaining.items():
        qty = box["qty"]
        if qty <= 0:
            continue
        L, W, H = box["length"], box["width"], box["height"]
        for ori in get_orientations(L, W, H, box.get("allowed_orientations")):
            ol, ow, oh, kind = ori
            cols, rows = _grid_fits(ol, ow, rl, rw)
            if cols < 1 or rows < 1:
                continue
            if kind == "stand" and min(cols, rows) > MAX_STAND_DEPTH:
                continue
            n_tier = cols * rows
            k_max = min(
                int((max_z + EPS) / oh),
                int(qty / n_tier),
            )
            if k_max < 1:
                continue
            total = k_max * n_tier
            z_top = k_max * oh
            if best is None or total > best["total"] or (
                total == best["total"] and z_top < best["z_top"]
            ):
                best = {
                    "kind": "leaf",
                    "rect": rect,
                    "type_id": type_id,
                    "ori": ori,          # (l, w, h, kind)
                    "cols": cols,
                    "rows": rows,
                    "tiers": k_max,
                    "n_tier": n_tier,
                    "total": total,
                    "z_top": z_top,
                    "used": {type_id: total},
                }
    return best


def _pack_rect(rect: Dict, remaining: Dict[str, Any], max_z: float,
               depth: int, max_kontovka: int = 3) -> Optional[Dict]:
    """Recursive guillotine: try leaf, then all splits up to MAX_DEPTH."""
    # Quick feasibility check
    any_fits = False
    for box in remaining.values():
        if box["qty"] <= 0:
            continue
        L, W, H = box["length"], box["width"], box["height"]
        for ori in get_orientations(L, W, H, box.get("allowed_orientations")):
            if ori[0] <= rect["l"] + EPS and ori[1] <= rect["w"] + EPS and ori[2] <= max_z + EPS:
                any_fits = True
                break
        if any_fits:
            break
    if not any_fits:
        return None

    best = _pack_leaf(rect, remaining, max_z)

    if depth >= MAX_DEPTH:
        return best

    for axis in ("x", "y"):
        length = rect["l"] if axis == "x" else rect["w"]
        cuts = _cut_candidates(remaining, length)
        for cut in cuts:
            if axis == "x":
                r1 = {"x": rect["x"], "y": rect["y"], "l": cut, "w": rect["w"]}
                r2 = {"x": rect["x"] + cut, "y": rect["y"], "l": length - cut, "w": rect["w"]}
            else:
                r1 = {"x": rect["x"], "y": rect["y"], "l": rect["l"], "w": cut}
                r2 = {"x": rect["x"], "y": rect["y"] + cut, "l": rect["l"], "w": length - cut}

            for first, second in [(r1, r2), (r2, r1)]:
                p1 = _pack_rect(first, remaining, max_z, depth + 1, max_kontovka)
                if not p1:
                    continue
                rem_after = {k: {**v, "qty": v["qty"] - p1["used"].get(k, 0)}
                             for k, v in remaining.items()}
                p2 = _pack_rect(second, rem_after, max_z, depth + 1, max_kontovka)
                total = p1["total"] + (p2["total"] if p2 else 0)
                if best is None or total > best["total"]:
                    used = dict(p1["used"])
                    if p2:
                        for k, v in p2["used"].items():
                            used[k] = used.get(k, 0) + v
                    best = {
                        "kind": "split",
                        "axis": axis,
                        "cut": cut,
                        "children": [p1, p2] if p2 else [p1],
                        "total": total,
                        "used": used,
                    }
    return best


def _flatten_leaves(node: Optional[Dict], out: list | None = None) -> List[Dict]:
    if out is None:
        out = []
    if node is None:
        return out
    if node["kind"] == "leaf":
        out.append(node)
    elif node["kind"] == "split":
        for c in node["children"]:
            _flatten_leaves(c, out)
    return out


def _materialize_leaf(leaf: Dict, zone_id: str, layer_idx: int) -> List[Dict]:
    rect = leaf["rect"]
    ol, ow, oh, kind = leaf["ori"]
    cols, rows, tiers = leaf["cols"], leaf["rows"], leaf["tiers"]
    type_id = leaf["type_id"]
    out = []
    pb_idx = 0
    for k in range(tiers):
        for r in range(rows):
            for c in range(cols):
                out.append({
                    "type_id": type_id,
                    "x": rect["x"] + c * ol,
                    "y": rect["y"] + r * ow,
                    "z": k * oh,
                    "l": ol, "w": ow, "h": oh,
                    "ori_kind": kind,
                    "layer_index": layer_idx,   # 1-based zone/layer index
                    "zone_id": zone_id,
                    "_pb_idx": pb_idx,
                })
                pb_idx += 1
    return out


def pack_columns(boxes_by_id: Dict[str, Any], quantities: Dict[str, int],
                 pallet_l: float, pallet_w: float, max_z: float,
                 overhang_pct: float = 0.0,
                 max_kontovka: int = 3) -> Optional[Dict]:
    """
    Main entry: returns column-hybrid result or None.
    boxes_by_id: {id: {length, width, height, allowed_orientations, ...}}
    quantities:  {id: int}
    """
    rect_l = pallet_l * (1 + overhang_pct)
    rect_w = pallet_w * (1 + overhang_pct)
    rect = {"x": 0, "y": 0, "l": rect_l, "w": rect_w}

    remaining = {
        k: {**boxes_by_id[k], "qty": v}
        for k, v in quantities.items()
        if v > 0 and k in boxes_by_id
    }
    if not remaining:
        return None

    tree = _pack_rect(rect, remaining, max_z, 0, max_kontovka)
    if not tree:
        return None

    leaves = _flatten_leaves(tree)
    if not leaves:
        return None

    # Assign zone IDs
    for i, leaf in enumerate(leaves):
        leaf["zone_id"] = chr(65 + i)

    # Materialize boxes — all at z=0 base (tiers handled inside materialize)
    placed_raw = []
    for i, leaf in enumerate(leaves):
        placed_raw.extend(_materialize_leaf(leaf, leaf["zone_id"], i + 1))

    # Assign unique IDs
    placed_boxes = []
    for i, p in enumerate(placed_raw):
        placed_boxes.append({**p, "id": f"pb_{i:05d}"})

    # Build zone result objects
    zones = []
    for leaf in leaves:
        ol, ow, oh, kind = leaf["ori"]
        zones.append({
            "id": leaf["zone_id"],
            "rect": leaf["rect"],
            "type_id": leaf["type_id"],
            "orientation": {"l": ol, "w": ow, "h": oh, "kind": kind},
            "grid": {"cols": leaf["cols"], "rows": leaf["rows"]},
            "tiers": leaf["tiers"],
            "boxes": leaf["total"],
            "z_top": leaf["z_top"],
        })

    total_height = max((l["z_top"] for l in leaves), default=0.0)
    used = tree.get("used", {})
    unplaced = {k: max(0, quantities.get(k, 0) - used.get(k, 0))
                for k in quantities if quantities[k] > 0}

    return {
        "mode": "column-hybrid",
        "zones": zones,
        "placed_boxes": placed_boxes,
        "total_boxes": tree["total"],
        "total_height": total_height,
        "used": used,
        "unplaced": unplaced,
    }
