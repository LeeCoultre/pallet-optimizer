"""Admin endpoints — gated by require_admin.

Sprint 2.8: list every Auftrag (across users/statuses) with filters.
Sprint 2.9: users + role toggle.
Sprint 2.10: audit log viewer.
Sprint 2.11: KPI dashboard.
"""

from datetime import datetime, timedelta, timezone
from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.database import get_db
from backend.deps import require_admin
from backend.orm import (
    AuditLog,
    Auftrag,
    AuftragStatus,
    User,
    UserRole,
)
from backend.schemas import (
    AdminStats,
    AdminUserDetail,
    AuditLogEntry,
    AuftragSummary,
    Paginated,
    RoleUpdate,
)

router = APIRouter(
    prefix="/api/admin",
    tags=["admin"],
    dependencies=[Depends(require_admin)],
)


async def _name_lookup(
    db: AsyncSession, user_ids: set[UUID]
) -> dict[UUID, str]:
    if not user_ids:
        return {}
    rows = (
        await db.execute(select(User).where(User.id.in_(user_ids)))
    ).scalars().all()
    return {u.id: u.name for u in rows}


# ─── Sanity ──────────────────────────────────────────────────────────

@router.get("/ping")
async def admin_ping(admin: User = Depends(require_admin)):
    return {
        "ok": True,
        "admin": {
            "id": str(admin.id),
            "name": admin.name,
            "email": admin.email,
        },
    }


# ─── 2.8 — All Auftraege ─────────────────────────────────────────────

@router.get("/auftraege", response_model=Paginated[AuftragSummary])
async def admin_list_auftraege(
    status_: Optional[AuftragStatus] = Query(None, alias="status"),
    assigned_to: Optional[UUID] = Query(None),
    search: Optional[str] = Query(None, description="case-insensitive match on file_name"),
    limit: int = Query(50, ge=1, le=500),
    offset: int = Query(0, ge=0),
    db: AsyncSession = Depends(get_db),
):
    base = select(Auftrag)
    if status_ is not None:
        base = base.where(Auftrag.status == status_)
    if assigned_to is not None:
        base = base.where(Auftrag.assigned_to_user_id == assigned_to)
    if search:
        base = base.where(Auftrag.file_name.ilike(f"%{search}%"))

    total = (
        await db.execute(select(func.count()).select_from(base.subquery()))
    ).scalar_one()
    rows = (
        await db.execute(
            base.order_by(Auftrag.created_at.desc())
            .limit(limit)
            .offset(offset)
        )
    ).scalars().all()

    name_map = await _name_lookup(
        db, {r.assigned_to_user_id for r in rows if r.assigned_to_user_id}
    )
    items = [
        AuftragSummary.from_orm_row(
            r, assigned_to_user_name=name_map.get(r.assigned_to_user_id)
        )
        for r in rows
    ]
    return Paginated(items=items, total=total, limit=limit, offset=offset)


# ─── 2.9 — Users + role toggle ───────────────────────────────────────

@router.get("/users", response_model=list[AdminUserDetail])
async def admin_list_users(db: AsyncSession = Depends(get_db)):
    users = (
        await db.execute(select(User).order_by(User.created_at))
    ).scalars().all()

    completed_rows = (
        await db.execute(
            select(Auftrag.assigned_to_user_id, func.count())
            .where(Auftrag.status == AuftragStatus.completed)
            .group_by(Auftrag.assigned_to_user_id)
        )
    ).all()
    counts = {row[0]: row[1] for row in completed_rows if row[0]}

    return [
        AdminUserDetail.from_orm_row(u, completed=counts.get(u.id, 0))
        for u in users
    ]


@router.patch("/users/{user_id}/role", response_model=AdminUserDetail)
async def admin_change_user_role(
    user_id: UUID,
    payload: RoleUpdate,
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    if user_id == admin.id and payload.role != UserRole.admin:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            "Cannot demote yourself — ask another admin to do it.",
        )
    target = await db.get(User, user_id)
    if target is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "User not found")

    old_role = target.role
    target.role = payload.role
    db.add(AuditLog(
        user_id=admin.id,
        auftrag_id=None,
        action="user_role_change",
        meta={
            "target_user_id": str(user_id),
            "target_email": target.email,
            "old_role": old_role.value,
            "new_role": payload.role.value,
        },
    ))
    await db.commit()
    await db.refresh(target)
    return AdminUserDetail.from_orm_row(target, completed=0)


# ─── 2.10 — Audit log viewer ─────────────────────────────────────────

@router.get("/audit", response_model=Paginated[AuditLogEntry])
async def admin_list_audit(
    user_id: Optional[UUID] = Query(None),
    action_: Optional[str] = Query(None, alias="action"),
    limit: int = Query(100, ge=1, le=500),
    offset: int = Query(0, ge=0),
    db: AsyncSession = Depends(get_db),
):
    base = select(AuditLog)
    if user_id is not None:
        base = base.where(AuditLog.user_id == user_id)
    if action_:
        base = base.where(AuditLog.action == action_)

    total = (
        await db.execute(select(func.count()).select_from(base.subquery()))
    ).scalar_one()
    rows = (
        await db.execute(
            base.order_by(AuditLog.created_at.desc())
            .limit(limit)
            .offset(offset)
        )
    ).scalars().all()

    name_map = await _name_lookup(db, {r.user_id for r in rows})
    auftrag_ids = {r.auftrag_id for r in rows if r.auftrag_id}
    auftrag_files: dict[UUID, str] = {}
    if auftrag_ids:
        aufs = (
            await db.execute(
                select(Auftrag.id, Auftrag.file_name).where(
                    Auftrag.id.in_(auftrag_ids)
                )
            )
        ).all()
        auftrag_files = {a[0]: a[1] for a in aufs}

    def file_name_for(r: AuditLog) -> Optional[str]:
        if r.auftrag_id and r.auftrag_id in auftrag_files:
            return auftrag_files[r.auftrag_id]
        # Auftrag was deleted — meta usually keeps the file_name as breadcrumb
        return (r.meta or {}).get("file_name")

    items = [
        AuditLogEntry(
            id=r.id,
            action=r.action,
            created_at=r.created_at,
            user_id=r.user_id,
            user_name=name_map.get(r.user_id),
            auftrag_id=r.auftrag_id,
            auftrag_file_name=file_name_for(r),
            meta=r.meta or {},
        )
        for r in rows
    ]
    return Paginated(items=items, total=total, limit=limit, offset=offset)


# ─── 2.11 — KPI dashboard ────────────────────────────────────────────

@router.get("/stats", response_model=AdminStats)
async def admin_stats(db: AsyncSession = Depends(get_db)):
    now = datetime.now(timezone.utc)
    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    week_start = today_start - timedelta(days=7)

    async def count(*conds) -> int:
        q = select(func.count(Auftrag.id))
        for c in conds:
            q = q.where(c)
        return (await db.execute(q)).scalar_one()

    total = await count()
    queued = await count(Auftrag.status == AuftragStatus.queued)
    in_progress = await count(Auftrag.status == AuftragStatus.in_progress)
    completed_total = await count(Auftrag.status == AuftragStatus.completed)
    completed_today = await count(
        Auftrag.status == AuftragStatus.completed,
        Auftrag.finished_at >= today_start,
    )
    completed_week = await count(
        Auftrag.status == AuftragStatus.completed,
        Auftrag.finished_at >= week_start,
    )
    avg_duration = (
        await db.execute(
            select(func.avg(Auftrag.duration_sec))
            .where(
                Auftrag.status == AuftragStatus.completed,
                Auftrag.duration_sec.is_not(None),
            )
        )
    ).scalar_one()

    top_rows = (
        await db.execute(
            select(
                User.name,
                func.count(Auftrag.id),
                func.sum(Auftrag.duration_sec),
            )
            .join(Auftrag, Auftrag.assigned_to_user_id == User.id)
            .where(Auftrag.status == AuftragStatus.completed)
            .group_by(User.id, User.name)
            .order_by(func.count(Auftrag.id).desc())
            .limit(5)
        )
    ).all()
    top_users = [
        {
            "name": r[0],
            "count": int(r[1]),
            "total_seconds": int(r[2] or 0),
        }
        for r in top_rows
    ]

    return AdminStats(
        total_auftraege=total,
        queued_now=queued,
        in_progress_now=in_progress,
        completed_total=completed_total,
        completed_today=completed_today,
        completed_this_week=completed_week,
        avg_duration_sec=float(avg_duration) if avg_duration is not None else None,
        top_users=top_users,
    )
