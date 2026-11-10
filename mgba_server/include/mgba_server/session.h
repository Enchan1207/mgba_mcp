#ifndef MGBA_SERVER_SESSION_H
#define MGBA_SERVER_SESSION_H

#include <mgba/core/core.h>
#include <stdbool.h>
#include <stdint.h>

#include "mgba_server/command.h"

#ifdef __cplusplus
extern "C" {
#endif

#define MGBA_SESSION_WIDTH 160U
#define MGBA_SESSION_HEIGHT 144U

/// @brief ゲームボーイのエミュレーションと画面画像を保持するセッション
struct mgba_session {
    struct mCore* core;
    color_t pixels[MGBA_SESSION_WIDTH * MGBA_SESSION_HEIGHT];
    uint32_t pressed_keys;
    uint64_t frames_elapsed;
    bool has_frame;
    bool config_initialized;
};

/// @brief セッションの入力状態と実行状態
struct mgba_session_status {
    uint32_t pressed_keys;
    uint64_t frames_elapsed;
    bool has_frame;
};

/// @brief ゲームボーイの ROM を読み込み、セッションを初期化する
/// @param session 初期化するセッション
/// @param rom_path ROM ファイルのパス
/// @return 初期化に成功した場合は true、失敗した場合は false
bool mgba_session_init(struct mgba_session* session, const char* rom_path);

/// @brief 初期化済みセッションのリソースを解放する
/// @param session 初期化に成功したセッション
void mgba_session_deinit(struct mgba_session* session);

/// @brief 指定したボタンを押した状態にする
/// @param session 初期化済みセッション
/// @param button 押すボタン。MGBA_BUTTON_ALL は操作しない
void mgba_session_press(struct mgba_session* session, enum mgba_button button);

/// @brief 指定したボタンを離した状態にする
/// @param session 初期化済みセッション
/// @param button 離すボタン。MGBA_BUTTON_ALL はすべてのボタンを離す
void mgba_session_release(struct mgba_session* session, enum mgba_button button);

/// @brief 指定したフレーム数だけエミュレーションを進める
/// @param session 初期化済みセッション
/// @param frames 実行するフレーム数
void mgba_session_step(struct mgba_session* session, uint32_t frames);

/// @brief セッションをリセットし、ボタン・経過フレーム数・画面画像の状態を初期化する
/// @param session 初期化済みセッション
void mgba_session_reset(struct mgba_session* session);

/// @brief 現在のセッション状態を取得する
/// @param session 初期化済みセッション
/// @return 押下中のボタン、経過フレーム数、画面画像の有無
struct mgba_session_status mgba_session_status(const struct mgba_session* session);

/// @brief 最新フレームの画面画像を取得する
/// @param session 初期化済みセッション
/// @return 画面画像へのポインタ。フレーム実行前またはリセット後は NULL
/// @note 返されたポインタはセッションが所有し、次のフレーム実行、リセット、解放まで有効
const color_t* mgba_session_frame(const struct mgba_session* session);

#ifdef __cplusplus
}
#endif

#endif
