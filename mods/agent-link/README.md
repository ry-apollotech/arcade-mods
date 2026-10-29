# agent-link

A Claude Code skill that links you and a partner on the same local network. You tell Claude
"send this spec to my partner"; the partner's machine either has Claude review it automatically and
sends the review back, or holds it in an inbox so the partner can work through it with their own
Claude. Connections are protected by a shared secret token.

```
Your machine                                 Partner's machine
AL send proposal.md   ──HTTP + token──▶      AL server: saves inbox/proposal.md
                                             └─ claude -p (all tools off) reviews it
inbox/proposal-review.md  ◀──────────────── sends proposal-review.md back
```

| Task frontmatter | What the receiver does |
|---|---|
| `status: pending_review`, `mode: auto` (default) | Claude reviews it with **all tools disabled** and sends `<name>-review.md` back |
| `mode: collab` | Saved to the inbox only, for a person to work through in their own Claude Code session |
| any other `status` (e.g. `reviewed`) | Saved only, so two agents never reply to each other forever |

## Install

```
/plugin marketplace add ry-apollotech/arcade-mods
/plugin install agent-link@arcade-mods
/reload-plugins
```

Then ask Claude: **"set up agent-link"**. Claude creates a Python environment and `~/.agent-link/.env`, then asks
for your partner's IP and a name for your agent. Needs Python 3.10+ and Claude Code logged in
(run `claude` once interactively). Settings, inbox and outbox live in `~/.agent-link/`, so they survive plugin updates.

**The token:** only one person generates it (Claude runs `AL token` for you). Send it to your partner
privately (a DM or password manager), and both of you put the same value in `~/.agent-link/.env`.
Never commit it or paste it into a shared channel.

### Windows + WSL

Other machines can't reach a server inside WSL by default. Do this once:

1. Add the following to `%UserProfile%\.wslconfig`, then run `wsl --shutdown` in PowerShell:
   ```ini
   [wsl2]
   networkingMode=mirrored
   ```
2. Allow the port through Windows Firewall (PowerShell as admin):
   ```powershell
   New-NetFirewallRule -DisplayName "agent-link 8000" -Direction Inbound -Protocol TCP -LocalPort 8000 -Action Allow
   ```

Give your partner your Windows IP (`ipconfig`, IPv4 address of your Wi-Fi/Ethernet adapter).

## Test it with a partner

Both of you ask Claude to **"start the agent-link server"** (or run `AL server` in a terminal and leave it running). Then:

1. **Connection check (no Claude run):** "send the agent-link hello example to my partner". The result says
   `saved_to_inbox`, and your partner finds `hello.md` in `~/.agent-link/inbox/`.
2. **Auto review round trip:** "send the agent-link proposal example to my partner". The result says
   `queued_for_auto_review`. Within about a minute, `proposal-review.md` arrives in your inbox.
3. **Collab:** write a task with `mode: "collab"` and send it. Your partner asks their Claude to "check
   my agent-link inbox", works through it, and sends back a reply with `status: "reviewed"`.

| Symptom | Fix |
|---|---|
| `could not reach peer` / timeout | Partner's server not running, wrong `PEER_IP`, firewall, or WSL not in mirrored mode |
| `peer rejected the token (401)` | The two `.env` tokens differ. Copy it again with no quotes or spaces |
| `422` | Filename isn't a plain `name.md`, or a frontmatter field is missing |
| Accepted but no review returns | Check the **partner's** server log. Usually `claude` isn't logged in or isn't on PATH (set `CLAUDE_BIN`) |

## Use without Claude

`AL` stands for `~/.agent-link/.venv/bin/python skills/agent-link/scripts/agent_link_cli.py`:

```sh
python3 -m venv ~/.agent-link/.venv
~/.agent-link/.venv/bin/pip install -r skills/agent-link/scripts/requirements.txt
AL init                      # creates ~/.agent-link/.env
AL token                     # one person only; share privately
AL server                    # leave running
AL send skills/agent-link/examples/hello.md
```

## Security

- The server refuses to start without a token of 32 or more characters. The token check takes the same time whether a guess is close or not, so it can't be cracked by timing. Requests with a missing or wrong token get `401`.
- Filenames are restricted to `name.md`, so nothing is written outside `~/.agent-link/inbox` and `outbox`.
- Incoming Markdown is untrusted. The auto reviewer receives it on stdin with `--tools ""`, so it can't run commands
  or touch files, whatever the document says. The skill tells Claude to treat inbox files as material to read, not instructions.
- Traffic is plain HTTP, so anyone on the same network can read the token and content. Use it only on a trusted LAN.

## Develop

```sh
python3 -m venv .venv && .venv/bin/pip install -r skills/agent-link/scripts/requirements.txt
.venv/bin/python -m pytest -q tests
claude plugin validate .
```

## License

MIT
