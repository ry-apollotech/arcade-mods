# dailyred-dash

[Daily Red](https://github.com/amoi-builds/dailyred) in a Claude Code pane: today's six random
level-100 Pokémon against RED at the top of the mountain, on the real Pokémon FireRed battle engine,
drawn as readable terminal text. Retry as often as you like; your attempts and day streak are kept.

## Set up (once)

1. `sudo apt install -y libmgba-dev` (in a WSL/Linux terminal)
2. In Claude Code: `/dailyred setup` — builds the Daily Red ROM from source on your machine
   (about 2 minutes, ~1 GB in `~/.claude/dailyred`). No ROM is downloaded or included.

## Play

`/dailyred`, then focus the pane (`ctrl+x tab` or click it):

| Key | Does |
|---|---|
| `1`–`4` | use a move |
| `s`, then `1`–`6` | switch Pokémon |
| `j` | next (advance text) |
| `r` | retry today's team after a battle |

`/dailyred stop` ends a battle. Left alone for 15 minutes with the pane open, it plays demo battles
with random teams; any key stops the demo. Demos never count.

## Credits

- [amoi-builds/dailyred](https://github.com/amoi-builds/dailyred) — Daily Red itself (the game changes,
  the daily seed); fetched at a pinned commit by `setup.sh`, not copied here.
- [pret/pokefirered](https://github.com/pret/pokefirered) — the FireRed decompilation the ROM is built from.
- [mGBA](https://mgba.io) — the emulator (libmgba, MPL-2.0), used through the system package.

Daily Red and dailyred-dash are unofficial fan projects, not affiliated with or endorsed by Nintendo,
Creatures Inc., GAME FREAK inc. or The Pokémon Company. Pokémon and all related names, characters and
game content are © Nintendo, Creatures Inc. and GAME FREAK inc.
