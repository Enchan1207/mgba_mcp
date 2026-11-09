#include <gtest/gtest.h>

#include <string>

#include "mgba_server/command.h"

namespace {

void expect_error(const char* input) {
    mgba_command command{};
    command.type = MGBA_COMMAND_STEP;
    command.argument.frames = 73;
    const char* error = nullptr;

    SCOPED_TRACE(input);
    EXPECT_EQ(mgba_command_parse(input, &command, &error), MGBA_PARSE_ERROR);
    EXPECT_EQ(command.type, MGBA_COMMAND_STEP);
    EXPECT_EQ(command.argument.frames, 73u);
    ASSERT_NE(error, nullptr);
    EXPECT_NE(*error, '\0');
}

}  // namespace

TEST(CommandParserTest, ParsesEveryCommandKind) {
    struct Case {
        const char* input;
        mgba_command_type type;
    };
    constexpr Case cases[]{
        Case{"STEP 60", MGBA_COMMAND_STEP},
        Case{"PRESS A", MGBA_COMMAND_PRESS},
        Case{"RELEASE A", MGBA_COMMAND_RELEASE},
        Case{"RESET", MGBA_COMMAND_RESET},
        Case{"STATUS", MGBA_COMMAND_STATUS},
        Case{"CAPTURE", MGBA_COMMAND_CAPTURE},
        Case{"QUIT", MGBA_COMMAND_QUIT},
    };
    for (const auto& test : cases) {
        SCOPED_TRACE(test.input);
        mgba_command command{};
        const char* error = "previous error";
        ASSERT_EQ(mgba_command_parse(test.input, &command, &error), MGBA_PARSE_OK);
        EXPECT_EQ(command.type, test.type);
        EXPECT_EQ(error, nullptr);
    }
}

TEST(CommandParserTest, AcceptsCaseAndLineWhitespace) {
    mgba_command command{};
    const char* error = nullptr;

    ASSERT_EQ(mgba_command_parse(" \tstep\t00042 \r\n", &command, &error), MGBA_PARSE_OK);
    EXPECT_EQ(command.type, MGBA_COMMAND_STEP);
    EXPECT_EQ(command.argument.frames, 42u);
    EXPECT_EQ(error, nullptr);

    ASSERT_EQ(mgba_command_parse("  cApTuRe \n", &command, &error), MGBA_PARSE_OK);
    EXPECT_EQ(command.type, MGBA_COMMAND_CAPTURE);
}

TEST(CommandParserTest, ParsesFrameCountBoundaries) {
    struct Case {
        const char* input;
        unsigned frames;
    };
    constexpr Case cases[]{
        Case{"STEP 1", 1},
        Case{"STEP 900", 900},
        Case{"STEP 216000", MGBA_COMMAND_MAX_FRAMES},
    };
    for (const auto& test : cases) {
        SCOPED_TRACE(test.input);
        mgba_command command{};
        ASSERT_EQ(mgba_command_parse(test.input, &command, nullptr), MGBA_PARSE_OK);
        EXPECT_EQ(command.argument.frames, test.frames);
    }
}

TEST(CommandParserTest, RejectsInvalidFrameCounts) {
    for (const char* input : {
             "STEP", "STEP 0", "STEP 216001", "STEP -1", "STEP +1",
             "STEP 1.5", "STEP 12x", "STEP 9999999999999999999999999999"}) {
        expect_error(input);
    }
}

TEST(CommandParserTest, MapsAllButtonsForPressAndRelease) {
    struct Case {
        const char* name;
        mgba_button button;
    };
    constexpr Case cases[]{
        Case{"A", MGBA_BUTTON_A}, Case{"B", MGBA_BUTTON_B},
        Case{"SELECT", MGBA_BUTTON_SELECT}, Case{"START", MGBA_BUTTON_START},
        Case{"RIGHT", MGBA_BUTTON_RIGHT}, Case{"LEFT", MGBA_BUTTON_LEFT},
        Case{"UP", MGBA_BUTTON_UP}, Case{"DOWN", MGBA_BUTTON_DOWN},
        Case{"R", MGBA_BUTTON_R}, Case{"L", MGBA_BUTTON_L},
    };
    for (const auto& test : cases) {
        for (const char* verb : {"PRESS ", "RELEASE "}) {
            const auto input = std::string(verb) + test.name;
            SCOPED_TRACE(input);
            mgba_command command{};
            ASSERT_EQ(mgba_command_parse(input.c_str(), &command, nullptr), MGBA_PARSE_OK);
            EXPECT_EQ(command.argument.button, test.button);
        }
    }

    mgba_command command{};
    ASSERT_EQ(mgba_command_parse("release all", &command, nullptr), MGBA_PARSE_OK);
    EXPECT_EQ(command.type, MGBA_COMMAND_RELEASE);
    EXPECT_EQ(command.argument.button, MGBA_BUTTON_ALL);
}

TEST(CommandParserTest, RejectsInvalidButtonCommands) {
    for (const char* input : {
             "PRESS", "RELEASE", "PRESS ALL", "PRESS X", "RELEASE X",
             "PRESS A B", "RELEASE ALL A"}) {
        expect_error(input);
    }
}

TEST(CommandParserTest, RejectsArgumentsToNoArgumentCommandsAndUnknownCommands) {
    for (const char* input : {
             "RESET now", "STATUS verbose", "CAPTURE frame.raw", "QUIT now",
             "STEP 1 extra", "UNKNOWN", "PRES A"}) {
        expect_error(input);
    }
}

TEST(CommandParserTest, BlankLineIsIgnoredWithoutChangingOutput) {
    for (const char* input : {"", "  \t\r\n"}) {
        SCOPED_TRACE(input);
        mgba_command command{};
        command.type = MGBA_COMMAND_STEP;
        command.argument.frames = 73;
        const char* error = "previous error";
        EXPECT_EQ(mgba_command_parse(input, &command, &error), MGBA_PARSE_EMPTY);
        EXPECT_EQ(command.type, MGBA_COMMAND_STEP);
        EXPECT_EQ(command.argument.frames, 73u);
        EXPECT_EQ(error, nullptr);
    }
}

TEST(CommandParserTest, NullArgumentsReturnError) {
    mgba_command command{};
    const char* error = nullptr;
    EXPECT_EQ(mgba_command_parse(nullptr, &command, &error), MGBA_PARSE_ERROR);
    EXPECT_NE(error, nullptr);
    error = nullptr;
    EXPECT_EQ(mgba_command_parse("STEP 1", nullptr, &error), MGBA_PARSE_ERROR);
    EXPECT_NE(error, nullptr);
}
