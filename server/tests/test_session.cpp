#include <gtest/gtest.h>

#include <algorithm>
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
        save_path_ = rom_path_;
        save_path_.replace_extension(".sav");
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
        std::filesystem::remove(save_path_, ignored);
    }

    void Init() {
        ASSERT_TRUE(mgba_session_init(&session_, rom_path_.string().c_str()));
        initialized_ = true;
    }

    void WriteBatteryRom(uint8_t value) {
        std::array<uint8_t, 0x8000> rom{};
        rom[0x100] = 0xC3;
        rom[0x101] = 0x50;
        rom[0x102] = 0x01;
        rom[0x104] = 0xCE;
        rom[0x105] = 0xED;
        rom[0x106] = 0x66;
        rom[0x107] = 0x66;
        rom[0x147] = 0x03; // MBC1、RAM、バッテリー
        rom[0x149] = 0x02; // 8 KiBのRAM
        const std::array<uint8_t, 12> program = {
            0x3E, 0x0A,       // RAMを有効化する
            0xEA, 0x00, 0x00,
            0x3E, value,      // ゲーム内からSRAMへ書き込む
            0xEA, 0x23, 0xA1,
            0x18, 0xFE,
        };
        std::copy(program.begin(), program.end(), rom.begin() + 0x150);
        std::ofstream file(rom_path_, std::ios::binary | std::ios::trunc);
        file.write(reinterpret_cast<const char*>(rom.data()), rom.size());
        ASSERT_TRUE(file.good());
    }

    uint8_t ReadSavedByte() {
        session_.core->busWrite8(session_.core, 0x0000, 0x0A);
        uint8_t value = 0;
        mgba_session_read(&session_, 0xA123, &value, 1);
        return value;
    }

    std::filesystem::path rom_path_, save_path_;
    mgba_session session_{};
    bool initialized_ = false;
};

TEST_F(SessionTest, KeepsInputAcrossStepsAndClearsItOnReset) {
    Init();
    if (!initialized_) return;

    uint32_t width = 0, height = 0;
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
    EXPECT_TRUE(std::any_of(std::begin(session_.pixels), std::end(session_.pixels),
                            [](color_t pixel) { return pixel != 0; }));

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

TEST_F(SessionTest, UsesGameBoyDimensionsForSuperGameBoyROM) {
    // The SGB and old-licensee header flags make this ROM SGB-capable.
    std::fstream file(rom_path_, std::ios::binary | std::ios::in | std::ios::out);
    ASSERT_TRUE(file.is_open());
    file.seekp(0x146);
    file.put('\x03');
    file.seekp(0x14B);
    file.put('\x33');
    file.close();

    Init();
    if (!initialized_) return;

    uint32_t width = 0;
    uint32_t height = 0;
    session_.core->desiredVideoDimensions(session_.core, &width, &height);
    EXPECT_EQ(width, MGBA_SESSION_WIDTH);
    EXPECT_EQ(height, MGBA_SESSION_HEIGHT);
    mgba_session_step(&session_, 1);
    EXPECT_NE(mgba_session_frame(&session_), nullptr);
}

TEST_F(SessionTest, WritesGameSaveAndReloadsItAfterRestart) {
    WriteBatteryRom(0x5A);
    Init();
    if (!initialized_) return;

    mgba_session_step(&session_, 2);
    EXPECT_EQ(ReadSavedByte(), 0x5A);
    mgba_session_deinit(&session_);
    initialized_ = false;

    ASSERT_TRUE(std::filesystem::exists(save_path_));
    std::ifstream save(save_path_, std::ios::binary);
    save.seekg(0x123);
    EXPECT_EQ(save.get(), 0x5A);
    save.close();

    Init();
    if (!initialized_) return;
    EXPECT_EQ(ReadSavedByte(), 0x5A);
    mgba_session_reset(&session_);
    EXPECT_EQ(ReadSavedByte(), 0x5A);
}

TEST_F(SessionTest, LoadsExistingSaveForGbcRom) {
    WriteBatteryRom(0x5A);
    auto gbc_path = rom_path_;
    gbc_path.replace_extension(".gbc");
    std::filesystem::rename(rom_path_, gbc_path);
    rom_path_ = gbc_path;
    std::array<uint8_t, 0x2000> saved{};
    saved.fill(0xFF);
    saved[0x123] = 0x7B;
    std::ofstream file(save_path_, std::ios::binary);
    file.write(reinterpret_cast<const char*>(saved.data()), saved.size());
    file.close();

    Init();
    if (!initialized_) return;
    EXPECT_EQ(ReadSavedByte(), 0x7B);
}

TEST_F(SessionTest, FailsWhenSaveCannotBeOpened) {
    WriteBatteryRom(0x5A);
    ASSERT_TRUE(std::filesystem::create_directory(save_path_));

    testing::internal::CaptureStderr();
    bool result = mgba_session_init(&session_, rom_path_.string().c_str());
    std::string log = testing::internal::GetCapturedStderr();
    EXPECT_FALSE(result);
    EXPECT_EQ(session_.core, nullptr);
    EXPECT_NE(log.find("save_failed path=" + save_path_.string()), std::string::npos);
    EXPECT_EQ(log.find("errno=0"), std::string::npos);
}

} // namespace
