# arcade-dash

An 8-bit arcade look for Claude Code's terminal, with a pixel pet that runs while Claude works
and rests when it's idle.

- **Score band** above the prompt: `1UP` (folder), `SCORE` (last test run), `TIME` (last turn),
  `STAGE` (git branch, uncommitted files), `PLAYER` (model), `ENERGY` (context left), and your pet
  in the right corner.
- **Compact tool rows**: one line per tool call (`✓ READ …`, `★ GRADLE …`, red ` MISS ` on failure).
- **Arcade spinner** (`▓▒░ RUNNING · ESC TO PAUSE`), `P1 ▶` prompts, `◆` replies,
  `── ROUND OVER · 00:37 ──` turn footer, and a `★ STAGE CLEAR ★` toast when tests pass.
- **Status line**: branch and unpushed commits.

## Install

In a Claude Code terminal session:

```
/plugin marketplace add <owner>/claude-mods
/plugin install arcade-dash@claude-mods
/reload-plugins
```

Your terminal font isn't changed by the mod; for the full look, use a pixel font such as VT323
and a dark color scheme.

## Add your own pet

Drop two GIFs into `~/.claude/arcade-pet/` (on Windows, `C:\Users\<you>\.claude\arcade-pet\`):

| File | What it is |
|---|---|
| `walk.gif` | The working animation: 2–4 frames, played in place while Claude works. |
| `rest.gif` | The resting pose: 1 frame, or a few for a breathing loop. A white `z Z` is drawn for you. |

Then type `/pet reload` in Claude Code (or start a new session). The mod reads the GIFs itself;
nothing to install or run. If a file is missing or can't be read, it says why and keeps the
built-in Pikachu.

### Art that works best

| | Size |
|---|---|
| Height | The score band shows up to **20 pixels** (16 is ideal, 8 terminal rows). The `/pet` pane shows up to **64 pixels** (32 rows), a whole Game Boy Advance sprite, so GBA-era art shows 1:1. |
| Width | Up to about **24 pixels**. |
| Scale | 1:1, or a clean whole-number upscale (2×, 5×, 10×…). It's detected and undone with no loss. Uneven or blurry scaling gets shrunk instead and loses detail. |

- **GIF only.** A still image can be saved as a one-frame GIF from any image editor.
- **Background**: transparent, or one solid color (made transparent).
- **Outline**: avoid pure black, which vanishes on dark terminals. Pure black is recolored to dark
  gray automatically.
- Frames taller than 20 pixels are shrunk (outlines are kept where they cover enough of a pixel),
  but art drawn at the target size always looks best.
- **Keep it small.** Width × height × frames must stay under 25 million pixels (e.g. 1000×1000 with
  25 frames). Bigger GIFs are rejected with a message and the built-in pet stays. Only about 20 pixels of
  height are ever drawn, so 250 pixels tall or less loads fastest and looks the same.
- `walk.gif` plays at the GIF's own frame timing.

## Commands

- `/pet` opens the pet in its own pane (docked on the right in the `/tui fullscreen` layout).
- `/pet reload` loads `walk.gif` and `rest.gif` from `~/.claude/arcade-pet/`.

## Credits

See [CREDITS.md](CREDITS.md). The default Pikachu is fan art and not affiliated with
Nintendo / Game Freak / The Pokémon Company.
