#include "mgba_server/command.h"

#include <ctype.h>
#include <stddef.h>

struct token {
    const char* start;
    size_t length;
};

/// @brief 空白を読み飛ばし、次のトークンを取り出す
/// @param cursor 入力中の現在位置。取り出したトークンの末尾に更新する
/// @return 入力を参照するトークン。残りが空白のみの場合は長さ 0
static struct token next_token(const char** cursor) {
    const char* p = *cursor;
    while (isspace((uint8_t)*p)) {
        ++p;
    }

    struct token token = {p, 0};
    while (p[token.length] && !isspace((uint8_t)p[token.length])) {
        ++token.length;
    }

    *cursor = p + token.length;
    return token;
}

/// @brief トークンと文字列を大文字・小文字を区別せずに比較する
/// @param token 比較するトークン
/// @param word 比較対象の文字列
/// @return 一致する場合は 1、それ以外は 0
static int equals(struct token token, const char* word) {
    size_t i = 0;
    while (i < token.length && word[i]) {
        if (toupper((uint8_t)token.start[i]) !=
            toupper((uint8_t)word[i])) {
            return 0;
        }
        ++i;
    }
    return i == token.length && word[i] == '\0';
}

/// @brief エラーメッセージを設定してパース失敗を返す
/// @param error エラーメッセージの格納先。NULL の場合は設定しない
/// @param message 設定するエラーメッセージ
/// @return MGBA_PARSE_ERROR
static enum mgba_parse_result fail(const char** error, const char* message) {
    if (error) {
        *error = message;
    }
    return MGBA_PARSE_ERROR;
}

/// @brief トークンを有効なフレーム数に変換する
/// @param token 数字を含むトークン
/// @param frames 変換に成功したフレーム数の格納先
/// @return 1 以上 MGBA_COMMAND_MAX_FRAMES 以下の整数なら 1、それ以外は 0
static int parse_frames(struct token token, uint32_t* frames) {
    uint32_t value = 0;
    if (!token.length) {
        return 0;
    }

    for (size_t i = 0; i < token.length; ++i) {
        uint8_t c = (uint8_t)token.start[i];
        if (c < '0' || c > '9') {
            return 0;
        }

        uint32_t digit = c - '0';
        if (value > (MGBA_COMMAND_MAX_FRAMES - digit) / 10) {
            return 0;
        }
        value = value * 10 + digit;
    }

    if (!value) {
        return 0;
    }
    *frames = value;

    return 1;
}

/// @brief 1～4 桁の 16 進アドレスを読み取る
static int parse_address(struct token token, uint32_t* address) {
    if (!token.length || token.length > 4) {
        return 0;
    }
    uint32_t value = 0;
    for (size_t i = 0; i < token.length; ++i) {
        uint8_t c = (uint8_t)token.start[i];
        uint32_t digit;
        if (c >= '0' && c <= '9') digit = c - '0';
        else if (c >= 'A' && c <= 'F') digit = c - 'A' + 10;
        else if (c >= 'a' && c <= 'f') digit = c - 'a' + 10;
        else return 0;
        value = value * 16 + digit;
    }
    *address = value;
    return 1;
}

/// @brief アドレス空間を越えない十進バイト数を読み取る
static int parse_read_length(struct token token, uint32_t address, uint32_t* length) {
    if (!token.length) return 0;
    uint32_t value = 0;
    uint32_t limit = UINT32_C(0x10000) - address;
    for (size_t i = 0; i < token.length; ++i) {
        uint8_t c = (uint8_t)token.start[i];
        if (c < '0' || c > '9') return 0;
        uint32_t digit = c - '0';
        if (digit > limit || value > (limit - digit) / 10) return 0;
        value = value * 10 + digit;
    }
    if (!value) return 0;
    *length = value;
    return 1;
}

/// @brief トークンをコントローラボタンに変換する
/// @param token ボタン名を含むトークン
/// @param allow_all MGBA_BUTTON_ALL を許可する場合は 1
/// @param button 変換に成功したボタンの格納先
/// @return 有効なボタン名なら 1、それ以外は 0
static int parse_button(struct token token, int allow_all, enum mgba_button* button) {
    static const struct {
        const char* name;
        enum mgba_button value;
    } names[] = {
        {"A", MGBA_BUTTON_A},
        {"B", MGBA_BUTTON_B},
        {"SELECT", MGBA_BUTTON_SELECT},
        {"START", MGBA_BUTTON_START},
        {"RIGHT", MGBA_BUTTON_RIGHT},
        {"LEFT", MGBA_BUTTON_LEFT},
        {"UP", MGBA_BUTTON_UP},
        {"DOWN", MGBA_BUTTON_DOWN},
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

enum mgba_parse_result mgba_command_parse(
    const char* line,
    struct mgba_command* out,
    const char** error) {
    if (error) {
        *error = NULL;
    }
    if (!line || !out) {
        return fail(error, "null parser argument");
    }

    const char* cursor = line;
    struct token verb = next_token(&cursor);
    if (!verb.length) {
        return MGBA_PARSE_EMPTY;
    }

    struct token arg = next_token(&cursor);
    struct token extra = next_token(&cursor);
    struct mgba_command parsed = {0};

    if (equals(verb, "STEP")) {
        parsed.type = MGBA_COMMAND_STEP;
        if (!arg.length) {
            return fail(error, "STEP requires a frame count");
        }
        if (extra.length) {
            return fail(error, "too many arguments");
        }
        if (!parse_frames(arg, &parsed.argument.frames)) {
            return fail(error, "invalid frame count");
        }
    } else if (equals(verb, "PRESS") || equals(verb, "RELEASE")) {
        int release = equals(verb, "RELEASE");
        parsed.type = release ? MGBA_COMMAND_RELEASE : MGBA_COMMAND_PRESS;
        if (!arg.length) {
            return fail(error, "button is required");
        }
        if (extra.length) {
            return fail(error, "too many arguments");
        }
        if (!parse_button(arg, release, &parsed.argument.button)) {
            return fail(error, "unknown button");
        }
    } else if (equals(verb, "TYPE")) {
        parsed.type = MGBA_COMMAND_TYPE;
        if (!parse_button(arg, 0, &parsed.argument.type.button)) {
            return fail(error, "unknown button");
        }
        if (!parse_frames(extra, &parsed.argument.type.frames)) {
            return fail(error, "invalid frame count");
        }
        if (next_token(&cursor).length) {
            return fail(error, "too many arguments");
        }
    } else if (equals(verb, "READ")) {
        parsed.type = MGBA_COMMAND_READ;
        if (!parse_address(arg, &parsed.argument.read.address)) {
            return fail(error, "invalid address");
        }
        if (!parse_read_length(extra, parsed.argument.read.address, &parsed.argument.read.length)) {
            return fail(error, "invalid read length");
        }
        if (next_token(&cursor).length) {
            return fail(error, "too many arguments");
        }
    } else if (equals(verb, "RESET")) {
        parsed.type = MGBA_COMMAND_RESET;
    } else if (equals(verb, "STATUS")) {
        parsed.type = MGBA_COMMAND_STATUS;
    } else if (equals(verb, "CAPTURE")) {
        parsed.type = MGBA_COMMAND_CAPTURE;
    } else if (equals(verb, "QUIT")) {
        parsed.type = MGBA_COMMAND_QUIT;
    } else {
        return fail(error, "unknown command");
    }

    if (arg.length &&
        (parsed.type == MGBA_COMMAND_RESET || parsed.type == MGBA_COMMAND_STATUS ||
         parsed.type == MGBA_COMMAND_CAPTURE || parsed.type == MGBA_COMMAND_QUIT)) {
        return fail(error, "too many arguments");
    }

    *out = parsed;
    return MGBA_PARSE_OK;
}
