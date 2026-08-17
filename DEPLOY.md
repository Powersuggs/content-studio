# Deploying Content Studio

This assumes Vercel (the routes/config here -- `vercel.json`, `after()`,
`maxDuration` -- are Vercel-flavored, but the same shape works on any
serverless host that supports scheduled functions and background work;
swap the provider-specific bits as needed).

## 0. Before your first commit

```bash
./scripts/check-secrets.sh
```

This confirms `.env`/`.env.local` are actually git-ignored (not just
listed in `.gitignore` -- a file tracked *before* the ignore rule
existed would still get committed) and greps your staged diff for
anything secret-shaped (API keys, access tokens, DB connection strings
with an inline password). It's a heuristic, not a substitute for
reading the diff yourself. Run it again before every commit that
touches env handling, config, or anything that might carry a
credential.

## 1. Database: use the pooler connection string

Get the **transaction pooler** connection string from your Postgres
provider, not the direct one:

- **Supabase**: Settings -> Database -> Connection string -> "Transaction" mode, port `6543`
- **Neon**: the connection string with `-pooler` in the hostname
- **Render / RDS Proxy**: whichever they label "pooled" / "pgbouncer" / "transaction mode"

Why this matters: direct database connections are commonly IPv6-only,
while serverless functions run over IPv4. A direct string works from
your laptop (which almost certainly has IPv6) and then fails *only*
once deployed -- one of the most common "works locally, breaks in prod"
surprises with serverless + Postgres. `lib/db.ts` also logs a
best-effort warning in production if `DATABASE_URL` doesn't look
pooled, but that's a safety net, not a guarantee -- get the right
string from your provider's dashboard.

Run the migrations in `migrations/` against that database (in order)
before your first deploy.

## 2. Environment variables

Set everything in `.env.example` in your host's project settings:
`DATABASE_URL` (pooled, see above), `APP_PASSWORD`, `SESSION_SECRET`,
`ANTHROPIC_API_KEY`, `INSTAGRAM_ACCESS_TOKEN`, `INSTAGRAM_USER_ID`,
`APP_TIMEZONE`, and `CRON_SECRET`.

`CRON_SECRET` is what lets `/api/sync/cron` tell the platform's real
scheduled request apart from a random request to the same public URL.
On Vercel, once `CRON_SECRET` is set as an env var, Vercel automatically
sends `Authorization: Bearer $CRON_SECRET` on cron-triggered requests --
you don't wire that up yourself.

## 3. Scheduled sync, not an in-process timer

`vercel.json` defines the nightly cron:

```json
{ "crons": [{ "path": "/api/sync/cron", "schedule": "0 9 * * *" }] }
```

This is the actual nightly sync in production. The in-process interval
in `lib/ig/dev-scheduler.ts` is dev-only convenience and hard-disables
itself when `NODE_ENV === "production"` -- serverless instances are too
short-lived to hold a `setInterval` reliably, so relying on it in prod
would mean the nightly sync silently doesn't happen.

Both the cron route and the manual trigger route call the same
`runInstagramSync()`, which acquires a DB-backed lock
(`lib/ig/sync-lock.ts`) before doing anything. If a manual run and the
nightly cron overlap, only one actually runs -- the other sees the lock
held (or sees a sync completed inside the skip window) and exits
immediately without pulling anything.

## 4. Manual sync button

The dashboard's "Sync now" button calls `POST /api/sync/trigger`, which
returns `202` immediately (via `after()`, so the sync keeps running
after the response is sent) rather than making the browser wait minutes
on one request. The button then polls `GET /api/sync/status` every few
seconds until `last_synced_at` moves past its value when the sync
started, then reloads.

`maxDuration = 300` is set on both the trigger and cron routes so the
platform doesn't kill the background work early -- confirm your plan
actually supports background execution past the response (Vercel:
Fluid compute / background functions); if not, you'll need a
queue-backed approach instead (e.g. a lightweight job queue or a
dedicated worker), since a plain serverless function that gets frozen
the instant the response is sent won't keep running your sync.

## 5. Deploy

```bash
vercel --prod
```

(or your platform's equivalent). **A successful build is not a
successful deployment.** After it finishes:

1. Open the live URL, not `localhost`.
2. Log in through the password gate.
3. Confirm the dashboard actually renders real data -- your profile
   header, real post thumbnails, real numbers in the stat tiles. An
   empty dashboard with no errors can still mean `DATABASE_URL` is
   wrong, migrations weren't run against the production database, or
   the app is silently talking to an empty database.
4. Trigger a manual sync from the dashboard and confirm the "Sync now"
   button's poll actually completes (i.e. `last_synced_at` moves) --
   this exercises the pooled DB connection, the Instagram token, and
   the background-function path all at once.
5. Check the function logs for the `[sync/trigger]` or `[sync/cron]`
   log lines to confirm the sync ran end-to-end rather than erroring
   silently.
