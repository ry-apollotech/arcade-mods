#include "symbols.h"
#include <stddef.h>
#include <stdio.h>
#include <string.h>

static const struct {
	const char* name;
	size_t field;
} FIELDS[] = {
	{ "gBattleMons", offsetof(struct Symbols, battleMons) },
	{ "gBattlersCount", offsetof(struct Symbols, battlersCount) },
	{ "gBattleTypeFlags", offsetof(struct Symbols, battleTypeFlags) },
	{ "gDisplayedStringBattle", offsetof(struct Symbols, displayedStringBattle) },
	{ "gBattlerPartyIndexes", offsetof(struct Symbols, battlerPartyIndexes) },
	{ "gPlayerParty", offsetof(struct Symbols, playerParty) },
	{ "gEnemyParty", offsetof(struct Symbols, enemyParty) },
	{ "gPlayerPartyCount", offsetof(struct Symbols, playerPartyCount) },
	{ "gEnemyPartyCount", offsetof(struct Symbols, enemyPartyCount) },
	{ "gBattleOutcome", offsetof(struct Symbols, battleOutcome) },
	{ "gActionSelectionCursor", offsetof(struct Symbols, actionCursor) },
	{ "gMoveSelectionCursor", offsetof(struct Symbols, moveCursor) },
	{ "gBattlerControllerFuncs", offsetof(struct Symbols, controllerFuncs) },
	{ "gPartyMenu", offsetof(struct Symbols, partyMenu) },
	{ "gSpeciesNames", offsetof(struct Symbols, speciesNames) },
	{ "gMoveNames", offsetof(struct Symbols, moveNames) },
	{ "gBattleMoves", offsetof(struct Symbols, battleMoves) },
	{ "gTypeNames", offsetof(struct Symbols, typeNames) },
	{ "gTypeEffectiveness", offsetof(struct Symbols, typeEffectiveness) },
	{ "gDailyRedRomConfig", offsetof(struct Symbols, romConfig) },
	{ "sStatus", offsetof(struct Symbols, status) },
	{ "HandleInputChooseAction", offsetof(struct Symbols, chooseAction) },
	{ "HandleInputChooseMove", offsetof(struct Symbols, chooseMove) },
	{ "HandleInputChooseTarget", offsetof(struct Symbols, chooseTarget) },
	{ "OpenPartyMenuToChooseMon", offsetof(struct Symbols, openParty) },
	{ "WaitForMonSelection", offsetof(struct Symbols, waitForMonSelection) },
};
#define FIELD(out, i) (*(uint32_t*) ((char*) (out) + FIELDS[i].field))

bool symbols_load(const char* path, struct Symbols* out, const char** missing) {
	memset(out, 0, sizeof *out);
	FILE* f = fopen(path, "r");
	if (!f) {
		*missing = path;
		return false;
	}
	char name[128];
	unsigned long value;
	while (fscanf(f, "%127s %lx", name, &value) == 2) {
		for (size_t i = 0; i < sizeof FIELDS / sizeof FIELDS[0]; i++) {
			if (strcmp(name, FIELDS[i].name) == 0) FIELD(out, i) = (uint32_t) value;
		}
	}
	fclose(f);
	for (size_t i = 0; i < sizeof FIELDS / sizeof FIELDS[0]; i++) {
		if (FIELD(out, i) == 0) {
			*missing = FIELDS[i].name;
			return false;
		}
	}
	return true;
}
