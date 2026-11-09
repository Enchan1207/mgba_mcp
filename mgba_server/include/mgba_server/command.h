#ifndef MGBA_SERVER_COMMAND_H
#define MGBA_SERVER_COMMAND_H

#ifdef __cplusplus
extern "C" {
#endif

// 最大5分 = 300sec = 18000frames
#define MGBA_COMMAND_MAX_FRAMES 18000U

/// @brief コマンド種別
enum mgba_command_type {
    /// @brief 指定フレームだけ進む
    MGBA_COMMAND_STEP,

    /// @brief 特定のボタンを押す
    MGBA_COMMAND_PRESS,

    /// @brief 特定のボタンを離す
    MGBA_COMMAND_RELEASE,

    /// @brief エミュレータをリセットする
    MGBA_COMMAND_RESET,

    /// @brief 現在の動作状態を取得する
    MGBA_COMMAND_STATUS,

    /// @brief 画面キャプチャを取得する
    MGBA_COMMAND_CAPTURE,

    /// @brief エミュレータとサーバを終了する
    MGBA_COMMAND_QUIT
};

/// @brief コントローラボタン
enum mgba_button {
    MGBA_BUTTON_A,
    MGBA_BUTTON_B,
    MGBA_BUTTON_SELECT,
    MGBA_BUTTON_START,
    MGBA_BUTTON_RIGHT,
    MGBA_BUTTON_LEFT,
    MGBA_BUTTON_UP,
    MGBA_BUTTON_DOWN,

    /// @brief すべてのボタン
    MGBA_BUTTON_ALL
};

/// @brief mGBAサーバに送信するコマンド
struct mgba_command {
    enum mgba_command_type type;
    union {
        unsigned frames;
        enum mgba_button button;
    } argument;
};

/// @brief コマンドのパース結果
enum mgba_parse_result {
    MGBA_PARSE_OK,
    MGBA_PARSE_EMPTY,
    MGBA_PARSE_ERROR
};

/// @brief コマンドをパースする
/// @param line 入力
/// @param out 出力の格納先
/// @param error エラー情報の格納先
/// @return パース結果
enum mgba_parse_result mgba_command_parse(const char* line, struct mgba_command* out, const char** error);

#ifdef __cplusplus
}
#endif

#endif
