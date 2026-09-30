"""Iteration 2 tests: idempotency, per-sender hourly rate-limit reschedule, Slack OAuth 501, config."""
import os
import time
import uuid
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://bullmq-mailer.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"


def _login(email=None):
    r = requests.post(f"{API}/auth/dev-login", json={"email": email} if email else {})
    assert r.status_code == 200, r.text
    return r.json()["data"]["token"]


def _client(token):
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json", "Authorization": f"Bearer {token}"})
    return s


@pytest.fixture(scope="module")
def default_client():
    return _client(_login())


class TestAuthConfig:
    def test_config_shape(self, default_client):
        r = default_client.get(f"{API}/auth/config")
        assert r.status_code == 200
        d = r.json().get("data", r.json())
        assert d.get("slackOAuthConfigured") is False
        assert "supabaseConfigured" in d
        assert d.get("devLoginEnabled") is True


class TestSlackOAuth:
    def test_slack_oauth_start_not_configured(self, default_client):
        r = default_client.get(f"{API}/auth/slack/oauth/start")
        assert r.status_code == 501, r.text
        body = r.json()
        # code path via AppError -> { success:false, error:{ code, message } }
        err = body.get("error") or {}
        assert (err.get("code") or body.get("code")) == "NOT_CONFIGURED"

    def test_slack_status_unauth_default(self, default_client):
        r = default_client.get(f"{API}/auth/slack/status")
        assert r.status_code == 200
        d = r.json().get("data", r.json())
        # Might be True from previous tests; just ensure key present
        assert "connected" in d


class TestRateLimitReschedule:
    """5 recipients, hourlyLimit=2 => exactly 2 sent, 3 rescheduled (still 'scheduled', flag=true)."""

    def test_rate_limit_reschedule(self):
        # Fresh sender to have a clean Redis hourly counter
        email = f"rltest+{uuid.uuid4().hex[:10]}@reachinbox.ai"
        token = _login(email=email)
        c = _client(token)

        tag = uuid.uuid4().hex[:8]
        recips = [f"rl_{tag}_{i}@example.com" for i in range(5)]
        payload = {
            "subject": f"TEST_RL_{tag}",
            "body": "rl body",
            "startTime": time.strftime("%Y-%m-%dT%H:%M:%S.000Z", time.gmtime()),
            "delayMs": 2000,
            "hourlyLimit": 2,
            "recipients": recips,
        }
        r = c.post(f"{API}/emails/schedule", json=payload)
        assert r.status_code in (200, 201), r.text
        d = r.json().get("data", r.json())
        assert d.get("jobsCreated") == 5

        # Wait up to ~40s: all 5 must be either sent or flagged rescheduledForRateLimit.
        # Last recipient's initial scheduledAt = start + 4*2s = 8s out, plus processing.
        sent_count = 0
        scheduled_count = 0
        failed_count = 0
        flagged_count = 0
        deadline = time.time() + 45
        while time.time() < deadline:
            time.sleep(3)
            sent_items = c.get(f"{API}/emails/sent?page=1&limit=50").json().get("data", [])
            sched_items = c.get(f"{API}/emails/scheduled?page=1&limit=50").json().get("data", [])
            sent_match = [it for it in sent_items if it.get("subject") == payload["subject"]]
            sched_match = [it for it in sched_items if it.get("subject") == payload["subject"]]
            sent_count = len([i for i in sent_match if (i.get("status") or "").lower() == "sent"])
            failed_count = len([i for i in sent_match if (i.get("status") or "").lower() == "failed"])
            scheduled_count = len(sched_match)
            flagged_count = len([i for i in sched_match if i.get("rescheduledForRateLimit") is True])
            if sent_count >= 2 and flagged_count >= 3:
                break

        print(f"sent={sent_count} scheduled={scheduled_count} failed={failed_count}")
        assert failed_count == 0, "no jobs should be failed"
        assert sent_count == 2, f"expected exactly 2 sent, got {sent_count}"
        assert scheduled_count == 3, f"expected 3 remaining scheduled, got {scheduled_count}"

        # Verify rescheduledForRateLimit flag
        sched_items = c.get(f"{API}/emails/scheduled?page=1&limit=50").json().get("data", [])
        matching = [it for it in sched_items if it.get("subject") == payload["subject"]]
        flagged = [it for it in matching if it.get("rescheduledForRateLimit") is True]
        assert len(flagged) == 3, f"expected 3 rows flagged rescheduledForRateLimit, got {len(flagged)}: {matching}"

        # Stats: total = 5 across all buckets, none failed
        stats = c.get(f"{API}/emails/stats").json().get("data", {})
        total = sum(int(stats.get(k, 0)) for k in ("scheduled", "processing", "sent", "failed"))
        assert total >= 5
        assert int(stats.get("failed", 0)) == 0


class TestIdempotencyNoDuplicateSend:
    def test_no_duplicate_send(self):
        # Fresh sender & high limit
        email = f"idem+{uuid.uuid4().hex[:10]}@reachinbox.ai"
        c = _client(_login(email=email))
        tag = uuid.uuid4().hex[:8]
        recips = [f"idem_{tag}_{i}@example.com" for i in range(3)]
        payload = {
            "subject": f"TEST_IDEM_{tag}",
            "body": "idem",
            "startTime": time.strftime("%Y-%m-%dT%H:%M:%S.000Z", time.gmtime()),
            "delayMs": 2000,
            "hourlyLimit": 100,
            "recipients": recips,
        }
        r = c.post(f"{API}/emails/schedule", json=payload)
        assert r.status_code in (200, 201), r.text

        seen = []
        deadline = time.time() + 30
        while time.time() < deadline:
            time.sleep(3)
            sent = c.get(f"{API}/emails/sent?page=1&limit=100").json().get("data", [])
            match = [it for it in sent if it.get("subject") == payload["subject"] and (it.get("status") or "").lower() == "sent"]
            if len(match) >= 3:
                seen = match
                break

        assert len(seen) == 3, f"expected 3 sent, got {len(seen)}"
        # Each recipient exactly once
        rcpts = [it.get("recipient", "").lower() for it in seen]
        assert sorted(rcpts) == sorted([r.lower() for r in recips]), f"recipients mismatch: {rcpts}"
        assert len(set(rcpts)) == 3, "duplicate sends detected"
        # previewUrl present
        assert all(it.get("previewUrl") for it in seen), "missing previewUrl on some sent items"

        # Stability check: two consecutive stats reads should be equal
        s1 = c.get(f"{API}/emails/stats").json().get("data", {})
        time.sleep(4)
        s2 = c.get(f"{API}/emails/stats").json().get("data", {})
        assert int(s1.get("sent", 0)) == int(s2.get("sent", 0)), f"sent count still changing: {s1} -> {s2}"
