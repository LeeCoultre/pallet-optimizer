"""Marathon Auftrag CRUD + workflow endpoints.

Concurrency model: a row's lifecycle is queued → in_progress → completed.
The 'start' endpoint claims a queued row atomically via
UPDATE ... WHERE status='queued' RETURNING — only one user wins the race.
Subsequent workflow calls (progress / cancel / complete) verify
assigned_to_user_id matches the caller.

Audit log: start, complete, cancel, upload, delete are recorded.
"""

from datetime import datetime, timezone
from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from backend.database import get_db
from backend.deps import get_current_user
from backend.orm import (
    AuditLog,
    Auftrag,
    AuftragStatus,
    User,
    WorkflowStep,
)
from backend.schemas import (
    AuftragCreate,
    AuftragDetail,
    AuftragReorderItem,
    AuftragSummary,
    WorkflowAbort,
    WorkflowProgress,
)

router = APIRouter(prefix="/api/auftraege", tags=["auftraege"])


# ─── helpers ─────────────────────────────────────────────────────────

def _audit(
    db: AsyncSession,
    user_id: UUID,
    action: str,
    auftrag_id: Optional[UUID] = None,
    meta: Optional[dict] = None,
) -> None:
    db.add(AuditLog(
        user_id=user_id,
        auftrag_id=auftrag_id,
        action=action,
        meta=meta or {},
    ))


async def _name_lookup(
    db: AsyncSession, user_ids: set[UUID]
) -> dict[UUID, str]:
    if not user_ids:
        return {}
    rows = (
        await db.execute(select(User).where(User.id.in_(user_ids)))
    ).scalars().all()
    return {u.id: u.name for u in rows}


# ─── List + create ───────────────────────────────────────────────────

@router.get("", response_model=list[AuftragDetail])
async def list_auftraege(
    me: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Queue (status=queued) plus my own in_progress, in queue order.

    Returns Detail for the caller's ACTIVE Auftrag (in_progress + me)
    — needs full parsed/raw_text/validation for the workflow screens.
    Every OTHER row (queued / errored / other users' in_progress) is
    slimmed: parsed/raw_text/validation set to null, summary counts
    (pallet_count, article_count, units_count, esku_count, fba_code)
    still travel for queue cards. Saves ~30-80 KB per non-active row
    in the payload — meaningful with 5-10 queued Aufträge.
    """
    q = (
        select(Auftrag)
        .where(
            (Auftrag.status == AuftragStatus.queued)
            | (
                (Auftrag.status == AuftragStatus.in_progress)
                & (Auftrag.assigned_to_user_id == me.id)
            )
            | (Auftrag.status == AuftragStatus.error)
        )
        .order_by(
            Auftrag.queue_position.asc().nulls_last(),
            Auftrag.created_at.asc(),
        )
    )
    rows = (await db.execute(q)).scalars().all()
    name_map = await _name_lookup(
        db, {r.assigned_to_user_id for r in rows if r.assigned_to_user_id}
    )

    def serialize(r: Auftrag) -> AuftragDetail:
        d = AuftragDetail.from_orm_row(
            r, assigned_to_user_name=name_map.get(r.assigned_to_user_id)
        )
        # raw_text is the full docx body (10-30 KB / row) and never
        # rendered in any list view. Strip it to slim the payload while
        # keeping `parsed` available — Pruefen needs it the moment the
        # worker clicks Start so the optimistic transition renders with
        # real data, not an empty placeholder.
        d.raw_text = None
        return d

    return [serialize(r) for r in rows]


@router.post("", response_model=AuftragDetail, status_code=status.HTTP_201_CREATED)
async def create_auftrag(
    payload: AuftragCreate,
    me: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    is_error = bool(payload.error_message)
    a = Auftrag(
        file_name=payload.file_name,
        raw_text=payload.raw_text,
        parsed=payload.parsed,
        validation=payload.validation,
        status=AuftragStatus.error if is_error else AuftragStatus.queued,
        error_message=payload.error_message,
        created_by_user_id=me.id,
    )
    db.add(a)
    await db.flush()  # populate a.id before audit insert
    _audit(db, me.id, "upload", auftrag_id=a.id, meta={"file_name": payload.file_name})
    await db.commit()
    await db.refresh(a)
    return AuftragDetail.from_orm_row(a, assigned_to_user_name=None)


# ─── Reorder (must come before /{auftrag_id} to avoid path collision) ──

@router.patch("/reorder", status_code=status.HTTP_204_NO_CONTENT)
async def reorder_queue(
    items: list[AuftragReorderItem],
    me: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Bulk update queue_position; only affects status=queued rows."""
    for item in items:
        await db.execute(
            update(Auftrag)
            .where(
                Auftrag.id == item.id,
                Auftrag.status == AuftragStatus.queued,
            )
            .values(queue_position=item.queue_position)
        )
    await db.commit()


# ─── Single — fetch / delete ─────────────────────────────────────────

@router.get("/{auftrag_id}", response_model=AuftragDetail)
async def get_auftrag(
    auftrag_id: UUID,
    me: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    a = await db.get(Auftrag, auftrag_id)
    if a is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Auftrag not found")
    name = None
    if a.assigned_to_user_id:
        u = await db.get(User, a.assigned_to_user_id)
        name = u.name if u else None
    return AuftragDetail.from_orm_row(a, assigned_to_user_name=name)


@router.delete("/{auftrag_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_auftrag(
    auftrag_id: UUID,
    me: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    a = await db.get(Auftrag, auftrag_id)
    if a is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Auftrag not found")
    if a.status not in (AuftragStatus.queued, AuftragStatus.error):
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            f"Cannot delete — status is {a.status.value}",
        )
    _audit(db, me.id, "delete", auftrag_id=a.id, meta={"file_name": a.file_name})
    await db.delete(a)
    await db.commit()


# ─── Workflow — start / progress / complete / cancel ─────────────────

@router.post("/{auftrag_id}/start", response_model=AuftragDetail)
async def start_auftrag(
    auftrag_id: UUID,
    me: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Atomic claim: succeeds only if status was 'queued' AND the caller
    has no other in_progress Auftrag. One active task per user — without
    this guard the frontend's currentSrc=.find(...) hides extras."""
    busy = (
        await db.execute(
            select(Auftrag.id)
            .where(
                Auftrag.assigned_to_user_id == me.id,
                Auftrag.status == AuftragStatus.in_progress,
            )
            .limit(1)
        )
    ).scalar_one_or_none()
    if busy is not None:
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            "You already have another Auftrag in progress — finish or cancel it first.",
        )

    now = datetime.now(timezone.utc)
    result = await db.execute(
        update(Auftrag)
        .where(
            Auftrag.id == auftrag_id,
            Auftrag.status == AuftragStatus.queued,
        )
        .values(
            status=AuftragStatus.in_progress,
            assigned_to_user_id=me.id,
            started_at=now,
            step=WorkflowStep.pruefen,
            current_pallet_idx=0,
            current_item_idx=0,
        )
        .returning(Auftrag)
    )
    row = result.scalar_one_or_none()
    if row is None:
        # Either 404 or someone got here first
        existing = await db.get(Auftrag, auftrag_id)
        if existing is None:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Auftrag not found")
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            f"Already taken — status is {existing.status.value}",
        )
    _audit(db, me.id, "start", auftrag_id=auftrag_id)
    await db.commit()
    await db.refresh(row)
    return AuftragDetail.from_orm_row(row, assigned_to_user_name=me.name)


@router.patch("/{auftrag_id}/progress", response_model=AuftragDetail)
async def update_progress(
    auftrag_id: UUID,
    payload: WorkflowProgress,
    me: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    a = await db.get(Auftrag, auftrag_id)
    if a is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Auftrag not found")
    if a.status != AuftragStatus.in_progress:
        raise HTTPException(
            status.HTTP_409_CONFLICT, f"Status is {a.status.value}"
        )
    if a.assigned_to_user_id != me.id:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Not your Auftrag")

    if payload.step is not None:
        a.step = payload.step
    if payload.current_pallet_idx is not None:
        a.current_pallet_idx = payload.current_pallet_idx
    if payload.current_item_idx is not None:
        a.current_item_idx = payload.current_item_idx
    if payload.completed_keys is not None:
        a.completed_keys = payload.completed_keys
    if payload.pallet_timings is not None:
        a.pallet_timings = payload.pallet_timings

    await db.commit()
    await db.refresh(a)
    return AuftragDetail.from_orm_row(a, assigned_to_user_name=me.name)


@router.post("/{auftrag_id}/complete", response_model=AuftragDetail)
async def complete_auftrag(
    auftrag_id: UUID,
    me: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    a = await db.get(Auftrag, auftrag_id)
    if a is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Auftrag not found")
    if a.status != AuftragStatus.in_progress:
        raise HTTPException(
            status.HTTP_409_CONFLICT, f"Status is {a.status.value}"
        )
    if a.assigned_to_user_id != me.id:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Not your Auftrag")

    now = datetime.now(timezone.utc)
    a.status = AuftragStatus.completed
    a.finished_at = now
    if a.started_at:
        a.duration_sec = int((now - a.started_at).total_seconds())

    _audit(
        db, me.id, "complete", auftrag_id=auftrag_id,
        meta={"duration_sec": a.duration_sec},
    )
    await db.commit()
    await db.refresh(a)
    return AuftragDetail.from_orm_row(a, assigned_to_user_name=me.name)


@router.post("/{auftrag_id}/cancel", response_model=AuftragDetail)
async def cancel_auftrag(
    auftrag_id: UUID,
    me: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Release in_progress Auftrag back to the queue."""
    a = await db.get(Auftrag, auftrag_id)
    if a is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Auftrag not found")
    if a.status != AuftragStatus.in_progress:
        raise HTTPException(
            status.HTTP_409_CONFLICT, f"Status is {a.status.value}"
        )
    if a.assigned_to_user_id != me.id:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Not your Auftrag")

    a.status = AuftragStatus.queued
    a.assigned_to_user_id = None
    a.started_at = None
    a.step = None
    a.current_pallet_idx = None
    a.current_item_idx = None
    a.completed_keys = {}
    a.pallet_timings = {}

    _audit(db, me.id, "cancel", auftrag_id=auftrag_id)
    await db.commit()
    await db.refresh(a)
    return AuftragDetail.from_orm_row(a, assigned_to_user_name=None)


@router.post("/{auftrag_id}/abort", response_model=AuftragDetail)
async def abort_auftrag(
    auftrag_id: UUID,
    payload: WorkflowAbort,
    me: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Terminal cancel ("Stornieren"). Unlike /cancel (which recycles
    the Auftrag back to queued), this marks it `cancelled` so it lands
    in Historie with the Storniert badge + red border, carrying the
    flagged-article reasons in parsed.cancellation."""
    a = await db.get(Auftrag, auftrag_id)
    if a is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Auftrag not found")
    if a.status != AuftragStatus.in_progress:
        raise HTTPException(
            status.HTTP_409_CONFLICT, f"Status is {a.status.value}"
        )
    if a.assigned_to_user_id != me.id:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Not your Auftrag")

    now = datetime.now(timezone.utc)
    items_clean = [
        {
            "palletId": it.pallet_id,
            "itemIdx": it.item_idx,
            "code": it.code,
            "title": it.title,
            "reason": (it.reason or "").strip() or None,
        }
        for it in payload.items
    ]
    cancellation = {
        "items": items_clean,
        "note": (payload.note or "").strip() or None,
        "at": now.isoformat(),
        "by": {"id": str(me.id), "name": me.name},
    }
    # parsed is JSONB; preserve everything the parser wrote and append
    # the cancellation block. Re-assign the dict (not in-place mutate)
    # so SQLAlchemy flags the column dirty.
    parsed = dict(a.parsed or {})
    parsed["cancellation"] = cancellation
    a.parsed = parsed

    a.status = AuftragStatus.cancelled
    a.finished_at = now
    if a.started_at:
        a.duration_sec = int((now - a.started_at).total_seconds())

    _audit(
        db, me.id, "abort", auftrag_id=auftrag_id,
        meta={
            "items": items_clean,
            "note": cancellation["note"],
        },
    )
    await db.commit()
    await db.refresh(a)
    return AuftragDetail.from_orm_row(a, assigned_to_user_name=me.name)
