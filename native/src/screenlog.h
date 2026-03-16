#pragma once
#include <string>
#include <vector>
#include <cstdio>
#include <cstdarg>
#include <mutex>

#ifdef GENESIS_ANDROID
#include <android/log.h>
#endif

// ═══ ScreenLog: ring buffer of messages + file export ═══════════════════════
// Logs are:
//   1. Written to a .txt file in Downloads (Android) or current dir (desktop)
//   2. Kept in a ring buffer for on-screen overlay rendering
//   3. Also sent to Android logcat

class ScreenLog {
public:
    static constexpr int MAX_LINES = 30;
    static constexpr int MAX_LINE_LEN = 80;

    struct Line {
        char text[MAX_LINE_LEN];
        float r, g, b;
        float timestamp;
    };

    static ScreenLog& get() {
        static ScreenLog instance;
        return instance;
    }

    void init(const char* logDir) {
        std::lock_guard<std::mutex> lock(mtx);
        // Build file path
        if (logDir && logDir[0]) {
            snprintf(logPath, sizeof(logPath), "%s/genesis_crash_log.txt", logDir);
        } else {
            snprintf(logPath, sizeof(logPath), "genesis_crash_log.txt");
        }
        fp = fopen(logPath, "w");
        if (fp) {
            fprintf(fp, "=== Genesis 3.0 Native Log ===\n");
            fflush(fp);
        }
        // Log the path itself
        addInternal(1, 1, 1, "[LOG] Writing to: %s", logPath);
    }

    void info(const char* fmt, ...) {
        char buf[MAX_LINE_LEN];
        va_list args;
        va_start(args, fmt);
        vsnprintf(buf, MAX_LINE_LEN, fmt, args);
        va_end(args);
        addInternal(0.8f, 0.8f, 0.8f, "%s", buf);
    }

    void ok(const char* fmt, ...) {
        char buf[MAX_LINE_LEN];
        va_list args;
        va_start(args, fmt);
        vsnprintf(buf, MAX_LINE_LEN, fmt, args);
        va_end(args);
        addInternal(0.2f, 1.0f, 0.4f, "%s", buf);
    }

    void warn(const char* fmt, ...) {
        char buf[MAX_LINE_LEN];
        va_list args;
        va_start(args, fmt);
        vsnprintf(buf, MAX_LINE_LEN, fmt, args);
        va_end(args);
        addInternal(1.0f, 0.8f, 0.2f, "%s", buf);
    }

    void error(const char* fmt, ...) {
        char buf[MAX_LINE_LEN];
        va_list args;
        va_start(args, fmt);
        vsnprintf(buf, MAX_LINE_LEN, fmt, args);
        va_end(args);
        addInternal(1.0f, 0.2f, 0.2f, "%s", buf);
    }

    void flush() {
        std::lock_guard<std::mutex> lock(mtx);
        if (fp) fflush(fp);
    }

    void close() {
        std::lock_guard<std::mutex> lock(mtx);
        if (fp) { fclose(fp); fp = nullptr; }
    }

    const char* getLogPath() const { return logPath; }

    // Access lines for rendering (call from render thread only)
    int getLineCount() const { return count < MAX_LINES ? count : MAX_LINES; }
    const Line& getLine(int i) const {
        // i=0 is oldest visible, i=getLineCount()-1 is newest
        int total = getLineCount();
        int idx = (writePos - total + i + MAX_LINES) % MAX_LINES;
        return lines[idx];
    }

private:
    Line lines[MAX_LINES] = {};
    int writePos = 0;
    int count = 0;
    FILE* fp = nullptr;
    char logPath[512] = {};
    std::mutex mtx;
    float startTime = 0;
    bool startTimeSet = false;

    ScreenLog() = default;

    void addInternal(float r, float g, float b, const char* fmt, ...) {
        std::lock_guard<std::mutex> lock(mtx);

        Line& line = lines[writePos];
        va_list args;
        va_start(args, fmt);
        vsnprintf(line.text, MAX_LINE_LEN, fmt, args);
        va_end(args);
        line.r = r;
        line.g = g;
        line.b = b;

        writePos = (writePos + 1) % MAX_LINES;
        if (count < MAX_LINES) count++;

        // Write to file
        if (fp) {
            fprintf(fp, "%s\n", line.text);
            fflush(fp);  // Flush every line so we don't lose data on crash
        }

        // Also logcat on Android
#ifdef GENESIS_ANDROID
        __android_log_print(ANDROID_LOG_INFO, "Genesis", "%s", line.text);
#else
        printf("%s\n", line.text);
#endif
    }
};

// Convenience macros
#define SLOG_INFO(...)  ScreenLog::get().info(__VA_ARGS__)
#define SLOG_OK(...)    ScreenLog::get().ok(__VA_ARGS__)
#define SLOG_WARN(...)  ScreenLog::get().warn(__VA_ARGS__)
#define SLOG_ERROR(...) ScreenLog::get().error(__VA_ARGS__)
