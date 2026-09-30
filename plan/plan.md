# ReachInbox — Email Job Scheduler

A SaaS dashboard for scheduling bulk email campaigns that go out gradually over time, on a controlled delay, without ever blasting everyone at once.
You upload a list of recipients, compose one message, pick a start time and pacing, and the system drips the emails out and tracks each one from scheduled to sent.

## Who it's for
Recruiters, founders, and growth/outreach teams who send the same message to many people (e.g. an internship opportunity to 250 leads) and need it paced, tracked, and reliable — plus the engineers evaluating this as a hiring assignment, who care that the scheduling is real and survives restarts.

## Core features and experience
- **Google sign-in** — sign in with a Google account. Handled through Supabase (you connect Google inside Supabase). Until Google keys are added, a dev sign-in gets you into the dashboard so the app is usable end-to-end.
- **Compose a campaign** — one screen for Subject, Body, recipient list, Start time, Delay between each email, and an Hourly limit.
- **CSV / TXT recipient upload** — drop in a file; the app reads it in the browser, pulls out the email addresses, lowercases and trims them, drops duplicates and invalid ones, and immediately shows counts: e.g. "248 valid recipients, 5 duplicates removed, 2 invalid ignored." The original file is kept in storage for reference.
- **Real scheduled sending** — after scheduling, each recipient becomes its own job with its own send time (start, start+delay, start+2×delay …). These are true delayed jobs held in a queue, so they fire at the right time and survive a server restart. No cron, no timers.
- **Pacing & throttling** — a configurable minimum delay between sends and a per-sender hourly cap. When the hourly cap is hit, those emails are pushed to the next hour instead of failing, and the dashboard shows they were delayed by throttling.
- **Scheduled Emails table** — Email, Subject, Scheduled Time, Status (scheduled / processing / sent / failed) with colored badges, plus a Retry action for failures.
- **Sent Emails table** — Email, Subject, Sent Time, Status, with a refresh control. Sent test emails open a preview link (Ethereal test inbox — no real email leaves the system).
- **Stats** — top-of-dashboard counts: Scheduled, Sending, Sent, Failed.
- **Slack notifications** — connect a Slack workspace; when an hourly limit is reached the app posts a heads-up to Slack. If Slack isn't connected, nothing breaks.
- **Search** — search across your emails/campaigns by recipient or subject.
- **Account & settings** — header with avatar, name, email, and a dropdown (Profile, Settings, Logout); a settings page for defaults and connected integrations.
- **States everywhere** — every table and action has loading skeletons, empty states with a clear call-to-action, error states, and toast notifications on success/failure.
- **Queue monitor** — an admin view showing waiting / active / delayed / completed / failed jobs, for demos and debugging.

## User flow
1. Land on a clean login page (ReachInbox branding, one-line pitch, "Continue with Google").
2. Sign in → arrive at the dashboard showing stats and the Scheduled/Sent tabs.
3. Click **Compose New Email** → fill Subject and Body, upload a CSV, see the detected recipient count instantly, set Start time / Delay / Hourly limit.
4. Click **Schedule Email** → button shows "Scheduling…", a success toast confirms, the modal closes, and the Scheduled table refreshes with the new jobs.
5. As time passes, emails move scheduled → processing → sent (or failed), visible in the tables; sent ones expose a preview link.
6. If an hourly cap is reached, affected emails show as delayed/rescheduled and (if connected) a Slack ping is posted.
7. Retry any failed email; refresh the Sent table; search to find a specific recipient; log out from the header menu.

## UI/UX feel
Minimal, premium B2B SaaS. Generous spacing, subtle borders, rounded cards, strong typographic hierarchy, distinct status badges, clean modal/drawer interactions. Desktop-first but fully responsive down to mobile (navigation doesn't overflow, tables stay usable, modal fits small screens). A professional palette will be chosen (no heavy gradients or decorative clutter). If Figma screenshots are provided, the layout will be matched closely to them.

## Implementation phases
**Phase 1 — built now (MVP):**
Login (Google via Supabase + dev sign-in fallback), dashboard with stats and tabs, Compose flow, CSV/TXT parsing with validation & counts, real delayed-job scheduling with a background worker, Ethereal test-email sending with preview links, Scheduled & Sent tables with all states, retry, stats, Redis-backed hourly rate limiting with reschedule-on-limit, Slack connect + rate-limit notification, search over emails/campaigns, settings, queue monitor, and seed/demo data. Restart-safe scheduling is included and demonstrable.

**Phase 2 — later:** Dedicated Elasticsearch-powered search (search runs on the database in Phase 1), richer authorization/roles, and multi-sender management UI.

**Phase 3 — later:** Advanced production rate limiting (global + per-tenant tiers), Slack OAuth polish and more notification types, analytics/reporting, and deliverability tooling.

## Assumptions
- **Supabase is used for the database, authentication, and file storage**, per your instruction. Google login runs through Supabase Auth; the recipient files live in Supabase Storage.
- You will provide: **Supabase project URL, anon (publishable) key, service-role (secret) key, and the database connection string**. You'll also enable **Google** as a provider inside Supabase using your Google Client ID/Secret (I'll give exact steps). Until these are set, a dev sign-in keeps the app fully usable.
- **Ethereal** is used for test emails: an Ethereal test account is auto-created on startup if you don't supply `ETHEREAL_USER` / `ETHEREAL_PASSWORD`; no real emails are ever sent, and preview links are shown.
- **Slack** notifications require Slack credentials you provide; without them, the connect option is present but no messages are sent (nothing breaks).
- Scheduling is done with real delayed background jobs backed by Redis — explicitly **no cron jobs, no `setInterval`/`setTimeout` scheduler, no in-memory queues**.
- Minimum delay between emails and the hourly limit are configurable, with sensible defaults (2 seconds; 200/hour) shown in the compose form.
- CSV parsing happens in the browser; only the cleaned, de-duplicated recipient list is sent to the server (the raw file is optionally archived to storage).
- Recipient files/campaigns are scoped to the signed-in user.
- Elasticsearch search is deferred to a later phase; search in the MVP runs against the database and returns the same results shape, so it can be swapped later without UI changes.
- Realistic but fake demo data (one user, senders, and a mix of scheduled/sent/failed emails) will be seeded so the dashboard looks alive on first open.
