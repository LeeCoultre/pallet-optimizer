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
    # 7-day rolling: [{date: 'YYYY-MM-DD', count: int}, ...] (oldest first)
    completed_per_day: list[dict[str, Any]] = Field(default_factory=list)


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
    copied_keys: Optional[dict[str, Any]] = None
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


# ─── SKU Dimensions ──────────────────────────────────────────────────

class SkuDimensionRead(APIModel):
    """Row as returned to admin/list and to lookup callers.

    Each key type is a list because one physical product (one row) often
    ships under multiple Amazon FNSKUs / merchant SKUs (different
    sales channels, regions, PRIME vs EV)."""
    id: int
    fnskus: list[str] = Field(default_factory=list)
    skus: list[str] = Field(default_factory=list)
    eans: list[str] = Field(default_factory=list)
    title: Optional[str] = None
    length_cm: float
    width_cm: float
    height_cm: float
    weight_kg: float
    pallet_load_max: Optional[int] = None
    source: Optional[str] = None
    updated_at: datetime
    updated_by: Optional[str] = None


class SkuDimensionLookup(BaseModel):
    """Compact form embedded in the lookup response. Includes the row's
    `id` (so the distributor can group same-format items even when they
    share dims but ship under different SKUs) and `pallet_load_max` (the
    empirical capacity used by the normalised-fraction algorithm)."""
    id: int
    length_cm: float
    width_cm: float
    height_cm: float
    weight_kg: float
    pallet_load_max: Optional[int] = None
    source: Optional[str] = None


class SkuDimensionLookupResponse(BaseModel):
    """Batch lookup result: { lookups: { "<key>": dim, ... }, missing: [...] }.

    A single physical-product row can be reachable through several keys —
    the response binds the SAME compact dim under each requested key
    that hit it. So callers can probe with whichever identifier they
    have and always get back the dimensions."""
    lookups: dict[str, SkuDimensionLookup] = Field(default_factory=dict)
    missing: list[str] = Field(default_factory=list)


class SkuDimensionUpsert(BaseModel):
    """POST/PATCH input. At least one of (fnskus, skus, eans) must be non-empty.

    Dimensions must be > 0 (a row without size is meaningless for the
    distributor). Weight may be 0 as a "not measured yet" placeholder —
    edit later via UI when the scale data arrives. `pallet_load_max` is
    optional; when null the distributor falls back to the volume soft
    limit (1.59 m³)."""
    fnskus: list[str] = Field(default_factory=list)
    skus: list[str] = Field(default_factory=list)
    eans: list[str] = Field(default_factory=list)
    title: Optional[str] = None
    length_cm: float = Field(gt=0)
    width_cm: float = Field(gt=0)
    height_cm: float = Field(gt=0)
    weight_kg: float = Field(ge=0)
    pallet_load_max: Optional[int] = Field(default=None, ge=1)


class SkuDimensionImportResult(BaseModel):
    imported: int = 0
    updated: int = 0
    skipped: int = 0
    warnings: list[str] = Field(default_factory=list)


# ─── Search (Phase 1 — globale Suche) ────────────────────────────────

class SearchHit(APIModel):
    """One row in /api/search results.

    `matched_field` and `matched_value` describe WHERE the query hit so
    the UI can highlight context. Computed in Python after the SQL pull
    because PostgreSQL ILIKE %query% returns rows but doesn't tell you
    which field of the JSONB matched.
    """
    id: UUID
    file_name: str
    fba_code: Optional[str] = None
    status: AuftragStatus
    pallet_count: int = 0
    article_count: int = 0
    created_at: datetime
    finished_at: Optional[datetime] = None
    duration_sec: Optional[int] = None
    assigned_to_user_name: Optional[str] = None
    matched_field: Optional[str] = None  # 'fnsku' | 'sku' | 'ean' | 'sendungsnummer' | 'file_name'
    matched_value: Optional[str] = None


class SearchResults(BaseModel):
    items: list[SearchHit]
    total: int
    limit: int
    offset: int
    query: str


# ─── Activity feed (Phase 1 — Live-Aktivität) ────────────────────────

class ActiveWorker(BaseModel):
    """Operator who currently has an in_progress Auftrag."""
    user_id: UUID
    user_name: str
    auftrag_id: UUID
    file_name: str
    fba_code: Optional[str] = None
    step: Optional[WorkflowStep] = None
    started_at: Optional[datetime] = None
    current_pallet_idx: Optional[int] = None
    pallet_count: int = 0


class ActivityEvent(BaseModel):
    """One audit_log row, joined with user + (optional) Auftrag file name."""
    id: UUID
    action: str
    created_at: datetime
    user_id: UUID
    user_name: Optional[str] = None
    auftrag_id: Optional[UUID] = None
    auftrag_file_name: Optional[str] = None
    fba_code: Optional[str] = None
    meta: dict[str, Any] = Field(default_factory=dict)


class ActivityFeed(BaseModel):
    active_workers: list[ActiveWorker] = Field(default_factory=list)
    events: list[ActivityEvent] = Field(default_factory=list)
    server_time: datetime  # UI computes "ago" against this for clock-skew safety


class ShiftInfo(BaseModel):
    """Working-day window for a single user, derived from audit_log.

    started_at is the first audit row of the local calendar day for that
    user; null means the operator hasn't done anything today yet.
    """
    started_at: Optional[datetime] = None
    duration_sec: int = 0
    completed_today: int = 0


# ─── Auftraege — full detail ─────────────────────────────────────────

class AuftragDetail(AuftragSummary):
    """Full record incl. parsed payload, raw text, and workflow state."""
    raw_text: Optional[str] = None
    parsed: Optional[dict[str, Any]] = None
    validation: Optional[dict[str, Any]] = None
    step: Optional[WorkflowStep] = None
    current_pallet_idx: Optional[int] = None
    current_item_idx: Optional[int] = None
    completed_keys: dict[str, Any] = Field(default_factory=dict)
    copied_keys: dict[str, Any] = Field(default_factory=dict)
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
            copied_keys=row.copied_keys or {},
        )
