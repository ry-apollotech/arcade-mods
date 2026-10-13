#include "control.h"
#include <stdlib.h>

struct Control {
	const char* commandsPath;
};

struct Control* control_new(const char* commandsPath) {
	struct Control* c = calloc(1, sizeof *c);
	c->commandsPath = commandsPath;
	return c;
}

uint32_t control_frame(struct Control* c, const struct Game* g) {
	(void) c;
	(void) g;
	return 0;
}

int control_is_automating(const struct Control* c, const struct Game* g) {
	(void) c;
	(void) g;
	return 0;
}
