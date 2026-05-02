"""Status-transition guards (409s for invalid actions on wrong state)."""

from .conftest import make_payload


async def test_start_completed_returns_409(client, admin):
    h = {"X-User-Id": str(admin.id)}
    r = await client.post("/api/auftraege", headers=h, json=make_payload())
    a_id = r.json()["id"]
    await client.post(f"/api/auftraege/{a_id}/start", headers=h)
    await client.post(f"/api/auftraege/{a_id}/complete", headers=h)

    r = await client.post(f"/api/auftraege/{a_id}/start", headers=h)
    assert r.status_code == 409
    assert "completed" in r.json()["detail"].lower()


async def test_start_nonexistent_returns_404(client, admin):
    r = await client.post(
        "/api/auftraege/00000000-0000-0000-0000-000000000000/start",
        headers={"X-User-Id": str(admin.id)},
    )
    assert r.status_code == 404


async def test_delete_in_progress_returns_409(client, admin):
    """Can only delete queued (or error) Auftraege, not in-progress ones."""
    h = {"X-User-Id": str(admin.id)}
    r = await client.post("/api/auftraege", headers=h, json=make_payload())
    a_id = r.json()["id"]
    await client.post(f"/api/auftraege/{a_id}/start", headers=h)

    r = await client.delete(f"/api/auftraege/{a_id}", headers=h)
    assert r.status_code == 409


async def test_progress_on_queued_returns_409(client, admin):
    """Can't update progress before /start."""
    h = {"X-User-Id": str(admin.id)}
    r = await client.post("/api/auftraege", headers=h, json=make_payload())
    a_id = r.json()["id"]

    r = await client.patch(f"/api/auftraege/{a_id}/progress", headers=h, json={"step": "focus"})
    assert r.status_code == 409


async def test_complete_queued_returns_409(client, admin):
    h = {"X-User-Id": str(admin.id)}
    r = await client.post("/api/auftraege", headers=h, json=make_payload())
    a_id = r.json()["id"]

    r = await client.post(f"/api/auftraege/{a_id}/complete", headers=h)
    assert r.status_code == 409


async def test_delete_history_nonexistent_returns_404(client, admin):
    r = await client.delete(
        "/api/history/00000000-0000-0000-0000-000000000000",
        headers={"X-User-Id": str(admin.id)},
    )
    assert r.status_code == 404


async def test_user_cannot_start_second_in_progress(client, admin):
    """One active Auftrag per user — second /start gets 409 with hint."""
    h = {"X-User-Id": str(admin.id)}
    a1 = (await client.post("/api/auftraege", headers=h, json=make_payload("a.docx"))).json()["id"]
    a2 = (await client.post("/api/auftraege", headers=h, json=make_payload("b.docx"))).json()["id"]

    r1 = await client.post(f"/api/auftraege/{a1}/start", headers=h)
    assert r1.status_code == 200

    r2 = await client.post(f"/api/auftraege/{a2}/start", headers=h)
    assert r2.status_code == 409
    assert "another" in r2.json()["detail"].lower()

    # After completing the first, the second should start cleanly.
    await client.post(f"/api/auftraege/{a1}/complete", headers=h)
    r3 = await client.post(f"/api/auftraege/{a2}/start", headers=h)
    assert r3.status_code == 200
