# dailyred-dash — design

**Date:** 2026-10-13 · **Status:** draft for review

A Claude Code mod that plays [Daily Red](https://github.com/amoi-builds/dailyred) (by amoi-builds) in a
pane: today's six random level-100 Pokémon against RED, on the real FireRed battle engine, drawn as
readable terminal text instead of the game's pixels.

## Goals

- Battle RED from a Claude Code pane in Windows Terminal + WSL at the normal font size.
- The battle logic is the untouched game: dailyred's ROM runs in mGBA; the mod only shows state and
  sends choices.
- **Daily team, unlimited retries:** everyone gets the same team on a calendar day (dailyred's seed);
  a loss lets you go again straight away.
- **Per-day stats:** beaten today or not, attempts taken, day streak (days with at least one win).
- **Attract mode:** after 15 minutes without input the pane plays demo battles with random teams,
  never counted. Any key takes over.

## Non-goals

- Showing the game's own screen (the spike showed GBA pixels are unreadable at a usable font size).
- The overworld: the walk to RED is automated.
- Bag items, saving mid-battle, other games, a stats history view (the data is kept; a view can come later).
- Shipping a ROM or Nintendo code: nothing of the game is in this repository (see Licensing).

## Decisions made

| Question | Decision |
|---|---|
| Where it lives | New mod `mods/dailyred-dash` in claude-mods; arcade-dash unchanged |
| Approach | Read battle state from RAM by symbol; draw our own UI (not pixels, not a reimplementation) |
| Play mode | Daily team, unlimited retries the same day |
| Stats | Per day: won, attempts; day streak |
| Attract mode | Random-team demo battles vs RED after 15 idle minutes |

## Architecture

```
mods/dailyred-dash/
├─ native/runner.c      libmgba host: boots the ROM, reads RAM, prints JSON, takes commands
├─ scripts/setup.sh     one-time build: toolchain, dailyred ROM + symbol map, runner
├─ hooks/register.tsx   mod: /dailyred command, spawns the runner, draws the pane
├─ hooks/*.ts           state parsing, stats, attract timer, autoplayer (pure, unit-tested)
└─ tests/
```

### 1. Setup (`/dailyred setup` → `scripts/setup.sh`)

Everything goes under `~/.claude/dailyred/`; nothing system-wide except **libmgba**, which the person
installs once (`sudo apt install libmgba-dev`; setup checks and says so if it is missing).

1. Toolchain: xPack arm-none-eabi-gcc 14.2.1 for linux-x64, checked against its published SHA-256;
   zlib 1.3.1 and libpng 1.6.44 built static (no sudo).
2. dailyred at a **pinned commit**, then its own `get-pokefirered.sh` (pret/pokefirered at its pinned
   commit + dailyred's patch).
3. The two tools that link libpng (`gbagfx`, `rsfont`) built first with `-lm` (static libpng on Linux
   needs it; macOS does not), then dailyred's `build-rom.sh`.
4. Keep `pokefirered_modern.gba` and `pokefirered_modern.map`; compile `native/runner.c` against libmgba.

Takes ~2 minutes on the spike machine. Re-running skips finished steps. The mod reports progress and
the first failing step's last lines.

### 2. Runner (`native/runner.c`)

One process per battle session, spawned by the mod with `$.process.spawn`.

- **Boot:** loads the ROM into memory, writes the config struct found by its magic `DAILYRED-CONF-V2`
  (u32 seed, u16 wins, u16 battles, u8 daily) as dailyred's `rom-config.js` does, then boots. Seed and
  daily flag come from argv.
- **Addresses:** read once from the `.map` file (`gBattleMons`, `gBattleTypeFlags`,
  `gDisplayedStringBattle`, `gBattlerPartyIndexes`, `gPlayerParty`, `gEnemyParty`, `gBattleOutcome`,
  `gActionSelectionCursor`, `gMoveSelectionCursor`, `gBattlerControllerFuncs` and the handler functions
  it is compared with). dailyred's status block is found by its magic `DAILYRED-STATUS1`.
- **Output:** one JSON line on stdout whenever the state changes (at most ~10/s):
  `{ phase, menu, player: Mon, enemy: Mon, party: PartyMon[], message, outcome }`, where `Mon` holds
  species, nickname, level, hp, maxHp, types, moves[{ id, name, pp, maxPp, power, type }].
  Species, move and type names come from tables generated from the decompilation at setup time.
- **Input:** commands, one per line, in a file the mod writes (stdin closes at spawn):
  `move <1-4>`, `switch <1-6>`, `advance`, `tap <buttons>`. The runner turns each into button presses
  by reading where the menu cursor is now (`gActionSelectionCursor`, `gMoveSelectionCursor`), so a
  command works from any starting cursor position.
- **Automation:** walks from the start tile to RED and talks to him (a fixed key script, checked by
  watching dailyred's phase); presses A through battle text while no choice is pending.
- Runs at real speed (60 fps), or at up to 4× during automated walking and text.

### 3. Mod (`hooks/`)

- **`/dailyred`** opens the pane and starts today's battle (seed = dailyred's `dailySeed(today)`, FNV-1a
  of `dailyred:YYYY-MM-DD` in local time). **`/dailyred setup`** runs setup. **`/dailyred stop`** ends it.
- **Pane** (fits 64×22 cells):

```
 RED's CHARIZARD          Lv100   ┌────────────┐
 HP ████████████░░░░  241/360     │ enemy      │
                                  │ sprite     │
 ┌────────────┐                   └────────────┘
 │ your       │  VENUSAUR         Lv100
 │ sprite     │  HP ██████████░░  301/364
 └────────────┘
 ────────────────────────────────────────────────────────
 RED's CHARIZARD used FLAMETHROWER!  It's super effective!
 1 SOLAR BEAM  10/10    2 SLEEP POWDER 15/15
 3 GIGA DRAIN   8/10    4 SYNTHESIS     5/5
 s switch   ·   today: attempt 3 · day streak 5
```

  Sprites: the front/back pics from the built decompilation (`graphics/pokemon/<name>/front.png`,
  `back.png`, 64×64), drawn with arcade-dash's half-block raster at 32×32 pixels (16 rows). Text is
  plain terminal text.
- **Keys** (Button hotkeys while the pane holds focus): `1`–`4` use a move; `s` opens the party, then
  `1`–`6` switch; `j` advances text when the game waits. Keys only act when the matching menu is up.
- **Retries:** when the battle ends, the result shows with `r` to retry today's team (new runner
  process, same seed) and the stats line.
- **Stats** in `$.store` (persists across sessions): `{ days: { [date]: { attempts, won } } }`. A battle
  that reached RED counts as an attempt; day streak = consecutive days, ending today or yesterday, with
  `won` true.
- **Attract mode:** a `$.clock` timer reset by any pane key or `/dailyred` command. After 15 minutes
  idle with the pane open and no battle in progress, it starts a practice battle with a random seed
  (daily flag off) and lets the autoplayer choose: highest power × type effectiveness against the
  enemy, with a 20 % random pick. Shows `DEMO · press any key` instead of the stats line. A key stops
  the demo and returns to the title card; demo battles never touch stats.

## Error handling

- Setup not done or libmgba missing: the pane says which, and the command to run.
- Runner exits unexpectedly: the pane shows its last stderr line and offers `r` to restart; nothing
  counted.
- No JSON for 10 s: treat as stalled, stop the runner, same message.
- Unknown menu state (a screen not mapped): the pane shows the raw message and a `j` (A) / `k` (B)
  fallback so play can continue.
- The ROM or map is from another dailyred commit (magic or a symbol missing): refuse with a "re-run
  `/dailyred setup`" message.

## Testing

- **Unit (claude plugin test):** JSON state parsing, stats and streak rules (dates crossing midnight,
  gaps), seed matches dailyred's `dailySeed` for known dates, autoplayer choice, attract timer
  (mocked clock), pane rendering for each menu state from fixture JSON.
- **Runner (C, headless):** scripted runs against the built ROM: reaches RED, enters battle, `move 1`
  changes the enemy's HP, a forced loss ends with outcome `lost`; JSON validated against fixtures.
- **Live:** one manual battle in Windows Terminal, recorded in the plan as the acceptance check.

## Licensing

The repository contains only our mod code and our runner. dailyred has no license file, so it is
fetched at setup, never copied; likewise pret/pokefirered, the ROM and all sprites are fetched or built
on the person's machine by `setup.sh`, as dailyred itself does. The README credits amoi-builds/dailyred
and pret/pokefirered and carries dailyred's notice: unofficial fan project, not affiliated with
Nintendo, Creatures Inc., GAME FREAK inc. or The Pokémon Company. libmgba (MPL-2.0) is linked
dynamically from the system package.

## Risks to settle early in the plan

1. **Menu detection** by comparing `gBattlerControllerFuncs[0]` with handler addresses: confirm on the
   built ROM before building the UI.
2. **Battle text:** `gDisplayedStringBattle` uses FireRed's character encoding; decode with the charmap
   from the decompilation (`charmap.txt`), placeholders already expanded by the game.
3. **Cursor-driven input** must stay correct while the game animates; commands wait until the menu
   handler is active.
4. **Pane focus:** hotkeys need the pane focused (`ctrl+x tab` or click); the title card says so.
