"""agent-link command line.

  agent_link_cli.py init           create ~/.agent-link/.env from the template (never overwrites)
  agent_link_cli.py token          print a new shared token
  agent_link_cli.py server         receive tasks (leave it running)
  agent_link_cli.py send FILE...   send task files to your peer
"""

import secrets
import shutil
import sys
from pathlib import Path

from agent_link import client, server
from agent_link.config import agent_home

TEMPLATE = Path(__file__).with_name(".env.example")


def init() -> int:
    env_file = agent_home() / ".env"
    if env_file.exists():
        print(f"{env_file} already exists; edit it directly")
        return 0
    env_file.parent.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(TEMPLATE, env_file)
    env_file.chmod(0o600)
    print(f"created {env_file}: set SHARED_AGENT_TOKEN, PEER_IP and AGENT_NAME")
    return 0


def token() -> int:
    print(secrets.token_urlsafe(48))
    return 0


def main(argv: list) -> int:
    command, args = (argv[0], argv[1:]) if argv else ("", [])
    if command == "init":
        return init()
    if command == "token":
        return token()
    if command == "server":
        return server.main()
    if command == "send":
        return client.main(args)
    print(__doc__)
    return 2


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
