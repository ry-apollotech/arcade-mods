"""Checks the built ROM only gives the player final evolutions, per patches/final-evolutions.patch.
Reads the teams from the real game through the runner, and the evolution table from the decomp.
Needs $DAILYRED_HOME (default ~/.claude/dailyred) set up."""
import re
import unittest

from test_movesets import GAME, constants
from test_runner import HOME, run

SEEDS = [4075659768, 1, 2, 3, 123456789, 42, 2026, 777]


def evolving_species():
    """Every species with at least one evolution in src/data/pokemon/evolution.h."""
    text = (GAME / 'src/data/pokemon/evolution.h').read_text()
    return set(re.findall(r'\[SPECIES_(\w+)\]\s*=\s*\{\s*\{\s*EVO_', text))


@unittest.skipUnless((HOME / 'dailyred.gba').exists() and GAME.exists(), 'run scripts/setup.sh first')
class FinalEvolutionTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        names = {}
        for k, v in constants('include/constants/species.h', 'SPECIES_').items():
            names.setdefault(v, k)
        cls.evolving = evolving_species()
        cls.teams = []
        for seed in SEEDS:
            # The last line at the action menu, as in test_movesets: earlier reads can catch the lead mid-rewrite.
            settled = [s for s in run(3600, seed=seed, daily=False) if s['menu'] == 'action'][-1]
            cls.teams.append([names[p['species']] for p in settled['party']])

    def test_the_evolution_table_is_read(self):
        # Sanity: the parse finds the familiar lines, so an empty set can't pass the real test vacuously.
        self.assertTrue({'CHARMANDER', 'CHARMELEON', 'EEVEE', 'NINCADA'} <= self.evolving)
        self.assertFalse({'CHARIZARD', 'TAUROS', 'MEWTWO'} & self.evolving)

    def test_every_team_member_is_a_final_evolution(self):
        for team in self.teams:
            with self.subTest(team=team):
                self.assertEqual(len(team), 6)
                self.assertFalse(set(team) & self.evolving)


if __name__ == '__main__':
    unittest.main()
