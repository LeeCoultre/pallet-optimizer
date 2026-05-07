"""auftraege: drop copied_keys column

Revision ID: b9c0d1e2f3a4
Revises: a6b7c8d9e0f1
Create Date: 2026-05-07 09:00:00.000000

The copied_keys JSONB was a server-side mirror of the green-chip state
in Focus. Reverted to per-device localStorage — it's a UX hint, not
an audit signal — so the column has no remaining consumers. Drop it.

The downgrade re-creates the column with the same shape as the
original add_copied_keys migration (f5a6b7c8d9e0), so reversing this
restores the schema if a rollback ever needs it. Existing data isn't
preserved across down→up — that's intentional, the data is ephemeral.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB


revision: str = 'b9c0d1e2f3a4'
down_revision: Union[str, Sequence[str], None] = 'a6b7c8d9e0f1'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.drop_column('auftraege', 'copied_keys')


def downgrade() -> None:
    op.add_column(
        'auftraege',
        sa.Column(
            'copied_keys',
            JSONB(),
            nullable=False,
            server_default=sa.text("'{}'::jsonb"),
        ),
    )
