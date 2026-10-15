"""Checks the movesets the built ROM gives the player's team: competitive style, per patches/competitive-moves.patch.
Reads the teams from the real game through the runner, and move, species and learnset data from the decomp.
Needs $DAILYRED_HOME (default ~/.claude/dailyred) set up."""
import re
import unittest

from test_runner import HOME, run

GAME = HOME / 'src' / 'pokefirered'
SEEDS = [4075659768, 1, 2, 3, 123456789]
# Never worth a slot: they do nothing in a single battle, knock out the user, or need something the set lacks.
USELESS = {'SPLASH', 'TELEPORT', 'WATER_SPORT', 'MUD_SPORT', 'EXPLOSION', 'SELF_DESTRUCT', 'DREAM_EATER', 'SNORE',
           'FAKE_OUT', 'SPIT_UP', 'SWALLOW', 'RAGE', 'FISSURE', 'HORN_DRILL', 'GUILLOTINE', 'SHEER_COLD', 'HELPING_HAND',
           'FOLLOW_ME', 'TRANSFORM', 'SKETCH', 'METRONOME', 'MIMIC', 'CONVERSION', 'CONVERSION_2', 'GROWL', 'TAIL_WHIP',
           'LEER', 'SAND_ATTACK', 'SMOKESCREEN', 'FLASH', 'HARDEN', 'WITHDRAW', 'DEFENSE_CURL', 'STRING_SHOT',
           'ODOR_SLEUTH', 'FORESIGHT', 'LOCK_ON', 'MIND_READER', 'CHARGE'}


def constants(path, prefix):
    text = (GAME / path).read_text()
    return {m[1]: int(m[2]) for m in re.finditer(rf'^#define {prefix}(\w+)\s+(\d+)\b', text, re.M)}


def fire_red_only(text):
    """Keeps the FIRERED side of #if FIRERED / #elif LEAFGREEN blocks (Deoxys differs per version)."""
    out, stack = [], []
    for line in text.split('\n'):
        d = re.match(r'\s*#\s*(if|ifdef|elif|else|endif)\b(.*)', line)
        if not d:
            if all(stack):
                out.append(line)
            continue
        kind, rest = d[1], d[2]
        cond = not ('LEAFGREEN' in rest and 'FIRERED' not in rest)
        if kind in ('if', 'ifdef'):
            stack.append(cond)
        elif kind == 'elif':
            stack[-1] = cond and not stack[-1]
        elif kind == 'else':
            stack[-1] = not stack[-1]
        else:
            stack.pop()
    return '\n'.join(out)


def load():
    names = {v: k for k, v in constants('include/constants/moves.h', 'MOVE_').items()}
    species = {}
    for k, v in constants('include/constants/species.h', 'SPECIES_').items():
        species.setdefault(v, k)

    moves = {}
    for m in re.finditer(r'\[MOVE_(\w+)\]\s*=\s*\{(.*?)\n    \}', (GAME / 'src/data/battle_moves.h').read_text(), re.S):
        f = dict(re.findall(r'\.(\w+)\s*=\s*([^,\n]+)', m[2]))
        moves[m[1]] = {'power': int(f['power']), 'type': f['type']}

    read = lambda f: fire_red_only((GAME / f).read_text())
    types = {m[1]: {m[2], m[3]} for m in re.finditer(
        r'\[SPECIES_(\w+)\]\s*=\s*\{[^\[]*?\.types\s*=\s*\{(\w+),\s*(\w+)\}', read('src/data/pokemon/species_info.h'))}
    arrays = {m[1]: re.findall(r'MOVE_(\w+)', m[2]) for m in
              re.finditer(r'static const u16 (\w+)\[\] = \{([^}]*)\}', read('src/data/pokemon/level_up_learnsets.h'))}
    learn = {m[1]: set(arrays.get(m[2], [])) for m in
             re.finditer(r'\[SPECIES_(\w+)\]\s*=\s*(\w+)', read('src/data/pokemon/level_up_learnset_pointers.h'))}
    tm_moves = re.findall(r'MOVE_(\w+)', re.search(r'static const u16 sTMHMMoves\[\] =\s*\{([^}]*)\}',
                                                   read('src/data/party_menu.h'))[1])
    for block in re.split(r'\n\s*\[SPECIES_', read('src/data/pokemon/tmhm_learnsets.h'))[1:]:
        name = re.match(r'(\w+)\]', block)[1]
        for kind, num in re.findall(r'TMHM\((TM|HM)(\d\d)_', block):
            learn.setdefault(name, set()).add(tm_moves[(50 if kind == 'HM' else 0) + int(num) - 1])
    return names, species, moves, types, learn


@unittest.skipUnless((HOME / 'dailyred.gba').exists() and GAME.exists(), 'run scripts/setup.sh first')
class CompetitiveMovesetTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.names, cls.species, cls.moves, cls.types, cls.learn = load()
        cls.teams = []
        for seed in SEEDS:
            # The last line at the action menu: on a turn's first frames the game is still rewriting the
            # lead's encrypted data, and a read then is garbage.
            settled = [s for s in run(3600, seed=seed, daily=False) if s['menu'] == 'action'][-1]
            cls.teams.append([(cls.species[p['species']], [cls.names[i] for i in p['moves'] if i])
                              for p in settled['party']])

    def attacking(self, name):
        return self.moves[name]['power'] > 1 and name not in USELESS

    def check_each_mon(self, check):
        for team in self.teams:
            for species, moves in team:
                with self.subTest(species=species, moves=moves):
                    check(species, moves)

    def test_the_runner_reports_every_party_pokemons_moves(self):
        for team in self.teams:
            self.assertEqual(len(team), 6)
            for _, moves in team:
                self.assertTrue(moves)

    def test_no_useless_moves(self):
        def check(species, moves):
            if len(self.learn[species] - USELESS) >= 4:
                self.assertFalse(set(moves) & USELESS)
        self.check_each_mon(check)

    def test_at_least_two_attacks_of_different_types(self):
        def check(species, moves):
            pool_types = {self.moves[m]['type'] for m in self.learn[species] if self.attacking(m)}
            attack_types = {self.moves[m]['type'] for m in moves if self.attacking(m)}
            self.assertGreaterEqual(len(attack_types), min(2, len(pool_types)))
        self.check_each_mon(check)

    def test_attacks_with_its_own_type_when_it_can(self):
        def check(species, moves):
            own = lambda m: self.attacking(m) and self.moves[m]['type'] in self.types[species]
            if any(own(m) for m in self.learn[species]):
                self.assertTrue(any(own(m) for m in moves))
        self.check_each_mon(check)

    def test_at_most_one_status_move_when_attacks_are_available(self):
        def check(species, moves):
            if sum(1 for m in self.learn[species] if self.attacking(m)) >= 3:
                self.assertLessEqual(sum(1 for m in moves if self.moves[m]['power'] == 0), 1)
        self.check_each_mon(check)


if __name__ == '__main__':
    unittest.main()
