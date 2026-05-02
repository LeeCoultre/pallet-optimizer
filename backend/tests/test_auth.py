"""Auth — token presence, ownership guards, admin-only endpoints."""

from .conftest import make_payload


async def test_no_auth_returns_401(client):
    """No dependency override + no Bearer header → 401."""
    r = await client.get("/api/auftraege")
    assert r.status_code == 401


async def test_users_endpoint_open(client, admin, user):
    """The picker dropdown source needs no auth."""
    r = await client.get("/api/users")
    assert r.status_code == 200
    names = sorted(u["name"] for u in r.json())
    assert names == ["TestAdmin", "TestUser"]


async def test_me_returns_role(client, admin, user, as_user):
    as_user(admin)
    r = await client.get("/api/me")
    assert r.json()["role"] == "admin"

    as_user(user)
    r = await client.get("/api/me")
    assert r.json()["role"] == "user"


async def test_other_user_cannot_progress(client, admin, user, as_user):
    """Ownership guard on /progress."""
    as_user(admin)
    r = await client.post("/api/auftraege", json=make_payload())
    a_id = r.json()["id"]
    await client.post(f"/api/auftraege/{a_id}/start")

    as_user(user)
    r = await client.patch(
        f"/api/auftraege/{a_id}/progress",
        json={"current_item_idx": 5},
    )
    assert r.status_code == 403


async def test_other_user_cannot_cancel(client, admin, user, as_user):
    as_user(admin)
    r = await client.post("/api/auftraege", json=make_payload())
    a_id = r.json()["id"]
    await client.post(f"/api/auftraege/{a_id}/start")

    as_user(user)
    r = await client.post(f"/api/auftraege/{a_id}/cancel")
    assert r.status_code == 403


async def _create_completed(client, owner, as_user):
    as_user(owner)
    r = await client.post("/api/auftraege", json=make_payload())
    a_id = r.json()["id"]
    await client.post(f"/api/auftraege/{a_id}/start")
    await client.post(f"/api/auftraege/{a_id}/complete")
    return a_id


async def test_admin_can_delete_history(client, admin, as_user):
    a_id = await _create_completed(client, admin, as_user)
    r = await client.delete(f"/api/history/{a_id}")
    assert r.status_code == 204


async def test_user_cannot_delete_history(client, admin, user, as_user):
    a_id = await _create_completed(client, admin, as_user)
    as_user(user)
    r = await client.delete(f"/api/history/{a_id}")
    assert r.status_code == 403
