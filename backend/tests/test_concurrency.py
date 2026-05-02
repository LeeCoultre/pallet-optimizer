"""Atomic /start: only one of N parallel calls wins, the rest get 409."""

import asyncio

from .conftest import make_payload


async def _create(client, user_id):
    r = await client.post(
        "/api/auftraege",
        headers={"X-User-Id": str(user_id)},
        json=make_payload(),
    )
    return r.json()["id"]


async def test_five_parallel_start_one_winner(client, admin):
    """Same user firing /start 5x in parallel — only one 200, four 409."""
    a_id = await _create(client, admin.id)
    h = {"X-User-Id": str(admin.id)}

    responses = await asyncio.gather(*[
        client.post(f"/api/auftraege/{a_id}/start", headers=h)
        for _ in range(5)
    ])
    statuses = sorted(r.status_code for r in responses)
    assert statuses == [200, 409, 409, 409, 409]


async def test_two_users_race_for_same_auftrag(client, admin, user):
    """Two different users hit /start simultaneously — exactly one wins."""
    a_id = await _create(client, admin.id)

    r_admin, r_user = await asyncio.gather(
        client.post(f"/api/auftraege/{a_id}/start",
                    headers={"X-User-Id": str(admin.id)}),
        client.post(f"/api/auftraege/{a_id}/start",
                    headers={"X-User-Id": str(user.id)}),
    )
    statuses = sorted([r_admin.status_code, r_user.status_code])
    assert statuses == [200, 409]

    # Final state matches whoever got 200
    winner_name = (
        r_admin.json()["assigned_to_user_name"] if r_admin.status_code == 200
        else r_user.json()["assigned_to_user_name"]
    )
    assert winner_name in ("TestAdmin", "TestUser")
