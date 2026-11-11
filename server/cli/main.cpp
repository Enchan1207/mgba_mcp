#include "mgba_server/command.h"
#include "mgba_server/session.h"

#include <algorithm>
#include <atomic>
#include <chrono>
#include <condition_variable>
#include <cerrno>
#include <cctype>
#include <ctime>
#include <memory>
#include <csignal>
#include <cstdint>
#include <cstdio>
#include <cstring>
#include <deque>
#include <future>
#include <inttypes.h>
#include <mutex>
#include <string>
#include <thread>
#include <vector>
#include <poll.h>
#include <sys/socket.h>
#include <sys/stat.h>
#include <sys/un.h>
#include <unistd.h>

namespace {
constexpr size_t image_size = MGBA_SESSION_WIDTH * MGBA_SESSION_HEIGHT * 4;
volatile sig_atomic_t signal_stop = 0;
void on_signal(int) { signal_stop = 1; }
std::mutex log_mutex;
std::string escaped(const std::string& s) {
    std::string out;
    for (uint8_t c : s) {
        if (c == '\n') out += "\\n";
        else if (c == '\r') out += "\\r";
        else if (c == '\t') out += "\\t";
        else if (c < 32 || c == 127) { char b[5]; snprintf(b, sizeof b, "\\x%02X", c); out += b; }
        else out += char(c);
    }
    return out;
}
void log_line(const char* level, const char* event, const std::string& details) {
    std::lock_guard<std::mutex> lock(log_mutex);
    timespec ts{}; clock_gettime(CLOCK_REALTIME, &ts);
    tm utc{}; gmtime_r(&ts.tv_sec, &utc);
    char date[32]; strftime(date, sizeof date, "%Y-%m-%dT%H:%M:%S", &utc);
    fprintf(stderr, "%s.%03ldZ %s %s %s\n", date, ts.tv_nsec / 1000000, level, event, details.c_str());
}
void put_le(std::string& s, uint64_t v, uint32_t bytes) {
    for (uint32_t i = 0; i < bytes; ++i) s.push_back(char((v >> (i * 8)) & 255));
}
bool send_all(int fd, const void* data, size_t n) {
    auto* p = static_cast<const char*>(data);
    while (n) {
        ssize_t sent = send(fd, p, n, MSG_NOSIGNAL);
        if (sent < 0 && errno == EINTR) continue;
        if (sent <= 0) return false;
        p += sent; n -= size_t(sent);
    }
    return true;
}
bool send_reply(int fd, bool ok, const std::string& body) {
    if (body.size() > 1048576) return false;
    std::string header(1, ok ? 'S' : 'E');
    put_le(header, body.size(), 4);
    return send_all(fd, header.data(), header.size()) &&
           send_all(fd, body.data(), body.size()) && send_all(fd, "\n", 1);
}
// Returns false on EOF, I/O failure, or a line longer than 32 bytes.
bool read_line(int fd, std::string& line) {
    line.clear();
    for (;;) {
        char c;
        ssize_t n = recv(fd, &c, 1, 0);
        if (n < 0 && errno == EINTR) continue;
        if (n != 1) return false;
        if (line.size() == 31 && c != '\n') return false;
        if (c == '\n') return true;
        line.push_back(c);
    }
}
bool ascii_line(const std::string& line) {
    return std::all_of(line.begin(), line.end(), [](uint8_t c) { return c >= 32 && c <= 126; });
}
bool equals_ci(const std::string& a, const char* b) {
    size_t n = strlen(b);
    if (a.size() != n) return false;
    for (size_t i = 0; i < n; ++i)
        if (toupper(static_cast<uint8_t>(a[i])) != b[i]) return false;
    return true;
}
bool timeout_arg(const std::string& line, uint32_t& value) {
    if (line.size() <= 11 || !equals_ci(line.substr(0, 11), "WAIT_FRAME ")) return false;
    value = 0;
    for (size_t i = 11; i < line.size(); ++i) {
        if (line[i] < '0' || line[i] > '9') return false;
        uint32_t d = uint32_t(line[i] - '0');
        if (value > (120000 - d) / 10) return false;
        value = value * 10 + d;
    }
    return value >= 1;
}
struct Result { bool ok = true; std::string body; };
struct Work { mgba_command command; std::promise<Result> promise; };
class Server {
public:
    explicit Server(const char* rom) : rom_(rom) {}
    bool init() { return mgba_session_init(&session_, rom_.c_str()); }
    void run(int listener) {
        worker_ = std::thread([this] { worker_loop(); });
        while (!stopping_ && !signal_stop) {
            pollfd p{listener, POLLIN, 0};
            int rc = poll(&p, 1, 100);
            if (rc < 0 && errno == EINTR) continue;
            if (rc <= 0 || !(p.revents & POLLIN)) continue;
            int fd = accept(listener, nullptr, nullptr);
            if (fd < 0) { log_line("WARN", "accept_failed", std::to_string(errno)); continue; }
            uint64_t id = ++next_id_;
            std::lock_guard<std::mutex> lock(clients_mutex_);
            fds_.push_back(fd);
            clients_.emplace_back([this, fd, id] { client_loop(fd, id); });
        }
        stopping_ = true;
        frame_cv_.notify_all();
        work_cv_.notify_all();
        close(listener);
        // Allow in-flight QUIT and WAIT_FRAME responses to finish before interrupting idle reads.
        std::this_thread::sleep_for(std::chrono::milliseconds(100));
        { std::lock_guard<std::mutex> lock(clients_mutex_);
          for (int fd : fds_) if (fd >= 0) shutdown(fd, SHUT_RDWR); }
        for (auto& t : clients_) t.join();
        worker_.join();
        mgba_session_deinit(&session_);
    }
    bool stopping() const { return stopping_; }
private:
    void worker_loop() {
        for (;;) {
            std::shared_ptr<Work> work;
            { std::unique_lock<std::mutex> lock(work_mutex_);
              work_cv_.wait(lock, [&] { return stopping_ || !queue_.empty(); });
              if (queue_.empty()) return;
              work = queue_.front(); queue_.pop_front(); }
            Result result;
            auto c = work->command;
            if (c.type == MGBA_COMMAND_STEP) {
                step_and_publish(c.argument.frames, "STEP");
            } else if (c.type == MGBA_COMMAND_TYPE) {
                mgba_session_press(&session_, c.argument.type.button);
                step_and_publish(c.argument.type.frames, "TYPE");
                mgba_session_release(&session_, c.argument.type.button);
                step_and_publish(c.argument.type.frames, "TYPE");
            } else if (c.type == MGBA_COMMAND_RESET) {
                mgba_session_reset(&session_);
                std::lock_guard<std::mutex> lock(state_mutex_);
                has_frame_ = false; frames_ = 0; keys_ = 0;
                log_line("INFO", "frame_update", "command=RESET version=" + std::to_string(++version_) + " frames=0");
                frame_cv_.notify_all();
            } else if (c.type == MGBA_COMMAND_PRESS || c.type == MGBA_COMMAND_RELEASE) {
                if (c.type == MGBA_COMMAND_PRESS) mgba_session_press(&session_, c.argument.button);
                else mgba_session_release(&session_, c.argument.button);
                std::lock_guard<std::mutex> lock(state_mutex_);
                keys_ = session_.pressed_keys;
            } else if (c.type == MGBA_COMMAND_READ) {
                result.body.resize(c.argument.read.length);
                mgba_session_read(&session_, c.argument.read.address,
                                  reinterpret_cast<uint8_t*>(result.body.data()),
                                  c.argument.read.length);
            } else if (c.type == MGBA_COMMAND_QUIT) {
                stopping_ = true; frame_cv_.notify_all(); work_cv_.notify_all();
            }
            work->promise.set_value(std::move(result));
        }
    }
    void step_and_publish(uint32_t frames, const char* command) {
        mgba_session_step(&session_, frames);
        std::lock_guard<std::mutex> lock(state_mutex_);
        publish_frame();
        log_line("INFO", "frame_update", "command=" + std::string(command) + " version=" + std::to_string(++version_) + " frames=" + std::to_string(frames_));
        frame_cv_.notify_all();
    }
    void publish_frame() {
        const color_t* src = mgba_session_frame(&session_);
        for (size_t i = 0; i < MGBA_SESSION_WIDTH * MGBA_SESSION_HEIGHT; ++i) {
            uint32_t pixel = src[i];
            // mGBA color_t uses native R/G/B bit positions with a 32-bit build.
            pixels_[4*i] = char(pixel & 255);
            pixels_[4*i+1] = char((pixel >> 8) & 255);
            pixels_[4*i+2] = char((pixel >> 16) & 255);
            pixels_[4*i+3] = 0;
        }
        frames_ = session_.frames_elapsed;
        keys_ = session_.pressed_keys;
        has_frame_ = true;
    }
    Result submit(const mgba_command& c) {
        auto w = std::make_shared<Work>(); w->command = c;
        auto future = w->promise.get_future();
        { std::lock_guard<std::mutex> lock(work_mutex_); queue_.push_back(w); }
        work_cv_.notify_one();
        return future.get();
    }
    Result capture(uint64_t& seen, bool& seen_set) {
        std::lock_guard<std::mutex> lock(state_mutex_);
        seen = version_; seen_set = true;
        if (!has_frame_) return {false, "NO_FRAME"};
        std::string body; body.reserve(10 + image_size);
        put_le(body, frames_, 8);
        body.push_back(char(MGBA_SESSION_WIDTH)); body.push_back(char(MGBA_SESSION_HEIGHT));
        body.append(pixels_.data(), pixels_.size());
        return {true, std::move(body)};
    }
    Result wait_frame(uint32_t ms, uint64_t& seen, bool& seen_set) {
        std::unique_lock<std::mutex> lock(state_mutex_);
        if (seen_set && version_ == seen && !stopping_) {
            if (!frame_cv_.wait_for(lock, std::chrono::milliseconds(ms), [&] { return version_ != seen || stopping_; }))
                return {false, "TIMEOUT"};
        }
        if (stopping_) return {false, "SERVER_SHUTDOWN"};
        lock.unlock();
        return capture(seen, seen_set);
    }
    void client_loop(int fd, uint64_t id) {
        std::string prefix = "client_id=" + std::to_string(id);
        std::string line, role = "UNKNOWN", reason = "eof";
        uint64_t request_id = 0, seen = 0;
        bool seen_set = false, owns_control = false;
        auto respond = [&](const Result& r, const std::string& command, std::chrono::steady_clock::time_point start) {
            if (!send_reply(fd, r.ok, r.body)) { reason = "send_failed"; log_line("WARN", "communication_failed", prefix + " operation=send errno=" + std::to_string(errno)); return false; }
            auto us = std::chrono::duration_cast<std::chrono::microseconds>(std::chrono::steady_clock::now() - start).count();
            std::string summary = r.ok && (command == "CAPTURE" || command == "WAIT_FRAME" || command == "READ")
                ? "(binary)" : escaped(r.body);
            log_line("INFO", "response_sent", prefix + " request_id=" + std::to_string(request_id) + " result=" + (r.ok ? "S" : "E") + " body_length=" + std::to_string(r.body.size()) + " summary=" + summary + " duration_us=" + std::to_string(us));
            return true;
        };
        if (!read_line(fd, line)) { reason = "read_failed"; log_line("WARN", "communication_failed", prefix + " operation=read_hello"); goto done; }
        ++request_id;
        { auto start = std::chrono::steady_clock::now();
          bool control = equals_ci(line, "HELLO CONTROL"), view = equals_ci(line, "HELLO VIEW");
          if (!ascii_line(line) || (!control && !view)) {
              respond({false, "BAD_REQUEST"}, "HELLO", start); reason = "bad_hello"; goto done;
          }
          if (control) {
              std::lock_guard<std::mutex> lock(control_mutex_);
              if (control_taken_) { respond({false, "CONTROL_BUSY"}, "HELLO", start); reason = "control_busy"; goto done; }
              control_taken_ = true; owns_control = true; role = "CONTROL";
          } else role = "VIEW";
          log_line("INFO", "client_connected", prefix + " role=" + role);
          log_line("INFO", "command_received", prefix + " request_id=1 command=HELLO " + role);
          if (!respond({}, "HELLO", start)) goto done;
        }
        while (!stopping_ && !signal_stop) {
            if (!read_line(fd, line)) { reason = "read_failed"; log_line("WARN", "communication_failed", prefix + " operation=read_request"); break; }
            ++request_id;
            auto start = std::chrono::steady_clock::now();
            log_line("INFO", "command_received", prefix + " request_id=" + std::to_string(request_id) + " command=" + escaped(line));
            Result result;
            bool close_after = false;
            if (!ascii_line(line)) result = {false, "BAD_REQUEST"};
            else if (line.size() >= 10 && equals_ci(line.substr(0, 10), "WAIT_FRAME")) {
                uint32_t ms = 0;
                if (!timeout_arg(line, ms)) result = {false, "BAD_REQUEST"};
                else if (role != "VIEW") result = {false, "FORBIDDEN"};
                else { result = wait_frame(ms, seen, seen_set); close_after = result.body == "SERVER_SHUTDOWN"; }
            } else {
                mgba_command c{};
                if (mgba_command_parse(line.c_str(), &c, nullptr) != MGBA_PARSE_OK) result = {false, "BAD_REQUEST"};
                else if (role == "VIEW" && c.type != MGBA_COMMAND_STATUS && c.type != MGBA_COMMAND_CAPTURE) result = {false, "FORBIDDEN"};
                else if (c.type == MGBA_COMMAND_STATUS) {
                    std::lock_guard<std::mutex> lock(state_mutex_);
                    result.body = "frames=" + std::to_string(frames_) + " pressed_keys=" + std::to_string(keys_) + " has_frame=" + (has_frame_ ? "true" : "false");
                } else if (c.type == MGBA_COMMAND_CAPTURE) result = capture(seen, seen_set);
                else { result = submit(c); close_after = c.type == MGBA_COMMAND_QUIT; }
            }
            if (!respond(result, line.substr(0, line.find(' ')), start)) break;
            if (close_after) { reason = "shutdown"; break; }
        }
    done:
        if (owns_control) { std::lock_guard<std::mutex> lock(control_mutex_); control_taken_ = false; }
        log_line("INFO", "client_disconnected", prefix + " role=" + role + " reason=" + reason);
        { std::lock_guard<std::mutex> lock(clients_mutex_);
          auto it = std::find(fds_.begin(), fds_.end(), fd);
          if (it != fds_.end()) *it = -1; }
        close(fd);
    }
    std::string rom_;
    mgba_session session_{};
    std::atomic<bool> stopping_{false};
    std::atomic<uint64_t> next_id_{0};
    std::mutex state_mutex_, work_mutex_, control_mutex_, clients_mutex_;
    std::condition_variable frame_cv_, work_cv_;
    bool control_taken_ = false, has_frame_ = false;
    uint64_t version_ = 0, frames_ = 0;
    uint32_t keys_ = 0;
    std::string pixels_ = std::string(image_size, '\0');
    std::deque<std::shared_ptr<Work>> queue_;
    std::thread worker_;
    std::vector<std::thread> clients_;
    std::vector<int> fds_;
};
}
int main(int argc, char** argv) {
    if (argc != 5 || strcmp(argv[1], "--rom") || strcmp(argv[3], "--socket")) {
        fprintf(stderr, "Usage: %s --rom ROM_PATH --socket SOCKET_PATH\n", argv[0]); return 1;
    }
    const std::string rom = argv[2], path = argv[4];
    sockaddr_un addr{}; addr.sun_family = AF_UNIX;
    if (path.empty() || path.size() >= sizeof addr.sun_path) { log_line("ERROR", "socket_failed", "path=" + escaped(path) + " reason=invalid_path"); return 1; }
    memcpy(addr.sun_path, path.c_str(), path.size() + 1);
    struct sigaction action{}; action.sa_handler = on_signal; sigemptyset(&action.sa_mask);
    sigaction(SIGINT, &action, nullptr); sigaction(SIGTERM, &action, nullptr);
    Server server(rom.c_str());
    if (!server.init()) { log_line("ERROR", "rom_failed", "rom=" + escaped(rom)); return 1; }
    int fd = socket(AF_UNIX, SOCK_STREAM, 0);
    if (fd < 0) { log_line("ERROR", "socket_failed", "errno=" + std::to_string(errno)); return 1; }
    bool bound = false;
    if (access(path.c_str(), F_OK) == 0 || (errno != ENOENT)) {
        log_line("ERROR", "socket_failed", "path=" + escaped(path) + " reason=exists"); close(fd); return 1;
    }
    mode_t old_mask = umask(077);
    if (bind(fd, reinterpret_cast<sockaddr*>(&addr), sizeof addr) == 0) bound = true;
    umask(old_mask);
    if (!bound || chmod(path.c_str(), 0600) || listen(fd, 32)) {
        log_line("ERROR", "socket_failed", "path=" + escaped(path) + " errno=" + std::to_string(errno));
        close(fd); if (bound) unlink(path.c_str()); return 1;
    }
    log_line("INFO", "server_started", "rom=" + escaped(rom) + " socket=" + escaped(path));
    server.run(fd);
    unlink(path.c_str());
    log_line("INFO", "server_stopped", "rom=" + escaped(rom) + " socket=" + escaped(path) + " reason=" + (signal_stop ? "signal" : "quit"));
    return 0;
}
