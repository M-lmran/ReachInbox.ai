# ReachInbox — Engineering Work Log

A complete record of the engineering work carried out on this repository: the environment it was
brought up in, every defect found and fixed, the features added, and the evidence for each claim.

**Scope:** one continuous engagement, from a repository with nothing installed to a running,
audited application.

**Guiding rule throughout:** nothing is reported as working unless it was verified against the
running system. Where verification was impossible, that is stated explicitly rather than glossed
over.

---

## Table of Contents

1. [Starting Point](#1-starting-point)
2. [Environment Bring-Up](#2-environment-bring-up)
3. [End-to-End Audit — 7 Defects Found and Fixed](#3-end-to-end-audit--7-defects-found-and-fixed)
4. [Elasticsearch Integration](#4-elasticsearch-integration)
5. [Realtime Queue Monitor](#5-realtime-queue-monitor)
6. [Email Attachments](#6-email-attachments)
7. [Authentication: Login Redesign, Email/Password, Sign-Up](#7-authentication-login-redesign-emailpassword-sign-up)
8. [Brand Identity](#8-brand-identity)
9. [UI Changes](#9-ui-changes)
10. [Critical Bug: Scheduled Emails Sent Immediately](#10-critical-bug-scheduled-emails-sent-immediately)
11. [Queue/DB Consistency: Orphaned Jobs](#11-queuedb-consistency-orphaned-jobs)
12. [Queue Monitor Accuracy](#12-queue-monitor-accuracy)
13. [Final Audit and Documentation](#13-final-audit-and-documentation)
14. [Complete File Inventory](#14-complete-file-inventory)
15. [Verification Summary](#15-verification-summary)
16. [Known Limitations and Remaining Work](#16-known-limitations-and-remaining-work)

---

## 1. Starting Point

The repository arrived with **nothing installed and nothing running**:

| Item | State |
| --- | --- |
| `docker` / `docker-compose` | not installed |
| PostgreSQL | not installed |
| Redis | not installed |
| `yarn` | not installed |
| `node_modules` | absent in root, `server/`, and `frontend/` |
| `.env` files | **did not exist** — not even `.env.example` |
| Elasticsearch | a 25-line stub with `TODO` methods, never imported |
| Tests | 2 backend, 2 frontend — email validation only |

The stack is a monorepo: `server/` (Node/TypeScript/Express), `frontend/` (React 19 + CRACO), and
`backend/` (a FastAPI reverse proxy used only by the hosting platform).

---

## 2. Environment Bring-Up

### Infrastructure

Docker was unavailable, so PostgreSQL and Redis were installed natively via Homebrew, and Docker
Desktop was used only for Elasticsearch.

```bash
brew install postgresql@15 redis
brew services start postgresql@15
brew services start redis
```

**Database provisioning.** Homebrew's `initdb` creates a superuser named after the OS user, not
`postgres`. The application's `.env` expects `postgres:postgres`, so the role and database were
created explicitly:

```sql
CREATE ROLE postgres WITH LOGIN SUPERUSER PASSWORD 'postgres';
CREATE DATABASE reachinbox OWNER postgres;
```

### Configuration files created

| File | Contents |
| --- | --- |
| `server/.env` | 27 variables — database, Redis, JWT, Ethereal, Supabase, Slack, Elasticsearch, Bull Admin |
| `frontend/.env` | `REACT_APP_BACKEND_URL`, later `REACT_APP_SUPABASE_*` |

### Dependency installation

`yarn` could not be installed (corepack needed `sudo` on this Node build), so **npm** was used
throughout. Three obstacles had to be cleared:

1. **npm 11 blocks postinstall scripts by default.** Prisma and esbuild never generated their
   binaries, so the backend could not start. Resolved with
   `npm install-scripts approve @prisma/client @prisma/engines esbuild prisma msgpackr-extract fsevents`.

2. **Peer-dependency conflict** — `react-day-picker@8` requires `date-fns@^2||^3` while the project
   pins `date-fns@4`. Installed with `--legacy-peer-deps`.

3. **`ajv` hoisting bug** — npm hoisted `ajv@6` to the root while `ajv-keywords@5` requires `ajv@8`,
   crashing CRACO with `Cannot find module 'ajv/dist/compile/codegen'`. Fixed by installing
   `ajv@8.20.0` at the frontend root so the hoisted package resolves correctly.

### Database and first run

```bash
cd server
npx prisma generate
npx prisma migrate deploy
npm run seed
```

Four processes were then started — API (:8010), worker, frontend (:3000), plus infrastructure.
Health check confirmed all three dependencies connected.

---

## 3. End-to-End Audit — 7 Defects Found and Fixed

A full audit was performed against the running system: every endpoint exercised with live requests,
dependency outages simulated, and results read back from PostgreSQL, Redis, and Elasticsearch.

### Issue 1 — Controller-level validation returned 500 instead of 400

**Severity:** Medium

`email.controller.ts` called `listQuerySchema.parse()` / `searchQuerySchema.parse()` directly. The
`validate()` middleware converts `ZodError` → 400, but controller-level parses threw a raw
`ZodError` that fell through to the generic 500 handler, leaking raw Zod JSON.

```
GET /emails/scheduled?page=0    → 500  (should be 400)
GET /emails/scheduled?limit=999 → 500
GET /emails/search (no q)       → 500
```

**Fix:** added a `ZodError` branch to `error.middleware.ts`.
**Verified:** all three now return **400** with field-level details.

### Issue 2 — Redis outage hung requests indefinitely

**Severity:** High

The BullMQ producer shared the worker's connection (`maxRetriesPerRequest: null`), so ioredis
buffered commands offline and retried forever. `POST /emails/schedule` **never returned** — curl
timed out at 20 s while the campaign sat committed in PostgreSQL.

**Fix:** a dedicated fail-fast producer connection (`enableOfflineQueue: false`, bounded retries)
plus a wrapper that converts the failure into a clean 503.
**Verified:** **503 in 1 s**, clean message, health reports `degraded`, recovers to 201.

### Issue 3 — Redis AOF persistence was disabled

**Severity:** High (environment)

The README claimed "Redis (AOF enabled) persists delayed jobs", but Redis ran via Homebrew whose
default is `appendonly no`. The documented persistence guarantee was false in practice — a Redis
restart would have silently dropped every queued job.

**Fix:** `CONFIG SET appendonly yes` (live rewrite, no data loss) and persisted in `redis.conf`.
**Verified:** 4 delayed jobs and 23 keys **survived a full Redis restart**.

### Issue 4 — ioredis emitted "Unhandled error event"

**Severity:** Low

No `'error'` listener existed on any connection, so connection failures bypassed the logger and
printed `[ioredis] Unhandled error event` to stderr.

**Fix:** a `withErrorLogging()` wrapper on all three connections.
**Verified:** errors now log as `WARN Redis connection error {connection:"app"}`.

### Issue 5 — Slack OAuth callback redirected to a relative URL

**Severity:** Medium

`auth.controller.ts` built the post-callback redirect from `APP_PUBLIC_URL`, which was unset,
producing `Location: /dashboard/settings?slack=error`. In a browser that resolves against the
**backend** origin (:8010) and 404s.

**Fix:** set `APP_PUBLIC_URL=http://localhost:3000` and `SLACK_REDIRECT_URI` explicitly.
**Verified:** `Location: http://localhost:3000/dashboard/settings?slack=error`.

### Issue 6 — Prisma errors leaked internals as 500

**Severity:** Medium

An unmapped Prisma exception returned 500 with raw driver output including **absolute file paths**
and the generated Prisma invocation.

**Fix:** explicit handling — `PrismaClientInitializationError` → 503, `KnownRequestError` → 400,
`RustPanicError` → 503.
**Verified:** PostgreSQL down → clean 503, no path leak.

### Issue 7 — Frontend test suite failed

**Severity:** Low

`craco.config.js` set the `@` alias for webpack but not for Jest, so `import from "@/..."` could not
resolve — despite the README claiming `yarn test` passed.

**Fix:** added `jest.configure.moduleNameMapper`.
**Verified:** **2/2 passing**.

### Also verified during this audit

- All protected routes → **401** without a token
- Cross-user access (IDOR) → **404**, not 403 (no existence leak)
- Rate limiting: `hourlyLimit=2` → 2 sent, 3 rescheduled with `rescheduledForRateLimit=t`
- No secrets in any API response

---

## 4. Elasticsearch Integration

**Starting state:** `ElasticsearchService.ts` was a 25-line stub whose methods did nothing, was
imported by nothing, and had no client library. `docker-compose.yml` had the service commented out.

### Implemented

- **Enabled** the Elasticsearch service in `docker-compose.yml` with a healthcheck and volume
- **`@elastic/elasticsearch@8`** client, an `email_jobs` index with an explicit mapping
  (`recipient`/`subject` as `text`+`keyword`, `body` as `text`, `userId` as a filter field)
- **Write path:** jobs indexed on creation, on retry, and after every worker state transition
- **Search:** `multi_match` with `fuzziness: AUTO`, relevance-ranked, scoped by `userId`
- **Hydration:** ES returns matching ids; full rows are read from PostgreSQL in relevance order, so
  the API response shape is unchanged
- **`npm run reindex`** to rebuild the index from PostgreSQL
- **Startup check** and **health reporting**

### Design principle

PostgreSQL stays authoritative; the index is a derived, rebuildable projection. Every ES call is a
no-op when unconfigured and swallows its own errors, so a search outage can never fail a send.

### Verified

- Searching the typo `Intrnship` returned 5 hits — `ILIKE` cannot match that, only ES fuzziness can
- New job searchable immediately as `scheduled`, then `sent` with preview URL after the worker ran
- With ES stopped: health reports `disconnected`, exact search still works via PostgreSQL, the typo
  returns 0 (proving the fallback engaged), scheduling still returns 201
- Index persisted across an ES restart; `reindex` repaired drift (29 → 38 docs, matching PostgreSQL)

### Two defects found and fixed here

**Single-node cluster reported `yellow`.** The default `number_of_replicas: 1` can never be
allocated on one node. Set to `0` at index creation — cluster now reports `green`.

**ES being down made scheduling take 16.9 seconds.** `scheduleCampaign` *awaited* the indexing call,
and the ES client's default 30 s timeout was being hit. This violated the project's own stated rule
that indexing must never affect the request path. Fixed with `requestTimeout: 2000` /
`maxRetries: 0` and by making the call fire-and-forget.
**Measured: 16,934 ms → 14–30 ms.**

### Failure back-off (circuit breaker)

With ES down, every request logged two warnings and paid a timeout. `ElasticsearchService` now
records an `unavailableUntil` timestamp on failure; all entry points return early inside that
window, and success clears it.

**Measured, ES down, 8 schedule requests:**

| | Log lines | Latency |
| --- | --- | --- |
| Before | 16 | ~2,000 ms each |
| After | **1** | **14–48 ms** |

Auto-recovers when the cooldown expires — verified by the fuzzy search working again afterwards.

---

## 5. Realtime Queue Monitor

**Starting state:** the page polled a snapshot endpoint every 5 s. Not realtime.

### Implemented

- **`GET /api/health/queue/stream`** — Server-Sent Events
- Driven by BullMQ **`QueueEvents`**, which subscribes to Redis's event stream. This is essential:
  the API and worker are **separate processes**, so in-process queue events would never fire
- One shared `QueueEvents` instance fans out to all clients, so Redis listeners stay constant
  regardless of how many browsers are watching
- Bursts coalesced (150 ms) since one job emits several events
- 15 s heartbeat to survive proxies
- Frontend uses `EventSource` with a polling fallback if the stream never delivers a frame

### Verified

Captured live during a schedule — the full lifecycle pushed as distinct frames:

```
frame 1: delayed 0, active 0, completed 52   ← baseline
frame 2: delayed 1, active 0, completed 52   ← job enqueued
frame 3: delayed 0, active 1, completed 52   ← worker picked it up
frame 4: delayed 0, active 0, completed 53   ← sent
```

---

## 6. Email Attachments

**Starting state:** the toolbar's "Attach files" button was disabled. The backend had **no**
attachment support — `rawFileUrl` existed in the schema but was never used when sending.

This required real backend work.

### Backend

- **`POST /api/emails/attachments`** — multipart upload via `multer` (the one new dependency
  added; there was no existing upload mechanism to reuse)
- **`AttachmentStore.ts`** — storage, validation, and ownership-scoped lookup
- Files written to `uploads/attachments/<uuid>/` with a `meta.json`; deterministic lookup from an id
  alone, no extra table
- **Prisma migration** adding `attachments Json?` to `EmailCampaign` (one additive column)
- `attachmentIds` added to the schedule payload as **optional**, so the existing contract still works
- Worker resolves ids to disk paths and passes them to nodemailer
- `MulterError` mapped to 400

### Limits

5 files, 5 MB each, extension allow-list — enforced on **both** sides, with the backend as the
authority.

### Verified

- Upload → 201 with metadata; `.exe` → 400; 6 MB file → 400 "Each file must be 5MB or smaller"
- Upload without a token → **401**
- **The attachment was present in the delivered email** — the Ethereal message contained
  `reachinbox-probe.txt`
- **Ownership enforced:** an attacker scheduling with another user's attachment id got
  `attachments: null` — the foreign file was silently dropped

### Frontend

Hidden multi-file input triggered by the toolbar, chips showing filename + size, remove buttons,
client-side validation before upload, and the input cleared after each pick so re-selecting a
removed file works. Files are only shown **after** the server accepts them.

---

## 7. Authentication: Login Redesign, Email/Password, Sign-Up

### What was found

- The backend has **no password store** — no password column on `User`, no bcrypt/argon2
- Supabase's email provider **was** enabled, and the app already exchanged Supabase tokens at
  `POST /auth/supabase`
- The login button **unconditionally called `dev-login`**, even when Supabase was configured

### Approach

Email/password uses Supabase's `signInWithPassword`, then exchanges the token through the **same**
endpoint Google uses. **Zero backend changes were required** — this reuses the existing
architecture rather than bolting on a parallel credential system.

Passwords go only to Supabase: never to our API, never stored client-side, never compared in
frontend code.

### Verified

Running the **exact library call the UI makes** through the real `@supabase/supabase-js` client:

```
signInWithPassword OK — token len 814
POST /auth/supabase -> 200 | local JWT len 188 | user ...
wrong password -> rejected: Invalid login credentials
```

### Sign-up

**Key discovery:** Supabase has `mailer_autoconfirm: false`, so sign-up returns **no session** — the
account cannot sign in until the address is confirmed. Rather than fake a successful login, the UI
shows a real confirmation panel. The code detects a returned session and skips the panel if
confirmation is ever disabled.

**Verified:** `signUp` → no session; sign-in before confirmation → blocked with
`"Email not confirmed"`; the UI maps that to a specific message.

### Login page redesign

Centered card, brand mark, "Welcome back to ReachInbox", **OR CONTINUE WITH EMAIL** divider, email
and password fields with icons, password reveal toggle, and a full-width **Sign in** button.

The Google logo was replaced with the **official four-path asset** — the previous icon was a
recreated approximation.

### Honest handling

- **No "Create account" link was added until sign-up existed** — the footer said "Ask your
  workspace administrator" rather than showing a dead link
- **Terms of Service / Privacy Policy are styled text, not links** — those routes do not exist
- When Supabase is unconfigured, the Google button is **disabled with a reason**, and the dev path is
  a clearly-labelled *"Continue in demo mode"*. Previously, clicking "Continue with Google" silently
  dev-logged you in, which misrepresented what happened.

---

## 8. Brand Identity

The supplied SVG was integrated as a reusable `Logo` component:

- **Two variants.** The artwork is a *lockup* whose wordmark is ~6% of its height — at a 36 px
  sidebar size that text renders ~2 px tall and is illegible. So `variant="lockup"` is used for
  large display and `variant="mark"` (wordmark dropped) for the sidebar, mobile header, and favicon.
- **Per-instance gradient ids.** The logo renders **twice** on the login page; duplicate SVG ids in
  one document make `url(#…)` references resolve unpredictably. Every id is suffixed with React's
  `useId()`.
- Replaced the `Mail`-icon brand mark in the sidebar and both login placements.
- Added `public/favicon.svg` (mark-only, since the wordmark is a smudge at favicon sizes) and the
  missing `<link rel="icon">` — there was no favicon file at all.
- Fixed the template leftovers: title `Emergent | Fullstack App` → `ReachInbox — Email Job Scheduler`.

---

## 9. UI Changes

| Change | Detail |
| --- | --- |
| Dashboard "Sending" icon | `Loader2` (a spinner) → `Send` (paper plane). Label, count, and accent unchanged |
| Settings Hide/Show | New toggle controlling Integrations + Sending Defaults together. Default visible; label always matches state. Pure view state — no API call, so nothing is disconnected or reset |
| Compose toolbar cleanup | Removed Google Drive, insert image, confidential mode, and signature — all unsupported by the backend. The remaining toolbar is responsive with no awkward gaps |
| Profile avatar | See below |

### The avatar bug — a real defect, root-caused

The backend was **already correct**: `/auth/me` returned the real Google URL
(`lh3.googleusercontent.com/...`) and those URLs loaded fine (HTTP 200, real image data).

The actual bug was that **`dev-login` overwrote the Google picture.** `upsertByEmail`'s update
branch wrote `avatarUrl` unconditionally, and dev-login always supplies a DiceBear placeholder.

Proven with a throwaway user:

```
stored avatar:    https://lh3.googleusercontent.com/a/REAL_GOOGLE_PIC=s96-c
after dev-login:  https://api.dicebear.com/7.x/initials/svg?seed=Avatar%20Probe
googleId:         google-123          ← account was a Google account
```

**Fix:** a `preserveAvatarOnUpdate` flag so a placeholder can never replace a real provider picture,
plus `referrerPolicy="no-referrer"` on both `AvatarImage` usages.
**Verified:** the Google URL now survives a dev sign-in.

---

## 10. Critical Bug: Scheduled Emails Sent Immediately

**The most impactful defect found.** A user schedules an email for a future time; it sends at once.

### Root cause

`ComposeForm.submit(mode)` had a complete `"schedule"` branch — future-time validation, a
"Scheduled N email(s) for …" toast, the correct payload. But `submit()` had exactly **one call
site**:

```
line 176:  submit("now")     ← the form's onSubmit
```

The `"schedule"` branch was **unreachable dead code**, and the footer "Schedule send" button was a
`PopoverTrigger` that only opened the time picker. So the chosen time was correctly captured into
`scheduledAt` and then **discarded at submit**, replaced by `new Date()`.

The backend was correct the whole time — it faithfully delays by `startTime − now`, but was always
handed `now`.

### Fix

Two distinct working actions: **Send** → `submit("now")`; **Schedule send** →
`submit("schedule")` using `scheduledAt`. The popover moved to anchor on the "Change" link; the
toolbar clock opens the same one.

### Verified

| Test | Result |
| --- | --- |
| +2 min | `status=scheduled`, `sentAt=null`, `delayed=1` |
| +4 hours | `status=scheduled` |
| Send now | `status=sent` |
| Worker restart | `delayed=4 → 4`, status unchanged |

**The decisive test** — the +2 min job firing:

```
[Worker] Scheduled email executed
    recipient:   "t1@example.com"
    scheduledAt: "2026-09-30T04:58:19.000Z"
    executedAt:  "2026-09-30T04:58:22.712Z"
```

Sent **3.7 seconds after** its scheduled time, never before. A table-wide query for
`sentAt < scheduledAt` returns **empty** — no email has ever been sent early.

---

## 11. Queue/DB Consistency: Orphaned Jobs

While verifying the queue monitor, a genuine inconsistency surfaced:

| Source | Count |
| --- | --- |
| PostgreSQL `scheduled` | 8 |
| PostgreSQL `processing` | 1 |
| **Redis queue (all sets)** | **0** |

Seven jobs were `scheduled` in the database but **absent from Redis** — they would never send.

### Two root causes

1. **The seed never enqueued.** `prisma/seed.ts` used `createMany` and never called `enqueueEmail`.
2. **`scheduleCampaign` committed before enqueuing**, so a Redis outage left the campaign behind.

### Three fixes

1. **`npm run reconcile`** — re-enqueues jobs missing from the queue and resets jobs stuck in
   `processing`. Supports `--dry-run`.
2. **Rollback** — if enqueue fails, the campaign is deleted (cascading to its jobs) and the error
   rethrown.
3. **Seed now enqueues** its scheduled jobs, with a warning (not a failure) if Redis is down.

### Verified

| | Before | After |
| --- | --- | --- |
| DB `scheduled`/`processing` | 9 | **0** |
| Queue `waiting` | **0** | 9 → drained |
| Queue `completed` | 53 | **62** |
| Orphaned jobs | **9** | **0** |

Rollback: Redis down → 503, **row count unchanged 52→52**, no campaign left behind.

**A flaw caught in my own code mid-flight:** the first version used `getJob()` to test "is it
queued?", but that returns jobs in *any* state — including `completed`, which will never run again.
That produced a false `alreadyQueued: 2`. Checking `getState()` against live states revealed the
true baseline: **all 9 were orphaned.**

---

## 12. Queue Monitor Accuracy

A user reported the monitor showing `completed: 74` when they had sent only 15.

**They were right, and my earlier "it's working" conclusion was wrong.** The stream was working; I
had never asked whether the numbers meant what they appeared to mean. Two separate problems:

**1. The monitor was global, not per-account.** The queue is shared infrastructure. The user's
account had exactly **15 sent**; the other 49 came from test accounts. The dashboard overview was
correct because it is user-scoped — the queue monitor wasn't, and nothing said so.

**2. `completed` counts queue *jobs*, not emails.** Broken down by job type:

```
send jobs               53   ← actually sent an email
rate-limit reschedules  11   ← completed WITHOUT sending anything
retry                    1
reconcile                9
```

A rate-limit reschedule completes successfully but sends nothing, so `completed` can never equal
"emails sent" — it is a throughput counter.

**Fix:** the queue section is now labelled **"Shared across all accounts"** with an explainer
stating that `Completed` counts jobs, not emails, and pointing to the dashboard for per-account
totals. (A per-account section was added and then removed at the user's request, leaving the queue
monitor focused on queue state.)

---

## 13. Final Audit and Documentation

A full ownership audit was performed: structure, dead code, API inventory, auth matrix, database
ownership, scheduling, queue, security, integrations, environment, and testing.

### Findings

- **Dead code:** only 2 TODOs. One is now stale (Slack "Phase 3" — OAuth is implemented); the other
  is the Google direct-OAuth stub.
- **Hygiene:** no `console.log` in the backend, no mock/fake/dummy code.
- **No `.env.example` existed.** Created for both `server/` and `frontend/` with placeholders only.
- **`.gitignore` bug:** the `.env.*` rule would have ignored `.env.example`, so the template could
  never be committed. Fixed with negations.

### Security posture (verified live, not by inspection)

| Check | Result |
| --- | --- |
| Protected routes without a token | **401** on all 8 |
| Cross-user read / retry | **404** |
| Upload path traversal (`../../etc/evil.txt`) | Sanitised to `evil.txt` |
| Secrets in tracked source | None |
| SQL injection | Prisma parameterises all queries |

**Open risks, by severity:** `dev-login` is an authentication bypass (**High**); no token revocation
(**High**); default `JWT_SECRET` (**Medium**); Bull Board default credentials (**Medium**).

### Documentation

- **`README.md` rewritten** (290 → 478 lines) to describe the system as it actually exists, with a
  feature status table, verified-limitations section, and honest security caveats
- **`server/.env.example`** and **`frontend/.env.example`** created
- **`.gitignore`** corrected so the templates are trackable

---

## 14. Complete File Inventory

### Backend — created

| File | Purpose |
| --- | --- |
| `src/integrations/attachments/AttachmentStore.ts` | Attachment storage, validation, ownership-scoped lookup |
| `src/integrations/elasticsearch/reindex.ts` | Rebuild the search index from PostgreSQL |
| `src/queues/queueStream.ts` | SSE fan-out over BullMQ `QueueEvents` |
| `src/queues/reconcile.ts` | Re-enqueue jobs missing from the queue |
| `prisma/migrations/…_add_campaign_attachments/` | `attachments Json?` column |

### Backend — modified

`prisma/schema.prisma` · `prisma/seed.ts` · `package.json` · `config/env.ts` · `config/redis.ts` ·
`config/prisma.ts` · `middleware/error.middleware.ts` · `repositories/user.repository.ts` ·
`repositories/campaign.repository.ts` · `repositories/emailJob.repository.ts` ·
`services/auth.service.ts` · `services/email.service.ts` · `workers/email.worker.ts` ·
`queues/email.queue.ts` · `routes/email.routes.ts` · `routes/index.ts` ·
`controllers/email.controller.ts` · `controllers/health.controller.ts` ·
`validators/email.validator.ts` · `types/index.ts` ·
`integrations/elasticsearch/ElasticsearchService.ts` ·
`integrations/email/EtherealEmailProvider.ts` · `server.ts`

### Frontend — created

| File | Purpose |
| --- | --- |
| `src/components/common/Logo.jsx` | Brand mark, two variants, per-instance ids |
| `src/components/email/RichTextEditor.jsx` | contentEditable editor with selection-based formatting |
| `src/components/email/ComposerToolbar.jsx` | Toolbar with honest disabled states |
| `src/components/email/RecipientField.jsx` | Recipient chips with validation |
| `src/components/email/SchedulePopover.jsx` | Presets, date picker, 12-hour time |
| `src/lib/supabaseClient.js` | Supabase browser client |
| `public/favicon.svg` | Favicon |

### Frontend — modified

`pages/LoginPage.jsx` · `pages/DashboardPage.jsx` · `pages/SettingsPage.jsx` ·
`pages/QueueMonitorPage.jsx` · `pages/ComposePage.jsx` · `components/email/ComposeForm.jsx` ·
`components/email/ComposeModal.jsx` · `components/common/UserMenu.jsx` · `services/authService.js` ·
`services/emailService.js` · `context/AuthContext.jsx` · `constants/index.js` · `craco.config.js` ·
`public/index.html` · `package.json`

### Root

`README.md` (rewritten) · `.gitignore` · `docker-compose.yml` · `server/.env.example` ·
`frontend/.env.example`

### Dependencies added

| Package | Where | Why |
| --- | --- | --- |
| `@elastic/elasticsearch@8` | server | Search integration |
| `multer` + `@types/multer` | server | Multipart uploads — no existing mechanism |
| `@supabase/supabase-js` | frontend | Google + email/password auth |
| `ajv@8.20.0` | frontend | Fixes an npm hoisting crash in CRACO |

---

## 15. Verification Summary

| Check | Result |
| --- | --- |
| Backend typecheck (`tsc --noEmit`) | **PASS** (exit 0) |
| Frontend production build (`craco build`) | **PASS** |
| Backend unit tests | **2/2 PASS** |
| Frontend unit tests | **2/2 PASS** |
| Lint | **NOT AVAILABLE** — no lint script in either package |
| Automated integration / E2E | **NOT AVAILABLE** — none exist |

Everything else was verified manually against the running system: live HTTP requests, Redis
inspection, SQL queries, Elasticsearch API calls, and SSE stream capture.

### What could not be verified

**The rendered UI was never visually confirmed.** macOS Screen Recording permission was not granted
to the terminal, so the browser could not be driven. Every UI change was verified structurally —
production build, served bundle inspection, and the API paths the components call — **not by looking
at pixels**. Interactive behaviours (popovers, chips, formatting on a selection, the Hide/Show
toggle, the file picker) remain visually unconfirmed.

This is stated because it materially limits the confidence of the UI claims.

---

## 16. Known Limitations and Remaining Work

### Must fix before production

1. **Disable `dev-login`** — it issues a valid token for any email with no credential check
2. Set a strong `JWT_SECRET` and `ADMIN_PASSWORD`
3. Replace Ethereal with real SMTP
4. Move attachments off local disk
5. Add automated tests for API, auth, and scheduling

### Should fix

6. Token revocation / refresh
7. Authenticate the SSE stream and `/health/queue`
8. Scheduled self-heal for Elasticsearch index drift
9. Split the overloaded `APP_PUBLIC_URL`
10. Periodic reconcile so DB/queue drift self-heals
11. Add a lint script

### Not implemented

Registration UI (backend works, no screen) · password reset · CC/BCC · Google Drive · inline images ·
confidential mode · signatures · Google direct OAuth (501 stub) · email cancellation/editing ·
open/click tracking

### Operational caveats

- Attachments are not garbage-collected
- The queue monitor is global; `completed` counts jobs, not emails
- The search index drifts while Elasticsearch is down (manual `reindex` to repair)
- Supabase requires email confirmation by default, and its built-in mailer is rate-limited to a few
  emails per hour
- If the app is down when a scheduled email is due, it fires late on restart rather than being
  skipped

### Housekeeping

- 13 test accounts created during this work inflate global statistics and can be removed
- `plan/` and `memory/` hold the original planning documents, which now describe intent rather than
  reality — the README supersedes them

---

## Appendix — Commands

```bash
# Infrastructure
brew services start postgresql@15
brew services start redis
docker compose up -d elasticsearch        # optional

# Backend
cd server && npm install
npx prisma migrate deploy
npm run start                             # API on :8010

# Worker (separate terminal — required for any email to send)
cd server && npm run worker

# Frontend
cd frontend && npm install
npm start                                 # :3000

# Maintenance
cd server && npm run reindex              # rebuild the search index
cd server && npm run reconcile            # re-enqueue jobs missing from the queue
cd server && npm run reconcile -- --dry-run   # preview only

# Verification
cd server   && npm test && npx tsc --noEmit
cd frontend && npx craco test --watchAll=false && npx craco build

# Health
curl -s localhost:8010/api/health
```

**Bull Board** (queue dashboard): http://localhost:8010/api/admin/queues
