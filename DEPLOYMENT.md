# Deploying ReachInbox

A step-by-step guide to putting this application live.

> **Read this first:** a pure-Vercel deployment is **not possible**. Vercel runs static sites and
> short-lived serverless functions; this application also needs an always-on worker and a shared
> filesystem for attachments. The guide below splits the app accordingly.

---

## Why not all on Vercel

| Component | Can Vercel host it? | Why |
| --- | --- | --- |
| React frontend | **Yes** | Static build — what Vercel is for |
| Express API | Partly | Works as a serverless function, but long-lived SSE breaks and attachments need object storage |
| **BullMQ worker** | **No** | It is a *continuous* Redis consumer. Vercel functions only run on request — there is no always-on process. **This is the hard blocker.** |
| PostgreSQL / Redis | **No** | Vercel offers no managed database or Redis |

So: **frontend on Vercel, API + worker on a container host.**

---

## Target architecture

```
        Vercel                          Container host (Railway / Render / Fly)
  ┌────────────────┐                ┌──────────────────────────────────────┐
  │  React SPA     │─── HTTPS ─────▶│  api     (npm run start, :8010)      │
  │  (static)      │                │  worker  (npm run worker)            │
  └────────────────┘                └───────┬──────────────────┬───────────┘
                                            │                  │
                              Supabase/Neon │        Railway / │ Upstash
                                 PostgreSQL │         Redis    │
                                            ▼                  ▼
                                  Object storage (S3 / R2 / Supabase Storage)
```

---

## Prerequisites

Accounts on:

1. **Vercel** — frontend
2. **Railway** (or Render/Fly) — API + worker
3. **Supabase** or **Neon** — PostgreSQL
4. **Railway Redis**, **Upstash**, or **Redis Cloud** — Redis
5. **Cloudflare R2**, **AWS S3**, or **Supabase Storage** — attachments
6. **A real SMTP provider** — Resend, SendGrid, Postmark, or SES

---

## Step 1 — PostgreSQL

1. Create a project in Supabase or Neon.
2. Copy the **connection string** — it becomes `DATABASE_URL`.
3. Use the **pooled** connection string if your provider offers one (serverless-friendly), and a
   direct connection for migrations.

> Supabase's connection string already includes `?schema=public`. Keep it.

## Step 2 — Redis

Create a Redis instance and copy its URL — it becomes `REDIS_URL`.

**Important for a job queue:**
- **Persistence must be on.** Delayed jobs live in Redis; without AOF, a restart silently drops
  every scheduled email. Verify with `redis-cli config get appendonly` → `yes`.
- **A standard managed Redis is safer than Upstash here.** Upstash restricts blocking commands and
  eviction policy, which BullMQ relies on. Upstash *can* work, but Railway's Redis or Redis Cloud is
  the lower-risk choice for a queue.

## Step 3 — Object storage

Attachments **require** object storage in this architecture: the API writes the file and the worker
reads it, and as separate services they do not share a filesystem.

Create a bucket and note the credentials. Works with any S3-compatible provider.

| Provider | `S3_ENDPOINT` | `S3_FORCE_PATH_STYLE` |
| --- | --- | --- |
| AWS S3 | *(blank)* | `false` |
| Cloudflare R2 | `https://<account-id>.r2.cloudflarestorage.com` | `false` |
| Supabase Storage | `https://<project>.supabase.co/storage/v1/s3` | `true` |
| MinIO | your host | `true` |

## Step 4 — Deploy the API and worker

The repository includes a `Dockerfile` at the root that runs **either** process.

1. Create a project on your container host and point it at this repository.
2. It will detect the `Dockerfile` automatically. Build context: **repository root**.
3. Create **two services** from the same image:

| Service | Start command |
| --- | --- |
| `api` | *(default — `npm run start`)* |
| `worker` | `npm run worker` |

4. Set the environment variables on **both** services (see [Step 6](#step-6--environment-variables)).
5. Run migrations **once**, after the API is up:

```bash
npx prisma migrate deploy
```

> Run this from a shell on the host, or as a one-off command. It is idempotent and safe to re-run.

6. Expose the API publicly and note its URL — e.g. `https://reachinbox-api.up.railway.app`.

## Step 5 — Deploy the frontend to Vercel

1. Import the repository into Vercel.
2. **Set Root Directory to `frontend`.** This is essential — the repo is a monorepo.
3. Vercel reads `frontend/vercel.json`, which sets:
   - build command `npm run build`
   - output directory `build`
   - install command `npm install --legacy-peer-deps` (required — `react-day-picker@8` conflicts
     with `date-fns@4`)
   - an SPA rewrite so deep links like `/dashboard/scheduled` do not 404
4. Add the frontend environment variables (see [Step 6](#step-6--environment-variables)).
5. Deploy and note the URL — e.g. `https://reachinbox.vercel.app`.

> `REACT_APP_*` variables are inlined at **build time**. Changing one requires a redeploy.

## Step 6 — Environment variables

### Container host (API + worker) — `server/.env`

| Variable | Value |
| --- | --- |
| `NODE_ENV` | `production` |
| `PORT` | `8010` (or the port your host assigns) |
| `DATABASE_URL` | from Step 1 |
| `REDIS_URL` | from Step 2 |
| `JWT_SECRET` | **a long random string** — `openssl rand -base64 48` |
| `FRONTEND_URL` | your Vercel URL, e.g. `https://reachinbox.vercel.app` |
| `WORKER_CONCURRENCY` | `5` |
| `MIN_EMAIL_DELAY_MS` | `2000` |
| `MAX_EMAILS_PER_HOUR` | `200` |
| `SUPABASE_URL` | Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role key — **server-side only** |
| `S3_BUCKET` / `S3_REGION` / `S3_ENDPOINT` / `S3_ACCESS_KEY_ID` / `S3_SECRET_ACCESS_KEY` | from Step 3 |
| `S3_FORCE_PATH_STYLE` | per the table in Step 3 |
| `ADMIN_USER` / `ADMIN_PASSWORD` | **change from the defaults** |
| `SMTP_*` | your real provider (see the note below) |
| `ELASTICSEARCH_URL` | leave blank to use the PostgreSQL fallback |
| `DEV_LOGIN_ENABLED` | **leave blank** — dev sign-in is off in production automatically |

> **Email provider:** the app currently ships an Ethereal sandbox that delivers no real mail. To
> send for real you must swap `EtherealEmailProvider` for your provider's SMTP settings — this is a
> small code change, not just configuration. See
> [Known limitations](#known-limitations).

### Vercel (frontend) — `frontend/.env`

| Variable | Value |
| --- | --- |
| `REACT_APP_BACKEND_URL` | your API URL, e.g. `https://reachinbox-api.up.railway.app` |
| `REACT_APP_SUPABASE_URL` | same as `SUPABASE_URL` |
| `REACT_APP_SUPABASE_ANON_KEY` | Supabase **anon** key (safe for the browser) |

> Never put `SUPABASE_SERVICE_ROLE_KEY` in Vercel — it bypasses row-level security.

## Step 7 — Post-deploy configuration

These are easy to forget and each one breaks a feature if missed.

1. **Supabase redirect URLs** — Authentication → URL Configuration → add
   `https://<your-app>.vercel.app/dashboard` to the redirect allow-list, or Google sign-in will
   fail on return.
2. **Google provider** — Authentication → Providers → Google must be enabled with your Google
   Cloud client ID/secret. The Google Cloud authorised redirect URI is Supabase's
   `https://<project>.supabase.co/auth/v1/callback` — **not** your app's URL.
3. **Email confirmation** — decide whether new sign-ups must confirm their address. Supabase's
   built-in mailer is rate-limited to a few emails per hour, which will block sign-ups quickly;
   configure custom SMTP in Supabase for anything beyond testing.
4. **Slack (optional)** — update the Slack app's redirect URL to
   `https://<your-api>/api/auth/slack/oauth/callback` and set `SLACK_REDIRECT_URI` and
   `APP_PUBLIC_URL` to match.

## Step 8 — Verify

```bash
# 1. API is up and all dependencies connected
curl -s https://<your-api>/api/health
# {"status":"ok","database":"connected","redis":"connected","elasticsearch":"not_configured"}

# 2. Dev sign-in is correctly disabled in production
curl -s -X POST https://<your-api>/api/auth/dev-login \
  -H 'Content-Type: application/json' -d '{"email":"x@y.com","name":"X"}'
# {"success":false,"error":{"message":"Route not found","code":"NOT_FOUND"}}

# 3. Auth config reflects the deployment
curl -s https://<your-api>/api/auth/config
# supabaseConfigured:true, devLoginEnabled:false
```

Then, in the browser:

1. Sign in with Google.
2. Compose an email to yourself and **Send** — confirm it arrives.
3. Compose another, **Schedule send** for ~3 minutes ahead.
4. Confirm it does **not** arrive immediately, then that it does arrive at the scheduled time.
5. Open the queue monitor — the Delayed count should show 1 until it fires.

---

## Security checklist

Before making the deployment public:

- [ ] `DEV_LOGIN_ENABLED` is **blank** (dev sign-in returns 404)
- [ ] `JWT_SECRET` is a strong random value, not the default
- [ ] `ADMIN_PASSWORD` is changed from `admin`
- [ ] `FRONTEND_URL` is your real domain, not `*`
- [ ] `SUPABASE_SERVICE_ROLE_KEY` exists **only** on the server, never in Vercel
- [ ] `.env` files are not committed (they are gitignored)
- [ ] Redis has persistence enabled
- [ ] Real SMTP is configured (Ethereal delivers nothing)

---

## Known limitations at deploy time

| Limitation | Impact | Workaround |
| --- | --- | --- |
| **Ethereal email provider** | No real mail is delivered | Swap in a real SMTP provider (code change) |
| **No registration UI** | Users cannot self-sign-up | Create accounts in Supabase |
| **No password reset** | Users cannot recover access | Reset manually in Supabase |
| **SSE queue stream** | Works on a container host; would break on serverless | Keep the API off serverless |
| **Elasticsearch optional** | Search falls back to simpler PostgreSQL matching | Leave `ELASTICSEARCH_URL` blank, or use Elastic Cloud |
| **No automated test suite** for API/scheduling | Regressions are not caught automatically | Test manually after each deploy |
| **Attachments not garbage-collected** | Orphaned objects accumulate | Add a lifecycle rule on the bucket |

---

## Troubleshooting

| Symptom | Cause | Fix |
| --- | --- | --- |
| Emails never send, jobs stay `delayed` | Worker service not running | Confirm the worker service is up and shares `REDIS_URL` |
| Scheduled emails arrive late | App was down at the scheduled time | Expected — jobs fire on restart rather than being skipped |
| Delayed jobs vanish after a Redis restart | AOF persistence disabled | Enable `appendonly yes` |
| Attachments missing from emails | Object storage not configured, or API and worker on separate filesystems | Set the `S3_*` variables on **both** services |
| Google sign-in fails on return | Redirect URL not allow-listed | Add the Vercel URL in Supabase → URL Configuration |
| Frontend deep links 404 | SPA rewrite missing | Confirm `frontend/vercel.json` is present and Root Directory is `frontend` |
| `npm install` fails on Vercel | Peer dependency conflict | The `installCommand` in `vercel.json` handles this — confirm it is being read |
| `P1001: Can't reach database` | Wrong `DATABASE_URL`, or migrations not run | Verify the connection string; run `prisma migrate deploy` |
| Search returns nothing | Elasticsearch down or index empty | Run `npm run reindex`, or leave ES unconfigured to use the fallback |

---

## Operational notes

- **The API and worker are separate processes.** Deploying only the API means nothing is ever sent.
- **PostgreSQL is the source of truth.** Redis and Elasticsearch are derived and rebuildable.
- **`npm run reconcile`** re-enqueues any job that exists in PostgreSQL but is missing from Redis.
  Safe to re-run; a no-op when consistent.
- **`npm run reindex`** rebuilds the search index from PostgreSQL.
- **Bull Board** (queue dashboard) is at `/api/admin/queues`, behind HTTP basic auth.
- **Scaling:** the worker is safe to scale horizontally — jobs are claimed atomically, so two
  workers cannot send the same email twice.
