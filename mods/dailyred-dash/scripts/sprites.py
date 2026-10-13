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
