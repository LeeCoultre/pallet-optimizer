"""Tests for /api/sku-dimensions/* and /api/admin/sku-dimensions/*.

Covers:
  • Lookup waterfall (FNSKU → SKU → EAN), batch behavior, missing keys
  • Admin auth (401/403 for non-admin)
  • CRUD via JSON body
  • Xlsx import: column aliases, comma decimals, upsert semantics, errors
"""

from io import BytesIO

import pytest
import openpyxl
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.database import AsyncSessionLocal
from backend.orm import SkuDimension


# ─── Helpers ─────────────────────────────────────────────────────────

async def _seed(rows: list[dict]) -> None:
    """Seed test rows. Each `rows[i]` may pass single keys (fnsku=...,
    sku=..., ean=...) for legacy convenience; they're wrapped into the
    array columns automatically."""
    async with AsyncSessionLocal() as s:
        for r in rows:
            fnskus = r.get("fnskus") or ([r["fnsku"]] if r.get("fnsku") else [])
            skus = r.get("skus") or ([r["sku"]] if r.get("sku") else [])
            eans = r.get("eans") or ([r["ean"]] if r.get("ean") else [])
            s.add(SkuDimension(
                fnskus=fnskus,
                skus=skus,
                eans=eans,
                title=r.get("title"),
                length_cm=r.get("length_cm", 10),
                width_cm=r.get("width_cm", 10),
                height_cm=r.get("height_cm", 10),
                weight_kg=r.get("weight_kg", 0.5),
                source=r.get("source", "manual"),
            ))
        await s.commit()


def _make_xlsx(rows: list[list], headers: list[str]) -> bytes:
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.append(headers)
    for r in rows:
        ws.append(r)
    buf = BytesIO()
    wb.save(buf)
    return buf.getvalue()


# ─── Lookup ──────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_lookup_returns_match_by_fnsku(client, user, as_user):
    as_user(user)
    await _seed([{"fnsku": "X001ABCDEF", "length_cm": 30, "width_cm": 20, "height_cm": 10, "weight_kg": 1.5}])
    r = await client.get("/api/sku-dimensions/lookup?keys=X001ABCDEF")
    assert r.status_code == 200
    data = r.json()
    assert data["lookups"]["X001ABCDEF"]["length_cm"] == 30
    assert data["lookups"]["X001ABCDEF"]["weight_kg"] == 1.5
    assert data["missing"] == []


@pytest.mark.asyncio
async def test_lookup_waterfall_finds_by_sku_then_ean(client, user, as_user):
    as_user(user)
    await _seed([
        {"sku": "MERCH-1", "length_cm": 5, "width_cm": 5, "height_cm": 5, "weight_kg": 0.1},
        {"ean": "4012345678901", "length_cm": 9, "width_cm": 9, "height_cm": 9, "weight_kg": 0.9},
    ])
    r = await client.get("/api/sku-dimensions/lookup?keys=MERCH-1&keys=4012345678901&keys=NOPE")
    data = r.json()
    assert data["lookups"]["MERCH-1"]["length_cm"] == 5
    assert data["lookups"]["4012345678901"]["weight_kg"] == 0.9
    assert data["missing"] == ["NOPE"]


@pytest.mark.asyncio
async def test_lookup_empty_keys_returns_empty(client, user, as_user):
    as_user(user)
    r = await client.get("/api/sku-dimensions/lookup")
    assert r.status_code == 200
    assert r.json() == {"lookups": {}, "missing": []}


@pytest.mark.asyncio
async def test_lookup_requires_auth(client):
    # No as_user() — get_current_user not overridden, so falls through to JWT verify
    r = await client.get("/api/sku-dimensions/lookup?keys=X1")
    assert r.status_code == 401


# ─── Admin: list / patch / delete ────────────────────────────────────

@pytest.mark.asyncio
async def test_admin_list_filters_by_search(client, admin, as_user):
    as_user(admin)
    await _seed([
        {"fnsku": "X001AAA", "title": "Thermorollen 57x40"},
        {"fnsku": "X001BBB", "title": "Klebeband"},
        {"sku": "ZZ-99",     "title": "Tachorollen"},
    ])
    r = await client.get("/api/admin/sku-dimensions?q=Klebeband")
    data = r.json()
    assert data["total"] == 1
    assert data["items"][0]["fnskus"] == ["X001BBB"]


@pytest.mark.asyncio
async def test_admin_list_pagination(client, admin, as_user):
    as_user(admin)
    await _seed([{"fnsku": f"X{i:04}"} for i in range(120)])
    r1 = await client.get("/api/admin/sku-dimensions?limit=50&offset=0")
    r2 = await client.get("/api/admin/sku-dimensions?limit=50&offset=50")
    assert r1.json()["total"] == 120
    assert len(r1.json()["items"]) == 50
    assert len(r2.json()["items"]) == 50
    # No id overlap between pages
    ids1 = {it["id"] for it in r1.json()["items"]}
    ids2 = {it["id"] for it in r2.json()["items"]}
    assert ids1.isdisjoint(ids2)


@pytest.mark.asyncio
async def test_admin_endpoints_require_admin(client, user, as_user):
    as_user(user)
    r = await client.get("/api/admin/sku-dimensions")
    assert r.status_code == 403


@pytest.mark.asyncio
async def test_admin_patch_updates_row(client, admin, as_user):
    as_user(admin)
    await _seed([{"fnsku": "X1", "length_cm": 10, "width_cm": 10, "height_cm": 10, "weight_kg": 0.5}])
    async with AsyncSessionLocal() as s:
        row = (await s.execute(select(SkuDimension))).scalar_one()
    r = await client.patch(f"/api/admin/sku-dimensions/{row.id}", json={
        "fnskus": ["X1", "X1-EU"],
        "skus": [],
        "eans": [],
        "length_cm": 25.5,
        "width_cm": 12.0,
        "height_cm": 8.0,
        "weight_kg": 1.2,
    })
    assert r.status_code == 200
    body = r.json()
    assert body["fnskus"] == ["X1", "X1-EU"]
    assert body["length_cm"] == 25.5
    assert body["weight_kg"] == 1.2
    assert body["source"] == "manual"


@pytest.mark.asyncio
async def test_admin_delete_removes_row(client, admin, as_user):
    as_user(admin)
    await _seed([{"fnsku": "X1"}])
    async with AsyncSessionLocal() as s:
        row = (await s.execute(select(SkuDimension))).scalar_one()
    r = await client.delete(f"/api/admin/sku-dimensions/{row.id}")
    assert r.status_code == 204
    async with AsyncSessionLocal() as s:
        remaining = (await s.execute(select(SkuDimension))).scalars().all()
    assert remaining == []


# ─── Admin: xlsx import ──────────────────────────────────────────────

@pytest.mark.asyncio
async def test_import_creates_new_rows(client, admin, as_user):
    as_user(admin)
    xlsx = _make_xlsx(
        [
            ["X001AAA", "SKU-A", "4012345001234", "Thermorollen", 8.5, 8.5, 5.0, 0.18],
            ["X001BBB", "SKU-B", "4012345001235", "Klebeband", 6.0, 4.0, 4.0, 0.06],
        ],
        ["FNSKU", "SKU", "EAN", "Title", "L (cm)", "B (cm)", "H (cm)", "Gewicht (kg)"],
    )
    r = await client.post(
        "/api/admin/sku-dimensions/import",
        files={"file": ("test.xlsx", xlsx, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")},
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["imported"] == 2
    assert body["updated"] == 0
    async with AsyncSessionLocal() as s:
        rows = (await s.execute(select(SkuDimension))).scalars().all()
    assert len(rows) == 2
    aaa = next(r for r in rows if "X001AAA" in r.fnskus)
    assert aaa.length_cm == 8.5
    assert aaa.weight_kg == 0.18
    assert aaa.source == "xlsx_import"
    assert aaa.updated_by == "admin@test"


@pytest.mark.asyncio
async def test_import_dedupes_multiple_skus_per_ean(client, admin, as_user):
    """User's real-world case: same EAN ships under several SKU codes
    (PRIME / EV / regional channels). All such rows should fold into
    ONE physical-product row with all SKUs accumulated."""
    as_user(admin)
    xlsx = _make_xlsx(
        [
            [None, "9V-2RXQ-UR2X", "9120107187389", "57mm*35mm (20)", 18.5, 7.9, 12.5, 0.72],
            [None, "LK-CEJM-386D", "9120107187389", "57mm*35mm (20)", 18.5, 7.9, 12.5, 0.72],
            [None, "39-67IC-TQ2D", "9120107187389", "57mm*35mm (20)", 18.5, 7.9, 12.5, 0.72],
        ],
        ["FNSKU", "SKU", "EAN", "Title", "L (cm)", "B (cm)", "H (cm)", "Gewicht (kg)"],
    )
    r = await client.post(
        "/api/admin/sku-dimensions/import",
        files={"file": ("multi.xlsx", xlsx, "application/octet-stream")},
    )
    body = r.json()
    assert body["imported"] == 1
    assert body["updated"] == 2
    async with AsyncSessionLocal() as s:
        rows = (await s.execute(select(SkuDimension))).scalars().all()
    assert len(rows) == 1
    assert sorted(rows[0].skus) == sorted(["9V-2RXQ-UR2X", "LK-CEJM-386D", "39-67IC-TQ2D"])
    assert rows[0].eans == ["9120107187389"]


@pytest.mark.asyncio
async def test_lookup_finds_row_by_any_array_member(client, user, as_user):
    """One row, many keys → looking up ANY of them returns the dims."""
    as_user(user)
    await _seed([{"fnskus": ["XALPHA", "XBETA"], "skus": ["S-1", "S-2"], "eans": ["4012345009999"], "length_cm": 5}])
    r = await client.get("/api/sku-dimensions/lookup?keys=XBETA&keys=S-2&keys=4012345009999")
    data = r.json()
    assert set(data["lookups"].keys()) == {"XBETA", "S-2", "4012345009999"}
    assert data["lookups"]["XBETA"]["length_cm"] == 5
    assert data["missing"] == []


@pytest.mark.asyncio
async def test_import_updates_existing_by_fnsku(client, admin, as_user):
    as_user(admin)
    await _seed([{"fnsku": "X001AAA", "length_cm": 10, "weight_kg": 0.5}])
    xlsx = _make_xlsx(
        [["X001AAA", None, None, "New title", 22.0, 14.0, 9.0, 1.1]],
        ["FNSKU", "SKU", "EAN", "Title", "L", "B", "H", "Gewicht"],
    )
    r = await client.post(
        "/api/admin/sku-dimensions/import",
        files={"file": ("test.xlsx", xlsx, "application/octet-stream")},
    )
    body = r.json()
    assert body["imported"] == 0
    assert body["updated"] == 1
    async with AsyncSessionLocal() as s:
        rows = (await s.execute(select(SkuDimension))).scalars().all()
    assert len(rows) == 1
    assert rows[0].length_cm == 22.0
    assert rows[0].weight_kg == 1.1
    assert rows[0].title == "New title"
    assert rows[0].fnskus == ["X001AAA"]


@pytest.mark.asyncio
async def test_import_handles_comma_decimals(client, admin, as_user):
    as_user(admin)
    xlsx = _make_xlsx(
        [["X001AAA", None, None, None, "8,5", "4,2", "3,0", "0,15"]],
        ["FNSKU", "SKU", "EAN", "Title", "L (cm)", "B (cm)", "H (cm)", "Gewicht (kg)"],
    )
    r = await client.post(
        "/api/admin/sku-dimensions/import",
        files={"file": ("test.xlsx", xlsx, "application/octet-stream")},
    )
    body = r.json()
    assert body["imported"] == 1
    async with AsyncSessionLocal() as s:
        row = (await s.execute(select(SkuDimension))).scalar_one()
    assert row.length_cm == 8.5
    assert row.weight_kg == 0.15


@pytest.mark.asyncio
async def test_import_skips_rows_without_keys(client, admin, as_user):
    as_user(admin)
    xlsx = _make_xlsx(
        [
            [None, None, None, "no keys", 5, 5, 5, 0.1],
            ["X001VALID", None, None, "ok", 5, 5, 5, 0.1],
        ],
        ["FNSKU", "SKU", "EAN", "Title", "L", "B", "H", "Gewicht"],
    )
    r = await client.post(
        "/api/admin/sku-dimensions/import",
        files={"file": ("t.xlsx", xlsx, "application/octet-stream")},
    )
    body = r.json()
    assert body["imported"] == 1
    assert body["skipped"] == 1
    assert any("no FNSKU" in w or "no FNSKU/SKU/EAN" in w for w in body["warnings"])


@pytest.mark.asyncio
async def test_import_skips_rows_with_zero_dimensions(client, admin, as_user):
    as_user(admin)
    xlsx = _make_xlsx(
        [
            ["X001AAA", None, None, "zero L", 0, 5, 5, 0.1],
            ["X001BBB", None, None, "missing weight", 5, 5, 5, None],
        ],
        ["FNSKU", "SKU", "EAN", "Title", "L", "B", "H", "Gewicht"],
    )
    r = await client.post(
        "/api/admin/sku-dimensions/import",
        files={"file": ("t.xlsx", xlsx, "application/octet-stream")},
    )
    body = r.json()
    assert body["imported"] == 0
    assert body["skipped"] == 2


@pytest.mark.asyncio
async def test_import_rejects_missing_required_columns(client, admin, as_user):
    as_user(admin)
    xlsx = _make_xlsx(
        [["X001AAA", "title only"]],
        ["FNSKU", "Title"],   # no L/B/H/Gewicht
    )
    r = await client.post(
        "/api/admin/sku-dimensions/import",
        files={"file": ("t.xlsx", xlsx, "application/octet-stream")},
    )
    assert r.status_code == 422
    assert "header" in r.json()["detail"].lower()


@pytest.mark.asyncio
async def test_import_requires_admin(client, user, as_user):
    as_user(user)
    xlsx = _make_xlsx(
        [["X001AAA", None, None, None, 5, 5, 5, 0.1]],
        ["FNSKU", "SKU", "EAN", "Title", "L", "B", "H", "Gewicht"],
    )
    r = await client.post(
        "/api/admin/sku-dimensions/import",
        files={"file": ("t.xlsx", xlsx, "application/octet-stream")},
    )
    assert r.status_code == 403
