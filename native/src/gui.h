#pragma once
#include "types.h"
#include "engine.h"
#include "renderer.h"

#ifdef GENESIS_ANDROID
#include <SDL.h>
#else
#include <SDL2/SDL.h>
#endif

// ═══ Dear ImGui-based GUI for Genesis 3.0 ════════════════════════════════
// Provides all simulation controls, tools, inspector, statistics, graphs,
// and settings that match (and exceed) the web version's functionality.

class Gui {
public:
    Gui();
    ~Gui();

    bool init(SDL_Window* window, SDL_GLContext glContext);
    void processEvent(SDL_Event& event);
    void newFrame();
    void render(Engine& engine, Renderer& renderer,
                float fps, bool& paused, int& speedMultiplier,
                bool& running, float dt);
    void shutdown();

    // Returns true if ImGui wants to capture mouse/keyboard
    bool wantCaptureMouse() const;
    bool wantCaptureKeyboard() const;

    // Handle click in world space (when ImGui doesn't capture)
    void handleWorldClick(float worldX, float worldY, Engine& engine);
    void handleWorldDrag(float worldX, float worldY, float dx, float dy, Engine& engine);
    void handleWorldRelease(Engine& engine);

    // ─── Tool System ──────────────────────────────────────────────
    enum class Tool {
        Pan = 0, Inspect, SpawnFood, Kill, Drag,
        AddObstacle, AddToxicZone, AddShadowZone,
        AddCurrentZone, AddThermalVent, AddRadiationZone,
        AddNutrientZone, SpawnVirus, PaintPheromone,
        SpawnParticle, Eraser,
        COUNT
    };
    Tool currentTool = Tool::Pan;

    // ─── Selection ────────────────────────────────────────────────
    int selectedParticleId = -1;

    // ─── Panel Visibility ─────────────────────────────────────────
    bool showToolPanel = true;
    bool showInspector = true;
    bool showStats = true;
    bool showGraphs = true;
    bool showSettings = false;
    bool showSpecies = false;
    bool showPerformance = false;
    bool showAbout = false;
    bool showDemo = false;

    // ─── Tool Parameters ──────────────────────────────────────────
    float toolRadius = 50.0f;
    float toolIntensity = 1.0f;
    float obstacleW = 100.0f;
    float obstacleH = 20.0f;
    float zoneRadius = 80.0f;
    float ventTemperature = 80.0f;
    float foodAmount = 50.0f;
    float currentDX = 50.0f;
    float currentDY = 0.0f;
    float radiationIntensity = 0.5f;
    float nutrientRichIntensity = 2.0f;
    float pheromoneStrength = 200.0f;
    int foodCount = 20;

    // ─── Visual Options ───────────────────────────────────────────
    bool showBonds = true;
    bool showZones = true;
    bool showNutrients = true;
    bool showViruses = true;
    bool showSounds = true;
    bool showPheromoneOverlay = false;
    bool showTemperatureOverlay = false;

    // ─── Live config editing ──────────────────────────────────────
    // We keep a local copy that can be applied to the engine
    SimConfig editConfig;
    bool configDirty = false;

private:
    // ─── Internal rendering ───────────────────────────────────────
    void renderMenuBar(Engine& engine, Renderer& renderer,
                       bool& paused, int& speedMultiplier, bool& running);
    void renderControlBar(Engine& engine, bool& paused, int& speedMultiplier, float fps);
    void renderToolPanel(Engine& engine);
    void renderInspectorPanel(const Engine& engine);
    void renderStatsPanel(const Engine& engine);
    void renderGraphsPanel(const Engine& engine);
    void renderSettingsWindow(Engine& engine);
    void renderSpeciesWindow(const Engine& engine);
    void renderPerformanceWindow(float fps, float dt);
    void renderAboutWindow();

    // Helpers
    const Particle* findParticleAt(float worldX, float worldY, const SimState& state) const;
    const char* toolName(Tool t) const;
    const char* trophicName(TrophicLevel t) const;
    const char* zoneName(ZoneType z) const;

    // Save/Load
    void saveState(const Engine& engine, const char* filename);
    void loadState(Engine& engine, const char* filename);

    // Drag state
    int dragParticleId = -1;

    // Performance tracking
    float fpsHistory[120] = {};
    float dtHistory[120] = {};
    int historyIdx = 0;

    // Style
    void applyDarkTheme();
};
