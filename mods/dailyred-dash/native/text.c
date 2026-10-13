#include "text.h"
#include <stdio.h>
#include <string.h>

// Each FC control code's length, the code byte included (GetExtCtrlCodeLength in string_util.c).
static const uint8_t CTRL_LENGTHS[] = { 1, 2, 2, 2, 4, 2, 2, 1, 2, 1, 1, 3, 2, 2, 2, 1, 3, 2, 2, 2, 2, 1, 1, 1, 1 };

static char sGlyphs[256][5];

int text_load_charmap(const char* path) {
	FILE* f = fopen(path, "r");
	if (!f) return 0;
	memset(sGlyphs, 0, sizeof sGlyphs);
	char line[256];
	int loaded = 0;
	while (fgets(line, sizeof line, f)) {
		if (line[0] != '\'') continue;
		char glyph[5] = { 0 };
		const char* p = line + 1;
		if (p[0] == '\\') {
			if (p[1] != '\'') continue; // '\n' and the like: handled as control bytes
			glyph[0] = '\'';
			p += 2;
		} else {
			size_t n = 0;
			while (*p && *p != '\'' && n < 4) glyph[n++] = *p++;
		}
		unsigned value;
		if (*p != '\'' || sscanf(p + 1, " = %x", &value) != 1 || value > 0xFF) continue;
		if (sGlyphs[value][0] == 0) {
			memcpy(sGlyphs[value], glyph, sizeof glyph);
			loaded++;
		}
	}
	fclose(f);
	return loaded;
}

void text_decode(const uint8_t* game, size_t len, char* out, size_t outSize) {
	size_t o = 0;
	for (size_t i = 0; i < len && game[i] != 0xFF && o + 5 < outSize; i++) {
		uint8_t c = game[i];
		if (c == 0xFC) {
			uint8_t code = i + 1 < len ? game[i + 1] : 0;
			i += code < sizeof CTRL_LENGTHS ? CTRL_LENGTHS[code] : 1;
			continue;
		}
		if (c == 0xFA || c == 0xFB || c == 0xFE) {
			if (o > 0 && out[o - 1] != ' ') out[o++] = ' ';
			continue;
		}
		size_t n = strlen(sGlyphs[c]);
		memcpy(out + o, sGlyphs[c], n);
		o += n;
	}
	out[o] = 0;
}
