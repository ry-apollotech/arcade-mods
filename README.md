# arcade-mods

A collection of Claude Code mods (Claude Code 2.1.287+).

| Mod | Author | What it does |
|---|---|---|
| [arcade-dash](mods/arcade-dash) | Ryan | 8-bit arcade dashboard: score band, compact tool rows, arcade spinner and branch status |
| [flightdeck](mods/flightdeck) | [Stephen Casella](https://github.com/scasella) — vendored, MIT ([upstream](https://github.com/scasella/claude-flightdeck)) | Live agent dashboard: context and cost, permission checks, subagent cards and swimlanes |
| [fueldeck](mods/fueldeck) | Ryan, based on Flightdeck by [Stephen Casella](https://github.com/scasella) (MIT) | Flightdeck plus a fuel panel: session tokens by loop and model, cache hits, and what each plugin, skill and MCP server costs in context |
| [dailyred-dash](mods/dailyred-dash) | Ryan | Daily Red (by amoi-builds) battles in a pane, on the real FireRed engine |
| [presentation-deck](mods/presentation-deck) | Ryan | A skill that builds themed PowerPoint decks from a JSON outline: cards, steps, flows, stats, timelines, framed screenshots and speaker notes |
| [agent-link](mods/agent-link) | Ryan | A skill that sends Markdown tasks to a partner's Claude Code over your LAN with a shared token: auto-review with no tools, or an inbox for collab sessions |

Third-party mods are included unmodified with their original license; see each folder's `LICENSE` and `VENDORED.md`.

## Install

Add the collection once, then install the mods you want:

```
/plugin marketplace add ry-apollotech/arcade-mods
/plugin install arcade-dash@arcade-mods
/plugin install flightdeck@arcade-mods
/plugin install fueldeck@arcade-mods
/plugin install dailyred-dash@arcade-mods
/plugin install presentation-deck@arcade-mods
/plugin install agent-link@arcade-mods
/reload-plugins
```

Or try one for a single session from a clone: `claude --plugin-dir ./mods/<mod>`.

- **arcade-dash, flightdeck and fueldeck** all draw above the prompt, so enable one at a time
  (`/plugin disable <mod>@arcade-mods` turns one off). Fueldeck is Flightdeck plus the fuel panel,
  so you'd pick one of those two.
- **dailyred-dash** opens its own pane and works alongside either. It runs on Linux or WSL and
  needs a one-time setup: `sudo apt install -y libmgba-dev`, then `/dailyred setup` in Claude Code,
  which builds the game from source on your machine (about 2 minutes). No ROM is included or
  downloaded. Then `/dailyred` to play; see [its README](mods/dailyred-dash) for the keys.
- **agent-link** needs Python 3.10+ on both machines. Ask Claude to "set up agent-link", then follow
  [its README](mods/agent-link) to test with a partner.
