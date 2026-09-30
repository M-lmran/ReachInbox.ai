"""ReachInbox backend API test suite.

Covers: health, auth, email schedule/list/stats/retry/search, real send pipeline, slack.
"""
import os
import time
import uuid
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://bullmq-mailer.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"


@pytest.fixture(scope="session")
def session():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


@pytest.fixture(scope="session")
def token(session):
    r = session.post(f"{API}/auth/dev-login", json={})
    assert r.status_code == 200, r.text
    data = r.json()["data"]
    assert "token" in data and "user" in data
    return data["token"]


@pytest.fixture(scope="session")
def auth(session, token):
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json", "Authorization": f"Bearer {token}"})
    return s


# ---------- Health ----------
class TestHealth:
    def test_health(self, session):
        r = session.get(f"{API}/health")
        assert r.status_code == 200
        d = r.json()
        assert d.get("status") == "ok"
        assert d.get("database") == "connected"
        assert d.get("redis") == "connected"

    def test_queue_health(self, session):
        r = session.get(f"{API}/health/queue")
        assert r.status_code == 200
        d = r.json()
        # Expect counts like waiting/active/delayed/completed/failed
        assert isinstance(d, dict)


# ---------- Auth ----------
class TestAuth:
    def test_me_with_token(self, auth):
        r = auth.get(f"{API}/auth/me")
        assert r.status_code == 200
        body = r.json()
        user = body.get("data", body).get("user", body.get("data", body))
        # loose assertion — email must be present
        assert "vishnu@reachinbox.ai" in r.text

    def test_me_without_token(self, session):
        r = session.get(f"{API}/auth/me")
        assert r.status_code == 401


# ---------- Schedule / lists / stats ----------
class TestSchedule:
    def test_validation_missing_fields(self, auth):
        r = auth.post(f"{API}/emails/schedule", json={})
        assert r.status_code == 400

    def test_schedule_with_dedup_and_invalid(self, auth):
        tag = uuid.uuid4().hex[:8]
        payload = {
            "subject": f"TEST_{tag} subject",
            "body": "hello body",
            "startTime": "2030-01-01T00:00:00.000Z",
            "delayMs": 60000,
            "hourlyLimit": 100,
            "recipients": [
                f"a_{tag}@example.com",
                f"b_{tag}@example.com",
                f"A_{tag}@Example.com",  # duplicate after normalization
                "not-an-email",
            ],
        }
        r = auth.post(f"{API}/emails/schedule", json=payload)
        assert r.status_code in (200, 201), r.text
        d = r.json().get("data", r.json())
        # Should create exactly 2 jobs
        jobs = d.get("jobsCreated") or d.get("jobs_created") or d.get("created")
        assert jobs == 2, d
        counts = d.get("recipients") or d
        # duplicatesRemoved >=1, invalidIgnored >=1
        dup = counts.get("duplicatesRemoved", counts.get("duplicates_removed", 0))
        inv = counts.get("invalidIgnored", counts.get("invalid_ignored", 0))
        assert dup >= 1
        assert inv >= 1

    def test_list_scheduled(self, auth):
        r = auth.get(f"{API}/emails/scheduled?page=1&limit=10")
        assert r.status_code == 200
        d = r.json()
        assert d.get("success") is True
        assert "data" in d
        assert "pagination" in d
        p = d["pagination"]
        assert "page" in p and "limit" in p and "total" in p

    def test_list_sent(self, auth):
        r = auth.get(f"{API}/emails/sent?page=1&limit=10")
        assert r.status_code == 200
        d = r.json()
        assert d.get("success") is True and "pagination" in d

    def test_stats(self, auth):
        r = auth.get(f"{API}/emails/stats")
        assert r.status_code == 200
        d = r.json().get("data", r.json())
        for k in ("scheduled", "processing", "sent", "failed"):
            assert k in d, f"stats missing {k}: {d}"

    def test_search(self, auth):
        r = auth.get(f"{API}/emails/search", params={"q": "example.com"})
        assert r.status_code == 200


# ---------- Real send pipeline ----------
class TestRealSend:
    def test_end_to_end_send(self, auth):
        tag = uuid.uuid4().hex[:8]
        recips = [f"e2e_{tag}_1@example.com", f"e2e_{tag}_2@example.com"]
        payload = {
            "subject": f"TEST_E2E_{tag}",
            "body": "e2e body",
            "startTime": time.strftime("%Y-%m-%dT%H:%M:%S.000Z", time.gmtime()),
            "delayMs": 2000,
            "hourlyLimit": 100,
            "recipients": recips,
        }
        r = auth.post(f"{API}/emails/schedule", json=payload)
        assert r.status_code in (200, 201), r.text

        deadline = time.time() + 30
        seen = 0
        preview_ok = False
        while time.time() < deadline:
            time.sleep(2)
            r2 = auth.get(f"{API}/emails/sent?page=1&limit=50")
            items = r2.json().get("data", [])
            match = [it for it in items if it.get("subject") == payload["subject"]]
            seen = len(match)
            if seen >= 2:
                preview_ok = any(it.get("previewUrl") for it in match)
                break
        assert seen >= 2, f"expected 2 sent, got {seen}"
        assert preview_ok, "expected previewUrl on Ethereal-sent emails"


# ---------- Retry ----------
class TestRetry:
    def test_retry_non_failed_returns_409(self, auth):
        r = auth.get(f"{API}/emails/scheduled?page=1&limit=1")
        items = r.json().get("data", [])
        if not items:
            pytest.skip("no scheduled items")
        jid = items[0].get("id")
        rr = auth.post(f"{API}/emails/{jid}/retry")
        assert rr.status_code == 409

    def test_retry_failed_ok(self, auth):
        # find a failed one via search across all statuses; fallback: query stats then search
        r = auth.get(f"{API}/emails/search", params={"q": "@"})
        items = r.json().get("data", []) if r.status_code == 200 else []
        failed = [it for it in items if (it.get("status") or "").lower() == "failed"]
        if not failed:
            pytest.skip("no failed job available")
        jid = failed[0]["id"]
        rr = auth.post(f"{API}/emails/{jid}/retry")
        assert rr.status_code in (200, 202), rr.text


# ---------- Slack ----------
class TestSlack:
    def test_slack_flow(self, auth):
        r = auth.get(f"{API}/auth/slack/status")
        assert r.status_code == 200
        # connect
        r = auth.post(f"{API}/auth/slack/connect", json={"webhookUrl": "https://hooks.slack.com/services/T000/B000/xxxx"})
        assert r.status_code in (200, 201), r.text
        s = auth.get(f"{API}/auth/slack/status")
        assert s.status_code == 200
        assert (s.json().get("data") or s.json()).get("connected") is True
        d = auth.post(f"{API}/auth/slack/disconnect")
        assert d.status_code in (200, 204)
        s2 = auth.get(f"{API}/auth/slack/status")
        assert (s2.json().get("data") or s2.json()).get("connected") is False
