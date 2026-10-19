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
    'gSpeciesNames', 'gMoveNames', 'gBattleMoves', 'gTypeNames', 'gTypeEffectiveness', 'gItems',
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
