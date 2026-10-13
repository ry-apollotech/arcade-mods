#include "control.h"
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#define KEY_A 1u
#define KEY_B 2u
#define KEY_RIGHT 16u
#define KEY_LEFT 32u
#define KEY_UP 64u
#define KEY_DOWN 128u
#define BOOT_FRAMES 400     // logo and fade-in before the player can move
#define WALK_UPS 7          // Up presses from the start tile to RED (found by probing the built ROM)
#define PRESS_FRAMES 16     // one d-pad step: held 8 frames, released 8
#define TEXT_EVERY 20       // battle text and talking: A once every this many frames
#define DECIDE_EVERY 10     // frames between steps of a command: a press, then the game reacts
#define TAP_FRAMES 4
#define COMMAND_TIMEOUT 1800

enum Kind { CMD_NONE, CMD_MOVE, CMD_SWITCH, CMD_ADVANCE };

struct Control {
	const char* commandsPath;
	long frame;
	long walkStart; // first frame of the walk; -1 until exploring is seen
	unsigned long seq; // the last command read
	enum Kind kind;
	int target;
	long started;
	int confirming;
	uint32_t tapKeys;
	int tapLeft;
};

struct Control* control_new(const char* commandsPath) {
	struct Control* c = calloc(1, sizeof *c);
	c->commandsPath = commandsPath;
	c->walkStart = -1;
	return c;
}

// Exploring: walk up to RED, then talk until the battle starts. Each new run (practice mode warps
// back to the start after a battle) walks again.
static uint32_t explore(struct Control* c) {
	if (c->walkStart < 0) c->walkStart = c->frame < BOOT_FRAMES ? BOOT_FRAMES : c->frame;
	long t = c->frame - c->walkStart;
	if (t < 0) return 0;
	if (t < WALK_UPS * PRESS_FRAMES) return t % PRESS_FRAMES < PRESS_FRAMES / 2 ? KEY_UP : 0;
	return t % TEXT_EVERY < 4 ? KEY_A : 0;
}

// The mod overwrites the commands file with one line, "<seq> <command> [n]"; a new seq replaces
// any command still in progress.
static void read_command(struct Control* c) {
	FILE* f = fopen(c->commandsPath, "r");
	if (!f) return;
	unsigned long seq = 0;
	char word[16] = "";
	int n = 0;
	int got = fscanf(f, "%lu %15s %d", &seq, word, &n);
	fclose(f);
	if (got < 2 || seq == c->seq) return;
	c->seq = seq;
	c->kind = strcmp(word, "move") == 0 ? CMD_MOVE : strcmp(word, "switch") == 0 ? CMD_SWITCH :
		strcmp(word, "advance") == 0 ? CMD_ADVANCE : CMD_NONE;
	c->target = n - 1;
	c->started = c->frame;
	c->confirming = 0;
}

static void tap(struct Control* c, uint32_t keys) {
	c->tapKeys = keys;
	c->tapLeft = TAP_FRAMES;
}

// One 2x2 grid step from cursor `from` toward `to` (0 1 / 2 3), or A when there.
static uint32_t grid_step(int from, int to) {
	if (from == to) return KEY_A;
	if ((from & 1) != (to & 1)) return (to & 1) ? KEY_RIGHT : KEY_LEFT;
	return to > from ? KEY_DOWN : KEY_UP;
}

static void command_step(struct Control* c, const struct Game* g) {
	if (c->kind == CMD_NONE) return;
	if (c->frame - c->started > COMMAND_TIMEOUT) {
		c->kind = CMD_NONE;
		return;
	}
	enum Menu menu = game_menu(g);
	switch (c->kind) {
	case CMD_ADVANCE:
		tap(c, KEY_A);
		c->kind = CMD_NONE;
		break;
	case CMD_MOVE:
		if (c->target < 0 || c->target >= game_move_count(g)) {
			c->kind = CMD_NONE;
		} else if (menu == MENU_ACTION) {
			tap(c, grid_step(game_action_cursor(g), 0));
		} else if (menu == MENU_MOVE) {
			uint32_t key = grid_step(game_move_cursor(g), c->target);
			tap(c, key);
			if (key == KEY_A) c->kind = CMD_NONE;
		} else if (menu == MENU_TARGET) {
			tap(c, KEY_A);
		}
		break;
	case CMD_SWITCH:
		if (c->target < 0 || c->target >= game_party_count(g)) {
			c->kind = CMD_NONE;
		} else if (menu == MENU_ACTION) {
			tap(c, grid_step(game_action_cursor(g), 2));
		} else if (menu == MENU_MOVE) {
			tap(c, KEY_B);
		} else if (menu == MENU_PARTY) {
			if (c->confirming) {
				// The slot's submenu is up: its first item (SHIFT / SEND OUT) is under the cursor.
				tap(c, KEY_A);
				c->kind = CMD_NONE;
			} else if (game_party_slot(g) != c->target) {
				tap(c, KEY_DOWN);
			} else {
				tap(c, KEY_A);
				c->confirming = 1;
			}
		}
		break;
	default:
		break;
	}
}

uint32_t control_frame(struct Control* c, const struct Game* g) {
	c->frame++;
	if (c->tapLeft > 0) {
		c->tapLeft--;
		return c->tapKeys;
	}
	if (c->frame % 4 == 0) read_command(c);
	enum Phase phase = game_phase(g);
	if (phase == PHASE_EXPLORING) return explore(c);
	c->walkStart = -1;
	// While a choice is open, only the person's command presses buttons; otherwise A through the text.
	if (phase == PHASE_BATTLE && game_menu(g) != MENU_NONE) {
		if (c->frame % DECIDE_EVERY == 0) command_step(c, g);
		return 0;
	}
	return c->frame % TEXT_EVERY < 4 ? KEY_A : 0;
}

int control_is_automating(const struct Control* c, const struct Game* g) {
	(void) c;
	return game_phase(g) != PHASE_BATTLE || game_menu(g) == MENU_NONE;
}
