"""Token-protected task gateway (run via: agent_link_cli.py server).

`mode: auto` tasks with `status: pending_review` are reviewed by headless Claude Code
and the review is sent back to the peer. Everything else (collab tasks, replies) is
only saved to the inbox for a human-driven session.
"""

import hmac
import logging
import re
import sys
import threading
from pathlib import Path
from typing import Callable, Optional

import uvicorn
from fastapi import BackgroundTasks, Depends, FastAPI, Header, HTTPException
from pydantic import BaseModel, Field

from agent_link import client, frontmatter, reviewer
from agent_link.config import ConfigError, Settings, load_env, load_settings

log = logging.getLogger("agent_link")

MAX_CONTENT_CHARS = 500_000
SAFE_FILENAME = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._-]{0,120}\.md$")
AUTO_TRIGGER_STATUS = "pending_review"

Reviewer = Callable[[str, Settings], str]
Sender = Callable[[str, str, Settings], dict]


class TaskIn(BaseModel):
    filename: str = Field(max_length=255)
    content: str = Field(max_length=MAX_CONTENT_CHARS)


def default_reviewer(markdown: str, settings: Settings) -> str:
    return reviewer.run_review(markdown, settings.claude_bin, settings.review_timeout)


def safe_filename(name: str) -> str:
    if not SAFE_FILENAME.match(name):
        raise HTTPException(422, "filename must be a plain name like 'proposal.md'")
    return name


def build_reply(fields: dict, review: str, settings: Settings) -> str:
    reply_fields = {
        "task_id": fields["task_id"],
        "title": f"Review: {fields['title']}",
        "author": settings.agent_name,
        "target_agent": fields["author"],
        "status": "reviewed",
        "mode": fields["mode"],
    }
    return frontmatter.build(reply_fields, review)


def create_app(
    settings: Settings,
    review: Reviewer = default_reviewer,
    send: Sender = client.post_task,
) -> FastAPI:
    app = FastAPI(docs_url=None, redoc_url=None, openapi_url=None)
    review_lock = threading.Lock()  # one headless Claude run at a time

    def verify_token(x_agent_token: Optional[str] = Header(default=None)) -> None:
        supplied = (x_agent_token or "").encode()
        if not hmac.compare_digest(supplied, settings.token.encode()):
            raise HTTPException(401, "Unauthorized agent connection")

    def auto_review(path: Path, fields: dict) -> None:
        with review_lock:
            try:
                log.info("auto-reviewing %s", path.name)
                reply = build_reply(fields, review(path.read_text(encoding="utf-8"), settings), settings)
                reply_name = f"{path.stem}-review.md"
                settings.outbox.mkdir(parents=True, exist_ok=True)
                (settings.outbox / reply_name).write_text(reply, encoding="utf-8")
                send(reply_name, reply, settings)
                log.info("sent %s to peer", reply_name)
            except Exception:
                log.exception("auto-review of %s failed; file left in inbox", path.name)

    @app.post("/receive-task", status_code=202, dependencies=[Depends(verify_token)])
    def receive_task(task: TaskIn, background: BackgroundTasks) -> dict:
        filename = safe_filename(task.filename)
        try:
            fields = frontmatter.parse(task.content)
        except frontmatter.FrontmatterError as exc:
            raise HTTPException(422, str(exc)) from exc

        settings.inbox.mkdir(parents=True, exist_ok=True)
        path = settings.inbox / filename
        path.write_text(task.content, encoding="utf-8")

        if fields["mode"] == "auto" and fields["status"] == AUTO_TRIGGER_STATUS:
            background.add_task(auto_review, path, fields)
            action = "queued_for_auto_review"
        else:
            action = "saved_to_inbox"
        log.info("received %s (task %s): %s", filename, fields["task_id"], action)
        return {"status": "Accepted", "task_id": fields["task_id"], "action": action}

    return app


def main() -> int:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    load_env()
    try:
        settings = load_settings()
    except ConfigError as exc:
        log.error("config error: %s", exc)
        return 2
    uvicorn.run(create_app(settings), host=settings.listen_host, port=settings.listen_port)
    return 0


if __name__ == "__main__":
    sys.exit(main())
