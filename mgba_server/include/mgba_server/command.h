#ifndef MGBA_SERVER_COMMAND_H
#define MGBA_SERVER_COMMAND_H

#ifdef __cplusplus
extern "C" {
#endif

#define MGBA_COMMAND_MAX_FRAMES 216000U

enum mgba_command_type {
    MGBA_COMMAND_STEP,
    MGBA_COMMAND_PRESS,
    MGBA_COMMAND_RELEASE,
    MGBA_COMMAND_RESET,
    MGBA_COMMAND_STATUS,
    MGBA_COMMAND_CAPTURE,
    MGBA_COMMAND_QUIT
};

enum mgba_button {
    MGBA_BUTTON_A,
    MGBA_BUTTON_B,
    MGBA_BUTTON_SELECT,
    MGBA_BUTTON_START,
    MGBA_BUTTON_RIGHT,
    MGBA_BUTTON_LEFT,
    MGBA_BUTTON_UP,
    MGBA_BUTTON_DOWN,
    MGBA_BUTTON_ALL
};

struct mgba_command {
    enum mgba_command_type type;
    union {
        unsigned frames;
        enum mgba_button button;
    } argument;
};

enum mgba_parse_result {
    MGBA_PARSE_OK,
    MGBA_PARSE_EMPTY,
    MGBA_PARSE_ERROR
};

/* Parses a line without changing it. On failure, out is unchanged and error
 * points to a static message when error is non-NULL. */
enum mgba_parse_result mgba_command_parse(
    const char* line,
    struct mgba_command* out,
    const char** error);

#ifdef __cplusplus
}
#endif

#endif
