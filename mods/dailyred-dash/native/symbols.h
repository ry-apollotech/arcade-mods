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
