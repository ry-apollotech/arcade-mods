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
