import subprocess
from types import SimpleNamespace

import pytest
import requests

from agent_link import client, reviewer
from agent_link.config import ConfigError, load_settings

TOKEN = "t" * 40


def test_config_requires_long_token():
    with pytest.raises(ConfigError, match="SHARED_AGENT_TOKEN"):
        load_settings({"SHARED_AGENT_TOKEN": "short", "PEER_IP": "10.0.0.2"})


def test_config_requires_peer_ip():
    with pytest.raises(ConfigError, match="PEER_IP"):
        load_settings({"SHARED_AGENT_TOKEN": TOKEN})


def test_config_builds_peer_url():
    settings = load_settings({"SHARED_AGENT_TOKEN": TOKEN, "PEER_IP": "10.0.0.2", "PEER_PORT": "9000"})
    assert settings.peer_url == "http://10.0.0.2:9000"


def test_config_keeps_inbox_and_outbox_under_agent_home(tmp_path):
    settings = load_settings({"SHARED_AGENT_TOKEN": TOKEN, "PEER_IP": "10.0.0.2", "AGENT_LINK_HOME": str(tmp_path)})
    assert settings.inbox == tmp_path / "inbox"
    assert settings.outbox == tmp_path / "outbox"


def settings():
    return load_settings({"SHARED_AGENT_TOKEN": TOKEN, "PEER_IP": "10.0.0.2"})


def test_post_task_sends_token_header(monkeypatch):
    calls = []

    def fake_post(url, json, headers, timeout):
        calls.append((url, json, headers))
        return SimpleNamespace(status_code=202, ok=True, json=lambda: {"status": "Accepted"})

    monkeypatch.setattr(requests, "post", fake_post)
    assert client.post_task("a.md", "x", settings()) == {"status": "Accepted"}
    [(url, body, headers)] = calls
    assert url == "http://10.0.0.2:8000/receive-task"
    assert body == {"filename": "a.md", "content": "x"}
    assert headers == {"X-Agent-Token": TOKEN}


def test_post_task_reports_rejected_token(monkeypatch):
    monkeypatch.setattr(
        requests, "post", lambda *a, **k: SimpleNamespace(status_code=401, ok=False, text="")
    )
    with pytest.raises(client.SendError, match="rejected the token"):
        client.post_task("a.md", "x", settings())


def test_post_task_reports_unreachable_peer(monkeypatch):
    def boom(*a, **k):
        raise requests.ConnectionError("refused")

    monkeypatch.setattr(requests, "post", boom)
    with pytest.raises(client.SendError, match="could not reach peer"):
        client.post_task("a.md", "x", settings())


def test_reviewer_runs_claude_with_no_tools(monkeypatch):
    captured = {}

    def fake_run(command, **kwargs):
        captured.update(command=command, input=kwargs["input"])
        return SimpleNamespace(returncode=0, stdout="## Review\n", stderr="")

    monkeypatch.setattr(subprocess, "run", fake_run)
    assert reviewer.run_review("# doc", "claude", 5) == "## Review"
    command = captured["command"]
    assert command[command.index("--tools") + 1] == ""
    assert captured["input"] == "# doc"


@pytest.mark.parametrize(
    "result, message",
    [
        (SimpleNamespace(returncode=1, stdout="", stderr="auth"), "exited 1"),
        (SimpleNamespace(returncode=0, stdout="  ", stderr=""), "empty review"),
    ],
)
def test_reviewer_raises_on_failure(monkeypatch, result, message):
    monkeypatch.setattr(subprocess, "run", lambda *a, **k: result)
    with pytest.raises(reviewer.ReviewError, match=message):
        reviewer.run_review("# doc", "claude", 5)
