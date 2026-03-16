#include "engine.h"
#include "renderer.h"
#include "screenlog.h"
#include <cstdio>
#include <chrono>
#include <csignal>
#include <cstdlib>

#ifdef GENESIS_ANDROID
#include <SDL.h>
#include <android/log.h>
#else
#include <SDL2/SDL.h>
#endif

// Signal handler for crash diagnostics
static void signalHandler(int sig) {
    SLOG_ERROR("!!! CRASH SIGNAL %d (SEGV=%d ABRT=%d FPE=%d) !!!",
               sig, SIGSEGV, SIGABRT, SIGFPE);
    ScreenLog::get().flush();
    std::abort();
}

int main(int argc, char* argv[]) {
    (void)argc; (void)argv;

    signal(SIGSEGV, signalHandler);
    signal(SIGABRT, signalHandler);
    signal(SIGFPE, signalHandler);

    // ─── Init Log File ───────────────────────────────────────────
#ifdef GENESIS_ANDROID
    // Use Android external files dir (accessible in file manager at
    // Android/data/com.genesis.sim/files/ — no permission needed)
    const char* extPath = SDL_AndroidGetExternalStoragePath();
    if (extPath) {
        ScreenLog::get().init(extPath);
    } else {
        // Fallback to SDL pref path (app-private)
        char* pref = SDL_GetPrefPath("Genesis", "Genesis3");
        if (pref) { ScreenLog::get().init(pref); SDL_free(pref); }
        else ScreenLog::get().init("/sdcard");
    }
#else
    ScreenLog::get().init(".");
#endif

    SLOG_OK("=== Genesis 3.0 Native starting ===");

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

    // ─── Main Loop ────────────────────────────────────────────────
    SLOG_OK("Entering main loop...");
    bool running = true;
    bool paused = false;
    int speedMultiplier = 1;
    int frameCount = 0;
    auto lastFpsTime = std::chrono::high_resolution_clock::now();
    float fps = 0;
    bool dragging = false;
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
            switch (event.type) {
                case SDL_QUIT:
                    running = false;
                    break;

                case SDL_KEYDOWN:
                    switch (event.key.keysym.sym) {
                        case SDLK_ESCAPE: running = false; break;
                        case SDLK_SPACE: paused = !paused; break;
                        case SDLK_r: engine = Engine(config); break;
                        case SDLK_1: speedMultiplier = 1; break;
                        case SDLK_2: speedMultiplier = 2; break;
                        case SDLK_3: speedMultiplier = 5; break;
                        case SDLK_4: speedMultiplier = 10; break;
                        case SDLK_f: {
                            // Add food at center of view
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
                    break;

                case SDL_MOUSEWHEEL:
                    if (event.wheel.y > 0) renderer.camZoom *= 1.1f;
                    if (event.wheel.y < 0) renderer.camZoom /= 1.1f;
                    renderer.camZoom = clampf(renderer.camZoom, 0.1f, 10.0f);
                    break;

                case SDL_MOUSEBUTTONDOWN:
                    if (event.button.button == SDL_BUTTON_RIGHT ||
                        (event.button.button == SDL_BUTTON_LEFT && SDL_GetModState() & KMOD_CTRL)) {
                        dragging = true;
                        lastMouseX = event.button.x;
                        lastMouseY = event.button.y;
                    } else if (event.button.button == SDL_BUTTON_LEFT) {
                        // Click to add food
                        float worldX = renderer.camX + event.button.x / renderer.camZoom;
                        float worldY = renderer.camY + event.button.y / renderer.camZoom;
                        engine.spawnNutrient(worldX, worldY, 50);
                    }
                    break;

                case SDL_MOUSEBUTTONUP:
                    dragging = false;
                    break;

                case SDL_MOUSEMOTION:
                    if (dragging) {
                        renderer.camX -= (event.motion.x - lastMouseX) / renderer.camZoom;
                        renderer.camY -= (event.motion.y - lastMouseY) / renderer.camZoom;
                        lastMouseX = event.motion.x;
                        lastMouseY = event.motion.y;
                    }
                    break;

                case SDL_WINDOWEVENT:
                    if (event.window.event == SDL_WINDOWEVENT_RESIZED)
                        renderer.handleResize(event.window.data1, event.window.data2);
                    break;

#ifdef GENESIS_ANDROID
                case SDL_FINGERMOTION:
                    // Pan with single finger
                    renderer.camX -= event.tfinger.dx * renderer.winWidth / renderer.camZoom;
                    renderer.camY -= event.tfinger.dy * renderer.winHeight / renderer.camZoom;
                    break;

                case SDL_MULTIGESTURE:
                    // Pinch to zoom
                    if (std::abs(event.mgesture.dDist) > 0.002f) {
                        renderer.camZoom *= (1.0f + event.mgesture.dDist * 5);
                        renderer.camZoom = clampf(renderer.camZoom, 0.1f, 10.0f);
                    }
                    break;
#endif

                default: break;
            }
        }

        // Arrow keys for camera pan (continuous)
        const Uint8* keys = SDL_GetKeyboardState(nullptr);
        float panSpeed = 300.0f / renderer.camZoom * dt;
        if (keys[SDL_SCANCODE_LEFT])  renderer.camX -= panSpeed;
        if (keys[SDL_SCANCODE_RIGHT]) renderer.camX += panSpeed;
        if (keys[SDL_SCANCODE_UP])    renderer.camY -= panSpeed;
        if (keys[SDL_SCANCODE_DOWN])  renderer.camY += panSpeed;

        // ─── Simulation Step ─────────────────────────────────
        if (!paused) {
            for (int i = 0; i < speedMultiplier; i++)
                engine.update(dt);
        }

        // ─── Render ──────────────────────────────────────────
        renderer.render(engine.state, engine.config);

        // ─── FPS Counter ─────────────────────────────────────
        frameCount++;
        totalFrames++;
        auto elapsed = std::chrono::duration<float>(now - lastFpsTime).count();
        if (elapsed >= 1.0f) {
            fps = frameCount / elapsed;
            frameCount = 0;
            lastFpsTime = now;
            SLOG_INFO("F=%d FPS=%.0f Pop=%d Nutr=%d Bond=%d Vir=%d %s",
                      totalFrames, fps,
                      (int)engine.state.particles.size(),
                      (int)engine.state.nutrients.size(),
                      (int)engine.state.bonds.size(),
                      (int)engine.state.viruses.size(),
                      engine.state.season.c_str());
        }
    }

    printf("\n");
    SDL_Quit();
    return 0;
}
