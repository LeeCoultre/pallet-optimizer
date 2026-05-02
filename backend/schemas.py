"""Pydantic DTOs for the Marathon HTTP API.

ORM models live in backend/orm.py. These classes are the wire format —
what the frontend sends and receives. Keep them serializable, derive
view-only fields (fba_code, counts) here rather than in endpoints.

Note: backend/models.py holds Pydantic DTOs for the pallet packer
(pre-existing, unrelated). New Marathon code lives here.
"""

from __future__ import annotations

from datetime import datetime
from typing import Any, Generic, Optional, TypeVar
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

from backend.orm import Auftrag, AuftragStatus, User, UserRole, WorkflowStep

T = TypeVar("T")


class Paginated(BaseModel, Generic[T]):
    """Generic page wrapper for list endpoints."""
    items: list[T]
    total: int
    limit: int
    offset: int


class APIModel(BaseModel):
    """Common base — enables building from ORM objects via from_attributes."""
    model_config = ConfigDict(from_attributes=True)


# ─── Users ───────────────────────────────────────────────────────────

class UserResponse(APIModel):
    id: UUID
    email: str
    name: str
    role: UserRole


class UserListItem(APIModel):
    """Compact form for the GET /api/users dropdown — no email/role."""
    id: UUID
    name: str


class HistoryPage(BaseModel):
    """Paginated history response."""
    items: list[AuftragSummary]
    total: int
    limit: int
    offset: int


# ─── Admin schemas (Sprint 2.8 – 2.11) ───────────────────────────────

class AdminUserDetail(APIModel):
    id: UUID
    clerk_id: Optional[str] = None
    email: str
    name: str
    role: UserRole
    created_at: datetime
    last_login_at: Optional[datetime] = None
    auftraege_completed: int = 0

    @classmethod
    def from_orm_row(cls, u: User, completed: int = 0) -> AdminUserDetail:
        return cls(
            id=u.id,
            clerk_id=u.clerk_id,
            email=u.email,
            name=u.name,
            role=u.role,
            created_at=u.created_at,
            last_login_at=u.last_login_at,
            auftraege_completed=completed,
        )


class RoleUpdate(BaseModel):
    role: UserRole


class AuditLogEntry(APIModel):
    id: UUID
    action: str
    created_at: datetime
    user_id: UUID
    user_name: Optional[str] = None
    auftrag_id: Optional[UUID] = None
    auftrag_file_name: Optional[str] = None  # joined; falls back to meta.file_name
    meta: dict[str, Any] = Field(default_factory=dict)


class AdminStats(BaseModel):
    total_auftraege: int
    queued_now: int
    in_progress_now: int
    completed_total: int
    completed_today: int
    completed_this_week: int
    avg_duration_sec: Optional[float] = None
    top_users: list[dict[str, Any]] = Field(default_factory=list)


# ─── Auftraege — request payloads ────────────────────────────────────

class AuftragCreate(BaseModel):
    """POST /api/auftraege — frontend already parsed the .docx in browser."""
    file_name: str
    raw_text: Optional[str] = None
    parsed: Optional[dict[str, Any]] = None
    validation: Optional[dict[str, Any]] = None
    error_message: Optional[str] = None  # set when frontend parsing failed


class WorkflowProgress(BaseModel):
    """PATCH /api/auftraege/{id}/progress — only fields actually being updated."""
    step: Optional[WorkflowStep] = None
    current_pallet_idx: Optional[int] = None
    current_item_idx: Optional[int] = None
    completed_keys: Optional[dict[str, Any]] = None
    pallet_timings: Optional[dict[str, Any]] = None


class AuftragReorderItem(BaseModel):
    """One row of PATCH /api/auftraege/reorder body."""
    id: UUID
    queue_position: int


# ─── Auftraege — response shapes ─────────────────────────────────────

class AuftragSummary(APIModel):
    """Compact row for list views (queue + history). No JSONB blobs."""
    id: UUID
    file_name: str
    fba_code: Optional[str] = None       # derived from parsed.meta
    status: AuftragStatus
    pallet_count: int = 0                # derived from parsed.pallets
    article_count: int = 0               # derived from parsed.pallets[].items
    error_message: Optional[str] = None
    created_at: datetime
    queue_position: Optional[int] = None
    assigned_to_user_id: Optional[UUID] = None
    assigned_to_user_name: Optional[str] = None  # JOIN convenience for UI
    started_at: Optional[datetime] = None
    finished_at: Optional[datetime] = None
    duration_sec: Optional[int] = None
    pallet_timings: dict[str, Any] = Field(default_factory=dict)  # used by Historie row expand

    @classmethod
    def from_orm_row(
        cls,
        row: Auftrag,
        assigned_to_user_name: Optional[str] = None,
    ) -> AuftragSummary:
        parsed = row.parsed or {}
        meta = parsed.get("meta") or {}
        pallets = parsed.get("pallets") or []
        return cls(
            id=row.id,
            file_name=row.file_name,
            fba_code=meta.get("sendungsnummer") or meta.get("fbaCode"),
            status=row.status,
            pallet_count=len(pallets),
            article_count=sum(len(p.get("items") or []) for p in pallets),
            error_message=row.error_message,
            created_at=row.created_at,
            queue_position=row.queue_position,
            assigned_to_user_id=row.assigned_to_user_id,
            assigned_to_user_name=assigned_to_user_name,
            started_at=row.started_at,
            finished_at=row.finished_at,
            duration_sec=row.duration_sec,
            pallet_timings=row.pallet_timings or {},
        )


class AuftragDetail(AuftragSummary):
    """Full record incl. parsed payload, raw text, and workflow state."""
    raw_text: Optional[str] = None
    parsed: Optional[dict[str, Any]] = None
    validation: Optional[dict[str, Any]] = None
    step: Optional[WorkflowStep] = None
    current_pallet_idx: Optional[int] = None
    current_item_idx: Optional[int] = None
    completed_keys: dict[str, Any] = Field(default_factory=dict)
    pallet_timings: dict[str, Any] = Field(default_factory=dict)

    @classmethod
    def from_orm_row(
        cls,
        row: Auftrag,
        assigned_to_user_name: Optional[str] = None,
    ) -> AuftragDetail:
        base = AuftragSummary.from_orm_row(row, assigned_to_user_name)
        return cls(
            **base.model_dump(),
            raw_text=row.raw_text,
            parsed=row.parsed,
            validation=row.validation,
            step=row.step,
            current_pallet_idx=row.current_pallet_idx,
            current_item_idx=row.current_item_idx,
            completed_keys=row.completed_keys or {},
        )
