"""Live-Aktivität — what every operator is doing right now.

Two slices in one response:

  • active_workers — every user who has an in_progress Auftrag, with
                     the current step and pallet position. This is the
                     "wer arbeitet jetzt" board for shift handover.
  • events         — last N audit_log rows (uploads, starts, completes,
                     cancels, role changes), joined to user.name and to
                     auftraege.file_name. Powers the live feed.

Open to all authenticated users — single-tenant warehouse, 5 known
operators, observing each other's progress is intentional. Polling
cadence is owned by the frontend (TanStack Query staleTime).
"""

from datetime import datetime, time, timezone
from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.database import get_db
from backend.deps import get_current_user
from backend.orm import AuditLog, Auftrag, AuftragStatus, User
from backend.schemas import ActiveWorker, ActivityEvent, ActivityFeed, ShiftInfo

router = APIRouter(prefix="/api/activity", tags=["activity"])


def _fba_from_parsed(parsed: Optional[dict]) -> Optional[str]:
    if not parsed:
        return None
    meta = parsed.get("meta") or {}
    return meta.get("sendungsnummer") or meta.get("fbaCode")


@router.get("/live", response_model=ActivityFeed)
async def live(
    limit: int = Query(50, ge=1, le=200),
    _me: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    # Active workers
    active_rows = (
        await db.execute(
            select(Auftrag, User)
            .join(User, Auftrag.assigned_to_user_id == User.id)
            .where(Auftrag.status == AuftragStatus.in_progress)
            .order_by(Auftrag.started_at.asc().nulls_last())
        )
    ).all()

    active_workers: list[ActiveWorker] = []
    for auftrag, user in active_rows:
        parsed = auftrag.parsed or {}
        pallets = parsed.get("pallets") or []
        active_workers.append(ActiveWorker(
            user_id=user.id,
            user_name=user.name,
            auftrag_id=auftrag.id,
            file_name=auftrag.file_name,
            fba_code=_fba_from_parsed(parsed),
            step=auftrag.step,
            started_at=auftrag.started_at,
            current_pallet_idx=auftrag.current_pallet_idx,
            pallet_count=len(pallets),
        ))

    # Recent events
    audit_rows = (
        await db.execute(
            select(AuditLog).order_by(AuditLog.created_at.desc()).limit(limit)
        )
    ).scalars().all()

    user_ids = {r.user_id for r in audit_rows}
    name_map: dict[UUID, str] = {}
    if user_ids:
        urows = (
            await db.execute(select(User).where(User.id.in_(user_ids)))
        ).scalars().all()
        name_map = {u.id: u.name for u in urows}

    auftrag_ids = {r.auftrag_id for r in audit_rows if r.auftrag_id}
    auftrag_map: dict[UUID, tuple[str, Optional[str]]] = {}
    if auftrag_ids:
        arows = (
            await db.execute(
                select(Auftrag.id, Auftrag.file_name, Auftrag.parsed).where(
                    Auftrag.id.in_(auftrag_ids)
                )
            )
        ).all()
        auftrag_map = {r[0]: (r[1], _fba_from_parsed(r[2])) for r in arows}

    events: list[ActivityEvent] = []
    for r in audit_rows:
        file_name = None
        fba = None
        if r.auftrag_id and r.auftrag_id in auftrag_map:
            file_name, fba = auftrag_map[r.auftrag_id]
        elif r.meta:
            file_name = (r.meta or {}).get("file_name")
        events.append(ActivityEvent(
            id=r.id,
            action=r.action,
            created_at=r.created_at,
            user_id=r.user_id,
            user_name=name_map.get(r.user_id),
            auftrag_id=r.auftrag_id,
            auftrag_file_name=file_name,
            fba_code=fba,
            meta=r.meta or {},
        ))

    return ActivityFeed(
        active_workers=active_workers,
        events=events,
        server_time=datetime.now(timezone.utc),
    )


@router.get("/shift", response_model=ShiftInfo)
async def my_shift(
    me: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Working-day window for the calling user.

    `started_at` = first audit_log row whose UTC timestamp falls on
    today's UTC date for this user. Cheap because of the existing
    `idx_audit_user_created` (user_id, created_at) index.

    `completed_today` is a separate count over auftraege.finished_at —
    audit rows with action='complete' would also work but the dedicated
    column reads cleaner and is consistent with /api/admin/stats.
    """
    now = datetime.now(timezone.utc)
    day_start = datetime.combine(now.date(), time.min, tzinfo=timezone.utc)

    started_at = (
        await db.execute(
            select(func.min(AuditLog.created_at))
            .where(
                AuditLog.user_id == me.id,
                AuditLog.created_at >= day_start,
            )
        )
    ).scalar_one_or_none()

    completed_today = (
        await db.execute(
            select(func.count(Auftrag.id)).where(
                Auftrag.assigned_to_user_id == me.id,
                Auftrag.status == AuftragStatus.completed,
                Auftrag.finished_at >= day_start,
            )
        )
    ).scalar_one()

    duration_sec = 0
    if started_at is not None:
        duration_sec = max(0, int((now - started_at).total_seconds()))

    return ShiftInfo(
        started_at=started_at,
        duration_sec=duration_sec,
        completed_today=int(completed_today or 0),
    )
