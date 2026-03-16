#include "engine.h"
#include "renderer.h"
#include <cstdio>
#include <chrono>

#ifdef GENESIS_ANDROID
#include <SDL.h>
#else
#include <SDL2/SDL.h>
#endif

static void printStats(const SimState& state) {
    int autotrophs = 0, herbivores = 0, predators = 0, decomposers = 0;
    float totalEnergy = 0;
    for (auto& p : state.particles) {
        totalEnergy += p.energy;
        switch (p.trophicLevel) {
            case TrophicLevel::Autotroph: autotrophs++; break;
            case TrophicLevel::Herbivore: herbivores++; break;
            case TrophicLevel::Predator: predators++; break;
            case TrophicLevel::Decomposer: decomposers++; break;
            default: break;
        }
    }
    printf("\rT=%.0f Pop=%d (A:%d H:%d P:%d D:%d) E=%.0f Bonds=%d Virus=%d %s  ",
        state.time, (int)state.particles.size(),
        autotrophs, herbivores, predators, decomposers,
        totalEnergy, (int)state.bonds.size(), (int)state.viruses.size(),
        state.season.c_str());
    fflush(stdout);
}

int main(int argc, char* argv[]) {
    (void)argc; (void)argv;

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
    Engine engine(config);
    printf("Genesis 3.0 Native — %d particles initialized\n", (int)engine.state.particles.size());

    // ─── Init Renderer ────────────────────────────────────────────
    Renderer renderer(1280, 800);
    if (!renderer.init()) {
        fprintf(stderr, "Failed to init renderer\n");
        return 1;
    }

    // ─── Main Loop ────────────────────────────────────────────────
    bool running = true;
    bool paused = false;
    int speedMultiplier = 1;
    int frameCount = 0;
    auto lastFpsTime = std::chrono::high_resolution_clock::now();
    float fps = 0;
    bool dragging = false;
    int lastMouseX = 0, lastMouseY = 0;

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
        auto elapsed = std::chrono::duration<float>(now - lastFpsTime).count();
        if (elapsed >= 1.0f) {
            fps = frameCount / elapsed;
            frameCount = 0;
            lastFpsTime = now;
            printStats(engine.state);
            printf("FPS=%.0f", fps);
        }
    }

    printf("\n");
    SDL_Quit();
    return 0;
}
