#include "gui.h"
#include "imgui/imgui.h"
#include "imgui/imgui_impl_sdl2.h"
#include "imgui/imgui_impl_opengl2.h"
#include "screenlog.h"
#include <cstdio>
#include <cmath>
#include <cstring>
#include <algorithm>
#include <fstream>

// ═══════════════════════════════════════════════════════════════════════════
// CONSTRUCTOR / DESTRUCTOR
// ═══════════════════════════════════════════════════════════════════════════

Gui::Gui() {
    memset(fpsHistory, 0, sizeof(fpsHistory));
    memset(dtHistory, 0, sizeof(dtHistory));
}

Gui::~Gui() {}

// ═══════════════════════════════════════════════════════════════════════════
// INIT / SHUTDOWN
// ═══════════════════════════════════════════════════════════════════════════

bool Gui::init(SDL_Window* window, SDL_GLContext glContext) {
    IMGUI_CHECKVERSION();
    ImGui::CreateContext();
    ImGuiIO& io = ImGui::GetIO();
    io.ConfigFlags |= ImGuiConfigFlags_NavEnableKeyboard;
    io.IniFilename = "genesis_imgui.ini";

    applyDarkTheme();

    ImGui_ImplSDL2_InitForOpenGL(window, glContext);
    ImGui_ImplOpenGL2_Init();

    SLOG_OK("[GUI] Dear ImGui initialized");
    return true;
}

void Gui::shutdown() {
    ImGui_ImplOpenGL2_Shutdown();
    ImGui_ImplSDL2_Shutdown();
    ImGui::DestroyContext();
}

void Gui::applyDarkTheme() {
    ImGui::StyleColorsDark();
    ImGuiStyle& style = ImGui::GetStyle();
    style.WindowRounding = 6.0f;
    style.FrameRounding = 4.0f;
    style.GrabRounding = 3.0f;
    style.ScrollbarRounding = 4.0f;
    style.TabRounding = 4.0f;
    style.WindowPadding = ImVec2(10, 10);
    style.FramePadding = ImVec2(6, 4);
    style.ItemSpacing = ImVec2(8, 6);
    style.WindowBorderSize = 1.0f;
    style.FrameBorderSize = 0.0f;
    style.Alpha = 0.96f;

    ImVec4* c = style.Colors;
    c[ImGuiCol_WindowBg]        = ImVec4(0.08f, 0.08f, 0.12f, 0.94f);
    c[ImGuiCol_TitleBg]         = ImVec4(0.06f, 0.06f, 0.10f, 1.00f);
    c[ImGuiCol_TitleBgActive]   = ImVec4(0.10f, 0.10f, 0.18f, 1.00f);
    c[ImGuiCol_FrameBg]         = ImVec4(0.14f, 0.14f, 0.22f, 1.00f);
    c[ImGuiCol_FrameBgHovered]  = ImVec4(0.22f, 0.22f, 0.35f, 1.00f);
    c[ImGuiCol_FrameBgActive]   = ImVec4(0.18f, 0.18f, 0.30f, 1.00f);
    c[ImGuiCol_Button]          = ImVec4(0.15f, 0.30f, 0.55f, 1.00f);
    c[ImGuiCol_ButtonHovered]   = ImVec4(0.20f, 0.40f, 0.70f, 1.00f);
    c[ImGuiCol_ButtonActive]    = ImVec4(0.10f, 0.25f, 0.50f, 1.00f);
    c[ImGuiCol_Header]          = ImVec4(0.15f, 0.30f, 0.55f, 0.80f);
    c[ImGuiCol_HeaderHovered]   = ImVec4(0.20f, 0.40f, 0.70f, 0.80f);
    c[ImGuiCol_HeaderActive]    = ImVec4(0.10f, 0.25f, 0.50f, 1.00f);
    c[ImGuiCol_Tab]             = ImVec4(0.12f, 0.12f, 0.20f, 1.00f);
    c[ImGuiCol_TabHovered]      = ImVec4(0.20f, 0.40f, 0.70f, 0.80f);
    c[ImGuiCol_TabActive]       = ImVec4(0.15f, 0.30f, 0.55f, 1.00f);
    c[ImGuiCol_SliderGrab]      = ImVec4(0.30f, 0.55f, 0.90f, 1.00f);
    c[ImGuiCol_SliderGrabActive]= ImVec4(0.40f, 0.65f, 1.00f, 1.00f);
    c[ImGuiCol_CheckMark]       = ImVec4(0.30f, 0.70f, 1.00f, 1.00f);
    c[ImGuiCol_Separator]       = ImVec4(0.20f, 0.20f, 0.30f, 1.00f);
    c[ImGuiCol_MenuBarBg]       = ImVec4(0.10f, 0.10f, 0.16f, 1.00f);
    c[ImGuiCol_PopupBg]         = ImVec4(0.10f, 0.10f, 0.16f, 0.96f);
    c[ImGuiCol_PlotLines]       = ImVec4(0.30f, 0.70f, 1.00f, 1.00f);
    c[ImGuiCol_PlotHistogram]   = ImVec4(0.30f, 0.70f, 0.40f, 1.00f);
}

// ═══════════════════════════════════════════════════════════════════════════
// EVENT PROCESSING
// ═══════════════════════════════════════════════════════════════════════════

void Gui::processEvent(SDL_Event& event) {
    ImGui_ImplSDL2_ProcessEvent(&event);
}

bool Gui::wantCaptureMouse() const {
    return ImGui::GetIO().WantCaptureMouse;
}

bool Gui::wantCaptureKeyboard() const {
    return ImGui::GetIO().WantCaptureKeyboard;
}

void Gui::newFrame() {
    ImGui_ImplOpenGL2_NewFrame();
    ImGui_ImplSDL2_NewFrame();
    ImGui::NewFrame();
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN RENDER
// ═══════════════════════════════════════════════════════════════════════════

void Gui::render(Engine& engine, Renderer& renderer,
                 float fps, bool& paused, int& speedMultiplier,
                 bool& running, float dt) {
    // Track performance
    fpsHistory[historyIdx] = fps;
    dtHistory[historyIdx] = dt * 1000.0f;
    historyIdx = (historyIdx + 1) % 120;

    // Sync config on first frame
    static bool firstFrame = true;
    if (firstFrame) {
        editConfig = engine.config;
        firstFrame = false;
    }

    renderMenuBar(engine, renderer, paused, speedMultiplier, running);
    renderControlBar(engine, paused, speedMultiplier, fps);

    if (showToolPanel) renderToolPanel(engine);
    if (showInspector) renderInspectorPanel(engine);
    if (showStats) renderStatsPanel(engine);
    if (showGraphs) renderGraphsPanel(engine);
    if (showSettings) renderSettingsWindow(engine);
    if (showSpecies) renderSpeciesWindow(engine);
    if (showPerformance) renderPerformanceWindow(fps, dt);
    if (showAbout) renderAboutWindow();
    if (showDemo) ImGui::ShowDemoWindow(&showDemo);

    ImGui::Render();
    ImGui_ImplOpenGL2_RenderDrawData(ImGui::GetDrawData());
}

// ═══════════════════════════════════════════════════════════════════════════
// MENU BAR
// ═══════════════════════════════════════════════════════════════════════════

void Gui::renderMenuBar(Engine& engine, Renderer& renderer,
                        bool& paused, int& speedMultiplier, bool& running) {
    if (ImGui::BeginMainMenuBar()) {
        if (ImGui::BeginMenu("File")) {
            if (ImGui::MenuItem("Save State", "Ctrl+S"))
                saveState(engine, "genesis_save.bin");
            if (ImGui::MenuItem("Load State", "Ctrl+L"))
                loadState(engine, "genesis_save.bin");
            ImGui::Separator();
            if (ImGui::MenuItem("Reset Simulation", "R")) {
                engine = Engine(engine.config);
            }
            ImGui::Separator();
            if (ImGui::MenuItem("Quit", "Esc"))
                running = false;
            ImGui::EndMenu();
        }
        if (ImGui::BeginMenu("View")) {
            ImGui::MenuItem("Tool Panel", "T", &showToolPanel);
            ImGui::MenuItem("Inspector", "I", &showInspector);
            ImGui::MenuItem("Statistics", "S", &showStats);
            ImGui::MenuItem("Graphs", "G", &showGraphs);
            ImGui::MenuItem("Species List", NULL, &showSpecies);
            ImGui::MenuItem("Performance", NULL, &showPerformance);
            ImGui::Separator();
            ImGui::MenuItem("Show Bonds", NULL, &showBonds);
            ImGui::MenuItem("Show Zones", NULL, &showZones);
            ImGui::MenuItem("Show Nutrients", NULL, &showNutrients);
            ImGui::MenuItem("Show Viruses", NULL, &showViruses);
            ImGui::MenuItem("Show Sounds", NULL, &showSounds);
            ImGui::Separator();
            ImGui::MenuItem("Pheromone Overlay", NULL, &showPheromoneOverlay);
            ImGui::MenuItem("Temperature Overlay", NULL, &showTemperatureOverlay);
            ImGui::Separator();
            ImGui::MenuItem("Debug Log Overlay", "D", &renderer.showDebugOverlay);
            ImGui::EndMenu();
        }
        if (ImGui::BeginMenu("Simulation")) {
            if (ImGui::MenuItem(paused ? "Resume" : "Pause", "Space"))
                paused = !paused;
            ImGui::Separator();
            if (ImGui::MenuItem("Speed x1", "1")) speedMultiplier = 1;
            if (ImGui::MenuItem("Speed x2", "2")) speedMultiplier = 2;
            if (ImGui::MenuItem("Speed x5", "3")) speedMultiplier = 5;
            if (ImGui::MenuItem("Speed x10", "4")) speedMultiplier = 10;
            if (ImGui::MenuItem("Speed x20")) speedMultiplier = 20;
            if (ImGui::MenuItem("Speed x50")) speedMultiplier = 50;
            ImGui::Separator();
            if (ImGui::MenuItem("Spawn 50 Food", "F")) {
                for (int i = 0; i < 50; i++)
                    engine.spawnNutrient();
            }
            if (ImGui::MenuItem("Spawn 10 Particles")) {
                for (int i = 0; i < 10; i++)
                    engine.spawnRandomParticlePublic();
            }
            if (ImGui::MenuItem("Spawn Virus")) {
                engine.spawnVirusPublic();
            }
            ImGui::Separator();
            if (ImGui::MenuItem("Kill All Viruses"))
                engine.state.viruses.clear();
            if (ImGui::MenuItem("Remove All Obstacles"))
                engine.state.obstacles.clear();
            if (ImGui::MenuItem("Remove All Zones"))
                engine.state.zones.clear();
            ImGui::EndMenu();
        }
        if (ImGui::BeginMenu("Settings")) {
            ImGui::MenuItem("Simulation Settings...", NULL, &showSettings);
            ImGui::EndMenu();
        }
        if (ImGui::BeginMenu("Help")) {
            ImGui::MenuItem("About Genesis 3.0", NULL, &showAbout);
            ImGui::MenuItem("ImGui Demo", NULL, &showDemo);
            ImGui::EndMenu();
        }

        // Right-aligned status
        ImGui::SameLine(ImGui::GetWindowWidth() - 200);
        ImGui::Text("Pop: %d", (int)engine.state.particles.size());

        ImGui::EndMainMenuBar();
    }
}

// ═══════════════════════════════════════════════════════════════════════════
// CONTROL BAR
// ═══════════════════════════════════════════════════════════════════════════

void Gui::renderControlBar(Engine& engine, bool& paused, int& speedMultiplier, float fps) {
    ImGuiIO& io = ImGui::GetIO();
    float barHeight = 48;

    ImGui::SetNextWindowPos(ImVec2(0, ImGui::GetFrameHeight()));
    ImGui::SetNextWindowSize(ImVec2(io.DisplaySize.x, barHeight));
    ImGui::Begin("##ControlBar", nullptr,
        ImGuiWindowFlags_NoTitleBar | ImGuiWindowFlags_NoResize |
        ImGuiWindowFlags_NoMove | ImGuiWindowFlags_NoScrollbar |
        ImGuiWindowFlags_NoCollapse);

    // Play/Pause
    if (ImGui::Button(paused ? "▶ Play" : "⏸ Pause", ImVec2(80, 28)))
        paused = !paused;
    ImGui::SameLine();

    // Speed
    ImGui::SetNextItemWidth(120);
    const char* speeds[] = {"x1", "x2", "x5", "x10", "x20", "x50"};
    int speedVals[] = {1, 2, 5, 10, 20, 50};
    int speedIdx = 0;
    for (int i = 0; i < 6; i++) if (speedMultiplier == speedVals[i]) speedIdx = i;
    if (ImGui::Combo("Speed", &speedIdx, speeds, 6))
        speedMultiplier = speedVals[speedIdx];
    ImGui::SameLine();

    // Reset
    if (ImGui::Button("↺ Reset", ImVec2(70, 28))) {
        engine = Engine(engine.config);
    }
    ImGui::SameLine();

    ImGui::SameLine(); ImGui::Text("|"); ImGui::SameLine();

    // Time & Season
    ImGui::Text("Time: %.1f", engine.state.time);
    ImGui::SameLine();
    ImGui::TextColored(
        engine.state.season == "Spring" ? ImVec4(0.4f,0.9f,0.4f,1) :
        engine.state.season == "Summer" ? ImVec4(1.0f,0.8f,0.2f,1) :
        engine.state.season == "Autumn" ? ImVec4(0.9f,0.5f,0.2f,1) :
                                          ImVec4(0.6f,0.8f,1.0f,1),
        "%s", engine.state.season.c_str());
    ImGui::SameLine();

    ImGui::SameLine(); ImGui::Text("|"); ImGui::SameLine();

    // Quick stats
    ImGui::Text("Pop: %d", (int)engine.state.particles.size());
    ImGui::SameLine();
    ImGui::Text("Species: %d", (int)engine.state.speciesHistory.size());
    ImGui::SameLine();
    ImGui::Text("Bonds: %d", (int)engine.state.bonds.size());
    ImGui::SameLine();
    ImGui::Text("Virus: %d", (int)engine.state.viruses.size());
    ImGui::SameLine();

    ImGui::SameLine(); ImGui::Text("|"); ImGui::SameLine();

    // Day/Night
    float dayLight = engine.state.dayLight;
    ImGui::TextColored(ImVec4(dayLight, dayLight, 0.5f + dayLight * 0.5f, 1.0f),
        dayLight > 0.5f ? "☀ Day" : "☾ Night");
    ImGui::SameLine();

    // Atmosphere
    ImGui::Text("O2:%.0f%%", engine.state.oxygenLevel * 100);
    ImGui::SameLine();
    ImGui::Text("CO2:%.1f%%", engine.state.co2Level * 100);

    ImGui::End();
}

// ═══════════════════════════════════════════════════════════════════════════
// TOOL PANEL
// ═══════════════════════════════════════════════════════════════════════════

void Gui::renderToolPanel(Engine& engine) {
    (void)engine; // used below
    float topOffset = ImGui::GetFrameHeight() + 48;

    ImGui::SetNextWindowPos(ImVec2(0, topOffset), ImGuiCond_FirstUseEver);
    ImGui::SetNextWindowSize(ImVec2(200, 600), ImGuiCond_FirstUseEver);
    ImGui::Begin("Tools", &showToolPanel);

    struct ToolInfo { Tool tool; const char* name; const char* icon; ImVec4 color; };
    ToolInfo tools[] = {
        {Tool::Pan,            "Pan / Select",  "🖐", ImVec4(0.6f,0.6f,0.6f,1)},
        {Tool::Inspect,        "Inspect",       "🔍", ImVec4(0.3f,0.7f,1.0f,1)},
        {Tool::SpawnFood,      "Spawn Food",    "🍀", ImVec4(0.2f,0.8f,0.3f,1)},
        {Tool::SpawnParticle,  "Spawn Particle","✦",  ImVec4(0.4f,0.9f,0.9f,1)},
        {Tool::Kill,           "Kill",          "💀", ImVec4(1.0f,0.2f,0.2f,1)},
        {Tool::Drag,           "Drag",          "↕",  ImVec4(0.9f,0.7f,0.2f,1)},
        {Tool::AddObstacle,    "Add Obstacle",  "▬",  ImVec4(0.5f,0.5f,0.5f,1)},
        {Tool::AddToxicZone,   "Toxic Zone",    "☠",  ImVec4(0.9f,0.2f,0.2f,1)},
        {Tool::AddShadowZone,  "Shadow Zone",   "◐",  ImVec4(0.3f,0.3f,0.3f,1)},
        {Tool::AddCurrentZone, "Current Zone",  "≋",  ImVec4(0.2f,0.5f,1.0f,1)},
        {Tool::AddThermalVent, "Thermal Vent",  "🌋", ImVec4(1.0f,0.5f,0.0f,1)},
        {Tool::AddRadiationZone,"Radiation",    "☢",  ImVec4(1.0f,1.0f,0.0f,1)},
        {Tool::AddNutrientZone,"Nutrient Rich", "🌿", ImVec4(0.1f,0.8f,0.4f,1)},
        {Tool::SpawnVirus,     "Spawn Virus",   "🦠", ImVec4(0.9f,0.3f,0.3f,1)},
        {Tool::PaintPheromone, "Pheromone",     "◉",  ImVec4(0.8f,0.4f,0.9f,1)},
        {Tool::Eraser,         "Eraser",        "⌫",  ImVec4(0.7f,0.7f,0.7f,1)},
    };

    for (auto& t : tools) {
        bool selected = (currentTool == t.tool);
        if (selected) {
            ImGui::PushStyleColor(ImGuiCol_Button, ImVec4(0.2f, 0.45f, 0.8f, 1.0f));
            ImGui::PushStyleColor(ImGuiCol_ButtonHovered, ImVec4(0.25f, 0.55f, 0.9f, 1.0f));
        }
        char label[64];
        snprintf(label, sizeof(label), "%s %s", t.icon, t.name);
        if (ImGui::Button(label, ImVec2(-1, 28))) {
            currentTool = t.tool;
        }
        if (selected) ImGui::PopStyleColor(2);
    }

    ImGui::Separator();
    ImGui::Text("Tool Settings");

    // Show relevant settings for current tool
    switch (currentTool) {
        case Tool::SpawnFood:
            ImGui::SliderInt("Count", &foodCount, 1, 100);
            ImGui::SliderFloat("Amount", &foodAmount, 5.0f, 200.0f);
            ImGui::SliderFloat("Radius", &toolRadius, 10.0f, 200.0f);
            break;
        case Tool::Kill:
            ImGui::SliderFloat("Kill Radius", &toolRadius, 5.0f, 200.0f);
            break;
        case Tool::AddObstacle:
            ImGui::SliderFloat("Width", &obstacleW, 10.0f, 500.0f);
            ImGui::SliderFloat("Height", &obstacleH, 10.0f, 500.0f);
            break;
        case Tool::AddToxicZone:
        case Tool::AddShadowZone:
        case Tool::AddNutrientZone:
            ImGui::SliderFloat("Zone Radius", &zoneRadius, 20.0f, 300.0f);
            if (currentTool == Tool::AddNutrientZone)
                ImGui::SliderFloat("Richness", &nutrientRichIntensity, 0.5f, 10.0f);
            break;
        case Tool::AddCurrentZone:
            ImGui::SliderFloat("Zone Radius", &zoneRadius, 20.0f, 300.0f);
            ImGui::SliderFloat("Current DX", &currentDX, -200.0f, 200.0f);
            ImGui::SliderFloat("Current DY", &currentDY, -200.0f, 200.0f);
            break;
        case Tool::AddThermalVent:
            ImGui::SliderFloat("Zone Radius", &zoneRadius, 20.0f, 300.0f);
            ImGui::SliderFloat("Temperature", &ventTemperature, 30.0f, 200.0f);
            ImGui::SliderFloat("Intensity", &toolIntensity, 0.1f, 5.0f);
            break;
        case Tool::AddRadiationZone:
            ImGui::SliderFloat("Zone Radius", &zoneRadius, 20.0f, 300.0f);
            ImGui::SliderFloat("Intensity", &radiationIntensity, 0.1f, 5.0f);
            break;
        case Tool::PaintPheromone:
            ImGui::SliderFloat("Strength", &pheromoneStrength, 10.0f, 1000.0f);
            ImGui::SliderFloat("Brush Radius", &toolRadius, 10.0f, 200.0f);
            break;
        case Tool::Eraser:
            ImGui::SliderFloat("Eraser Radius", &toolRadius, 20.0f, 300.0f);
            ImGui::Text("Click to remove zones/obstacles");
            break;
        default:
            ImGui::TextDisabled("No settings for this tool");
            break;
    }

    ImGui::End();
}

// ═══════════════════════════════════════════════════════════════════════════
// INSPECTOR PANEL
// ═══════════════════════════════════════════════════════════════════════════

void Gui::renderInspectorPanel(const Engine& engine) {
    ImGuiIO& io = ImGui::GetIO();
    float topOffset = ImGui::GetFrameHeight() + 48;

    ImGui::SetNextWindowPos(ImVec2(io.DisplaySize.x - 320, topOffset), ImGuiCond_FirstUseEver);
    ImGui::SetNextWindowSize(ImVec2(320, 650), ImGuiCond_FirstUseEver);
    ImGui::Begin("Inspector", &showInspector);

    if (selectedParticleId < 0) {
        ImGui::TextWrapped("Click on an organism with the Inspect tool to see its details.");
        ImGui::End();
        return;
    }

    // Find the selected particle
    const Particle* sel = nullptr;
    for (auto& p : engine.state.particles) {
        if (p.id == selectedParticleId && !p.dead) { sel = &p; break; }
    }
    if (!sel) {
        ImGui::TextColored(ImVec4(1,0.5f,0.5f,1), "Organism died or not found.");
        selectedParticleId = -1;
        ImGui::End();
        return;
    }

    const Particle& p = *sel;
    ImGui::TextColored(ImVec4(0.4f,0.8f,1.0f,1), "Organism #%d", p.id);
    ImGui::Separator();

    // Color swatch
    ImVec4 orgColor(p.genome.color[0]/255.0f, p.genome.color[1]/255.0f, p.genome.color[2]/255.0f, 1.0f);
    ImGui::ColorButton("Color", orgColor, 0, ImVec2(20,20));
    ImGui::SameLine();
    ImGui::Text("Species #%d  Gen %d", p.speciesId, p.generation);

    if (ImGui::CollapsingHeader("Vitals", ImGuiTreeNodeFlags_DefaultOpen)) {
        // Energy bar
        float energyFrac = clampf(p.energy / 200.0f, 0, 1);
        ImGui::ProgressBar(energyFrac, ImVec2(-1, 0),
            (std::string("Energy: ") + std::to_string((int)p.energy)).c_str());

        ImGui::Text("Age: %.1f", p.age);
        ImGui::Text("Trophic: %s", trophicName(p.trophicLevel));
        ImGui::Text("Role: %s", p.role.c_str());
        ImGui::Text("Cell Type: %s", p.cellType.c_str());
        ImGui::Text("Complexity: %d", p.complexity);
        ImGui::Text("Divisions Left: %.0f", p.divisionsLeft);
        ImGui::Text("Position: (%.0f, %.0f, %.0f)", p.x, p.y, p.z);
        ImGui::Text("Velocity: (%.1f, %.1f)", p.vx, p.vy);
        ImGui::Text("Mass: %.2f  Radius: %.2f", p.mass, p.radius);
    }

    if (ImGui::CollapsingHeader("Genome Traits")) {
        ImGui::Text("Size: %.2f", p.genome.size);
        ImGui::Text("Speed: %.2f", p.genome.speed);
        ImGui::Text("Sense Range: %.2f", p.genome.senseRange);
        ImGui::Text("Base Metabolism: %.2f", p.genome.baseMetabolism);
        ImGui::Text("Heat Tolerance: %.1f°C", p.genome.heatTolerance);
        ImGui::Text("Cold Tolerance: %.1f°C", p.genome.coldTolerance);
        ImGui::Text("MHC Type: %d", p.genome.mhcType);
        ImGui::Text("DNA Length: %d genes", (int)p.genome.dna.genes.size());
        ImGui::Text("Telomere: %.1f", p.genome.dna.telomereLength);
        ImGui::Text("Reactions: %d", (int)p.genome.reactions.size());
    }

    if (ImGui::CollapsingHeader("Temperature & Stress")) {
        ImGui::Text("Body Temp: %.1f°C", p.temperature);
        float stressFrac = clampf(p.stressLevel, 0, 1);
        ImVec4 stressColor = ImVec4(stressFrac, 1.0f - stressFrac, 0, 1);
        ImGui::TextColored(stressColor, "Stress: %.2f", p.stressLevel);
        ImGui::ProgressBar(stressFrac, ImVec2(-1,0), "Stress");

        ImGui::Text("Differentiation: %.2f", p.differentiation);
        ImGui::Text("Biofilm: %s", p.biofilm ? "Yes" : "No");
        ImGui::Text("Digest Efficiency: %.2f", p.digestEfficiency);
    }

    if (ImGui::CollapsingHeader("Membrane")) {
        float intFrac = clampf(p.genome.membrane.integrity, 0, 1);
        ImGui::ProgressBar(intFrac, ImVec2(-1,0), "Integrity");
        ImGui::Text("Osmosis Rate: %.3f", p.genome.membrane.osmosisRate);
        if (ImGui::TreeNode("Permeability")) {
            for (int i = 0; i < NUM_CHEMICALS; i++)
                ImGui::Text("  Chem[%d]: %.3f", i, p.genome.membrane.permeability[i]);
            ImGui::TreePop();
        }
        if (ImGui::TreeNode("Receptors")) {
            for (int i = 0; i < NUM_MORPHOGENS; i++)
                ImGui::Text("  Morphogen[%d]: %.3f", i, p.genome.membrane.receptors[i]);
            ImGui::TreePop();
        }
    }

    if (ImGui::CollapsingHeader("Immune System")) {
        ImGui::Text("Infected: %s", p.infected ? "YES" : "No");
        if (p.infected)
            ImGui::Text("Infection Timer: %.1f", p.infectionTimer);
        ImGui::Text("Inflammation: %.2f", p.immune.inflammationLevel);
        ImGui::Text("Immune Energy: %.1f", p.immune.immuneEnergy);
        ImGui::Text("Memory Strength: %.2f", p.immune.memoryStrength);
        ImGui::Text("Antibodies: %d / %d", (int)p.immune.antibodies.size(), NUM_ANTIBODIES);
        if (ImGui::TreeNode("Antibody Details")) {
            for (int i = 0; i < (int)p.immune.antibodies.size(); i++) {
                auto& ab = p.immune.antibodies[i];
                ImGui::Text("  [%d] target=%d str=%.2f age=%.1f",
                    i, ab.targetSignature, ab.strength, ab.age);
            }
            ImGui::TreePop();
        }
    }

    if (ImGui::CollapsingHeader("Chemistry")) {
        for (int i = 0; i < NUM_CHEMICALS; i++) {
            if (p.chem[i] > 0.01f)
                ImGui::Text("Chem[%d]: %.2f", i, p.chem[i]);
        }
        ImGui::Text("Memory: %.2f", p.mem);
    }

    if (ImGui::CollapsingHeader("Morphogens")) {
        for (int i = 0; i < NUM_MORPHOGENS; i++)
            ImGui::Text("Morphogen[%d]: %.3f", i, p.morphogens[i]);
    }

    if (ImGui::CollapsingHeader("DNA (Genes)")) {
        for (int i = 0; i < (int)p.genome.dna.genes.size(); i++) {
            auto& gene = p.genome.dna.genes[i];
            const char* codonNames[] = {
                "NOP","GROW","DIVIDE","BOND","UNBOND","PHOTO","CHEM","DIGEST",
                "DECOMP","MOVE","SENSE","ATTACK","DEFEND","SIGNAL","PROMOTE",
                "SUPPRESS","EPIMASK","REPEAT","ANTIBODY","MHC"
            };
            int ci = (int)gene.codon;
            const char* cn = (ci >= 0 && ci < 20) ? codonNames[ci] : "???";
            ImVec4 col = gene.methylated ? ImVec4(0.5f,0.5f,0.5f,1) : ImVec4(1,1,1,1);
            ImGui::TextColored(col, "%02d: %s v=%.2f %s expr=%.1f",
                i, cn, gene.value,
                gene.methylated ? "[M]" : "   ",
                gene.expression);
        }
    }

    if (ImGui::CollapsingHeader("Brain (Neural Network)")) {
        ImGui::Text("Architecture: %d -> %d -> %d", NEURAL_INPUTS, NEURAL_HIDDEN, NEURAL_OUTPUTS);
        ImGui::Text("Neuromodulator: %.3f", p.genome.brain.neuromodulator);
        ImGui::Text("Plasticity: %.4f", p.genome.brain.plasticity);
        if (ImGui::TreeNode("Weights IH (Input->Hidden)")) {
            for (int i = 0; i < NEURAL_INPUTS; i++) {
                char buf[32]; snprintf(buf, sizeof(buf), "In[%d]", i);
                if (ImGui::TreeNode(buf)) {
                    for (int j = 0; j < NEURAL_HIDDEN; j++)
                        ImGui::Text("  -> H[%d]: %.3f", j, p.genome.brain.wIH[i][j]);
                    ImGui::TreePop();
                }
            }
            ImGui::TreePop();
        }
        if (ImGui::TreeNode("Weights HO (Hidden->Output)")) {
            for (int i = 0; i < NEURAL_HIDDEN; i++) {
                char buf[32]; snprintf(buf, sizeof(buf), "H[%d]", i);
                if (ImGui::TreeNode(buf)) {
                    for (int j = 0; j < NEURAL_OUTPUTS; j++)
                        ImGui::Text("  -> O[%d]: %.3f", j, p.genome.brain.wHO[i][j]);
                    ImGui::TreePop();
                }
            }
            ImGui::TreePop();
        }
    }

    ImGui::End();
}

// ═══════════════════════════════════════════════════════════════════════════
// STATISTICS PANEL
// ═══════════════════════════════════════════════════════════════════════════

void Gui::renderStatsPanel(const Engine& engine) {
    ImGuiIO& io = ImGui::GetIO();
    float topOffset = ImGui::GetFrameHeight() + 48;

    ImGui::SetNextWindowPos(ImVec2(io.DisplaySize.x - 320, topOffset + 660), ImGuiCond_FirstUseEver);
    ImGui::SetNextWindowSize(ImVec2(320, 300), ImGuiCond_FirstUseEver);
    ImGui::Begin("Statistics", &showStats);

    auto& st = engine.state;
    int pop = (int)st.particles.size();

    if (ImGui::CollapsingHeader("Population", ImGuiTreeNodeFlags_DefaultOpen)) {
        ImGui::Text("Total: %d / %d", pop, engine.config.maxParticles);
        float popFrac = engine.config.maxParticles > 0 ? (float)pop / engine.config.maxParticles : 0;
        ImGui::ProgressBar(popFrac, ImVec2(-1, 0));

        // Count by trophic level
        int autotrophs = 0, herbivores = 0, predators = 0, decomposers = 0, parasites = 0;
        float totalEnergy = 0, totalComp = 0;
        for (auto& p : st.particles) {
            totalEnergy += p.energy;
            totalComp += p.complexity;
            switch (p.trophicLevel) {
                case TrophicLevel::Autotroph: autotrophs++; break;
                case TrophicLevel::Herbivore: herbivores++; break;
                case TrophicLevel::Predator: predators++; break;
                case TrophicLevel::Decomposer: decomposers++; break;
                case TrophicLevel::Parasite: parasites++; break;
                default: break;
            }
        }
        float avgE = pop > 0 ? totalEnergy / pop : 0;
        float avgC = pop > 0 ? totalComp / pop : 0;

        ImGui::Text("Avg Energy: %.1f", avgE);
        ImGui::Text("Avg Complexity: %.1f", avgC);
        ImGui::Text("Total Biomass: %.0f", totalEnergy);
    }

    if (ImGui::CollapsingHeader("Trophic Distribution", ImGuiTreeNodeFlags_DefaultOpen)) {
        int autotrophs = 0, herbivores = 0, predators = 0, decomposers = 0, parasites = 0;
        for (auto& p : st.particles) {
            switch (p.trophicLevel) {
                case TrophicLevel::Autotroph: autotrophs++; break;
                case TrophicLevel::Herbivore: herbivores++; break;
                case TrophicLevel::Predator: predators++; break;
                case TrophicLevel::Decomposer: decomposers++; break;
                case TrophicLevel::Parasite: parasites++; break;
                default: break;
            }
        }
        int maxPop = std::max({autotrophs, herbivores, predators, decomposers, parasites, 1});

        ImGui::TextColored(ImVec4(0.2f,0.8f,0.3f,1), "Autotrophs: %d", autotrophs);
        ImGui::ProgressBar((float)autotrophs / maxPop, ImVec2(-1, 12));

        ImGui::TextColored(ImVec4(0.8f,0.8f,0.2f,1), "Herbivores: %d", herbivores);
        ImGui::ProgressBar((float)herbivores / maxPop, ImVec2(-1, 12));

        ImGui::TextColored(ImVec4(0.9f,0.2f,0.2f,1), "Predators: %d", predators);
        ImGui::ProgressBar((float)predators / maxPop, ImVec2(-1, 12));

        ImGui::TextColored(ImVec4(0.6f,0.4f,0.8f,1), "Decomposers: %d", decomposers);
        ImGui::ProgressBar((float)decomposers / maxPop, ImVec2(-1, 12));

        ImGui::TextColored(ImVec4(0.8f,0.3f,0.5f,1), "Parasites: %d", parasites);
        ImGui::ProgressBar((float)parasites / maxPop, ImVec2(-1, 12));
    }

    if (ImGui::CollapsingHeader("Environment")) {
        ImGui::Text("Season: %s", st.season.c_str());
        ImGui::Text("Daylight: %.2f", st.dayLight);
        ImGui::Text("Ambient Temp: %.1f°C", st.ambientTemperature);
        ImGui::Text("O2: %.1f%%", st.oxygenLevel * 100);
        ImGui::Text("CO2: %.2f%%", st.co2Level * 100);
        ImGui::Separator();
        ImGui::Text("Nutrients: %d", (int)st.nutrients.size());
        ImGui::Text("Viruses: %d", (int)st.viruses.size());
        ImGui::Text("Bonds: %d", (int)st.bonds.size());
        ImGui::Text("Sounds: %d", (int)st.sounds.size());
        ImGui::Text("Obstacles: %d", (int)st.obstacles.size());
        ImGui::Text("Zones: %d", (int)st.zones.size());
        if (st.abiogenesisMode) {
            ImGui::Separator();
            ImGui::Text("Prebiotic Molecules: %d", st.prebioticMolecules);
            ImGui::Text("Protocells: %d", st.prebioticProtocells);
        }
    }

    if (ImGui::CollapsingHeader("Species")) {
        int activeCount = 0, extinctCount = 0;
        for (auto& s : st.speciesHistory) {
            if (s.extinct) extinctCount++; else activeCount++;
        }
        ImGui::Text("Active Species: %d", activeCount);
        ImGui::Text("Extinct Species: %d", extinctCount);
        ImGui::Text("Total Ever: %d", (int)st.speciesHistory.size());
        ImGui::Text("Novelty Archive: %d", (int)st.noveltyArchive.size());
    }

    ImGui::End();
}

// ═══════════════════════════════════════════════════════════════════════════
// GRAPHS PANEL
// ═══════════════════════════════════════════════════════════════════════════

void Gui::renderGraphsPanel(const Engine& engine) {
    ImGuiIO& io = ImGui::GetIO();

    ImGui::SetNextWindowPos(ImVec2(210, io.DisplaySize.y - 220), ImGuiCond_FirstUseEver);
    ImGui::SetNextWindowSize(ImVec2(io.DisplaySize.x - 540, 210), ImGuiCond_FirstUseEver);
    ImGui::Begin("Graphs", &showGraphs);

    auto& history = engine.state.history;
    int hSize = (int)history.size();

    if (hSize < 2) {
        ImGui::Text("Collecting data...");
        ImGui::End();
        return;
    }

    // Prepare data arrays
    static std::vector<float> popData, energyData, compData, virusData, bondData;
    static std::vector<float> autoData, herbData, predData, decompData;
    popData.resize(hSize); energyData.resize(hSize); compData.resize(hSize);
    virusData.resize(hSize); bondData.resize(hSize);
    autoData.resize(hSize); herbData.resize(hSize);
    predData.resize(hSize); decompData.resize(hSize);

    for (int i = 0; i < hSize; i++) {
        popData[i] = (float)history[i].population;
        energyData[i] = history[i].avgEnergy;
        compData[i] = history[i].avgComplexity;
        virusData[i] = (float)history[i].virusCount;
        bondData[i] = (float)history[i].bondCount;
        autoData[i] = (float)history[i].autotrophCount;
        herbData[i] = (float)history[i].herbivoreCount;
        predData[i] = (float)history[i].predatorCount;
        decompData[i] = (float)history[i].decomposerCount;
    }

    ImVec2 graphSize(-1, 80);

    if (ImGui::BeginTabBar("GraphTabs")) {
        if (ImGui::BeginTabItem("Population")) {
            ImGui::PlotLines("##pop", popData.data(), hSize, 0, "Population", 0, FLT_MAX, graphSize);
            ImGui::EndTabItem();
        }
        if (ImGui::BeginTabItem("Energy")) {
            ImGui::PlotLines("##energy", energyData.data(), hSize, 0, "Avg Energy", 0, FLT_MAX, graphSize);
            ImGui::EndTabItem();
        }
        if (ImGui::BeginTabItem("Complexity")) {
            ImGui::PlotLines("##comp", compData.data(), hSize, 0, "Avg Complexity", 0, FLT_MAX, graphSize);
            ImGui::EndTabItem();
        }
        if (ImGui::BeginTabItem("Trophic")) {
            ImGui::PlotLines("##auto", autoData.data(), hSize, 0, "Autotrophs", 0, FLT_MAX, ImVec2(-1, 40));
            ImGui::PlotLines("##herb", herbData.data(), hSize, 0, "Herbivores", 0, FLT_MAX, ImVec2(-1, 40));
            ImGui::PlotLines("##pred", predData.data(), hSize, 0, "Predators", 0, FLT_MAX, ImVec2(-1, 40));
            ImGui::EndTabItem();
        }
        if (ImGui::BeginTabItem("Virus/Bonds")) {
            ImGui::PlotLines("##virus", virusData.data(), hSize, 0, "Viruses", 0, FLT_MAX, ImVec2(-1, 40));
            ImGui::PlotLines("##bonds", bondData.data(), hSize, 0, "Bonds", 0, FLT_MAX, ImVec2(-1, 40));
            ImGui::EndTabItem();
        }
        ImGui::EndTabBar();
    }

    ImGui::End();
}

// ═══════════════════════════════════════════════════════════════════════════
// SETTINGS WINDOW
// ═══════════════════════════════════════════════════════════════════════════

void Gui::renderSettingsWindow(Engine& engine) {
    ImGui::SetNextWindowSize(ImVec2(500, 700), ImGuiCond_FirstUseEver);
    ImGui::Begin("Simulation Settings", &showSettings);

    ImGui::TextWrapped("Changes are applied in real-time. Some settings (world size, 3D) require a reset to take full effect.");
    ImGui::Separator();

    if (ImGui::CollapsingHeader("World", ImGuiTreeNodeFlags_DefaultOpen)) {
        ImGui::SliderInt("Width", &editConfig.width, 200, 5000);
        ImGui::SliderInt("Height", &editConfig.height, 200, 5000);
        ImGui::SliderInt("Depth (3D)", &editConfig.depth, 100, 2000);
        ImGui::SliderFloat("World Scale", &editConfig.worldScale, 0.1f, 5.0f);
        ImGui::Checkbox("Enable 3D", &editConfig.enable3D);
    }

    if (ImGui::CollapsingHeader("Particles", ImGuiTreeNodeFlags_DefaultOpen)) {
        ImGui::SliderInt("Initial Particles", &editConfig.initialParticles, 10, 5000);
        ImGui::SliderInt("Max Particles", &editConfig.maxParticles, 50, 50000);
    }

    if (ImGui::CollapsingHeader("Physics", ImGuiTreeNodeFlags_DefaultOpen)) {
        ImGui::SliderFloat("Friction", &editConfig.friction, 0.5f, 1.0f, "%.3f");
        ImGui::SliderFloat("Repulsion", &editConfig.repulsion, 0.0f, 100.0f);
        ImGui::SliderFloat("Gravity", &editConfig.gravity, 0.0f, 5.0f);
    }

    if (ImGui::CollapsingHeader("Biology", ImGuiTreeNodeFlags_DefaultOpen)) {
        ImGui::SliderFloat("Mutation Rate", &editConfig.mutationRate, 0.0f, 1.0f, "%.3f");
        ImGui::SliderFloat("Nutrient Spawn Rate", &editConfig.nutrientSpawnRate, 0.0f, 50.0f);
        ImGui::SliderFloat("Virus Spawn Rate", &editConfig.virusSpawnRate, 0.0f, 5.0f);
    }

    if (ImGui::CollapsingHeader("Temperature", ImGuiTreeNodeFlags_DefaultOpen)) {
        ImGui::SliderFloat("Ambient Temperature", &editConfig.ambientTemperature, -50.0f, 100.0f, "%.1f°C");
    }

    if (ImGui::CollapsingHeader("Feature Toggles", ImGuiTreeNodeFlags_DefaultOpen)) {
        ImGui::Checkbox("Abiogenesis", &editConfig.enableAbiogenesis);
        ImGui::SameLine(); ImGui::TextDisabled("(?)");
        if (ImGui::IsItemHovered())
            ImGui::SetTooltip("Enable prebiotic chemistry and protocell formation");

        ImGui::Checkbox("Immune System", &editConfig.enableImmuneSystem);
        ImGui::Checkbox("Epigenetics", &editConfig.enableEpigenetics);
        ImGui::Checkbox("Morphogens", &editConfig.enableMorphogens);
        ImGui::Checkbox("Temperature", &editConfig.enableTemperature);
        ImGui::Checkbox("Trophic Levels", &editConfig.enableTrophicLevels);
    }

    ImGui::Separator();

    // Apply button
    if (ImGui::Button("Apply Changes", ImVec2(150, 30))) {
        engine.config = editConfig;
        configDirty = false;
        SLOG_OK("[GUI] Settings applied");
    }
    ImGui::SameLine();
    if (ImGui::Button("Reset & Apply", ImVec2(150, 30))) {
        engine.config = editConfig;
        engine = Engine(editConfig);
        configDirty = false;
        SLOG_OK("[GUI] Settings applied + simulation reset");
    }
    ImGui::SameLine();
    if (ImGui::Button("Reload from Engine", ImVec2(150, 30))) {
        editConfig = engine.config;
        configDirty = false;
    }

    ImGui::End();
}

// ═══════════════════════════════════════════════════════════════════════════
// SPECIES WINDOW
// ═══════════════════════════════════════════════════════════════════════════

void Gui::renderSpeciesWindow(const Engine& engine) {
    ImGui::SetNextWindowSize(ImVec2(500, 400), ImGuiCond_FirstUseEver);
    ImGui::Begin("Species List", &showSpecies);

    auto& species = engine.state.speciesHistory;

    // Filter
    static bool showExtinct = false;
    ImGui::Checkbox("Show Extinct", &showExtinct);
    ImGui::SameLine();
    ImGui::Text("(%d total, showing %s)", (int)species.size(),
                showExtinct ? "all" : "active only");

    ImGui::Separator();

    if (ImGui::BeginTable("SpeciesTable", 7,
        ImGuiTableFlags_Borders | ImGuiTableFlags_RowBg |
        ImGuiTableFlags_Resizable | ImGuiTableFlags_ScrollY,
        ImVec2(0, -1))) {
        ImGui::TableSetupColumn("ID", ImGuiTableColumnFlags_WidthFixed, 40);
        ImGui::TableSetupColumn("Color", ImGuiTableColumnFlags_WidthFixed, 30);
        ImGui::TableSetupColumn("Parent", ImGuiTableColumnFlags_WidthFixed, 50);
        ImGui::TableSetupColumn("Trophic", ImGuiTableColumnFlags_WidthStretch);
        ImGui::TableSetupColumn("Pop", ImGuiTableColumnFlags_WidthFixed, 40);
        ImGui::TableSetupColumn("Size", ImGuiTableColumnFlags_WidthFixed, 50);
        ImGui::TableSetupColumn("Status", ImGuiTableColumnFlags_WidthFixed, 60);
        ImGui::TableHeadersRow();

        for (int i = (int)species.size() - 1; i >= 0; i--) {
            auto& s = species[i];
            if (!showExtinct && s.extinct) continue;

            ImGui::TableNextRow();
            ImGui::TableNextColumn(); ImGui::Text("%d", s.id);
            ImGui::TableNextColumn();
            ImVec4 col(s.color[0]/255.0f, s.color[1]/255.0f, s.color[2]/255.0f, 1);
            ImGui::ColorButton("##c", col, 0, ImVec2(16,16));
            ImGui::TableNextColumn(); ImGui::Text("%d", s.parentId);
            ImGui::TableNextColumn(); ImGui::Text("%s", trophicName(s.trophicLevel));
            ImGui::TableNextColumn(); ImGui::Text("%d", s.population);
            ImGui::TableNextColumn(); ImGui::Text("%.1f", s.avgSize);
            ImGui::TableNextColumn();
            if (s.extinct)
                ImGui::TextColored(ImVec4(1,0.3f,0.3f,1), "Extinct");
            else
                ImGui::TextColored(ImVec4(0.3f,1,0.3f,1), "Active");
        }
        ImGui::EndTable();
    }

    ImGui::End();
}

// ═══════════════════════════════════════════════════════════════════════════
// PERFORMANCE WINDOW
// ═══════════════════════════════════════════════════════════════════════════

void Gui::renderPerformanceWindow(float fps, float dt) {
    ImGui::SetNextWindowSize(ImVec2(350, 250), ImGuiCond_FirstUseEver);
    ImGui::Begin("Performance", &showPerformance);

    ImGui::Text("FPS: %.1f", fps);
    ImGui::Text("Frame Time: %.2f ms", dt * 1000.0f);

    ImGui::PlotLines("FPS", fpsHistory, 120, historyIdx, nullptr, 0, 120, ImVec2(-1, 60));
    ImGui::PlotLines("Frame ms", dtHistory, 120, historyIdx, nullptr, 0, 50, ImVec2(-1, 60));

    ImGui::Separator();
    ImGuiIO& io = ImGui::GetIO();
    ImGui::Text("Display: %dx%d", (int)io.DisplaySize.x, (int)io.DisplaySize.y);
    ImGui::Text("ImGui Vertices: %d", ImGui::GetIO().MetricsRenderVertices);
    ImGui::Text("ImGui Indices: %d", ImGui::GetIO().MetricsRenderIndices);

    ImGui::End();
}

// ═══════════════════════════════════════════════════════════════════════════
// ABOUT WINDOW
// ═══════════════════════════════════════════════════════════════════════════

void Gui::renderAboutWindow() {
    ImGui::SetNextWindowSize(ImVec2(400, 300), ImGuiCond_FirstUseEver);
    ImGui::Begin("About Genesis 3.0", &showAbout);

    ImGui::TextColored(ImVec4(0.4f, 0.8f, 1.0f, 1.0f), "Genesis 3.0 - Native C++ Edition");
    ImGui::Separator();
    ImGui::TextWrapped(
        "An artificial life simulation with neural networks, genetics, "
        "epigenetics, immune systems, chemistry, trophic levels, "
        "morphogens, temperature dynamics, and more.\n\n"
        "Features:\n"
        "- DNA-based genome with 20 codon types\n"
        "- 18-12-14 neural network brain per organism\n"
        "- Membrane biology with chemical permeability\n"
        "- Immune system with antibodies\n"
        "- Epigenetic methylation under stress\n"
        "- 4-channel morphogen field\n"
        "- Temperature field with seasonal cycles\n"
        "- Trophic ecosystem (autotrophs, herbivores, predators, decomposers)\n"
        "- Viral infection & evolution\n"
        "- Novelty search for evolutionary pressure\n"
        "- Pheromone communication\n"
        "- Cell differentiation & multicellularity via bonds\n\n"
        "Keyboard Shortcuts:\n"
        "  Space - Pause/Resume\n"
        "  1-4   - Speed (x1, x2, x5, x10)\n"
        "  D     - Toggle debug overlay\n"
        "  F     - Spawn food\n"
        "  R     - Reset simulation\n"
        "  +/-   - Zoom\n"
        "  Arrows - Pan camera\n"
        "  Home  - Reset camera"
    );

    ImGui::Separator();
    ImGui::Text("Built with SDL2, OpenGL, Dear ImGui");

    ImGui::End();
}

// ═══════════════════════════════════════════════════════════════════════════
// WORLD CLICK HANDLING
// ═══════════════════════════════════════════════════════════════════════════

const Particle* Gui::findParticleAt(float worldX, float worldY, const SimState& state) const {
    const Particle* closest = nullptr;
    float closestDist = 900.0f; // Max 30 pixels
    for (auto& p : state.particles) {
        if (p.dead) continue;
        float dx = p.x - worldX, dy = p.y - worldY;
        float distSq = dx * dx + dy * dy;
        float hitR = p.radius + 5.0f;
        if (distSq < hitR * hitR && distSq < closestDist) {
            closestDist = distSq;
            closest = &p;
        }
    }
    return closest;
}

void Gui::handleWorldClick(float worldX, float worldY, Engine& engine) {
    auto& st = engine.state;

    switch (currentTool) {
        case Tool::Pan:
            // Pan is handled by the main loop
            break;

        case Tool::Inspect: {
            auto* p = findParticleAt(worldX, worldY, st);
            selectedParticleId = p ? p->id : -1;
            break;
        }

        case Tool::SpawnFood:
            for (int i = 0; i < foodCount; i++)
                engine.spawnNutrient(
                    worldX + randf(-toolRadius, toolRadius),
                    worldY + randf(-toolRadius, toolRadius),
                    foodAmount);
            break;

        case Tool::SpawnParticle:
            engine.spawnParticleAt(worldX, worldY);
            break;

        case Tool::Kill: {
            for (auto& p : st.particles) {
                if (p.dead) continue;
                float dx = p.x - worldX, dy = p.y - worldY;
                if (dx*dx + dy*dy < toolRadius * toolRadius) {
                    p.dead = true;
                }
            }
            break;
        }

        case Tool::Drag: {
            auto* p = findParticleAt(worldX, worldY, st);
            if (p) dragParticleId = p->id;
            break;
        }

        case Tool::AddObstacle: {
            Obstacle o;
            o.x = worldX - obstacleW / 2;
            o.y = worldY - obstacleH / 2;
            o.z = 0;
            o.w = obstacleW;
            o.h = obstacleH;
            o.d = engine.config.enable3D ? 20.0f : 1.0f;
            st.obstacles.push_back(o);
            break;
        }

        case Tool::AddToxicZone: {
            Zone z; z.x = worldX; z.y = worldY; z.z = 0; z.r = zoneRadius;
            z.type = ZoneType::Toxic; z.dx = z.dy = z.dz = 0;
            z.zoneTemperature = 0; z.intensity = 0;
            st.zones.push_back(z);
            break;
        }

        case Tool::AddShadowZone: {
            Zone z; z.x = worldX; z.y = worldY; z.z = 0; z.r = zoneRadius;
            z.type = ZoneType::Shadow; z.dx = z.dy = z.dz = 0;
            z.zoneTemperature = 0; z.intensity = 0;
            st.zones.push_back(z);
            break;
        }

        case Tool::AddCurrentZone: {
            Zone z; z.x = worldX; z.y = worldY; z.z = 0; z.r = zoneRadius;
            z.type = ZoneType::Current; z.dx = currentDX; z.dy = currentDY; z.dz = 0;
            z.zoneTemperature = 0; z.intensity = 0;
            st.zones.push_back(z);
            break;
        }

        case Tool::AddThermalVent: {
            Zone z; z.x = worldX; z.y = worldY; z.z = 0; z.r = zoneRadius;
            z.type = ZoneType::ThermalVent; z.dx = z.dy = z.dz = 0;
            z.zoneTemperature = ventTemperature; z.intensity = toolIntensity;
            st.zones.push_back(z);
            break;
        }

        case Tool::AddRadiationZone: {
            Zone z; z.x = worldX; z.y = worldY; z.z = 0; z.r = zoneRadius;
            z.type = ZoneType::Radiation; z.dx = z.dy = z.dz = 0;
            z.zoneTemperature = 0; z.intensity = radiationIntensity;
            st.zones.push_back(z);
            break;
        }

        case Tool::AddNutrientZone: {
            Zone z; z.x = worldX; z.y = worldY; z.z = 0; z.r = zoneRadius;
            z.type = ZoneType::NutrientRich; z.dx = z.dy = z.dz = 0;
            z.zoneTemperature = 0; z.intensity = nutrientRichIntensity;
            st.zones.push_back(z);
            break;
        }

        case Tool::SpawnVirus:
            engine.spawnVirusAt(worldX, worldY);
            break;

        case Tool::PaintPheromone:
            engine.addPheromoneAt(worldX, worldY, pheromoneStrength);
            break;

        case Tool::Eraser: {
            // Remove closest zone or obstacle
            float bestDist = toolRadius * toolRadius;
            int bestZone = -1, bestObs = -1;
            for (int i = 0; i < (int)st.zones.size(); i++) {
                float dx = st.zones[i].x - worldX, dy = st.zones[i].y - worldY;
                float d = dx*dx + dy*dy;
                if (d < bestDist) { bestDist = d; bestZone = i; bestObs = -1; }
            }
            for (int i = 0; i < (int)st.obstacles.size(); i++) {
                float cx = st.obstacles[i].x + st.obstacles[i].w/2;
                float cy = st.obstacles[i].y + st.obstacles[i].h/2;
                float dx = cx - worldX, dy = cy - worldY;
                float d = dx*dx + dy*dy;
                if (d < bestDist) { bestDist = d; bestObs = i; bestZone = -1; }
            }
            if (bestZone >= 0)
                st.zones.erase(st.zones.begin() + bestZone);
            else if (bestObs >= 0)
                st.obstacles.erase(st.obstacles.begin() + bestObs);
            break;
        }

        default: break;
    }
}

void Gui::handleWorldDrag(float worldX, float worldY, float dx, float dy, Engine& engine) {
    if (currentTool == Tool::Drag && dragParticleId >= 0) {
        for (auto& p : engine.state.particles) {
            if (p.id == dragParticleId && !p.dead) {
                p.x = worldX;
                p.y = worldY;
                p.vx = 0;
                p.vy = 0;
                break;
            }
        }
    }
    if (currentTool == Tool::PaintPheromone) {
        engine.addPheromoneAt(worldX, worldY, pheromoneStrength * 0.1f);
    }
    if (currentTool == Tool::SpawnFood) {
        if (randf() < 0.3f)
            engine.spawnNutrient(worldX + randf(-20, 20), worldY + randf(-20, 20), foodAmount);
    }
}

void Gui::handleWorldRelease(Engine& engine) {
    dragParticleId = -1;
}

// ═══════════════════════════════════════════════════════════════════════════
// SAVE / LOAD (simplified binary format)
// ═══════════════════════════════════════════════════════════════════════════

void Gui::saveState(const Engine& engine, const char* filename) {
    FILE* f = fopen(filename, "wb");
    if (!f) { SLOG_ERROR("[GUI] Failed to save: %s", filename); return; }

    // Write config
    fwrite(&engine.config, sizeof(SimConfig), 1, f);

    // Write basic state
    fwrite(&engine.state.time, sizeof(float), 1, f);
    fwrite(&engine.state.dayLight, sizeof(float), 1, f);
    fwrite(&engine.state.ambientTemperature, sizeof(float), 1, f);
    fwrite(&engine.state.oxygenLevel, sizeof(float), 1, f);
    fwrite(&engine.state.co2Level, sizeof(float), 1, f);

    // Write particle count and particles (simplified - just core data)
    int particleCount = (int)engine.state.particles.size();
    fwrite(&particleCount, sizeof(int), 1, f);
    // Note: Full serialization of particles with their genomes would require
    // a more sophisticated approach. For now we save enough to restart.

    fclose(f);
    SLOG_OK("[GUI] State saved to %s (%d particles)", filename, particleCount);
}

void Gui::loadState(Engine& engine, const char* filename) {
    FILE* f = fopen(filename, "rb");
    if (!f) { SLOG_ERROR("[GUI] Failed to load: %s", filename); return; }

    SimConfig config;
    fread(&config, sizeof(SimConfig), 1, f);

    float time, dayLight, ambientTemp, o2, co2;
    fread(&time, sizeof(float), 1, f);
    fread(&dayLight, sizeof(float), 1, f);
    fread(&ambientTemp, sizeof(float), 1, f);
    fread(&o2, sizeof(float), 1, f);
    fread(&co2, sizeof(float), 1, f);

    int particleCount;
    fread(&particleCount, sizeof(int), 1, f);

    fclose(f);

    // Restart engine with loaded config and particle count
    config.initialParticles = particleCount;
    engine = Engine(config);
    engine.state.time = time;
    engine.state.oxygenLevel = o2;
    engine.state.co2Level = co2;

    editConfig = config;
    SLOG_OK("[GUI] State loaded from %s (restarted with %d particles)", filename, particleCount);
}

// ═══════════════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════════════

const char* Gui::toolName(Tool t) const {
    switch (t) {
        case Tool::Pan:            return "Pan";
        case Tool::Inspect:        return "Inspect";
        case Tool::SpawnFood:      return "Spawn Food";
        case Tool::Kill:           return "Kill";
        case Tool::Drag:           return "Drag";
        case Tool::AddObstacle:    return "Add Obstacle";
        case Tool::AddToxicZone:   return "Toxic Zone";
        case Tool::AddShadowZone:  return "Shadow Zone";
        case Tool::AddCurrentZone: return "Current Zone";
        case Tool::AddThermalVent: return "Thermal Vent";
        case Tool::AddRadiationZone:return "Radiation";
        case Tool::AddNutrientZone:return "Nutrient Rich";
        case Tool::SpawnVirus:     return "Spawn Virus";
        case Tool::PaintPheromone: return "Pheromone";
        case Tool::SpawnParticle:  return "Spawn Particle";
        case Tool::Eraser:         return "Eraser";
        default:                   return "Unknown";
    }
}

const char* Gui::trophicName(TrophicLevel t) const {
    switch (t) {
        case TrophicLevel::Molecule:   return "Molecule";
        case TrophicLevel::Autotroph:  return "Autotroph";
        case TrophicLevel::Herbivore:  return "Herbivore";
        case TrophicLevel::Predator:   return "Predator";
        case TrophicLevel::Decomposer: return "Decomposer";
        case TrophicLevel::Parasite:   return "Parasite";
        default:                       return "Unknown";
    }
}

const char* Gui::zoneName(ZoneType z) const {
    switch (z) {
        case ZoneType::Toxic:       return "Toxic";
        case ZoneType::Shadow:      return "Shadow";
        case ZoneType::Current:     return "Current";
        case ZoneType::ThermalVent: return "Thermal Vent";
        case ZoneType::Radiation:   return "Radiation";
        case ZoneType::NutrientRich:return "Nutrient Rich";
        default:                    return "Unknown";
    }
}
