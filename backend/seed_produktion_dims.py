"""Seed Produktion SKU dimensions (Big Bags, Klebeband Fragile,
Holzwolle, Sonstiges).

Fills known gaps in the sku_dimensions table for L4-Produktion items
that are missing from the standard Dimensional_list.xlsx, so the ESKU
distributor can use real L×B×H + Gewicht instead of falling back to
heuristics (which over-estimates weight and triggers false OVERLOAD-W).

Each row's ASIN is stored in `fnskus` (Amazon ASIN serves as the FNSKU
key in this system — same role, same lookup path).

Idempotent: matches by ASIN in fnskus. Re-running refreshes dimensions
without creating duplicates.

Usage:
    .venv/bin/python -m backend.seed_produktion_dims
"""

import asyncio

from sqlalchemy import select

from backend.database import AsyncSessionLocal, engine
from backend.orm import SkuDimension

# (asin, title, L cm, B cm, H cm, Gewicht kg)
ENTRIES: list[tuple[str, str, float, float, float, float]] = [
    # Big Bags
    ("B08H8X5SZ3", "Big Bags 1 Stk.",                  24.3, 19.8, 14.3, 0.92),
    ("B08H9TJHHX", "Big Bags 2 Stk.",                  30.5, 30.5, 21.1, 1.88),
    ("B092VRX6R7", "Big Bags 4 Stk.",                  35.2, 24.0, 36.0, 3.60),
    # Klebeband Fragile
    ("B081TKLKF2", "Klebeband Fragile x1 (D-10 H-5)",  10.0, 10.0,  4.8, 0.14),
    ("B081TGR7LZ", "Klebeband Fragile x6",             30.0, 20.0,  4.8, 0.82),
    ("B081THC94P", "Klebeband Fragile x12",            30.0, 20.0,  9.6, 1.66),
    ("B081TJ9YQ1", "Klebeband Fragile x36",            31.0, 21.0, 29.9, 5.34),
    # Holzwolle Füllmaterial
    ("B08Y5KB7QD", "Holzwolle Füllmaterial 500g",      24.3, 19.8, 14.3, 0.52),
    ("B08Y5CB4XT", "Holzwolle Füllmaterial 1 Kg",      30.0, 25.5, 14.0, 1.10),
    # Sonstiges
    ("B08DKNY1X7", "Kürbiskernöl 1 l (6 Dosen)",       27.3, 18.5, 32.5, 6.52),
]

UPDATED_BY = "seed_produktion_dims"
SOURCE = "manual"


async def seed() -> None:
    inserted = updated = 0
    async with AsyncSessionLocal() as session:
        # Pre-load every existing row that already holds any of our ASINs.
        # SQLAlchemy ARRAY contains operator (any(asin) in fnskus).
        asins = [e[0] for e in ENTRIES]
        existing_rows = (
            await session.execute(
                select(SkuDimension).where(SkuDimension.fnskus.op("&&")(asins))
            )
        ).scalars().all()
        by_asin: dict[str, SkuDimension] = {}
        for r in existing_rows:
            for k in r.fnskus or []:
                if k in asins:
                    by_asin[k] = r

        for asin, title, l, b, h, w in ENTRIES:
            row = by_asin.get(asin)
            if row is None:
                row = SkuDimension(
                    fnskus=[asin],
                    skus=[],
                    eans=[],
                    title=title,
                    length_cm=l,
                    width_cm=b,
                    height_cm=h,
                    weight_kg=w,
                    source=SOURCE,
                    updated_by=UPDATED_BY,
                )
                session.add(row)
                inserted += 1
                print(f"  +  {asin}  {title}")
            else:
                row.title = title
                row.length_cm = l
                row.width_cm = b
                row.height_cm = h
                row.weight_kg = w
                row.source = SOURCE
                row.updated_by = UPDATED_BY
                updated += 1
                print(f"  ~  {asin}  {title}")

        await session.commit()

    print(f"\nDone: {inserted} inserted, {updated} updated.")
    await engine.dispose()


if __name__ == "__main__":
    asyncio.run(seed())
