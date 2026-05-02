"""Shared pytest fixtures.

Tests run against the live Railway PostgreSQL via the same engine the
app uses. `clean_db` (autouse) TRUNCATEs every Marathon table before
each test, so order doesn't matter.

Auth: instead of issuing real Clerk JWTs, we override get_current_user
(and require_admin transitively) via FastAPI's dependency_overrides.
The `as_user(user)` fixture flips the active identity inside a single
test, so we can simulate "user A starts → user B tries to progress".
"""

import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy import text

from backend.database import AsyncSessionLocal, engine
from backend.deps import get_current_user
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
    # Drop any auth overrides set during the test.
    app.dependency_overrides.pop(get_current_user, None)


@pytest_asyncio.fixture(scope="session", autouse=True)
async def wipe_test_users_after_suite():
    """We share the dev/prod Postgres with the running app, so the suite
    ends by pruning any *@test rows that might leak after the final test
    (clean_db only runs BEFORE each test). Audit rows reference users
    via NOT NULL FK, so cascade those first."""
    yield
    async with engine.begin() as conn:
        await conn.execute(text(
            "DELETE FROM audit_log WHERE user_id IN "
            "(SELECT id FROM users WHERE email LIKE '%@test')"
        ))
        await conn.execute(text(
            "DELETE FROM users WHERE email LIKE '%@test'"
        ))


@pytest_asyncio.fixture
async def admin():
    async with AsyncSessionLocal() as s:
        u = User(
            email="admin@test", name="TestAdmin", role=UserRole.admin,
            clerk_id="user_test_admin",
        )
        s.add(u)
        await s.commit()
        await s.refresh(u)
        return u


@pytest_asyncio.fixture
async def user():
    async with AsyncSessionLocal() as s:
        u = User(
            email="user@test", name="TestUser", role=UserRole.user,
            clerk_id="user_test_user1",
        )
        s.add(u)
        await s.commit()
        await s.refresh(u)
        return u


@pytest_asyncio.fixture
async def user2():
    async with AsyncSessionLocal() as s:
        u = User(
            email="user2@test", name="TestUser2", role=UserRole.user,
            clerk_id="user_test_user2",
        )
        s.add(u)
        await s.commit()
        await s.refresh(u)
        return u


@pytest_asyncio.fixture
def as_user():
    """Switch the authenticated identity for this test.

    Usage:
        async def test_x(client, admin, user, as_user):
            as_user(admin)
            await client.post(...)
            as_user(user)
            await client.patch(...)
    """
    def _set(u: User):
        app.dependency_overrides[get_current_user] = lambda: u
    return _set


def make_payload(file_name="t.docx", fba="T-1", pallets=None):
    """Build a minimal AuftragCreate payload."""
    if pallets is None:
        pallets = [{"id": "P1", "items": [{"sku": "A"}]}]
    return {
        "file_name": file_name,
        "parsed": {"meta": {"sendungsnummer": fba}, "pallets": pallets},
    }
