#ifndef MGBA_SERVER_SESSION_H
#define MGBA_SERVER_SESSION_H

#include <stdbool.h>
#include <stdint.h>

#include <mgba/core/core.h>

#include "mgba_server/command.h"

#ifdef __cplusplus
extern "C" {
#endif

#define MGBA_SESSION_WIDTH 160U
#define MGBA_SESSION_HEIGHT 144U

struct mgba_session {
    struct mCore* core;
    color_t pixels[MGBA_SESSION_WIDTH * MGBA_SESSION_HEIGHT];
    uint32_t pressed_keys;
    uint64_t frames_elapsed;
    bool has_frame;
    bool config_initialized;
};

struct mgba_session_status {
    uint32_t pressed_keys;
    uint64_t frames_elapsed;
    bool has_frame;
};

/* Call deinit only after a successful init. */
bool mgba_session_init(struct mgba_session* session, const char* rom_path);
void mgba_session_deinit(struct mgba_session* session);

void mgba_session_press(struct mgba_session* session, enum mgba_button button);
void mgba_session_release(struct mgba_session* session, enum mgba_button button);
void mgba_session_step(struct mgba_session* session, unsigned frames);
void mgba_session_reset(struct mgba_session* session);

struct mgba_session_status mgba_session_status(const struct mgba_session* session);
/* Borrowed pixels, valid until the next STEP, RESET, or deinit. NULL before STEP. */
const color_t* mgba_session_frame(const struct mgba_session* session);

#ifdef __cplusplus
}
#endif

#endif
