#include "engine.h"
#include "renderer.h"
#include "screenlog.h"
#include "gui.h"
#include <cstdio>

// For OpenGL state reset between renderer and ImGui
#ifdef GENESIS_ANDROID
#include <GLES2/gl2.h>
#else
#include <GL/glew.h>
#endif
#include <chrono>
#include <csignal>
#include <cstdlib>

#ifdef _WIN32
#include <windows.h>
#else
#include <unistd.h>
#endif

#ifdef GENESIS_ANDROID
#include <SDL.h>
#include <android/log.h>
#else
#include <SDL2/SDL.h>
#endif

// Signal handler for crash diagnostics
static Engine* g_engine = nullptr;
static void signalHandler(int sig) {
    signal(sig, SIG_DFL);
    if (g_engine) {
        SLOG_ERROR("!!! CRASH sig=%d section=%d particle=%d pop=%d bonds=%d nutr=%d !!!",
                   sig, g_engine->crashSection, g_engine->crashParticleIdx,
                   (int)g_engine->state.particles.size(),
                   (int)g_engine->state.bonds.size(),
                   (int)g_engine->state.nutrients.size());
    } else {
        SLOG_ERROR("!!! CRASH SIGNAL %d (no engine) !!!", sig);
    }
    ScreenLog::get().flush();
#ifdef _WIN32
    ExitProcess(1);
#else
    _exit(1);
#endif
}

int main(int argc, char* argv[]) {
    (void)argc; (void)argv;

    signal(SIGSEGV, signalHandler);
    signal(SIGABRT, signalHandler);
    signal(SIGFPE, signalHandler);

    // ─── Init Log File ───────────────────────────────────────────
#ifdef GENESIS_ANDROID
    const char* extPath = SDL_AndroidGetExternalStoragePath();
    if (extPath) {
        ScreenLog::get().init(extPath);
    } else {
        char* pref = SDL_GetPrefPath("Genesis", "Genesis3");
        if (pref) { ScreenLog::get().init(pref); SDL_free(pref); }
        else ScreenLog::get().init("/sdcard");
    }
#else
    ScreenLog::get().init(".");
#endif

    SLOG_OK("=== Genesis 3.0 Native + ImGui starting ===");

    // ─── Simulation Config ────────────────────────────────────────
    SimConfig config;
    config.width = 1200;
    config.height = 800;
    config.depth = 400;
    config.initialParticles = 300;
    config.maxParticles = 2000;
    config.friction = 0.92f;
    config.repulsion = 20.0f;
    config.nutrientSpawnRate = 10.0f;
    config.mutationRate = 0.1f;
    config.enable3D = false;
    config.enableAbiogenesis = false;
    config.enableImmuneSystem = true;
    config.enableEpigenetics = true;
    config.enableMorphogens = true;
    config.enableTemperature = true;
    config.enableTrophicLevels = true;
    config.gravity = 0.5f;
    config.ambientTemperature = 25.0f;
    config.virusSpawnRate = 0.5f;
    config.worldScale = 1.0f;

    // ─── Init Engine ──────────────────────────────────────────────
    SLOG_INFO("Engine: %dx%d, %d particles, max=%d",
              config.width, config.height, config.initialParticles, config.maxParticles);
    Engine engine(config);
    g_engine = &engine;
    SLOG_OK("Engine OK: %d particles, %d nutrients",
            (int)engine.state.particles.size(), (int)engine.state.nutrients.size());

    // ─── Init Renderer ────────────────────────────────────────────
    SLOG_INFO("Creating renderer 1280x800...");
    Renderer renderer(1280, 800);
    if (!renderer.init()) {
        SLOG_ERROR("FAILED to init renderer!");
        return 1;
    }
    SLOG_OK("Renderer OK: window=%dx%d", renderer.winWidth, renderer.winHeight);

    // ─── Init GUI ─────────────────────────────────────────────────
    Gui gui;
    if (!gui.init(renderer.window, renderer.glContext)) {
        SLOG_ERROR("FAILED to init GUI!");
        return 1;
    }
    SLOG_OK("GUI (Dear ImGui) initialized");

    // ─── Main Loop ────────────────────────────────────────────────
    SLOG_OK("Entering main loop...");
    bool running = true;
    bool paused = false;
    int speedMultiplier = 1;
    int frameCount = 0;
    auto lastFpsTime = std::chrono::high_resolution_clock::now();
    float fps = 0;
    bool dragging = false;
    bool worldDragging = false;
    int lastMouseX = 0, lastMouseY = 0;
    int totalFrames = 0;

    auto lastTime = std::chrono::high_resolution_clock::now();

    while (running) {
        auto now = std::chrono::high_resolution_clock::now();
        float dt = std::chrono::duration<float>(now - lastTime).count();
        lastTime = now;
        if (dt > 0.1f) dt = 0.1f;

        // ─── Events ──────────────────────────────────────────
        SDL_Event event;
        while (SDL_PollEvent(&event)) {
            // Always pass events to ImGui first
            gui.processEvent(event);

            // Check if ImGui wants to capture input
            bool imguiMouse = gui.wantCaptureMouse();
            bool imguiKB = gui.wantCaptureKeyboard();

            switch (event.type) {
                case SDL_QUIT:
                    running = false;
                    break;

                case SDL_KEYDOWN:
                    if (!imguiKB) {
                        switch (event.key.keysym.sym) {
                            case SDLK_ESCAPE: running = false; break;
                            case SDLK_SPACE: paused = !paused; break;
                            case SDLK_r:
                                engine = Engine(config);
                                g_engine = &engine;
                                break;
                            case SDLK_1: speedMultiplier = 1; break;
                            case SDLK_2: speedMultiplier = 2; break;
                            case SDLK_3: speedMultiplier = 5; break;
                            case SDLK_4: speedMultiplier = 10; break;
                            case SDLK_d:
                                renderer.showDebugOverlay = !renderer.showDebugOverlay;
                                break;
                            case SDLK_f: {
                                float cx = renderer.camX + 640 / renderer.camZoom;
                                float cy = renderer.camY + 400 / renderer.camZoom;
                                for (int i = 0; i < 20; i++)
                                    engine.spawnNutrient(cx + randf(-50, 50), cy + randf(-50, 50));
                                break;
                            }
                            case SDLK_PLUS: case SDLK_EQUALS:
                                renderer.camZoom *= 1.2f; break;
                            case SDLK_MINUS:
                                renderer.camZoom /= 1.2f; break;
                            case SDLK_HOME:
                                renderer.camX = 0; renderer.camY = 0; renderer.camZoom = 1.0f; break;
                            default: break;
                        }
                    }
                    break;

                case SDL_MOUSEWHEEL:
                    if (!imguiMouse) {
                        if (event.wheel.y > 0) renderer.camZoom *= 1.1f;
                        if (event.wheel.y < 0) renderer.camZoom /= 1.1f;
                        renderer.camZoom = clampf(renderer.camZoom, 0.1f, 10.0f);
                    }
                    break;

                case SDL_MOUSEBUTTONDOWN:
                    if (!imguiMouse) {
                        if (event.button.button == SDL_BUTTON_RIGHT ||
                            (event.button.button == SDL_BUTTON_LEFT && SDL_GetModState() & KMOD_CTRL)) {
                            // Camera pan
                            dragging = true;
                            lastMouseX = event.button.x;
                            lastMouseY = event.button.y;
                        } else if (event.button.button == SDL_BUTTON_LEFT) {
                            // Tool action
                            float worldX = renderer.camX + event.button.x / renderer.camZoom;
                            float worldY = renderer.camY + event.button.y / renderer.camZoom;

                            if (gui.currentTool == Gui::Tool::Pan) {
                                // Pan mode: left-click also pans
                                dragging = true;
                                lastMouseX = event.button.x;
                                lastMouseY = event.button.y;
                            } else {
                                gui.handleWorldClick(worldX, worldY, engine);
                                worldDragging = true;
                                lastMouseX = event.button.x;
                                lastMouseY = event.button.y;
                            }
                        }
                    }
                    break;

                case SDL_MOUSEBUTTONUP:
                    dragging = false;
                    if (worldDragging) {
                        gui.handleWorldRelease(engine);
                        worldDragging = false;
                    }
                    break;

                case SDL_MOUSEMOTION:
                    if (!imguiMouse) {
                        if (dragging) {
                            renderer.camX -= (event.motion.x - lastMouseX) / renderer.camZoom;
                            renderer.camY -= (event.motion.y - lastMouseY) / renderer.camZoom;
                            lastMouseX = event.motion.x;
                            lastMouseY = event.motion.y;
                        }
                        if (worldDragging) {
                            float worldX = renderer.camX + event.motion.x / renderer.camZoom;
                            float worldY = renderer.camY + event.motion.y / renderer.camZoom;
                            float dx = (event.motion.x - lastMouseX) / renderer.camZoom;
                            float dy = (event.motion.y - lastMouseY) / renderer.camZoom;
                            gui.handleWorldDrag(worldX, worldY, dx, dy, engine);
                            lastMouseX = event.motion.x;
                            lastMouseY = event.motion.y;
                        }
                    }
                    break;

                case SDL_WINDOWEVENT:
                    if (event.window.event == SDL_WINDOWEVENT_RESIZED)
                        renderer.handleResize(event.window.data1, event.window.data2);
                    break;

#ifdef GENESIS_ANDROID
                case SDL_FINGERMOTION:
                    if (!imguiMouse) {
                        renderer.camX -= event.tfinger.dx * renderer.winWidth / renderer.camZoom;
                        renderer.camY -= event.tfinger.dy * renderer.winHeight / renderer.camZoom;
                    }
                    break;

                case SDL_MULTIGESTURE:
                    if (!imguiMouse && std::abs(event.mgesture.dDist) > 0.002f) {
                        renderer.camZoom *= (1.0f + event.mgesture.dDist * 5);
                        renderer.camZoom = clampf(renderer.camZoom, 0.1f, 10.0f);
                    }
                    break;
#endif
                default: break;
            }
        }

        // Arrow keys for camera pan (continuous)
        if (!gui.wantCaptureKeyboard()) {
            const Uint8* keys = SDL_GetKeyboardState(nullptr);
            float panSpeed = 300.0f / renderer.camZoom * dt;
            if (keys[SDL_SCANCODE_LEFT])  renderer.camX -= panSpeed;
            if (keys[SDL_SCANCODE_RIGHT]) renderer.camX += panSpeed;
            if (keys[SDL_SCANCODE_UP])    renderer.camY -= panSpeed;
            if (keys[SDL_SCANCODE_DOWN])  renderer.camY += panSpeed;
        }

        // ─── Simulation Step ─────────────────────────────────
        if (!paused) {
            for (int i = 0; i < speedMultiplier; i++)
                engine.update(dt);
        }

        // ─── Render World ────────────────────────────────────
        renderer.render(engine.state, engine.config);

        // ─── Reset OpenGL state for ImGui ────────────────────
        // The renderer uses custom shaders (glUseProgram) and vertex attribs.
        // ImGui_ImplOpenGL2 uses the fixed-function pipeline, which requires
        // glUseProgram(0) to work. Without this reset, ImGui draws nothing.
        glUseProgram(0);
        glDisableVertexAttribArray(0);
        glDisableVertexAttribArray(1);
        glDisableVertexAttribArray(2);
        glDisableVertexAttribArray(3);
        glBindBuffer(GL_ARRAY_BUFFER, 0);

        // ─── Render GUI (ImGui overlay) ──────────────────────
        gui.newFrame();
        gui.render(engine, renderer, fps, paused, speedMultiplier, running, dt);

        SDL_GL_SwapWindow(renderer.window);

        // ─── FPS Counter ─────────────────────────────────────
        frameCount++;
        totalFrames++;
        auto elapsed = std::chrono::duration<float>(now - lastFpsTime).count();
        if (elapsed >= 1.0f) {
            fps = frameCount / elapsed;
            frameCount = 0;
            lastFpsTime = now;
        }
    }

    gui.shutdown();
    printf("\n");
    SDL_Quit();
    return 0;
}
