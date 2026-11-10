#include <gtest/gtest.h>

#include <algorithm>
#include <array>
#include <chrono>
#include <cerrno>
#include <cstdint>
#include <filesystem>
#include <fstream>
#include <string>
#include <thread>
#include <sys/socket.h>
#include <sys/un.h>
#include <sys/wait.h>
#include <unistd.h>
#include <signal.h>

#ifndef SERVER_BINARY
#error SERVER_BINARY is required
#endif

namespace {
struct Reply { char result; std::string body; };
bool read_exact(int fd, char* p, size_t n) {
    while (n) {
        ssize_t got = recv(fd, p, n, 0);
        if (got <= 0) return false;
        p += got; n -= size_t(got);
    }
    return true;
}
Reply request(int fd, const std::string& line) {
    std::string wire = line + "\n";
    if (send(fd, wire.data(), wire.size(), 0) != static_cast<ssize_t>(wire.size())) return {'?', {}};
    char header[5];
    if (!read_exact(fd, header, 5)) return {'?', {}};
    uint32_t size = 0;
    for (int i = 0; i < 4; ++i) size |= uint32_t(uint8_t(header[i+1])) << (8*i);
    if (size > 1048576) return {'?', {}};
    std::string body(size, '\0');
    if (!read_exact(fd, body.data(), size)) return {'?', {}};
    char eop;
    if (!read_exact(fd, &eop, 1) || eop != '\n') return {'?', {}};
    return {header[0], body};
}
uint64_t frame_number(const Reply& r) {
    uint64_t v = 0;
    for (int i = 0; i < 8; ++i) v |= uint64_t(uint8_t(r.body[i])) << (i*8);
    return v;
}
class ServerTest : public ::testing::Test {
protected:
    void SetUp() override {
        auto stamp = std::to_string(getpid()) + "-" + std::to_string(std::chrono::steady_clock::now().time_since_epoch().count());
        rom_ = std::filesystem::temp_directory_path() / ("mgba-server-" + stamp + ".gb");
        sock_ = std::filesystem::path("/tmp") / ("ms-" + stamp + ".sock");
        log_ = std::filesystem::path("/tmp") / ("ms-" + stamp + ".log");
        std::array<uint8_t, 0x8000> rom{};
        rom[0x100] = 0xC3; rom[0x101] = 0x50; rom[0x102] = 0x01;
        rom[0x104] = 0xCE; rom[0x105] = 0xED; rom[0x106] = 0x66; rom[0x107] = 0x66;
        rom[0x150] = 0x18; rom[0x151] = 0xFE;
        std::ofstream f(rom_, std::ios::binary);
        f.write(reinterpret_cast<const char*>(rom.data()), rom.size());
        f.close();
        pid_ = fork();
        if (pid_ == 0) {
            freopen(log_.c_str(), "w", stderr);
            execl(SERVER_BINARY, SERVER_BINARY, "--rom", rom_.c_str(), "--socket", sock_.c_str(), nullptr);
            _exit(127);
        }
        ASSERT_GT(pid_, 0);
        for (int i = 0; i < 200 && !std::filesystem::exists(sock_); ++i)
            std::this_thread::sleep_for(std::chrono::milliseconds(10));
        ASSERT_TRUE(std::filesystem::exists(sock_));
    }
    void TearDown() override {
        if (pid_ > 0) { kill(pid_, SIGTERM); waitpid(pid_, nullptr, 0); }
        std::error_code ignored;
        std::filesystem::remove(rom_, ignored);
        std::filesystem::remove(sock_, ignored);
        std::filesystem::remove(log_, ignored);
    }
    int connect_as(const char* role) {
        int fd = socket(AF_UNIX, SOCK_STREAM, 0);
        sockaddr_un addr{}; addr.sun_family = AF_UNIX;
        strcpy(addr.sun_path, sock_.c_str());
        if (connect(fd, reinterpret_cast<sockaddr*>(&addr), sizeof addr) != 0) { close(fd); return -1; }
        auto hello = request(fd, std::string("HELLO ") + role);
        if (hello.result != 'S') { close(fd); return -1; }
        return fd;
    }
    std::filesystem::path rom_, sock_, log_;
    pid_t pid_ = -1;
};
TEST_F(ServerTest, RolesAndReconnect) {
    int control = connect_as("CONTROL"); ASSERT_GE(control, 0);
    int other = socket(AF_UNIX, SOCK_STREAM, 0);
    sockaddr_un addr{}; addr.sun_family = AF_UNIX; strcpy(addr.sun_path, sock_.c_str());
    ASSERT_EQ(connect(other, reinterpret_cast<sockaddr*>(&addr), sizeof addr), 0);
    auto busy = request(other, "HELLO CONTROL");
    EXPECT_EQ(busy.result, 'E'); EXPECT_EQ(busy.body, "CONTROL_BUSY"); close(other);
    int view = connect_as("VIEW"); ASSERT_GE(view, 0);
    EXPECT_EQ(request(view, "PRESS A").body, "FORBIDDEN");
    EXPECT_EQ(request(control, "WAIT_FRAME 1").body, "FORBIDDEN");
    close(control);
    for (int i = 0; i < 100; ++i) {
        control = connect_as("CONTROL"); if (control >= 0) break;
        std::this_thread::sleep_for(std::chrono::milliseconds(10));
    }
    EXPECT_GE(control, 0); if (control >= 0) close(control);
    close(view);
}
TEST_F(ServerTest, FrameResetWaitAndStatus) {
    int control = connect_as("CONTROL"), view = connect_as("VIEW");
    ASSERT_GE(control, 0); ASSERT_GE(view, 0);
    EXPECT_EQ(request(view, "CAPTURE").body, "NO_FRAME");
    EXPECT_EQ(request(view, "WAIT_FRAME 1").body, "TIMEOUT");
    EXPECT_EQ(request(control, "PRESS A").result, 'S');
    EXPECT_EQ(request(control, "STEP 2").result, 'S');
    auto image = request(view, "WAIT_FRAME 1000");
    ASSERT_EQ(image.result, 'S'); ASSERT_EQ(image.body.size(), 92170u);
    EXPECT_EQ(frame_number(image), 2u);
    EXPECT_EQ(uint8_t(image.body[8]), 160); EXPECT_EQ(uint8_t(image.body[9]), 144);
    EXPECT_TRUE(std::any_of(image.body.begin() + 10, image.body.end(),
                            [](char channel) { return channel != 0; }));
    EXPECT_EQ(request(control, "STATUS").body, "frames=2 pressed_keys=1 has_frame=true");
    EXPECT_EQ(request(control, "RESET").result, 'S');
    EXPECT_EQ(request(view, "WAIT_FRAME 1000").body, "NO_FRAME");
    EXPECT_EQ(request(control, "STATUS").body, "frames=0 pressed_keys=0 has_frame=false");
    close(view); close(control);
}
TEST_F(ServerTest, ReadsRawMemoryAsBinary) {
    int control = connect_as("CONTROL"), view = connect_as("VIEW");
    ASSERT_GE(control, 0); ASSERT_GE(view, 0);
    auto bytes = request(control, "READ 0150 2");
    ASSERT_EQ(bytes.result, 'S');
    ASSERT_EQ(bytes.body.size(), 2u);
    EXPECT_EQ(uint8_t(bytes.body[0]), 0x18u);
    EXPECT_EQ(uint8_t(bytes.body[1]), 0xFEu);
    auto zero = request(control, "READ D123 1");
    ASSERT_EQ(zero.result, 'S');
    ASSERT_EQ(zero.body.size(), 1u);
    EXPECT_EQ(uint8_t(zero.body[0]), 0u);
    EXPECT_EQ(request(view, "READ 0150 1").body, "FORBIDDEN");
    EXPECT_EQ(request(control, "READ FFFF 2").body, "BAD_REQUEST");
    close(view); close(control);
}
TEST_F(ServerTest, QuitWakesWaiterAndRemovesSocket) {
    int control = connect_as("CONTROL"), view = connect_as("VIEW");
    ASSERT_GE(control, 0); ASSERT_GE(view, 0);
    EXPECT_EQ(request(view, "WAIT_FRAME 1").body, "NO_FRAME");
    Reply pending{};
    std::thread waiter([&] { pending = request(view, "WAIT_FRAME 120000"); });
    std::this_thread::sleep_for(std::chrono::milliseconds(20));
    EXPECT_EQ(request(control, "QUIT").result, 'S');
    waiter.join();
    EXPECT_EQ(pending.result, 'E'); EXPECT_EQ(pending.body, "SERVER_SHUTDOWN");
    close(control); close(view);
    int status = 0; EXPECT_EQ(waitpid(pid_, &status, 0), pid_); pid_ = -1;
    EXPECT_FALSE(std::filesystem::exists(sock_));
}
TEST_F(ServerTest, ConcurrentCaptureAndUpdates) {
    int control = connect_as("CONTROL"), view = connect_as("VIEW");
    ASSERT_GE(control, 0); ASSERT_GE(view, 0);
    ASSERT_EQ(request(control, "STEP 1").result, 'S');
    std::array<Reply, 20> captures;
    std::thread reader([&] {
        for (auto& capture : captures) capture = request(view, "CAPTURE");
    });
    for (int i = 0; i < 20; ++i) ASSERT_EQ(request(control, "STEP 1").result, 'S');
    reader.join();
    for (const auto& capture : captures) {
        ASSERT_EQ(capture.result, 'S');
        ASSERT_EQ(capture.body.size(), 92170u);
        EXPECT_GE(frame_number(capture), 1u);
        EXPECT_LE(frame_number(capture), 21u);
        EXPECT_EQ(uint8_t(capture.body[8]), 160);
        EXPECT_EQ(uint8_t(capture.body[9]), 144);
        for (size_t i = 13; i < capture.body.size(); i += 4) EXPECT_EQ(capture.body[i], 0);
    }
    close(view); close(control);
}
TEST_F(ServerTest, LogsConnectionRequestResponseAndBinarySummary) {
    int control = connect_as("CONTROL"), view = connect_as("VIEW");
    ASSERT_GE(control, 0); ASSERT_GE(view, 0);
    ASSERT_EQ(request(control, "STEP 1").result, 'S');
    ASSERT_EQ(request(view, "CAPTURE").result, 'S');
    ASSERT_EQ(request(control, "QUIT").result, 'S');
    close(view); close(control);
    int status = 0; ASSERT_EQ(waitpid(pid_, &status, 0), pid_); pid_ = -1;
    std::ifstream file(log_);
    std::string logs((std::istreambuf_iterator<char>(file)), std::istreambuf_iterator<char>());
    EXPECT_NE(logs.find("client_connected client_id=1 role=CONTROL"), std::string::npos);
    EXPECT_NE(logs.find("command_received client_id=1 request_id=2 command=STEP 1"), std::string::npos);
    EXPECT_NE(logs.find("response_sent client_id=2 request_id=2 result=S body_length=92170 summary=(binary)"), std::string::npos);
    EXPECT_NE(logs.find("frame_update command=STEP version=1 frames=1"), std::string::npos);
    EXPECT_NE(logs.find("client_disconnected"), std::string::npos);
}
TEST_F(ServerTest, BoundsAndSplitInput) {
    int control = connect_as("CONTROL"); ASSERT_GE(control, 0);
    int view = connect_as("VIEW"); ASSERT_GE(view, 0);
    EXPECT_EQ(request(control, "STEP 0").body, "BAD_REQUEST");
    EXPECT_EQ(request(control, "STEP 18001").body, "BAD_REQUEST");
    EXPECT_EQ(request(control, "WAIT_FRAME 0").body, "BAD_REQUEST");
    EXPECT_EQ(request(view, "WAIT_FRAME 120001").body, "BAD_REQUEST");
    EXPECT_EQ(request(control, "STATUS EXTRA").body, "BAD_REQUEST");
    EXPECT_EQ(request(control, "release all").result, 'S');
    EXPECT_EQ(request(control, std::string("STATUS") + std::string(25, ' ')).result, 'S');
    const char* part = "STA"; ASSERT_EQ(send(control, part, 3, 0), 3);
    EXPECT_EQ(request(control, "TUS").body, "frames=0 pressed_keys=0 has_frame=false");
    std::string long_line(32, 'X'); long_line += '\n';
    ASSERT_EQ(send(control, long_line.data(), long_line.size(), 0), static_cast<ssize_t>(long_line.size()));
    char ch;
    const ssize_t received = recv(control, &ch, 1, 0);
    EXPECT_TRUE(received == 0 || (received == -1 && errno == ECONNRESET));
    close(view);
    close(control);
}
} // namespace
