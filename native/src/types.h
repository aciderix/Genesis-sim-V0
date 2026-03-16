#pragma once
#include <vector>
#include <array>
#include <cstdint>
#include <cmath>
#include <string>
#include <unordered_map>
#include <unordered_set>
#include <random>
#include <algorithm>

// ═══ Constants ════════════════════════════════════════════════════════════
constexpr int NUM_CHEMICALS = 16;
constexpr int DNA_LENGTH = 64;
constexpr int NUM_MORPHOGENS = 4;
constexpr int NUM_ANTIBODIES = 8;
constexpr int NEURAL_INPUTS = 18;
constexpr int NEURAL_HIDDEN = 12;
constexpr int NEURAL_OUTPUTS = 14;

// ═══ Enums ════════════════════════════════════════════════════════════════
enum class Codon : uint8_t {
    NOP = 0, GROW, DIVIDE, BOND, UNBOND,
    PHOTOSYNTH, CHEMSYNTH, DIGEST, DECOMPOSE,
    MOVE, SENSE, ATTACK, DEFEND, SIGNAL,
    PROMOTE, SUPPRESS, EPIMASK, REPEAT,
    ANTIBODY, MHC, COUNT
};

enum class TrophicLevel : uint8_t {
    Molecule = 0, Autotroph, Herbivore, Predator, Decomposer, Parasite
};

enum class ZoneType : uint8_t {
    Toxic = 0, Shadow, Current, ThermalVent, Radiation, NutrientRich
};

enum class BondType : uint8_t {
    Structural = 0, Neural, Vascular
};

// ═══ Math helpers ═════════════════════════════════════════════════════════
inline float clampf(float v, float lo, float hi) { return v < lo ? lo : (v > hi ? hi : v); }

inline float fastTanh(float x) {
    if (x < -3.0f) return -1.0f;
    if (x > 3.0f) return 1.0f;
    float x2 = x * x;
    return x * (27.0f + x2) / (27.0f + 9.0f * x2);
}

inline float sigmoid(float x) { return 1.0f / (1.0f + std::exp(-x)); }

// ═══ Structures ═══════════════════════════════════════════════════════════

struct Gene {
    Codon codon;
    float value;
    bool methylated;
    float expression;
};

struct DNA {
    std::vector<Gene> genes;
    int mhcSignature;
    float telomereLength;
};

struct Reaction {
    int sub, prod;
    float rate, energyDelta;
    int inhibitor;   // -1 = none
    int catalyst;    // -1 = none
    float activationEnergy;
    bool isEnzymatic;
};

struct Membrane {
    float permeability[NUM_CHEMICALS];
    float integrity;
    float osmosisRate;
    float receptors[NUM_MORPHOGENS];
};

struct Antibody {
    int targetSignature;
    float strength;
    float age;
};

struct ImmuneSystem {
    std::vector<Antibody> antibodies;
    float inflammationLevel;
    float immuneEnergy;
    float memoryStrength;
};

struct Brain {
    float wIH[NEURAL_INPUTS][NEURAL_HIDDEN];
    float wHO[NEURAL_HIDDEN][NEURAL_OUTPUTS];
    float biasH[NEURAL_HIDDEN];
    float biasO[NEURAL_OUTPUTS];
    float neuromodulator;
    float plasticity;
};

struct Genome {
    DNA dna;
    std::vector<Reaction> reactions;
    Brain brain;
    uint8_t color[3];
    TrophicLevel trophicLevel;
    Membrane membrane;
    float baseMetabolism;
    float heatTolerance, coldTolerance;
    float size, speed, senseRange;
    int mhcType;
};

struct Particle {
    int id;
    float x, y, z;
    float vx, vy, vz;
    float angle, pitch;
    float radius, mass;
    float energy;
    float age;
    float chem[NUM_CHEMICALS];
    float mem;
    Genome genome;
    bool dead;
    int generation;
    int parentId;
    int organismId;
    int speciesId;
    int complexity;
    std::string role;
    TrophicLevel trophicLevel;
    float digestEfficiency;
    bool biofilm;
    float temperature;
    ImmuneSystem immune;
    bool infected;
    float infectionTimer;
    float morphogens[NUM_MORPHOGENS];
    float differentiation;
    float stressLevel;
    float divisionsLeft;
    std::string cellType;
};

struct Bond {
    int p1, p2;
    float optimalDistance, strength;
    bool chemicalTransfer, signalTransfer;
    BondType type;
};

struct Obstacle {
    float x, y, z, w, h, d;
};

struct Zone {
    float x, y, z, r;
    ZoneType type;
    float dx, dy, dz;
    float zoneTemperature;
    float intensity;
};

struct Sound {
    float x, y, z;
    float volume, radius, frequency;
};

struct Virus {
    float x, y, z, radius;
    float life, mutationRate;
    int mhcTarget, strain;
};

struct Nutrient {
    float x, y, z;
    float amount;
    bool isCorpse;
    float chemicalContent[NUM_CHEMICALS];
    float temperature;
    TrophicLevel trophicValue;
};

struct SpeciesRecord {
    int id, parentId;
    uint8_t color[3];
    float timestamp;
    bool extinct;
    float traitX, traitY;
    TrophicLevel trophicLevel;
    float avgSize;
    int population;
};

struct SimHistory {
    float time;
    int population;
    float avgEnergy, avgComplexity;
    int autotrophCount, herbivoreCount, predatorCount, decomposerCount, parasiteCount;
    float avgTemperature;
    int virusCount, bondCount, speciesCount;
    float biomass;
};

struct MorphogenField {
    std::vector<float> data;
    int cols, rows, depth;
};

struct TemperatureField {
    std::vector<float> data;
    int cols, rows, depth;
};

struct SimConfig {
    int width, height, depth;
    int initialParticles, maxParticles;
    float friction, repulsion;
    float nutrientSpawnRate, mutationRate;
    bool enable3D;
    bool enableAbiogenesis, enableImmuneSystem, enableEpigenetics;
    bool enableMorphogens, enableTemperature, enableTrophicLevels;
    float gravity, ambientTemperature;
    float virusSpawnRate;
    float worldScale;
};

struct NoveltyDescriptor {
    int pop;
    float avgEnergy, avgComp;
};

struct SimState {
    std::vector<Particle> particles;
    std::vector<Bond> bonds;
    float time;
    int width, height, depth;
    std::vector<Nutrient> nutrients;
    float dayLight;
    std::string season;
    std::vector<Virus> viruses;
    std::vector<SimHistory> history;
    std::vector<SpeciesRecord> speciesHistory;
    std::vector<NoveltyDescriptor> noveltyArchive;
    // Pheromone field
    std::vector<float> pheromones;
    int pheromoneCols, pheromoneRows, pheromoneDepth;
    // Morphogen field
    MorphogenField morphogens;
    TemperatureField temperature;
    // Environment
    std::vector<Obstacle> obstacles;
    std::vector<Zone> zones;
    std::vector<Sound> sounds;
    float ambientTemperature;
    float oxygenLevel, co2Level;
    bool abiogenesisMode;
    int prebioticMolecules, prebioticProtocells;
};

// Random number generator (thread-local for performance)
inline std::mt19937& rng() {
    static thread_local std::mt19937 gen(std::random_device{}());
    return gen;
}

inline float randf() {
    static thread_local std::uniform_real_distribution<float> dist(0.0f, 1.0f);
    return dist(rng());
}

inline float randf(float lo, float hi) {
    return lo + randf() * (hi - lo);
}

inline int randi(int lo, int hi) {
    std::uniform_int_distribution<int> dist(lo, hi - 1);
    return dist(rng());
}
