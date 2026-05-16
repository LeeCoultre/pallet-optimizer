"""auftraege: add 'cancelled' value to auftrag_status enum

Revision ID: c5d6e7f8a9b0
Revises: c3d4e5f6a7b8
Create Date: 2026-05-15 10:00:00.000000

Workers can now abort an in_progress Auftrag from Focus with one or
more flagged article + reason notes. The aborted row stays in the
system (visible in Historie with a red border) instead of being
recycled to the queue — adds a new terminal status alongside completed.

`ALTER TYPE ... ADD VALUE` cannot run inside a transaction in
PostgreSQL, so we COMMIT first and run the alter separately.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'c5d6e7f8a9b0'
down_revision: Union[str, Sequence[str], None] = 'b9c0d1e2f3a4'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    connection = op.get_bind()
    connection.execute(sa.text("COMMIT"))
    connection.execute(sa.text(
        "ALTER TYPE auftrag_status ADD VALUE IF NOT EXISTS 'cancelled'"
    ))


def downgrade() -> None:
    # PostgreSQL does not support removing enum values directly; would
    # require dropping and recreating the type. Leave as no-op — extra
    # values in an enum are harmless if unused.
    pass
