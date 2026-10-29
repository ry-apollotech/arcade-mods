from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from agent_link import frontmatter
from agent_link.config import Settings
from agent_link.server import create_app

TOKEN = "t" * 40


def make_settings(tmp_path: Path) -> Settings:
    return Settings(
        token=TOKEN,
        peer_url="http://peer:8000",
        listen_host="127.0.0.1",
        listen_port=8000,
        agent_name="me-agent",
        inbox=tmp_path / "inbox",
        outbox=tmp_path / "outbox",
        claude_bin="claude",
        review_timeout=5,
    )


def task(status: str = "pending_review", mode: str = "auto") -> str:
    return (
        f'---\ntask_id: "task-001"\ntitle: "Spec"\nauthor: "peer"\n'
        f'target_agent: "me-agent"\nstatus: "{status}"\nmode: "{mode}"\n---\n# Proposal\n'
    )


@pytest.fixture
def harness(tmp_path):
    reviews, sent = [], []

    def fake_review(markdown, settings):
        reviews.append(markdown)
        return "## Summary\nLooks good."

    def fake_send(filename, content, settings):
        sent.append((filename, content))
        return {"status": "Accepted"}

    settings = make_settings(tmp_path)
    client = TestClient(create_app(settings, review=fake_review, send=fake_send))
    return client, settings, reviews, sent


def post(client, content, token=TOKEN, filename="proposal.md"):
    headers = {"X-Agent-Token": token} if token is not None else {}
    return client.post("/receive-task", json={"filename": filename, "content": content}, headers=headers)


@pytest.mark.parametrize("token", [None, "", "wrong-token"])
def test_rejects_missing_or_wrong_token(harness, token):
    client, settings, reviews, _ = harness
    assert post(client, task(), token=token).status_code == 401
    assert not settings.inbox.exists()
    assert reviews == []


def test_auto_task_is_reviewed_and_reply_sent_back(harness):
    client, settings, reviews, sent = harness
    response = post(client, task())

    assert response.status_code == 202
    assert response.json()["action"] == "queued_for_auto_review"
    assert (settings.inbox / "proposal.md").read_text() == task()
    assert reviews == [task()]

    [(name, content)] = sent
    assert name == "proposal-review.md"
    fields = frontmatter.parse(content)
    assert fields["status"] == "reviewed"
    assert fields["target_agent"] == "peer"
    assert fields["author"] == "me-agent"
    assert "Looks good." in content
    assert (settings.outbox / name).read_text() == content


def test_collab_task_waits_in_inbox_for_human(harness):
    client, settings, reviews, sent = harness
    response = post(client, task(mode="collab"))

    assert response.json()["action"] == "saved_to_inbox"
    assert (settings.inbox / "proposal.md").exists()
    assert reviews == [] and sent == []


def test_replies_are_not_auto_reviewed(harness):
    client, _, reviews, sent = harness
    response = post(client, task(status="reviewed"))

    assert response.json()["action"] == "saved_to_inbox"
    assert reviews == [] and sent == []


@pytest.mark.parametrize("filename", ["../evil.md", "sub/x.md", "notes.txt", ".hidden.md", "..\\x.md"])
def test_rejects_unsafe_filenames(harness, filename):
    client, settings, _, _ = harness
    assert post(client, task(), filename=filename).status_code == 422
    assert not settings.inbox.exists()


def test_rejects_bad_frontmatter(harness):
    client, _, _, _ = harness
    assert post(client, "# no frontmatter").status_code == 422


def test_review_failure_keeps_task_and_sends_nothing(tmp_path):
    sent = []

    def broken_review(markdown, settings):
        raise RuntimeError("claude down")

    settings = make_settings(tmp_path)
    client = TestClient(create_app(settings, review=broken_review, send=lambda *a: sent.append(a)))
    assert post(client, task()).status_code == 202
    assert (settings.inbox / "proposal.md").exists()
    assert sent == []
