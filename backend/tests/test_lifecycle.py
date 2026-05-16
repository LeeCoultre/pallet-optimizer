"""Happy path: create → start → progress → complete → history."""

from .conftest import make_payload


async def test_full_lifecycle(client, admin, as_user):
    as_user(admin)

    # 1. Create
    r = await client.post("/api/auftraege", json=make_payload(
        file_name="lifecycle.docx", fba="LC-1",
        pallets=[{"id": "P1", "items": [{"sku": "A"}, {"sku": "B"}]}],
    ))
    assert r.status_code == 201
    a = r.json()
    assert a["status"] == "queued"
    assert a["pallet_count"] == 1
    assert a["article_count"] == 2
    assert a["fba_code"] == "LC-1"

    # 2. Listed in queue
    r = await client.get("/api/auftraege")
    assert r.status_code == 200
    assert any(x["id"] == a["id"] for x in r.json())

    # 3. Start (atomic claim)
    r = await client.post(f"/api/auftraege/{a['id']}/start")
    assert r.status_code == 200
    s = r.json()
    assert s["status"] == "in_progress"
    assert s["step"] == "pruefen"
    assert s["assigned_to_user_name"] == "TestAdmin"
    assert s["started_at"] is not None

    # 4. Progress update
    r = await client.patch(f"/api/auftraege/{a['id']}/progress", json={
        "step": "focus",
        "current_pallet_idx": 0,
        "current_item_idx": 1,
        "completed_keys": {"P1|0|A": 12345},
    })
    assert r.status_code == 200
    p = r.json()
    assert p["step"] == "focus"
    assert p["current_item_idx"] == 1
    assert p["completed_keys"] == {"P1|0|A": 12345}

    # 5. Complete
    r = await client.post(f"/api/auftraege/{a['id']}/complete")
    assert r.status_code == 200
    c = r.json()
    assert c["status"] == "completed"
    assert c["finished_at"] is not None
    assert c["duration_sec"] is not None and c["duration_sec"] >= 0

    # 6. Out of /api/auftraege, into /api/history
    r = await client.get("/api/auftraege")
    assert all(x["id"] != a["id"] for x in r.json())

    r = await client.get("/api/history")
    items = r.json()["items"]
    assert len(items) == 1
    assert items[0]["id"] == a["id"]
    assert items[0]["assigned_to_user_name"] == "TestAdmin"


async def test_cancel_returns_to_queue(client, admin, as_user):
    as_user(admin)
    r = await client.post("/api/auftraege", json=make_payload())
    a_id = r.json()["id"]
    await client.post(f"/api/auftraege/{a_id}/start")

    r = await client.post(f"/api/auftraege/{a_id}/cancel")
    assert r.status_code == 200
    body = r.json()
    assert body["status"] == "queued"
    assert body["assigned_to_user_id"] is None
    assert body["completed_keys"] == {}
    assert body["pallet_timings"] == {}


async def test_abort_terminates_into_history(client, admin, as_user):
    """Storno: in_progress → cancelled, with flagged-article reasons
    persisted under parsed.cancellation and the row showing up in
    /api/history alongside completed ones."""
    as_user(admin)
    r = await client.post("/api/auftraege", json=make_payload(
        file_name="abort.docx", fba="AB-1",
        pallets=[{"id": "P1", "items": [{"sku": "A"}, {"sku": "B"}]}],
    ))
    a_id = r.json()["id"]
    await client.post(f"/api/auftraege/{a_id}/start")

    r = await client.post(f"/api/auftraege/{a_id}/abort", json={
        "items": [
            {"pallet_id": "P1", "item_idx": 0, "code": "A",
             "title": "Sku A", "reason": "Karton beschädigt"},
        ],
        "note": "Reklamation",
    })
    assert r.status_code == 200
    body = r.json()
    assert body["status"] == "cancelled"
    assert body["finished_at"] is not None
    assert body["duration_sec"] is not None and body["duration_sec"] >= 0
    canc = body["parsed"]["cancellation"]
    assert canc["note"] == "Reklamation"
    assert canc["by"]["name"] == "TestAdmin"
    assert canc["items"][0]["palletId"] == "P1"
    assert canc["items"][0]["reason"] == "Karton beschädigt"

    # No longer in active list
    r = await client.get("/api/auftraege")
    assert all(x["id"] != a_id for x in r.json())

    # Shows up in history
    r = await client.get("/api/history")
    items = r.json()["items"]
    assert any(x["id"] == a_id and x["status"] == "cancelled" for x in items)


async def test_abort_requires_in_progress(client, admin, as_user):
    """Cannot storno a queued (not started) Auftrag."""
    as_user(admin)
    r = await client.post("/api/auftraege", json=make_payload())
    a_id = r.json()["id"]

    r = await client.post(f"/api/auftraege/{a_id}/abort", json={"items": []})
    assert r.status_code == 409


async def test_abort_other_user_forbidden(client, admin, user, as_user):
    """A different user cannot storno someone else's in_progress row."""
    as_user(admin)
    r = await client.post("/api/auftraege", json=make_payload())
    a_id = r.json()["id"]
    await client.post(f"/api/auftraege/{a_id}/start")

    as_user(user)
    r = await client.post(f"/api/auftraege/{a_id}/abort", json={"items": []})
    assert r.status_code == 403
