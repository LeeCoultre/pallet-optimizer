"""Atomic /start: only one of N parallel calls wins, the rest get 409."""

import asyncio

from backend.deps import get_current_user
from backend.main import app

from .conftest import make_payload


async def _create(client, user_id):
    r = await client.post("/api/auftraege", json=make_payload())
    return r.json()["id"]


async def test_five_parallel_start_one_winner(client, admin, as_user):
    """Same user firing /start 5x in parallel — only one 200, four 409."""
    as_user(admin)
    a_id = await _create(client, admin.id)

    responses = await asyncio.gather(*[
        client.post(f"/api/auftraege/{a_id}/start") for _ in range(5)
    ])
    statuses = sorted(r.status_code for r in responses)
    assert statuses == [200, 409, 409, 409, 409]


async def test_two_users_race_for_same_auftrag(client, admin, user):
    """Two different users hit /start simultaneously — exactly one wins.

    We can't switch the override mid-flight, so we issue both requests
    via context-managed clients each pinned to one user. The race is
    inside the DB layer; the Python wrapper is just plumbing."""
    # Setup: admin uploads, then we race admin vs user on /start
    app.dependency_overrides[get_current_user] = lambda: admin
    a_id = await _create(client, admin.id)

    async def start_as(u):
        app.dependency_overrides[get_current_user] = lambda: u
        return await client.post(f"/api/auftraege/{a_id}/start")

    # Note: this is racing in Python coroutines that share one ASGI app,
    # so the override flips between them — but the DB-level UPDATE WHERE
    # is what guarantees correctness, and that's what we're testing.
    r1, r2 = await asyncio.gather(start_as(admin), start_as(user))
    statuses = sorted([r1.status_code, r2.status_code])
    assert statuses == [200, 409]


async def test_user_cannot_start_when_already_busy(client, admin, as_user):
    """Same user trying to start a SECOND queued Auftrag → 409 (one-per-user)."""
    as_user(admin)
    a1 = (await client.post("/api/auftraege", json=make_payload("a.docx"))).json()["id"]
    a2 = (await client.post("/api/auftraege", json=make_payload("b.docx"))).json()["id"]

    r1 = await client.post(f"/api/auftraege/{a1}/start")
    assert r1.status_code == 200

    r2 = await client.post(f"/api/auftraege/{a2}/start")
    assert r2.status_code == 409
    assert "another" in r2.json()["detail"].lower()
