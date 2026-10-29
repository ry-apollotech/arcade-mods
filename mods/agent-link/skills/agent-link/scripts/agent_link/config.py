"""Settings loaded from environment variables, populated from ~/.agent-link/.env.

Config and data live outside the plugin folder so they survive plugin updates.
"""

import os
import socket
from dataclasses import dataclass
from pathlib import Path

from dotenv import load_dotenv

MIN_TOKEN_LENGTH = 32
DEFAULT_PORT = 8000
DEFAULT_HOME = Path.home() / ".agent-link"


def agent_home(env=None) -> Path:
    env = os.environ if env is None else env
    return Path(env.get("AGENT_LINK_HOME") or DEFAULT_HOME).expanduser()


def load_env() -> None:
    load_dotenv(agent_home() / ".env")


class ConfigError(RuntimeError):
    pass


@dataclass(frozen=True)
class Settings:
    token: str
    peer_url: str
    listen_host: str
    listen_port: int
    agent_name: str
    inbox: Path
    outbox: Path
    claude_bin: str
    review_timeout: int


def load_settings(env=None) -> Settings:
    env = os.environ if env is None else env

    token = env.get("SHARED_AGENT_TOKEN", "")
    if len(token) < MIN_TOKEN_LENGTH:
        raise ConfigError(
            f"SHARED_AGENT_TOKEN must be set in {agent_home(env) / '.env'} and be at least "
            f"{MIN_TOKEN_LENGTH} characters. Generate one with: agent_link_cli.py token"
        )
    peer_ip = env.get("PEER_IP", "")
    if not peer_ip:
        raise ConfigError("PEER_IP must be set to your partner's IP address")

    home = agent_home(env)
    return Settings(
        token=token,
        peer_url=f"http://{peer_ip}:{int(env.get('PEER_PORT', DEFAULT_PORT))}",
        listen_host=env.get("LISTEN_HOST", "0.0.0.0"),
        listen_port=int(env.get("LISTEN_PORT", DEFAULT_PORT)),
        agent_name=env.get("AGENT_NAME") or socket.gethostname(),
        inbox=home / env.get("INBOX_DIR", "inbox"),
        outbox=home / env.get("OUTBOX_DIR", "outbox"),
        claude_bin=env.get("CLAUDE_BIN", "claude"),
        review_timeout=int(env.get("REVIEW_TIMEOUT_SECONDS", 600)),
    )
