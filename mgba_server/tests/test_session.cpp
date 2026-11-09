#include <gtest/gtest.h>

#include <array>
#include <chrono>
#include <cstdint>
#include <filesystem>
#include <fstream>
#include <string>

#include "mgba_server/session.h"

namespace {

class SessionTest : public ::testing::Test {
protected:
    void SetUp() override {
        const auto stamp = std::chrono::steady_clock::now().time_since_epoch().count();
        rom_path_ = std::filesystem::temp_directory_path() /
                    ("mgba-session-test-" + std::to_string(stamp) + ".gb");
        std::array<uint8_t, 0x8000> rom{};
        rom[0x100] = 0xC3; // JP 0x0150
        rom[0x101] = 0x50;
        rom[0x102] = 0x01;
        rom[0x104] = 0xCE; // GB ROM identification bytes
        rom[0x105] = 0xED;
        rom[0x106] = 0x66;
        rom[0x107] = 0x66;
        rom[0x150] = 0x18; // JR -2
        rom[0x151] = 0xFE;
        std::ofstream file(rom_path_, std::ios::binary);
        file.write(reinterpret_cast<const char*>(rom.data()), rom.size());
        ASSERT_TRUE(file.good());
    }

    void TearDown() override {
        if (initialized_) {
            mgba_session_deinit(&session_);
        }
        std::error_code ignored;
        std::filesystem::remove(rom_path_, ignored);
    }

    void Init() {
        ASSERT_TRUE(mgba_session_init(&session_, rom_path_.string().c_str()));
        initialized_ = true;
    }

    std::filesystem::path rom_path_;
    mgba_session session_{};
    bool initialized_ = false;
};

TEST_F(SessionTest, KeepsInputAcrossStepsAndClearsItOnReset) {
    Init();
    if (!initialized_) return;

    unsigned width = 0, height = 0;
    session_.core->desiredVideoDimensions(session_.core, &width, &height);
    EXPECT_EQ(width, MGBA_SESSION_WIDTH);
    EXPECT_EQ(height, MGBA_SESSION_HEIGHT);
    EXPECT_EQ(mgba_session_frame(&session_), nullptr);

    mgba_session_press(&session_, MGBA_BUTTON_A);
    mgba_session_press(&session_, MGBA_BUTTON_B);
    EXPECT_EQ(session_.core->getKeys(session_.core), 3u);
    EXPECT_EQ(mgba_session_status(&session_).frames_elapsed, 0u);

    mgba_session_step(&session_, 2);
    EXPECT_EQ(mgba_session_frame(&session_), session_.pixels);
    EXPECT_EQ(mgba_session_status(&session_).frames_elapsed, 2u);
    EXPECT_TRUE(mgba_session_status(&session_).has_frame);

    mgba_session_release(&session_, MGBA_BUTTON_A);
    EXPECT_EQ(session_.core->getKeys(session_.core), 2u);
    mgba_session_step(&session_, 1);
    EXPECT_EQ(mgba_session_status(&session_).frames_elapsed, 3u);
    mgba_session_release(&session_, MGBA_BUTTON_ALL);
    EXPECT_EQ(session_.core->getKeys(session_.core), 0u);

    mgba_session_reset(&session_);
    EXPECT_EQ(mgba_session_status(&session_).frames_elapsed, 0u);
    EXPECT_EQ(mgba_session_status(&session_).pressed_keys, 0u);
    EXPECT_EQ(mgba_session_frame(&session_), nullptr);
}

} // namespace
