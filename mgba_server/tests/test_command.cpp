#include <gtest/gtest.h>

#include "mgba_server/command.h"

TEST(CommandTest, ParsesStep) {
    mgba_command command{};
    const char* error = nullptr;

    EXPECT_EQ(mgba_command_parse("step 120", &command, &error), MGBA_PARSE_OK);
    EXPECT_EQ(command.type, MGBA_COMMAND_STEP);
    EXPECT_EQ(command.argument.frames, 120u);
    EXPECT_EQ(error, nullptr);
}

TEST(CommandTest, RejectsInvalidFrameCountWithoutChangingOutput) {
    mgba_command command{};
    command.type = MGBA_COMMAND_QUIT;
    const char* error = nullptr;

    EXPECT_EQ(mgba_command_parse("STEP 216001", &command, &error), MGBA_PARSE_ERROR);
    EXPECT_EQ(command.type, MGBA_COMMAND_QUIT);
    EXPECT_NE(error, nullptr);
}
