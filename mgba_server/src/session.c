#include "mgba_server/session.h"

#include <mgba/internal/gb/input.h>

/// @brief ボタンを mGBA の入力ビットに変換する
/// @param button 変換するボタン
/// @return 対応する入力ビット。MGBA_BUTTON_ALL または無効な値の場合は 0
static uint32_t button_mask(enum mgba_button button) {
    switch (button) {
        case MGBA_BUTTON_A:
            return UINT32_C(1) << GB_KEY_A;
        case MGBA_BUTTON_B:
            return UINT32_C(1) << GB_KEY_B;
        case MGBA_BUTTON_SELECT:
            return UINT32_C(1) << GB_KEY_SELECT;
        case MGBA_BUTTON_START:
            return UINT32_C(1) << GB_KEY_START;
        case MGBA_BUTTON_RIGHT:
            return UINT32_C(1) << GB_KEY_RIGHT;
        case MGBA_BUTTON_LEFT:
            return UINT32_C(1) << GB_KEY_LEFT;
        case MGBA_BUTTON_UP:
            return UINT32_C(1) << GB_KEY_UP;
        case MGBA_BUTTON_DOWN:
            return UINT32_C(1) << GB_KEY_DOWN;
        case MGBA_BUTTON_ALL:
            return 0;
    }
    return 0;
}

bool mgba_session_init(struct mgba_session* session, const char* rom_path) {
    if (!session || !rom_path) {
        return false;
    }
    memset(session, 0, sizeof(*session));

    struct mCore* core = mCoreFind(rom_path);
    if (!core) {
        return false;
    }
    if (!core->init(core)) {
        free(core);
        return false;
    }
    session->core = core;
    if (core->platform(core) != mPLATFORM_GB || !mCoreLoadFile(core, rom_path)) {
        goto fail;
    }

    mCoreInitConfig(core, NULL);
    session->config_initialized = true;
    mCoreConfigSetValue(&core->config, "gb.model", "DMG");
    mCoreConfigSetValue(&core->config, "sgb.model", "DMG");
    mCoreConfigSetValue(&core->config, "cgb.hybridModel", "DMG");
    mCoreConfigSetValue(&core->config, "cgb.sgbModel", "DMG");
    mCoreLoadConfig(core);
    core->reset(core);

    unsigned width = 0;
    unsigned height = 0;
    core->desiredVideoDimensions(core, &width, &height);
    if (width != MGBA_SESSION_WIDTH || height != MGBA_SESSION_HEIGHT) {
        goto fail;
    }
    core->setVideoBuffer(core, session->pixels, MGBA_SESSION_WIDTH);
    return true;

fail:
    mgba_session_deinit(session);
    return false;
}

void mgba_session_deinit(struct mgba_session* session) {
    if (!session) {
        return;
    }
    if (session->core) {
        if (session->config_initialized) {
            mCoreConfigDeinit(&session->core->config);
        }
        session->core->deinit(session->core);
    }
    memset(session, 0, sizeof(*session));
}

void mgba_session_press(struct mgba_session* session, enum mgba_button button) {
    uint32_t mask = button_mask(button);
    if (mask) {
        session->pressed_keys |= mask;
        session->core->setKeys(session->core, session->pressed_keys);
    }
}

void mgba_session_release(struct mgba_session* session, enum mgba_button button) {
    if (button == MGBA_BUTTON_ALL) {
        session->pressed_keys = 0;
    } else {
        session->pressed_keys &= ~button_mask(button);
    }
    session->core->setKeys(session->core, session->pressed_keys);
}

void mgba_session_step(struct mgba_session* session, unsigned frames) {
    for (unsigned i = 0; i < frames; ++i) {
        session->core->runFrame(session->core);
    }
    session->frames_elapsed += frames;
    if (frames) {
        session->has_frame = true;
    }
}

void mgba_session_reset(struct mgba_session* session) {
    session->pressed_keys = 0;
    session->core->setKeys(session->core, 0);
    session->core->reset(session->core);
    session->core->setVideoBuffer(session->core, session->pixels, MGBA_SESSION_WIDTH);
    session->frames_elapsed = 0;
    session->has_frame = false;
}

struct mgba_session_status mgba_session_status(const struct mgba_session* session) {
    struct mgba_session_status status = {
        session->pressed_keys,
        session->frames_elapsed,
        session->has_frame,
    };
    return status;
}

const color_t* mgba_session_frame(const struct mgba_session* session) {
    return session->has_frame ? session->pixels : NULL;
}
