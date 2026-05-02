"""Admin endpoints — gated by require_admin, full read + role-toggle."""

from .conftest import make_payload


# ─── Authorization gate ──────────────────────────────────────────────

async def test_user_cannot_access_admin(client, user, as_user):
    as_user(user)
    r = await client.get("/api/admin/ping")
    assert r.status_code == 403
    r = await client.get("/api/admin/auftraege")
    assert r.status_code == 403
    r = await client.get("/api/admin/users")
    assert r.status_code == 403
    r = await client.get("/api/admin/audit")
    assert r.status_code == 403
    r = await client.get("/api/admin/stats")
    assert r.status_code == 403


async def test_admin_ping(client, admin, as_user):
    as_user(admin)
    r = await client.get("/api/admin/ping")
    assert r.status_code == 200
    body = r.json()
    assert body["ok"] is True
    assert body["admin"]["email"] == "admin@test"


# ─── 2.8 — list all Auftraege across users + filters ────────────────

async def test_admin_lists_every_auftrag(client, admin, user, as_user):
    """Even Auftraege owned by other users + completed ones show up."""
    as_user(admin)
    a1 = (await client.post("/api/auftraege", json=make_payload("a1.docx", "FBA-A1"))).json()["id"]

    as_user(user)
    a2 = (await client.post("/api/auftraege", json=make_payload("a2.docx", "FBA-A2"))).json()["id"]
    await client.post(f"/api/auftraege/{a2}/start")
    await client.post(f"/api/auftraege/{a2}/complete")  # → completed

    as_user(admin)
    r = await client.get("/api/admin/auftraege")
    assert r.status_code == 200
    body = r.json()
    assert body["total"] == 2
    ids = {x["id"] for x in body["items"]}
    assert ids == {a1, a2}


async def test_admin_filter_by_status(client, admin, user, as_user):
    as_user(admin)
    queued_id = (await client.post("/api/auftraege", json=make_payload("q.docx"))).json()["id"]

    as_user(user)
    other = (await client.post("/api/auftraege", json=make_payload("o.docx"))).json()["id"]
    await client.post(f"/api/auftraege/{other}/start")
    await client.post(f"/api/auftraege/{other}/complete")

    as_user(admin)
    r = await client.get("/api/admin/auftraege?status=queued")
    items = r.json()["items"]
    assert len(items) == 1
    assert items[0]["id"] == queued_id

    r = await client.get("/api/admin/auftraege?status=completed")
    items = r.json()["items"]
    assert len(items) == 1
    assert items[0]["id"] == other


async def test_admin_search_by_filename(client, admin, as_user):
    as_user(admin)
    a_a = (await client.post("/api/auftraege", json=make_payload("ALPHA.docx"))).json()["id"]
    a_b = (await client.post("/api/auftraege", json=make_payload("beta.docx"))).json()["id"]

    r = await client.get("/api/admin/auftraege?search=alpha")
    items = r.json()["items"]
    assert {x["id"] for x in items} == {a_a}


# ─── 2.9 — list users + role toggle ──────────────────────────────────

async def test_admin_lists_users_with_completion_count(client, admin, user, as_user):
    as_user(user)
    a = (await client.post("/api/auftraege", json=make_payload())).json()["id"]
    await client.post(f"/api/auftraege/{a}/start")
    await client.post(f"/api/auftraege/{a}/complete")

    as_user(admin)
    r = await client.get("/api/admin/users")
    assert r.status_code == 200
    by_email = {u["email"]: u for u in r.json()}
    assert by_email["user@test"]["auftraege_completed"] == 1
    assert by_email["admin@test"]["auftraege_completed"] == 0


async def test_admin_can_promote_user(client, admin, user, as_user):
    from backend.orm import UserRole

    as_user(admin)
    r = await client.patch(
        f"/api/admin/users/{user.id}/role",
        json={"role": "admin"},
    )
    assert r.status_code == 200
    assert r.json()["role"] == "admin"

    # Mirror the persisted change in the fixture object — the auth
    # override returns this Python instance directly; without the
    # mirror it would still report role=user.
    user.role = UserRole.admin
    as_user(user)
    r = await client.get("/api/admin/ping")
    assert r.status_code == 200


async def test_admin_cannot_demote_self(client, admin, as_user):
    as_user(admin)
    r = await client.patch(
        f"/api/admin/users/{admin.id}/role",
        json={"role": "user"},
    )
    assert r.status_code == 400
    assert "yourself" in r.json()["detail"].lower()


async def test_role_change_recorded_in_audit(client, admin, user, as_user):
    as_user(admin)
    await client.patch(
        f"/api/admin/users/{user.id}/role",
        json={"role": "admin"},
    )
    r = await client.get("/api/admin/audit?action=user_role_change")
    items = r.json()["items"]
    assert len(items) == 1
    assert items[0]["meta"]["new_role"] == "admin"
    assert items[0]["meta"]["target_email"] == "user@test"


# ─── 2.10 — audit log viewer ─────────────────────────────────────────

async def test_admin_audit_includes_actions(client, admin, as_user):
    as_user(admin)
    a = (await client.post("/api/auftraege", json=make_payload())).json()["id"]
    await client.post(f"/api/auftraege/{a}/start")
    await client.post(f"/api/auftraege/{a}/complete")

    r = await client.get("/api/admin/audit")
    actions = [e["action"] for e in r.json()["items"]]
    assert "upload" in actions
    assert "start" in actions
    assert "complete" in actions


async def test_admin_audit_filter_by_user(client, admin, user, as_user):
    as_user(admin)
    await client.post("/api/auftraege", json=make_payload("x.docx"))
    as_user(user)
    await client.post("/api/auftraege", json=make_payload("y.docx"))

    as_user(admin)
    r = await client.get(f"/api/admin/audit?user_id={user.id}")
    items = r.json()["items"]
    assert len(items) == 1
    assert items[0]["user_name"] == "TestUser"


# ─── 2.11 — KPI dashboard ────────────────────────────────────────────

async def test_admin_stats_shape_and_counts(client, admin, user, as_user):
    as_user(admin)
    a1 = (await client.post("/api/auftraege", json=make_payload())).json()["id"]
    a2 = (await client.post("/api/auftraege", json=make_payload())).json()["id"]
    # finish a1 (admin), leave a2 queued
    await client.post(f"/api/auftraege/{a1}/start")
    await client.post(f"/api/auftraege/{a1}/complete")

    r = await client.get("/api/admin/stats")
    assert r.status_code == 200
    s = r.json()
    assert s["total_auftraege"] == 2
    assert s["queued_now"] == 1
    assert s["in_progress_now"] == 0
    assert s["completed_total"] == 1
    assert s["completed_today"] == 1
    assert s["completed_this_week"] == 1
    assert s["avg_duration_sec"] is not None
    # Top-1 should be admin with 1 completion
    assert len(s["top_users"]) == 1
    assert s["top_users"][0]["name"] == "TestAdmin"
    assert s["top_users"][0]["count"] == 1
