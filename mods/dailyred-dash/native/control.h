// Turns commands and automation into GBA button presses, one decision every few frames.
#pragma once
#include <stdint.h>
#include "game.h"

struct Control;
struct Control* control_new(const char* commandsPath);
// Called once per frame; returns the buttons to hold this frame (GBA key bits).
uint32_t control_frame(struct Control* c, const struct Game* g);
// True while automation runs (walking, battle text): the runner may run faster.
int control_is_automating(const struct Control* c, const struct Game* g);
