"""auftraege: add copied_keys jsonb column

Revision ID: f5a6b7c8d9e0
Revises: e4f5a6b7c8d9
Create Date: 2026-05-06 14:00:00.000000

Persists the per-position "Artikel-Code copied" flags from the Focus
screen. Mirrors the shape of `completed_keys`: a flat dict of
"<palletIdx>|<itemIdx>" → millisecond timestamp.

Without this column, the green/red chip state on the Focus item-flow
strip was local-only and a page reload silently erased it (CLAUDE.md
Gotcha #9). The chip state gates pallet transitions, so resetting it
on reload meant the worker had to re-copy every code on the active
pallet to unblock the next pallet.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision: str = 'f5a6b7c8d9e0'
down_revision: Union[str, Sequence[str], None] = 'e4f5a6b7c8d9'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        'auftraege',
        sa.Column(
            'copied_keys',
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default=sa.text("'{}'::jsonb"),
        ),
    )


def downgrade() -> None:
    op.drop_column('auftraege', 'copied_keys')
