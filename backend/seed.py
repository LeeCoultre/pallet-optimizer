"""Seed the 4 Lynne users.

Idempotent — uses ON CONFLICT (email) DO UPDATE, so re-running this
script picks up any change to name/role here without complaints.

Sprint 1 only. Sprint 2 swaps this stub for real auth-managed users.

Usage:
    .venv/bin/python -m backend.seed
"""

import asyncio

from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert

from backend.database import AsyncSessionLocal, engine
from backend.orm import User, UserRole

USERS = [
    {"email": "lynnelager10@marathon.local", "name": "LynneLager10", "role": UserRole.user},
    {"email": "lynneandy@marathon.local",    "name": "LynneAndy",    "role": UserRole.admin},
    {"email": "lynnejakob@marathon.local",   "name": "LynneJakob",   "role": UserRole.user},
    {"email": "lynneingo@marathon.local",    "name": "LynneIngo",    "role": UserRole.user},
]


async def seed() -> None:
    async with AsyncSessionLocal() as session:
        for u in USERS:
            stmt = (
                insert(User)
                .values(email=u["email"], name=u["name"], role=u["role"])
                .on_conflict_do_update(
                    index_elements=["email"],
                    set_={"name": u["name"], "role": u["role"]},
                )
            )
            await session.execute(stmt)
        await session.commit()

        rows = (await session.execute(select(User).order_by(User.name))).scalars().all()
        print(f"Seeded {len(rows)} users:")
        for u in rows:
            print(f"  {u.name:14s} ({u.role.value:5s}) — {u.email}")

    await engine.dispose()


if __name__ == "__main__":
    asyncio.run(seed())
