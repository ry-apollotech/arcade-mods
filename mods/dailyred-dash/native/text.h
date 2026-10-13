// FireRed's text encoding, decoded with the decompilation's charmap.txt.
#pragma once
#include <stddef.h>
#include <stdint.h>

// Loads charmap.txt's single-glyph entries (`'A' = BB`); returns how many, 0 when unreadable.
int text_load_charmap(const char* path);

// Decodes game text (up to `len` bytes, stopping at 0xFF) into UTF-8; `out` is always terminated.
// Line and paragraph breaks become one space; control codes are skipped with their arguments.
void text_decode(const uint8_t* game, size_t len, char* out, size_t outSize);
