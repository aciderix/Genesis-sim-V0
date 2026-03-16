#pragma once
#include "types.h"

constexpr float PHEROMONE_CELL_SIZE = 10.0f;
constexpr float MORPHOGEN_CELL_SIZE = 20.0f;
constexpr float TEMP_CELL_SIZE = 30.0f;
constexpr float GRID_SIZE = 50.0f;

class Engine {
public:
    SimState state;
    SimConfig config;
    int nextId = 1;
    int nextSpeciesId = 1;
    int nextVirusStrain = 1;

    Engine(const SimConfig& cfg);
    void init();
    void update(float dt);

    // Public for tools
    void spawnNutrient(float x = -1, float y = -1, float amount = -1);
    void addPheromoneAt(float x, float y, float amount);
    Particle createParticle(int id, const Genome& genome, int speciesId,
                            float px, float py, float pz, float energy = -1,
                            int generation = 1, int parentId = 0);

private:
    // Pheromone double-buffer
    std::vector<float> pheromonesBuffer2;
    int pheromoneCols, pheromoneRows, pheromoneDepth;

    // Spatial grid
    int gridCols, gridRows, gridDepth;
    std::vector<std::vector<Particle*>> grid;
    std::vector<std::vector<Nutrient*>> nutrientGrid;

    // Reusable NN buffers
    float nnInputs[NEURAL_INPUTS];
    float nnHidden[NEURAL_HIDDEN];
    float nnOutputs[NEURAL_OUTPUTS];

    // Particle map for bonds
    std::unordered_map<int, Particle*> particleMap;
    std::unordered_set<int64_t> bondSet;
    std::unordered_set<int> activeSpecies;

    // Frame counter for throttling
    int frameCount = 0;

    // Deferred buffers to avoid vector invalidation during iteration
    std::vector<Particle> pendingBirths;
    std::vector<Nutrient> pendingNutrients;

    // DNA & Genome
    DNA randomDNA();
    Genome randomGenome();
    Brain randomBrain();
    Membrane randomMembrane();
    ImmuneSystem createImmuneSystem();
    int calculateComplexity(const Genome& g);
    void expressGenome(const DNA& dna, Genome& out);
    Genome cloneGenome(const Genome& g);
    Genome crossover(const Genome& g1, const Genome& g2);
    Genome mutateGenome(const Genome& g);

    // Spawning
    void spawnRandomParticle();
    void spawnProtocell();

    // Subsystems
    void reproduce(Particle& p, Particle* mate);
    void processImmune(Particle& p, float dt);
    void processEpigenetics(Particle& p, float dt);

    // Fields
    void updatePheromones(float dt);
    void updateMorphogens(float dt);
    void updateTemperature(float dt);
    void updateOrganisms();

    // Helpers
    float getPheromoneAt(float x, float y) const;
    float getMorphogenAt(float x, float y, int channel) const;
    float getTemperatureAt(float x, float y) const;
    void addMorphogenAt(float x, float y, int channel, float amount);

    struct TraitXY { float traitX, traitY; };
    TraitXY getTraits(const Brain& brain);

    static int64_t bkey(int a, int b) {
        return a < b ? (int64_t)a * 1000000 + b : (int64_t)b * 1000000 + a;
    }

    int geneCount(const DNA& dna, Codon codon);
};
