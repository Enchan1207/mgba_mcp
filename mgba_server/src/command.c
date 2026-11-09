#include "mgba_server/command.h"

#include <ctype.h>
#include <stddef.h>

struct token { const char* start; size_t length; };

static struct token next_token(const char** cursor) {
    const char* p = *cursor;
    while (isspace((unsigned char) *p)) ++p;
    struct token token = { p, 0 };
    while (p[token.length] && !isspace((unsigned char) p[token.length])) ++token.length;
    *cursor = p + token.length;
    return token;
}

static int equals(struct token token, const char* word) {
    size_t i = 0;
    while (i < token.length && word[i]) {
        if (toupper((unsigned char) token.start[i]) != toupper((unsigned char) word[i])) return 0;
        ++i;
    }
    return i == token.length && word[i] == '\0';
}

static enum mgba_parse_result fail(const char** error, const char* message) {
    if (error) *error = message;
    return MGBA_PARSE_ERROR;
}

static int parse_frames(struct token token, unsigned* frames) {
    unsigned value = 0;
    if (!token.length) return 0;
    for (size_t i = 0; i < token.length; ++i) {
        unsigned char c = (unsigned char) token.start[i];
        if (c < '0' || c > '9') return 0;
        unsigned digit = c - '0';
        if (value > (MGBA_COMMAND_MAX_FRAMES - digit) / 10) return 0;
        value = value * 10 + digit;
    }
    if (!value) return 0;
    *frames = value;
    return 1;
}

static int parse_button(struct token token, int allow_all, enum mgba_button* button) {
    static const struct { const char* name; enum mgba_button value; } names[] = {
        {"A", MGBA_BUTTON_A}, {"B", MGBA_BUTTON_B},
        {"SELECT", MGBA_BUTTON_SELECT}, {"START", MGBA_BUTTON_START},
        {"RIGHT", MGBA_BUTTON_RIGHT}, {"LEFT", MGBA_BUTTON_LEFT},
        {"UP", MGBA_BUTTON_UP}, {"DOWN", MGBA_BUTTON_DOWN},
        {"R", MGBA_BUTTON_R}, {"L", MGBA_BUTTON_L}
    };
    if (allow_all && equals(token, "ALL")) {
        *button = MGBA_BUTTON_ALL;
        return 1;
    }
    for (size_t i = 0; i < sizeof(names) / sizeof(names[0]); ++i) {
        if (equals(token, names[i].name)) {
            *button = names[i].value;
            return 1;
        }
    }
    return 0;
}

enum mgba_parse_result mgba_command_parse(const char* line,
                                          struct mgba_command* out,
                                          const char** error) {
    if (error) *error = NULL;
    if (!line || !out) return fail(error, "null parser argument");

    const char* cursor = line;
    struct token verb = next_token(&cursor);
    if (!verb.length) return MGBA_PARSE_EMPTY;
    struct token arg = next_token(&cursor);
    struct token extra = next_token(&cursor);
    struct mgba_command parsed = {0};

    if (equals(verb, "STEP")) {
        parsed.type = MGBA_COMMAND_STEP;
        if (!arg.length) return fail(error, "STEP requires a frame count");
        if (extra.length) return fail(error, "too many arguments");
        if (!parse_frames(arg, &parsed.argument.frames)) return fail(error, "invalid frame count");
    } else if (equals(verb, "PRESS") || equals(verb, "RELEASE")) {
        int release = equals(verb, "RELEASE");
        parsed.type = release ? MGBA_COMMAND_RELEASE : MGBA_COMMAND_PRESS;
        if (!arg.length) return fail(error, "button is required");
        if (extra.length) return fail(error, "too many arguments");
        if (!parse_button(arg, release, &parsed.argument.button)) return fail(error, "unknown button");
    } else {
        if (equals(verb, "RESET")) parsed.type = MGBA_COMMAND_RESET;
        else if (equals(verb, "STATUS")) parsed.type = MGBA_COMMAND_STATUS;
        else if (equals(verb, "CAPTURE")) parsed.type = MGBA_COMMAND_CAPTURE;
        else if (equals(verb, "QUIT")) parsed.type = MGBA_COMMAND_QUIT;
        else return fail(error, "unknown command");
        if (arg.length) return fail(error, "too many arguments");
    }
    *out = parsed;
    return MGBA_PARSE_OK;
}
