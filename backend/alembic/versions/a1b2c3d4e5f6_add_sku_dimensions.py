"""add sku_dimensions

Revision ID: a1b2c3d4e5f6
Revises: d63247073ad7
Create Date: 2026-05-03 12:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'a1b2c3d4e5f6'
down_revision: Union[str, Sequence[str], None] = 'd63247073ad7'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.create_table(
        'sku_dimensions',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('fnsku', sa.String(length=20), nullable=True),
        sa.Column('sku', sa.String(length=50), nullable=True),
        sa.Column('ean', sa.String(length=20), nullable=True),
        sa.Column('title', sa.Text(), nullable=True),
        sa.Column('length_cm', sa.Float(), nullable=False),
        sa.Column('width_cm', sa.Float(), nullable=False),
        sa.Column('height_cm', sa.Float(), nullable=False),
        sa.Column('weight_kg', sa.Float(), nullable=False),
        sa.Column('source', sa.String(length=50), nullable=True),
        sa.Column(
            'updated_at',
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column('updated_by', sa.String(length=255), nullable=True),
        sa.CheckConstraint(
            'fnsku IS NOT NULL OR sku IS NOT NULL OR ean IS NOT NULL',
            name='ck_sku_dimensions_has_any_key',
        ),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_sku_dimensions_fnsku', 'sku_dimensions', ['fnsku'])
    op.create_index('ix_sku_dimensions_sku', 'sku_dimensions', ['sku'])
    op.create_index('ix_sku_dimensions_ean', 'sku_dimensions', ['ean'])


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index('ix_sku_dimensions_ean', table_name='sku_dimensions')
    op.drop_index('ix_sku_dimensions_sku', table_name='sku_dimensions')
    op.drop_index('ix_sku_dimensions_fnsku', table_name='sku_dimensions')
    op.drop_table('sku_dimensions')
