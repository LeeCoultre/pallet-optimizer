# Marathon · Ops Runbook

Production operations for the Marathon warehouse tool. Sized for one
admin (you) handling 5 internal users at the Lynne warehouse.

> **Production URL:** https://lagerauftrag-production.up.railway.app
> **Repo:** https://github.com/LeeCoultre/Lagerauftrag
> **Hosting:** Railway · Postgres + single Docker service
> **Auth:** Clerk (test instance `trusted-spider-53`)

---

## Quick reference — when something goes wrong

| Symptom | Where to look first |
|---|---|
| App returns 401 on every request | [Clerk JWKS unreachable](#clerk-jwks-unreachable) |
| App returns 500 / blank screen | [Frontend Error Boundary](#error-boundary--incident-id) → check Railway logs |
| Backend won't start: `REFUSING TO START — ALLOW_ANONYMOUS=true` | [Anonymous-mode prod guard tripped](#anonymous-mode-prod-guard) |
| Anyone can post to `/api/auftraege` | [Disable anonymous mode](#disable-anonymous-mode) — IMMEDIATE |
| Postgres unreachable | [DB down / restart](#database-down) |
| Tests wiped some prod data | [Tier-0 incident: tests ran against prod DB](#tests-against-prod-db) — restore from snapshot |
| Bad commit reached `main` | [Rollback / hotfix](#rollback) |

---

## 1 · Production safety checks

### Disable anonymous mode

`ALLOW_ANONYMOUS=true` is **only for local dev**. On Railway:

1. Railway → `Marathon` service → Variables
2. Find `ALLOW_ANONYMOUS` and `VITE_ALLOW_ANONYMOUS`
3. **Delete both** (don't set to `false` — delete the variable so any
   future `getenv` clearly returns `None`)
4. Trigger a redeploy

The backend has a startup guard (`backend/main.py: _verify_anonymous_safety`)
that **refuses to boot** if `ALLOW_ANONYMOUS=true` AND any of
`RAILWAY_ENVIRONMENT`, `RAILWAY_PROJECT_ID`, `KUBERNETES_SERVICE_HOST`,
`DYNO`, `FLY_APP_NAME` is present. So a misconfigured deploy fails
fast with a SystemExit message rather than silently leaking.

#### Verifying it's off in prod

```bash
curl -s https://lagerauftrag-production.up.railway.app/api/health | jq .
```

`anonymous_mode` field should be `false`. If `true` → escalate to
the [disable](#disable-anonymous-mode) step above.

---

### Anonymous-mode prod guard

If a deploy log shows:

```
REFUSING TO START — ALLOW_ANONYMOUS=true detected in a production-shaped
environment (Railway/K8s/Heroku/Fly). This would let any unauthenticated
request act as the anonymous@local user. Unset ALLOW_ANONYMOUS in your
service variables and redeploy.
```

That's the safety guard doing its job. Follow [disable anonymous
mode](#disable-anonymous-mode), redeploy. The guard is in
`backend/main.py:_verify_anonymous_safety()` if you ever need to
adjust the heuristic for which env vars count as "production".

---

## 2 · Clerk

### Rotate `CLERK_SECRET_KEY`

If the secret key was ever pasted into a chat / git history / log:

1. Clerk Dashboard → top-right org → **API Keys**
2. Find the **Secret Key** for the active instance
3. Click **Regenerate** → confirm
4. Copy the new `sk_test_…` (or `sk_live_…`)
5. Railway → `Marathon` service → Variables → update `CLERK_SECRET_KEY`
6. Save. Railway redeploys the service automatically.
7. Within ~60 s the old key stops working. Verify by curling `/api/me`
   with a known JWT — should still return 200.

> The publishable key (`VITE_CLERK_PUBLISHABLE_KEY`) does **not** need
> to rotate at the same time — it's safe to expose.

### Invite a new user

1. Clerk Dashboard → **Users** → **Invite user**
2. Email + magic-link option enabled
3. Marathon backend lazy-creates the `users` row on first login
   (see `backend/deps.py: _provision_user`).
4. If you want the new user to be admin: set
   `INITIAL_ADMIN_EMAIL=their@email` on Railway BEFORE their first
   login, OR flip role manually:
   ```bash
   psql $DATABASE_URL -c "UPDATE users SET role='admin' WHERE email='their@email';"
   ```

### Clerk JWKS unreachable

Symptoms: every API call returns 401 with `Invalid token: ...`.

1. Check Clerk status page: https://status.clerk.com/
2. Test JWKS endpoint manually:
   ```bash
   curl -I https://trusted-spider-53.clerk.accounts.dev/.well-known/jwks.json
   ```
   Should return `200 OK`. If 4xx/5xx → wait for Clerk to recover.
3. If Clerk is down for >15 min and the warehouse needs to keep
   working, last-resort: enable a temporary `ALLOW_ANONYMOUS=true`
   (see [anonymous mode](#disable-anonymous-mode)) — but that opens
   `/api/*` to the world. Only do this on a brief planned window
   and immediately remove it.

---

## 3 · Database

### Database down

Railway → `Postgres` service → check status. If "Crashed" or
"Restarting":

1. Wait 2 min — Railway auto-restarts.
2. If still down, Railway → Postgres → **Restart** manually.
3. If logs show out-of-disk: contact Railway support, scale up.

The Marathon backend will return 503 from `/api/health` when the
DB is unreachable. The `DynamicIsland` connection-status indicator
(if user has the experiment enabled) shows red `Offline`.

### Restore from snapshot

Railway takes daily Postgres snapshots automatically.

1. Railway → `Postgres` service → **Backups** tab
2. Pick a snapshot timestamp from the list
3. **Restore to a new database** (don't overwrite live!) → Railway
   provisions a new Postgres service named e.g. `Postgres-restored`
4. Verify the restore — connect and check rows:
   ```bash
   psql $RESTORED_DATABASE_URL -c "SELECT count(*) FROM auftraege; SELECT count(*) FROM users;"
   ```
5. Once verified, swap `DATABASE_URL` reference in the `Marathon`
   service to point at the new Postgres → redeploy.
6. Decommission the old (broken) Postgres service.

### Verify backups (monthly task)

Last-friday-of-the-month, 10 minutes:

1. Pick the most recent snapshot
2. Restore to a temporary DB on Railway (don't swap into prod)
3. Connect via `psql`, run:
   ```sql
   SELECT count(*) AS users FROM users;
   SELECT count(*) AS auftraege FROM auftraege;
   SELECT count(*) AS history FROM auftraege WHERE status='completed';
   SELECT max(created_at) AS latest FROM auftraege;
   ```
4. Counts should be plausible (≥ what you remember from prod);
   `latest` should be within 24h of the snapshot time.
5. Delete the temporary Postgres service.

If anything looks wrong → escalate to Railway support, snapshot
might be corrupted.

### Tests against prod DB

The repo-root `conftest.py` refuses to run pytest if `DATABASE_URL`
points at a hosted Postgres and `TEST_DATABASE_URL` isn't set. If
you somehow bypassed that and tests wiped data:

1. Stop the test process immediately
2. Restore from the most recent Railway snapshot
   ([restore](#restore-from-snapshot))
3. The window of lost data = time between snapshot and now (< 24h)
4. Notify the 5 users so they re-upload any Aufträge from after
   the snapshot timestamp

> **Prevention:** always have `TEST_DATABASE_URL` exported in your
> shell before running pytest. The CI pipeline (Tier 1.5) sets this
> automatically.

---

## 4 · Deploys

### Normal deploy

1. PR opened on GitHub → CI runs (`lint`, `test`, `build`)
2. Merge to `main` → Railway picks up the push within ~30 s
3. Railway builds Dockerfile (3-5 min) → swaps the running container
4. Smoke check: `curl https://.../api/health` → `status: ok`
5. Open the app, sign in, glance at sidebar queue

### Rollback

If a deploy is bad and Railway logs are full of 500s:

1. Railway → `Marathon` service → **Deployments** tab
2. Find the last known-good deployment (timestamp before the bad one)
3. Click `⋯` → **Redeploy**
4. Railway builds + swaps in ~3 min
5. Once verified working, on your laptop:
   ```bash
   git revert <bad-sha>          # creates a clean revert commit
   git push origin main          # triggers a fresh deploy from the revert
   ```
   Don't `git reset --hard` and force-push to `main` — that nukes
   history. Revert commits are safe.

---

## 5 · Frontend errors

### Error Boundary + incident ID

When a user sees the "Etwas ist schiefgelaufen" fallback page, they
get an **incident ID** like `INC-LXJ1Z3KQ-AB12`. They click "Fehler-
Details kopieren" and paste it in Slack/email to you.

The detail dump includes:
- Incident ID
- Timestamp + URL
- User agent
- Error message + stack (top 12 frames)
- React component stack (top 16 frames)

Once Sentry is wired up (Tier 1.1) the same incident ID will be
searchable in Sentry → match user's report to your error log.

The most-recent incident is also stored in the user's
`localStorage.marathon.lastIncident` for the case where they didn't
click "copy".

---

## 6 · Environment variables — full inventory

| Variable | Where | Required | Notes |
|---|---|---|---|
| `DATABASE_URL` | Railway service · `.env` local | yes | Postgres URL. Railway injects via reference variable from Postgres service. |
| `TEST_DATABASE_URL` | `.env` local · CI secret | for pytest | Separate Postgres so tests don't TRUNCATE prod. |
| `VITE_CLERK_PUBLISHABLE_KEY` | Railway · `.env` local | yes | Frontend auth. Must be in Dockerfile `ARG` for Railway build. Public — safe to expose. |
| `CLERK_SECRET_KEY` | Railway · `.env` local | yes | Backend → Clerk Backend API. Rotate on leak. |
| `INITIAL_ADMIN_EMAIL` | Railway · `.env` local | yes | First user with this email gets `role=admin` on lazy-create. |
| `VITE_API_URL` | local dev only | local only | `http://127.0.0.1:8001`. Empty in prod (same-origin deploy). |
| `CORS_ALLOWED_ORIGINS` | Railway optional | no | Comma-separated. Defaults to localhost dev. |
| `ALLOW_ANONYMOUS` | local dev only | no | NEVER on Railway. Backend startup guard refuses to start. |
| `VITE_ALLOW_ANONYMOUS` | local dev only | no | Frontend mirror of above. |

---

## 7 · Common operations cookbook

### Reset a user's role

```bash
psql $DATABASE_URL -c "UPDATE users SET role='admin' WHERE email='X';"
```

### See who's currently working

```sql
SELECT u.email, a.file_name, a.started_at
FROM auftraege a JOIN users u ON a.assigned_to_user_id = u.id
WHERE a.status = 'in_progress'
ORDER BY a.started_at DESC;
```

### Find suspiciously slow Aufträge

```sql
SELECT file_name, duration_sec, article_count,
       round(duration_sec::numeric / NULLIF(article_count,0), 1) AS sec_per_article
FROM auftraege
WHERE status = 'completed' AND duration_sec > 0
ORDER BY sec_per_article DESC
LIMIT 20;
```

### Prune audit_log older than 1 year

```sql
DELETE FROM audit_log WHERE created_at < now() - interval '1 year';
```

(Schedule this monthly — Tier 2.7 of the production plan automates it.)

### Run pytest locally with safe isolation

```bash
export TEST_DATABASE_URL=postgresql://localhost:5433/marathon_test
.venv/bin/pytest                    # full suite
.venv/bin/pytest backend/tests/test_admin.py -v
```

If `TEST_DATABASE_URL` is unset and `DATABASE_URL` looks like prod,
the suite refuses to start with a helpful error.

---

## 8 · Maintenance schedule

| Frequency | Task |
|---|---|
| Per deploy | Smoke check `/api/health` + sign in + open Pruefen |
| Weekly | Review Sentry (once wired) for new error patterns |
| Monthly | Verify backup restore (10 min, last Friday of month) |
| Monthly | Prune `audit_log` rows >1 year |
| Quarterly | Review Clerk user list, remove ex-employees |
| Quarterly | Rotate `CLERK_SECRET_KEY` (defensive even if no leak) |
| Yearly | Re-test full disaster-recovery procedure end-to-end |

---

## 9 · Escalation

| Issue | Who |
|---|---|
| Railway platform outage | https://status.railway.com → wait |
| Clerk auth outage | https://status.clerk.com → wait or anon-mode workaround |
| Postgres data corruption | Railway support + restore-from-snapshot |
| Suspected security breach | Rotate Clerk secret immediately; audit `audit_log` table for anomalies; if confirmed, take service offline (Railway → Pause) until investigated |
| App-level bug breaking workflow | Rollback to previous deploy (see [Rollback](#rollback)); open issue on GitHub |
