# dailyred-dash Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A Claude Code mod that plays Daily Red against RED in a pane, reading the real FireRed battle from emulator memory and drawing it as readable terminal text.

**Architecture:** `scripts/setup.sh` builds dailyred's ROM, a symbol table, a sprite sheet and a native runner into `~/.claude/dailyred/`. The runner (C, libmgba) boots the ROM headless, automates the walk to RED and the battle text, prints the battle as JSON lines and takes commands from a file. The mod (TypeScript) spawns the runner, draws the pane from the JSON, sends the person's choices, keeps per-day stats and runs attract mode.

**Tech Stack:** C11 + libmgba 0.9.3 (Ubuntu package), Python 3 stdlib (build-time converters), Bash, TypeScript Claude Code mod API (2.1.296), `claude plugin test`.

**Spec:** `docs/superpowers/specs/2026-10-13-dailyred-dash-design.md`

## Global Constraints

- Platform: Windows Terminal + WSL Ubuntu 22.04; the only system package is `libmgba-dev` (0.9.3); nothing else needs sudo.
- Pinned sources: dailyred `b8ba20c6d5177642b4c55d9c948282b8a0dd904d`; xPack arm-none-eabi-gcc `14.2.1-1.1` (SHA-256 checked); zlib `1.3.1`; libpng `1.6.44`.
- Data directory: `$DAILYRED_HOME`, default `~/.claude/dailyred`.
- Nothing of the game (ROM, decompilation, sprites, text) is committed to this repository.
- Pane fits 64 columns × 22 rows.
- Attract mode: 15 minutes idle; autoplayer picks a random usable move 20 % of the time.
- Button hotkeys are one digit or one lowercase letter (API rule).
- Match arcade-dash style: single quotes, no semicolons, comments as full sentences above the code they explain.

## Review Focus

1. **A battle that starts before midnight and ends after** — the win must count for the day the attempt started. Test in Task 6 (`recordWin` takes the attempt's date).
2. **Setup missing or half done** (no runner binary, no ROM) — `/dailyred` must show the setup instruction, never spawn a missing file. Test in Task 7.
3. **A key for a menu that is not up** (`3` during battle text, `s` on the move menu) — nothing is sent to the runner. Test in Task 7.
4. **A move with 0 PP, or a Pokémon with fewer than four moves** — its key does nothing and the move shows dim; the autoplayer never picks it. Tests in Tasks 6 and 7.
5. **Runner exits or goes silent mid-battle** — the pane shows the error with `r` to restart and the attempt is not lost or double counted. Test in Task 7.

---

## File Structure

```
mods/dailyred-dash/
├─ .claude-plugin/plugin.json      manifest (name, version, types)
├─ README.md                       install, setup, controls, credits and Nintendo notice
├─ types/index.d.ts                BattleState, Screen; PluginState contract
├─ scripts/setup.sh                one-time build into $DAILYRED_HOME
├─ scripts/symbols.py              .map + nm → symbols.txt
├─ scripts/sprites.py              decompilation pics → sprites.json (32×32, 16 colors)
├─ native/Makefile                 builds runner and test_text
├─ native/symbols.h/.c             loads symbols.txt
├─ native/text.h/.c                FireRed text → UTF-8 via charmap.txt
├─ native/test_text.c              unit test for text.c
├─ native/game.h/.c                reads phase, menu, mons, party; writes JSON
├─ native/control.h/.c             commands, button presses, automation
├─ native/runner.c                 argv, boot with config injection, main loop
├─ hooks/hooks.json
├─ hooks/seed.ts                   today(), dailySeed()
├─ hooks/stats.ts                  per-day stats, streak
├─ hooks/state.ts                  parseStateLine()
├─ hooks/autoplay.ts               chooseMove()
├─ hooks/sprites.ts                sprite sheet → raster cells
├─ hooks/view.tsx                  the pane's tree for each Screen
├─ hooks/register.tsx              commands, runner process, keys, stats, attract mode
└─ tests/
   ├─ native/test_symbols.py, test_sprites.py, test_runner.py
   ├─ seed.test.ts, stats.test.ts, state.test.ts, autoplay.test.ts, sprites.test.ts
   ├─ view.test.tsx, session.test.tsx, attract.test.tsx
   └─ fixtures.ts                  sample BattleState values
```

---

### Task 1: Build-time converters (symbols and sprites)

**Files:**
- Create: `mods/dailyred-dash/.claude-plugin/plugin.json`, `mods/dailyred-dash/scripts/symbols.py`, `mods/dailyred-dash/scripts/sprites.py`
- Test: `mods/dailyred-dash/tests/native/test_symbols.py`, `mods/dailyred-dash/tests/native/test_sprites.py`

**Interfaces:**
- Produces: `symbols.txt` — lines `name hexaddr` for exactly the names in `NAMES` below; `sprites.json` — `{ "<species id>": { "palette": [16 ints 0xRRGGBB], "front": "<1024 hex digits>", "back": "<1024 hex digits>" } }`, 32×32 pixels row-major, digit 0 = transparent.

- [ ] **Step 1: Manifest**

```json
{
  "name": "dailyred-dash",
  "version": "0.1.0",
  "description": "Daily Red in a pane: battle RED with today's team on the real FireRed engine",
  "author": { "name": "Ryan" },
  "types": "./types/index.d.ts"
}
```

- [ ] **Step 2: Write the failing symbol test** (`tests/native/test_symbols.py`)

```python
import pathlib
import sys
import unittest

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[2] / 'scripts'))
import symbols  # noqa: E402

MAP = """
 .text          0x0803ec78     0x5264 src/battle_controller_player.o
 .text          0x08043edc     0x1000 src/battle_controller_opponent.o
"""
NM = """08037ac4 t HandleInputChooseAction
0803ed84 t HandleInputChooseAction
08043f6c t HandleInputChooseAction
0803f284 T HandleInputChooseMove
02021410 B gBattleMons
"""


class SymbolsTest(unittest.TestCase):
    def test_picks_the_player_controllers_static(self):
        found = symbols.resolve(MAP, NM, ['HandleInputChooseAction', 'HandleInputChooseMove', 'gBattleMons'])
        self.assertEqual(found['HandleInputChooseAction'], 0x0803ED84)
        self.assertEqual(found['HandleInputChooseMove'], 0x0803F284)
        self.assertEqual(found['gBattleMons'], 0x02021410)

    def test_missing_name_raises(self):
        with self.assertRaisesRegex(KeyError, 'gNope'):
            symbols.resolve(MAP, NM, ['gNope'])


if __name__ == '__main__':
    unittest.main()
```

- [ ] **Step 3: Run it — expect FAIL** (`ModuleNotFoundError: No module named 'symbols'`)

Run: `cd mods/dailyred-dash && python3 -m unittest tests/native/test_symbols.py -v`

- [ ] **Step 4: Implement `scripts/symbols.py`**

```python
"""Writes symbols.txt for the runner: one `name hexaddr` line per address it reads.

Addresses come from `nm` over the built .elf, which lists static functions too. A static name that
several battle controllers define (HandleInputChooseAction, ...) resolves to the copy inside
src/battle_controller_player.o, whose range the build's .map gives.

Usage: python3 -I symbols.py <pokefirered_modern.map> <nm output file> <symbols.txt>
"""
import re
import sys

NAMES = [
    'gBattleMons', 'gBattlersCount', 'gBattleTypeFlags', 'gDisplayedStringBattle', 'gBattlerPartyIndexes',
    'gPlayerParty', 'gEnemyParty', 'gPlayerPartyCount', 'gEnemyPartyCount', 'gBattleOutcome',
    'gActionSelectionCursor', 'gMoveSelectionCursor', 'gBattlerControllerFuncs', 'gPartyMenu',
    'gSpeciesNames', 'gMoveNames', 'gBattleMoves', 'gTypeNames', 'gTypeEffectiveness',
    'gDailyRedRomConfig', 'sStatus',
    'HandleInputChooseAction', 'HandleInputChooseMove', 'HandleInputChooseTarget',
    'OpenPartyMenuToChooseMon', 'WaitForMonSelection',
]
PLAYER_OBJECT = 'src/battle_controller_player.o'


def player_range(map_text):
    match = re.search(r'\.text\s+0x([0-9a-f]+)\s+0x([0-9a-f]+)\s+' + re.escape(PLAYER_OBJECT), map_text)
    if not match:
        raise KeyError(PLAYER_OBJECT)
    start = int(match.group(1), 16)
    return start, start + int(match.group(2), 16)


def resolve(map_text, nm_text, names):
    seen = {}
    for line in nm_text.splitlines():
        parts = line.split()
        if len(parts) == 3:
            seen.setdefault(parts[2], []).append(int(parts[0], 16))
    start, end = player_range(map_text)
    found = {}
    for name in names:
        addresses = seen.get(name)
        if not addresses:
            raise KeyError(name)
        if len(addresses) > 1:
            addresses = [a for a in addresses if start <= a < end]
        if len(addresses) != 1:
            raise KeyError(f'{name}: not exactly one copy in {PLAYER_OBJECT}')
        found[name] = addresses[0]
    return found


def main(map_path, nm_path, out_path):
    with open(map_path) as m, open(nm_path) as n:
        found = resolve(m.read(), n.read(), NAMES)
    with open(out_path, 'w') as out:
        for name in NAMES:
            out.write(f'{name} {found[name]:08x}\n')


if __name__ == '__main__':
    main(*sys.argv[1:4])
```

- [ ] **Step 5: Run it — expect PASS**

Run: `cd mods/dailyred-dash && python3 -m unittest tests/native/test_symbols.py -v`

- [ ] **Step 6: Write the failing sprite test** (`tests/native/test_sprites.py`)

```python
import json
import pathlib
import sys
import tempfile
import unittest

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[2] / 'scripts'))
import sprites  # noqa: E402


def write_pic(path, color):
    # 64x64 4bpp tiles: every pixel `color` except the top-left 8x8 tile, left transparent.
    data = bytearray()
    for tile in range(64):
        value = 0 if tile == 0 else color
        data += bytes([value | value << 4]) * 32
    path.write_bytes(bytes(data))


class SpritesTest(unittest.TestCase):
    def test_converts_a_species(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = pathlib.Path(tmp)
            (root / 'include/constants').mkdir(parents=True)
            (root / 'include/constants/species.h').write_text('#define SPECIES_NONE 0\n#define SPECIES_MR_MIME 122\n')
            folder = root / 'graphics/pokemon/mr_mime'
            folder.mkdir(parents=True)
            write_pic(folder / 'front.4bpp', 3)
            write_pic(folder / 'back.4bpp', 5)
            # Palette: color 3 = pure red (BGR555 0x001F), color 5 = pure blue (0x7C00).
            pal = bytearray(32)
            pal[6:8] = (0x001F).to_bytes(2, 'little')
            pal[10:12] = (0x7C00).to_bytes(2, 'little')
            (folder / 'normal.gbapal').write_bytes(bytes(pal))
            sheet = sprites.build(root)
            entry = sheet['122']
            self.assertEqual(entry['palette'][3], 0xFF0000)
            self.assertEqual(entry['palette'][5], 0x0000FF)
            self.assertEqual(len(entry['front']), 32 * 32)
            self.assertEqual(entry['front'][0], '0')  # the transparent corner tile
            self.assertEqual(entry['front'][-1], '3')
            self.assertEqual(entry['back'][-1], '5')
            json.dumps(sheet)


if __name__ == '__main__':
    unittest.main()
```

- [ ] **Step 7: Run it — expect FAIL** (`No module named 'sprites'`)

Run: `cd mods/dailyred-dash && python3 -m unittest tests/native/test_sprites.py -v`

- [ ] **Step 8: Implement `scripts/sprites.py`**

```python
"""Converts the decompilation's Pokémon pics into dailyred-dash's sprite sheet.

Each species' front.4bpp / back.4bpp (64x64, 8x8 tiles, low nibble = left pixel) and normal.gbapal
(16 BGR555 colors, color 0 transparent) become 32x32 hex strings: each 2x2 block takes its most common
opaque color, or stays transparent when fewer than two of its pixels are opaque.

Usage: python3 -I sprites.py <pokefirered dir> <sprites.json>
"""
import json
import pathlib
import re
import sys

SIZE = 64
LAST_SPECIES = 411


def read_palette(path):
    data = path.read_bytes()
    colors = []
    for i in range(16):
        v = data[2 * i] | data[2 * i + 1] << 8
        r, g, b = v & 31, (v >> 5) & 31, (v >> 10) & 31
        colors.append((r * 255 // 31) << 16 | (g * 255 // 31) << 8 | (b * 255 // 31))
    return colors


def read_4bpp(path):
    data = path.read_bytes()[: SIZE * SIZE // 2]
    px = [[0] * SIZE for _ in range(SIZE)]
    tiles = SIZE // 8
    for t in range(tiles * tiles):
        tx, ty = t % tiles, t // tiles
        for i in range(32):
            byte = data[t * 32 + i]
            y, x = i // 4, (i % 4) * 2
            px[ty * 8 + y][tx * 8 + x] = byte & 15
            px[ty * 8 + y][tx * 8 + x + 1] = byte >> 4
    return px


def halve(px):
    out = []
    for y in range(0, SIZE, 2):
        for x in range(0, SIZE, 2):
            block = [px[y][x], px[y][x + 1], px[y + 1][x], px[y + 1][x + 1]]
            opaque = [c for c in block if c]
            out.append(max(sorted(set(opaque)), key=opaque.count) if len(opaque) >= 2 else 0)
    return ''.join(f'{c:x}' for c in out)


def build(root):
    root = pathlib.Path(root)
    text = (root / 'include/constants/species.h').read_text()
    sheet = {}
    for name, number in re.findall(r'#define SPECIES_(\w+) (\d+)\n', text):
        species = int(number)
        folder = root / 'graphics/pokemon' / name.lower()
        if not 1 <= species <= LAST_SPECIES or not (folder / 'front.4bpp').exists():
            continue
        sheet[str(species)] = {
            'palette': read_palette(folder / 'normal.gbapal'),
            'front': halve(read_4bpp(folder / 'front.4bpp')),
            'back': halve(read_4bpp(folder / 'back.4bpp')),
        }
    return sheet


if __name__ == '__main__':
    pathlib.Path(sys.argv[2]).write_text(json.dumps(build(sys.argv[1]), separators=(',', ':')))
```

- [ ] **Step 9: Run both tests — expect PASS**

Run: `cd mods/dailyred-dash && python3 -m unittest discover -s tests/native -p 'test_s*.py' -v`

- [ ] **Step 10: Commit**

```bash
git add mods/dailyred-dash/.claude-plugin mods/dailyred-dash/scripts mods/dailyred-dash/tests/native
git commit -m "feat(dailyred-dash): symbol and sprite converters"
```

---

### Task 2: `setup.sh` — the one-time build

**Files:**
- Create: `mods/dailyred-dash/scripts/setup.sh`

**Interfaces:**
- Consumes: `scripts/symbols.py`, `scripts/sprites.py` (Task 1); `native/Makefile` (Task 3 — until it lands, setup stops after the data files and says "native/ missing").
- Produces in `$DAILYRED_HOME`: `dailyred.gba`, `symbols.txt`, `charmap.txt`, `sprites.json`, `bin/runner`, and `src/` (the build tree). Prints `DAILYRED-SETUP-OK` as its last line on success.

- [ ] **Step 1: Write `scripts/setup.sh`**

```bash
#!/usr/bin/env bash
# Builds everything dailyred-dash needs into $DAILYRED_HOME (default ~/.claude/dailyred):
# the Daily Red ROM (from amoi-builds/dailyred + pret/pokefirered, built here; nothing of the game is
# in this repository), its symbol table, text charmap, sprite sheet and the native runner.
# Re-running skips finished steps. Only libmgba-dev needs installing first (sudo apt install libmgba-dev).
set -euo pipefail

MOD="$(cd "$(dirname "$0")/.." && pwd)"
HOME_DIR="${DAILYRED_HOME:-$HOME/.claude/dailyred}"
SRC="$HOME_DIR/src"
TC="$SRC/.toolchain"
GAME="$SRC/pokefirered"
DAILYRED_URL="https://github.com/amoi-builds/dailyred.git"
DAILYRED_COMMIT="b8ba20c6d5177642b4c55d9c948282b8a0dd904d"
GCC_VER="14.2.1-1.1"
ZLIB_VER="1.3.1"
LIBPNG_VER="1.6.44"

step() { echo ">> $*"; }

if [ ! -f /usr/include/mgba/core/core.h ]; then
  echo "libmgba is missing. Install it once with: sudo apt install -y libmgba-dev"
  exit 1
fi
mkdir -p "$HOME_DIR/bin"

# 1. dailyred at its pinned commit.
if [ ! -d "$SRC/.git" ]; then
  step "Fetching amoi-builds/dailyred @ ${DAILYRED_COMMIT:0:10}"
  git init -q "$SRC"
  git -C "$SRC" remote add origin "$DAILYRED_URL"
  git -C "$SRC" fetch -q --depth 1 origin "$DAILYRED_COMMIT"
  git -C "$SRC" checkout -q FETCH_HEAD
fi
mkdir -p "$TC/downloads"

# 2. ARM compiler (Linux build of the one dailyred uses on macOS), checked against its SHA-256.
if [ ! -x "$TC/arm-none-eabi/bin/arm-none-eabi-gcc" ]; then
  name="xpack-arm-none-eabi-gcc-$GCC_VER"
  tarball="$name-linux-x64.tar.gz"
  url="https://github.com/xpack-dev-tools/arm-none-eabi-gcc-xpack/releases/download/v$GCC_VER/$tarball"
  step "Downloading $tarball"
  wget -q -O "$TC/downloads/$tarball" "$url"
  wget -q -O "$TC/downloads/$tarball.sha" "$url.sha"
  expected="$(awk '{print $1}' "$TC/downloads/$tarball.sha")"
  actual="$(sha256sum "$TC/downloads/$tarball" | awk '{print $1}')"
  [ -n "$expected" ] && [ "$expected" = "$actual" ] || { echo "Checksum mismatch for $tarball"; exit 1; }
  tar -xzf "$TC/downloads/$tarball" -C "$TC"
  ln -sfn "$name" "$TC/arm-none-eabi"
  rm -f "$TC/downloads/$tarball"
fi

# 3. zlib and libpng, static, for the decompilation's image tools.
if [ ! -f "$TC/libpng/lib/libpng.a" ]; then
  step "Building zlib $ZLIB_VER and libpng $LIBPNG_VER"
  cd "$TC/downloads"
  wget -q -O zlib.tar.gz "https://github.com/madler/zlib/releases/download/v$ZLIB_VER/zlib-$ZLIB_VER.tar.gz"
  tar -xzf zlib.tar.gz
  (cd "zlib-$ZLIB_VER" && ./configure --static --prefix="$TC/libpng" >/dev/null && make -s >/dev/null && make -s install >/dev/null)
  wget -q -O libpng.tar.gz "https://github.com/pnggroup/libpng/archive/refs/tags/v$LIBPNG_VER.tar.gz"
  tar -xzf libpng.tar.gz
  src="$TC/downloads/libpng-$LIBPNG_VER"
  cp "$src/scripts/pnglibconf.h.prebuilt" "$src/pnglibconf.h"
  mkdir -p "$src/obj" "$TC/libpng/include" "$TC/libpng/lib"
  for f in png pngerror pngget pngmem pngpread pngread pngrio pngrtran pngrutil pngset pngtrans pngwio pngwrite pngwtran pngwutil; do
    cc -O2 -DPNG_ARM_NEON_OPT=0 -DPNG_INTEL_SSE_OPT=0 -I"$src" -I"$TC/libpng/include" -c "$src/$f.c" -o "$src/obj/$f.o"
  done
  ar rcs "$TC/libpng/lib/libpng.a" "$src"/obj/*.o
  cp "$src/png.h" "$src/pngconf.h" "$src/pnglibconf.h" "$TC/libpng/include/"
fi

export CPATH="$TC/libpng/include${CPATH:+:$CPATH}"
export LIBRARY_PATH="$TC/libpng/lib${LIBRARY_PATH:+:$LIBRARY_PATH}"
export PATH="$SRC/scripts/shims:$PATH"

# 4. pret/pokefirered + dailyred's patch, with dailyred's own script.
if [ ! -d "$GAME" ]; then
  step "Fetching pret/pokefirered and applying dailyred's patch"
  bash "$SRC/scripts/get-pokefirered.sh"
fi

# 5. The ROM. Static libpng on Linux needs -lm, so the two tools that link it are built first.
if [ ! -f "$GAME/pokefirered_modern.gba" ]; then
  for tool in gbagfx rsfont; do
    make -s -C "$GAME/tools/$tool" LIBS="-lpng -lz -lm" >/dev/null
  done
  step "Building the ROM (about 2 minutes)"
  bash "$SRC/scripts/build-rom.sh" > "$HOME_DIR/build.log" 2>&1 || { tail -20 "$HOME_DIR/build.log"; exit 1; }
fi

# 6. What the runner and the mod read.
step "Writing symbols, charmap and sprites"
cp "$GAME/pokefirered_modern.gba" "$HOME_DIR/dailyred.gba"
cp "$GAME/charmap.txt" "$HOME_DIR/charmap.txt"
"$TC/arm-none-eabi/bin/arm-none-eabi-nm" "$GAME/pokefirered_modern.elf" > "$HOME_DIR/nm.txt"
python3 -I "$MOD/scripts/symbols.py" "$GAME/pokefirered_modern.map" "$HOME_DIR/nm.txt" "$HOME_DIR/symbols.txt"
python3 -I "$MOD/scripts/sprites.py" "$GAME" "$HOME_DIR/sprites.json"

# 7. The runner.
if [ ! -f "$MOD/native/Makefile" ]; then
  echo "native/ missing: the runner is not built yet."
  exit 0
fi
step "Building the runner"
make -s -C "$MOD/native" OUT="$HOME_DIR/bin" >/dev/null
echo "DAILYRED-SETUP-OK"
```

- [ ] **Step 2: Run it end to end into a throwaway home** (downloads ~150 MB, ~3 minutes)

Run: `chmod +x mods/dailyred-dash/scripts/setup.sh && DAILYRED_HOME=/tmp/drtest bash mods/dailyred-dash/scripts/setup.sh`
Expected: ends with `native/ missing: the runner is not built yet.`; then
`ls /tmp/drtest` shows `bin charmap.txt dailyred.gba nm.txt sprites.json src symbols.txt`;
`grep -c . /tmp/drtest/symbols.txt` prints `26`;
`python3 -c "import json;d=json.load(open('/tmp/drtest/sprites.json'));print(len(d) > 380, len(d['6']['front']))"` prints `True 1024`.

- [ ] **Step 3: Run it again — every step skipped, same last line, under 10 seconds.**

- [ ] **Step 4: Commit**

```bash
git add mods/dailyred-dash/scripts/setup.sh
git commit -m "feat(dailyred-dash): one-time setup builds the Daily Red ROM, symbols and sprites"
```

---

### Task 3: Runner — boot, symbols, text, state JSON

**Files:**
- Create: `native/Makefile`, `native/symbols.h`, `native/symbols.c`, `native/text.h`, `native/text.c`, `native/test_text.c`, `native/game.h`, `native/game.c`, `native/control.h`, `native/control.c` (stub this task), `native/runner.c`
- Test: `native/test_text.c`, `tests/native/test_runner.py`

**Interfaces:**
- Produces (runner CLI): `runner --rom R --symbols S --charmap C --seed N [--daily] --commands F [--frames N] [--fast]`; stdout: one JSON object per line, printed when the state changes:
  `{"phase":"exploring|battle|result|finished","menu":"none|action|move|target|party","result":"none|won|lost","message":"…","player":Mon|null,"enemy":Mon|null,"party":[PartyMon…]}`
  `Mon = {"species":n,"name":s,"level":n,"hp":n,"maxHp":n,"types":[s…],"moves":[{"slot":1-4,"id":n,"name":s,"pp":n,"maxPp":n,"power":n,"type":s,"effect":0|5|10|20|40}]}`
  (`effect` = effectiveness × 10 against the other side's active Pokémon; 40 = 4×, 2.5 rounds down to 2)
  `PartyMon = {"slot":1-6,"species":n,"name":s,"level":n,"hp":n,"maxHp":n,"active":bool}`
  Errors: one line on stderr, exit 1.

- [ ] **Step 1: Makefile**

```make
# Builds the runner against the system libmgba (sudo apt install libmgba-dev).
OUT ?= .
CFLAGS ?= -O2 -Wall -Wextra -std=c11
SRCS = runner.c symbols.c text.c game.c control.c

all: $(OUT)/runner

$(OUT)/runner: $(SRCS) symbols.h text.h game.h control.h
	$(CC) $(CFLAGS) -o $@ $(SRCS) -lmgba

test: test_text.c text.c text.h
	$(CC) $(CFLAGS) -o test_text test_text.c text.c && ./test_text && rm -f test_text

.PHONY: all test
```

- [ ] **Step 2: Write the failing text test** (`native/test_text.c`)

```c
// Checks text.c against a small charmap: plain glyphs, line breaks, a control code with arguments.
#include "text.h"
#include <assert.h>
#include <stdio.h>
#include <string.h>

int main(void) {
	FILE* f = fopen("test_charmap.txt", "w");
	fputs("' '         = 00\n'A'         = BB\n'B'         = BC\n'!'         = AB\n'\\''        = B4\n'é'         = 1B\n'\\n' = FE @ new line\n", f);
	fclose(f);
	assert(text_load_charmap("test_charmap.txt") == 6);

	char out[64];
	const uint8_t plain[] = { 0xBB, 0x00, 0xBC, 0xAB, 0xFF, 0xBB };
	text_decode(plain, sizeof plain, out, sizeof out);
	assert(strcmp(out, "A B!") == 0);

	// FE is a line break; FC 01 xx is a color code (2 bytes after FC) and is skipped.
	const uint8_t codes[] = { 0xBB, 0xFE, 0xBC, 0xFC, 0x01, 0x02, 0xB4, 0x1B, 0xFF };
	text_decode(codes, sizeof codes, out, sizeof out);
	assert(strcmp(out, "A B'é") == 0);

	remove("test_charmap.txt");
	puts("text: ok");
	return 0;
}
```

- [ ] **Step 3: Run it — expect FAIL** (`text.h: No such file or directory`)

Run: `make -C mods/dailyred-dash/native test`

- [ ] **Step 4: Implement `text.h` / `text.c`**

```c
// FireRed's text encoding, decoded with the decompilation's charmap.txt.
#pragma once
#include <stddef.h>
#include <stdint.h>

// Loads charmap.txt's single-glyph entries (`'A' = BB`); returns how many, 0 when unreadable.
int text_load_charmap(const char* path);

// Decodes game text (up to `len` bytes, stopping at 0xFF) into UTF-8; `out` is always terminated.
// Line and paragraph breaks become one space; control codes are skipped with their arguments.
void text_decode(const uint8_t* game, size_t len, char* out, size_t outSize);
```

```c
#include "text.h"
#include <stdio.h>
#include <string.h>

// Each FC control code's length, the code byte included (GetExtCtrlCodeLength in string_util.c).
static const uint8_t CTRL_LENGTHS[] = { 1, 2, 2, 2, 4, 2, 2, 1, 2, 1, 1, 3, 2, 2, 2, 1, 3, 2, 2, 2, 2, 1, 1, 1, 1 };

static char sGlyphs[256][5];

int text_load_charmap(const char* path) {
	FILE* f = fopen(path, "r");
	if (!f) return 0;
	memset(sGlyphs, 0, sizeof sGlyphs);
	char line[256];
	int loaded = 0;
	while (fgets(line, sizeof line, f)) {
		if (line[0] != '\'') continue;
		char glyph[5] = { 0 };
		const char* p = line + 1;
		if (p[0] == '\\') {
			if (p[1] != '\'') continue; // '\n' and the like: handled as control bytes
			glyph[0] = '\'';
			p += 2;
		} else {
			size_t n = 0;
			while (*p && *p != '\'' && n < 4) glyph[n++] = *p++;
		}
		unsigned value;
		if (*p != '\'' || sscanf(p + 1, " = %x", &value) != 1 || value > 0xFF) continue;
		if (sGlyphs[value][0] == 0) {
			memcpy(sGlyphs[value], glyph, sizeof glyph);
			loaded++;
		}
	}
	fclose(f);
	return loaded;
}

void text_decode(const uint8_t* game, size_t len, char* out, size_t outSize) {
	size_t o = 0;
	for (size_t i = 0; i < len && game[i] != 0xFF && o + 5 < outSize; i++) {
		uint8_t c = game[i];
		if (c == 0xFC) {
			uint8_t code = i + 1 < len ? game[i + 1] : 0;
			i += code < sizeof CTRL_LENGTHS ? CTRL_LENGTHS[code] : 1;
			continue;
		}
		if (c == 0xFA || c == 0xFB || c == 0xFE) {
			if (o > 0 && out[o - 1] != ' ') out[o++] = ' ';
			continue;
		}
		size_t n = strlen(sGlyphs[c]);
		memcpy(out + o, sGlyphs[c], n);
		o += n;
	}
	out[o] = 0;
}
```

- [ ] **Step 5: Run it — expect `text: ok`**

Run: `make -C mods/dailyred-dash/native test`

- [ ] **Step 6: `symbols.h` / `symbols.c`**

```c
// The addresses the runner reads, from symbols.txt (written by scripts/symbols.py).
#pragma once
#include <stdbool.h>
#include <stdint.h>

struct Symbols {
	uint32_t battleMons, battlersCount, battleTypeFlags, displayedStringBattle, battlerPartyIndexes;
	uint32_t playerParty, enemyParty, playerPartyCount, enemyPartyCount, battleOutcome;
	uint32_t actionCursor, moveCursor, controllerFuncs, partyMenu;
	uint32_t speciesNames, moveNames, battleMoves, typeNames, typeEffectiveness;
	uint32_t romConfig, status;
	uint32_t chooseAction, chooseMove, chooseTarget, openParty, waitForMonSelection;
};

// Fills `out`. On failure returns false and points `missing` at the first name not found.
bool symbols_load(const char* path, struct Symbols* out, const char** missing);
```

```c
#include "symbols.h"
#include <stddef.h>
#include <stdio.h>
#include <string.h>

static const struct {
	const char* name;
	size_t field;
} FIELDS[] = {
	{ "gBattleMons", offsetof(struct Symbols, battleMons) },
	{ "gBattlersCount", offsetof(struct Symbols, battlersCount) },
	{ "gBattleTypeFlags", offsetof(struct Symbols, battleTypeFlags) },
	{ "gDisplayedStringBattle", offsetof(struct Symbols, displayedStringBattle) },
	{ "gBattlerPartyIndexes", offsetof(struct Symbols, battlerPartyIndexes) },
	{ "gPlayerParty", offsetof(struct Symbols, playerParty) },
	{ "gEnemyParty", offsetof(struct Symbols, enemyParty) },
	{ "gPlayerPartyCount", offsetof(struct Symbols, playerPartyCount) },
	{ "gEnemyPartyCount", offsetof(struct Symbols, enemyPartyCount) },
	{ "gBattleOutcome", offsetof(struct Symbols, battleOutcome) },
	{ "gActionSelectionCursor", offsetof(struct Symbols, actionCursor) },
	{ "gMoveSelectionCursor", offsetof(struct Symbols, moveCursor) },
	{ "gBattlerControllerFuncs", offsetof(struct Symbols, controllerFuncs) },
	{ "gPartyMenu", offsetof(struct Symbols, partyMenu) },
	{ "gSpeciesNames", offsetof(struct Symbols, speciesNames) },
	{ "gMoveNames", offsetof(struct Symbols, moveNames) },
	{ "gBattleMoves", offsetof(struct Symbols, battleMoves) },
	{ "gTypeNames", offsetof(struct Symbols, typeNames) },
	{ "gTypeEffectiveness", offsetof(struct Symbols, typeEffectiveness) },
	{ "gDailyRedRomConfig", offsetof(struct Symbols, romConfig) },
	{ "sStatus", offsetof(struct Symbols, status) },
	{ "HandleInputChooseAction", offsetof(struct Symbols, chooseAction) },
	{ "HandleInputChooseMove", offsetof(struct Symbols, chooseMove) },
	{ "HandleInputChooseTarget", offsetof(struct Symbols, chooseTarget) },
	{ "OpenPartyMenuToChooseMon", offsetof(struct Symbols, openParty) },
	{ "WaitForMonSelection", offsetof(struct Symbols, waitForMonSelection) },
};
#define FIELD(out, i) (*(uint32_t*) ((char*) (out) + FIELDS[i].field))

bool symbols_load(const char* path, struct Symbols* out, const char** missing) {
	memset(out, 0, sizeof *out);
	FILE* f = fopen(path, "r");
	if (!f) {
		*missing = path;
		return false;
	}
	char name[128];
	unsigned long value;
	while (fscanf(f, "%127s %lx", name, &value) == 2) {
		for (size_t i = 0; i < sizeof FIELDS / sizeof FIELDS[0]; i++) {
			if (strcmp(name, FIELDS[i].name) == 0) FIELD(out, i) = (uint32_t) value;
		}
	}
	fclose(f);
	for (size_t i = 0; i < sizeof FIELDS / sizeof FIELDS[0]; i++) {
		if (FIELD(out, i) == 0) {
			*missing = FIELDS[i].name;
			return false;
		}
	}
	return true;
}
```

- [ ] **Step 7: `game.h` / `game.c`** — memory layout facts used (checked against the built ROM):
  `struct BattlePokemon` is 0x58 bytes: species u16 @0x00, moves u16[4] @0x0C, type1 @0x21, type2 @0x22, pp u8[4] @0x24, hp u16 @0x28, level u8 @0x2A, maxHP u16 @0x2C, nickname[11] @0x30, ppBonuses @0x3B.
  `struct Pokemon` (party) is 100 bytes: personality u32 @0, otId u32 @4, nickname[10] @8, secure 48 bytes @32 (encrypted), level u8 @84, hp u16 @86, maxHP u16 @88.
  `gBattleMoves` records are 12 bytes: power @1, type @2, pp @4 (index 1 = Pound, power 40). `gTypeNames` 7 bytes each, `gSpeciesNames` 11, `gMoveNames` 13.
  `gTypeEffectiveness`: triples (attack, defense, ×10), one row per defending type; 0xFE row skipped, 0xFF ends.
  `sStatus`: phase u8 @20, result u8 @21. `gPartyMenu.slotId` s8 @9. Function pointers compare with bit 0 cleared.

```c
// Reads the battle out of the game's memory and writes it as one JSON object.
#pragma once
#include <mgba/core/core.h>
#include <stddef.h>
#include "symbols.h"

enum Phase { PHASE_EXPLORING, PHASE_BATTLE, PHASE_RESULT, PHASE_FINISHED };
enum Menu { MENU_NONE, MENU_ACTION, MENU_MOVE, MENU_TARGET, MENU_PARTY };

struct Game {
	struct mCore* core;
	const struct Symbols* sym;
};

enum Phase game_phase(const struct Game* g);
int game_result(const struct Game* g); // 0 none, 1 won, 2 lost
enum Menu game_menu(const struct Game* g);
int game_action_cursor(const struct Game* g); // 0 FIGHT, 1 BAG, 2 POKéMON, 3 RUN (2x2, row-major)
int game_move_cursor(const struct Game* g);   // 0-3 (2x2, row-major)
int game_party_slot(const struct Game* g);    // 0-5, 6+ = CANCEL
int game_move_count(const struct Game* g);    // the player's active Pokémon's moves
int game_party_count(const struct Game* g);
size_t game_state_json(const struct Game* g, char* out, size_t outSize);
```

```c
#include "game.h"
#include "text.h"
#include <stdbool.h>
#include <stdio.h>
#include <string.h>

#define MON_SIZE 0x58
#define PARTY_SIZE 100

static uint32_t r8(const struct Game* g, uint32_t a) { return g->core->busRead8(g->core, a); }
static uint32_t r16(const struct Game* g, uint32_t a) { return g->core->busRead16(g->core, a); }
static uint32_t r32(const struct Game* g, uint32_t a) { return g->core->busRead32(g->core, a); }

static void read_text(const struct Game* g, uint32_t a, size_t len, char* out, size_t outSize) {
	uint8_t raw[512];
	if (len > sizeof raw) len = sizeof raw;
	for (size_t i = 0; i < len; i++) raw[i] = (uint8_t) r8(g, a + i);
	text_decode(raw, len, out, outSize);
}

enum Phase game_phase(const struct Game* g) { return (enum Phase) r8(g, g->sym->status + 20); }
int game_result(const struct Game* g) { return (int) r8(g, g->sym->status + 21); }

enum Menu game_menu(const struct Game* g) {
	uint32_t f = r32(g, g->sym->controllerFuncs) & ~1u;
	if (f == (g->sym->chooseAction & ~1u)) return MENU_ACTION;
	if (f == (g->sym->chooseMove & ~1u)) return MENU_MOVE;
	if (f == (g->sym->chooseTarget & ~1u)) return MENU_TARGET;
	if (f == (g->sym->openParty & ~1u) || f == (g->sym->waitForMonSelection & ~1u)) return MENU_PARTY;
	return MENU_NONE;
}

int game_action_cursor(const struct Game* g) { return (int) r8(g, g->sym->actionCursor); }
int game_move_cursor(const struct Game* g) { return (int) r8(g, g->sym->moveCursor); }
int game_party_slot(const struct Game* g) { return (int) (int8_t) r8(g, g->sym->partyMenu + 9); }
int game_party_count(const struct Game* g) { return (int) r8(g, g->sym->playerPartyCount); }

int game_move_count(const struct Game* g) {
	int n = 0;
	for (int i = 0; i < 4; i++) n += r16(g, g->sym->battleMons + 0x0C + 2 * i) != 0;
	return n;
}

// The table has one row per (attacking type, defending type); a dual-typed defender matches two rows.
static int effectiveness(const struct Game* g, int moveType, int t1, int t2) {
	int mult = 10;
	for (uint32_t a = g->sym->typeEffectiveness;; a += 3) {
		int atk = (int) r8(g, a), def = (int) r8(g, a + 1), m = (int) r8(g, a + 2);
		if (atk == 0xFF) break;
		if (atk == 0xFE) continue;
		if (atk == moveType && (def == t1 || (t2 != t1 && def == t2))) mult = mult * m / 10;
	}
	return mult;
}

// Escapes `s` for a JSON string.
static void json_string(const char* s, char* out, size_t outSize) {
	size_t o = 0;
	for (; *s && o + 3 < outSize; s++) {
		if (*s == '"' || *s == '\\') out[o++] = '\\';
		out[o++] = *s;
	}
	out[o] = 0;
}

static size_t mon_json(const struct Game* g, int battler, char* out, size_t outSize) {
	uint32_t m = g->sym->battleMons + MON_SIZE * battler;
	uint32_t foe = g->sym->battleMons + MON_SIZE * (battler ^ 1);
	if (r16(g, m) == 0) return (size_t) snprintf(out, outSize, "null");
	char name[64], esc[96], typeA[16], typeB[16];
	read_text(g, m + 0x30, 11, name, sizeof name);
	json_string(name, esc, sizeof esc);
	int t1 = (int) r8(g, m + 0x21), t2 = (int) r8(g, m + 0x22);
	int f1 = (int) r8(g, foe + 0x21), f2 = (int) r8(g, foe + 0x22);
	read_text(g, g->sym->typeNames + 7 * t1, 7, typeA, sizeof typeA);
	read_text(g, g->sym->typeNames + 7 * t2, 7, typeB, sizeof typeB);
	size_t o = (size_t) snprintf(out, outSize,
		"{\"species\":%u,\"name\":\"%s\",\"level\":%u,\"hp\":%u,\"maxHp\":%u,\"types\":[\"%s\"%s%s%s],\"moves\":[",
		r16(g, m), esc, r8(g, m + 0x2A), r16(g, m + 0x28), r16(g, m + 0x2C), typeA,
		t2 != t1 ? ",\"" : "", t2 != t1 ? typeB : "", t2 != t1 ? "\"" : "");
	int written = 0;
	uint32_t bonuses = r8(g, m + 0x3B);
	for (int i = 0; i < 4 && o < outSize; i++) {
		uint32_t id = r16(g, m + 0x0C + 2 * i);
		if (id == 0) continue;
		uint32_t rec = g->sym->battleMoves + 12 * id;
		uint32_t base = r8(g, rec + 4), bonus = (bonuses >> (2 * i)) & 3;
		int type = (int) r8(g, rec + 2);
		char move[64], moveEsc[96], typeName[16];
		read_text(g, g->sym->moveNames + 13 * id, 13, move, sizeof move);
		json_string(move, moveEsc, sizeof moveEsc);
		read_text(g, g->sym->typeNames + 7 * type, 7, typeName, sizeof typeName);
		o += (size_t) snprintf(out + o, outSize - o,
			"%s{\"slot\":%d,\"id\":%u,\"name\":\"%s\",\"pp\":%u,\"maxPp\":%u,\"power\":%u,\"type\":\"%s\",\"effect\":%d}",
			written++ ? "," : "", i + 1, id, moveEsc, r8(g, m + 0x24 + i), base + base * bonus / 5, r8(g, rec + 1),
			typeName, effectiveness(g, type, f1, f2));
	}
	o += (size_t) snprintf(out + o, outSize - o, "]}");
	return o;
}

// A party Pokémon's species sits in its encrypted Growth substructure.
static uint32_t party_species(const struct Game* g, uint32_t p) {
	static const char* ORDERS[24] = { "GAEM", "GAME", "GEAM", "GEMA", "GMAE", "GMEA", "AGEM", "AGME", "AEGM",
		"AEMG", "AMGE", "AMEG", "EGAM", "EGMA", "EAGM", "EAMG", "EMGA", "EMAG", "MGAE", "MGEA", "MAGE", "MAEG",
		"MEGA", "MEAG" };
	uint32_t personality = r32(g, p), key = personality ^ r32(g, p + 4);
	int growth = (int) (strchr(ORDERS[personality % 24], 'G') - ORDERS[personality % 24]);
	return (r32(g, p + 32 + 12 * growth) ^ key) & 0xFFFF;
}

size_t game_state_json(const struct Game* g, char* out, size_t outSize) {
	static const char* PHASES[] = { "exploring", "battle", "result", "finished" };
	static const char* MENUS[] = { "none", "action", "move", "target", "party" };
	static const char* RESULTS[] = { "none", "won", "lost" };
	enum Phase phase = game_phase(g);
	int result = game_result(g);
	char message[512], esc[768];
	read_text(g, g->sym->displayedStringBattle, 300, message, sizeof message);
	json_string(message, esc, sizeof esc);
	bool battle = phase == PHASE_BATTLE;
	size_t o = (size_t) snprintf(out, outSize, "{\"phase\":\"%s\",\"menu\":\"%s\",\"result\":\"%s\",\"message\":\"%s\",\"player\":",
		PHASES[phase <= PHASE_FINISHED ? phase : 0], MENUS[battle ? game_menu(g) : MENU_NONE],
		RESULTS[result <= 2 ? result : 0], battle ? esc : "");
	o += battle ? mon_json(g, 0, out + o, outSize - o) : (size_t) snprintf(out + o, outSize - o, "null");
	o += (size_t) snprintf(out + o, outSize - o, ",\"enemy\":");
	o += battle ? mon_json(g, 1, out + o, outSize - o) : (size_t) snprintf(out + o, outSize - o, "null");
	o += (size_t) snprintf(out + o, outSize - o, ",\"party\":[");
	int count = battle ? game_party_count(g) : 0;
	uint32_t active = r16(g, g->sym->battlerPartyIndexes);
	for (int i = 0; i < count && i < 6; i++) {
		uint32_t p = g->sym->playerParty + PARTY_SIZE * i;
		char name[64], nameEsc[96];
		read_text(g, p + 8, 10, name, sizeof name);
		json_string(name, nameEsc, sizeof nameEsc);
		o += (size_t) snprintf(out + o, outSize - o,
			"%s{\"slot\":%d,\"species\":%u,\"name\":\"%s\",\"level\":%u,\"hp\":%u,\"maxHp\":%u,\"active\":%s}",
			i ? "," : "", i + 1, party_species(g, p), nameEsc, r8(g, p + 84), r16(g, p + 86), r16(g, p + 88),
			(uint32_t) i == active ? "true" : "false");
	}
	o += (size_t) snprintf(out + o, outSize - o, "]}");
	return o;
}
```

- [ ] **Step 8: `control.h` / `control.c` stub** (filled in Tasks 4–5)

```c
// Turns commands and automation into GBA button presses, one decision every few frames.
#pragma once
#include <stdint.h>
#include "game.h"

struct Control;
struct Control* control_new(const char* commandsPath);
// Called once per frame; returns the buttons to hold this frame (GBA key bits).
uint32_t control_frame(struct Control* c, const struct Game* g);
// True while automation runs (walking, battle text): the runner may run faster.
int control_is_automating(const struct Control* c, const struct Game* g);
```

```c
#include "control.h"
#include <stdlib.h>

struct Control {
	const char* commandsPath;
};

struct Control* control_new(const char* commandsPath) {
	struct Control* c = calloc(1, sizeof *c);
	c->commandsPath = commandsPath;
	return c;
}

uint32_t control_frame(struct Control* c, const struct Game* g) {
	(void) c;
	(void) g;
	return 0;
}

int control_is_automating(const struct Control* c, const struct Game* g) {
	(void) c;
	(void) g;
	return 0;
}
```

- [ ] **Step 9: `runner.c`**

```c
// dailyred-dash runner: boots the Daily Red ROM headless with libmgba, prints the battle as JSON
// lines and presses buttons for the mod's commands. See ../README.md.
//
//   runner --rom R --symbols S --charmap C --seed N [--daily] --commands F [--frames N] [--fast]
#include <mgba-util/vfs.h>
#include <mgba/core/core.h>
#include <mgba/core/log.h>
#include <stdbool.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <time.h>
#include "control.h"
#include "game.h"
#include "symbols.h"
#include "text.h"

#define FRAME_NS 16742706L
#define FAST_FACTOR 4
#define JSON_EVERY 6

static void quiet(struct mLogger* l, int c, enum mLogLevel v, const char* f, va_list a) {
	(void) l; (void) c; (void) v; (void) f; (void) a;
}

static void fail(const char* message, const char* detail) {
	fprintf(stderr, "%s%s%s\n", message, detail ? ": " : "", detail ? detail : "");
	exit(1);
}

static const char* arg(int argc, char** argv, const char* name) {
	for (int i = 1; i + 1 < argc; i++) if (strcmp(argv[i], name) == 0) return argv[i + 1];
	return NULL;
}

static bool flag(int argc, char** argv, const char* name) {
	for (int i = 1; i < argc; i++) if (strcmp(argv[i], name) == 0) return true;
	return false;
}

// Reads the ROM and fills the config struct dailyred's website fills (rom-config.js):
// after the magic, u32 seed, u16 wins, u16 battles, u8 daily.
static uint8_t* load_rom(const char* path, uint32_t configAddress, uint32_t seed, bool daily, size_t* size) {
	FILE* f = fopen(path, "rb");
	if (!f) fail("cannot read the ROM", path);
	fseek(f, 0, SEEK_END);
	*size = (size_t) ftell(f);
	fseek(f, 0, SEEK_SET);
	uint8_t* rom = malloc(*size);
	if (fread(rom, 1, *size, f) != *size) fail("cannot read the ROM", path);
	fclose(f);
	size_t offset = configAddress - 0x08000000u;
	if (offset + 25 > *size || memcmp(rom + offset, "DAILYRED-CONF-V2", 16) != 0) {
		fail("this ROM has no Daily Red config; re-run /dailyred setup", NULL);
	}
	uint8_t* c = rom + offset + 16;
	c[0] = seed & 0xFF; c[1] = (seed >> 8) & 0xFF; c[2] = (seed >> 16) & 0xFF; c[3] = seed >> 24;
	c[4] = c[5] = c[6] = c[7] = 0;
	c[8] = daily ? 1 : 0;
	return rom;
}

int main(int argc, char** argv) {
	const char* romPath = arg(argc, argv, "--rom");
	const char* symbolsPath = arg(argc, argv, "--symbols");
	const char* charmapPath = arg(argc, argv, "--charmap");
	const char* seedText = arg(argc, argv, "--seed");
	const char* commandsPath = arg(argc, argv, "--commands");
	if (!romPath || !symbolsPath || !charmapPath || !seedText || !commandsPath) {
		fail("usage: runner --rom R --symbols S --charmap C --seed N [--daily] --commands F [--frames N] [--fast]", NULL);
	}
	long frameLimit = arg(argc, argv, "--frames") ? atol(arg(argc, argv, "--frames")) : -1;
	bool fast = flag(argc, argv, "--fast");

	struct Symbols sym;
	const char* missing = NULL;
	if (!symbols_load(symbolsPath, &sym, &missing)) fail("symbol missing; re-run /dailyred setup", missing);
	if (text_load_charmap(charmapPath) == 0) fail("cannot read the charmap", charmapPath);

	static struct mLogger logger = { .log = quiet };
	mLogSetDefaultLogger(&logger);
	size_t size;
	uint8_t* rom = load_rom(romPath, sym.romConfig, (uint32_t) strtoul(seedText, NULL, 10), flag(argc, argv, "--daily"), &size);
	struct VFile* vf = VFileMemChunk(rom, size);
	free(rom);
	struct mCore* core = mCoreFindVF(vf);
	if (!core || !core->init(core)) fail("cannot start mGBA", NULL);
	mCoreInitConfig(core, NULL);
	static color_t video[240 * 160];
	core->setVideoBuffer(core, video, 240);
	if (!core->loadROM(core, vf)) fail("mGBA refused the ROM", NULL);
	core->reset(core);

	struct Game game = { core, &sym };
	struct Control* control = control_new(commandsPath);
	static char json[16384], last[16384];
	struct timespec next;
	clock_gettime(CLOCK_MONOTONIC, &next);
	for (long frame = 0; frameLimit < 0 || frame < frameLimit; frame++) {
		core->setKeys(core, control_frame(control, &game));
		core->runFrame(core);
		if (frame % JSON_EVERY == 0) {
			game_state_json(&game, json, sizeof json);
			if (strcmp(json, last) != 0) {
				puts(json);
				fflush(stdout);
				strcpy(last, json);
			}
		}
		if (fast) continue;
		long step = control_is_automating(control, &game) ? FRAME_NS / FAST_FACTOR : FRAME_NS;
		next.tv_nsec += step;
		while (next.tv_nsec >= 1000000000L) { next.tv_sec++; next.tv_nsec -= 1000000000L; }
		clock_nanosleep(CLOCK_MONOTONIC, TIMER_ABSTIME, &next, NULL);
	}
	core->deinit(core);
	return 0;
}
```

- [ ] **Step 10: Write the runner test** (`tests/native/test_runner.py`) — skipped unless setup ran:

```python
"""Runs the native runner against the built ROM. Needs $DAILYRED_HOME (default ~/.claude/dailyred) set up."""
import json
import os
import pathlib
import subprocess
import tempfile
import unittest

HOME = pathlib.Path(os.environ.get('DAILYRED_HOME', pathlib.Path.home() / '.claude/dailyred'))
NATIVE = pathlib.Path(__file__).resolve().parents[2] / 'native'
SEED = 4075659768  # dailyred's dailySeed('2026-10-11')


def run(frames, commands=None, seed=SEED, daily=True):
    """Builds the runner from native/ and returns the JSON states it printed."""
    with tempfile.TemporaryDirectory() as tmp:
        subprocess.run(['make', '-s', '-C', str(NATIVE), f'OUT={tmp}'], check=True)
        cmd_file = pathlib.Path(tmp) / 'commands'
        cmd_file.write_text(commands or '')
        argv = [f'{tmp}/runner', '--rom', str(HOME / 'dailyred.gba'), '--symbols', str(HOME / 'symbols.txt'),
                '--charmap', str(HOME / 'charmap.txt'), '--seed', str(seed), '--commands', str(cmd_file),
                '--frames', str(frames), '--fast'] + (['--daily'] if daily else [])
        out = subprocess.run(argv, check=True, capture_output=True, text=True, timeout=300)
        return [json.loads(line) for line in out.stdout.splitlines()]


@unittest.skipUnless((HOME / 'dailyred.gba').exists(), 'run scripts/setup.sh first')
class BootTest(unittest.TestCase):
    def test_boots_onto_the_summit(self):
        states = run(1200)
        self.assertGreater(len(states), 0)
        self.assertEqual(states[-1]['phase'], 'exploring')
        self.assertIsNone(states[-1]['player'])


if __name__ == '__main__':
    unittest.main()
```

- [ ] **Step 11: Run — expect PASS**

Run: `cd mods/dailyred-dash && DAILYRED_HOME=/tmp/drtest python3 -m unittest tests/native/test_runner.py -v`
Expected: `test_boots_onto_the_summit ... ok`.

- [ ] **Step 12: Commit**

```bash
git add mods/dailyred-dash/native mods/dailyred-dash/tests/native/test_runner.py
git commit -m "feat(dailyred-dash): runner boots Daily Red and prints its state as JSON"
```

---

### Task 4: Runner — walk to RED and battle text automation

**Files:**
- Modify: `native/control.c` (no signature change)
- Test: `tests/native/test_runner.py` (add `BattleTest`)

**Interfaces:**
- Produces: with no commands, the runner reaches `phase: battle` with `menu: action` and both `player`/`enemy` filled, within 3600 frames from boot.

- [ ] **Step 1: Failing test** — add to `test_runner.py`:

```python
@unittest.skipUnless((HOME / 'dailyred.gba').exists(), 'run scripts/setup.sh first')
class BattleTest(unittest.TestCase):
    def test_walks_to_red_and_waits_at_the_action_menu(self):
        states = run(3600)
        waiting = [s for s in states if s['phase'] == 'battle' and s['menu'] == 'action']
        self.assertTrue(waiting, 'never reached the action menu')
        first = waiting[0]
        self.assertTrue(first['player']['name'])
        self.assertTrue(first['enemy']['name'])
        self.assertEqual(first['enemy']['level'], 100)
        self.assertEqual(len(first['party']), 6)
        self.assertTrue(any(p['active'] for p in first['party']))
        self.assertTrue(all(1 <= m['slot'] <= 4 for m in first['player']['moves']))
```

- [ ] **Step 2: Run — expect FAIL** (`never reached the action menu`; the stub presses nothing).

- [ ] **Step 3: Find the walk.** Write and run this probe once (throwaway, not committed) to learn how many Up presses reach RED:

```bash
cd mods/dailyred-dash/native
cat > /tmp/probe.c <<'EOF'
#include "game.h"
#include "symbols.h"
#include "text.h"
#include <mgba-util/vfs.h>
#include <stdio.h>
#include <stdlib.h>
// Presses Up N times (one press = 16 frames, held 8), then A every 30 frames; reports when the phase turns battle.
int main(int argc, char** argv) {
	(void) argc;
	struct Symbols s; const char* missing; symbols_load(argv[2], &s, &missing); text_load_charmap(argv[3]);
	FILE* f = fopen(argv[1], "rb"); fseek(f, 0, SEEK_END); size_t n = ftell(f); fseek(f, 0, SEEK_SET);
	unsigned char* rom = malloc(n); if (fread(rom, 1, n, f) != n) return 2; fclose(f);
	unsigned char* c = rom + (s.romConfig - 0x08000000u) + 16; c[0] = 0xF8; c[1] = 0x6A; c[2] = 0xEC; c[3] = 0xF2; c[8] = 1;
	struct VFile* vf = VFileMemChunk(rom, n); struct mCore* core = mCoreFindVF(vf); core->init(core); mCoreInitConfig(core, NULL);
	static color_t v[240 * 160]; core->setVideoBuffer(core, v, 240); core->loadROM(core, vf); core->reset(core);
	struct Game g = { core, &s }; int ups = atoi(argv[4]);
	for (long fr = 0; fr < 6000; fr++) {
		long t = fr - 400; uint32_t keys = 0;
		if (t >= 0 && t < ups * 16) keys = (t % 16) < 8 ? 64 : 0; else if (t >= ups * 16 && t % 30 < 4) keys = 1;
		core->setKeys(core, keys); core->runFrame(core);
		if (game_phase(&g) == PHASE_BATTLE) { printf("ups=%d battle at frame %ld\n", ups, fr); return 0; }
	}
	printf("ups=%d no battle\n", ups); return 1;
}
EOF
cc -O2 -I. -o /tmp/probe /tmp/probe.c symbols.c text.c game.c -lmgba
for u in 2 3 4 5 6 7 8; do /tmp/probe "$DAILYRED_HOME/dailyred.gba" "$DAILYRED_HOME/symbols.txt" "$DAILYRED_HOME/charmap.txt" $u; done
```

(`0xF2EC6AF8` = 4075659768, the test seed, little-endian.) Take the **smallest** `ups` that reaches battle as `WALK_UPS` below. If none does, the player is not lined up with RED: repeat with a Left/Right press before the Ups and add that step to `explore()`.

- [ ] **Step 4: Implement automation in `control.c`**

```c
#include "control.h"
#include <stdlib.h>

#define KEY_A 1u
#define KEY_UP 64u
#define BOOT_FRAMES 400   // logo and fade-in before the player can move
#define WALK_UPS 4        // from the probe in Step 3: Up presses from the start tile to RED
#define PRESS_FRAMES 16   // one d-pad step: held 8 frames, released 8
#define TEXT_EVERY 20     // battle text and talking: A once every this many frames

struct Control {
	const char* commandsPath;
	long frame;
	long walkStart; // first frame of the walk; -1 until exploring is seen
};

struct Control* control_new(const char* commandsPath) {
	struct Control* c = calloc(1, sizeof *c);
	c->commandsPath = commandsPath;
	c->walkStart = -1;
	return c;
}

// Exploring: walk up to RED, then talk until the battle starts. Each new run (practice mode warps
// back to the start after a battle) walks again.
static uint32_t explore(struct Control* c) {
	if (c->walkStart < 0) c->walkStart = c->frame < BOOT_FRAMES ? BOOT_FRAMES : c->frame;
	long t = c->frame - c->walkStart;
	if (t < 0) return 0;
	if (t < WALK_UPS * PRESS_FRAMES) return t % PRESS_FRAMES < PRESS_FRAMES / 2 ? KEY_UP : 0;
	return t % TEXT_EVERY < 4 ? KEY_A : 0;
}

uint32_t control_frame(struct Control* c, const struct Game* g) {
	c->frame++;
	enum Phase phase = game_phase(g);
	if (phase == PHASE_EXPLORING) return explore(c);
	c->walkStart = -1;
	// Battle text, the result and RED's closing words: A through them; never while a choice is open.
	if (phase == PHASE_BATTLE && game_menu(g) != MENU_NONE) return 0;
	return c->frame % TEXT_EVERY < 4 ? KEY_A : 0;
}

int control_is_automating(const struct Control* c, const struct Game* g) {
	(void) c;
	return game_phase(g) != PHASE_BATTLE || game_menu(g) == MENU_NONE;
}
```

- [ ] **Step 5: Run — expect PASS** (`BootTest` and `BattleTest`)

Run: `cd mods/dailyred-dash && DAILYRED_HOME=/tmp/drtest python3 -m unittest tests/native/test_runner.py -v`

- [ ] **Step 6: Check effectiveness by hand** — print the first battle state and compare each move's `effect` with a type chart for the enemy's types (e.g. FIRE vs GRASS = `20`, ELECTRIC vs GROUND = `0`). A wrong value means the table walk is off: print the matching rows and fix `effectiveness()`.

Run (from `mods/dailyred-dash`): `DAILYRED_HOME=/tmp/drtest python3 -c "import sys;sys.path.insert(0,'tests/native');import test_runner as t;s=[x for x in t.run(3600) if x['menu']=='action'][0];print(s['enemy']['types'],[(m['name'],m['type'],m['effect']) for m in s['player']['moves']])"`

- [ ] **Step 7: Commit**

```bash
git add mods/dailyred-dash/native/control.c mods/dailyred-dash/tests/native/test_runner.py
git commit -m "feat(dailyred-dash): runner walks to RED and clicks through battle text"
```

---

### Task 5: Runner — the person's commands

**Files:**
- Modify: `native/control.c`
- Test: `tests/native/test_runner.py` (add `CommandTest`)

**Interfaces:**
- Consumes: the commands file — the mod overwrites it with one line `<seq> <command> [n]`; a new `seq` replaces any command still in progress. Commands: `move <1-4>`, `switch <1-6>`, `advance`.
- Produces: `move n` from the action menu ends with the battle continuing (menu leaves `action`); `switch n` from the action menu, or from the forced-switch party menu, sends out party slot n.

- [ ] **Step 1: Failing tests** — add to `test_runner.py`:

```python
@unittest.skipUnless((HOME / 'dailyred.gba').exists(), 'run scripts/setup.sh first')
class CommandTest(unittest.TestCase):
    def test_move_one_attacks(self):
        states = run(6000, commands='1 move 1\n')
        first = next(i for i, s in enumerate(states) if s['menu'] == 'action')
        after = states[first + 1:]
        self.assertTrue(any(s['menu'] == 'none' for s in after), 'the move was never chosen')
        hp0 = states[first]['enemy']['hp']
        self.assertTrue(any(s['enemy'] and s['enemy']['hp'] != hp0 for s in after) or
                        any('used' in s['message'] for s in after))

    def test_switch_sends_out_another_pokemon(self):
        states = run(6000, commands='1 switch 2\n')
        first = next(s for s in states if s['menu'] == 'action')
        name2 = next(p['name'] for p in first['party'] if p['slot'] == 2)
        self.assertTrue(any(s['player'] and s['player']['name'] == name2 for s in states), f'{name2} never came out')
```

- [ ] **Step 2: Run — expect both to FAIL** (commands are ignored).

- [ ] **Step 3: Implement commands in `control.c`** — the full file after this step:

```c
#include "control.h"
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#define KEY_A 1u
#define KEY_B 2u
#define KEY_RIGHT 16u
#define KEY_LEFT 32u
#define KEY_UP 64u
#define KEY_DOWN 128u
#define BOOT_FRAMES 400
#define WALK_UPS 4          // keep the value Task 4's probe found
#define PRESS_FRAMES 16
#define TEXT_EVERY 20
#define DECIDE_EVERY 10     // frames between steps of a command: a press, then the game reacts
#define TAP_FRAMES 4
#define COMMAND_TIMEOUT 1800

enum Kind { CMD_NONE, CMD_MOVE, CMD_SWITCH, CMD_ADVANCE };

struct Control {
	const char* commandsPath;
	long frame;
	long walkStart;
	unsigned long seq;
	enum Kind kind;
	int target;
	long started;
	int confirming;
	uint32_t tapKeys;
	int tapLeft;
};

struct Control* control_new(const char* commandsPath) {
	struct Control* c = calloc(1, sizeof *c);
	c->commandsPath = commandsPath;
	c->walkStart = -1;
	return c;
}

static uint32_t explore(struct Control* c) {
	if (c->walkStart < 0) c->walkStart = c->frame < BOOT_FRAMES ? BOOT_FRAMES : c->frame;
	long t = c->frame - c->walkStart;
	if (t < 0) return 0;
	if (t < WALK_UPS * PRESS_FRAMES) return t % PRESS_FRAMES < PRESS_FRAMES / 2 ? KEY_UP : 0;
	return t % TEXT_EVERY < 4 ? KEY_A : 0;
}

static void read_command(struct Control* c) {
	FILE* f = fopen(c->commandsPath, "r");
	if (!f) return;
	unsigned long seq = 0;
	char word[16] = "";
	int n = 0;
	int got = fscanf(f, "%lu %15s %d", &seq, word, &n);
	fclose(f);
	if (got < 2 || seq == c->seq) return;
	c->seq = seq;
	c->kind = strcmp(word, "move") == 0 ? CMD_MOVE : strcmp(word, "switch") == 0 ? CMD_SWITCH :
		strcmp(word, "advance") == 0 ? CMD_ADVANCE : CMD_NONE;
	c->target = n - 1;
	c->started = c->frame;
	c->confirming = 0;
}

static void tap(struct Control* c, uint32_t keys) {
	c->tapKeys = keys;
	c->tapLeft = TAP_FRAMES;
}

// One 2x2 grid step from cursor `from` toward `to` (0 1 / 2 3), or A when there.
static uint32_t grid_step(int from, int to) {
	if (from == to) return KEY_A;
	if ((from & 1) != (to & 1)) return (to & 1) ? KEY_RIGHT : KEY_LEFT;
	return to > from ? KEY_DOWN : KEY_UP;
}

static void command_step(struct Control* c, const struct Game* g) {
	if (c->kind == CMD_NONE) return;
	if (c->frame - c->started > COMMAND_TIMEOUT) {
		c->kind = CMD_NONE;
		return;
	}
	enum Menu menu = game_menu(g);
	switch (c->kind) {
	case CMD_ADVANCE:
		tap(c, KEY_A);
		c->kind = CMD_NONE;
		break;
	case CMD_MOVE:
		if (c->target < 0 || c->target >= game_move_count(g)) {
			c->kind = CMD_NONE;
		} else if (menu == MENU_ACTION) {
			tap(c, grid_step(game_action_cursor(g), 0));
		} else if (menu == MENU_MOVE) {
			uint32_t key = grid_step(game_move_cursor(g), c->target);
			tap(c, key);
			if (key == KEY_A) c->kind = CMD_NONE;
		} else if (menu == MENU_TARGET) {
			tap(c, KEY_A);
		}
		break;
	case CMD_SWITCH:
		if (c->target < 0 || c->target >= game_party_count(g)) {
			c->kind = CMD_NONE;
		} else if (menu == MENU_ACTION) {
			tap(c, grid_step(game_action_cursor(g), 2));
		} else if (menu == MENU_MOVE) {
			tap(c, KEY_B);
		} else if (menu == MENU_PARTY) {
			if (c->confirming) {
				// The slot's submenu is up: its first item (SHIFT / SEND OUT) is under the cursor.
				tap(c, KEY_A);
				c->kind = CMD_NONE;
			} else if (game_party_slot(g) != c->target) {
				tap(c, KEY_DOWN);
			} else {
				tap(c, KEY_A);
				c->confirming = 1;
			}
		}
		break;
	default:
		break;
	}
}

uint32_t control_frame(struct Control* c, const struct Game* g) {
	c->frame++;
	if (c->tapLeft > 0) {
		c->tapLeft--;
		return c->tapKeys;
	}
	if (c->frame % 4 == 0) read_command(c);
	enum Phase phase = game_phase(g);
	if (phase == PHASE_EXPLORING) return explore(c);
	c->walkStart = -1;
	if (phase == PHASE_BATTLE && game_menu(g) != MENU_NONE) {
		if (c->frame % DECIDE_EVERY == 0) command_step(c, g);
		return 0;
	}
	return c->frame % TEXT_EVERY < 4 ? KEY_A : 0;
}

int control_is_automating(const struct Control* c, const struct Game* g) {
	(void) c;
	return game_phase(g) != PHASE_BATTLE || game_menu(g) == MENU_NONE;
}
```

- [ ] **Step 4: Add the end-to-end battle test** to `CommandTest` (the runner picks up each new seq while it runs):

```python
    def test_a_full_battle_ends_with_a_result(self):
        with tempfile.TemporaryDirectory() as tmp:
            subprocess.run(['make', '-s', '-C', str(NATIVE), f'OUT={tmp}'], check=True)
            cmd = pathlib.Path(tmp) / 'commands'
            cmd.write_text('')
            proc = subprocess.Popen([f'{tmp}/runner', '--rom', str(HOME / 'dailyred.gba'),
                                     '--symbols', str(HOME / 'symbols.txt'), '--charmap', str(HOME / 'charmap.txt'),
                                     '--seed', str(SEED), '--daily', '--commands', str(cmd),
                                     '--frames', '200000', '--fast'], stdout=subprocess.PIPE, text=True)
            seq, result = 0, None
            for line in proc.stdout:
                s = json.loads(line)
                if s['menu'] == 'action':
                    usable = [m['slot'] for m in s['player']['moves'] if m['pp'] > 0] or [1]
                    seq += 1
                    cmd.write_text(f'{seq} move {usable[0]}\n')
                elif s['menu'] == 'party':
                    alive = [p['slot'] for p in s['party'] if p['hp'] > 0 and not p['active']]
                    seq += 1
                    cmd.write_text(f'{seq} switch {alive[0]}\n')
                if s['result'] != 'none':
                    result = s['result']
                    break
            proc.kill()
            self.assertIn(result, ('won', 'lost'))
```

- [ ] **Step 5: Run — expect PASS** (all of `test_runner.py`; the full battle takes a few minutes at `--fast`)

Run: `cd mods/dailyred-dash && DAILYRED_HOME=/tmp/drtest python3 -m unittest tests/native/test_runner.py -v`

  If `test_switch_sends_out_another_pokemon` fails with the party menu open and the cursor on the right slot, the submenu's first item is not under the cursor: print `game_party_slot` and the message while it runs, and add the needed `KEY_UP`/`KEY_DOWN` before the confirming A.

- [ ] **Step 6: Commit**

```bash
git add mods/dailyred-dash/native/control.c mods/dailyred-dash/tests/native/test_runner.py
git commit -m "feat(dailyred-dash): runner takes move, switch and advance commands"
```

---

### Task 6: Mod core — seed, stats, state parsing, autoplayer, sprites

**Files:**
- Create: `types/index.d.ts`, `hooks/seed.ts`, `hooks/stats.ts`, `hooks/state.ts`, `hooks/autoplay.ts`, `hooks/sprites.ts`, `tests/fixtures.ts`
- Test: `tests/seed.test.ts`, `tests/stats.test.ts`, `tests/state.test.ts`, `tests/autoplay.test.ts`, `tests/sprites.test.ts`

**Interfaces:**
- Produces:
  - `types`: `MoveInfo`, `Mon`, `PartyMon`, `Phase`, `Menu`, `BattleState`, `Screen` (below)
  - `today(now: Date): string`, `dailySeed(date: string): number`
  - `Stats`, `DayRecord`, `EMPTY_STATS`, `parseStats(v: unknown): Stats`, `recordAttempt(s, date): Stats`, `recordWin(s, date): Stats`, `dayStreak(s, today): number`, `previousDay(date): string`
  - `parseStateLine(line: string): BattleState | null`
  - `chooseMove(mon: Mon, random: () => number): number | null`
  - `SpriteSheet`, `parseSpriteSheet(text: string): SpriteSheet`, `spriteCells(sheet, species, side): { cells: string; columns: number; rows: number } | null`

- [ ] **Step 1: `types/index.d.ts`**

```ts
export type MoveInfo = { slot: number; id: number; name: string; pp: number; maxPp: number; power: number; type: string; effect: number }
export type Mon = { species: number; name: string; level: number; hp: number; maxHp: number; types: string[]; moves: MoveInfo[] }
export type PartyMon = { slot: number; species: number; name: string; level: number; hp: number; maxHp: number; active: boolean }
export type Phase = 'exploring' | 'battle' | 'result' | 'finished'
export type Menu = 'none' | 'action' | 'move' | 'target' | 'party'
export type BattleState = {
  phase: Phase
  menu: Menu
  result: 'none' | 'won' | 'lost'
  message: string
  player: Mon | null
  enemy: Mon | null
  party: PartyMon[]
}
// What the pane shows: a card (setup needed, starting, an error, a result) or a battle.
export type Screen =
  | { kind: 'card'; title: string; lines: string[]; keys: string[] }
  | { kind: 'battle'; mode: 'daily' | 'demo'; state: BattleState; picking: 'moves' | 'party' }

declare module 'claude-code' {
  interface PluginState {
    'dailyred-dash': { screen: Screen; footer: string }
  }
}
```

- [ ] **Step 2: Failing tests**

`tests/seed.test.ts`:

```ts
import { describe, expect, test } from 'claude-code/testing'
import { dailySeed, today } from '../hooks/seed'

describe('the daily seed', () => {
  // Values from dailyred's own web/daily.js for the same dates.
  test('matches dailyred for known dates', () => {
    expect(dailySeed('2026-10-11')).toBe(4075659768)
    expect(dailySeed('2026-10-12')).toBe(4125992625)
    expect(dailySeed('2026-01-01')).toBe(886997947)
  })
  test('today is the local calendar date', () => {
    expect(today(new Date(2026, 0, 5, 23, 59))).toBe('2026-01-05')
  })
})
```

`tests/stats.test.ts`:

```ts
import { describe, expect, test } from 'claude-code/testing'
import { dayStreak, EMPTY_STATS, parseStats, previousDay, recordAttempt, recordWin } from '../hooks/stats'

describe('per-day stats', () => {
  test('counts attempts and a win for the day the attempt started', () => {
    let s = recordAttempt(EMPTY_STATS, '2026-10-11')
    s = recordAttempt(s, '2026-10-11')
    // The battle began on the 11th and ended after midnight: the win still belongs to the 11th.
    s = recordWin(s, '2026-10-11')
    expect(s.days['2026-10-11']).toEqual({ attempts: 2, won: true })
    expect(s.days['2026-10-12']).toBeUndefined()
  })
  test('does not change the stats it was given', () => {
    recordAttempt(EMPTY_STATS, '2026-10-11')
    expect(EMPTY_STATS.days).toEqual({})
  })
  test('the streak counts won days back from today, or from yesterday before today is won', () => {
    let s = EMPTY_STATS
    for (const d of ['2026-10-08', '2026-10-09', '2026-10-10']) s = recordWin(recordAttempt(s, d), d)
    expect(dayStreak(s, '2026-10-10')).toBe(3)
    expect(dayStreak(s, '2026-10-11')).toBe(3)
    expect(dayStreak(recordAttempt(s, '2026-10-11'), '2026-10-11')).toBe(3)
    expect(dayStreak(s, '2026-10-12')).toBe(0)
  })
  test('a lost day breaks the streak', () => {
    let s = recordWin(recordAttempt(EMPTY_STATS, '2026-10-09'), '2026-10-09')
    s = recordAttempt(s, '2026-10-10')
    expect(dayStreak(s, '2026-10-11')).toBe(0)
  })
  test('previous day crosses months and years', () => {
    expect(previousDay('2026-03-01')).toBe('2026-02-28')
    expect(previousDay('2026-01-01')).toBe('2025-12-31')
  })
  test('junk in the store reads as empty stats', () => {
    expect(parseStats(undefined)).toEqual(EMPTY_STATS)
    expect(parseStats({ days: { '2026-10-11': { attempts: 'x' } } })).toEqual(EMPTY_STATS)
  })
})
```

`tests/fixtures.ts`:

```ts
import type { BattleState, Mon } from '../types'

export const venusaur: Mon = {
  species: 3, name: 'VENUSAUR', level: 100, hp: 301, maxHp: 364, types: ['GRASS', 'POISON'],
  moves: [
    { slot: 1, id: 76, name: 'SOLARBEAM', pp: 10, maxPp: 10, power: 120, type: 'GRASS', effect: 5 },
    { slot: 2, id: 79, name: 'SLEEP POWDER', pp: 15, maxPp: 15, power: 0, type: 'GRASS', effect: 5 },
    { slot: 3, id: 202, name: 'GIGA DRAIN', pp: 0, maxPp: 5, power: 60, type: 'GRASS', effect: 5 },
  ],
}
export const charizard: Mon = {
  species: 6, name: 'CHARIZARD', level: 100, hp: 241, maxHp: 360, types: ['FIRE', 'FLYING'],
  moves: [{ slot: 1, id: 53, name: 'FLAMETHROWER', pp: 15, maxPp: 15, power: 95, type: 'FIRE', effect: 20 }],
}
export const atAction: BattleState = {
  phase: 'battle', menu: 'action', result: 'none', message: 'What will VENUSAUR do?',
  player: venusaur, enemy: charizard,
  party: [
    { slot: 1, species: 3, name: 'VENUSAUR', level: 100, hp: 301, maxHp: 364, active: true },
    { slot: 2, species: 9, name: 'BLASTOISE', level: 100, hp: 0, maxHp: 362, active: false },
    { slot: 3, species: 65, name: 'ALAKAZAM', level: 100, hp: 251, maxHp: 251, active: false },
  ],
}
```

`tests/state.test.ts`:

```ts
import { describe, expect, test } from 'claude-code/testing'
import { parseStateLine } from '../hooks/state'
import { atAction } from './fixtures'

describe('reading a runner line', () => {
  test('a valid line becomes a state', () => {
    expect(parseStateLine(JSON.stringify(atAction))).toEqual(atAction)
  })
  test('a line outside a battle has no Pokémon', () => {
    const line = '{"phase":"exploring","menu":"none","result":"none","message":"","player":null,"enemy":null,"party":[]}'
    expect(parseStateLine(line)?.player).toBeNull()
  })
  test('broken or foreign lines are refused', () => {
    expect(parseStateLine('not json')).toBeNull()
    expect(parseStateLine('{"phase":"lunch"}')).toBeNull()
    expect(parseStateLine(JSON.stringify({ ...atAction, menu: 'bag' }))).toBeNull()
  })
})
```

`tests/autoplay.test.ts`:

```ts
import { describe, expect, test } from 'claude-code/testing'
import { chooseMove } from '../hooks/autoplay'
import { venusaur } from './fixtures'

describe('the demo autoplayer', () => {
  test('picks the hardest-hitting usable move', () => {
    expect(chooseMove(venusaur, () => 0.99)).toBe(1) // SOLARBEAM: 120 x 0.5; GIGA DRAIN has no PP
  })
  test('sometimes picks a random usable move, never one without PP', () => {
    const picks = new Set([0.0, 0.05, 0.1, 0.15].map(r => chooseMove(venusaur, () => r)))
    expect(picks.has(3)).toBe(false)
    expect([...picks].every(p => p === 1 || p === 2)).toBe(true)
  })
  test('no usable move: null', () => {
    expect(chooseMove({ ...venusaur, moves: venusaur.moves.map(m => ({ ...m, pp: 0 })) }, () => 0.5)).toBeNull()
  })
})
```

`tests/sprites.test.ts`:

```ts
import { describe, expect, test } from 'claude-code/testing'
import { parseSpriteSheet, spriteCells } from '../hooks/sprites'

// Decodes standard base64, to read the cells back.
function bytes(base64: string): Uint8Array {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'
  const clean = base64.replace(/[^A-Za-z0-9+/]/g, '')
  const out = new Uint8Array(Math.floor((clean.length * 3) / 4))
  let o = 0
  for (let i = 0; i < clean.length; i += 4) {
    const n = (alphabet.indexOf(clean[i]!) << 18) | (alphabet.indexOf(clean[i + 1] ?? 'A') << 12)
      | (alphabet.indexOf(clean[i + 2] ?? 'A') << 6) | alphabet.indexOf(clean[i + 3] ?? 'A')
    if (o < out.length) out[o++] = (n >> 16) & 255
    if (o < out.length) out[o++] = (n >> 8) & 255
    if (o < out.length) out[o++] = n & 255
  }
  return out
}

// One species: palette color 1 red; the front is all color 1 except a transparent top row.
const sheet = parseSpriteSheet(JSON.stringify({
  '3': { palette: [0, 0xff0000, ...Array(14).fill(0)], front: '0'.repeat(32) + '1'.repeat(32 * 31), back: '0'.repeat(1024) },
}))

describe('sprites', () => {
  test('a front sprite is 32 columns by 16 rows of half blocks', () => {
    const s = spriteCells(sheet, 3, 'front')!
    expect(s.columns).toBe(32)
    expect(s.rows).toBe(16)
    const words = new Uint32Array(bytes(s.cells).buffer)
    expect(words.length).toBe(32 * 16 * 3)
    expect(words[0]).toBe(0x2584) // top pixel transparent: a lower half block, red below
    expect(words[1]).toBe(0xff0000)
  })
  test('an unknown species has no sprite', () => {
    expect(spriteCells(sheet, 999, 'front')).toBeNull()
  })
})
```

- [ ] **Step 3: Run — expect FAIL** (modules missing)

Run: `claude plugin test mods/dailyred-dash`

- [ ] **Step 4: Implement**

`hooks/seed.ts`:

```ts
// The day's team seed, exactly as dailyred's web/daily.js computes it, so the team matches the website.

// A date in the local time zone, e.g. "2026-10-11".
export function today(now: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
}

// FNV-1a of "dailyred:<date>", never 0.
export function dailySeed(date: string): number {
  let hash = 0x811c9dc5
  for (const ch of `dailyred:${date}`) {
    hash ^= ch.charCodeAt(0)
    hash = Math.imul(hash, 0x01000193) >>> 0
  }
  return hash || 1
}
```

`hooks/stats.ts`:

```ts
// Per-day stats: attempts at RED and whether he was beaten, and the streak of days won.
export type DayRecord = { attempts: number; won: boolean }
export type Stats = { days: Record<string, DayRecord> }

export const EMPTY_STATS: Stats = { days: {} }

export function parseStats(value: unknown): Stats {
  const days = (value as { days?: unknown } | undefined)?.days
  if (typeof days !== 'object' || days === null) return EMPTY_STATS
  const entries = Object.entries(days as Record<string, unknown>)
  const valid = entries.every(([date, r]) => /^\d{4}-\d{2}-\d{2}$/.test(date)
    && typeof (r as DayRecord)?.attempts === 'number' && typeof (r as DayRecord)?.won === 'boolean')
  return valid ? { days: Object.fromEntries(entries) as Record<string, DayRecord> } : EMPTY_STATS
}

function day(stats: Stats, date: string): DayRecord {
  return stats.days[date] ?? { attempts: 0, won: false }
}

export function recordAttempt(stats: Stats, date: string): Stats {
  const d = day(stats, date)
  return { days: { ...stats.days, [date]: { ...d, attempts: d.attempts + 1 } } }
}

// `date` is the day the attempt started, so a battle won after midnight counts for its own day.
export function recordWin(stats: Stats, date: string): Stats {
  return { days: { ...stats.days, [date]: { ...day(stats, date), won: true } } }
}

export function previousDay(date: string): string {
  const d = new Date(`${date}T12:00:00`) // midday, so a DST change cannot skip a day
  d.setDate(d.getDate() - 1)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

// Days won in a row, ending today, or yesterday while today is not won yet.
export function dayStreak(stats: Stats, today: string): number {
  let date = stats.days[today]?.won ? today : previousDay(today)
  let streak = 0
  while (stats.days[date]?.won) {
    streak++
    date = previousDay(date)
  }
  return streak
}
```

`hooks/state.ts`:

```ts
// One runner stdout line → a BattleState, or null for anything that is not one.
import type { BattleState } from '../types'

const PHASES = ['exploring', 'battle', 'result', 'finished']
const MENUS = ['none', 'action', 'move', 'target', 'party']
const RESULTS = ['none', 'won', 'lost']

export function parseStateLine(line: string): BattleState | null {
  let v: Partial<BattleState>
  try {
    v = JSON.parse(line)
  } catch {
    return null
  }
  if (typeof v !== 'object' || v === null) return null
  if (!PHASES.includes(v.phase as string) || !MENUS.includes(v.menu as string)) return null
  if (!RESULTS.includes(v.result as string) || typeof v.message !== 'string' || !Array.isArray(v.party)) return null
  return v as BattleState
}
```

`hooks/autoplay.ts`:

```ts
// The demo's player: the usable move with the best power x effectiveness, or a random usable one 20% of the time.
import type { Mon } from '../types'

const RANDOM_SHARE = 0.2

export function chooseMove(mon: Mon, random: () => number): number | null {
  const usable = mon.moves.filter(m => m.pp > 0)
  if (usable.length === 0) return null
  const roll = random()
  if (roll < RANDOM_SHARE) return usable[Math.floor((roll / RANDOM_SHARE) * usable.length) % usable.length]!.slot
  return usable.reduce((best, m) => (m.power * m.effect > best.power * best.effect ? m : best)).slot
}
```

`hooks/sprites.ts`:

```ts
// The sprite sheet setup writes (sprites.json): 32x32 pixels per side, a hex digit each, 0 transparent.
// Drawn as half blocks: two pixels a cell, so 32 columns by 16 rows.
export type SpriteSheet = Record<string, { palette: number[]; front: string; back: string }>

const SIZE = 32
const UPPER_HALF = 0x2580
const LOWER_HALF = 0x2584
const DEFAULT = 0x01000000

export function parseSpriteSheet(text: string): SpriteSheet {
  return JSON.parse(text) as SpriteSheet
}

export function spriteCells(
  sheet: SpriteSheet, species: number, side: 'front' | 'back',
): { cells: string; columns: number; rows: number } | null {
  const entry = sheet[String(species)]
  if (!entry) return null
  const px = entry[side]
  const color = (x: number, y: number): number | null => {
    const c = parseInt(px[y * SIZE + x]!, 16)
    return c === 0 ? null : entry.palette[c]!
  }
  const words = new Uint32Array(SIZE * (SIZE / 2) * 3)
  for (let r = 0; r < SIZE / 2; r++) {
    for (let x = 0; x < SIZE; x++) {
      const upper = color(x, r * 2)
      const lower = color(x, r * 2 + 1)
      const i = (r * SIZE + x) * 3
      if (upper === null && lower === null) words.set([0x20, DEFAULT, DEFAULT], i)
      else if (upper === null) words.set([LOWER_HALF, lower!, DEFAULT], i)
      else words.set([UPPER_HALF, upper, lower ?? DEFAULT], i)
    }
  }
  const bytes = new Uint8Array(words.buffer) as unknown as { toBase64: () => string }
  return { cells: bytes.toBase64(), columns: SIZE, rows: SIZE / 2 }
}
```

- [ ] **Step 5: Run — expect PASS**

Run: `claude plugin test mods/dailyred-dash`

- [ ] **Step 6: Commit**

```bash
git add mods/dailyred-dash/types mods/dailyred-dash/hooks mods/dailyred-dash/tests
git commit -m "feat(dailyred-dash): seed, stats, state parsing, autoplayer and sprites"
```

---

### Task 7: The pane, the runner process and the keys

**Files:**
- Create: `hooks/hooks.json`, `hooks/view.tsx`, `hooks/register.tsx`
- Test: `tests/view.test.tsx`, `tests/session.test.tsx`

**Interfaces:**
- Consumes: everything from Task 6; the runner CLI from Task 3.
- Produces: `/dailyred [setup|stop]`; pane `dailyred`; hotkeys `1`–`6`, `s`, `j`, `r`; `$.store` key `stats` (a `Stats`).

- [ ] **Step 1: `hooks/hooks.json`**

```json
{ "modules": ["./register.tsx"] }
```

- [ ] **Step 2: Failing view test** (`tests/view.test.tsx`)

```tsx
import { describe, expect, test } from 'claude-code/testing'
import { atAction } from './fixtures'

const props = { title: 'DAILY RED', isFocused: true, bodyColumns: 64, placement: 'dock' as const, scroll: { offset: 0, bodyRows: 22 }, view: {} }

describe('the pane', () => {
  test('a battle shows both Pokémon, HP and the moves with their keys', async ($) => {
    await $.state.set({ plugin: 'dailyred-dash', key: 'screen' }, { kind: 'battle', mode: 'daily', state: atAction, picking: 'moves' })
    const ui = await $.ui.mount({ plugin: 'dailyred-dash', surface: 'terminal', component: 'Pane', requestId: 'dailyred', props })
    expect(await ui.find({ type: 'Text', text: /CHARIZARD/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /241\/360/ })).toBeDefined()
    expect(await ui.find({ type: 'Button', label: /SOLARBEAM/ })).toBeDefined()
    // GIGA DRAIN has no PP: drawn, but not as a pressable move.
    expect(await ui.find({ type: 'Button', label: /GIGA DRAIN/ })).toBeUndefined()
    expect(await ui.find({ type: 'Text', text: /GIGA DRAIN/ })).toBeDefined()
    await ui.unmount()
  })
  test('a card shows its lines', async ($) => {
    await $.state.set({ plugin: 'dailyred-dash', key: 'screen' }, { kind: 'card', title: 'DAILY RED', lines: ['Run /dailyred setup first.'], keys: [] })
    const ui = await $.ui.mount({ plugin: 'dailyred-dash', surface: 'terminal', component: 'Pane', requestId: 'dailyred', props })
    expect(await ui.find({ type: 'Text', text: /dailyred setup/ })).toBeDefined()
    await ui.unmount()
  })
})
```

  (`$.state.set` on the plugin's own key from a test: if the kit refuses writes from outside a hook, drive the same screens through Step 5's session tests instead and drop this file.)

- [ ] **Step 3: Run — expect FAIL**

Run: `claude plugin test mods/dailyred-dash`

- [ ] **Step 4: `hooks/view.tsx`** — the tree for a Screen; `onKey(key)` runs for a pressed hotkey.

```tsx
// The pane's drawing for each Screen: a card, or the battle with its sprites, HP bars, message and keys.
import type { Elements } from 'claude-code'
import type { BattleState, Mon, Screen } from '../types'
import type { SpriteSheet } from './sprites'
import { spriteCells } from './sprites'

type El = Elements['terminal']
const BAR = 16

function hpBar(mon: Mon): string {
  const filled = mon.maxHp > 0 ? Math.round((mon.hp / mon.maxHp) * BAR) : 0
  return '█'.repeat(filled) + '░'.repeat(BAR - filled)
}

function hpColor(mon: Mon): string {
  const share = mon.maxHp > 0 ? mon.hp / mon.maxHp : 0
  return share > 0.5 ? 'green' : share > 0.2 ? 'yellow' : 'red'
}

function monLine(els: El, mon: Mon, owner: string) {
  const { Box, Text } = els
  return (
    <Box flexDirection="column">
      <Text bold>{owner}{mon.name}  Lv{mon.level}</Text>
      <Text>HP <Text color={hpColor(mon)}>{hpBar(mon)}</Text> {mon.hp}/{mon.maxHp}</Text>
    </Box>
  )
}

function sprite(els: El, sheet: SpriteSheet | null, species: number, side: 'front' | 'back', key: string) {
  const { Raster, Box } = els
  const s = sheet ? spriteCells(sheet, species, side) : null
  return s && Raster ? <Raster key={key} columns={s.columns} rows={s.rows} cells={s.cells} /> : <Box width={32} height={16} />
}

function moves(els: El, state: BattleState, onKey: (k: string) => void) {
  const { Box, Text, Button } = els
  const choosing = state.menu === 'action' || state.menu === 'move'
  return (
    <Box flexDirection="row" flexWrap="wrap" columnGap={3}>
      {state.player!.moves.map(m => {
        const label = `${m.name} ${m.pp}/${m.maxPp}`
        return choosing && m.pp > 0
          ? <Button key={`move-${m.slot}`} plain hotkey={String(m.slot)} label={label} onPress={() => onKey(String(m.slot))} />
          : <Text key={`move-${m.slot}`} dimColor>{m.slot}: {label}</Text>
      })}
    </Box>
  )
}

function party(els: El, state: BattleState, onKey: (k: string) => void) {
  const { Box, Text, Button } = els
  return (
    <Box flexDirection="column">
      {state.party.map(p => (p.hp > 0 && !p.active
        ? <Button key={`party-${p.slot}`} plain hotkey={String(p.slot)} label={`${p.name} ${p.hp}/${p.maxHp}`} onPress={() => onKey(String(p.slot))} />
        : <Text key={`party-${p.slot}`} dimColor>{p.slot}: {p.name} {p.hp}/{p.maxHp}{p.active ? ' (out)' : ''}</Text>))}
    </Box>
  )
}

export function renderScreen(els: El, screen: Screen, footer: string, sheet: SpriteSheet | null, onKey: (k: string) => void) {
  const { Box, Text, Button } = els
  if (screen.kind === 'card') {
    return (
      <Box flexDirection="column">
        <Text bold color="red">{screen.title}</Text>
        {screen.lines.map((line, i) => <Text key={`line-${i}`}>{line}</Text>)}
        <Box flexDirection="row" columnGap={2}>
          {screen.keys.map(k => <Button key={`key-${k}`} plain hotkey={k} label={k === 'r' ? 'play' : k} onPress={() => onKey(k)} />)}
        </Box>
        <Text dimColor>{footer}</Text>
      </Box>
    )
  }
  const { state } = screen
  if (!state.player || !state.enemy) return <Text dimColor>{state.message || 'Climbing to RED...'}</Text>
  const pickParty = screen.picking === 'party' || state.menu === 'party'
  return (
    <Box flexDirection="column">
      <Box flexDirection="row" justifyContent="space-between">
        {monLine(els, state.enemy, "RED's ")}
        {sprite(els, sheet, state.enemy.species, 'front', 'enemy')}
      </Box>
      <Box flexDirection="row" columnGap={2}>
        {sprite(els, sheet, state.player.species, 'back', 'player')}
        {monLine(els, state.player, '')}
      </Box>
      <Text>{state.message}</Text>
      {pickParty ? party(els, state, onKey) : moves(els, state, onKey)}
      <Box flexDirection="row" columnGap={2}>
        {state.menu === 'action' && !pickParty && <Button key="key-s" plain hotkey="s" label="switch" onPress={() => onKey('s')} />}
        {state.menu === 'none' && <Button key="key-j" plain hotkey="j" label="next" onPress={() => onKey('j')} />}
        <Text dimColor>{screen.mode === 'demo' ? 'DEMO · press any key' : footer}</Text>
      </Box>
    </Box>
  )
}
```

- [ ] **Step 5: Failing session tests** (`tests/session.test.tsx`) — the runner is answered by the test's own `process.spawn` hook, which sits beneath the plugin and stands for the engine:

```tsx
import { describe, expect, mock, test } from 'claude-code/testing'
import { atAction } from './fixtures'

const exploring = '{"phase":"exploring","menu":"none","result":"none","message":"","player":null,"enemy":null,"party":[]}'
const PANE_PROPS = { title: 'DAILY RED', isFocused: true, bodyColumns: 64, placement: 'dock' as const, scroll: { offset: 0, bodyRows: 22 }, view: {} }

function fakeRunner(on: any, lines: string[], spawned: string[][]) {
  on('process.spawn', async function* (_$: unknown, e: { argv: string[] }) {
    spawned.push([...e.argv])
    for (const line of lines) yield { stream: 'stdout' as const, text: line + '\n' }
    return { code: 0, signal: null }
  })
}

describe('a daily session', () => {
  test('without setup, /dailyred says to run setup and starts nothing', async ($, on) => {
    mock.clock(on)
    const spawned: string[][] = []
    fakeRunner(on, [], spawned)
    on('fs.exists', () => ({ value: false }))
    await $.command.run({ command: 'dailyred' })
    const screen = await $.state.get({ plugin: 'dailyred-dash', key: 'screen' })
    expect(JSON.stringify(screen.value)).toContain('/dailyred setup')
    expect(spawned.length).toBe(0)
  })

  test('starts the runner with today\'s seed in daily mode and shows the battle', async ($, on) => {
    mock.clock(on)
    const spawned: string[][] = []
    fakeRunner(on, [exploring, JSON.stringify(atAction)], spawned)
    on('fs.exists', () => ({ value: true }))
    on('fs.read', () => ({ value: '{}' }))
    on('fs.write', () => ({ value: undefined }))
    await $.command.run({ command: 'dailyred' })
    expect(spawned[0]).toContain('--daily')
    expect(spawned[0]![spawned[0]!.indexOf('--seed') + 1]).toMatch(/^\d+$/)
  })

  test('no move is sent while no choice is open', async ($, on) => {
    mock.clock(on)
    const writes: string[] = []
    fakeRunner(on, [JSON.stringify({ ...atAction, menu: 'none' })], [])
    on('fs.exists', () => ({ value: true }))
    on('fs.read', () => ({ value: '{}' }))
    on('fs.write', (_$: unknown, e: { text: string }) => { writes.push(e.text); return { value: undefined } })
    await $.command.run({ command: 'dailyred' })
    const ui = await $.ui.mount({ plugin: 'dailyred-dash', surface: 'terminal', component: 'Pane', requestId: 'dailyred', props: PANE_PROPS })
    expect(await ui.find({ type: 'Button', label: /SOLARBEAM/ })).toBeUndefined()
    expect(writes.some(w => / move /.test(w))).toBe(false)
    await ui.unmount()
  })

  test('the runner ending mid-battle shows retry, and the attempt is counted once', async ($, on) => {
    mock.clock(on)
    fakeRunner(on, [JSON.stringify(atAction), JSON.stringify(atAction)], [])
    on('fs.exists', () => ({ value: true }))
    on('fs.read', () => ({ value: '{}' }))
    on('fs.write', () => ({ value: undefined }))
    await $.command.run({ command: 'dailyred' })
    const screen = await $.state.get({ plugin: 'dailyred-dash', key: 'screen' })
    expect(JSON.stringify(screen.value)).toContain('stopped')
    const stats = await $.store.get('stats') as { days: Record<string, { attempts: number }> }
    expect(Object.values(stats.days)[0]!.attempts).toBe(1)
  })
})
```

  (These tests need the session's background loop to settle before the asserts: if an assert runs too early, `await clock.advance(0)` after `$.command.run` lets the started work finish, per the kit's rule that `advance` resolves once the event loop settled. The exact answer shape for `fs.*` hooks is the engine's result type: read `FsExistsResult`/`FsReadResult` in the laid types if the kit rejects `{ value }`.)

- [ ] **Step 6: Run — expect FAIL**

- [ ] **Step 7: `hooks/register.tsx`**

```tsx
// dailyred-dash: Daily Red in a pane. /dailyred plays today's team against RED (unlimited retries),
// /dailyred setup builds what it needs, /dailyred stop ends a battle. After 15 idle minutes the pane
// plays demo battles with random teams. See ../README.md.
import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'
import type { BattleState, Screen } from '../types'
import { chooseMove } from './autoplay'
import { dailySeed, today } from './seed'
import type { SpriteSheet } from './sprites'
import { parseSpriteSheet } from './sprites'
import { parseStateLine } from './state'
import { dayStreak, parseStats, recordAttempt, recordWin } from './stats'
import { renderScreen } from './view'

const PANE = 'dailyred'
const TITLE = 'DAILY RED'
const IDLE_MS = 15 * 60 * 1000
const STALL_MS = 10_000

const screen = atom({ plugin: 'dailyred-dash', key: 'screen' } as const, { kind: 'card', title: TITLE, lines: [], keys: [] } as Screen)
const footer = atom({ plugin: 'dailyred-dash', key: 'footer' } as const, '')

type Paths = { runner: string; rom: string; symbols: string; charmap: string; sprites: string; commands: string }
type Session = { stop: boolean; mode: 'daily' | 'demo'; date: string; counted: boolean; won: boolean }

async function paths($: EngineInterface): Promise<Paths> {
  const home = (await $.env.get('DAILYRED_HOME')) ?? `${await $.env.get('HOME')}/.claude/dailyred`
  return {
    runner: `${home}/bin/runner`, rom: `${home}/dailyred.gba`, symbols: `${home}/symbols.txt`,
    charmap: `${home}/charmap.txt`, sprites: `${home}/sprites.json`, commands: `${home}/commands`,
  }
}

export const register: Register = on => {
  let session: Session | null = null
  let latest: BattleState | null = null
  let picking: 'moves' | 'party' = 'moves'
  let seq = 0
  let sheet: SpriteSheet | null = null
  let lastInput = 0
  let settingUp = false

  const send = async ($: EngineInterface, command: string) => {
    seq++
    await $.fs.write((await paths($)).commands, `${seq} ${command}\n`)
  }

  const showFooter = async ($: EngineInterface) => {
    const stats = parseStats(await $.store.get('stats'))
    const date = today(new Date(await $.clock.now()))
    const d = stats.days[date]
    const text = `${d?.won ? 'beaten today' : 'today'}: attempt ${d?.attempts ?? 0} · day streak ${dayStreak(stats, date)}`
    await update($, footer, () => text)
  }

  const card = async ($: EngineInterface, lines: string[], keys: string[]) => {
    await update($, screen, () => ({ kind: 'card', title: TITLE, lines, keys }) as Screen)
  }

  // Applies one runner state: counts the attempt once, records a win, drives a demo, updates the pane.
  const follow = async ($: EngineInterface, s: Session, state: BattleState) => {
    latest = state
    if (state.menu === 'party') picking = 'party'
    else if (state.menu !== 'action') picking = 'moves'
    if (s.mode === 'daily' && !s.counted && state.phase === 'battle') {
      s.counted = true
      await $.store.set('stats', recordAttempt(parseStats(await $.store.get('stats')), s.date))
      await showFooter($)
    }
    if (s.mode === 'daily' && state.result === 'won' && !s.won) {
      s.won = true
      await $.store.set('stats', recordWin(parseStats(await $.store.get('stats')), s.date))
      await showFooter($)
    }
    if (s.mode === 'demo' && state.player) {
      if (state.menu === 'action') {
        const slot = chooseMove(state.player, Math.random)
        if (slot !== null) await send($, `move ${slot}`)
      } else if (state.menu === 'party') {
        const next = state.party.find(p => p.hp > 0 && !p.active)
        if (next) await send($, `switch ${next.slot}`)
      }
    }
    if (s.mode === 'daily' && state.result !== 'none') {
      await card($, [state.result === 'won' ? 'You beat RED!' : 'Your team was wiped out.', 'Press r to try today\'s team again.'], ['r'])
      return
    }
    await update($, screen, () => ({ kind: 'battle', mode: s.mode, state, picking }) as Screen)
  }

  // One battle session: spawns the runner and follows its lines until it ends or is stopped.
  const play = async ($: EngineInterface, mode: 'daily' | 'demo') => {
    const p = await paths($)
    for (const file of [p.runner, p.rom, p.symbols, p.charmap]) {
      if (!(await $.fs.exists(file))) {
        await card($, ['Daily Red is not set up yet.', 'Run /dailyred setup (about 2 minutes, once).'], [])
        return
      }
    }
    if (!sheet && (await $.fs.exists(p.sprites))) sheet = parseSpriteSheet(await $.fs.read(p.sprites) as string)
    const date = today(new Date(await $.clock.now()))
    const seed = mode === 'daily' ? dailySeed(date) : 1 + Math.floor(Math.random() * 0xfffffffe)
    const mine: Session = { stop: false, mode, date, counted: false, won: false }
    if (session) session.stop = true
    session = mine
    latest = null
    picking = 'moves'
    await $.fs.write(p.commands, '')
    await card($, [mode === 'daily' ? 'Climbing to RED...' : 'DEMO'], [])
    const argv = [p.runner, '--rom', p.rom, '--symbols', p.symbols, '--charmap', p.charmap, '--seed', String(seed),
      '--commands', p.commands, ...(mode === 'daily' ? ['--daily'] : [])]
    let buffer = ''
    let lastLine = await $.clock.now()
    let error = ''
    const watchdog = $.clock.every(1000, async () => {
      if ((await $.clock.now()) - lastLine > STALL_MS) {
        mine.stop = true
        error = 'no response for 10 seconds'
      }
    })
    try {
      for await (const { stream, text } of $.process.spawn({ argv })) {
        if (mine.stop) break
        if (stream === 'stderr') {
          error = text.trim().split('\n').at(-1) ?? error
          continue
        }
        buffer += text
        let nl = buffer.indexOf('\n')
        while (nl >= 0) {
          const state = parseStateLine(buffer.slice(0, nl))
          buffer = buffer.slice(nl + 1)
          lastLine = await $.clock.now()
          if (state && !mine.stop) await follow($, mine, state)
          nl = buffer.indexOf('\n')
        }
      }
    } catch (e) {
      error = e instanceof Error ? e.message : String(e)
    } finally {
      watchdog()
    }
    if (session !== mine) return
    session = null
    if (latest?.result === 'won' || latest?.result === 'lost') return
    if (!mine.stop || error) await card($, [`The game stopped${error ? `: ${error}` : '.'}`, 'Press r to try again.'], ['r'])
  }

  // A hotkey from the pane: acts only when the matching choice is open.
  const press = async ($: EngineInterface, key: string) => {
    lastInput = await $.clock.now()
    if (session?.mode === 'demo') {
      session.stop = true
      await card($, ['Demo stopped.', 'Press r to play today\'s team.'], ['r'])
      return
    }
    if (key === 'r') return void play($, 'daily')
    const state = latest
    if (!state || state.phase !== 'battle') return
    if (key === 'j' && state.menu === 'none') return send($, 'advance')
    if (key === 's' && state.menu === 'action') {
      picking = 'party'
      return update($, screen, () => ({ kind: 'battle', mode: 'daily', state, picking }) as Screen)
    }
    const n = Number(key)
    if (!Number.isInteger(n) || n < 1) return
    if (picking === 'party' || state.menu === 'party') {
      const target = state.party.find(p => p.slot === n)
      if (target && target.hp > 0 && !target.active) {
        picking = 'moves'
        return send($, `switch ${n}`)
      }
      return
    }
    const move = state.player?.moves.find(m => m.slot === n)
    if ((state.menu === 'action' || state.menu === 'move') && move && move.pp > 0) return send($, `move ${n}`)
  }

  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'dailyred', description: 'Battle RED with today\'s Daily Red team', argumentHint: '[setup|stop]' })
    lastInput = await $.clock.now()
    $.clock.every(60_000, async () => {
      if (session || settingUp || (await $.clock.now()) - lastInput < IDLE_MS) return
      if (!(await $.ui.open({ id: PANE, title: TITLE })).isPlaced) return
      void play($, 'demo')
    })
    return next(e)
  })

  on('command.run', { command: 'dailyred' }, async ($, e) => {
    lastInput = await $.clock.now()
    const arg = e.args.trim()
    if (arg === 'stop') {
      if (session) session.stop = true
      return { text: 'Daily Red stopped.' }
    }
    await $.ui.open({ id: PANE, title: TITLE, focus: true })
    if (arg === 'setup') {
      if (session) session.stop = true
      settingUp = true
      void (async () => {
        let last = ''
        try {
          await card($, ['Setting up Daily Red (about 2 minutes)...'], [])
          for await (const { text } of $.process.spawn({ argv: ['bash', `${$.plugin.root}/scripts/setup.sh`] })) {
            last = text.trim().split('\n').at(-1) ?? last
            await card($, ['Setting up Daily Red...', last], [])
          }
        } finally {
          settingUp = false
        }
        await card($, last.includes('DAILYRED-SETUP-OK') ? ['Ready.', 'Press r to play today\'s team.'] : ['Setup failed:', last], ['r'])
      })()
      return { text: 'Daily Red setup started; progress is in the pane.' }
    }
    await showFooter($)
    void play($, 'daily')
    return { text: 'Daily Red: focus the pane (ctrl+x tab) — 1-4 moves, s switch, j next, r retry.' }
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const els = $.ui.resolve(e)
    return renderScreen(els, await read($, screen), await read($, footer), sheet, key => void press($, key))
  })
}
```

- [ ] **Step 8: Run — expect PASS** (view + session + Task 6 tests), and validate

Run: `claude plugin test mods/dailyred-dash && claude plugin validate mods/dailyred-dash`

- [ ] **Step 9: Commit**

```bash
git add mods/dailyred-dash/hooks mods/dailyred-dash/tests
git commit -m "feat(dailyred-dash): battle pane, runner session, keys and per-day stats"
```

---

### Task 8: Attract mode

**Files:**
- Modify: `hooks/register.tsx` only if the tests find a problem (the timer is in Task 7)
- Test: `tests/attract.test.tsx`

- [ ] **Step 1: Tests**

```tsx
import { describe, expect, mock, test } from 'claude-code/testing'
import { atAction } from './fixtures'

function fakeRunner(on: any, spawned: string[][]) {
  on('process.spawn', async function* (_$: unknown, e: { argv: string[] }) {
    spawned.push([...e.argv])
    yield { stream: 'stdout' as const, text: JSON.stringify(atAction) + '\n' }
    return { code: 0, signal: null }
  })
}

function setUp(on: any) {
  on('fs.exists', () => ({ value: true }))
  on('fs.read', () => ({ value: '{}' }))
  on('fs.write', () => ({ value: undefined }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
}

describe('attract mode', () => {
  test('starts a demo after 15 idle minutes, with a random seed and no daily flag', async ($, on) => {
    const clock = mock.clock(on)
    const spawned: string[][] = []
    fakeRunner(on, spawned)
    setUp(on)
    await clock.advance(14 * 60 * 1000)
    expect(spawned.length).toBe(0)
    await clock.advance(2 * 60 * 1000)
    expect(spawned.length).toBe(1)
    expect(spawned[0]).not.toContain('--daily')
  })
  test('a demo never touches the stats', async ($, on) => {
    const clock = mock.clock(on)
    fakeRunner(on, [])
    setUp(on)
    await clock.advance(16 * 60 * 1000)
    expect(await $.store.get('stats')).toBeUndefined()
  })
  test('a command resets the idle time', async ($, on) => {
    const clock = mock.clock(on)
    const spawned: string[][] = []
    fakeRunner(on, spawned)
    setUp(on)
    await clock.advance(10 * 60 * 1000)
    await $.command.run({ command: 'dailyred', args: 'stop' })
    await clock.advance(10 * 60 * 1000)
    expect(spawned.length).toBe(0)
  })
})
```

- [ ] **Step 2: Run — expect PASS**; fix `register.tsx` for any failure.

Run: `claude plugin test mods/dailyred-dash`

- [ ] **Step 3: Commit**

```bash
git add mods/dailyred-dash/tests/attract.test.tsx mods/dailyred-dash/hooks/register.tsx
git commit -m "test(dailyred-dash): attract mode starts after 15 idle minutes and never counts"
```

---

### Task 9: README, marketplace entry, live acceptance

**Files:**
- Create: `mods/dailyred-dash/README.md`
- Modify: `.claude-plugin/marketplace.json`, `README.md` (repo root)

- [ ] **Step 1: `mods/dailyred-dash/README.md`**

```markdown
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
```

- [ ] **Step 2: Marketplace entry** — add to `.claude-plugin/marketplace.json` `plugins`:

```json
{ "name": "dailyred-dash", "source": "./mods/dailyred-dash", "description": "Daily Red in a pane: battle RED with today's team on the real FireRed engine (builds the game locally; see its README)" }
```

  and a row in the root README's table:
  `| [dailyred-dash](mods/dailyred-dash) | Ryan | Daily Red (by amoi-builds) battles in a pane, on the real FireRed engine |`

- [ ] **Step 3: Validate everything**

Run: `claude plugin validate . && claude plugin test mods/dailyred-dash && make -C mods/dailyred-dash/native test && (cd mods/dailyred-dash && python3 -m unittest discover -s tests/native -v)`
Expected: all pass (runner tests need setup done).

- [ ] **Step 4: Live acceptance (manual, in Windows Terminal)**
  1. `claude plugin marketplace update claude-mods && claude plugin install dailyred-dash@claude-mods`, `/reload-plugins`
  2. `/dailyred setup` → pane ends with "Ready."
  3. `/dailyred` → walks to RED, battle appears; names, HP and moves readable at the normal font.
  4. `1`–`4` attack, `s` + slot switches, a lost battle offers `r`, retry shows "attempt 2".
  5. Leave the pane alone 15 minutes → a demo runs; a key stops it.
  Record any failure as a new task before declaring done.

- [ ] **Step 5: Commit**

```bash
git add mods/dailyred-dash/README.md .claude-plugin/marketplace.json README.md
git commit -m "docs(dailyred-dash): README, credits and marketplace entry"
```
