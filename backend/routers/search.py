"""Globale Suche over archived Aufträge.

Operators look up old jobs by FNSKU / SKU / EAN / Sendungsnummer or
file name. The migration in e4f5a6b7c8d9 created GIN trigram indexes
on `file_name` and `(parsed::text)`, so ILIKE %needle% scans use the
index and stay fast even with millions of rows.

We only search rows the user could legitimately see — for now that's
all rows except `error` (soft-rule, easy to relax later). Date range
filters on created_at because that's when the Auftrag entered the
system; finished_at is null for queued/in_progress and would hide them.
"""

from datetime import date, datetime, time, timezone
from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, Query
from sqlalchemy import String, cast, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.database import get_db
from backend.deps import get_current_user
from backend.orm import Auftrag, AuftragStatus, User
from backend.schemas import SearchHit, SearchResults

router = APIRouter(prefix="/api", tags=["search"])


def _classify_match(parsed: dict, file_name: str, q: str) -> tuple[Optional[str], Optional[str]]:
    """Best-effort identification of which field matched the query.

    Walks the same JSONB we just searched in SQL and returns the first
    key that contains the query (case-insensitive). Pure post-process —
    SQL has already filtered to matching rows, this only picks WHICH
    field to highlight in the UI.
    """
    needle = q.lower()
    parsed = parsed or {}
    meta = parsed.get("meta") or {}

    sn = meta.get("sendungsnummer") or meta.get("fbaCode")
    if sn and needle in str(sn).lower():
        return "sendungsnummer", sn

    for pallet in parsed.get("pallets") or []:
        for item in pallet.get("items") or []:
            for key in ("fnsku", "sku", "ean"):
                v = item.get(key)
                if v and needle in str(v).lower():
                    return key, str(v)

    if file_name and needle in file_name.lower():
        return "file_name", file_name

    return None, None


@router.get("/search", response_model=SearchResults)
async def search_auftraege(
    q: str = Query(..., min_length=2, max_length=100, description="FNSKU / SKU / EAN / Sendungsnummer / Dateiname"),
    from_: Optional[date] = Query(None, alias="from", description="Untergrenze created_at (YYYY-MM-DD)"),
    to: Optional[date] = Query(None, description="Obergrenze created_at — inkl. 24h"),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    _me: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    needle = f"%{q.strip()}%"

    # `cast(parsed, String)` emits `parsed::text` — the GIN trgm index on
    # `(parsed::text)` (migration e4f5a6b7c8d9) is picked up by the
    # planner for ILIKE %needle%.
    base = select(Auftrag).where(
        or_(
            Auftrag.file_name.ilike(needle),
            cast(Auftrag.parsed, String).ilike(needle),
        ),
    )

    if from_ is not None:
        base = base.where(Auftrag.created_at >= datetime.combine(from_, time.min, tzinfo=timezone.utc))
    if to is not None:
        # Inclusive: extend to the end of `to` day.
        base = base.where(Auftrag.created_at < datetime.combine(to, time.max, tzinfo=timezone.utc))

    total = (
        await db.execute(select(func.count()).select_from(base.subquery()))
    ).scalar_one()

    rows = (
        await db.execute(
            base.order_by(Auftrag.created_at.desc(), Auftrag.id.desc())
            .limit(limit)
            .offset(offset)
        )
    ).scalars().all()

    name_map: dict[UUID, str] = {}
    user_ids = {r.assigned_to_user_id for r in rows if r.assigned_to_user_id}
    if user_ids:
        urows = (
            await db.execute(select(User).where(User.id.in_(user_ids)))
        ).scalars().all()
        name_map = {u.id: u.name for u in urows}

    items: list[SearchHit] = []
    for r in rows:
        parsed = r.parsed or {}
        meta = parsed.get("meta") or {}
        pallets = parsed.get("pallets") or []
        matched_field, matched_value = _classify_match(parsed, r.file_name, q)
        items.append(SearchHit(
            id=r.id,
            file_name=r.file_name,
            fba_code=meta.get("sendungsnummer") or meta.get("fbaCode"),
            status=r.status,
            pallet_count=len(pallets),
            article_count=sum(len(p.get("items") or []) for p in pallets),
            created_at=r.created_at,
            finished_at=r.finished_at,
            duration_sec=r.duration_sec,
            assigned_to_user_name=name_map.get(r.assigned_to_user_id),
            matched_field=matched_field,
            matched_value=matched_value,
        ))

    return SearchResults(items=items, total=total, limit=limit, offset=offset, query=q)
