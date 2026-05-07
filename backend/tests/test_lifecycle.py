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
    assert body["copied_keys"] == {}
    assert body["pallet_timings"] == {}
