from __future__ import annotations
import uuid
from fastapi import APIRouter
from ..models import (
    PackRequest, PackResponse, PackStats, PlacedBox, LayerRecord,
    LayerDescription, ZoneDesc, ZoneResult, Orientation,
    SingleLayerRequest, SingleLayerResponse,
)
from ..algo.guillotine import pack_columns
from ..algo.layer_packer import (
    pack_layered, pack_gap_fill_layered, pack_optimal,
    _build_50r_kontovka_layer, _gfl_best_flat_grid, _is_50_rollen,
)
from ..algo.cpsat_packer import pack_cpsat

router = APIRouter()


def _boxes_by_id(request: PackRequest) -> dict:
    return {
        b.id: {
            "id": b.id,
            "name": b.name or b.id,
            "length": b.length,
            "width": b.width,
            "height": b.height,
            "allowed_orientations": b.allowed_orientations,
            "weight_kg": b.weight_kg,
        }
        for b in request.boxes
    }


def _quantities(request: PackRequest) -> dict:
    return {b.id: b.quantity for b in request.boxes}


def _fill_pct(placed_boxes, pallet_l, pallet_w, total_height):
    if not placed_boxes or total_height < 1e-6:
        return 0.0
    total_vol = sum(p["l"] * p["w"] * p["h"] for p in placed_boxes)
    pallet_vol = pallet_l * pallet_w * total_height
    return round(total_vol / pallet_vol * 100, 1)


def _to_response(result: dict, mode: str, request: PackRequest) -> PackResponse:
    pallet = request.pallet
    placed_boxes_raw = result.get("placed_boxes", [])
    layers_raw = result.get("layers", [])
    zones_raw = result.get("zones", [])
    unplaced = result.get("unplaced", {})

    total_height = max((p["z"] + p["h"] for p in placed_boxes_raw), default=0.0)
    fill = _fill_pct(placed_boxes_raw, pallet.length, pallet.width, total_height)

    requested = sum(b.quantity for b in request.boxes)
    total_boxes = len(placed_boxes_raw)

    vol_total = sum(p["l"] * p["w"] * p["h"] for p in placed_boxes_raw)
    pallet_vol = pallet.length * pallet.width * max(total_height, 0.001)
    efficiency = vol_total / pallet_vol

    stats = PackStats(
        total_boxes=total_boxes,
        requested=requested,
        layer_count=len(layers_raw),
        total_height=round(total_height, 2),
        fill_pct=fill,
        efficiency=round(efficiency, 4),
        unplaced={k: v for k, v in unplaced.items() if v > 0},
        mode=mode,
    )

    placed_boxes = [
        PlacedBox(
            id=p.get("id", str(uuid.uuid4())[:8]),
            type_id=p["type_id"],
            x=round(p["x"], 4), y=round(p["y"], 4), z=round(p["z"], 4),
            l=round(p["l"], 4), w=round(p["w"], 4), h=round(p["h"], 4),
            ori_kind=p.get("ori_kind", "flat"),
            layer_index=p.get("layer_index", 1),
            zone_id=p.get("zone_id"),
            support_fraction=round(p.get("support_fraction", 1.0), 3),
        )
        for p in placed_boxes_raw
    ]

    layers = []
    for lr in layers_raw:
        desc_raw = lr.get("description", {})
        desc = LayerDescription(
            headline=desc_raw.get("headline", ""),
            body=desc_raw.get("body", ""),
            zones=[ZoneDesc(label=z["label"], text=z["text"])
                   for z in desc_raw.get("zones", [])],
        )
        layers.append(LayerRecord(
            index=lr["index"],
            z_bottom=round(lr["z_bottom"], 4),
            z_top=round(lr["z_top"], 4),
            kind=lr["kind"],
            type_breakdown=lr.get("type_breakdown", {}),
            description=desc,
            count=lr.get("count", 0),
        ))

    zones = []
    for z in zones_raw:
        ori = z["orientation"]
        zones.append(ZoneResult(
            id=z["id"],
            rect=z["rect"],
            type_id=z["type_id"],
            orientation=Orientation(l=ori["l"], w=ori["w"], h=ori["h"], kind=ori["kind"]),
            grid=z["grid"],
            tiers=z["tiers"],
            boxes=z["boxes"],
            z_top=round(z["z_top"], 4),
        ))

    return PackResponse(
        mode=mode,
        placed_boxes=placed_boxes,
        layers=layers,
        zones=zones,
        stats=stats,
    )


@router.post("/pack", response_model=PackResponse)
async def pack(request: PackRequest):
    pallet = request.pallet
    options = request.options
    boxes_by_id = _boxes_by_id(request)
    quantities = _quantities(request)

    # Handle zone-constrained packing
    if options.zones:
        all_placed = []
        all_zones = []
        unassigned_qty = dict(quantities)
        for zone in options.zones:
            for bid in zone.box_ids:
                unassigned_qty.pop(bid, None)

        pb_offset = 0
        for zone in options.zones:
            rect = zone.rect
            zone_boxes = {k: v for k, v in boxes_by_id.items() if k in zone.box_ids}
            zone_qty = {k: quantities.get(k, 0) for k in zone.box_ids}
            if not zone_boxes or not any(zone_qty.values()):
                continue
            res = pack_columns(
                zone_boxes, zone_qty,
                rect["l"], rect["w"], pallet.max_stack_height,
                overhang_pct=options.overhang_pct,
                max_kontovka=options.max_kontovka_columns,
            )
            if res:
                for p in res["placed_boxes"]:
                    p["x"] += rect.get("x", 0)
                    p["y"] += rect.get("y", 0)
                    p["id"] = f"pb_{pb_offset:05d}"
                    pb_offset += 1
                all_placed.extend(res["placed_boxes"])
                all_zones.extend(res.get("zones", []))

        # Pack unassigned boxes on remaining space (full pallet, guillotine)
        if unassigned_qty and any(unassigned_qty.values()):
            res2 = pack_columns(
                {k: v for k, v in boxes_by_id.items() if k in unassigned_qty},
                unassigned_qty,
                pallet.length, pallet.width, pallet.max_stack_height,
                overhang_pct=options.overhang_pct,
                max_kontovka=options.max_kontovka_columns,
            )
            if res2:
                for p in res2["placed_boxes"]:
                    p["id"] = f"pb_{pb_offset:05d}"
                    pb_offset += 1
                all_placed.extend(res2["placed_boxes"])
                all_zones.extend(res2.get("zones", []))

        # Build synthetic layers from placed boxes
        layers_raw = _build_layers_from_placed(all_placed)
        unplaced_all = {}
        result = {
            "placed_boxes": all_placed,
            "layers": layers_raw,
            "zones": all_zones,
            "unplaced": unplaced_all,
        }
        return _to_response(result, "column-hybrid", request)

    # Build forced_grids dict from options (used by both layered and cpsat)
    forced_grids = None
    if options.forced_grids:
        forced_grids = {
            bid: {"cols": fg.cols, "rows": fg.rows, "box_l": fg.box_l, "box_w": fg.box_w}
            for bid, fg in options.forced_grids.items()
        }

    # CP-SAT mode: provably-optimal solver. Slow but exact.
    if options.preferred_mode == "cpsat":
        # Convert FixedObstacle Pydantic models → plain dicts for the solver.
        obstacles = [
            {"x": o.x, "y": o.y, "z": o.z,
             "l": o.l, "w": o.w, "h": o.h, "type_id": o.type_id}
            for o in (options.fixed_obstacles or [])
        ]
        cpsat_result = pack_cpsat(
            boxes_by_id, quantities,
            pallet.length, pallet.width, pallet.max_stack_height,
            overhang_pct=options.overhang_pct,
            max_kontovka=options.max_kontovka_columns,
            forced_grids=forced_grids,
            fixed_obstacles=obstacles,
            time_limit_s=options.cpsat_time_limit_s,
        )
        cpsat_result["zones"] = []
        return _to_response(cpsat_result, "layered", request)

    # Auto mode: try guillotine first
    guillotine_result = None
    layered_result = None

    if options.preferred_mode in ("auto", "guillotine"):
        guillotine_result = pack_columns(
            boxes_by_id, quantities,
            pallet.length, pallet.width, pallet.max_stack_height,
            overhang_pct=options.overhang_pct,
            max_kontovka=options.max_kontovka_columns,
        )

    if options.preferred_mode in ("auto", "layered"):
        # Use ULTRA optimal packer: tries multiple strategies (gap-fill,
        # strip-clean by footprint/height priority, kontovka for 50r)
        # and picks the best result by combined score
        # (boxes placed, height, orientation cleanliness).
        layered_result = pack_optimal(
            boxes_by_id, quantities,
            pallet.length, pallet.width, pallet.max_stack_height,
            overhang_pct=options.overhang_pct,
            max_kontovka=options.max_kontovka_columns,
            forced_grids=forced_grids,
        )

    # Choose better result (prefer whichever places more boxes)
    def score(r):
        if not r:
            return -1
        placed = r.get("placed_boxes", [])
        total = r.get("total_boxes", len(placed))
        unplaced_count = sum(r.get("unplaced", {}).values())
        return total - unplaced_count * 10  # penalty for unplaced

    g_score = score(guillotine_result) if guillotine_result else -1
    l_score = score(layered_result) if layered_result else -1

    if options.preferred_mode == "guillotine":
        # Explicit guillotine request
        if guillotine_result:
            guillotine_result["layers"] = _synth_layers_guillotine(guillotine_result)
            return _to_response(guillotine_result, "column-hybrid", request)
    elif options.preferred_mode == "layered":
        # Explicit layered request
        if layered_result:
            layered_result["zones"] = []
            return _to_response(layered_result, "layered", request)
    else:
        # Auto: prefer layered (horizontal slab approach) when it places
        # at least as many boxes; fall back to guillotine only when it
        # places strictly more.
        if layered_result and l_score >= g_score:
            layered_result["zones"] = []
            return _to_response(layered_result, "layered", request)
        if guillotine_result:
            guillotine_result["layers"] = _synth_layers_guillotine(guillotine_result)
            return _to_response(guillotine_result, "column-hybrid", request)
        if layered_result:
            layered_result["zones"] = []
            return _to_response(layered_result, "layered", request)

    # Empty result
    return PackResponse(
        mode="layered",
        placed_boxes=[],
        layers=[],
        zones=[],
        stats=PackStats(
            total_boxes=0, requested=sum(quantities.values()),
            layer_count=0, total_height=0, fill_pct=0, efficiency=0,
            unplaced=dict(quantities), mode="layered"
        ),
    )


def _synth_layers_guillotine(result: dict) -> list:
    """Build layer records from guillotine zones (each zone is one 'layer' conceptually)."""
    from ..models import LayerDescription, ZoneDesc
    layers = []
    for i, zone in enumerate(result.get("zones", [])):
        ori = zone["orientation"]
        box_type = zone.get("type_id", "?")
        desc = {
            "headline": f"{zone['boxes']} boxes in Zone {zone['id']}",
            "body": f"Grid {zone['grid']['cols']}×{zone['grid']['rows']}, {zone['tiers']} tier(s), {ori['kind']}",
            "zones": [],
        }
        layers.append({
            "index": i + 1,
            "z_bottom": 0.0,
            "z_top": zone["z_top"],
            "kind": "pure",
            "type_breakdown": {box_type: zone["boxes"]},
            "description": desc,
            "count": zone["boxes"],
        })
    return layers


def _build_layers_from_placed(placed_boxes: list) -> list:
    """Synthetic layer builder for zone-constrained packing."""
    if not placed_boxes:
        return []
    # Group by z level
    z_levels: dict[float, list] = {}
    for p in placed_boxes:
        key = round(p["z"] * 100) / 100
        z_levels.setdefault(key, []).append(p)

    layers = []
    for idx, z in enumerate(sorted(z_levels.keys())):
        boxes = z_levels[z]
        breakdown: dict[str, int] = {}
        for p in boxes:
            breakdown[p["type_id"]] = breakdown.get(p["type_id"], 0) + 1
        max_h = max(p["h"] for p in boxes)
        desc = {
            "headline": f"{len(boxes)} boxes",
            "body": ", ".join(f"{v}×{k}" for k, v in breakdown.items()),
            "zones": [],
        }
        layers.append({
            "index": idx + 1,
            "z_bottom": z,
            "z_top": round(z + max_h, 4),
            "kind": "pure",
            "type_breakdown": breakdown,
            "description": desc,
            "count": len(boxes),
        })
    return layers


@router.post("/single-layer", response_model=SingleLayerResponse)
async def single_layer(req: SingleLayerRequest):
    """Compute optimal layout for exactly one layer of a given box type.

    Used by the Layer Builder mode where the user assembles the pallet
    one layer at a time. For 50r types, returns the cross-kontovka pattern
    (flat + right strip + back strip). For others, returns the best pure
    flat grid.
    """
    box = {
        "id": req.box.id,
        "name": req.box.name or req.box.id,
        "length": req.box.length,
        "width": req.box.width,
        "height": req.box.height,
        "allowed_orientations": req.box.allowed_orientations,
    }
    max_l = req.pallet.length * (1 + req.overhang_pct)
    max_w = req.pallet.width * (1 + req.overhang_pct)

    best_positions: list = []
    best_h = 0.0
    best_count = 0
    best_kind: str = "pure"
    best_headline = ""
    flat_count = 0
    stand_count = 0

    # Always try the pure flat grid as a baseline
    grid = _gfl_best_flat_grid(box, max_l, max_w)
    if grid:
        best_count = grid["count"]
        best_h = grid["box_h"]
        best_kind = "pure"
        best_headline = (
            f"{grid['cols']}×{grid['rows']} = {grid['count']} шт (плоско)"
        )
        flat_count = grid["count"]
        stand_count = 0
        best_positions = []
        for r in range(grid["rows"]):
            for c in range(grid["cols"]):
                best_positions.append({
                    "x": c * grid["box_l"],
                    "y": r * grid["box_w"],
                    "l": grid["box_l"],
                    "w": grid["box_w"],
                    "h": grid["box_h"],
                    "ori_kind": "flat",
                })

    # For 50r types: try the cross-kontovka template — typically beats pure flat
    if _is_50_rollen(box):
        tmpl = _build_50r_kontovka_layer(
            box, max_l, max_w, max_remaining=9999,
            max_kontovka=req.max_kontovka,
        )
        if tmpl and tmpl["count"] > best_count:
            best_count = tmpl["count"]
            best_h = tmpl["layer_h"]
            best_kind = "mixed-edge"
            flat_count = tmpl["flat_count"]
            stand_count = tmpl["stand_count"]
            best_headline = (
                f"{tmpl['flat_count']} плоских + "
                f"{tmpl['stand_count']} на ребре (крест) = {tmpl['count']} шт"
            )
            best_positions = tmpl["positions"]

    # Materialize PlacedBox objects with z, id, type_id, layer_index
    placed = []
    for i, p in enumerate(best_positions):
        placed.append(PlacedBox(
            id=f"bl_{i:04d}",
            type_id=req.box.id,
            x=round(p["x"], 4),
            y=round(p["y"], 4),
            z=round(req.current_z, 4),
            l=round(p["l"], 4),
            w=round(p["w"], 4),
            h=round(p["h"], 4),
            ori_kind=p.get("ori_kind", "flat"),
            layer_index=1,
            zone_id=None,
            support_fraction=1.0,
        ))

    return SingleLayerResponse(
        positions=placed,
        layer_h=round(best_h, 4),
        count=best_count,
        kind=best_kind,
        headline=best_headline,
        flat_count=flat_count,
        stand_count=stand_count,
    )
