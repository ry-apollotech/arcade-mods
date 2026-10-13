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
        states = run(390)  # before the automated walk starts (frame 400)
        self.assertGreater(len(states), 0)
        self.assertEqual(states[-1]['phase'], 'exploring')
        self.assertIsNone(states[-1]['player'])


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


if __name__ == '__main__':
    unittest.main()
