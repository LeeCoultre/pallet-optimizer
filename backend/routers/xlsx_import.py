from __future__ import annotations
from fastapi import APIRouter, UploadFile, File, HTTPException
from io import BytesIO
from ..models import ImportResponse, ImportedBox

router = APIRouter()

# Known column aliases (lowercase)
_NAME_ALIASES = {"name", "artikel", "bezeichnung", "produkt", "description"}
_L_ALIASES = {"l", "länge", "laenge", "length", "len"}
_W_ALIASES = {"b", "w", "breite", "width"}
_H_ALIASES = {"h", "höhe", "hoehe", "height"}
_QTY_ALIASES = {"palette", "qty", "quantity", "menge", "per pallet", "max/palette", "max pallet"}

AUTO_COLORS = [
    "#3b82f6", "#8b5cf6", "#10b981", "#f59e0b", "#ef4444",
    "#06b6d4", "#a855f7", "#ec4899", "#14b8a6", "#f97316",
]


def _find_col(headers: list[str], aliases: set[str]) -> int | None:
    for i, h in enumerate(headers):
        norm = str(h or "").strip().lower()
        if norm in aliases:
            return i
        # partial match
        for a in aliases:
            if a in norm:
                return i
    return None


def _parse_float(v) -> float | None:
    if v is None:
        return None
    try:
        return float(str(v).replace(",", ".").strip())
    except (ValueError, TypeError):
        return None


def _parse_int(v) -> int | None:
    if v is None:
        return None
    try:
        return int(float(str(v).strip()))
    except (ValueError, TypeError):
        return None


@router.post("/import-xlsx", response_model=ImportResponse)
async def import_xlsx(file: UploadFile = File(...)):
    if not file.filename or not file.filename.lower().endswith((".xlsx", ".xls")):
        raise HTTPException(status_code=400, detail="Only .xlsx / .xls files accepted")

    try:
        import openpyxl
    except ImportError:
        raise HTTPException(status_code=500, detail="openpyxl not installed")

    content = await file.read()
    try:
        wb = openpyxl.load_workbook(BytesIO(content), read_only=True, data_only=True)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Cannot open file: {e}")

    ws = wb.active
    rows = list(ws.values)
    wb.close()

    # Find header row: look for row with at least L + B/W + H columns
    header_row_idx = None
    col_map: dict[str, int | None] = {}
    for idx, row in enumerate(rows):
        if not row:
            continue
        headers = [str(c or "").strip().lower() for c in row]
        c_l = _find_col(headers, _L_ALIASES)
        c_w = _find_col(headers, _W_ALIASES)
        c_h = _find_col(headers, _H_ALIASES)
        if c_l is not None and c_w is not None and c_h is not None:
            header_row_idx = idx
            col_map = {
                "name": _find_col(headers, _NAME_ALIASES),
                "l": c_l,
                "w": c_w,
                "h": c_h,
                "qty": _find_col(headers, _QTY_ALIASES),
            }
            break

    if header_row_idx is None:
        raise HTTPException(
            status_code=422,
            detail="Could not detect header row with L/B/H columns. "
                   "Ensure column headers contain L, B (or W), H."
        )

    boxes: list[ImportedBox] = []
    warnings: list[str] = []

    for row_idx in range(header_row_idx + 1, len(rows)):
        row = rows[row_idx]
        if not row or all(c is None for c in row):
            continue

        def cell(key: str):
            idx = col_map.get(key)
            if idx is None or idx >= len(row):
                return None
            return row[idx]

        name_val = cell("name")
        l_val = _parse_float(cell("l"))
        w_val = _parse_float(cell("w"))
        h_val = _parse_float(cell("h"))
        qty_val = _parse_int(cell("qty"))

        # Skip rows with no data
        if name_val is None and l_val is None:
            continue

        if l_val is None or w_val is None or h_val is None:
            if name_val is not None:
                warnings.append(f"Row {row_idx + 1} '{name_val}': incomplete dimensions, skipped")
            continue

        name_str = str(name_val).strip() if name_val else f"Box {len(boxes) + 1}"

        if qty_val is None:
            warnings.append(
                f"Row {row_idx + 1} '{name_str}': Palette/qty value missing or non-numeric — "
                f"max_per_pallet set to null"
            )

        boxes.append(ImportedBox(
            name=name_str,
            length=l_val,
            width=w_val,
            height=h_val,
            max_per_pallet=qty_val,
        ))

    return ImportResponse(
        boxes_found=len(boxes),
        boxes=boxes,
        warnings=warnings,
    )
