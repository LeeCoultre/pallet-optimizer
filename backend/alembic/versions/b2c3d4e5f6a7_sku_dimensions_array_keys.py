"""sku_dimensions: switch single-key columns to array form

Revision ID: b2c3d4e5f6a7
Revises: a1b2c3d4e5f6
Create Date: 2026-05-03 13:30:00.000000

Many real-world products map MULTIPLE Amazon FNSKUs / merchant SKUs to
ONE physical box (different sales channels, regions, PRIME vs EV).
Splitting them into separate rows wastes storage and forces edits in N
places when the package changes. This migration consolidates so that
each row represents ONE physical product with arrays of alias keys.

Backfill:
  fnskus = ARRAY[fnsku] WHERE fnsku IS NOT NULL  ELSE '{}'
  skus   = ARRAY[sku]   WHERE sku   IS NOT NULL  ELSE '{}'
  eans   = ARRAY[ean]   WHERE ean   IS NOT NULL  ELSE '{}'

Then the original single-value columns are dropped and the check
constraint is replaced with one over the new arrays.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import ARRAY


# revision identifiers, used by Alembic.
revision: str = 'b2c3d4e5f6a7'
down_revision: Union[str, Sequence[str], None] = 'a1b2c3d4e5f6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    # 1. Add new ARRAY columns (nullable initially so backfill can run)
    op.add_column('sku_dimensions',
        sa.Column('fnskus', ARRAY(sa.String(length=20)), nullable=True))
    op.add_column('sku_dimensions',
        sa.Column('skus',   ARRAY(sa.String(length=50)), nullable=True))
    op.add_column('sku_dimensions',
        sa.Column('eans',   ARRAY(sa.String(length=20)), nullable=True))

    # 2. Backfill from old single-value columns
    op.execute("""
        UPDATE sku_dimensions SET
          fnskus = CASE WHEN fnsku IS NOT NULL THEN ARRAY[fnsku] ELSE ARRAY[]::varchar[] END,
          skus   = CASE WHEN sku   IS NOT NULL THEN ARRAY[sku]   ELSE ARRAY[]::varchar[] END,
          eans   = CASE WHEN ean   IS NOT NULL THEN ARRAY[ean]   ELSE ARRAY[]::varchar[] END
    """)

    # 3. Now NOT NULL with empty-array default for new rows
    op.alter_column('sku_dimensions', 'fnskus',
        nullable=False, server_default=sa.text("'{}'::varchar[]"))
    op.alter_column('sku_dimensions', 'skus',
        nullable=False, server_default=sa.text("'{}'::varchar[]"))
    op.alter_column('sku_dimensions', 'eans',
        nullable=False, server_default=sa.text("'{}'::varchar[]"))

    # 4. Drop old indexes + constraint that referenced the singular columns
    op.drop_index('ix_sku_dimensions_ean', table_name='sku_dimensions')
    op.drop_index('ix_sku_dimensions_sku', table_name='sku_dimensions')
    op.drop_index('ix_sku_dimensions_fnsku', table_name='sku_dimensions')
    op.drop_constraint('ck_sku_dimensions_has_any_key', 'sku_dimensions', type_='check')

    # 5. Drop the old singular columns
    op.drop_column('sku_dimensions', 'fnsku')
    op.drop_column('sku_dimensions', 'sku')
    op.drop_column('sku_dimensions', 'ean')

    # 6. Replacement check + GIN indexes for fast ANY() lookups
    op.create_check_constraint(
        'ck_sku_dimensions_has_any_key',
        'sku_dimensions',
        'cardinality(fnskus) + cardinality(skus) + cardinality(eans) >= 1',
    )
    op.create_index('ix_sku_dimensions_fnskus', 'sku_dimensions', ['fnskus'],
                    postgresql_using='gin')
    op.create_index('ix_sku_dimensions_skus',   'sku_dimensions', ['skus'],
                    postgresql_using='gin')
    op.create_index('ix_sku_dimensions_eans',   'sku_dimensions', ['eans'],
                    postgresql_using='gin')


def downgrade() -> None:
    """Downgrade schema. Lossy if any row has multiple keys per array."""
    # Restore old singular columns
    op.add_column('sku_dimensions', sa.Column('fnsku', sa.String(length=20), nullable=True))
    op.add_column('sku_dimensions', sa.Column('sku',   sa.String(length=50), nullable=True))
    op.add_column('sku_dimensions', sa.Column('ean',   sa.String(length=20), nullable=True))

    # Backfill — pick first element of each array
    op.execute("""
        UPDATE sku_dimensions SET
          fnsku = CASE WHEN cardinality(fnskus) > 0 THEN fnskus[1] ELSE NULL END,
          sku   = CASE WHEN cardinality(skus)   > 0 THEN skus[1]   ELSE NULL END,
          ean   = CASE WHEN cardinality(eans)   > 0 THEN eans[1]   ELSE NULL END
    """)

    # Drop new artifacts
    op.drop_index('ix_sku_dimensions_eans',   table_name='sku_dimensions')
    op.drop_index('ix_sku_dimensions_skus',   table_name='sku_dimensions')
    op.drop_index('ix_sku_dimensions_fnskus', table_name='sku_dimensions')
    op.drop_constraint('ck_sku_dimensions_has_any_key', 'sku_dimensions', type_='check')
    op.drop_column('sku_dimensions', 'eans')
    op.drop_column('sku_dimensions', 'skus')
    op.drop_column('sku_dimensions', 'fnskus')

    # Restore prior check + indexes
    op.create_check_constraint(
        'ck_sku_dimensions_has_any_key',
        'sku_dimensions',
        'fnsku IS NOT NULL OR sku IS NOT NULL OR ean IS NOT NULL',
    )
    op.create_index('ix_sku_dimensions_fnsku', 'sku_dimensions', ['fnsku'])
    op.create_index('ix_sku_dimensions_sku',   'sku_dimensions', ['sku'])
    op.create_index('ix_sku_dimensions_ean',   'sku_dimensions', ['ean'])
