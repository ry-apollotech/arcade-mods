// dailyred-dash runner: boots the Daily Red ROM headless with libmgba, prints the battle as JSON
// lines and presses buttons for the mod's commands. See ../README.md.
//
//   runner --rom R --symbols S --charmap C --seed N [--daily] --commands F [--frames N] [--fast]
#include <mgba-util/vfs.h>
#include <mgba/core/core.h>
#include <mgba/core/log.h>
#include <stdbool.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <time.h>
#include "control.h"
#include "game.h"
#include "symbols.h"
#include "text.h"

#define FRAME_NS 16742706L
#define FAST_FACTOR 4
#define JSON_EVERY 6

static void quiet(struct mLogger* l, int c, enum mLogLevel v, const char* f, va_list a) {
	(void) l; (void) c; (void) v; (void) f; (void) a;
}

static void fail(const char* message, const char* detail) {
	fprintf(stderr, "%s%s%s\n", message, detail ? ": " : "", detail ? detail : "");
	exit(1);
}

static const char* arg(int argc, char** argv, const char* name) {
	for (int i = 1; i + 1 < argc; i++) if (strcmp(argv[i], name) == 0) return argv[i + 1];
	return NULL;
}

static bool flag(int argc, char** argv, const char* name) {
	for (int i = 1; i < argc; i++) if (strcmp(argv[i], name) == 0) return true;
	return false;
}

// Reads the ROM and fills the config struct dailyred's website fills (rom-config.js):
// after the magic, u32 seed, u16 wins, u16 battles, u8 daily.
static uint8_t* load_rom(const char* path, uint32_t configAddress, uint32_t seed, bool daily, size_t* size) {
	FILE* f = fopen(path, "rb");
	if (!f) fail("cannot read the ROM", path);
	fseek(f, 0, SEEK_END);
	*size = (size_t) ftell(f);
	fseek(f, 0, SEEK_SET);
	uint8_t* rom = malloc(*size);
	if (fread(rom, 1, *size, f) != *size) fail("cannot read the ROM", path);
	fclose(f);
	size_t offset = configAddress - 0x08000000u;
	if (offset + 25 > *size || memcmp(rom + offset, "DAILYRED-CONF-V2", 16) != 0) {
		fail("this ROM has no Daily Red config; re-run /dailyred setup", NULL);
	}
	uint8_t* c = rom + offset + 16;
	c[0] = seed & 0xFF; c[1] = (seed >> 8) & 0xFF; c[2] = (seed >> 16) & 0xFF; c[3] = seed >> 24;
	c[4] = c[5] = c[6] = c[7] = 0;
	c[8] = daily ? 1 : 0;
	return rom;
}

int main(int argc, char** argv) {
	const char* romPath = arg(argc, argv, "--rom");
	const char* symbolsPath = arg(argc, argv, "--symbols");
	const char* charmapPath = arg(argc, argv, "--charmap");
	const char* seedText = arg(argc, argv, "--seed");
	const char* commandsPath = arg(argc, argv, "--commands");
	if (!romPath || !symbolsPath || !charmapPath || !seedText || !commandsPath) {
		fail("usage: runner --rom R --symbols S --charmap C --seed N [--daily] --commands F [--frames N] [--fast]", NULL);
	}
	long frameLimit = arg(argc, argv, "--frames") ? atol(arg(argc, argv, "--frames")) : -1;
	bool fast = flag(argc, argv, "--fast");

	struct Symbols sym;
	const char* missing = NULL;
	if (!symbols_load(symbolsPath, &sym, &missing)) fail("symbol missing; re-run /dailyred setup", missing);
	if (text_load_charmap(charmapPath) == 0) fail("cannot read the charmap", charmapPath);

	static struct mLogger logger = { .log = quiet };
	mLogSetDefaultLogger(&logger);
	size_t size;
	uint8_t* rom = load_rom(romPath, sym.romConfig, (uint32_t) strtoul(seedText, NULL, 10), flag(argc, argv, "--daily"), &size);
	struct VFile* vf = VFileMemChunk(rom, size);
	free(rom);
	struct mCore* core = mCoreFindVF(vf);
	if (!core || !core->init(core)) fail("cannot start mGBA", NULL);
	mCoreInitConfig(core, NULL);
	static color_t video[240 * 160];
	core->setVideoBuffer(core, video, 240);
	if (!core->loadROM(core, vf)) fail("mGBA refused the ROM", NULL);
	core->reset(core);

	struct Game game = { core, &sym };
	struct Control* control = control_new(commandsPath);
	static char json[16384], last[16384];
	struct timespec next;
	clock_gettime(CLOCK_MONOTONIC, &next);
	for (long frame = 0; frameLimit < 0 || frame < frameLimit; frame++) {
		core->setKeys(core, control_frame(control, &game));
		core->runFrame(core);
		if (frame % JSON_EVERY == 0) {
			game_state_json(&game, json, sizeof json);
			if (strcmp(json, last) != 0) {
				puts(json);
				fflush(stdout);
				strcpy(last, json);
			}
		}
		if (fast) continue;
		long step = control_is_automating(control, &game) ? FRAME_NS / FAST_FACTOR : FRAME_NS;
		next.tv_nsec += step;
		while (next.tv_nsec >= 1000000000L) { next.tv_sec++; next.tv_nsec -= 1000000000L; }
		clock_nanosleep(CLOCK_MONOTONIC, TIMER_ABSTIME, &next, NULL);
	}
	core->deinit(core);
	return 0;
}
