# Builds the runner against the system libmgba (sudo apt install libmgba-dev).
OUT ?= .
# gnu11, not c11: libmgba's headers need PATH_MAX and the runner uses POSIX clocks.
CFLAGS ?= -O2 -Wall -Wextra -std=gnu11
SRCS = runner.c symbols.c text.c game.c control.c

all: $(OUT)/runner

$(OUT)/runner: $(SRCS) symbols.h text.h game.h control.h
	$(CC) $(CFLAGS) -o $@ $(SRCS) -lmgba

test: test_text.c text.c text.h
	$(CC) $(CFLAGS) -o test_text test_text.c text.c && ./test_text && rm -f test_text

.PHONY: all test
