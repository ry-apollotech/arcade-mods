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
