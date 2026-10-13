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
