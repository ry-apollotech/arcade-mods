// Reads the battle out of the game's memory and writes it as one JSON object.
#pragma once
#include <mgba/core/core.h>
#include <stddef.h>
#include "symbols.h"

enum Phase { PHASE_EXPLORING, PHASE_BATTLE, PHASE_RESULT, PHASE_FINISHED };
enum Menu { MENU_NONE, MENU_ACTION, MENU_MOVE, MENU_TARGET, MENU_PARTY };

struct Game {
	struct mCore* core;
	const struct Symbols* sym;
};

enum Phase game_phase(const struct Game* g);
int game_result(const struct Game* g); // 0 none, 1 won, 2 lost
enum Menu game_menu(const struct Game* g);
int game_action_cursor(const struct Game* g); // 0 FIGHT, 1 BAG, 2 POKéMON, 3 RUN (2x2, row-major)
int game_move_cursor(const struct Game* g);   // 0-3 (2x2, row-major)
int game_party_slot(const struct Game* g);    // 0-5, 6+ = CANCEL
int game_move_count(const struct Game* g);    // the player's active Pokémon's moves
int game_party_count(const struct Game* g);
size_t game_state_json(const struct Game* g, char* out, size_t outSize);
