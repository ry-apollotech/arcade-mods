#include "control.h"
#include <stdlib.h>

#define KEY_A 1u
#define KEY_UP 64u
#define BOOT_FRAMES 400   // logo and fade-in before the player can move
#define WALK_UPS 7        // Up presses from the start tile to RED (found by probing the built ROM)
#define PRESS_FRAMES 16   // one d-pad step: held 8 frames, released 8
#define TEXT_EVERY 20     // battle text and talking: A once every this many frames

struct Control {
	const char* commandsPath;
	long frame;
	long walkStart; // first frame of the walk; -1 until exploring is seen
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

uint32_t control_frame(struct Control* c, const struct Game* g) {
	c->frame++;
	enum Phase phase = game_phase(g);
	if (phase == PHASE_EXPLORING) return explore(c);
	c->walkStart = -1;
	// Battle text, the result and RED's closing words: A through them; never while a choice is open.
	if (phase == PHASE_BATTLE && game_menu(g) != MENU_NONE) return 0;
	return c->frame % TEXT_EVERY < 4 ? KEY_A : 0;
}

int control_is_automating(const struct Control* c, const struct Game* g) {
	(void) c;
	return game_phase(g) != PHASE_BATTLE || game_menu(g) == MENU_NONE;
}
