# ReachInbox — Email Job Scheduler

ReachInbox schedules bulk email campaigns that send **gradually**, not all at once. You compose a
message, pick recipients, set a pacing delay and an hourly cap, then either send immediately or
schedule it for a future date/time. Delivery is driven by BullMQ delayed jobs backed by Redis —
no cron, no in-process timers — and every send is tracked from `scheduled` through to `sent` or
`failed`.

> **Status:** Deployed on Render for the assignment/demo environment.
>
> **Live Frontend:** https://reachinboxai-frontend-pz4w.onrender.com
>
> **Live API:** https://reachinbox-api-d7yd.onrender.com
>
> **API Health:** https://reachinbox-api-d7yd.onrender.com/api/health

---

## Key Features

**Implemented and verified end to end**

- **Authentication** — Google OAuth and email/password, both via Supabase; the resulting Supabase
  access token is exchanged for an app-issued JWT. Plus a development-only sign-in.
- **Email composition** — rich-text body (bold/italic/underline/colour/highlight/size), recipient
  chips with validation, link and emoji insertion, CSV/TXT recipient upload.
- **Attachments** — multi-file upload (5 files, 5 MB each) delivered with the email.
- **Immediate send** — queues for delivery now.
- **Scheduled send** — queues with a BullMQ delay; the email is not sent before its time.
- **Pacing and rate limiting** — per-recipient delay and a per-sender hourly cap enforced with
  atomic Redis `INCR`. Over-limit emails are rescheduled to the next hour, not dropped.
- **Status tracking** — `scheduled → processing → sent | failed`, with retry for failures.
- **Search** — full-text over recipient/subject/body via Elasticsearch, with PostgreSQL fallback.
- **Queue monitor** — live BullMQ queue state pushed over Server-Sent Events.
- **Slack notifications** — OAuth or incoming-webhook; posts when a sender hits its hourly cap.
- **Health endpoint** — reports database, Redis and Elasticsearch connectivity.

**Not implemented** (see [Known Limitations](#known-limitations)): registration UI, password reset,
CC/BCC, Google Drive, inline images, confidential mode, signatures.

---

## Architecture

### Hosted Architecture

The application is hosted using **Render** for both the frontend and backend, with Supabase providing authentication and PostgreSQL.

```text
                         ┌──────────────────────────────┐
                         │            Browser           │
                         │       React SPA + Auth       │
                         └──────────────┬───────────────┘
                                        │ HTTPS
                                        ▼
                ┌─────────────────────────────────────────────┐
                │          Render Static Site                 │
                │ React 19 + CRACO + Tailwind + shadcn/ui    │
                │ https://reachinboxai-frontend-pz4w.onrender.com
                └──────────────────────┬──────────────────────┘
                                       │ REST + SSE
                                       │ Bearer JWT
                                       ▼
                ┌─────────────────────────────────────────────┐
                │          Render Web Service                 │
                │ Node.js + Express + TypeScript              │
                │ API + BullMQ Worker                         │
                │ https://reachinbox-api-d7yd.onrender.com   │
                └──────────┬─────────────┬─────────────┬──────┘
                           │             │             │
                    ┌──────▼──────┐ ┌────▼─────┐ ┌────▼──────────┐
                    │ PostgreSQL  │ │  Redis   │ │ Supabase Auth │
                    │  (Prisma)   │ │ BullMQ   │ │ Google /      │
                    │ source of   │ │ delayed  │ │ email/password│
                    │ truth       │ │ jobs     │ └───────────────┘
                    └─────────────┘ └────┬──────┘
                                        │
                                        ▼
                              ┌─────────────────────┐
                              │ BullMQ Email Worker │
                              │ retries / pacing   │
                              └──────────┬──────────┘
                                         │
                                         ▼
                                  SMTP / Email Provider
```

### Hosted Components

| Component | Hosting / Service | Purpose |
| --- | --- | --- |
| Frontend | Render Static Site | Hosts the React SPA |
| Backend API | Render Web Service | Runs the Express/TypeScript API |
| BullMQ Worker | Same Render Web Service | Processes immediate and delayed email jobs |
| PostgreSQL | Supabase | Persistent application database |
| Authentication | Supabase Auth | Google OAuth and email/password |
| Redis | Render Redis / Key Value | BullMQ queue and rate-limit state |
| Search | Elasticsearch | Optional search index; PostgreSQL fallback |
| Email | SMTP / configured transport | Outgoing email processing |

### Live URLs

- **Frontend:** https://reachinboxai-frontend-pz4w.onrender.com
- **Backend API:** https://reachinbox-api-d7yd.onrender.com
- **Health:** https://reachinbox-api-d7yd.onrender.com/api/health
- **Queue dashboard:** https://reachinbox-api-d7yd.onrender.com/api/admin/queues

### Deployment Flow

1. Code is pushed to GitHub.
2. Render builds and publishes the React frontend as a Static Site.
3. Render builds the backend with:
   ```bash
   npm install --legacy-peer-deps && npx prisma generate && npm run build
   ```
4. The backend starts with:
   ```bash
   npx prisma migrate deploy && npm run start:all
   ```
5. Prisma migrations create/update the production PostgreSQL schema before the API starts.
6. `start:all` runs the API and BullMQ worker together in the Render Web Service.
7. The frontend communicates with the backend over HTTPS.
8. Supabase handles Google/email authentication. The Supabase access token is exchanged for the application's JWT.
9. The API writes campaign/job data to PostgreSQL and enqueues jobs in Redis.
10. The BullMQ worker consumes immediate or delayed jobs and sends through the configured email provider.

### Render SPA Routing

The frontend is configured as a Render Static Site with an SPA rewrite:

```text
/*  →  /index.html
```

This allows React Router routes such as `/login` and `/dashboard` to work after direct navigation or browser refresh.

### Important Deployment Detail

The deployment uses one Render Web Service for both the API and worker. This is necessary for the current free/demo setup because a separate always-on background worker is not used.

The worker must be running for queued email jobs to be processed.

> **Free-tier caveat:** Render free services may sleep when idle. If the backend sleeps, both the API and worker stop until the service wakes again. Production deployments should use an always-on worker and persistent infrastructure.

## Tech Stack

| Layer | Technology |
| --- | --- |
| Frontend | React 19, Create React App + CRACO, Tailwind CSS, shadcn/ui (Radix), lucide-react, axios, zod |
| Backend | Node.js 20+, TypeScript (strict), Express 4, Prisma 5, zod |
| Database | PostgreSQL 15 |
| Queue | BullMQ 5 |
| Cache / broker | Redis 7 (AOF enabled) |
| Search | Elasticsearch 8 — **optional** |
| Auth | Supabase Auth (Google + email/password), JWT |
| Email | Configured SMTP/Ethereal transport (Ethereal is development-only) |
| Logging | pino / pino-pretty |
| Infra | Docker Compose (Elasticsearch); PostgreSQL and Redis may also run natively |

---

## Project Structure

```
.
├── server/                     # Node/TypeScript backend (the real API)
│   ├── prisma/
│   │   ├── schema.prisma       # User, Sender, EmailCampaign, EmailJob, SlackIntegration
│   │   ├── migrations/         # applied via `prisma migrate deploy`
│   │   └── seed.ts             # demo data; enqueues its scheduled jobs
│   └── src/
│       ├── config/             # env validation, logger, prisma, redis connections
│       ├── controllers/        # auth, email, health
│       ├── integrations/       # email / google / slack / elasticsearch / attachments
│       ├── middleware/         # auth, error handler, zod validation
│       ├── queues/             # email.queue, queueStream (SSE), reconcile
│       ├── repositories/       # Prisma data access, scoped by user
│       ├── routes/             # /api/auth, /api/emails, /api/health
│       ├── services/           # auth, email, rate limiting
│       ├── validators/         # zod request schemas
│       └── workers/            # email.worker.ts — the BullMQ consumer
├── frontend/                   # React SPA
│   └── src/
│       ├── components/email/   # composer, toolbar, rich-text editor, schedule popover
│       ├── pages/              # login, dashboard, scheduled, sent, compose, queue, settings
│       ├── services/           # API clients
│       └── context/            # AuthContext
├── backend/                    # FastAPI reverse proxy for the hosting platform ONLY.
│                               # Not used in local development — see its server.py.
├── docker-compose.yml          # Elasticsearch (Postgres/Redis also defined)
├── image/                      # brand assets
├── plan/, memory/              # original planning documents (historical)
└── test_reports/, tests/       # test artifacts
```

---

## Prerequisites

- **Node.js 20+** and npm
- **PostgreSQL 15** — local install or the Docker service
- **Redis 7** — with **AOF persistence enabled** (see [Redis & BullMQ](#redis--bullmq))
- **Docker** — only needed for Elasticsearch, which is optional
- A **Supabase project** — only needed for Google/email sign-in; dev sign-in works without it

---

## Environment Variables

Copy `server/.env.example` → `server/.env` and fill it in. **Never commit `.env`** — it is
gitignored and holds a Supabase `service_role` key.

### `server/.env`

| Variable | Required | Purpose |
| --- | --- | --- |
| `NODE_ENV` | no | `development` / `production` (default `development`) |
| `PORT` | no | API port (default `8010`) |
| `DATABASE_URL` | **yes** | PostgreSQL connection string |
| `REDIS_URL` | no | Redis connection (default `redis://127.0.0.1:6379`) |
| `FRONTEND_URL` | no | CORS origin; production uses the hosted Render frontend URL |
| `JWT_SECRET` | **yes** | Signs app JWTs — **must be changed for production** |
| `WORKER_CONCURRENCY` | no | Parallel sends (default 5) |
| `MIN_EMAIL_DELAY_MS` | no | Floor on per-recipient delay (default 2000) |
| `MAX_EMAILS_PER_HOUR` | no | Default per-sender hourly cap (default 200) |
| `ETHEREAL_HOST` / `ETHEREAL_PORT` / `ETHEREAL_USER` / `ETHEREAL_PASSWORD` | no | Leave blank to auto-create a test account |
| `SUPABASE_URL` | for auth | Supabase project URL |
| `SUPABASE_ANON_KEY` | no | Not read by the backend; kept for parity |
| `SUPABASE_SERVICE_ROLE_KEY` | for auth | Verifies Supabase tokens. **Bypasses RLS — never expose** |
| `SLACK_CLIENT_ID` / `SLACK_CLIENT_SECRET` | for Slack OAuth | Enables the one-click Slack connect |
| `SLACK_REDIRECT_URI` | for Slack OAuth | Must match the Slack app exactly |
| `APP_PUBLIC_URL` | for Slack OAuth | Frontend origin used for the post-callback redirect |
| `ELASTICSEARCH_URL` | no | Blank disables search (falls back to PostgreSQL) |
| `ADMIN_USER` / `ADMIN_PASSWORD` | no | Bull Board basic auth (default `admin` / `admin`) |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` / `GOOGLE_CALLBACK_URL` | no | For the direct-OAuth route, which is **not implemented** |

### `frontend/.env`

| Variable | Purpose |
| --- | --- |
| `REACT_APP_BACKEND_URL` | API base, e.g. `http://localhost:8010` |
| `REACT_APP_SUPABASE_URL` | Same value as `SUPABASE_URL` |
| `REACT_APP_SUPABASE_ANON_KEY` | Supabase anon key (safe for the browser) |

CRA inlines `REACT_APP_*` at build time — **restart the dev server** after changing it.

---

## Local Development

Four processes. Infrastructure first, then three terminals.

```bash
# 1. Infrastructure
brew services start postgresql@15     # or: docker compose up -d postgres
brew services start redis             # or: docker compose up -d redis
docker compose up -d elasticsearch    # optional
```

```bash
# 2. Backend API  (terminal 2)
cd server && npm install
npx prisma migrate deploy
npm run start                          # http://localhost:8010
```

```bash
# 3. Worker  (terminal 3) — REQUIRED for any email to be sent
cd server && npm run worker
```

```bash
# 4. Frontend  (terminal 4)
cd frontend && npm install
npm start                              # http://localhost:3000
```

Verify:

```bash
curl -s localhost:8010/api/health
# {"status":"ok","database":"connected","redis":"connected","elasticsearch":"connected"}
```

### Database setup

```bash
cd server
npx prisma generate          # generate the client
npx prisma migrate deploy    # apply migrations (use `migrate dev` when authoring one)
npm run seed                 # optional demo data — WIPES existing rows, see below
```

> `npm run seed` calls `deleteMany` on users, campaigns, jobs and Slack integrations. It is
> destructive — do not run it against data you want to keep.

### Available scripts (`server/`)

| Command | Purpose |
| --- | --- |
| `npm run start` | API server |
| `npm run dev` | API server with watch |
| `npm run worker` | BullMQ worker |
| `npm test` | Unit tests |
| `npm run seed` | Demo data (**destructive**) |
| `npm run reindex` | Rebuild the Elasticsearch index from PostgreSQL |
| `npm run reconcile` | Re-enqueue jobs missing from the queue (add `-- --dry-run` to preview) |

---

## Redis & BullMQ

Redis is **required**. It holds the BullMQ queue and the rate-limit counters.

**Enable AOF persistence.** Without it, delayed jobs are lost on a Redis restart. The
`docker-compose.yml` service sets `--appendonly yes`; a native install must set `appendonly yes`
in `redis.conf`. Verify with `redis-cli config get appendonly`.

| Setting | Value |
| --- | --- |
| Queue name | `email-send-queue` |
| Job payload | `{ emailJobId }` — bodies stay in PostgreSQL, not Redis |
| Job id | the `emailJobId` (stable, aids idempotency) |
| Delay | `scheduledAt − now`, in milliseconds |
| Attempts | 3, exponential backoff from 5 s |
| Retention | last 2000 completed, 5000 failed |
| Concurrency | `WORKER_CONCURRENCY` (default 5) |

**Idempotency.** The worker atomically claims each job
(`updateMany` where `status: 'scheduled'`). Only one worker wins; others skip. This is what
prevents double sends under concurrency or after a crash-restart.

**Connections.** Three separate Redis connections: a worker connection
(`maxRetriesPerRequest: null`, required by BullMQ), a fail-fast producer connection for enqueuing,
and an app connection for rate limiting and health.

**Reconciliation.** PostgreSQL and Redis are two stores without a shared transaction, so a job can
in principle exist in one and not the other. `npm run reconcile` re-enqueues anything missing and
resets jobs stuck in `processing`. It is safe to re-run and is a no-op when consistent.

---

## Email Scheduling

```
Compose → POST /api/emails/schedule { startTime, delayMs, recipients, … }
        → campaign + EmailJob rows written to PostgreSQL (status = scheduled)
        → BullMQ job added with delay = scheduledAt − now
        → WAIT
        → worker fires at scheduledAt
        → email sent via the provider
        → status = sent (or failed)
```

- **Send now** and **Schedule send** use the *same* endpoint. The only difference is `startTime`:
  `new Date()` versus the chosen time.
- **Timezone.** The picker works in the browser's local zone and displays it. `startTime` is
  converted with `toISOString()` (local → UTC) and stored as a UTC `timestamptz`. No silent
  shifting.
- **Verified behaviour.** A job scheduled for `T` is never executed before `T`. It fires a few
  seconds after `T` at most (BullMQ's delayed-job promotion interval).
- **If the app is down when a job is due**, the job is not lost — it fires as soon as the worker
  runs again. It will be *late*, not skipped.

---

## Authentication

Two real methods, both via Supabase, plus a development fallback.

1. **Google** — `supabase.auth.signInWithOAuth({ provider: 'google' })`, a full-page redirect.
2. **Email + password** — `supabase.auth.signInWithPassword()`. Supabase verifies the credentials;
   this app never sees or stores a password. There is no password column in the database.
3. **Development sign-in** — `POST /api/auth/dev-login` takes an email and name and issues a token
   with no credential check. **This must be disabled before any public deployment**; it is a
   complete authentication bypass.

Both real methods then exchange the Supabase access token at `POST /api/auth/supabase` for an
app-issued JWT (7-day expiry) stored in `localStorage`.

**Authorization** is enforced server-side: every email query is scoped by the authenticated user,
and cross-user access returns 404. See [Security](#security).

**Logout is stateless** — the JWT is not revoked server-side; the client discards it. A token
remains valid until it expires.

---

## API Overview

All routes are under `/api`. `JWT` = requires `Authorization: Bearer <token>`.

| Method | Route | Auth | Purpose |
| --- | --- | --- | --- |
| GET | `/health` | — | DB / Redis / Elasticsearch status |
| GET | `/health/queue` | — | Queue counts snapshot |
| GET | `/health/queue/stream` | — | **SSE** stream of live queue counts |
| GET | `/auth/config` | — | Which auth methods are configured |
| POST | `/auth/dev-login` | — | **Development-only** sign-in |
| POST | `/auth/supabase` | — | Exchange a Supabase token for an app JWT |
| GET | `/auth/me` | JWT | Current user |
| POST | `/auth/logout` | JWT | Acknowledge logout (stateless) |
| GET | `/auth/slack/status` | JWT | Slack connection state |
| POST | `/auth/slack/connect` | JWT | Connect via incoming webhook |
| POST | `/auth/slack/disconnect` | JWT | Disconnect |
| GET | `/auth/slack/oauth/start` | JWT | Begin Slack OAuth |
| GET | `/auth/slack/oauth/callback` | — | Slack OAuth redirect target |
| POST | `/emails/schedule` | JWT | Create a campaign and enqueue its jobs |
| POST | `/emails/attachments` | JWT | Upload files (multipart, field `files`) |
| GET | `/emails/scheduled` | JWT | Paginated scheduled list |
| GET | `/emails/sent` | JWT | Paginated sent/failed list |
| GET | `/emails/stats` | JWT | Per-user status counts |
| GET | `/emails/search?q=` | JWT | Full-text search |
| GET | `/emails/:id` | JWT | One job (404 if not yours) |
| POST | `/emails/:id/retry` | JWT | Retry a failed job |

Responses use a consistent envelope: `{ success, data, pagination? }` or
`{ success: false, error: { message, code, details? } }`.

**Bull Board** (queue dashboard) is at `/api/admin/queues`, protected by HTTP basic auth using
`ADMIN_USER` / `ADMIN_PASSWORD`.

---

## Testing

```bash
cd server   && npm test        # unit tests (node:test)
cd server   && npx tsc --noEmit # typecheck
cd frontend && npx craco test --watchAll=false
cd frontend && npx craco build  # production build
```

There is **no lint script** configured in either package. Test coverage is thin — the suites cover
email validation/normalisation only. API, database, queue and scheduling behaviour were verified
manually (live HTTP, Redis and SQL inspection) during development, not by an automated suite.

---

## Build / Production

### Current Render Deployment

The application is currently deployed on Render.

#### Frontend — Render Static Site

- **Root Directory:** `frontend`
- **Build Command:**
  ```bash
  npm install --legacy-peer-deps && npm run build
  ```
- **Publish Directory:** `build`
- **Live URL:** https://reachinboxai-frontend-pz4w.onrender.com
- **Rewrite:** `/*` → `/index.html`

Frontend environment variables:

```text
REACT_APP_BACKEND_URL=https://reachinbox-api-d7yd.onrender.com
REACT_APP_SUPABASE_URL=<Supabase project URL>
REACT_APP_SUPABASE_ANON_KEY=<Supabase anon key>
```

#### Backend — Render Web Service

- **Root Directory:** `server`
- **Build Command:**
  ```bash
  npm install --legacy-peer-deps && npx prisma generate && npm run build
  ```
- **Start Command:**
  ```bash
  npx prisma migrate deploy && npm run start:all
  ```
- **Live URL:** https://reachinbox-api-d7yd.onrender.com
- **Health:** `/api/health`

The start command applies Prisma migrations before starting the API and BullMQ worker.

#### Backend Dependencies

The deployed backend connects to:

- Supabase PostgreSQL for application data.
- Supabase Auth for Google/email authentication.
- Redis for BullMQ and rate limiting.
- Elasticsearch when configured, with PostgreSQL fallback.
- The configured SMTP/email transport.

### Deployment Checklist

- `.env` files must never be committed.
- `JWT_SECRET` must be strong and unique.
- `FRONTEND_URL` must be the actual Render frontend origin.
- `SUPABASE_SERVICE_ROLE_KEY` must remain server-side.
- Supabase Site URL and OAuth redirect URLs must point to the hosted frontend.
- Prisma migrations must be present in `server/prisma/migrations`.
- Verify `/api/health` after deployment.
- Ensure Redis is available to the worker.
- Ensure the BullMQ worker starts with the API.
- Use persistent Redis storage for production scheduling where available.
- Use a real SMTP provider when real external email delivery is required.

## Known Limitations

**Not implemented**

- **Registration UI** — Supabase signup is enabled, but the app has no sign-up screen. Accounts
  must be created in Supabase or via the admin API. (The API method `signUpWithPassword` exists and
  works; only the UI is absent.)
- **Password reset / forgot password** — no flow.
- **CC / BCC** — not in the schema or the API.
- **Google Drive, inline images, confidential mode, signatures** — deliberately absent; the toolbar
  does not show them rather than showing dead buttons.
- **Google direct OAuth** — `GET /auth/google` returns 501. Google sign-in works, but through
  Supabase, not this route.
- **Email cancellation / editing** after scheduling.
- **Email open/click tracking** — status reflects delivery to the provider, not engagement.

**Operational caveats**

- **Attachments are stored on local disk** (`server/uploads/`) and are not garbage-collected.
  Multi-instance deployments would need shared storage.
- **The queue monitor is global**, not per-account. Its `completed` count is *jobs processed*, not
  emails delivered — rate-limit reschedules and retries complete without sending. Per-account
  totals are on the dashboard overview.
- **The search index drifts while Elasticsearch is down.** Writes are skipped, not queued; run
  `npm run reindex` to repair. There is no scheduled self-heal.
- **Email confirmation is required** by default in Supabase, so a new sign-up cannot sign in until
  the address is confirmed. Supabase's built-in mailer is rate-limited to a few emails per hour.
- **`APP_PUBLIC_URL` is overloaded** — it is both the Slack OAuth redirect base (which must be the
  *backend*) and the post-callback browser redirect (which must be the *frontend*). Set
  `SLACK_REDIRECT_URI` explicitly to break the coupling.
- **No automated tests** for the API, queue, scheduling or auth paths.

---

## Security

Verified by live testing, not by inspection alone:

| Check | Result |
| --- | --- |
| Protected routes without a token | **401** on all |
| Cross-user read / retry (IDOR) | **404** — ownership enforced in the query |
| Upload path traversal (`../../etc/evil.txt`) | Sanitised to `evil.txt`, stored under `uploads/` |
| Upload limits | 5 files, 5 MB each, extension allow-list — enforced server-side |
| Secrets in tracked source | None; `.env` gitignored |
| Password handling | Never stored; verified by Supabase |
| SQL injection | Prisma parameterises all queries |
| Security headers | `helmet` enabled |
| Rate limiting | 300 req/min per IP on `/api`; per-sender hourly cap on sends |

**Known gaps, by severity:**

- **High — `dev-login` is an authentication bypass.** Anyone who can reach the API can obtain a
  valid token for any email address. It must be disabled before public deployment.
- **High — no token revocation.** Logout is client-side only; a leaked JWT stays valid for its full
  7-day lifetime.
- **Medium — `JWT_SECRET` defaults to a known development value** if unset. Production must set it.
- **Medium — Bull Board ships with default credentials** (`admin` / `admin` unless overridden).
- **Medium — the SSE queue stream and `/health/queue` are unauthenticated.** They expose aggregate
  queue counts only, no user data.
- **Low — the FastAPI bridge (`backend/`) sets `allow_origins=["*"]`.** It is a hosting-platform
  component, not used locally.
- **Low — internal error messages are returned in non-production** (`NODE_ENV !== 'production'`).
  Production returns a generic message.

---

## Current Project Status

**The application is deployed and accessible through Render.**

### Hosted Components

- Render Static Site — React frontend
- Render Web Service — Express API + BullMQ worker
- Supabase PostgreSQL — application database
- Supabase Auth — Google and email/password authentication
- Redis — BullMQ queue and rate-limit state
- Elasticsearch — optional search with PostgreSQL fallback

### Deployment Verification

- Google authentication and Supabase token exchange
- Production PostgreSQL connectivity
- Prisma migrations during backend startup
- Redis connectivity
- React SPA routing on Render
- API health endpoint
- Queue creation and BullMQ worker architecture

### Production / Demo Caveats

- Render free services may sleep when idle.
- Redis persistence and eviction policy should be configured appropriately for production delayed jobs.
- Ethereal is a development/test mail service and does not deliver real external mail.
- Attachments are stored on local disk and are not suitable for multi-instance production without shared object storage.
- There is no automated CI/CD pipeline.
- API, queue, scheduling and authentication test coverage is limited compared with a hardened production system.

## Notes for Maintainers

- **`server/` is the application.** `backend/` is a FastAPI reverse proxy used only by the hosting
  platform; it forwards `/api/*` to the Node service and is not part of local development.
- **PostgreSQL is authoritative.** Redis and Elasticsearch are derived and rebuildable.
- **The API and worker are separate processes.** Starting only the API means nothing is sent.
- **`plan/` and `memory/`** contain the original planning documents. They describe intended
  direction and are not a reliable description of the current implementation — this README is.
