"""sku_dimensions: add pallet_load_max

Revision ID: c3d4e5f6a7b8
Revises: b2c3d4e5f6a7
Create Date: 2026-05-03 16:00:00.000000

The "Pallet load" column from the operator's master xlsx — empirical
maximum number of cartons of THIS format that physically fit on one
EUR pallet (factoring in stack height + footprint, not just volume).
The Einzelne-SKU distributor uses a normalised "capacity fraction":
  fraction = SUM_over_formats (cartons[fmt] / pallet_load_max[fmt])
A pallet's `fraction > 1.0` is OVERLOAD-CAP — physically over-stuffed.
Volume soft-limit (1.59 m³) misses this case for big-format cartons
that pack with edge-voids.

Nullable so legacy rows + items without measured Pallet load still work
(distributor falls back to volume check). Operators populate via xlsx
import or the Admin → Dimensions edit form.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'c3d4e5f6a7b8'
down_revision: Union[str, Sequence[str], None] = 'b2c3d4e5f6a7'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        'sku_dimensions',
        sa.Column('pallet_load_max', sa.Integer(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column('sku_dimensions', 'pallet_load_max')
