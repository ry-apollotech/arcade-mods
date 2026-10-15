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

# 1. dailyred at its pinned commit. A checkout with no commit is a fetch that failed: start it again.
if ! git -C "$SRC" rev-parse -q --verify HEAD >/dev/null 2>&1; then
  step "Fetching amoi-builds/dailyred @ ${DAILYRED_COMMIT:0:10}"
  rm -rf "$SRC"
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

# 4. pret/pokefirered + dailyred's patch, with dailyred's own script. It is done once the patch applied
# (the marker) or a ROM was built from it; anything else is a fetch that failed, started again.
if [ ! -f "$GAME/.dailyred-dash-ready" ] && [ ! -f "$GAME/pokefirered_modern.gba" ]; then
  step "Fetching pret/pokefirered and applying dailyred's patch"
  rm -rf "$GAME"
  bash "$SRC/scripts/get-pokefirered.sh"
  touch "$GAME/.dailyred-dash-ready"
fi

# 4b. dailyred-dash's own change to the game: competitive movesets. A ROM built before it is rebuilt.
if ! grep -q "AssignCompetitiveMoves" "$GAME/src/dailyred_team.c"; then
  step "Applying competitive movesets"
  patch -s -p1 -d "$GAME" < "$MOD/patches/competitive-moves.patch"
  rm -f "$GAME/pokefirered_modern.gba"
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
