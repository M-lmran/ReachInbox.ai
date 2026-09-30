# ReachInbox — Email Job Scheduler (PRD)

## Original Problem Statement
Build a production-quality email scheduling SaaS (ReachInbox hiring assignment): professional
React/Tailwind frontend + clean TypeScript backend. Scheduling MUST use BullMQ delayed jobs
(no cron / setInterval / in-memory queues). Real PostgreSQL, Redis, Prisma, Nodemailer/Ethereal.
Phased: P1 functional foundation; P2 Google/Supabase auth; P3 Elasticsearch/Slack OAuth/advanced rate limits.

## Architecture (as deployed on this platform)
- **Frontend**: React 19 (CRA) + Tailwind + shadcn/ui on port 3000, uses REACT_APP_BACKEND_URL.
- **Backend**: Node/TS/Express + Prisma on port 9000 (`/app/server`). A FastAPI reverse proxy
  (`/app/backend/server.py`, port 8001) forwards `/api/*` → 9000 so platform ingress reaches it.
- **Infra (supervisor-managed)**: PostgreSQL 15 (local), Redis (AOF on for job persistence),
  `reachinbox-api` (Express), `reachinbox-worker` (BullMQ worker). Config: `/etc/supervisor/conf.d/reachinbox.conf`.
- Layers: controller → service → repository → Prisma; queue: service → DB → BullMQ → Redis → worker → Ethereal → DB.

## User Personas
- Recruiters / founders / growth teams sending paced bulk outreach.
- Engineers evaluating queue correctness, persistence, and architecture.

## Core Requirements (static)
- Compose campaign, CSV/TXT upload with client-side email extraction/validation/dedup.
- Real delayed scheduling (start + i×delay), restart-safe, no cron.
- Redis-backed per-sender hourly rate limit that reschedules (not fails) on limit.
- Idempotent worker (scheduled→processing→sent/failed).
- Scheduled & Sent tables (loading/empty/error/retry/pagination), stats, search, Slack notify.
- Google auth via Supabase (dev sign-in fallback), Bull Board dashboard.

## Implemented (2026-09-29)
- Full TypeScript backend: env(zod), prisma schema (User/Sender/EmailCampaign/EmailJob/SlackIntegration w/ indexes),
  repositories, services (email/auth/rateLimit), controllers, routes, middleware (auth/validate/error),
  validators, BullMQ queue + worker, Ethereal provider (auto test account), Slack service (webhook),
  Google/Supabase auth foundation, Elasticsearch stub, Bull Board at /api/admin/queues (basic auth), seed script, tests.
- Frontend: login (split-panel), dashboard (stats + tabs), scheduled/sent pages, compose (modal + page) with
  CSV upload + live counts + zod validation, settings (Slack connect + integration status), queue monitor,
  global search, user menu/logout, full loading/empty/error states, toasts, responsive.
- Infra: local Postgres + Redis + Node api/worker under supervisor; FastAPI proxy on 8001.
- Verified end-to-end by testing agent: 14/14 backend pass, frontend 100% (incl. real BullMQ→Ethereal send with preview URLs).

## Backlog / Remaining
- **P2**: Wire Supabase Google OAuth on the frontend (needs Supabase keys from user); multi-sender management UI; roles.
- **P3**: Elasticsearch-powered search; Slack OAuth (connect button flow) + more notification types; global/per-tenant rate tiers; analytics/reporting.
- **Optional**: Move recipient raw-file archive to Supabase Storage; convert frontend to TSX.

## Next Tasks
- Collect Supabase (URL, anon, service-role, DB URL) + enable Google provider to switch dev sign-in → real Google.
- Optionally collect a Slack Incoming Webhook to demo rate-limit notifications.
