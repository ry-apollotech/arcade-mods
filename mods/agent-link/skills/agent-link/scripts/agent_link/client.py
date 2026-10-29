"""Send task files to the peer (run via: agent_link_cli.py send FILE...)."""

import argparse
import sys
from pathlib import Path

import requests

from agent_link import frontmatter
from agent_link.config import ConfigError, Settings, load_env, load_settings

REQUEST_TIMEOUT_SECONDS = 30


class SendError(RuntimeError):
    pass


def post_task(filename: str, content: str, settings: Settings) -> dict:
    try:
        response = requests.post(
            f"{settings.peer_url}/receive-task",
            json={"filename": filename, "content": content},
            headers={"X-Agent-Token": settings.token},
            timeout=REQUEST_TIMEOUT_SECONDS,
        )
    except requests.RequestException as exc:
        raise SendError(f"could not reach peer at {settings.peer_url}: {exc}") from exc
    if response.status_code == 401:
        raise SendError("peer rejected the token (401): check SHARED_AGENT_TOKEN matches")
    if not response.ok:
        raise SendError(f"peer returned {response.status_code}: {response.text[:300]}")
    return response.json()


def send_file(path: Path, settings: Settings) -> dict:
    content = path.read_text(encoding="utf-8")
    frontmatter.parse(content)  # fail locally before sending a malformed task
    return post_task(path.name, content, settings)


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(description="Send Markdown task files to your peer agent.")
    parser.add_argument("files", nargs="+", type=Path)
    args = parser.parse_args(argv)

    load_env()
    try:
        settings = load_settings()
    except ConfigError as exc:
        print(f"config error: {exc}", file=sys.stderr)
        return 2

    failed = False
    for path in args.files:
        try:
            result = send_file(path, settings)
            print(f"sent {path.name}: {result}")
        except (OSError, frontmatter.FrontmatterError, SendError) as exc:
            print(f"failed {path}: {exc}", file=sys.stderr)
            failed = True
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
