#include <errno.h>
#include <inttypes.h>
#include <stdbool.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/types.h>

#include "mgba_server/command.h"
#include "mgba_server/session.h"

static bool capture_frame(const struct mgba_session* session, uint64_t* capture_index) {
    const color_t* pixels = mgba_session_frame(session);
    if (!pixels) {
        fprintf(stderr, "CAPTURE requires a frame; run STEP first.\n");
        return false;
    }

    const uint64_t frame = mgba_session_status(session).frames_elapsed;
    char path[128];
    FILE* output = NULL;
    for (;;) {
        int length = snprintf(path, sizeof(path), "capture-frame-%" PRIu64 "-%" PRIu64 ".raw",
                              frame, *capture_index);
        if (length < 0 || (size_t)length >= sizeof(path)) {
            fprintf(stderr, "Cannot generate capture filename.\n");
            return false;
        }

        output = fopen(path, "wbx");
        if (output) {
            break;
        }
        if (errno != EEXIST || *capture_index == UINT64_MAX) {
            perror("Cannot create capture");
            return false;
        }
        ++*capture_index;
    }

    const size_t pixel_count = MGBA_SESSION_WIDTH * MGBA_SESSION_HEIGHT;
    bool written = fwrite(pixels, sizeof(*pixels), pixel_count, output) == pixel_count;
    if (!written) {
        perror("Cannot write capture");
    }
    if (fclose(output) != 0) {
        perror("Cannot close capture");
        written = false;
    }
    if (!written) {
        remove(path);
        return false;
    }

    printf("Saved %s (%u x %u, %zu bytes/pixel)\n", path,
           MGBA_SESSION_WIDTH, MGBA_SESSION_HEIGHT, sizeof(*pixels));
    if (*capture_index != UINT64_MAX) {
        ++*capture_index;
    }
    return true;
}

static bool execute_command(struct mgba_session* session,
                            const struct mgba_command* command,
                            uint64_t* capture_index) {
    switch (command->type) {
        case MGBA_COMMAND_STEP:
            mgba_session_step(session, command->argument.frames);
            return true;
        case MGBA_COMMAND_PRESS:
            mgba_session_press(session, command->argument.button);
            return true;
        case MGBA_COMMAND_RELEASE:
            mgba_session_release(session, command->argument.button);
            return true;
        case MGBA_COMMAND_RESET:
            mgba_session_reset(session);
            return true;
        case MGBA_COMMAND_STATUS: {
            struct mgba_session_status status = mgba_session_status(session);
            printf("frames=%" PRIu64 " pressed_keys=%" PRIu32 " has_frame=%s\n",
                   status.frames_elapsed, status.pressed_keys,
                   status.has_frame ? "true" : "false");
            return true;
        }
        case MGBA_COMMAND_CAPTURE:
            return capture_frame(session, capture_index);
        case MGBA_COMMAND_QUIT:
            return true;
    }
    return false;
}

int main(int argc, char* argv[]) {
    if (argc != 3) {
        fprintf(stderr, "Usage: %s ROM COMMANDS\n", argv[0]);
        return EXIT_FAILURE;
    }

    FILE* input = fopen(argv[2], "r");
    if (!input) {
        perror("Cannot open command file");
        return EXIT_FAILURE;
    }

    struct mgba_session session;
    if (!mgba_session_init(&session, argv[1])) {
        fprintf(stderr, "Cannot initialize Game Boy ROM: %s\n", argv[1]);
        fclose(input);
        return EXIT_FAILURE;
    }

    int result = EXIT_SUCCESS;
    char* line = NULL;
    size_t capacity = 0;
    size_t line_number = 0;
    uint64_t capture_index = 0;
    ssize_t length;
    while ((length = getline(&line, &capacity, input)) != -1) {
        ++line_number;
        if (memchr(line, '\0', (size_t)length)) {
            fprintf(stderr, "%s:%zu: NUL byte in command\n", argv[2], line_number);
            result = EXIT_FAILURE;
            break;
        }
        struct mgba_command command;
        const char* error = NULL;
        enum mgba_parse_result parsed = mgba_command_parse(line, &command, &error);
        if (parsed == MGBA_PARSE_EMPTY) {
            continue;
        }
        if (parsed == MGBA_PARSE_ERROR) {
            fprintf(stderr, "%s:%zu: %s\n", argv[2], line_number, error);
            result = EXIT_FAILURE;
            break;
        }
        if (!execute_command(&session, &command, &capture_index)) {
            fprintf(stderr, "%s:%zu: command failed\n", argv[2], line_number);
            result = EXIT_FAILURE;
            break;
        }
        if (command.type == MGBA_COMMAND_QUIT) {
            break;
        }
    }
    if (length == -1 && ferror(input)) {
        perror("Cannot read command file");
        result = EXIT_FAILURE;
    }

    free(line);
    if (fclose(input) != 0) {
        perror("Cannot close command file");
        result = EXIT_FAILURE;
    }
    mgba_session_deinit(&session);
    return result;
}
