"""
Layer-by-layer packer — Python port of src/utils/packing.js.
Layers: pure → half-split → mixed-edge → center-cap.

Also provides pack_gap_fill_layered: a newer packer that fills each layer
width+length first (horizontal slabs), with gap-fill for right-side strips.
Priority: tallest box first, then most numerous.
"""
from __future__ import annotations
import math
from typing import Dict, List, Optional, Any, Tuple
from .orientations import get_orientations, flat_orientations
from .utils import support_fraction, all_supported, centered_subset, EPS

HEIGHT_MATCH_TOL = 0.01
MIN_SUPPORT = 0.7


# ── Grid helpers ──────────────────────────────────────────────────

def _best_pure_grid(box: Dict, rect_l: float, rect_w: float) -> Optional[Dict]:
    """Best flat-orientation grid for a single box type."""
    best = None
    L, W, H = box["length"], box["width"], box["height"]
    for ori in flat_orientations(L, W, H, box.get("allowed_orientations")):
        ol, ow, oh = ori[0], ori[1], ori[2]
        cols = int((rect_l + EPS) / ol)
        rows = int((rect_w + EPS) / ow)
        count = cols * rows
        if count == 0:
            continue
        if best is None or count > best["count"]:
            best = {"cols": cols, "rows": rows, "count": count,
                    "box_l": ol, "box_w": ow, "box_h": oh, "ori_kind": "flat"}
    return best


def _grid_positions(grid: Dict, rect_x: float, rect_y: float, type_id: str,
                    z: float) -> List[Dict]:
    out = []
    for r in range(grid["rows"]):
        for c in range(grid["cols"]):
            out.append({
                "type_id": type_id,
                "x": rect_x + c * grid["box_l"],
                "y": rect_y + r * grid["box_w"],
                "z": z,
                "l": grid["box_l"], "w": grid["box_w"], "h": grid["box_h"],
                "ori_kind": grid["ori_kind"],
            })
    return out


# ── Mixed-edge ────────────────────────────────────────────────────

def _best_mixed_edge(box: Dict, rect_l: float, rect_w: float,
                     max_boxes: float = float("inf"),
                     max_kontovka: int = 3) -> Optional[Dict]:
    """flat area + narrow strip of stand (kontovka), same type."""
    L, W, H = box["length"], box["width"], box["height"]
    flat_oris = flat_orientations(L, W, H, box.get("allowed_orientations"))
    stand_oris = [o for o in get_orientations(L, W, H, box.get("allowed_orientations"))
                  if o[3] == "stand"]
    if not stand_oris:
        return None

    best = None

    def _consider(positions, total, flat_count, stand_count,
                  flat_ori, stand_ori, meta):
        nonlocal best
        if total > max_boxes:
            return
        layer_h = max(flat_ori[2], stand_ori[2])
        if best is None or total > best["total"]:
            best = {
                "total": total,
                "layer_h": layer_h,
                "flat_count": flat_count,
                "stand_count": stand_count,
                "flat_ori": flat_ori,
                "stand_ori": stand_ori,
                "positions": positions,
                **meta,
            }

    for fo in flat_oris:
        fl, fw, fh = fo[0], fo[1], fo[2]
        cols = int((rect_l + EPS) / fl)
        rows = int((rect_w + EPS) / fw)
        if cols == 0 or rows == 0:
            continue
        pure_count = cols * rows

        # Variant A: drop columns (x-axis)
        for drop in range(1, cols + 1):
            if drop > max_kontovka:
                break
            flat_cols = cols - drop
            flat_count = flat_cols * rows
            flat_span_l = flat_cols * fl
            gap_l = rect_l - flat_span_l
            if gap_l < EPS:
                continue
            for so in stand_oris:
                sl, sw, sh = so[0], so[1], so[2]
                s_cols = int((gap_l + EPS) / sl)
                s_rows = int((rect_w + EPS) / sw)
                s_count = s_cols * s_rows
                if s_count < 2:
                    continue
                total = flat_count + s_count
                if total <= pure_count:
                    continue
                positions = []
                for r in range(rows):
                    for c in range(flat_cols):
                        positions.append({
                            "x": c * fl, "y": r * fw,
                            "l": fl, "w": fw, "h": fh, "ori_kind": "flat",
                        })
                for r in range(s_rows):
                    for c in range(s_cols):
                        positions.append({
                            "x": flat_span_l + c * sl, "y": r * sw,
                            "l": sl, "w": sw, "h": sh, "ori_kind": "stand",
                        })
                _consider(positions, total, flat_count, s_count, fo, so,
                          {"axis": "x", "drop": drop, "flat_cols": flat_cols,
                           "flat_rows": rows, "s_cols": s_cols, "s_rows": s_rows})

        # Variant B: drop rows (y-axis)
        for drop in range(1, rows + 1):
            if drop > max_kontovka:
                break
            flat_rows = rows - drop
            flat_count = cols * flat_rows
            flat_span_w = flat_rows * fw
            gap_w = rect_w - flat_span_w
            if gap_w < EPS:
                continue
            for so in stand_oris:
                sl, sw, sh = so[0], so[1], so[2]
                s_cols = int((rect_l + EPS) / sl)
                s_rows = int((gap_w + EPS) / sw)
                s_count = s_cols * s_rows
                if s_count < 2:
                    continue
                total = flat_count + s_count
                if total <= pure_count:
                    continue
                positions = []
                for r in range(flat_rows):
                    for c in range(cols):
                        positions.append({
                            "x": c * fl, "y": r * fw,
                            "l": fl, "w": fw, "h": fh, "ori_kind": "flat",
                        })
                for r in range(s_rows):
                    for c in range(s_cols):
                        positions.append({
                            "x": c * sl, "y": flat_span_w + r * sw,
                            "l": sl, "w": sw, "h": sh, "ori_kind": "stand",
                        })
                _consider(positions, total, flat_count, s_count, fo, so,
                          {"axis": "y", "drop": drop, "flat_cols": cols,
                           "flat_rows": flat_rows, "s_cols": s_cols, "s_rows": s_rows})

    return best


# ── Half-split ────────────────────────────────────────────────────

def _best_half_split(box_a: Dict, box_b: Dict,
                     qty_a: int, qty_b: int,
                     rect_l: float, rect_w: float) -> Optional[Dict]:
    """Two types with matching height, placed side-by-side."""
    if abs(box_a["height"] - box_b["height"]) > HEIGHT_MATCH_TOL:
        return None
    layer_h = max(box_a["height"], box_b["height"])
    best = None

    def _build(left_box, right_box, left_qty, right_qty):
        nonlocal best
        La, Wa, Ha = left_box["length"], left_box["width"], left_box["height"]
        Lb, Wb, Hb = right_box["length"], right_box["width"], right_box["height"]
        left_oris = flat_orientations(La, Wa, Ha, left_box.get("allowed_orientations"))
        right_oris = flat_orientations(Lb, Wb, Hb, right_box.get("allowed_orientations"))
        for lo in left_oris:
            for ro in right_oris:
                for axis in ("x", "y"):
                    span = rect_l if axis == "x" else rect_w
                    cross = rect_w if axis == "x" else rect_l
                    lo_span = lo[0] if axis == "x" else lo[1]
                    lo_cross = lo[1] if axis == "x" else lo[0]
                    ro_span = ro[0] if axis == "x" else ro[1]
                    ro_cross = ro[1] if axis == "x" else ro[0]

                    lc_fits = int((cross + EPS) / lo_cross)
                    rc_fits = int((cross + EPS) / ro_cross)
                    if lc_fits == 0 or rc_fits == 0:
                        continue

                    k_max = int((span + EPS) / lo_span)
                    for k in range(1, k_max + 1):
                        left_span_total = k * lo_span
                        right_span_avail = span - left_span_total
                        if right_span_avail < ro_span - EPS:
                            continue
                        right_k = int((right_span_avail + EPS) / ro_span)
                        if right_k <= 0:
                            continue

                        left_count = k * lc_fits
                        right_count = right_k * rc_fits
                        if left_count > left_qty or right_count > right_qty:
                            continue

                        total = left_count + right_count
                        if best and total <= best["total"]:
                            continue

                        positions = []
                        for ks in range(k):
                            for cs in range(lc_fits):
                                positions.append({
                                    "type_id": left_box["id"],
                                    "x": (ks * lo_span if axis == "x" else cs * lo_cross),
                                    "y": (cs * lo_cross if axis == "x" else ks * lo_span),
                                    "l": lo[0], "w": lo[1], "h": lo[2],
                                    "ori_kind": lo[3],
                                })
                        for ks in range(right_k):
                            for cs in range(rc_fits):
                                positions.append({
                                    "type_id": right_box["id"],
                                    "x": (left_span_total + ks * ro_span if axis == "x" else cs * ro_cross),
                                    "y": (cs * ro_cross if axis == "x" else left_span_total + ks * ro_span),
                                    "l": ro[0], "w": ro[1], "h": ro[2],
                                    "ori_kind": ro[3],
                                })
                        best = {
                            "total": total, "layer_h": layer_h, "axis": axis, "k": k,
                            "left_t": left_box["id"], "right_t": right_box["id"],
                            "left_count": left_count, "right_count": right_count,
                            "left_cols": k if axis == "x" else lc_fits,
                            "left_rows": lc_fits if axis == "x" else k,
                            "right_cols": right_k if axis == "x" else rc_fits,
                            "right_rows": rc_fits if axis == "x" else right_k,
                            "left_span_total": left_span_total,
                            "left_ori": lo, "right_ori": ro,
                            "positions": positions,
                        }

    _build(box_a, box_b, qty_a, qty_b)
    _build(box_b, box_a, qty_b, qty_a)
    return best


def _best_half_split_v2(
    box_a: Dict, box_b: Dict,
    qty_a: int, qty_b: int,
    rect_l: float, rect_w: float,
    max_kontovka: int = 3,
) -> Optional[Dict]:
    """Two-zone split supporting mixed orientations (flat and/or stand).

    Unlike _best_half_split this version:
    - Considers stand (kontovka) orientations in either zone
    - Does not require matching box heights; layer_h = max(left_h, right_h)
    - Handles same-type splits (box_a.id == box_b.id): total <= qty_a
    - Enforces max_kontovka strips for any stand-orientation zone
    """
    same_type = box_a["id"] == box_b["id"]
    best: Optional[Dict] = None

    def _build(left_box: Dict, right_box: Dict, left_qty: int, right_qty: int) -> None:
        nonlocal best
        La, Wa = left_box["length"], left_box["width"]
        Lb, Wb = right_box["length"], right_box["width"]
        left_oris = get_orientations(La, Wa, left_box["height"],
                                     left_box.get("allowed_orientations"))
        right_oris = get_orientations(Lb, Wb, right_box["height"],
                                      right_box.get("allowed_orientations"))
        for lo in left_oris:
            for ro in right_oris:
                layer_h = max(lo[2], ro[2])
                for axis in ("x", "y"):
                    span   = rect_l if axis == "x" else rect_w
                    cross  = rect_w if axis == "x" else rect_l
                    lo_span  = lo[0] if axis == "x" else lo[1]
                    lo_cross = lo[1] if axis == "x" else lo[0]
                    ro_span  = ro[0] if axis == "x" else ro[1]
                    ro_cross = ro[1] if axis == "x" else ro[0]

                    lc_fits = int((cross + EPS) / lo_cross)
                    rc_fits = int((cross + EPS) / ro_cross)
                    if lc_fits == 0 or rc_fits == 0:
                        continue

                    k_max = int((span + EPS) / lo_span)
                    for k in range(1, k_max + 1):
                        if lo[3] == "stand" and k > max_kontovka:
                            break
                        left_span_total = k * lo_span
                        right_span_avail = span - left_span_total
                        if right_span_avail < ro_span - EPS:
                            continue
                        right_k = int((right_span_avail + EPS) / ro_span)
                        if right_k <= 0:
                            continue
                        if ro[3] == "stand" and right_k > max_kontovka:
                            right_k = max_kontovka

                        left_count  = k       * lc_fits
                        right_count = right_k * rc_fits

                        if same_type:
                            if left_count + right_count > left_qty:
                                continue
                        else:
                            if left_count > left_qty or right_count > right_qty:
                                continue

                        total = left_count + right_count
                        if best and total <= best["total"]:
                            continue

                        positions = []
                        for ks in range(k):
                            for cs in range(lc_fits):
                                positions.append({
                                    "type_id": left_box["id"],
                                    "x": (ks * lo_span  if axis == "x" else cs * lo_cross),
                                    "y": (cs * lo_cross if axis == "x" else ks * lo_span),
                                    "l": lo[0], "w": lo[1], "h": lo[2],
                                    "ori_kind": lo[3],
                                })
                        for ks in range(right_k):
                            for cs in range(rc_fits):
                                positions.append({
                                    "type_id": right_box["id"],
                                    "x": (left_span_total + ks * ro_span  if axis == "x" else cs * ro_cross),
                                    "y": (cs * ro_cross if axis == "x" else left_span_total + ks * ro_span),
                                    "l": ro[0], "w": ro[1], "h": ro[2],
                                    "ori_kind": ro[3],
                                })
                        best = {
                            "total": total, "layer_h": layer_h, "axis": axis, "k": k,
                            "left_t": left_box["id"], "right_t": right_box["id"],
                            "left_count": left_count, "right_count": right_count,
                            "left_span_total": left_span_total,
                            "left_ori": lo, "right_ori": ro,
                            "positions": positions,
                        }

    _build(box_a, box_b, qty_a, qty_b)
    if not same_type:
        _build(box_b, box_a, qty_b, qty_a)
    return best


def _best_tri_split(
    box_a: Dict, box_b: Dict,
    qty_a: int, qty_b: int,
    rect_l: float, rect_w: float,
    max_kontovka: int = 3,
) -> Optional[Dict]:
    """Three-zone split across one axis.

    Divides the pallet into 3 adjacent strips. Each zone gets one
    (box_type, orientation) assignment. Both box_a and box_b may appear
    in multiple zones. Stand zones are limited to max_kontovka strips.
    """
    same_type = box_a["id"] == box_b["id"]

    # Zone candidates: (box, orientation_tuple)
    zone_cands: List[Tuple] = []
    for box in ([box_a] if same_type else [box_a, box_b]):
        for ori in get_orientations(box["length"], box["width"], box["height"],
                                    box.get("allowed_orientations")):
            zone_cands.append((box, ori))
    if not same_type:
        for ori in get_orientations(box_b["length"], box_b["width"], box_b["height"],
                                    box_b.get("allowed_orientations")):
            if (box_b, ori) not in zone_cands:
                zone_cands.append((box_b, ori))

    # Deduplicate
    seen: set = set()
    unique_cands: List[Tuple] = []
    for box, ori in zone_cands:
        key = (box["id"],) + ori
        if key not in seen:
            seen.add(key)
            unique_cands.append((box, ori))

    best: Optional[Dict] = None

    for axis in ("x", "y"):
        span  = rect_l if axis == "x" else rect_w
        cross = rect_w if axis == "x" else rect_l

        for za_box, za_ori in unique_cands:
            za_s = za_ori[0] if axis == "x" else za_ori[1]
            za_c = za_ori[1] if axis == "x" else za_ori[0]
            za_cf = int((cross + EPS) / za_c)
            if za_cf == 0 or za_s < EPS:
                continue

            for zb_box, zb_ori in unique_cands:
                zb_s = zb_ori[0] if axis == "x" else zb_ori[1]
                zb_c = zb_ori[1] if axis == "x" else zb_ori[0]
                zb_cf = int((cross + EPS) / zb_c)
                if zb_cf == 0 or zb_s < EPS:
                    continue

                for zc_box, zc_ori in unique_cands:
                    zc_s = zc_ori[0] if axis == "x" else zc_ori[1]
                    zc_c = zc_ori[1] if axis == "x" else zc_ori[0]
                    zc_cf = int((cross + EPS) / zc_c)
                    if zc_cf == 0 or zc_s < EPS:
                        continue

                    k1_max = min(int((span + EPS) / za_s),
                                 max_kontovka if za_ori[3] == "stand" else 9999)
                    for k1 in range(1, k1_max + 1):
                        s1 = k1 * za_s
                        if span - s1 < zb_s + zc_s - EPS:
                            break

                        k2_max = min(int((span - s1 + EPS) / zb_s),
                                     max_kontovka if zb_ori[3] == "stand" else 9999)
                        for k2 in range(1, k2_max + 1):
                            s2 = s1 + k2 * zb_s
                            if span - s2 < zc_s - EPS:
                                break
                            k3 = int((span - s2 + EPS) / zc_s)
                            if k3 == 0:
                                break
                            if zc_ori[3] == "stand" and k3 > max_kontovka:
                                k3 = max_kontovka

                            za_cnt = k1 * za_cf
                            zb_cnt = k2 * zb_cf
                            zc_cnt = k3 * zc_cf

                            used_a = (za_cnt * (za_box["id"] == box_a["id"])
                                      + zb_cnt * (zb_box["id"] == box_a["id"])
                                      + zc_cnt * (zc_box["id"] == box_a["id"]))
                            used_b = (za_cnt * (za_box["id"] == box_b["id"])
                                      + zb_cnt * (zb_box["id"] == box_b["id"])
                                      + zc_cnt * (zc_box["id"] == box_b["id"]))
                            if used_a > qty_a or used_b > qty_b:
                                continue

                            total = za_cnt + zb_cnt + zc_cnt
                            if best and total <= best["total"]:
                                continue

                            layer_h = max(za_ori[2], zb_ori[2], zc_ori[2])
                            positions = []
                            for ki in range(k1):
                                for ci in range(za_cf):
                                    positions.append({
                                        "type_id": za_box["id"],
                                        "x": (ki * za_s  if axis == "x" else ci * za_c),
                                        "y": (ci * za_c  if axis == "x" else ki * za_s),
                                        "l": za_ori[0], "w": za_ori[1], "h": za_ori[2],
                                        "ori_kind": za_ori[3],
                                    })
                            for ki in range(k2):
                                for ci in range(zb_cf):
                                    positions.append({
                                        "type_id": zb_box["id"],
                                        "x": (s1 + ki * zb_s  if axis == "x" else ci * zb_c),
                                        "y": (ci * zb_c  if axis == "x" else s1 + ki * zb_s),
                                        "l": zb_ori[0], "w": zb_ori[1], "h": zb_ori[2],
                                        "ori_kind": zb_ori[3],
                                    })
                            for ki in range(k3):
                                for ci in range(zc_cf):
                                    positions.append({
                                        "type_id": zc_box["id"],
                                        "x": (s2 + ki * zc_s  if axis == "x" else ci * zc_c),
                                        "y": (ci * zc_c  if axis == "x" else s2 + ki * zc_s),
                                        "l": zc_ori[0], "w": zc_ori[1], "h": zc_ori[2],
                                        "ori_kind": zc_ori[3],
                                    })
                            best = {
                                "total": total, "layer_h": layer_h, "axis": axis,
                                "positions": positions,
                            }

    return best


# ── Layer descriptions ────────────────────────────────────────────

def _describe_pure(grid, box_name):
    return {
        "headline": f"{grid['count']} × {box_name}",
        "body": f"Grid {grid['cols']} × {grid['rows']}, flat orientation",
        "zones": [],
    }


def _describe_half_split(hs, name_l, name_r):
    axis_lbl = "along pallet length" if hs["axis"] == "x" else "along pallet width"
    sp = round(hs["left_span_total"] * 10) / 10
    return {
        "headline": f"{hs['total']} boxes: {hs['left_count']} × {name_l} + {hs['right_count']} × {name_r}",
        "body": f"Split {axis_lbl}:",
        "zones": [
            {"label": f"Zone A (0–{sp} cm)", "text": f"{hs['left_count']} × {name_l}, grid {hs['left_cols']}×{hs['left_rows']}"},
            {"label": f"Zone B ({sp} cm →)", "text": f"{hs['right_count']} × {name_r}, grid {hs['right_cols']}×{hs['right_rows']}"},
        ],
    }


def _describe_mixed_edge(me, box_name):
    axis_lbl = "at far end of pallet length" if me["axis"] == "x" else "at far end of pallet width"
    return {
        "headline": f"{me['total']} × {box_name} (mixed layer)",
        "body": f"Main area flat + {me['drop']} column(s) on edge {axis_lbl}",
        "zones": [
            {"label": "Zone A — flat", "text": f"{me['flat_count']} × {box_name}, grid {me['flat_cols']}×{me['flat_rows']}"},
            {"label": "Zone B — on edge", "text": f"{me['stand_count']} × {box_name}, grid {me['s_cols']}×{me['s_rows']}"},
        ],
    }


def _describe_center_cap(box_name, count, cols, rows):
    return {
        "headline": f"{count} × {box_name} (cap layer)",
        "body": f"Centred on pallet, grid {cols} × {rows}, flat",
        "zones": [],
    }


# ── Main entry ────────────────────────────────────────────────────

def pack_layered(boxes_by_id: Dict[str, Any], quantities: Dict[str, int],
                 pallet_l: float, pallet_w: float, max_z: float,
                 overhang_pct: float = 0.0,
                 max_kontovka: int = 3) -> Dict:
    """
    Layer-by-layer packing.
    Returns dict with placed_boxes, layers, stats.
    """
    max_l = pallet_l * (1 + overhang_pct)
    max_w = pallet_w * (1 + overhang_pct)

    remaining = {k: quantities.get(k, 0) for k in quantities}
    placed: List[Dict] = []
    layers: List[Dict] = []
    unplaced: Dict[str, int] = {}
    current_z = 0.0
    pb_counter = 0

    def active_ids():
        return [k for k, v in remaining.items() if v > 0]

    def place(positions, layer_kind, layer_desc, layer_h):
        nonlocal current_z, pb_counter
        layer_idx = len(layers) + 1
        for p in positions:
            tid = p.get("type_id", next(iter(remaining)))
            remaining[tid] -= 1
            placed.append({
                "id": f"pb_{pb_counter:05d}",
                "type_id": tid,
                "x": p["x"], "y": p["y"], "z": current_z,
                "l": p["l"], "w": p["w"], "h": p["h"],
                "ori_kind": p.get("ori_kind", "flat"),
                "layer_index": layer_idx,
                "zone_id": p.get("zone_id"),
                "support_fraction": support_fraction(p, placed, current_z),
            })
            pb_counter += 1

        breakdown = {}
        for p in positions:
            tid = p.get("type_id", "?")
            breakdown[tid] = breakdown.get(tid, 0) + 1

        layers.append({
            "index": layer_idx,
            "z_bottom": current_z,
            "z_top": current_z + layer_h,
            "kind": layer_kind,
            "type_breakdown": breakdown,
            "description": layer_desc,
            "count": len(positions),
        })
        current_z += layer_h

    # ── Phase 1: pure, half-split, mixed-edge ────────────────────
    max_iter = 500
    it = 0
    while active_ids() and it < max_iter:
        it += 1
        candidates = []

        # Pure single-type layers
        for tid in active_ids():
            box = boxes_by_id.get(tid)
            if not box:
                continue
            if current_z + box["height"] > max_z + EPS:
                continue
            grid = _best_pure_grid(box, max_l, max_w)
            if not grid or grid["count"] > remaining[tid]:
                continue
            positions = [
                {**p, "type_id": tid}
                for p in _grid_positions(grid, 0, 0, tid, current_z)
            ]
            if not all_supported(positions, placed, current_z):
                continue
            candidates.append({
                "kind": "pure", "count": grid["count"],
                "height": box["height"], "type": box,
                "grid": grid, "positions": positions,
            })

        # Mixed-edge (final-layer-of-type only)
        for tid in active_ids():
            box = boxes_by_id.get(tid)
            if not box:
                continue
            all_oris_h = [o[2] for o in get_orientations(
                box["length"], box["width"], box["height"],
                box.get("allowed_orientations")
            )]
            if current_z + max(all_oris_h) > max_z + EPS:
                continue
            pure_grid = _best_pure_grid(box, max_l, max_w)
            pure_count = pure_grid["count"] if pure_grid else 0
            me = _best_mixed_edge(box, max_l, max_w,
                                   max_boxes=remaining[tid],
                                   max_kontovka=max_kontovka)
            if not me or me["total"] <= pure_count:
                continue
            if remaining[tid] - me["total"] >= pure_count:
                continue
            if current_z + me["layer_h"] > max_z + EPS:
                continue
            positions = [
                {**p, "type_id": tid, "zone_id": None}
                for p in me["positions"]
            ]
            if not all_supported(positions, placed, current_z):
                continue
            candidates.append({
                "kind": "mixed-edge", "count": me["total"],
                "height": me["layer_h"], "type": box,
                "me": me, "positions": positions,
            })

        # Half-split
        ids = active_ids()
        for i in range(len(ids)):
            for j in range(i + 1, len(ids)):
                ba = boxes_by_id.get(ids[i])
                bb = boxes_by_id.get(ids[j])
                if not ba or not bb:
                    continue
                if current_z + max(ba["height"], bb["height"]) > max_z + EPS:
                    continue
                hs = _best_half_split(ba, bb, remaining[ids[i]], remaining[ids[j]],
                                      max_l, max_w)
                if not hs:
                    continue
                positions = hs["positions"]
                if not all_supported(positions, placed, current_z):
                    continue
                candidates.append({
                    "kind": "half-split", "count": hs["total"],
                    "height": hs["layer_h"], "hs": hs,
                    "positions": positions,
                })

        if not candidates:
            break

        def bulk_score(c):
            if c["kind"] in ("pure", "mixed-edge"):
                tid = c["type"]["id"]
                return remaining[tid] / c["count"]
            hs = c["hs"]
            return min(remaining[hs["left_t"]] / max(hs["left_count"], 1),
                       remaining[hs["right_t"]] / max(hs["right_count"], 1))

        kind_rank = {"pure": 0, "half-split": 1, "mixed-edge": 2}
        candidates.sort(key=lambda c: (-c["count"], -bulk_score(c), kind_rank.get(c["kind"], 9)))
        pick = candidates[0]

        # Build description
        if pick["kind"] == "pure":
            desc = _describe_pure(pick["grid"], pick["type"]["name"])
            breakdown = {pick["type"]["id"]: pick["grid"]["count"]}
        elif pick["kind"] == "mixed-edge":
            desc = _describe_mixed_edge(pick["me"], pick["type"]["name"])
            breakdown = {pick["type"]["id"]: pick["me"]["total"]}
        else:
            hs = pick["hs"]
            tl = boxes_by_id[hs["left_t"]]
            tr = boxes_by_id[hs["right_t"]]
            desc = _describe_half_split(hs, tl["name"], tr["name"])
            breakdown = {hs["left_t"]: hs["left_count"], hs["right_t"]: hs["right_count"]}

        place(pick["positions"], pick["kind"], desc, pick["height"])

    # ── Phase 2: centered cap ────────────────────────────────────
    cap_types = sorted(
        [boxes_by_id[tid] for tid in active_ids() if tid in boxes_by_id],
        key=lambda b: -b["height"]
    )
    for box in cap_types:
        tid = box["id"]
        while remaining.get(tid, 0) > 0:
            if current_z + box["height"] > max_z + EPS:
                unplaced[tid] = unplaced.get(tid, 0) + remaining[tid]
                remaining[tid] = 0
                break
            grid = _best_pure_grid(box, max_l, max_w)
            if not grid:
                unplaced[tid] = unplaced.get(tid, 0) + remaining[tid]
                remaining[tid] = 0
                break
            all_pos = [
                {**p, "type_id": tid}
                for p in _grid_positions(grid, 0, 0, tid, current_z)
            ]
            supported = [p for p in all_pos
                         if support_fraction(p, placed, current_z) >= MIN_SUPPORT]
            if not supported:
                unplaced[tid] = unplaced.get(tid, 0) + remaining[tid]
                remaining[tid] = 0
                break
            to_place = min(remaining[tid], len(supported))
            subset = centered_subset(supported, to_place, max_l, max_w)

            xs = sorted({round(p["x"] * 100) / 100 for p in subset})
            ys = sorted({round(p["y"] * 100) / 100 for p in subset})
            desc = _describe_center_cap(box["name"], to_place, len(xs), len(ys))
            place(subset, "center-cap", desc, box["height"])

    for tid, v in remaining.items():
        if v > 0:
            unplaced[tid] = unplaced.get(tid, 0) + v

    # Stats
    total_height = max((p["z"] + p["h"] for p in placed), default=0.0)
    total_vol = sum(p["l"] * p["w"] * p["h"] for p in placed)
    pallet_vol = pallet_l * pallet_w * max(total_height, 0.001)
    efficiency = total_vol / pallet_vol

    return {
        "placed_boxes": placed,
        "layers": layers,
        "unplaced": unplaced,
        "stats": {
            "total_boxes": len(placed),
            "layer_count": len(layers),
            "total_height": total_height,
            "efficiency": efficiency,
            "unplaced": unplaced,
        },
    }


# ═══════════════════════════════════════════════════════════════════
# Gap-fill layered packer
# ═══════════════════════════════════════════════════════════════════

def _gfl_best_flat_grid(box: Dict, max_l: float, max_w: float) -> Optional[Dict]:
    """Best flat-orientation grid for box on a rect of max_l × max_w."""
    best: Optional[Dict] = None
    L, W, H = box["length"], box["width"], box["height"]
    for ori in flat_orientations(L, W, H, box.get("allowed_orientations")):
        ol, ow, oh = ori[0], ori[1], ori[2]
        cols = int((max_l + EPS) / ol)
        rows = int((max_w + EPS) / ow)
        count = cols * rows
        if count > 0 and (best is None or count > best["count"]):
            best = {"cols": cols, "rows": rows, "box_l": ol, "box_w": ow,
                    "box_h": oh, "count": count, "ori_kind": "flat"}
    return best


def _gfl_fill_strip(strip_x: float, strip_y: float,
                    strip_l: float, strip_w: float,
                    secondary_types: List[str],
                    boxes_by_id: Dict,
                    remaining: Dict[str, int],
                    max_depth: int = 3) -> Tuple[List[Dict], float]:
    """
    Greedily fill a rectangular strip (x, y, l, w) with secondary box types.
    Returns (list_of_positions, max_height_used).
    Recursively fills remaining sub-strips up to max_depth levels.
    """
    if strip_l < EPS or strip_w < EPS or max_depth == 0:
        return [], 0.0

    best: Optional[Dict] = None
    for tid in secondary_types:
        if remaining.get(tid, 0) <= 0:
            continue
        box = boxes_by_id.get(tid)
        if not box:
            continue
        L, W, H = box["length"], box["width"], box["height"]
        for ori in flat_orientations(L, W, H, box.get("allowed_orientations")):
            ol, ow, oh = ori[0], ori[1], ori[2]
            if ol > strip_l + EPS or ow > strip_w + EPS:
                continue
            cols = int((strip_l + EPS) / ol)
            rows = int((strip_w + EPS) / ow)
            cnt = min(cols * rows, remaining[tid])
            if cnt <= 0:
                continue
            # Score: most boxes first, prefer less wasted right-strip
            waste = strip_l - cols * ol
            score = cnt * 1000 - waste
            if best is None or score > best["score"]:
                best = {"tid": tid, "cols": cols, "rows": rows,
                        "ol": ol, "ow": ow, "oh": oh,
                        "cnt": cnt, "waste": waste, "score": score}

    if not best:
        return [], 0.0

    positions: List[Dict] = []
    placed_cnt = 0
    for r in range(best["rows"]):
        for c in range(best["cols"]):
            if placed_cnt >= best["cnt"]:
                break
            positions.append({
                "type_id": best["tid"],
                "x": strip_x + c * best["ol"],
                "y": strip_y + r * best["ow"],
                "l": best["ol"], "w": best["ow"], "h": best["oh"],
                "ori_kind": "flat",
            })
            placed_cnt += 1
        if placed_cnt >= best["cnt"]:
            break

    max_h = best["oh"]

    # Temporarily deduct to avoid over-filling in sub-strips
    remaining[best["tid"]] -= placed_cnt

    # Sub-strip A: right of this fill within the strip
    right_sub_l = strip_l - best["cols"] * best["ol"]
    right_sub_w = best["rows"] * best["ow"]   # same height as what we just placed
    if right_sub_l > EPS and right_sub_w > EPS:
        sub_types = [t for t in secondary_types if t != best["tid"] or remaining.get(t, 0) > 0]
        sub_pos, sub_h = _gfl_fill_strip(
            strip_x + best["cols"] * best["ol"], strip_y,
            right_sub_l, right_sub_w,
            sub_types, boxes_by_id, remaining, max_depth - 1
        )
        positions.extend(sub_pos)
        max_h = max(max_h, sub_h)

    # Sub-strip B: below this fill within the strip
    bottom_sub_l = strip_l
    bottom_sub_w = strip_w - best["rows"] * best["ow"]
    if bottom_sub_l > EPS and bottom_sub_w > EPS:
        sub_types = [t for t in secondary_types if t != best["tid"] or remaining.get(t, 0) > 0]
        sub_pos, sub_h = _gfl_fill_strip(
            strip_x, strip_y + best["rows"] * best["ow"],
            bottom_sub_l, bottom_sub_w,
            sub_types, boxes_by_id, remaining, max_depth - 1
        )
        positions.extend(sub_pos)
        max_h = max(max_h, sub_h)

    # Restore deducted count (caller deducts all at once when placing layer)
    remaining[best["tid"]] += placed_cnt

    return positions, max_h


def pack_gap_fill_layered(
    boxes_by_id: Dict[str, Any],
    quantities: Dict[str, int],
    pallet_l: float,
    pallet_w: float,
    max_z: float,
    overhang_pct: float = 0.0,
    max_kontovka: int = 3,
    forced_grids: Optional[Dict[str, Dict]] = None,
) -> Dict:
    """
    Gap-fill layered packer.

    Fills the pallet one horizontal slab at a time, width+length first.
    Priority: tallest box first (for stability), then most numerous.
    After placing the primary grid, remaining right-side strip is filled
    with secondary types (iteratively, up to 3 sub-strips deep).

    forced_grids: { box_id: {"cols": int, "rows": int, "box_l": float, "box_w": float} }
        Override the natural grid for specific box types. E.g. T20-80×80 always 7×2.
    """
    max_l = pallet_l * (1 + overhang_pct)
    max_w = pallet_w * (1 + overhang_pct)

    remaining: Dict[str, int] = {k: v for k, v in quantities.items() if v > 0}
    placed: List[Dict] = []
    layers: List[Dict] = []
    current_z = 0.0
    pb_counter = 0
    unplaced: Dict[str, int] = {}

    # Priority order (static): "крупнее первее" — largest physical footprint first
    # (footprint area DESC), then height DESC, then quantity DESC.
    # This places physically bigger boxes on the bottom for stability.
    priority_order: List[str] = sorted(
        [t for t in quantities if t in boxes_by_id],
        key=lambda t: (
            -(boxes_by_id[t]["length"] * boxes_by_id[t]["width"]),
            -boxes_by_id[t]["height"],
            -quantities.get(t, 0),
        )
    )

    def active_priority() -> List[str]:
        return [t for t in priority_order if remaining.get(t, 0) > 0]

    max_iter = 1000
    it = 0

    while it < max_iter:
        it += 1
        active = active_priority()
        if not active:
            break

        primary_id = active[0]
        primary_box = boxes_by_id[primary_id]

        # Height check
        if current_z + primary_box["height"] > max_z + EPS:
            # Primary type no longer fits — mark rest as unplaced
            unplaced[primary_id] = unplaced.get(primary_id, 0) + remaining.get(primary_id, 0)
            remaining.pop(primary_id, None)
            continue

        # ── Primary grid ──────────────────────────────────────────
        forced = (forced_grids or {}).get(primary_id)
        if forced:
            cols = forced["cols"]
            rows = forced["rows"]
            bl = forced["box_l"]
            bw = forced["box_w"]
            bh = primary_box["height"]
            per_layer = cols * rows
        else:
            grid = _gfl_best_flat_grid(primary_box, max_l, max_w)
            if not grid:
                unplaced[primary_id] = unplaced.get(primary_id, 0) + remaining.get(primary_id, 0)
                remaining.pop(primary_id, None)
                continue
            cols, rows = grid["cols"], grid["rows"]
            bl, bw, bh = grid["box_l"], grid["box_w"], grid["box_h"]
            per_layer = grid["count"]

        n_primary = min(per_layer, remaining[primary_id])
        if n_primary == 0:
            remaining.pop(primary_id, None)
            continue

        # Build primary positions.
        # Use COLUMN-MAJOR order so partial layers stay compact on the left,
        # maximising the right-strip gap available for gap-fill.
        # (Row-major for 8/14 boxes puts 7 in row-0, span=119 cm, gap=1 cm —
        #  column-major gives 4×2 compact block, span=68 cm, gap=52 cm.)
        primary_positions: List[Dict] = []
        count = 0
        for c in range(cols):
            for r in range(rows):
                if count >= n_primary:
                    break
                primary_positions.append({
                    "type_id": primary_id,
                    "x": c * bl, "y": r * bw,
                    "l": bl, "w": bw, "h": bh,
                    "ori_kind": "flat",
                })
                count += 1
            if count >= n_primary:
                break

        # Actual primary footprint (may be partial layer)
        if primary_positions:
            primary_span_l = max(p["x"] + p["l"] for p in primary_positions)
            primary_span_w = max(p["y"] + p["w"] for p in primary_positions)
        else:
            primary_span_l = cols * bl
            primary_span_w = rows * bw

        layer_h = bh

        # ── Gap fill: right strip ─────────────────────────────────
        right_gap_l = max_l - primary_span_l
        secondary_types = [t for t in active[1:] if remaining.get(t, 0) > 0]

        gap_positions: List[Dict] = []
        if right_gap_l > EPS and secondary_types:
            # Make a temporary copy of remaining for the strip-filler
            # (_gfl_fill_strip restores its own deductions, so we pass
            #  a live dict and commit the final counts after)
            temp_remaining = dict(remaining)
            temp_remaining.pop(primary_id, None)  # primary already counted

            strip_pos, strip_h = _gfl_fill_strip(
                primary_span_l, 0.0,
                right_gap_l, max_w,
                secondary_types, boxes_by_id, temp_remaining,
                max_depth=3,
            )
            gap_positions = strip_pos
            layer_h = max(layer_h, strip_h)

        # ── Commit layer ──────────────────────────────────────────
        layer_idx = len(layers) + 1
        breakdown: Dict[str, int] = {}
        all_positions = primary_positions + gap_positions

        for p in all_positions:
            tid = p["type_id"]
            remaining[tid] = remaining.get(tid, 0) - 1
            breakdown[tid] = breakdown.get(tid, 0) + 1
            placed.append({
                "id": f"pb_{pb_counter:05d}",
                "type_id": tid,
                "x": round(p["x"], 4),
                "y": round(p["y"], 4),
                "z": round(current_z, 4),
                "l": round(p["l"], 4),
                "w": round(p["w"], 4),
                "h": round(p["h"], 4),
                "ori_kind": p.get("ori_kind", "flat"),
                "layer_index": layer_idx,
                "zone_id": None,
                "support_fraction": 1.0 if current_z < EPS else
                    support_fraction(p, placed[:-1] if placed else [], current_z),
            })
            pb_counter += 1

        # Clean up zeroed entries
        for tid in list(remaining.keys()):
            if remaining[tid] <= 0:
                remaining.pop(tid, None)

        # Build layer description
        desc_parts = []
        for tid, n in breakdown.items():
            name = boxes_by_id.get(tid, {}).get("name", tid)
            desc_parts.append(f"{n} × {name}")
        span_note = (f"{round(primary_span_l, 1)} cm + "
                     f"{round(max_l - primary_span_l, 1)} cm gap"
                     if right_gap_l > EPS else
                     f"{round(primary_span_l, 1)} cm")

        kind = "pure" if len(breakdown) == 1 else "half-split"
        layers.append({
            "index": layer_idx,
            "z_bottom": round(current_z, 4),
            "z_top": round(current_z + layer_h, 4),
            "kind": kind,
            "type_breakdown": breakdown,
            "description": {
                "headline": " + ".join(desc_parts),
                "body": span_note,
                "zones": [],
            },
            "count": len(all_positions),
        })
        current_z = round(current_z + layer_h, 4)

    # Any remaining → unplaced
    for tid, v in remaining.items():
        if v > 0:
            unplaced[tid] = unplaced.get(tid, 0) + v

    total_height = max((p["z"] + p["h"] for p in placed), default=0.0)
    total_vol = sum(p["l"] * p["w"] * p["h"] for p in placed)
    pallet_vol = pallet_l * pallet_w * max(total_height, 0.001)
    efficiency = round(total_vol / pallet_vol, 4) if pallet_vol > 0 else 0.0

    return {
        "placed_boxes": placed,
        "layers": layers,
        "unplaced": unplaced,
        "stats": {
            "total_boxes": len(placed),
            "layer_count": len(layers),
            "total_height": round(total_height, 2),
            "efficiency": efficiency,
            "unplaced": unplaced,
        },
    }


# ═══════════════════════════════════════════════════════════════════
# ULTRA — strip-clean layered packer
#
# Differences vs pack_gap_fill_layered:
# - Each "strip" within a layer uses ONE box type and ONE orientation
#   (no rotated boxes inside the same strip → cleaner visual)
# - Recursive fills only allowed with the SAME type & orientation,
#   so the right- and bottom-sub-strips look like a clean grid extension
# - Supports kontovka (standing on edge) for "50 rollen" boxes only,
#   with the user's "max 3 standing rows" rule
# - Tries multiple strategies (axis flip, type orderings, with/without
#   kontovka) and picks the result with highest score
# ═══════════════════════════════════════════════════════════════════

def _is_50_rollen(box: Dict) -> bool:
    """User constraint: kontovka only for 50 rollen boxes."""
    bid = box.get("id", "")
    return bid.startswith("therm_50r_") or bid.startswith("veit_50r_")


def _is_20_rollen(box: Dict) -> bool:
    """User constraint: T20 boxes always flat, long side along Y (pallet width).
    No kontovka, no L/W rotation (only fallback if preferred can't fit)."""
    bid = box.get("id", "")
    return bid.startswith("therm_20r_")


def _allowed_oris_for(box: Dict, allow_kontovka_50r: bool) -> List:
    """Flat orientations always; standing only if 50r and allowed."""
    L, W, H = box["length"], box["width"], box["height"]
    oris = list(flat_orientations(L, W, H, box.get("allowed_orientations")))
    if allow_kontovka_50r and _is_50_rollen(box):
        oris.extend([
            o for o in get_orientations(L, W, H, box.get("allowed_orientations"))
            if o[3] == "stand"
        ])
    return oris


def _fill_strip_clean(strip_x: float, strip_y: float,
                      strip_l: float, strip_w: float,
                      candidate_types: List[str],
                      boxes_by_id: Dict,
                      remaining: Dict[str, int],
                      allow_kontovka_50r: bool = True,
                      max_kontovka: int = 3) -> Tuple[List[Dict], float]:
    """
    Fill a rectangular strip with ONE box type and ONE orientation.
    For visual cleanliness: no mixing types or orientations in same strip.

    For 50 rollen boxes, also tries kontovka (standing) if enabled.
    Standing strips capped at max_kontovka rows/cols depth.
    Recurses into sub-strips ONLY with same type & orientation.
    """
    if strip_l < EPS or strip_w < EPS:
        return [], 0.0

    best = None
    for tid in candidate_types:
        if remaining.get(tid, 0) <= 0:
            continue
        box = boxes_by_id.get(tid)
        if not box:
            continue

        for ori in _allowed_oris_for(box, allow_kontovka_50r):
            ol, ow, oh, kind = ori
            if ol > strip_l + EPS or ow > strip_w + EPS:
                continue
            cols = int((strip_l + EPS) / ol)
            rows = int((strip_w + EPS) / ow)
            if cols < 1 or rows < 1:
                continue
            if kind == "stand":
                # User rule: at most 3 rows of kontovka
                if max(cols, rows) > max_kontovka:
                    continue
            cnt = min(cols * rows, remaining[tid])
            if cnt <= 0:
                continue
            # Score: count × area (more boxes & better coverage = better)
            coverage = cnt * ol * ow
            score = cnt * 10000 + coverage
            if best is None or score > best["score"]:
                best = {
                    "tid": tid, "ori": ori,
                    "cols": cols, "rows": rows, "cnt": cnt,
                    "ol": ol, "ow": ow, "oh": oh, "kind": kind,
                    "score": score,
                }

    if not best:
        return [], 0.0

    positions: List[Dict] = []
    placed_cnt = 0
    for r in range(best["rows"]):
        for c in range(best["cols"]):
            if placed_cnt >= best["cnt"]:
                break
            positions.append({
                "type_id": best["tid"],
                "x": strip_x + c * best["ol"],
                "y": strip_y + r * best["ow"],
                "l": best["ol"], "w": best["ow"], "h": best["oh"],
                "ori_kind": best["kind"],
            })
            placed_cnt += 1
        if placed_cnt >= best["cnt"]:
            break

    max_h = best["oh"]
    used_l = best["cols"] * best["ol"]
    used_w = best["rows"] * best["ow"]

    # Recurse with SAME tid & orientation only (clean look).
    # Reduce remaining temporarily to reflect what we just placed.
    remaining[best["tid"]] -= placed_cnt

    # Right sub-strip: same orientation, same type
    right_l = strip_l - used_l
    if right_l > EPS and used_w > EPS and remaining[best["tid"]] > 0:
        sub_pos, sub_h = _fill_strip_clean(
            strip_x + used_l, strip_y, right_l, used_w,
            [best["tid"]], boxes_by_id, remaining,
            allow_kontovka_50r=False,  # already chose; keep same
            max_kontovka=max_kontovka,
        )
        positions.extend(sub_pos)
        max_h = max(max_h, sub_h)

    # Bottom sub-strip: same orientation, same type
    bottom_w = strip_w - used_w
    if bottom_w > EPS and remaining[best["tid"]] > 0:
        sub_pos, sub_h = _fill_strip_clean(
            strip_x, strip_y + used_w, strip_l, bottom_w,
            [best["tid"]], boxes_by_id, remaining,
            allow_kontovka_50r=False,
            max_kontovka=max_kontovka,
        )
        positions.extend(sub_pos)
        max_h = max(max_h, sub_h)

    remaining[best["tid"]] += placed_cnt  # restore for caller
    return positions, max_h


def _fill_strip_clean_with_back(strip_x: float, strip_y: float,
                                 strip_l: float, strip_w: float,
                                 candidate_types: List[str],
                                 boxes_by_id: Dict,
                                 remaining: Dict[str, int],
                                 allow_kontovka_50r: bool = True,
                                 max_kontovka: int = 3) -> Tuple[List[Dict], float]:
    """
    First fill the right strip cleanly. Then, for the area BELOW (back)
    of the right strip's primary fill, allow a DIFFERENT type to fill it
    (since the back area has a different available height).

    Used as the gap-fill helper for the strip-clean packer.
    """
    if strip_l < EPS or strip_w < EPS:
        return [], 0.0

    # First pass: clean fill of the whole strip with one type/orientation
    pos1, h1 = _fill_strip_clean(
        strip_x, strip_y, strip_l, strip_w,
        candidate_types, boxes_by_id, remaining,
        allow_kontovka_50r, max_kontovka,
    )
    return pos1, h1


def pack_strip_clean_layered(
    boxes_by_id: Dict[str, Any],
    quantities: Dict[str, int],
    pallet_l: float,
    pallet_w: float,
    max_z: float,
    overhang_pct: float = 0.0,
    max_kontovka: int = 3,
    forced_grids: Optional[Dict[str, Dict]] = None,
    priority_key: str = "footprint",  # 'footprint' or 'height'
    allow_kontovka_50r: bool = True,
) -> Dict:
    """
    Strip-clean layered packer.

    Like pack_gap_fill_layered but enforces single orientation per strip
    (visually cleaner). Supports kontovka for 50r boxes.

    priority_key: which attribute drives the priority order
        - 'footprint': largest footprint area first (default)
        - 'height':    tallest box first (good when stability matters)
    """
    max_l = pallet_l * (1 + overhang_pct)
    max_w = pallet_w * (1 + overhang_pct)

    remaining: Dict[str, int] = {k: v for k, v in quantities.items() if v > 0}
    placed: List[Dict] = []
    layers: List[Dict] = []
    current_z = 0.0
    pb_counter = 0
    unplaced: Dict[str, int] = {}

    def prio(t: str):
        b = boxes_by_id[t]
        if priority_key == "height":
            return (-b["height"], -(b["length"] * b["width"]), -quantities.get(t, 0))
        return (-(b["length"] * b["width"]), -b["height"], -quantities.get(t, 0))

    priority_order: List[str] = sorted(
        [t for t in quantities if t in boxes_by_id], key=prio
    )

    def active() -> List[str]:
        return [t for t in priority_order if remaining.get(t, 0) > 0]

    max_iter = 1000
    it = 0

    while it < max_iter:
        it += 1
        act = active()
        if not act:
            break

        primary_id = act[0]
        primary_box = boxes_by_id[primary_id]

        if current_z + primary_box["height"] > max_z + EPS:
            unplaced[primary_id] = unplaced.get(primary_id, 0) + remaining.get(primary_id, 0)
            remaining.pop(primary_id, None)
            continue

        # Primary grid (forced or natural best flat)
        forced = (forced_grids or {}).get(primary_id)
        if forced:
            cols = forced["cols"]
            rows = forced["rows"]
            bl = forced["box_l"]
            bw = forced["box_w"]
            bh = primary_box["height"]
        else:
            grid = _gfl_best_flat_grid(primary_box, max_l, max_w)
            if not grid:
                unplaced[primary_id] = unplaced.get(primary_id, 0) + remaining.get(primary_id, 0)
                remaining.pop(primary_id, None)
                continue
            cols, rows = grid["cols"], grid["rows"]
            bl, bw, bh = grid["box_l"], grid["box_w"], grid["box_h"]

        per_layer = cols * rows
        n_primary = min(per_layer, remaining[primary_id])
        if n_primary == 0:
            remaining.pop(primary_id, None)
            continue

        # Column-major (compact left-aligned for partial layers)
        primary_positions: List[Dict] = []
        count = 0
        for c in range(cols):
            for r in range(rows):
                if count >= n_primary:
                    break
                primary_positions.append({
                    "type_id": primary_id,
                    "x": c * bl, "y": r * bw,
                    "l": bl, "w": bw, "h": bh,
                    "ori_kind": "flat",
                })
                count += 1
            if count >= n_primary:
                break

        if primary_positions:
            primary_span_l = max(p["x"] + p["l"] for p in primary_positions)
            primary_span_w = max(p["y"] + p["w"] for p in primary_positions)
        else:
            primary_span_l = cols * bl
            primary_span_w = rows * bw

        layer_h = bh

        # Right gap — single-orientation clean fill
        right_gap_l = max_l - primary_span_l
        secondary_types = [t for t in act[1:] if remaining.get(t, 0) > 0]
        gap_positions: List[Dict] = []

        if right_gap_l > EPS and secondary_types:
            temp_remaining = dict(remaining)
            temp_remaining.pop(primary_id, None)
            strip_pos, strip_h = _fill_strip_clean(
                primary_span_l, 0.0,
                right_gap_l, max_w,
                secondary_types, boxes_by_id, temp_remaining,
                allow_kontovka_50r=allow_kontovka_50r,
                max_kontovka=max_kontovka,
            )
            gap_positions = strip_pos
            layer_h = max(layer_h, strip_h)

        # Commit layer
        layer_idx = len(layers) + 1
        breakdown: Dict[str, int] = {}
        all_positions = primary_positions + gap_positions
        for p in all_positions:
            tid = p["type_id"]
            remaining[tid] = remaining.get(tid, 0) - 1
            breakdown[tid] = breakdown.get(tid, 0) + 1
            placed.append({
                "id": f"pb_{pb_counter:05d}",
                "type_id": tid,
                "x": round(p["x"], 4),
                "y": round(p["y"], 4),
                "z": round(current_z, 4),
                "l": round(p["l"], 4),
                "w": round(p["w"], 4),
                "h": round(p["h"], 4),
                "ori_kind": p.get("ori_kind", "flat"),
                "layer_index": layer_idx,
                "zone_id": None,
                "support_fraction": 1.0 if current_z < EPS else
                    support_fraction(p, placed[:-1] if placed else [], current_z),
            })
            pb_counter += 1

        for tid in list(remaining.keys()):
            if remaining[tid] <= 0:
                remaining.pop(tid, None)

        desc_parts = []
        for tid, n in breakdown.items():
            name = boxes_by_id.get(tid, {}).get("name", tid)
            desc_parts.append(f"{n} × {name}")

        kind = "pure" if len(breakdown) == 1 else "half-split"
        layers.append({
            "index": layer_idx,
            "z_bottom": round(current_z, 4),
            "z_top": round(current_z + layer_h, 4),
            "kind": kind,
            "type_breakdown": breakdown,
            "description": {
                "headline": " + ".join(desc_parts),
                "body": (f"{round(primary_span_l, 1)} cm + "
                         f"{round(max_l - primary_span_l, 1)} cm gap"
                         if right_gap_l > EPS else f"{round(primary_span_l, 1)} cm"),
                "zones": [],
            },
            "count": len(all_positions),
        })
        current_z = round(current_z + layer_h, 4)

    for tid, v in remaining.items():
        if v > 0:
            unplaced[tid] = unplaced.get(tid, 0) + v

    total_height = max((p["z"] + p["h"] for p in placed), default=0.0)
    total_vol = sum(p["l"] * p["w"] * p["h"] for p in placed)
    pallet_vol = pallet_l * pallet_w * max(total_height, 0.001)
    efficiency = round(total_vol / pallet_vol, 4) if pallet_vol > 0 else 0.0

    return {
        "placed_boxes": placed,
        "layers": layers,
        "unplaced": unplaced,
        "stats": {
            "total_boxes": len(placed),
            "layer_count": len(layers),
            "total_height": round(total_height, 2),
            "efficiency": efficiency,
            "unplaced": unplaced,
        },
    }


def _orientation_diversity_penalty(layers: List[Dict], placed: List[Dict]) -> float:
    """
    Count how many layers have boxes of the same type in MULTIPLE
    orientations. Lower is better (cleaner visual).
    Layers with kind in {mixed-edge, half-split, tri-split} are intentionally
    multi-orientation and are exempt from the penalty.
    """
    _EXEMPT = {"mixed-edge", "half-split", "tri-split"}
    exempt_layers = {lr["index"] for lr in layers if lr.get("kind") in _EXEMPT}

    by_layer: Dict[int, Dict[str, set]] = {}
    for p in placed:
        li = p.get("layer_index", 0)
        if li in exempt_layers:
            continue
        tid = p.get("type_id", "?")
        sig = (round(p["l"], 1), round(p["w"], 1))
        by_layer.setdefault(li, {}).setdefault(tid, set()).add(sig)
    penalty = 0
    for li, types in by_layer.items():
        for tid, sigs in types.items():
            if len(sigs) > 1:
                penalty += len(sigs) - 1
    return penalty


def _score_result(result: Dict, total_requested: int, max_z: float) -> float:
    """
    Combined score: more placed = better, less height = better,
    fewer mixed-orientation layers = better.
    """
    if not result:
        return -1e9
    placed = result.get("placed_boxes", [])
    layers = result.get("layers", [])
    n_placed = len(placed)
    n_unplaced = total_requested - n_placed
    height = result.get("stats", {}).get("total_height", 0)

    # Heavy penalty for unplaced
    score = n_placed * 1000 - n_unplaced * 100000
    # Smaller penalty for taller stack
    score -= height * 5
    # Penalty for mixed-orientation layers (visual cleanliness)
    score -= _orientation_diversity_penalty(layers, placed) * 50
    return score


# ═══════════════════════════════════════════════════════════════════
# 50R KONTOVKA TEMPLATE ENGINE
#
# For "50 rollen" boxes (which user permits to stand on edge), generate
# layer designs that combine flat boxes in the central grid with
# standing-on-edge boxes filling the right strip AND/OR the back strip.
#
# This produces a clean "cross" or "L" pattern matching the user's
# reference photos: flat squares in the bulk + narrow standing boxes
# along the gaps, no waste.
# ═══════════════════════════════════════════════════════════════════

def _build_50r_kontovka_layer(
    box: Dict[str, Any],
    max_l: float,
    max_w: float,
    max_remaining: int,
    max_kontovka: int = 3,
    overhang_back_cm: float = 1.5,
) -> Optional[Dict]:
    """
    Build the best layer combining flat 50r boxes in a central rectangle
    with kontovka strips on the right and/or back.

    Layout:

        ┌─────────────────────────┬───────────┐
        │                         │           │
        │   FLAT M × N grid       │  RIGHT    │
        │                         │  KONTOVKA │
        │   (footprint fl×fw)     │  STRIP    │
        │                         │           │
        ├─────────────────────────┤           │
        │   BACK KONTOVKA STRIP   │           │
        │   (over flat area only) │           │
        └─────────────────────────┴───────────┘

    Layer height = max(flat_h, standing_h).

    The corner of right & back strips is owned by the right strip
    (which spans the full pallet depth), so no overlap. This matches
    the user's reference photos where right strip is full-height.
    """
    if not _is_50_rollen(box):
        return None

    L, W, H = box["length"], box["width"], box["height"]
    flat_oris = list(flat_orientations(L, W, H, box.get("allowed_orientations")))
    stand_oris = [o for o in get_orientations(L, W, H, box.get("allowed_orientations"))
                  if o[3] == "stand"]
    if not flat_oris:
        return None

    best: Optional[Dict] = None

    # Allow tiny back overhang since user said slight overhang is OK
    back_max = max_w + overhang_back_cm

    for fo in flat_oris:
        fl, fw, fh = fo[0], fo[1], fo[2]
        max_M = int((max_l + EPS) / fl)
        max_N = int((back_max + EPS) / fw)

        # M=0 means no flat (rare); skip for now
        for M in range(1, max_M + 1):
            for N in range(1, max_N + 1):
                flat_count = M * N
                if flat_count <= 0 or flat_count > max_remaining:
                    continue
                flat_x_end = M * fl
                flat_y_end = N * fw
                if flat_x_end > max_l + EPS or flat_y_end > back_max + EPS:
                    continue

                # ── Right strip: full pallet depth ────────────────
                right_w = max_l - flat_x_end
                right_best = None
                if right_w > EPS and stand_oris:
                    for so in stand_oris:
                        sl, sw, sh = so[0], so[1], so[2]
                        if sl > right_w + EPS:
                            continue
                        sc = int((right_w + EPS) / sl)
                        sr = int((max_w + EPS) / sw)
                        if sc < 1 or sr < 1:
                            continue
                        # User constraint: max 3 standing rows/cols
                        if max(sc, sr) > max_kontovka:
                            continue
                        cnt = sc * sr
                        if cnt <= 0:
                            continue
                        if right_best is None or cnt > right_best["cnt"]:
                            right_best = {
                                "sc": sc, "sr": sr,
                                "sl": sl, "sw": sw, "sh": sh,
                                "cnt": cnt,
                            }

                # ── Back strip: only over the flat area ───────────
                back_h_ = max_w - flat_y_end
                back_best = None
                if back_h_ > EPS and flat_x_end > EPS and stand_oris:
                    for so in stand_oris:
                        sl, sw, sh = so[0], so[1], so[2]
                        if sw > back_h_ + EPS:
                            continue
                        sc = int((flat_x_end + EPS) / sl)
                        sr = int((back_h_ + EPS) / sw)
                        if sc < 1 or sr < 1:
                            continue
                        if max(sc, sr) > max_kontovka:
                            continue
                        cnt = sc * sr
                        if cnt <= 0:
                            continue
                        if back_best is None or cnt > back_best["cnt"]:
                            back_best = {
                                "sc": sc, "sr": sr,
                                "sl": sl, "sw": sw, "sh": sh,
                                "cnt": cnt,
                            }

                stand_count = (
                    (right_best["cnt"] if right_best else 0) +
                    (back_best["cnt"] if back_best else 0)
                )
                total = flat_count + stand_count
                if total <= 0 or total > max_remaining:
                    # Try truncating to fit remaining
                    if flat_count <= max_remaining:
                        # Cap kontovka to fit
                        room = max_remaining - flat_count
                        # Keep right preferentially
                        if right_best and right_best["cnt"] > room:
                            right_best = None
                            stand_count = back_best["cnt"] if back_best else 0
                        if back_best and (flat_count + (right_best["cnt"] if right_best else 0)
                                          + back_best["cnt"]) > max_remaining:
                            back_best = None
                            stand_count = right_best["cnt"] if right_best else 0
                        total = flat_count + stand_count
                    if total <= 0 or total > max_remaining:
                        continue

                # Layer height
                layer_h = fh
                if right_best:
                    layer_h = max(layer_h, right_best["sh"])
                if back_best:
                    layer_h = max(layer_h, back_best["sh"])

                # Score: prefer more boxes, then lower height,
                # then more "balanced" mix (flat dominant looks cleaner)
                score = total * 1000 - layer_h * 5
                if right_best and back_best:
                    score += 50  # bonus for cross pattern (cleaner)
                if best is None or score > best["score"]:
                    best = {
                        "flat_M": M, "flat_N": N, "flat_count": flat_count,
                        "flat_ori": fo, "fl": fl, "fw": fw, "fh": fh,
                        "right": right_best, "back": back_best,
                        "stand_count": stand_count, "total": total,
                        "layer_h": layer_h, "score": score,
                        "flat_x_end": flat_x_end, "flat_y_end": flat_y_end,
                    }

    if best is None:
        return None

    # Materialize positions
    positions: List[Dict] = []
    fl, fw, fh = best["fl"], best["fw"], best["fh"]
    for r in range(best["flat_N"]):
        for c in range(best["flat_M"]):
            positions.append({
                "type_id": box["id"],
                "x": c * fl, "y": r * fw,
                "l": fl, "w": fw, "h": fh,
                "ori_kind": "flat",
            })

    if best["right"]:
        rb = best["right"]
        for r in range(rb["sr"]):
            for c in range(rb["sc"]):
                positions.append({
                    "type_id": box["id"],
                    "x": best["flat_x_end"] + c * rb["sl"],
                    "y": r * rb["sw"],
                    "l": rb["sl"], "w": rb["sw"], "h": rb["sh"],
                    "ori_kind": "stand",
                })

    if best["back"]:
        bb = best["back"]
        for r in range(bb["sr"]):
            for c in range(bb["sc"]):
                positions.append({
                    "type_id": box["id"],
                    "x": c * bb["sl"],
                    "y": best["flat_y_end"] + r * bb["sw"],
                    "l": bb["sl"], "w": bb["sw"], "h": bb["sh"],
                    "ori_kind": "stand",
                })

    return {
        "positions": positions,
        "layer_h": best["layer_h"],
        "count": best["total"],
        "flat_count": best["flat_count"],
        "stand_count": best["stand_count"],
        "primary_x_end": max(best["flat_x_end"],
                              best["flat_x_end"] + (best["right"]["sc"] * best["right"]["sl"]
                                                   if best["right"] else 0)),
    }


def pack_template_kontovka_layered(
    boxes_by_id: Dict[str, Any],
    quantities: Dict[str, int],
    pallet_l: float,
    pallet_w: float,
    max_z: float,
    overhang_pct: float = 0.0,
    max_kontovka: int = 3,
    forced_grids: Optional[Dict[str, Dict]] = None,
) -> Dict:
    """
    Template-based packer.

    For each layer:
    1. Pick the highest-priority remaining box type as primary.
    2. If primary is 50r → try kontovka template (flat + right/back kontovka strips).
       Otherwise → use plain flat grid (with forced_grid if provided).
    3. Fill remaining right gap with secondary types using clean strips
       (single orientation per strip, kontovka allowed for 50r secondaries).
    4. Move to next layer until no box types remain or max_z reached.
    """
    max_l = pallet_l * (1 + overhang_pct)
    max_w = pallet_w * (1 + overhang_pct)

    remaining: Dict[str, int] = {k: v for k, v in quantities.items() if v > 0}
    placed: List[Dict] = []
    layers: List[Dict] = []
    current_z = 0.0
    pb_counter = 0
    unplaced: Dict[str, int] = {}

    # Priority: largest footprint first (for stability), then height, then qty
    priority_order: List[str] = sorted(
        [t for t in quantities if t in boxes_by_id],
        key=lambda t: (
            -(boxes_by_id[t]["length"] * boxes_by_id[t]["width"]),
            -boxes_by_id[t]["height"],
            -quantities.get(t, 0),
        )
    )

    def active() -> List[str]:
        return [t for t in priority_order if remaining.get(t, 0) > 0]

    max_iter = 1000
    it = 0
    while it < max_iter:
        it += 1
        act = active()
        if not act:
            break

        primary_id = act[0]
        primary_box = boxes_by_id[primary_id]
        if current_z + primary_box["height"] > max_z + EPS:
            unplaced[primary_id] = unplaced.get(primary_id, 0) + remaining.get(primary_id, 0)
            remaining.pop(primary_id, None)
            continue

        primary_positions: List[Dict] = []
        layer_h = 0.0
        primary_span_l = 0.0

        # ── Step 1: build primary contribution ────────────────────
        forced = (forced_grids or {}).get(primary_id)
        used_template = None

        if not forced and _is_50_rollen(primary_box):
            # Try kontovka template
            tmpl = _build_50r_kontovka_layer(
                primary_box, max_l, max_w, remaining[primary_id],
                max_kontovka=max_kontovka,
            )
            # Compare with pure-flat to pick the better one
            flat_grid = _gfl_best_flat_grid(primary_box, max_l, max_w)
            flat_count = min(flat_grid["count"] if flat_grid else 0,
                             remaining[primary_id])
            if tmpl and tmpl["count"] >= flat_count:
                used_template = tmpl
                primary_positions = list(tmpl["positions"])
                layer_h = tmpl["layer_h"]
                # Track right edge for gap fill
                primary_span_l = max((p["x"] + p["l"] for p in primary_positions), default=0)

        if not used_template:
            # Standard flat grid placement
            if forced:
                cols = forced["cols"]
                rows = forced["rows"]
                bl = forced["box_l"]
                bw = forced["box_w"]
                bh = primary_box["height"]
            else:
                grid = _gfl_best_flat_grid(primary_box, max_l, max_w)
                if not grid:
                    unplaced[primary_id] = unplaced.get(primary_id, 0) + remaining.get(primary_id, 0)
                    remaining.pop(primary_id, None)
                    continue
                cols, rows = grid["cols"], grid["rows"]
                bl, bw, bh = grid["box_l"], grid["box_w"], grid["box_h"]

            per_layer = cols * rows
            n_primary = min(per_layer, remaining[primary_id])
            count = 0
            # Column-major for compact partial layers
            for c in range(cols):
                for r in range(rows):
                    if count >= n_primary:
                        break
                    primary_positions.append({
                        "type_id": primary_id,
                        "x": c * bl, "y": r * bw,
                        "l": bl, "w": bw, "h": bh,
                        "ori_kind": "flat",
                    })
                    count += 1
                if count >= n_primary:
                    break
            layer_h = bh
            primary_span_l = max((p["x"] + p["l"] for p in primary_positions), default=0)

        if not primary_positions:
            remaining.pop(primary_id, None)
            continue

        # ── Step 2: fill any remaining right gap with secondaries ──
        right_gap_l = max_l - primary_span_l
        secondary_types = [t for t in act[1:] if remaining.get(t, 0) > 0]
        gap_positions: List[Dict] = []
        if right_gap_l > EPS and secondary_types:
            temp_remaining = dict(remaining)
            temp_remaining.pop(primary_id, None)
            strip_pos, strip_h = _fill_strip_clean(
                primary_span_l, 0.0,
                right_gap_l, max_w,
                secondary_types, boxes_by_id, temp_remaining,
                allow_kontovka_50r=True,
                max_kontovka=max_kontovka,
            )
            gap_positions = strip_pos
            layer_h = max(layer_h, strip_h)

        # ── Step 3: commit layer ──────────────────────────────────
        layer_idx = len(layers) + 1
        breakdown: Dict[str, int] = {}
        all_positions = primary_positions + gap_positions
        for p in all_positions:
            tid = p["type_id"]
            remaining[tid] = remaining.get(tid, 0) - 1
            breakdown[tid] = breakdown.get(tid, 0) + 1
            placed.append({
                "id": f"pb_{pb_counter:05d}",
                "type_id": tid,
                "x": round(p["x"], 4), "y": round(p["y"], 4),
                "z": round(current_z, 4),
                "l": round(p["l"], 4), "w": round(p["w"], 4),
                "h": round(p["h"], 4),
                "ori_kind": p.get("ori_kind", "flat"),
                "layer_index": layer_idx,
                "zone_id": None,
                "support_fraction": 1.0 if current_z < EPS else
                    support_fraction(p, placed[:-1] if placed else [], current_z),
            })
            pb_counter += 1
        for tid in list(remaining.keys()):
            if remaining[tid] <= 0:
                remaining.pop(tid, None)

        desc_parts = []
        for tid, n in breakdown.items():
            name = boxes_by_id.get(tid, {}).get("name", tid)
            desc_parts.append(f"{n} × {name}")
        body = ""
        if used_template:
            body = (f"Flat {used_template['flat_count']} + "
                    f"kontovka {used_template['stand_count']} (template)")

        kind = "pure" if len(breakdown) == 1 else "half-split"
        layers.append({
            "index": layer_idx,
            "z_bottom": round(current_z, 4),
            "z_top": round(current_z + layer_h, 4),
            "kind": kind,
            "type_breakdown": breakdown,
            "description": {
                "headline": " + ".join(desc_parts),
                "body": body,
                "zones": [],
            },
            "count": len(all_positions),
        })
        current_z = round(current_z + layer_h, 4)

    for tid, v in remaining.items():
        if v > 0:
            unplaced[tid] = unplaced.get(tid, 0) + v

    total_height = max((p["z"] + p["h"] for p in placed), default=0.0)
    total_vol = sum(p["l"] * p["w"] * p["h"] for p in placed)
    pallet_vol = pallet_l * pallet_w * max(total_height, 0.001)
    efficiency = round(total_vol / pallet_vol, 4) if pallet_vol > 0 else 0.0

    return {
        "placed_boxes": placed,
        "layers": layers,
        "unplaced": unplaced,
        "stats": {
            "total_boxes": len(placed),
            "layer_count": len(layers),
            "total_height": round(total_height, 2),
            "efficiency": efficiency,
            "unplaced": unplaced,
        },
    }


def _pack_mixed_split_layered(
    boxes_by_id: Dict[str, Any],
    quantities: Dict[str, int],
    pallet_l: float,
    pallet_w: float,
    max_z: float,
    overhang_pct: float = 0.0,
    max_kontovka: int = 3,
    forced_grids: Optional[Dict[str, Dict]] = None,
) -> Dict:
    """
    Mixed-split layered packer.

    For each layer, evaluates ALL of:
    1. Pure flat grid per active type
    2. Single-type flat+stand via _best_half_split_v2 (50r types only)
    3. Two-type mixed-orientation via _best_half_split_v2
    4. Three-zone via _best_tri_split (when 2+ types active)
    Picks the candidate placing the most boxes.
    """
    max_l = pallet_l * (1 + overhang_pct)
    max_w = pallet_w * (1 + overhang_pct)

    remaining: Dict[str, int] = {k: v for k, v in quantities.items() if v > 0}
    placed: List[Dict] = []
    layers: List[Dict] = []
    current_z = 0.0
    pb_counter = 0
    unplaced: Dict[str, int] = {}

    priority_order: List[str] = sorted(
        [t for t in quantities if t in boxes_by_id],
        key=lambda t: (
            -(boxes_by_id[t]["length"] * boxes_by_id[t]["width"]),
            -boxes_by_id[t]["height"],
            -quantities.get(t, 0),
        )
    )

    def active() -> List[str]:
        return [t for t in priority_order if remaining.get(t, 0) > 0]

    max_iter = 1000
    it = 0
    while it < max_iter:
        it += 1
        act = active()
        if not act:
            break

        viable = [t for t in act
                  if current_z + boxes_by_id[t]["height"] <= max_z + EPS]
        if not viable:
            for t in act:
                unplaced[t] = unplaced.get(t, 0) + remaining.get(t, 0)
                remaining.pop(t, None)
            break

        best_cand: Optional[Dict] = None
        best_cnt = 0

        # 1. Pure flat grid per type
        for tid in viable:
            box = boxes_by_id[tid]
            fg = (forced_grids or {}).get(tid)
            if fg:
                cols, rows = fg["cols"], fg["rows"]
                bl, bw, bh = fg["box_l"], fg["box_w"], box["height"]
            else:
                g = _gfl_best_flat_grid(box, max_l, max_w)
                if not g:
                    continue
                cols, rows, bl, bw, bh = g["cols"], g["rows"], g["box_l"], g["box_w"], g["box_h"]
            count = min(cols * rows, remaining[tid])
            if count > best_cnt:
                best_cnt = count
                pos, n = [], 0
                for c in range(cols):
                    for r in range(rows):
                        if n >= count:
                            break
                        pos.append({"type_id": tid, "x": c * bl, "y": r * bw,
                                    "l": bl, "w": bw, "h": bh, "ori_kind": "flat"})
                        n += 1
                    if n >= count:
                        break
                best_cand = {"count": count, "layer_h": bh, "kind": "pure", "positions": pos}

        # 2. Single-type flat+stand (50r only)
        for tid in viable:
            box = boxes_by_id[tid]
            if not _is_50_rollen(box):
                continue
            hs = _best_half_split_v2(box, box, remaining[tid], remaining[tid],
                                     max_l, max_w, max_kontovka)
            if hs and hs["total"] > best_cnt:
                best_cnt = hs["total"]
                best_cand = {"count": hs["total"], "layer_h": hs["layer_h"],
                             "kind": "mixed-edge", "positions": hs["positions"]}

        # 3. Two-type mixed-orientation
        for i, tid_a in enumerate(viable):
            for tid_b in viable[i + 1:]:
                ba, bb = boxes_by_id[tid_a], boxes_by_id[tid_b]
                hs = _best_half_split_v2(ba, bb, remaining[tid_a], remaining[tid_b],
                                         max_l, max_w, max_kontovka)
                if hs and hs["total"] > best_cnt:
                    best_cnt = hs["total"]
                    best_cand = {"count": hs["total"], "layer_h": hs["layer_h"],
                                 "kind": "half-split", "positions": hs["positions"]}

        # 4. Three-zone (2+ types)
        if len(viable) >= 2:
            for i, tid_a in enumerate(viable):
                for tid_b in viable[i + 1:]:
                    ba, bb = boxes_by_id[tid_a], boxes_by_id[tid_b]
                    ts = _best_tri_split(ba, bb, remaining[tid_a], remaining[tid_b],
                                         max_l, max_w, max_kontovka)
                    if ts and ts["total"] > best_cnt:
                        best_cnt = ts["total"]
                        best_cand = {"count": ts["total"], "layer_h": ts["layer_h"],
                                     "kind": "tri-split", "positions": ts["positions"]}

        if not best_cand or best_cnt == 0:
            # Nothing placed — evict the top type to avoid infinite loop
            t0 = viable[0]
            unplaced[t0] = unplaced.get(t0, 0) + remaining.get(t0, 0)
            remaining.pop(t0, None)
            continue

        # Commit layer
        layer_idx = len(layers) + 1
        breakdown: Dict[str, int] = {}
        for p in best_cand["positions"]:
            tid = p["type_id"]
            remaining[tid] = remaining.get(tid, 0) - 1
            breakdown[tid] = breakdown.get(tid, 0) + 1
            placed.append({
                "id": f"pb_{pb_counter:05d}",
                "type_id": tid,
                "x": round(p["x"], 4), "y": round(p["y"], 4),
                "z": round(current_z, 4),
                "l": round(p["l"], 4), "w": round(p["w"], 4), "h": round(p["h"], 4),
                "ori_kind": p.get("ori_kind", "flat"),
                "layer_index": layer_idx,
                "zone_id": None,
                "support_fraction": 1.0 if current_z < EPS else
                    support_fraction(p, placed[:-1] if placed else [], current_z),
            })
            pb_counter += 1
        for tid in list(remaining.keys()):
            if remaining[tid] <= 0:
                remaining.pop(tid, None)

        desc_parts = [f"{n} × {boxes_by_id.get(t, {}).get('name', t)}"
                      for t, n in breakdown.items()]
        layers.append({
            "index": layer_idx,
            "z_bottom": round(current_z, 4),
            "z_top": round(current_z + best_cand["layer_h"], 4),
            "kind": best_cand["kind"],
            "type_breakdown": breakdown,
            "description": {"headline": " + ".join(desc_parts),
                             "body": f"mixed-split ({best_cand['kind']})",
                             "zones": []},
            "count": best_cand["count"],
        })
        current_z = round(current_z + best_cand["layer_h"], 4)

    for tid, v in remaining.items():
        if v > 0:
            unplaced[tid] = unplaced.get(tid, 0) + v

    total_height = max((p["z"] + p["h"] for p in placed), default=0.0)
    total_vol = sum(p["l"] * p["w"] * p["h"] for p in placed)
    pallet_vol = pallet_l * pallet_w * max(total_height, 0.001)
    efficiency = round(total_vol / pallet_vol, 4) if pallet_vol > 0 else 0.0

    return {
        "placed_boxes": placed,
        "layers": layers,
        "unplaced": unplaced,
        "stats": {
            "total_boxes": len(placed),
            "layer_count": len(layers),
            "total_height": round(total_height, 2),
            "efficiency": efficiency,
            "unplaced": unplaced,
        },
    }


# ──────────────────────────────────────────────────────────────────
# ZONED COLUMNS PACKER (Idea 4 + 5)
#
# Partition the pallet into rectangular zones. Each zone holds ONE
# box type in ONE orientation, stacked as identical layers (a tower).
# Recursive guillotine-style search over candidate "blocks" finds
# the partition that maximises placed count and minimises height
# (equalises zone heights → flat top, clean edges).
#
# A "block" = (cols × rows) footprint × `layers` stacks. Zone size
# is exactly cols*ol × rows*ow (tight) so no wasted footprint.
# ──────────────────────────────────────────────────────────────────


def _zone_block_candidates(
    box: Dict, qty: int,
    max_l: float, max_w: float, max_z: float,
    max_kontovka: int = 3,
    forced_grid: Optional[Dict] = None,
) -> List[Dict]:
    """
    Enumerate all valid (orientation, cols, rows, layers) blocks for this
    box type fitting within max_l × max_w × max_z.

    Each entry: {ori, cols, rows, layers, placed, block_l, block_w, height}.
    Standing (kontovka) only for 50r boxes; depth ≤ max_kontovka.
    forced_grid (if given) restricts to that exact grid + flat orientation.
    """
    L, W, H = box["length"], box["width"], box["height"]
    allowed_kinds = box.get("allowed_orientations") or ["flat", "stand"]
    is50 = _is_50_rollen(box)
    is20 = _is_20_rollen(box)

    # Build (orientation, preference_score) list.
    # Higher preference_score = better — applied as bonus in _cand_score below.
    oris_with_pref: List[Tuple[Tuple, float]] = []

    if forced_grid:
        # Forced grid is absolute — single orientation with fixed dimensions.
        oris_with_pref.append((
            (forced_grid["box_l"], forced_grid["box_w"], H, "flat"), 0.0,
        ))
    elif is20:
        # User rule for T20-*: long side along Y (pallet width) by default.
        # The L/W-swapped variant is allowed as a fallback (with penalty)
        # in case the preferred orientation can't fit the zone at all.
        long_side = max(L, W)
        short_side = min(L, W)
        oris_with_pref.append((
            (short_side, long_side, H, "flat"), 500.0,   # preferred
        ))
        if abs(long_side - short_side) > EPS:
            oris_with_pref.append((
                (long_side, short_side, H, "flat"), -500.0,  # fallback
            ))
        # No kontovka for T20.
    else:
        for o in flat_orientations(L, W, H, allowed_kinds):
            oris_with_pref.append((o, 0.0))
        if is50:
            for o in get_orientations(L, W, H, allowed_kinds):
                if o[3] == "stand":
                    # Mild penalty so flat is tried first when both fit.
                    oris_with_pref.append((o, -100.0))

    out: List[Dict] = []
    for ori, pref in oris_with_pref:
        ol, ow, oh, kind = ori
        max_cols = int((max_l + EPS) / ol)
        max_rows = int((max_w + EPS) / ow)
        max_layers_h = int((max_z + EPS) / oh)
        if max_cols < 1 or max_rows < 1 or max_layers_h < 1:
            continue

        # Forced grid: exact cols × rows only
        if forced_grid:
            fg_cols, fg_rows = forced_grid["cols"], forced_grid["rows"]
            if fg_cols > max_cols or fg_rows > max_rows:
                # Allow a partial use of the forced grid: cols ≤ fg_cols
                # but only when there's enough qty to justify (typically
                # we still want the full grid; partial means user request
                # is small). Skip if can't fit full grid.
                continue
            cols_options = [fg_cols]
            rows_options = [fg_rows]
        else:
            cols_options = list(range(1, max_cols + 1))
            rows_options = list(range(1, max_rows + 1))

        for cols in cols_options:
            for rows in rows_options:
                # Kontovka depth constraint: at least one dim ≤ max_kontovka
                if kind == "stand":
                    if cols > max_kontovka and rows > max_kontovka:
                        continue

                per_layer = cols * rows
                needed_layers = math.ceil(qty / per_layer)
                layers = min(max_layers_h, needed_layers)
                placed = min(qty, per_layer * layers)
                if placed <= 0:
                    continue

                block_l = cols * ol
                block_w = rows * ow
                height = layers * oh

                out.append({
                    "ori": ori,
                    "cols": cols, "rows": rows, "layers": layers,
                    "placed": placed,
                    "block_l": block_l, "block_w": block_w,
                    "height": height,
                    "pref_bonus": pref,
                })

    # Prune: keep top 6 by score (placed × 1000 − height × 5 − wasted_footprint
    # + orientation preference bonus). Without pruning, search blows up.
    def _cand_score(c: Dict) -> float:
        wasted = max_l * max_w - c["block_l"] * c["block_w"]
        return (c["placed"] * 1000 - c["height"] * 5 - wasted * 0.5
                + c.get("pref_bonus", 0.0))

    out.sort(key=_cand_score, reverse=True)
    return out[:6]


def _materialize_block(type_id: str, block_x: float, block_y: float,
                       block_z: float, block: Dict) -> List[Dict]:
    """Generate placed_boxes for a block.

    block_z is the absolute z of the block's bottom — added to each box's
    local layer offset so positions are pallet-absolute.
    Column-major fill keeps partial layers compact (left-aligned).
    """
    ol, ow, oh, kind = block["ori"]
    cols, rows, layers, placed = block["cols"], block["rows"], block["layers"], block["placed"]
    out: List[Dict] = []
    n = 0
    for layer in range(layers):
        z = block_z + layer * oh
        for c in range(cols):
            for r in range(rows):
                if n >= placed:
                    break
                out.append({
                    "type_id": type_id,
                    "x": block_x + c * ol,
                    "y": block_y + r * ow,
                    "z": z,
                    "l": ol, "w": ow, "h": oh,
                    "ori_kind": kind,
                    "layer_index": layer + 1,  # renumbered globally later
                    "support_fraction": 1.0,
                })
                n += 1
            if n >= placed:
                break
        if n >= placed:
            break
    return out


def _pack_zoned_recursive(
    types_remaining: List[Dict],
    region_x: float, region_y: float, region_z: float,
    region_l: float, region_w: float, region_h: float,
    max_kontovka: int,
    forced_grids: Dict[str, Dict],
    depth: int = 0,
    max_depth: int = 4,
    target_total: int = 0,
) -> Dict:
    """
    Recursive 3D zoned packer.

    Pick a (type, block) and place at corner (region_x, region_y, region_z).
    The remaining 3D space decomposes into THREE rectangular sub-regions:
      • right  — strip to the right of the block
      • back   — strip behind the block
      • top    — volume directly above the block (same footprint)

    Recurse sequentially (right → back → top), passing leftover qty.
    Two split modes (A vs B) distribute footprint differently between
    right and back; top is identical in both.

    types_remaining: list of {id, qty, box}
    Returns {placed_boxes, total_placed, max_top_z, unplaced, score}
    where max_top_z is the absolute z of the highest box edge in this
    region's placements.
    """
    if (region_l < EPS or region_w < EPS or region_h < EPS
            or not types_remaining or depth > max_depth):
        unplaced = {t["id"]: t["qty"] for t in types_remaining if t["qty"] > 0}
        return {
            "placed_boxes": [], "total_placed": 0, "max_top_z": region_z,
            "unplaced": unplaced, "score": -sum(unplaced.values()) * 100000,
        }

    best: Optional[Dict] = None

    for ti, t in enumerate(types_remaining):
        if t["qty"] <= 0:
            continue
        fg = forced_grids.get(t["id"]) if forced_grids else None
        candidates = _zone_block_candidates(
            t["box"], t["qty"], region_l, region_w, region_h,
            max_kontovka, fg,
        )

        for blk in candidates:
            blk_l, blk_w, blk_h = blk["block_l"], blk["block_w"], blk["height"]
            placed_in_block = _materialize_block(
                t["id"], region_x, region_y, region_z, blk,
            )
            block_top_z = region_z + blk_h

            # Update qty pool for recursion
            new_types = []
            for j, t2 in enumerate(types_remaining):
                if j == ti:
                    rem = t2["qty"] - blk["placed"]
                    if rem > 0:
                        new_types.append({**t2, "qty": rem})
                else:
                    new_types.append(t2)

            # Two split modes for the L-shaped footprint remainder:
            # A: right has block_w depth, back has full region_w
            # B: right has full region_w depth, back has block_l width
            # Top sub-region (above block) is the same in both modes.
            for split_mode in ("A", "B"):
                if split_mode == "A":
                    sub_right = (region_x + blk_l, region_y, region_z,
                                 region_l - blk_l, blk_w, region_h)
                    sub_back  = (region_x, region_y + blk_w, region_z,
                                 region_l, region_w - blk_w, region_h)
                else:
                    sub_right = (region_x + blk_l, region_y, region_z,
                                 region_l - blk_l, region_w, region_h)
                    sub_back  = (region_x, region_y + blk_w, region_z,
                                 blk_l, region_w - blk_w, region_h)
                # Top sub-region: directly above the block
                sub_top = (region_x, region_y, block_top_z,
                           blk_l, blk_w, region_h - blk_h)

                # Sequential recursion through (right, back, top), passing
                # leftover qty between calls so types aren't double-counted.
                cur_types = list(new_types)
                accumulated_placed = list(placed_in_block)
                accumulated_top = block_top_z
                sub_results = []

                for sub in (sub_right, sub_back, sub_top):
                    sx, sy, sz, sl, sw, sh = sub
                    sub_res = _pack_zoned_recursive(
                        cur_types, sx, sy, sz, sl, sw, sh,
                        max_kontovka, forced_grids, depth + 1, max_depth,
                        target_total=target_total,
                    )
                    sub_results.append(sub_res)
                    accumulated_placed.extend(sub_res["placed_boxes"])
                    accumulated_top = max(accumulated_top, sub_res["max_top_z"])

                    # Subtract placed boxes from qty pool for next sub-region
                    placed_per_type: Dict[str, int] = {}
                    for p in sub_res["placed_boxes"]:
                        placed_per_type[p["type_id"]] = placed_per_type.get(p["type_id"], 0) + 1
                    new_cur = []
                    for t2 in cur_types:
                        rem = t2["qty"] - placed_per_type.get(t2["id"], 0)
                        if rem > 0:
                            new_cur.append({**t2, "qty": rem})
                    cur_types = new_cur

                total_placed = blk["placed"] + sum(s["total_placed"] for s in sub_results)

                # Unplaced computed against original types_remaining qtys
                placed_total: Dict[str, int] = {}
                for p in accumulated_placed:
                    placed_total[p["type_id"]] = placed_total.get(p["type_id"], 0) + 1
                unplaced: Dict[str, int] = {}
                for t2 in types_remaining:
                    diff = t2["qty"] - placed_total.get(t2["id"], 0)
                    if diff > 0:
                        unplaced[t2["id"]] = diff

                # Stack height (absolute) for scoring penalties
                stack_h = accumulated_top  # already absolute z

                # Mild penalty for "uneven top": measure spread of top-z
                # across direct sub-regions (we want a flat top whenever
                # possible, but not at the cost of placing fewer boxes).
                tops = [block_top_z] + [s["max_top_z"] for s in sub_results]
                tops_nonzero = [tz for tz in tops if tz > region_z + EPS]
                imbalance = (max(tops_nonzero) - min(tops_nonzero)
                             if len(tops_nonzero) >= 2 else 0.0)

                score = (
                    total_placed * 1000
                    - sum(unplaced.values()) * 100000
                    - stack_h * 5
                    - imbalance * 3
                )

                if best is None or score > best["score"]:
                    best = {
                        "placed_boxes": accumulated_placed,
                        "total_placed": total_placed,
                        "max_top_z": stack_h,
                        "unplaced": unplaced,
                        "score": score,
                    }
                    # Early termination: only at INNER depths. At depth 0
                    # we keep exploring all (type, candidate) combos so
                    # the best stack height wins, not the first viable one.
                    target_for_subtree = sum(
                        t["qty"] for t in types_remaining if t["qty"] > 0
                    )
                    if (depth > 0
                            and total_placed >= target_for_subtree):
                        return best

    if best is None:
        unplaced = {t["id"]: t["qty"] for t in types_remaining if t["qty"] > 0}
        return {
            "placed_boxes": [], "total_placed": 0, "max_top_z": region_z,
            "unplaced": unplaced, "score": -sum(unplaced.values()) * 100000,
        }
    return best


def _build_zoned_layers(placed_boxes: List[Dict],
                       boxes_by_id: Dict[str, Dict]) -> List[Dict]:
    """Synthetic layer records grouped by z-stratum."""
    if not placed_boxes:
        return []
    z_levels: Dict[float, List[Dict]] = {}
    for p in placed_boxes:
        key = round(p["z"] * 100) / 100
        z_levels.setdefault(key, []).append(p)

    layers: List[Dict] = []
    for idx, z in enumerate(sorted(z_levels.keys())):
        boxes = z_levels[z]
        breakdown: Dict[str, int] = {}
        for p in boxes:
            breakdown[p["type_id"]] = breakdown.get(p["type_id"], 0) + 1
        max_h = max(p["h"] for p in boxes)
        body_parts = []
        for tid, n in breakdown.items():
            name = boxes_by_id.get(tid, {}).get("name", tid)
            body_parts.append(f"{n}× {name}")
        desc = {
            "headline": f"{len(boxes)} boxes",
            "body": ", ".join(body_parts),
            "zones": [],
        }
        layers.append({
            "index": idx + 1,
            "z_bottom": round(z, 4),
            "z_top": round(z + max_h, 4),
            # LayerRecord only accepts: pure, half-split, mixed-edge, center-cap.
            # Use 'mixed-edge' for multi-type strata in zoned packing.
            "kind": "pure" if len(breakdown) == 1 else "mixed-edge",
            "type_breakdown": breakdown,
            "description": desc,
            "count": len(boxes),
        })
    return layers


def pack_zoned_columns(
    boxes_by_id: Dict[str, Any],
    quantities: Dict[str, int],
    pallet_l: float,
    pallet_w: float,
    max_z: float,
    overhang_pct: float = 0.0,
    max_kontovka: int = 3,
    forced_grids: Optional[Dict[str, Dict]] = None,
) -> Dict:
    """
    Zoned columns packer (Idea 4 + 5):
    Partition the pallet into rectangular vertical zones. Each zone =
    one box type in one orientation, stacked as identical layers.
    Recursive guillotine search finds the partition with most placed
    boxes, lowest stack height, and most balanced zone heights.
    """
    eff_l = pallet_l * (1 + overhang_pct)
    eff_w = pallet_w * (1 + overhang_pct)
    forced_grids = forced_grids or {}

    types_input: List[Dict] = []
    for tid, qty in quantities.items():
        if qty <= 0:
            continue
        box = boxes_by_id.get(tid)
        if not box:
            continue
        types_input.append({"id": tid, "qty": qty, "box": box})

    if not types_input:
        return {
            "placed_boxes": [], "layers": [], "unplaced": dict(quantities),
            "stats": {
                "total_boxes": 0, "layer_count": 0, "total_height": 0,
                "efficiency": 0, "unplaced": dict(quantities),
            },
        }

    # Sort by total volume desc; the largest-volume type tends to anchor
    # the layout best. _pack_zoned_recursive will still try every type
    # as the corner-block candidate, but the order matters when ties
    # occur in the score.
    types_input.sort(
        key=lambda t: -t["box"]["length"] * t["box"]["width"]
                      * t["box"]["height"] * t["qty"]
    )

    total_qty = sum(t["qty"] for t in types_input)
    result = _pack_zoned_recursive(
        types_input, 0.0, 0.0, 0.0, eff_l, eff_w, max_z,
        max_kontovka, forced_grids, depth=0, max_depth=4,
        target_total=total_qty,
    )

    placed_boxes = result["placed_boxes"]
    # Renumber layer_index globally based on z-strata so the layer
    # navigator on the front-end stays consistent across zones.
    if placed_boxes:
        z_set = sorted({round(p["z"], 2) for p in placed_boxes})
        z_to_idx = {z: i + 1 for i, z in enumerate(z_set)}
        for p in placed_boxes:
            p["layer_index"] = z_to_idx[round(p["z"], 2)]

    layers = _build_zoned_layers(placed_boxes, boxes_by_id)
    total_height = max((p["z"] + p["h"] for p in placed_boxes), default=0.0)
    total_vol = sum(p["l"] * p["w"] * p["h"] for p in placed_boxes)
    pallet_vol = pallet_l * pallet_w * max(total_height, 0.001)
    efficiency = round(total_vol / pallet_vol, 4) if pallet_vol > 0 else 0.0

    return {
        "placed_boxes": placed_boxes,
        "layers": layers,
        "unplaced": result["unplaced"],
        "stats": {
            "total_boxes": len(placed_boxes),
            "layer_count": len(layers),
            "total_height": round(total_height, 2),
            "efficiency": efficiency,
            "unplaced": result["unplaced"],
        },
    }


def pack_optimal(
    boxes_by_id: Dict[str, Any],
    quantities: Dict[str, int],
    pallet_l: float,
    pallet_w: float,
    max_z: float,
    overhang_pct: float = 0.0,
    max_kontovka: int = 3,
    forced_grids: Optional[Dict[str, Dict]] = None,
) -> Dict:
    """
    ULTRA-revolutionary master packer.

    Runs multiple strategies in parallel and returns the best:
    - pack_gap_fill_layered (multi-orientation, max boxes/layer)
    - pack_strip_clean_layered with priority 'footprint'
    - pack_strip_clean_layered with priority 'height'
    - pack_strip_clean_layered with kontovka enabled (if 50r boxes present)

    Scoring favours: all-boxes-placed, low stack, single-orientation strips.
    """
    total_requested = sum(quantities.values())
    has_50r = any(_is_50_rollen(boxes_by_id[t]) for t in quantities if t in boxes_by_id)

    strategies = [
        ("gap-fill", lambda: pack_gap_fill_layered(
            boxes_by_id, quantities, pallet_l, pallet_w, max_z,
            overhang_pct, max_kontovka, forced_grids,
        )),
        ("strip-clean-footprint", lambda: pack_strip_clean_layered(
            boxes_by_id, quantities, pallet_l, pallet_w, max_z,
            overhang_pct, max_kontovka, forced_grids,
            priority_key="footprint",
            allow_kontovka_50r=False,
        )),
        ("strip-clean-height", lambda: pack_strip_clean_layered(
            boxes_by_id, quantities, pallet_l, pallet_w, max_z,
            overhang_pct, max_kontovka, forced_grids,
            priority_key="height",
            allow_kontovka_50r=False,
        )),
        # NEW: zoned columns packer (Idea 4 + 5)
        # Vertical rectangular zones, one type per zone, mutual proportion search.
        ("zoned-columns", lambda: pack_zoned_columns(
            boxes_by_id, quantities, pallet_l, pallet_w, max_z,
            overhang_pct, max_kontovka, forced_grids,
        )),
    ]
    if has_50r:
        strategies.append(("strip-clean-kontovka", lambda: pack_strip_clean_layered(
            boxes_by_id, quantities, pallet_l, pallet_w, max_z,
            overhang_pct, max_kontovka, forced_grids,
            priority_key="footprint",
            allow_kontovka_50r=True,
        )))
        # NEW: template-based packer with cross-pattern kontovka for 50r
        strategies.append(("template-kontovka", lambda: pack_template_kontovka_layered(
            boxes_by_id, quantities, pallet_l, pallet_w, max_z,
            overhang_pct, max_kontovka, forced_grids,
        )))

    # Mixed-split: exhaustive 2-zone and 3-zone mixed-orientation search.
    # Always added (not conditional on box type) because it handles arbitrary
    # combinations of flat and stand orientations within the same layer.
    strategies.append(("mixed-split", lambda: _pack_mixed_split_layered(
        boxes_by_id, quantities, pallet_l, pallet_w, max_z,
        overhang_pct, max_kontovka, forced_grids,
    )))

    best = None
    best_name = None
    best_score = -1e9
    all_results = []
    results_by_name: Dict[str, Dict] = {}
    for name, strat in strategies:
        try:
            r = strat()
            s = _score_result(r, total_requested, max_z)
            all_results.append((name, len(r.get("placed_boxes", [])),
                               r.get("stats", {}).get("total_height", 0), s))
            results_by_name[name] = r
            if s > best_score:
                best_score = s
                best = r
                best_name = name
        except Exception:
            continue

    if best is None:
        # Fallback: return empty
        return {
            "placed_boxes": [],
            "layers": [],
            "unplaced": dict(quantities),
            "stats": {
                "total_boxes": 0, "layer_count": 0, "total_height": 0,
                "efficiency": 0, "unplaced": dict(quantities),
            },
        }

    # ── User-preference override: zoned-columns ──
    # User explicitly asked for "rectangular volume per type" structure
    # (Idea 4+5). When zoned-columns places ALL requested boxes AND fits
    # under max_z, prefer it even if score is slightly lower than another
    # strategy. The cleaner zoned structure is what the user is after.
    zoned_r = results_by_name.get("zoned-columns")
    if zoned_r is not None:
        zoned_placed = len(zoned_r.get("placed_boxes", []))
        zoned_height = zoned_r.get("stats", {}).get("total_height", 0)
        if (zoned_placed == total_requested
                and zoned_height <= max_z + EPS):
            best = zoned_r
            best_name = "zoned-columns"

    # Annotate which strategy won (visible in description if needed)
    best["_strategy"] = best_name
    best["_strategy_results"] = all_results
    return best
