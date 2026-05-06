"""auftraege: pg_trgm + GIN indexes for fuzzy search

Revision ID: e4f5a6b7c8d9
Revises: c3d4e5f6a7b8
Create Date: 2026-05-06 12:00:00.000000

Powers /api/search — operators look up archived Aufträge by FNSKU /
SKU / EAN / Sendungsnummer / file name. Sendungsnummer in particular
is often dictated by phone, so fuzzy match on typos matters.

We index two surfaces:

  • file_name                — short string, fast trigram match
  • parsed::text             — full JSONB cast to text covers
                               meta.sendungsnummer, meta.fbaCode and
                               every items[].fnsku / sku / ean inside
                               pallets[]. One index, one ILIKE clause.

The pg_trgm extension is created IF NOT EXISTS — Railway's managed
Postgres allows it without superuser. GIN trigram indexes accept
ILIKE %needle% / similarity() / % operator queries.
"""
from typing import Sequence, Union

from alembic import op


revision: str = 'e4f5a6b7c8d9'
down_revision: Union[str, Sequence[str], None] = 'c3d4e5f6a7b8'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("CREATE EXTENSION IF NOT EXISTS pg_trgm")
    op.execute(
        "CREATE INDEX IF NOT EXISTS idx_auftraege_file_name_trgm "
        "ON auftraege USING gin (file_name gin_trgm_ops)"
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS idx_auftraege_parsed_trgm "
        "ON auftraege USING gin ((parsed::text) gin_trgm_ops)"
    )


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS idx_auftraege_parsed_trgm")
    op.execute("DROP INDEX IF EXISTS idx_auftraege_file_name_trgm")
    # Leave pg_trgm — may be used by other features.
