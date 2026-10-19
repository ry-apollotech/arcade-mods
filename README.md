# claude-mods

A collection of Claude Code mods (Claude Code 2.1.287+).

| Mod | Author | What it does |
|---|---|---|
| [arcade-dash](mods/arcade-dash) | Ryan | 8-bit arcade dashboard: score band, compact tool rows, arcade spinner and branch status |
| [flightdeck](mods/flightdeck) | [Stephen Casella](https://github.com/scasella) — vendored, MIT ([upstream](https://github.com/scasella/claude-flightdeck)) | Live agent dashboard: context and cost, permission checks, subagent cards and swimlanes |
| [dailyred-dash](mods/dailyred-dash) | Ryan | Daily Red (by amoi-builds) battles in a pane, on the real FireRed engine |

Third-party mods are included unmodified with their original license; see each folder's `LICENSE` and `VENDORED.md`.

## Install

Add the collection once, then install the mods you want:

```
/plugin marketplace add <owner>/claude-mods
/plugin install arcade-dash@claude-mods
/plugin install flightdeck@claude-mods
/plugin install dailyred-dash@claude-mods
/reload-plugins
```

Or try one for a single session from a clone: `claude --plugin-dir ./mods/<mod>`.

- **arcade-dash and flightdeck** both draw above the prompt, so enable one at a time
  (`/plugin disable <mod>@claude-mods` turns one off).
- **dailyred-dash** opens its own pane and works alongside either. It runs on Linux or WSL and
  needs a one-time setup: `sudo apt install -y libmgba-dev`, then `/dailyred setup` in Claude Code,
  which builds the game from source on your machine (about 2 minutes). No ROM is included or
  downloaded. Then `/dailyred` to play; see [its README](mods/dailyred-dash) for the keys.
