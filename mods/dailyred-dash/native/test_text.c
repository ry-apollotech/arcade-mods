// Checks text.c against a small charmap: plain glyphs, line breaks, a control code with arguments.
#include "text.h"
#include <assert.h>
#include <stdio.h>
#include <string.h>

int main(void) {
	FILE* f = fopen("test_charmap.txt", "w");
	fputs("' '         = 00\n'A'         = BB\n'B'         = BC\n'!'         = AB\n'\\''        = B4\n'é'         = 1B\n'\\n' = FE @ new line\n", f);
	fclose(f);
	assert(text_load_charmap("test_charmap.txt") == 6);

	char out[64];
	const uint8_t plain[] = { 0xBB, 0x00, 0xBC, 0xAB, 0xFF, 0xBB };
	text_decode(plain, sizeof plain, out, sizeof out);
	assert(strcmp(out, "A B!") == 0);

	// FE is a line break; FC 01 xx is a color code (2 bytes after FC) and is skipped.
	const uint8_t codes[] = { 0xBB, 0xFE, 0xBC, 0xFC, 0x01, 0x02, 0xB4, 0x1B, 0xFF };
	text_decode(codes, sizeof codes, out, sizeof out);
	assert(strcmp(out, "A B'é") == 0);

	remove("test_charmap.txt");
	puts("text: ok");
	return 0;
}
