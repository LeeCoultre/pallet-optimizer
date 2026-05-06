"""auftraege: add 'upload' value to workflow_step enum

Revision ID: a6b7c8d9e0f1
Revises: f5a6b7c8d9e0
Create Date: 2026-05-06 19:00:00.000000

The Topbar breadcrumbs in workflow screens (Pruefen / Focus / Abschluss)
let the worker click "Upload" to navigate back to the Upload step
without losing the Auftrag. That requires `step='upload'` to be a
valid WorkflowStep value — without this migration, the PATCH
/api/auftraege/{id}/progress call fails Pydantic validation and the
optimistic UI flicker reverts the worker's navigation.

`ALTER TYPE ... ADD VALUE` cannot run inside a transaction in
PostgreSQL, so we COMMIT first and run the alter separately.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'a6b7c8d9e0f1'
down_revision: Union[str, Sequence[str], None] = 'f5a6b7c8d9e0'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Break out of the implicit transaction so ADD VALUE can run.
    connection = op.get_bind()
    connection.execute(sa.text("COMMIT"))
    connection.execute(sa.text(
        "ALTER TYPE workflow_step ADD VALUE IF NOT EXISTS 'upload' BEFORE 'pruefen'"
    ))


def downgrade() -> None:
    # PostgreSQL does not support removing enum values directly; would
    # require dropping and recreating the type. Leave as no-op — extra
    # values in an enum are harmless if unused.
    pass
