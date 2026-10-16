#include "game.h"
#include "text.h"
#include <stdbool.h>
#include <stdio.h>
#include <string.h>

#define MON_SIZE 0x58
#define PARTY_SIZE 100

static uint32_t r8(const struct Game* g, uint32_t a) { return g->core->busRead8(g->core, a); }
static uint32_t r16(const struct Game* g, uint32_t a) { return g->core->busRead16(g->core, a); }
static uint32_t r32(const struct Game* g, uint32_t a) { return g->core->busRead32(g->core, a); }

static void read_text(const struct Game* g, uint32_t a, size_t len, char* out, size_t outSize) {
	uint8_t raw[512];
	if (len > sizeof raw) len = sizeof raw;
	for (size_t i = 0; i < len; i++) raw[i] = (uint8_t) r8(g, a + i);
	text_decode(raw, len, out, outSize);
}

enum Phase game_phase(const struct Game* g) { return (enum Phase) r8(g, g->sym->status + 20); }
int game_result(const struct Game* g) { return (int) r8(g, g->sym->status + 21); }

enum Menu game_menu(const struct Game* g) {
	uint32_t f = r32(g, g->sym->controllerFuncs) & ~1u;
	if (f == (g->sym->chooseAction & ~1u)) return MENU_ACTION;
	if (f == (g->sym->chooseMove & ~1u)) return MENU_MOVE;
	if (f == (g->sym->chooseTarget & ~1u)) return MENU_TARGET;
	if (f == (g->sym->openParty & ~1u) || f == (g->sym->waitForMonSelection & ~1u)) return MENU_PARTY;
	return MENU_NONE;
}

int game_action_cursor(const struct Game* g) { return (int) r8(g, g->sym->actionCursor); }
int game_move_cursor(const struct Game* g) { return (int) r8(g, g->sym->moveCursor); }
int game_party_slot(const struct Game* g) { return (int) (int8_t) r8(g, g->sym->partyMenu + 9); }
int game_party_count(const struct Game* g) { return (int) r8(g, g->sym->playerPartyCount); }

int game_move_count(const struct Game* g) {
	int n = 0;
	for (int i = 0; i < 4; i++) n += r16(g, g->sym->battleMons + 0x0C + 2 * i) != 0;
	return n;
}

// The table has one row per (attacking type, defending type); a dual-typed defender matches two rows.
static int effectiveness(const struct Game* g, int moveType, int t1, int t2) {
	int mult = 10;
	for (uint32_t a = g->sym->typeEffectiveness;; a += 3) {
		int atk = (int) r8(g, a), def = (int) r8(g, a + 1), m = (int) r8(g, a + 2);
		if (atk == 0xFF) break;
		if (atk == 0xFE) continue;
		if (atk == moveType && (def == t1 || (t2 != t1 && def == t2))) mult = mult * m / 10;
	}
	return mult;
}

// A status1 word as the game's badge: sleep is a turn count in bits 0-2, then one bit per condition.
static const char* status_badge(uint32_t status) {
	if (status & 0x7) return "SLP";
	if (status & 0x80) return "TOX";
	if (status & 0x8) return "PSN";
	if (status & 0x10) return "BRN";
	if (status & 0x20) return "FRZ";
	if (status & 0x40) return "PAR";
	return "";
}

// Escapes `s` for a JSON string.
static void json_string(const char* s, char* out, size_t outSize) {
	size_t o = 0;
	for (; *s && o + 3 < outSize; s++) {
		if (*s == '"' || *s == '\\') out[o++] = '\\';
		out[o++] = *s;
	}
	out[o] = 0;
}

static size_t mon_json(const struct Game* g, int battler, char* out, size_t outSize) {
	uint32_t m = g->sym->battleMons + MON_SIZE * battler;
	uint32_t foe = g->sym->battleMons + MON_SIZE * (battler ^ 1);
	if (r16(g, m) == 0) return (size_t) snprintf(out, outSize, "null");
	char name[64], esc[96], typeA[16], typeB[16];
	read_text(g, m + 0x30, 11, name, sizeof name);
	json_string(name, esc, sizeof esc);
	int t1 = (int) r8(g, m + 0x21), t2 = (int) r8(g, m + 0x22);
	int f1 = (int) r8(g, foe + 0x21), f2 = (int) r8(g, foe + 0x22);
	read_text(g, g->sym->typeNames + 7 * t1, 7, typeA, sizeof typeA);
	read_text(g, g->sym->typeNames + 7 * t2, 7, typeB, sizeof typeB);
	size_t o = (size_t) snprintf(out, outSize,
		"{\"species\":%u,\"name\":\"%s\",\"level\":%u,\"hp\":%u,\"maxHp\":%u,\"status\":\"%s\",\"confused\":%s,"
		"\"types\":[\"%s\"%s%s%s],\"moves\":[",
		r16(g, m), esc, r8(g, m + 0x2A), r16(g, m + 0x28), r16(g, m + 0x2C), status_badge(r32(g, m + 0x4C)),
		(r32(g, m + 0x50) & 0x7) ? "true" : "false", typeA,
		t2 != t1 ? ",\"" : "", t2 != t1 ? typeB : "", t2 != t1 ? "\"" : "");
	int written = 0;
	uint32_t bonuses = r8(g, m + 0x3B);
	for (int i = 0; i < 4 && o < outSize; i++) {
		uint32_t id = r16(g, m + 0x0C + 2 * i);
		if (id == 0) continue;
		uint32_t rec = g->sym->battleMoves + 12 * id;
		uint32_t base = r8(g, rec + 4), bonus = (bonuses >> (2 * i)) & 3;
		int type = (int) r8(g, rec + 2);
		char move[64], moveEsc[96], typeName[16];
		read_text(g, g->sym->moveNames + 13 * id, 13, move, sizeof move);
		json_string(move, moveEsc, sizeof moveEsc);
		read_text(g, g->sym->typeNames + 7 * type, 7, typeName, sizeof typeName);
		o += (size_t) snprintf(out + o, outSize - o,
			"%s{\"slot\":%d,\"id\":%u,\"name\":\"%s\",\"pp\":%u,\"maxPp\":%u,\"power\":%u,\"type\":\"%s\",\"effect\":%d}",
			written++ ? "," : "", i + 1, id, moveEsc, r8(g, m + 0x24 + i), base + base * bonus / 5, r8(g, rec + 1),
			typeName, effectiveness(g, type, f1, f2));
	}
	o += (size_t) snprintf(out + o, outSize - o, "]}");
	return o;
}

// A party Pokémon's species and moves sit in its encrypted Growth and Attacks substructures.
static uint32_t party_substruct(const struct Game* g, uint32_t p, char which, int word) {
	static const char* ORDERS[24] = { "GAEM", "GAME", "GEAM", "GEMA", "GMAE", "GMEA", "AGEM", "AGME", "AEGM",
		"AEMG", "AMGE", "AMEG", "EGAM", "EGMA", "EAGM", "EAMG", "EMGA", "EMAG", "MGAE", "MGEA", "MAGE", "MAEG",
		"MEGA", "MEAG" };
	uint32_t personality = r32(g, p), key = personality ^ r32(g, p + 4);
	int index = (int) (strchr(ORDERS[personality % 24], which) - ORDERS[personality % 24]);
	return r32(g, p + 32 + 12 * index + 4 * word) ^ key;
}

static uint32_t party_species(const struct Game* g, uint32_t p) { return party_substruct(g, p, 'G', 0) & 0xFFFF; }

static uint32_t party_move(const struct Game* g, uint32_t p, int i) {
	return (party_substruct(g, p, 'A', i / 2) >> (16 * (i % 2))) & 0xFFFF;
}

size_t game_state_json(const struct Game* g, char* out, size_t outSize) {
	static const char* PHASES[] = { "exploring", "battle", "result", "finished" };
	static const char* MENUS[] = { "none", "action", "move", "target", "party" };
	static const char* RESULTS[] = { "none", "won", "lost" };
	enum Phase phase = game_phase(g);
	int result = game_result(g);
	char message[512], esc[768];
	read_text(g, g->sym->displayedStringBattle, 300, message, sizeof message);
	json_string(message, esc, sizeof esc);
	bool battle = phase == PHASE_BATTLE;
	size_t o = (size_t) snprintf(out, outSize, "{\"phase\":\"%s\",\"menu\":\"%s\",\"result\":\"%s\",\"message\":\"%s\",\"player\":",
		PHASES[phase <= PHASE_FINISHED ? phase : 0], MENUS[battle ? game_menu(g) : MENU_NONE],
		RESULTS[result <= 2 ? result : 0], battle ? esc : "");
	o += battle ? mon_json(g, 0, out + o, outSize - o) : (size_t) snprintf(out + o, outSize - o, "null");
	o += (size_t) snprintf(out + o, outSize - o, ",\"enemy\":");
	o += battle ? mon_json(g, 1, out + o, outSize - o) : (size_t) snprintf(out + o, outSize - o, "null");
	o += (size_t) snprintf(out + o, outSize - o, ",\"party\":[");
	int count = battle ? game_party_count(g) : 0;
	uint32_t active = r16(g, g->sym->battlerPartyIndexes);
	for (int i = 0; i < count && i < 6; i++) {
		uint32_t p = g->sym->playerParty + PARTY_SIZE * i;
		char name[64], nameEsc[96];
		read_text(g, p + 8, 10, name, sizeof name);
		json_string(name, nameEsc, sizeof nameEsc);
		o += (size_t) snprintf(out + o, outSize - o,
			"%s{\"slot\":%d,\"species\":%u,\"name\":\"%s\",\"level\":%u,\"hp\":%u,\"maxHp\":%u,\"active\":%s,"
			"\"status\":\"%s\",\"moves\":[%u,%u,%u,%u]}",
			i ? "," : "", i + 1, party_species(g, p), nameEsc, r8(g, p + 84), r16(g, p + 86), r16(g, p + 88),
			(uint32_t) i == active ? "true" : "false", status_badge(r32(g, p + 80)),
			party_move(g, p, 0), party_move(g, p, 1), party_move(g, p, 2), party_move(g, p, 3));
	}
	o += (size_t) snprintf(out + o, outSize - o, "]}");
	return o;
}
