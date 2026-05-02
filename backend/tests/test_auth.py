"""Authentication stub + authorization (admin-only, ownership)."""

from .conftest import make_payload


async def test_unknown_user_returns_401(client):
    r = await client.get(
        "/api/auftraege",
        headers={"X-User-Id": "00000000-0000-0000-0000-000000000000"},
    )
    assert r.status_code == 401


async def test_missing_header_returns_422(client):
    r = await client.get("/api/auftraege")
    assert r.status_code == 422  # FastAPI validation


async def test_users_endpoint_open(client, admin, user):
    """Picker dropdown needs no auth."""
    r = await client.get("/api/users")
    assert r.status_code == 200
    names = sorted(u["name"] for u in r.json())
    assert names == ["TestAdmin", "TestUser"]


async def test_me_returns_role(client, admin, user):
    r = await client.get("/api/me", headers={"X-User-Id": str(admin.id)})
    assert r.json()["role"] == "admin"

    r = await client.get("/api/me", headers={"X-User-Id": str(user.id)})
    assert r.json()["role"] == "user"


async def test_other_user_cannot_progress(client, admin, user):
    """Ownership guard on /progress."""
    h_admin = {"X-User-Id": str(admin.id)}
    r = await client.post("/api/auftraege", headers=h_admin, json=make_payload())
    a_id = r.json()["id"]
    await client.post(f"/api/auftraege/{a_id}/start", headers=h_admin)

    r = await client.patch(
        f"/api/auftraege/{a_id}/progress",
        headers={"X-User-Id": str(user.id)},
        json={"current_item_idx": 5},
    )
    assert r.status_code == 403


async def test_other_user_cannot_cancel(client, admin, user):
    h_admin = {"X-User-Id": str(admin.id)}
    r = await client.post("/api/auftraege", headers=h_admin, json=make_payload())
    a_id = r.json()["id"]
    await client.post(f"/api/auftraege/{a_id}/start", headers=h_admin)

    r = await client.post(
        f"/api/auftraege/{a_id}/cancel",
        headers={"X-User-Id": str(user.id)},
    )
    assert r.status_code == 403


async def _create_completed(client, owner):
    h = {"X-User-Id": str(owner.id)}
    r = await client.post("/api/auftraege", headers=h, json=make_payload())
    a_id = r.json()["id"]
    await client.post(f"/api/auftraege/{a_id}/start", headers=h)
    await client.post(f"/api/auftraege/{a_id}/complete", headers=h)
    return a_id


async def test_admin_can_delete_history(client, admin):
    a_id = await _create_completed(client, admin)
    r = await client.delete(
        f"/api/history/{a_id}",
        headers={"X-User-Id": str(admin.id)},
    )
    assert r.status_code == 204


async def test_user_cannot_delete_history(client, admin, user):
    a_id = await _create_completed(client, admin)
    r = await client.delete(
        f"/api/history/{a_id}",
        headers={"X-User-Id": str(user.id)},
    )
    assert r.status_code == 403
