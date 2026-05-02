"""Shared pytest fixtures.

Tests run against the live Railway PostgreSQL via the same engine the app
uses. `clean_db` (autouse) TRUNCATEs every Marathon table before each test,
so test order doesn't matter and there's no leakage. After the suite, run
`.venv/bin/python -m backend.seed` to restore the 4 Lynne users in the DB.
"""

import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy import text

from backend.database import AsyncSessionLocal, engine
from backend.main import app
from backend.orm import User, UserRole


@pytest_asyncio.fixture
async def client():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac


@pytest_asyncio.fixture(autouse=True)
async def clean_db():
    """Wipe every Marathon table before each test (RESTART IDENTITY + CASCADE)."""
    async with engine.begin() as conn:
        await conn.execute(text(
            "TRUNCATE audit_log, auftraege, users RESTART IDENTITY CASCADE"
        ))
    yield


@pytest_asyncio.fixture(scope="session", autouse=True)
async def restore_seed_after_suite():
    """Reseed the 4 Lynne users once the whole suite finishes — otherwise the
    final test's TRUNCATE leaves the dev DB empty and the running UI gets 401."""
    yield
    from backend.seed import USERS
    from sqlalchemy.dialects.postgresql import insert
    async with AsyncSessionLocal() as s:
        for u in USERS:
            await s.execute(
                insert(User)
                .values(email=u["email"], name=u["name"], role=u["role"])
                .on_conflict_do_update(
                    index_elements=["email"],
                    set_={"name": u["name"], "role": u["role"]},
                )
            )
        await s.commit()


@pytest_asyncio.fixture
async def admin():
    async with AsyncSessionLocal() as s:
        u = User(email="admin@test", name="TestAdmin", role=UserRole.admin)
        s.add(u)
        await s.commit()
        await s.refresh(u)
        return u


@pytest_asyncio.fixture
async def user():
    async with AsyncSessionLocal() as s:
        u = User(email="user@test", name="TestUser", role=UserRole.user)
        s.add(u)
        await s.commit()
        await s.refresh(u)
        return u


@pytest_asyncio.fixture
async def user2():
    async with AsyncSessionLocal() as s:
        u = User(email="user2@test", name="TestUser2", role=UserRole.user)
        s.add(u)
        await s.commit()
        await s.refresh(u)
        return u


def make_payload(file_name="t.docx", fba="T-1", pallets=None):
    """Build a minimal AuftragCreate payload."""
    if pallets is None:
        pallets = [{"id": "P1", "items": [{"sku": "A"}]}]
    return {
        "file_name": file_name,
        "parsed": {"meta": {"sendungsnummer": fba}, "pallets": pallets},
    }
