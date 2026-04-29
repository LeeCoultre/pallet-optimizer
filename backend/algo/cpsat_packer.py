"""
CP-SAT (Google OR-Tools) packer — provably optimal 3D bin packing.

Models each box TYPE as one or two rectangular blocks (cols×rows×layers
of identical boxes). The solver chooses:
  • orientation per type (long-Y for T20, free for others)
  • grid (cols, rows) per type
  • 3D position (x, y, z) per block

Subject to:
  • No 3D overlap between blocks
  • Support: every block at z>0 must rest fully ("perfect containment")
    on top of another block. Boxes never float.
  • Within pallet (with optional overhang)
  • Within max_z height
  • T20 boxes: long-Y flat only, no kontovka
  • T50 boxes: kontovka allowed but penalised (only used when unavoidable)

Objective: minimise max stack height. Lexicographic with placed-count
(first maximise placed, then minimise height).

Time budget: configurable, default 60 s. The solver returns the best
found so far if it can't prove optimality in time.
"""
from __future__ import annotations
import math
from typing import Dict, List, Optional, Tuple, Any
from ortools.sat.python import cp_model

from .orientations import flat_orientations, get_orientations

# Discretisation: solver works with integer grid units.
# 0.5 cm units strike a good speed/accuracy balance — most box dims
# are in 0.5-cm increments anyway.
SCALE = 2  # 1 cm = 2 units


def _is_50_rollen(box: Dict) -> bool:
    bid = box.get("id", "")
    return bid.startswith("therm_50r_") or bid.startswith("veit_50r_")


def _is_20_rollen(box: Dict) -> bool:
    bid = box.get("id", "")
    return bid.startswith("therm_20r_")


def _enumerate_block_candidates(
    box: Dict,
    qty: int,
    max_l_units: int,
    max_w_units: int,
    max_z_units: int,
    max_kontovka: int,
    forced_grid: Optional[Dict] = None,
    top_k: int = 8,
) -> List[Dict]:
    """Return up to top_k candidate blocks for this box type.
    Each block places `placed` boxes in a (cols × rows × layers) grid.
    Dimensions are in SCALED integer units."""
    L, W, H = box["length"], box["width"], box["height"]
    allowed_kinds = box.get("allowed_orientations") or ["flat", "stand"]
    is_20 = _is_20_rollen(box)
    is_50 = _is_50_rollen(box)

    # Build orientation list per the user's rules.
    oris_with_pref: List[Tuple[Tuple, float]] = []
    if forced_grid:
        oris_with_pref.append((
            (forced_grid["box_l"], forced_grid["box_w"], H, "flat"), 0.0,
        ))
    elif is_20:
        # T20: long side along Y. Fallback (long-X) gets a strong penalty.
        long_side = max(L, W)
        short_side = min(L, W)
        oris_with_pref.append(((short_side, long_side, H, "flat"), 0.0))
        if abs(long_side - short_side) > 1e-6:
            oris_with_pref.append(((long_side, short_side, H, "flat"), -1000.0))
    else:
        for o in flat_orientations(L, W, H, allowed_kinds):
            oris_with_pref.append((o, 0.0))
        if is_50:
            for o in get_orientations(L, W, H, allowed_kinds):
                if o[3] == "stand":
                    oris_with_pref.append((o, -50.0))  # mild kontovka penalty — used when genuinely fits more

    out: List[Dict] = []
    for ori, pref in oris_with_pref:
        ol, ow, oh, kind = ori
        ol_u = int(round(ol * SCALE))
        ow_u = int(round(ow * SCALE))
        oh_u = int(round(oh * SCALE))
        if ol_u < 1 or ow_u < 1 or oh_u < 1:
            continue
        max_cols = max_l_units // ol_u
        max_rows = max_w_units // ow_u
        max_layers_dim = max_z_units // oh_u
        if max_cols < 1 or max_rows < 1 or max_layers_dim < 1:
            continue

        if forced_grid:
            fg_cols, fg_rows = forced_grid["cols"], forced_grid["rows"]
            if fg_cols > max_cols or fg_rows > max_rows:
                continue
            cols_options = [fg_cols]
            rows_options = [fg_rows]
        else:
            cols_options = list(range(1, max_cols + 1))
            rows_options = list(range(1, max_rows + 1))

        for cols in cols_options:
            for rows in rows_options:
                if kind == "stand":
                    if cols > max_kontovka and rows > max_kontovka:
                        continue
                per_layer = cols * rows
                needed_layers = math.ceil(qty / per_layer)
                max_layers = min(max_layers_dim, needed_layers)
                if max_layers < 1:
                    continue
                # Enumerate layer counts: full + a few smaller options so the
                # solver can choose a partial placement when full doesn't fit.
                layer_options = sorted({max_layers, max(1, max_layers // 2), 1})
                for layers in layer_options:
                    placed = min(qty, per_layer * layers)
                    if placed <= 0:
                        continue
                    out.append({
                        "ori": ori,
                        "kind": kind,
                        "cols": cols, "rows": rows, "layers": layers,
                        "placed": placed,
                        "block_l_u": cols * ol_u,
                        "block_w_u": rows * ow_u,
                        "block_h_u": layers * oh_u,
                        "pref_bonus": pref,
                    })

    # Flat candidates: penalise wasted footprint (a flat block that leaves
    # most of the pallet empty is less useful than a compact one).
    # Stand candidates: do NOT penalise for wasted footprint — stand strips
    # are intentionally narrow (they fill a gap beside a flat block) and the
    # wasted-footprint term would kill them before the solver ever sees them.
    def _score_flat(c: Dict) -> float:
        wasted = max_l_units * max_w_units - c["block_l_u"] * c["block_w_u"]
        return (c["placed"] * 1000
                - c["block_h_u"] * 5
                - wasted * 0.5
                + c["pref_bonus"])

    def _score_stand(c: Dict) -> float:
        return (c["placed"] * 1000
                - c["block_h_u"] * 5
                + c["pref_bonus"])

    flat_out  = sorted([c for c in out if c["kind"] != "stand"], key=_score_flat,  reverse=True)
    stand_out = sorted([c for c in out if c["kind"] == "stand"], key=_score_stand, reverse=True)
    # Keep top_k flat candidates + up to 4 stand candidates so strips survive pruning
    return flat_out[:top_k] + stand_out[:4]


def _materialize(type_id: str, block_x_u: int, block_y_u: int,
                 block_z_u: int, cand: Dict) -> List[Dict]:
    """Generate placed_boxes from a chosen candidate at (x, y, z).
    Coordinates passed in scaled units; output is in cm."""
    ol, ow, oh, kind = cand["ori"]
    cols, rows, layers, placed = (
        cand["cols"], cand["rows"], cand["layers"], cand["placed"]
    )
    block_x = block_x_u / SCALE
    block_y = block_y_u / SCALE
    block_z = block_z_u / SCALE

    out: List[Dict] = []
    n = 0
    for layer in range(layers):
        z = block_z + layer * oh
        # Column-major fill: partial layer stays compact left-aligned.
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
                    "layer_index": layer + 1,
                    "support_fraction": 1.0,
                })
                n += 1
            if n >= placed:
                break
        if n >= placed:
            break
    return out


def pack_cpsat(
    boxes_by_id: Dict[str, Any],
    quantities: Dict[str, int],
    pallet_l: float,
    pallet_w: float,
    max_z: float,
    overhang_pct: float = 0.0,
    max_kontovka: int = 3,
    forced_grids: Optional[Dict[str, Dict]] = None,
    fixed_obstacles: Optional[List[Dict]] = None,
    time_limit_s: float = 60.0,
    top_k_candidates: int = 8,
) -> Dict:
    """Provably optimal 3D bin-packing via CP-SAT.

    Returns the same dict shape as other packers (placed_boxes, layers,
    unplaced, stats). If no valid solution found within time_limit_s,
    returns an empty result with all qty in `unplaced`.
    """
    forced_grids = forced_grids or {}
    fixed_obstacles = fixed_obstacles or []
    eff_l = pallet_l * (1 + overhang_pct)
    eff_w = pallet_w * (1 + overhang_pct)
    PL_U = int(round(eff_l * SCALE))
    PW_U = int(round(eff_w * SCALE))
    PH_U = int(round(max_z * SCALE))

    # How far a stacked block may overhang its supporter on each side,
    # in scaled units. Matches the pallet's overhang_pct so visual
    # consistency: if a 14×4 T20-57×40 (82 cm) overhangs the 80 cm pallet
    # by 1 cm on each side, it may also overhang the 80 cm supporter
    # by the same 1 cm. Without this, only "perfect containment" works
    # and grids like 14×4 on a 80-cm floor are rejected.
    OH_X = int(round(overhang_pct * pallet_l * SCALE))
    OH_Y = int(round(overhang_pct * pallet_w * SCALE))

    # Pre-scale obstacles to integer units for the model.
    obstacles_u = [
        {
            "x": int(round(o["x"] * SCALE)),
            "y": int(round(o["y"] * SCALE)),
            "z": int(round(o["z"] * SCALE)),
            "x_end": int(round((o["x"] + o["l"]) * SCALE)),
            "y_end": int(round((o["y"] + o["w"]) * SCALE)),
            "z_end": int(round((o["z"] + o["h"]) * SCALE)),
        }
        for o in fixed_obstacles
    ]

    types_input: List[Tuple[str, int]] = [
        (tid, qty) for tid, qty in quantities.items()
        if qty > 0 and tid in boxes_by_id
    ]
    if not types_input:
        return _empty_result(quantities)

    # Per-type candidate enumeration.
    type_cands: Dict[str, List[Dict]] = {}
    for tid, qty in types_input:
        box = boxes_by_id[tid]
        fg = forced_grids.get(tid)
        cands = _enumerate_block_candidates(
            box, qty, PL_U, PW_U, PH_U, max_kontovka, fg, top_k_candidates,
        )
        if not cands:
            # Box doesn't fit at all — skip.
            continue
        type_cands[tid] = cands

    if not type_cands:
        return _empty_result(quantities)

    # ── Build CP-SAT model ──────────────────────────────────────────
    model = cp_model.CpModel()

    # Choice booleans: choose[tid, idx] = 1 if candidate idx chosen for tid.
    # Index -1 = "skip type" (place 0 boxes). Lets the solver back off when
    # geometric packing is infeasible, rather than returning empty result.
    choose: Dict[Tuple[str, int], cp_model.IntVar] = {}
    skip: Dict[str, cp_model.IntVar] = {}
    for tid, cands in type_cands.items():
        booleans = []
        for i, _ in enumerate(cands):
            v = model.NewBoolVar(f"choose_{tid}_{i}")
            choose[(tid, i)] = v
            booleans.append(v)
        skip_var = model.NewBoolVar(f"skip_{tid}")
        skip[tid] = skip_var
        booleans.append(skip_var)
        # Exactly one of: a candidate, or skip
        model.AddExactlyOne(booleans)

    # Block dimensions (resolved by choice). When skip[tid]=1, all dims = 0.
    bl: Dict[str, cp_model.IntVar] = {}
    bw: Dict[str, cp_model.IntVar] = {}
    bh: Dict[str, cp_model.IntVar] = {}
    placed_count: Dict[str, cp_model.IntVar] = {}
    for tid, cands in type_cands.items():
        max_bl = max(c["block_l_u"] for c in cands)
        max_bw = max(c["block_w_u"] for c in cands)
        max_bh = max(c["block_h_u"] for c in cands)
        max_pc = max(c["placed"] for c in cands)
        bl[tid] = model.NewIntVar(0, max_bl, f"bl_{tid}")
        bw[tid] = model.NewIntVar(0, max_bw, f"bw_{tid}")
        bh[tid] = model.NewIntVar(0, max_bh, f"bh_{tid}")
        placed_count[tid] = model.NewIntVar(0, max_pc, f"placed_{tid}")
        for i, c in enumerate(cands):
            model.Add(bl[tid] == c["block_l_u"]).OnlyEnforceIf(choose[(tid, i)])
            model.Add(bw[tid] == c["block_w_u"]).OnlyEnforceIf(choose[(tid, i)])
            model.Add(bh[tid] == c["block_h_u"]).OnlyEnforceIf(choose[(tid, i)])
            model.Add(placed_count[tid] == c["placed"]).OnlyEnforceIf(choose[(tid, i)])
        # Skip case: zero out all dims and placed count
        model.Add(bl[tid] == 0).OnlyEnforceIf(skip[tid])
        model.Add(bw[tid] == 0).OnlyEnforceIf(skip[tid])
        model.Add(bh[tid] == 0).OnlyEnforceIf(skip[tid])
        model.Add(placed_count[tid] == 0).OnlyEnforceIf(skip[tid])

    # Block positions (origin at lower-left-bottom corner).
    x: Dict[str, cp_model.IntVar] = {}
    y: Dict[str, cp_model.IntVar] = {}
    z: Dict[str, cp_model.IntVar] = {}
    x_end: Dict[str, cp_model.IntVar] = {}
    y_end: Dict[str, cp_model.IntVar] = {}
    z_end: Dict[str, cp_model.IntVar] = {}
    for tid in type_cands:
        x[tid] = model.NewIntVar(0, PL_U, f"x_{tid}")
        y[tid] = model.NewIntVar(0, PW_U, f"y_{tid}")
        z[tid] = model.NewIntVar(0, PH_U, f"z_{tid}")
        x_end[tid] = model.NewIntVar(0, PL_U, f"xend_{tid}")
        y_end[tid] = model.NewIntVar(0, PW_U, f"yend_{tid}")
        z_end[tid] = model.NewIntVar(0, PH_U, f"zend_{tid}")
        # End = start + dim (within pallet/max_z)
        model.Add(x_end[tid] == x[tid] + bl[tid])
        model.Add(y_end[tid] == y[tid] + bw[tid])
        model.Add(z_end[tid] == z[tid] + bh[tid])
        model.Add(x_end[tid] <= PL_U)
        model.Add(y_end[tid] <= PW_U)
        model.Add(z_end[tid] <= PH_U)

    # 3D no-overlap between every pair of blocks.
    # Either one is to the left/right/front/back/below/above of the other.
    tids = list(type_cands.keys())
    for i in range(len(tids)):
        for j in range(i + 1, len(tids)):
            t1, t2 = tids[i], tids[j]
            sx1 = model.NewBoolVar(f"sep_x1_{t1}_{t2}")  # t1 left of t2
            sx2 = model.NewBoolVar(f"sep_x2_{t1}_{t2}")  # t1 right of t2
            sy1 = model.NewBoolVar(f"sep_y1_{t1}_{t2}")
            sy2 = model.NewBoolVar(f"sep_y2_{t1}_{t2}")
            sz1 = model.NewBoolVar(f"sep_z1_{t1}_{t2}")  # t1 below t2
            sz2 = model.NewBoolVar(f"sep_z2_{t1}_{t2}")  # t1 above t2
            model.AddBoolOr([sx1, sx2, sy1, sy2, sz1, sz2])
            model.Add(x_end[t1] <= x[t2]).OnlyEnforceIf(sx1)
            model.Add(x_end[t2] <= x[t1]).OnlyEnforceIf(sx2)
            model.Add(y_end[t1] <= y[t2]).OnlyEnforceIf(sy1)
            model.Add(y_end[t2] <= y[t1]).OnlyEnforceIf(sy2)
            model.Add(z_end[t1] <= z[t2]).OnlyEnforceIf(sz1)
            model.Add(z_end[t2] <= z[t1]).OnlyEnforceIf(sz2)

    # 3D no-overlap between candidate blocks and FIXED OBSTACLES (locked
    # zones from previous Optimize runs). Obstacles have fixed position;
    # candidate blocks must steer clear unless they sit fully above/below.
    for tid in tids:
        for oi, ob in enumerate(obstacles_u):
            sx1 = model.NewBoolVar(f"obs_sx1_{tid}_{oi}")
            sx2 = model.NewBoolVar(f"obs_sx2_{tid}_{oi}")
            sy1 = model.NewBoolVar(f"obs_sy1_{tid}_{oi}")
            sy2 = model.NewBoolVar(f"obs_sy2_{tid}_{oi}")
            sz1 = model.NewBoolVar(f"obs_sz1_{tid}_{oi}")  # block below obs
            sz2 = model.NewBoolVar(f"obs_sz2_{tid}_{oi}")  # block above obs
            model.AddBoolOr([sx1, sx2, sy1, sy2, sz1, sz2])
            model.Add(x_end[tid] <= ob["x"]).OnlyEnforceIf(sx1)
            model.Add(ob["x_end"] <= x[tid]).OnlyEnforceIf(sx2)
            model.Add(y_end[tid] <= ob["y"]).OnlyEnforceIf(sy1)
            model.Add(ob["y_end"] <= y[tid]).OnlyEnforceIf(sy2)
            model.Add(z_end[tid] <= ob["z"]).OnlyEnforceIf(sz1)
            model.Add(ob["z_end"] <= z[tid]).OnlyEnforceIf(sz2)

    # Support constraint: each block at z>0 must perfectly rest on
    # exactly one OTHER block (top of supporter == bottom of supported,
    # supporter's footprint fully contains the supported's footprint).
    # The "perfect containment" rule guarantees no partial-support flying.
    for tid_b in tids:
        # is_grounded = (z[tid_b] == 0)
        grounded = model.NewBoolVar(f"grounded_{tid_b}")
        model.Add(z[tid_b] == 0).OnlyEnforceIf(grounded)
        model.Add(z[tid_b] >= 1).OnlyEnforceIf(grounded.Not())

        supported_by_any = []
        for tid_s in tids:
            if tid_s == tid_b:
                continue
            sup = model.NewBoolVar(f"sup_{tid_s}_{tid_b}")
            # tid_s supports tid_b iff:
            # 1. top of s == bottom of b
            # 2. b's footprint contained in s's footprint, allowing
            #    OH_X / OH_Y units of overhang on each side (matches
            #    pallet overhang allowance).
            model.Add(z_end[tid_s] == z[tid_b]).OnlyEnforceIf(sup)
            model.Add(x[tid_s] - OH_X <= x[tid_b]).OnlyEnforceIf(sup)
            model.Add(x_end[tid_b] <= x_end[tid_s] + OH_X).OnlyEnforceIf(sup)
            model.Add(y[tid_s] - OH_Y <= y[tid_b]).OnlyEnforceIf(sup)
            model.Add(y_end[tid_b] <= y_end[tid_s] + OH_Y).OnlyEnforceIf(sup)
            supported_by_any.append(sup)

        # Fixed obstacles (locked zones from previous runs) can also act
        # as supporters — new blocks may rest on them, just like on other
        # candidate blocks. Same OH_X/OH_Y overhang allowance.
        for oi, ob in enumerate(obstacles_u):
            sup_o = model.NewBoolVar(f"sup_obs_{oi}_{tid_b}")
            model.Add(z[tid_b] == ob["z_end"]).OnlyEnforceIf(sup_o)
            model.Add(x[tid_b] >= ob["x"] - OH_X).OnlyEnforceIf(sup_o)
            model.Add(x_end[tid_b] <= ob["x_end"] + OH_X).OnlyEnforceIf(sup_o)
            model.Add(y[tid_b] >= ob["y"] - OH_Y).OnlyEnforceIf(sup_o)
            model.Add(y_end[tid_b] <= ob["y_end"] + OH_Y).OnlyEnforceIf(sup_o)
            supported_by_any.append(sup_o)

        # If not grounded, must be supported by at least one
        if supported_by_any:
            model.AddBoolOr(supported_by_any + [grounded])
        else:
            model.Add(z[tid_b] == 0)  # only one block — must be on floor

    # Objective: maximise placed, then minimise stack height.
    # Combine into a single weighted objective so CP-SAT optimises both.
    max_top = model.NewIntVar(0, PH_U, "max_top")
    for tid in tids:
        model.Add(max_top >= z_end[tid])

    total_placed = model.NewIntVar(0, sum(qty for _, qty in types_input), "total_placed")
    model.Add(total_placed == sum(placed_count[t] for t in tids))
    total_requested = sum(qty for _, qty in types_input)

    # Penalty for kontovka use (any candidate with kind="stand" chosen)
    kontovka_penalty = model.NewIntVar(0, 100000, "kontovka_pen")
    kontovka_terms = []
    for tid, cands in type_cands.items():
        for i, c in enumerate(cands):
            if c["kind"] == "stand":
                # Penalty proportional to number placed via kontovka
                kontovka_terms.append(choose[(tid, i)] * c["placed"] * 10)
    if kontovka_terms:
        model.Add(kontovka_penalty == sum(kontovka_terms))
    else:
        model.Add(kontovka_penalty == 0)

    # Orientation preference bonus, lifted INTO the objective (not just
    # the candidate pruning score). This makes the long-Y rule for T20
    # actually win when stack height is equal — otherwise CP-SAT picks
    # an arbitrary tied solution.
    pref_terms = []
    for tid, cands in type_cands.items():
        for i, c in enumerate(cands):
            pb = int(round(c.get("pref_bonus", 0.0)))
            if pb != 0:
                pref_terms.append(choose[(tid, i)] * pb)
    if pref_terms:
        # Bound generously — pref_bonus values are in [-1000, +1000].
        pref_obj = model.NewIntVar(-1_000_000, 1_000_000, "pref_obj")
        model.Add(pref_obj == sum(pref_terms))
    else:
        pref_obj = 0

    # Footprint-size tie-breaker: prefer the WIDER block when stack
    # height and placed count are equal. Without this, CP-SAT might pick
    # a 13×4 grid (110.5 cm wide) over the visually cleaner 14×4 grid
    # (119 cm — full pallet width). Weight is intentionally tiny so it
    # only breaks ties, never overrides height/placed.
    size_terms = []
    max_size_sum = 0
    for tid, cands in type_cands.items():
        per_type_max = max(c["block_l_u"] + c["block_w_u"] for c in cands)
        max_size_sum += per_type_max
        for i, c in enumerate(cands):
            size_terms.append(choose[(tid, i)] * (c["block_l_u"] + c["block_w_u"]))
    if size_terms:
        size_obj = model.NewIntVar(0, max_size_sum, "size_obj")
        model.Add(size_obj == sum(size_terms))
    else:
        size_obj = 0

    # Lexicographic objective:
    #   1) maximise placed (×BIG dominates)
    #   2) minimise stack height
    #   3) minimise kontovka use
    #   4) honour orientation preference (long-Y for T20 etc.)
    #   5) prefer larger footprint blocks (tie-breaker)
    BIG = 10_000_000
    model.Maximize(
        total_placed * BIG
        - max_top * 100
        - kontovka_penalty
        + pref_obj
        + size_obj
    )

    # ── Solve ─────────────────────────────────────────────────────
    solver = cp_model.CpSolver()
    solver.parameters.max_time_in_seconds = time_limit_s
    solver.parameters.num_search_workers = 8  # parallel search

    status = solver.Solve(model)

    if status not in (cp_model.OPTIMAL, cp_model.FEASIBLE):
        return _empty_result(quantities)

    # ── Extract solution ─────────────────────────────────────────
    placed_boxes: List[Dict] = []
    for tid, cands in type_cands.items():
        chosen_idx = None
        for i in range(len(cands)):
            if solver.Value(choose[(tid, i)]) == 1:
                chosen_idx = i
                break
        if chosen_idx is None:
            continue
        cand = cands[chosen_idx]
        bx = solver.Value(x[tid])
        by = solver.Value(y[tid])
        bz = solver.Value(z[tid])
        placed_boxes.extend(_materialize(tid, bx, by, bz, cand))

    # Renumber layer_index globally based on z-strata
    if placed_boxes:
        z_set = sorted({round(p["z"], 2) for p in placed_boxes})
        z_to_idx = {zv: i + 1 for i, zv in enumerate(z_set)}
        for p in placed_boxes:
            p["layer_index"] = z_to_idx[round(p["z"], 2)]

    layers = _build_layers(placed_boxes, boxes_by_id)
    total_height = max((p["z"] + p["h"] for p in placed_boxes), default=0.0)
    total_vol = sum(p["l"] * p["w"] * p["h"] for p in placed_boxes)
    pallet_vol = pallet_l * pallet_w * max(total_height, 0.001)
    efficiency = round(total_vol / pallet_vol, 4) if pallet_vol > 0 else 0.0

    placed_per_type: Dict[str, int] = {}
    for p in placed_boxes:
        placed_per_type[p["type_id"]] = placed_per_type.get(p["type_id"], 0) + 1
    unplaced = {}
    for tid, qty in quantities.items():
        diff = qty - placed_per_type.get(tid, 0)
        if diff > 0:
            unplaced[tid] = diff

    return {
        "placed_boxes": placed_boxes,
        "layers": layers,
        "unplaced": unplaced,
        "stats": {
            "total_boxes": len(placed_boxes),
            "layer_count": len(layers),
            "total_height": round(total_height, 2),
            "efficiency": efficiency,
            "unplaced": unplaced,
        },
        "_solver_status": solver.StatusName(status),
        "_solve_time_s": round(solver.WallTime(), 2),
    }


def _empty_result(quantities: Dict[str, int]) -> Dict:
    unplaced = {k: v for k, v in quantities.items() if v > 0}
    return {
        "placed_boxes": [],
        "layers": [],
        "unplaced": unplaced,
        "stats": {
            "total_boxes": 0,
            "layer_count": 0,
            "total_height": 0,
            "efficiency": 0,
            "unplaced": unplaced,
        },
    }


def _build_layers(placed_boxes: List[Dict],
                  boxes_by_id: Dict[str, Dict]) -> List[Dict]:
    """Synthetic layer records grouped by z-stratum."""
    if not placed_boxes:
        return []
    z_levels: Dict[float, List[Dict]] = {}
    for p in placed_boxes:
        key = round(p["z"] * 100) / 100
        z_levels.setdefault(key, []).append(p)
    layers: List[Dict] = []
    for idx, zv in enumerate(sorted(z_levels.keys())):
        boxes = z_levels[zv]
        breakdown: Dict[str, int] = {}
        for p in boxes:
            breakdown[p["type_id"]] = breakdown.get(p["type_id"], 0) + 1
        max_h = max(p["h"] for p in boxes)
        body = ", ".join(
            f"{n}× {boxes_by_id.get(tid, {}).get('name', tid)}"
            for tid, n in breakdown.items()
        )
        layers.append({
            "index": idx + 1,
            "z_bottom": round(zv, 4),
            "z_top": round(zv + max_h, 4),
            "kind": "pure" if len(breakdown) == 1 else "mixed-edge",
            "type_breakdown": breakdown,
            "description": {
                "headline": f"{len(boxes)} boxes",
                "body": body,
                "zones": [],
            },
            "count": len(boxes),
        })
    return layers
