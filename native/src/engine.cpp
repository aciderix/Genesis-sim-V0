#include "engine.h"
#include <cstring>
#include <cmath>
#include <set>
#include <functional>

Engine::Engine(const SimConfig& cfg) : config(cfg) {
    int d = cfg.enable3D ? cfg.depth : 1;
    pheromoneCols = (int)std::ceil((float)cfg.width / PHEROMONE_CELL_SIZE);
    pheromoneRows = (int)std::ceil((float)cfg.height / PHEROMONE_CELL_SIZE);
    pheromoneDepth = cfg.enable3D ? (int)std::ceil((float)d / PHEROMONE_CELL_SIZE) : 1;
    int pSize = pheromoneCols * pheromoneRows * pheromoneDepth;
    pheromonesBuffer2.resize(pSize, 0.0f);

    gridCols = (int)std::ceil((float)cfg.width / GRID_SIZE);
    gridRows = (int)std::ceil((float)cfg.height / GRID_SIZE);
    gridDepth = cfg.enable3D ? (int)std::ceil((float)d / GRID_SIZE) : 1;
    int totalCells = gridCols * gridRows * gridDepth;
    grid.resize(totalCells);
    nutrientGrid.resize(totalCells);

    int mCols = (int)std::ceil((float)cfg.width / MORPHOGEN_CELL_SIZE);
    int mRows = (int)std::ceil((float)cfg.height / MORPHOGEN_CELL_SIZE);
    int mDepth = cfg.enable3D ? (int)std::ceil((float)d / MORPHOGEN_CELL_SIZE) : 1;

    int tCols = (int)std::ceil((float)cfg.width / TEMP_CELL_SIZE);
    int tRows = (int)std::ceil((float)cfg.height / TEMP_CELL_SIZE);
    int tDepth = cfg.enable3D ? (int)std::ceil((float)d / TEMP_CELL_SIZE) : 1;

    state.width = cfg.width;
    state.height = cfg.height;
    state.depth = d;
    state.time = 0;
    state.dayLight = 1.0f;
    state.season = "Spring";
    state.ambientTemperature = cfg.ambientTemperature;
    state.oxygenLevel = 0.21f;
    state.co2Level = 0.04f;
    state.abiogenesisMode = cfg.enableAbiogenesis;
    state.prebioticMolecules = 0;
    state.prebioticProtocells = 0;

    state.pheromones.resize(pSize, 0.0f);
    state.pheromoneCols = pheromoneCols;
    state.pheromoneRows = pheromoneRows;
    state.pheromoneDepth = pheromoneDepth;

    state.morphogens.data.resize(mCols * mRows * mDepth * NUM_MORPHOGENS, 0.0f);
    state.morphogens.cols = mCols;
    state.morphogens.rows = mRows;
    state.morphogens.depth = mDepth;

    state.temperature.data.resize(tCols * tRows * tDepth, cfg.ambientTemperature);
    state.temperature.cols = tCols;
    state.temperature.rows = tRows;
    state.temperature.depth = tDepth;

    // Default obstacles & zones
    state.obstacles.push_back({300, 300, 0, 20, 200, cfg.enable3D ? 200.0f : 1.0f});
    state.obstacles.push_back({800, 400, 0, 200, 20, cfg.enable3D ? 20.0f : 1.0f});

    state.zones.push_back({200, 200, 0, 100, ZoneType::Toxic, 0,0,0, 0, 0});
    state.zones.push_back({1000, 200, 0, 150, ZoneType::Shadow, 0,0,0, 0, 0});
    state.zones.push_back({600, 600, 0, 120, ZoneType::Current, 50,-20,0, 0, 0});
    state.zones.push_back({400, 700, 0, 80, ZoneType::ThermalVent, 0,0,0, 80, 1.0f});
    state.zones.push_back({900, 500, 0, 100, ZoneType::NutrientRich, 0,0,0, 0, 2.0f});

    // Pre-reserve to reduce reallocations
    state.particles.reserve(config.maxParticles);
    state.nutrients.reserve(500);
    state.bonds.reserve(1000);
    pendingBirths.reserve(64);
    pendingNutrients.reserve(64);

    init();
}

void Engine::init() {
    if (config.enableAbiogenesis) {
        for (int i = 0; i < 500; i++) spawnNutrient();
        for (int i = 0; i < 20; i++) spawnProtocell();
    } else {
        for (int i = 0; i < config.initialParticles; i++) spawnRandomParticle();
        for (int i = 0; i < 100; i++) spawnNutrient();
    }
}

// ═══ DNA System ═══════════════════════════════════════════════════════════
DNA Engine::randomDNA() {
    DNA dna;
    dna.genes.resize(DNA_LENGTH);
    for (int i = 0; i < DNA_LENGTH; i++) {
        dna.genes[i] = {
            static_cast<Codon>(randi(0, 20)),
            randf(),
            randf() < 0.1f,
            randf() < 0.8f ? 1.0f : 0.0f
        };
    }
    dna.mhcSignature = randi(0, 1000000);
    dna.telomereLength = 50.0f + randf() * 50.0f;
    return dna;
}

int Engine::geneCount(const DNA& dna, Codon codon) {
    int c = 0;
    for (auto& g : dna.genes)
        if (g.codon == codon && !g.methylated) c++;
    return c;
}

void Engine::expressGenome(const DNA& dna, Genome& out) {
    float photoScore = 0, chemScore = 0, digestScore = 0, decompScore = 0;
    float moveScore = 0, senseScore = 0, attackScore = 0, defendScore = 0;
    float promoter = 1.0f;

    for (auto& gene : dna.genes) {
        if (gene.methylated || gene.expression < 0.5f) continue;
        float v = gene.value * promoter;
        switch (gene.codon) {
            case Codon::PHOTOSYNTH: photoScore += v; break;
            case Codon::CHEMSYNTH: chemScore += v; break;
            case Codon::DIGEST: digestScore += v; break;
            case Codon::DECOMPOSE: decompScore += v; break;
            case Codon::MOVE: moveScore += v; break;
            case Codon::SENSE: senseScore += v; break;
            case Codon::ATTACK: attackScore += v; break;
            case Codon::DEFEND: defendScore += v; break;
            case Codon::PROMOTE: promoter = std::min(3.0f, promoter + 0.5f); break;
            case Codon::SUPPRESS: promoter = std::max(0.1f, promoter - 0.5f); break;
            default: promoter = 1.0f; break;
        }
    }

    float scores[] = {photoScore + chemScore, digestScore, attackScore, decompScore};
    int maxIdx = 0;
    for (int i = 1; i < 4; i++) if (scores[i] > scores[maxIdx]) maxIdx = i;

    TrophicLevel trophic;
    switch (maxIdx) {
        case 0: trophic = TrophicLevel::Autotroph; break;
        case 1: trophic = TrophicLevel::Herbivore; break;
        case 2: trophic = TrophicLevel::Predator; break;
        default: trophic = TrophicLevel::Decomposer; break;
    }

    out.trophicLevel = trophic;
    out.baseMetabolism = 0.3f + moveScore * 0.1f;
    out.speed = 0.5f + moveScore * 0.3f;
    out.senseRange = 1.0f + senseScore * 0.5f;
    out.size = 0.8f + defendScore * 0.2f;
    out.heatTolerance = 40.0f + geneCount(dna, Codon::DEFEND) * 10.0f;
    out.coldTolerance = -10.0f - geneCount(dna, Codon::DEFEND) * 5.0f;
}

// ═══ Immune / Membrane / Brain ════════════════════════════════════════════
ImmuneSystem Engine::createImmuneSystem() {
    return {{}, 0.0f, 10.0f, 0.5f};
}

Membrane Engine::randomMembrane() {
    Membrane m;
    for (int i = 0; i < NUM_CHEMICALS; i++) m.permeability[i] = randf() * 0.5f + 0.1f;
    m.integrity = 1.0f;
    m.osmosisRate = 0.1f + randf() * 0.3f;
    for (int i = 0; i < NUM_MORPHOGENS; i++) m.receptors[i] = randf();
    return m;
}

Brain Engine::randomBrain() {
    Brain b;
    for (int i = 0; i < NEURAL_INPUTS; i++)
        for (int j = 0; j < NEURAL_HIDDEN; j++)
            b.wIH[i][j] = randf(-1.0f, 1.0f);
    for (int i = 0; i < NEURAL_HIDDEN; i++)
        for (int j = 0; j < NEURAL_OUTPUTS; j++)
            b.wHO[i][j] = randf(-1.0f, 1.0f);
    for (int i = 0; i < NEURAL_HIDDEN; i++) b.biasH[i] = randf(-0.25f, 0.25f);
    for (int i = 0; i < NEURAL_OUTPUTS; i++) b.biasO[i] = randf(-0.25f, 0.25f);
    b.neuromodulator = 1.0f;
    b.plasticity = 0.01f;
    return b;
}

int Engine::calculateComplexity(const Genome& g) {
    float comp = 0;
    for (int i = 0; i < NEURAL_INPUTS; i++)
        for (int j = 0; j < NEURAL_HIDDEN; j++)
            comp += std::abs(g.brain.wIH[i][j]);
    for (int i = 0; i < NEURAL_HIDDEN; i++)
        for (int j = 0; j < NEURAL_OUTPUTS; j++)
            comp += std::abs(g.brain.wHO[i][j]);
    std::unordered_set<int> codons;
    for (auto& gene : g.dna.genes) codons.insert((int)gene.codon);
    comp += codons.size() * 5.0f;
    return (int)comp;
}

// ═══ Genome Creation ══════════════════════════════════════════════════════
Genome Engine::randomGenome() {
    Genome g;
    g.dna = randomDNA();
    expressGenome(g.dna, g);
    g.brain = randomBrain();
    g.membrane = randomMembrane();
    g.mhcType = g.dna.mhcSignature;

    int numReactions = randi(0, 5);
    for (int i = 0; i < numReactions; i++) {
        Reaction r;
        r.sub = randi(0, NUM_CHEMICALS);
        r.prod = randi(0, NUM_CHEMICALS);
        r.rate = randf() * 0.1f;
        r.energyDelta = randf(-1.0f, 1.0f);
        r.inhibitor = randf() > 0.7f ? randi(0, NUM_CHEMICALS) : -1;
        r.catalyst = randf() > 0.8f ? randi(0, NUM_CHEMICALS) : -1;
        r.activationEnergy = 10.0f + randf() * 30.0f;
        r.isEnzymatic = randf() > 0.6f;
        g.reactions.push_back(r);
    }

    TrophicLevel trophic = g.trophicLevel;
    if (trophic == TrophicLevel::Autotroph) {
        g.color[0] = (uint8_t)(30 + randf() * 50);
        g.color[1] = (uint8_t)(150 + randf() * 105);
        g.color[2] = (uint8_t)(30 + randf() * 50);
    } else if (trophic == TrophicLevel::Herbivore) {
        g.color[0] = (uint8_t)(100 + randf() * 100);
        g.color[1] = (uint8_t)(100 + randf() * 100);
        g.color[2] = (uint8_t)(30 + randf() * 50);
    } else if (trophic == TrophicLevel::Predator) {
        g.color[0] = (uint8_t)(180 + randf() * 75);
        g.color[1] = (uint8_t)(30 + randf() * 50);
        g.color[2] = (uint8_t)(30 + randf() * 50);
    } else {
        g.color[0] = (uint8_t)(100 + randf() * 80);
        g.color[1] = (uint8_t)(80 + randf() * 60);
        g.color[2] = (uint8_t)(150 + randf() * 105);
    }

    return g;
}

Particle Engine::createParticle(int id, const Genome& genome, int speciesId,
                                 float px, float py, float pz, float energy,
                                 int generation, int parentId) {
    Particle p;
    p.id = id;
    p.x = px; p.y = py; p.z = pz;
    p.vx = p.vy = p.vz = 0;
    p.angle = randf() * 6.2831853f;
    p.pitch = config.enable3D ? randf(-1.5707f, 1.5707f) : 0;
    p.radius = 4.0f * genome.size;
    p.mass = 1.0f * genome.size;
    p.energy = energy > 0 ? energy : (80.0f + randf() * 40.0f);
    p.age = 0;
    std::memset(p.chem, 0, sizeof(p.chem));
    p.mem = 0;
    p.genome = genome;
    p.dead = false;
    p.generation = generation;
    p.parentId = parentId;
    p.organismId = id;
    p.speciesId = speciesId;
    p.complexity = calculateComplexity(genome);
    p.trophicLevel = genome.trophicLevel;
    p.digestEfficiency = 0.5f + randf() * 0.3f;
    p.biofilm = false;
    p.temperature = config.ambientTemperature;
    p.immune = createImmuneSystem();
    p.infected = false;
    p.infectionTimer = 0;
    std::memset(p.morphogens, 0, sizeof(p.morphogens));
    p.differentiation = 0;
    p.stressLevel = 0;
    p.divisionsLeft = genome.dna.telomereLength;
    p.cellType = "stem";
    return p;
}

Engine::TraitXY Engine::getTraits(const Brain& brain) {
    float tx = 0, ty = 0;
    for (int i = 0; i < std::min(6, NEURAL_HIDDEN); i++) {
        tx += brain.wHO[i][2] + brain.wHO[i][3];
        ty += brain.wHO[i][4] + brain.wHO[i][0];
    }
    return {tx, ty};
}

void Engine::spawnNutrient(float x, float y, float amount) {
    Nutrient n;
    n.x = x >= 0 ? x : randf() * config.width;
    n.y = y >= 0 ? y : randf() * config.height;
    n.z = config.enable3D ? randf() * config.depth : 0;
    n.amount = amount > 0 ? amount : (10.0f + randf() * 20.0f);
    n.isCorpse = false;
    for (int i = 0; i < NUM_CHEMICALS; i++)
        n.chemicalContent[i] = randf() > 0.7f ? randf() * 5.0f : 0.0f;
    n.temperature = config.ambientTemperature;
    n.trophicValue = TrophicLevel::Molecule;
    state.nutrients.push_back(n);
}

void Engine::spawnRandomParticle() {
    Genome genome = randomGenome();
    int speciesId = nextSpeciesId++;
    auto traits = getTraits(genome.brain);
    SpeciesRecord sr;
    sr.id = speciesId; sr.parentId = 0;
    sr.color[0] = genome.color[0]; sr.color[1] = genome.color[1]; sr.color[2] = genome.color[2];
    sr.timestamp = state.time; sr.extinct = false;
    sr.traitX = traits.traitX; sr.traitY = traits.traitY;
    sr.trophicLevel = genome.trophicLevel;
    sr.avgSize = genome.size; sr.population = 1;
    state.speciesHistory.push_back(sr);

    int id = nextId++;
    state.particles.push_back(createParticle(id, genome, speciesId,
        randf() * config.width, randf() * config.height,
        config.enable3D ? randf() * config.depth : 0));
}

void Engine::spawnProtocell() {
    Genome genome = randomGenome();
    for (int i = 10; i < (int)genome.dna.genes.size(); i++)
        genome.dna.genes[i].methylated = true;
    genome.trophicLevel = TrophicLevel::Autotroph;
    genome.size = 0.5f;
    genome.speed = 0.3f;

    int speciesId = nextSpeciesId++;
    auto traits = getTraits(genome.brain);
    SpeciesRecord sr;
    sr.id = speciesId; sr.parentId = 0;
    sr.color[0] = genome.color[0]; sr.color[1] = genome.color[1]; sr.color[2] = genome.color[2];
    sr.timestamp = state.time; sr.extinct = false;
    sr.traitX = traits.traitX; sr.traitY = traits.traitY;
    sr.trophicLevel = genome.trophicLevel;
    sr.avgSize = genome.size; sr.population = 1;
    state.speciesHistory.push_back(sr);

    int id = nextId++;
    state.particles.push_back(createParticle(id, genome, speciesId,
        randf() * config.width, randf() * config.height,
        config.enable3D ? randf() * config.depth : 0,
        40.0f + randf() * 20.0f));
    state.prebioticProtocells++;
}

// ═══ Genome Operations ════════════════════════════════════════════════════
Genome Engine::cloneGenome(const Genome& g) {
    Genome c = g; // Deep copy (struct copy is sufficient for fixed arrays)
    c.dna.genes = g.dna.genes; // vector deep copy
    c.dna.telomereLength = g.dna.telomereLength - 1;
    c.reactions = g.reactions;
    c.membrane.integrity = 1.0f;
    return c;
}

Genome Engine::crossover(const Genome& g1, const Genome& g2) {
    Genome child = cloneGenome(g1);
    int crossPoint = randi(0, DNA_LENGTH);
    int minLen = std::min((int)child.dna.genes.size(), (int)g2.dna.genes.size());
    for (int i = crossPoint; i < minLen; i++)
        child.dna.genes[i] = g2.dna.genes[i];

    for (int i = 0; i < NEURAL_INPUTS; i++)
        for (int j = 0; j < NEURAL_HIDDEN; j++)
            if (randf() > 0.5f) child.brain.wIH[i][j] = g2.brain.wIH[i][j];
    for (int i = 0; i < NEURAL_HIDDEN; i++)
        for (int j = 0; j < NEURAL_OUTPUTS; j++)
            if (randf() > 0.5f) child.brain.wHO[i][j] = g2.brain.wHO[i][j];

    child.color[0] = (uint8_t)((g1.color[0] + g2.color[0]) / 2);
    child.color[1] = (uint8_t)((g1.color[1] + g2.color[1]) / 2);
    child.color[2] = (uint8_t)((g1.color[2] + g2.color[2]) / 2);

    expressGenome(child.dna, child);
    return child;
}

Genome Engine::mutateGenome(const Genome& genome) {
    Genome g = cloneGenome(genome);
    float mr = config.mutationRate;

    for (auto& gene : g.dna.genes) {
        if (randf() < mr * 0.5f) gene.codon = static_cast<Codon>(randi(0, 20));
        if (randf() < mr) gene.value = clampf(gene.value + randf(-0.15f, 0.15f), 0, 1);
        if (randf() < mr * 0.2f) gene.methylated = !gene.methylated;
    }
    if (randf() < mr * 0.1f && (int)g.dna.genes.size() < DNA_LENGTH * 2) {
        int idx = randi(0, (int)g.dna.genes.size());
        g.dna.genes.insert(g.dna.genes.begin() + idx,
            Gene{static_cast<Codon>(randi(0, 20)), randf(), false, 1.0f});
    }
    if (randf() < mr * 0.1f && (int)g.dna.genes.size() > 10) {
        int idx = randi(0, (int)g.dna.genes.size());
        g.dna.genes.erase(g.dna.genes.begin() + idx);
    }

    for (int i = 0; i < NEURAL_INPUTS; i++)
        for (int j = 0; j < NEURAL_HIDDEN; j++)
            if (randf() < mr) g.brain.wIH[i][j] += randf(-0.5f, 0.5f);
    for (int i = 0; i < NEURAL_HIDDEN; i++)
        for (int j = 0; j < NEURAL_OUTPUTS; j++)
            if (randf() < mr) g.brain.wHO[i][j] += randf(-0.5f, 0.5f);
    for (int i = 0; i < NEURAL_HIDDEN; i++)
        if (randf() < mr) g.brain.biasH[i] += randf(-0.15f, 0.15f);
    for (int i = 0; i < NEURAL_OUTPUTS; i++)
        if (randf() < mr) g.brain.biasO[i] += randf(-0.15f, 0.15f);

    g.color[0] = (uint8_t)clampf(g.color[0] + randf(-25, 25), 0, 255);
    g.color[1] = (uint8_t)clampf(g.color[1] + randf(-25, 25), 0, 255);
    g.color[2] = (uint8_t)clampf(g.color[2] + randf(-25, 25), 0, 255);

    if (randf() < mr) g.size = clampf(g.size + randf(-0.1f, 0.1f), 0.3f, 3.0f);
    if (randf() < mr) g.speed = clampf(g.speed + randf(-0.1f, 0.1f), 0.1f, 3.0f);
    if (randf() < mr) g.senseRange = clampf(g.senseRange + randf(-0.15f, 0.15f), 0.3f, 5.0f);

    for (int i = 0; i < NUM_CHEMICALS; i++)
        if (randf() < mr) g.membrane.permeability[i] = clampf(g.membrane.permeability[i] + randf(-0.05f, 0.05f), 0, 1);

    expressGenome(g.dna, g);
    return g;
}

// ═══ Reproduction ═════════════════════════════════════════════════════════
void Engine::reproduce(Particle& p, Particle* mate) {
    if (config.maxParticles > 0 && (int)(state.particles.size() + pendingBirths.size()) >= config.maxParticles) return;
    if (p.divisionsLeft <= 0) return;

    p.energy -= 40;
    p.divisionsLeft--;
    if (mate) { mate->energy -= 40; mate->divisionsLeft--; }

    float childEnergy = mate ? 60.0f : 30.0f;
    Genome baseGenome = mate ? crossover(p.genome, mate->genome) : cloneGenome(p.genome);
    Genome finalGenome = mutateGenome(baseGenome);

    bool isMutated = std::abs(finalGenome.brain.wHO[0][0] - p.genome.brain.wHO[0][0]) > 0.1f;

    int speciesId = p.speciesId;
    if (isMutated) {
        speciesId = nextSpeciesId++;
        auto traits = getTraits(finalGenome.brain);
        SpeciesRecord sr;
        sr.id = speciesId; sr.parentId = p.speciesId;
        sr.color[0] = finalGenome.color[0]; sr.color[1] = finalGenome.color[1]; sr.color[2] = finalGenome.color[2];
        sr.timestamp = state.time; sr.extinct = false;
        sr.traitX = traits.traitX; sr.traitY = traits.traitY;
        sr.trophicLevel = finalGenome.trophicLevel;
        sr.avgSize = finalGenome.size; sr.population = 1;
        state.speciesHistory.push_back(sr);
    }

    int childId = nextId++;
    int mateGen = mate ? mate->generation : 0;
    // Defer birth to avoid vector reallocation during iteration
    pendingBirths.push_back(createParticle(childId, finalGenome, speciesId,
        p.x + randf(-5, 5), p.y + randf(-5, 5),
        p.z + (config.enable3D ? randf(-5, 5) : 0),
        childEnergy, std::max(p.generation, mateGen) + 1, p.id));
}

// ═══ Immune / Epigenetics ═════════════════════════════════════════════════
void Engine::processImmune(Particle& p, float dt) {
    if (!config.enableImmuneSystem) return;
    auto& im = p.immune;
    im.inflammationLevel = std::max(0.0f, im.inflammationLevel - dt * 0.1f);
    if (p.infected) {
        p.infectionTimer -= dt;
        p.energy -= dt * 2;
        im.inflammationLevel = std::min(1.0f, im.inflammationLevel + dt * 0.3f);
        for (auto& ab : im.antibodies)
            if (ab.strength > 0.5f) p.infectionTimer -= dt * ab.strength * 2;
        if (p.infectionTimer <= 0) {
            p.infected = false;
            im.memoryStrength = std::min(1.0f, im.memoryStrength + 0.1f);
        }
    }
    for (int i = (int)im.antibodies.size() - 1; i >= 0; i--) {
        im.antibodies[i].age += dt;
        if (im.antibodies[i].age > 100 && im.antibodies[i].strength < 0.3f)
            im.antibodies.erase(im.antibodies.begin() + i);
    }
}

void Engine::processEpigenetics(Particle& p, float dt) {
    if (!config.enableEpigenetics) return;
    if (p.stressLevel > 0.7f) {
        for (auto& gene : p.genome.dna.genes)
            if (randf() < dt * 0.01f * p.stressLevel)
                gene.methylated = !gene.methylated;
    }
    float stress = 0;
    if (p.energy < 30) stress += 0.3f;
    if (p.infected) stress += 0.4f;
    if (std::abs(p.temperature - config.ambientTemperature) > 20) stress += 0.3f;
    p.stressLevel = p.stressLevel * 0.99f + stress * 0.01f;
}

// ═══ Field Updates ════════════════════════════════════════════════════════
void Engine::updatePheromones(float dt) {
    auto& read = state.pheromones;
    auto& write = pheromonesBuffer2;
    int cols = pheromoneCols, rows = pheromoneRows;
    float decay = std::pow(0.9f, dt * 60.0f);
    for (int y = 0; y < rows; y++) {
        for (int x = 0; x < cols; x++) {
            int idx = y * cols + x;
            float sum = read[idx]; int count = 1;
            if (x > 0) { sum += read[idx - 1]; count++; }
            if (x < cols - 1) { sum += read[idx + 1]; count++; }
            if (y > 0) { sum += read[idx - cols]; count++; }
            if (y < rows - 1) { sum += read[idx + cols]; count++; }
            write[idx] = (sum / count) * decay;
        }
    }
    std::swap(state.pheromones, pheromonesBuffer2);
}

void Engine::updateMorphogens(float dt) {
    if (!config.enableMorphogens) return;
    auto& m = state.morphogens;
    int cols = m.cols, rows = m.rows, depth = m.depth;
    float decay = std::pow(0.95f, dt * 60.0f);

    for (int z = 0; z < depth; z++) {
        for (int y = 0; y < rows; y++) {
            for (int x = 0; x < cols; x++) {
                for (int c = 0; c < NUM_MORPHOGENS; c++) {
                    int idx = ((z * rows + y) * cols + x) * NUM_MORPHOGENS + c;
                    float sum = m.data[idx]; int count = 1;
                    if (x > 0) { sum += m.data[idx - NUM_MORPHOGENS]; count++; }
                    if (x < cols-1) { sum += m.data[idx + NUM_MORPHOGENS]; count++; }
                    if (y > 0) { sum += m.data[idx - cols * NUM_MORPHOGENS]; count++; }
                    if (y < rows-1) { sum += m.data[idx + cols * NUM_MORPHOGENS]; count++; }
                    m.data[idx] = (sum / count) * decay;
                }
            }
        }
    }
}

void Engine::updateTemperature(float dt) {
    if (!config.enableTemperature) return;
    auto& t = state.temperature;
    int cols = t.cols, rows = t.rows;
    float ambient = state.ambientTemperature;
    float decayRate = 0.01f * dt;

    for (int y = 0; y < rows; y++) {
        for (int x = 0; x < cols; x++) {
            int idx = y * cols + x;
            t.data[idx] += (ambient - t.data[idx]) * decayRate;
            float sum = t.data[idx]; int count = 1;
            if (x > 0) { sum += t.data[idx - 1]; count++; }
            if (x < cols-1) { sum += t.data[idx + 1]; count++; }
            if (y > 0) { sum += t.data[idx - cols]; count++; }
            if (y < rows-1) { sum += t.data[idx + cols]; count++; }
            t.data[idx] = sum / count;
        }
    }

    for (auto& z : state.zones) {
        if (z.type == ZoneType::ThermalVent && z.zoneTemperature > 0) {
            int cx = (int)(z.x / TEMP_CELL_SIZE);
            int cy = (int)(z.y / TEMP_CELL_SIZE);
            int r = (int)std::ceil(z.r / TEMP_CELL_SIZE);
            for (int dy = -r; dy <= r; dy++) {
                for (int dx = -r; dx <= r; dx++) {
                    int nx = cx + dx, ny = cy + dy;
                    if (nx >= 0 && nx < cols && ny >= 0 && ny < rows) {
                        float dist = std::sqrt((float)(dx*dx + dy*dy));
                        if (dist <= r) {
                            int idx = ny * cols + nx;
                            float influence = (1.0f - dist / r) * z.intensity;
                            t.data[idx] += (z.zoneTemperature - t.data[idx]) * influence * dt;
                        }
                    }
                }
            }
        }
    }
}

void Engine::updateOrganisms() {
    std::unordered_map<int, int> parent;
    std::function<int(int)> find = [&](int i) -> int {
        if (parent.find(i) == parent.end()) parent[i] = i;
        if (parent[i] == i) return i;
        return parent[i] = find(parent[i]);
    };
    for (auto& b : state.bonds) {
        int ri = find(b.p1), rj = find(b.p2);
        if (ri != rj) parent[ri] = rj;
    }
    for (auto& p : state.particles) p.organismId = find(p.id);
}

// ═══ Field Accessors ══════════════════════════════════════════════════════
float Engine::getPheromoneAt(float x, float y) const {
    int cx = (int)(x / PHEROMONE_CELL_SIZE);
    int cy = (int)(y / PHEROMONE_CELL_SIZE);
    if (cx >= 0 && cx < pheromoneCols && cy >= 0 && cy < pheromoneRows)
        return state.pheromones[cy * pheromoneCols + cx];
    return 0;
}

void Engine::addPheromoneAt(float x, float y, float amount) {
    int cx = (int)(x / PHEROMONE_CELL_SIZE);
    int cy = (int)(y / PHEROMONE_CELL_SIZE);
    if (cx >= 0 && cx < pheromoneCols && cy >= 0 && cy < pheromoneRows)
        state.pheromones[cy * pheromoneCols + cx] += amount;
}

float Engine::getMorphogenAt(float x, float y, int channel) const {
    if (!config.enableMorphogens) return 0;
    auto& m = state.morphogens;
    int cx = (int)clampf(std::floor(x / MORPHOGEN_CELL_SIZE), 0, (float)(m.cols - 1));
    int cy = (int)clampf(std::floor(y / MORPHOGEN_CELL_SIZE), 0, (float)(m.rows - 1));
    return m.data[(cy * m.cols + cx) * NUM_MORPHOGENS + channel];
}

void Engine::addMorphogenAt(float x, float y, int channel, float amount) {
    if (!config.enableMorphogens) return;
    auto& m = state.morphogens;
    int cx = (int)clampf(std::floor(x / MORPHOGEN_CELL_SIZE), 0, (float)(m.cols - 1));
    int cy = (int)clampf(std::floor(y / MORPHOGEN_CELL_SIZE), 0, (float)(m.rows - 1));
    m.data[(cy * m.cols + cx) * NUM_MORPHOGENS + channel] += amount;
}

float Engine::getTemperatureAt(float x, float y) const {
    if (!config.enableTemperature) return config.ambientTemperature;
    auto& t = state.temperature;
    int cx = (int)clampf(std::floor(x / TEMP_CELL_SIZE), 0, (float)(t.cols - 1));
    int cy = (int)clampf(std::floor(y / TEMP_CELL_SIZE), 0, (float)(t.rows - 1));
    return t.data[cy * t.cols + cx];
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN UPDATE LOOP
// ═══════════════════════════════════════════════════════════════════════════
void Engine::update(float dt) {
    state.time += dt;
    frameCount++;

    // Seasons & Daylight
    float yearLength = 120.0f;
    float yearPhase = std::fmod(state.time, yearLength) / yearLength;
    if (yearPhase < 0.25f) state.season = "Spring";
    else if (yearPhase < 0.5f) state.season = "Summer";
    else if (yearPhase < 0.75f) state.season = "Autumn";
    else state.season = "Winter";

    float seasonTemp = 1.0f;
    if (state.season == "Winter") seasonTemp = 0.6f;
    if (state.season == "Summer") seasonTemp = 1.4f;
    state.dayLight = (std::sin((state.time / 60.0f) * 3.14159265f * 2) * 0.5f + 0.5f) * seasonTemp;

    if (config.enableTemperature)
        state.ambientTemperature = config.ambientTemperature + (seasonTemp - 1.0f) * 20.0f;

    // CO2 / O2
    int totalPhotosynthesis = 0;
    for (auto& p : state.particles)
        if (p.trophicLevel == TrophicLevel::Autotroph) totalPhotosynthesis++;
    int totalRespiration = (int)state.particles.size();
    state.oxygenLevel = clampf(state.oxygenLevel + (totalPhotosynthesis * 0.0001f - totalRespiration * 0.00005f) * dt, 0.05f, 0.4f);
    state.co2Level = clampf(state.co2Level + (totalRespiration * 0.00005f - totalPhotosynthesis * 0.0001f) * dt, 0.01f, 0.2f);

    // Throttled field updates
    if (frameCount % 3 == 0) updateOrganisms();
    if (frameCount % 2 == 0) updatePheromones(dt * 2);
    if (frameCount % 3 == 0) updateMorphogens(dt * 3);
    if (frameCount % 3 == 0) updateTemperature(dt * 3);

    // Sounds – swap-and-pop removal (O(1) per remove instead of O(n))
    for (int i = (int)state.sounds.size() - 1; i >= 0; i--) {
        state.sounds[i].radius += dt * 200;
        state.sounds[i].volume -= dt * 2;
        if (state.sounds[i].volume <= 0) {
            state.sounds[i] = state.sounds.back();
            state.sounds.pop_back();
        }
    }

    // Nutrient spawning
    if (randf() < config.nutrientSpawnRate * dt * seasonTemp) spawnNutrient();
    for (auto& z : state.zones) {
        if (z.type == ZoneType::NutrientRich && randf() < z.intensity * dt * 2)
            spawnNutrient(z.x + randf(-0.5f, 0.5f) * z.r, z.y + randf(-0.5f, 0.5f) * z.r);
    }

    // Abiogenesis
    if (state.abiogenesisMode && (int)state.particles.size() < 50 && randf() < dt * 0.5f)
        spawnProtocell();

    // ─── Build spatial grids ──────────────────────────────────────
    int cols = gridCols, rows = gridRows;
    for (auto& cell : grid) cell.clear();
    for (auto& cell : nutrientGrid) cell.clear();

    particleMap.clear();
    for (auto& p : state.particles) {
        if (p.dead) continue;
        particleMap[p.id] = &p;
        int gx = (int)clampf(std::floor(p.x / GRID_SIZE), 0, (float)(cols - 1));
        int gy = (int)clampf(std::floor(p.y / GRID_SIZE), 0, (float)(rows - 1));
        grid[gy * cols + gx].push_back(&p);
    }
    for (auto& n : state.nutrients) {
        if (n.amount <= 0) continue;
        int gx = (int)clampf(std::floor(n.x / GRID_SIZE), 0, (float)(cols - 1));
        int gy = (int)clampf(std::floor(n.y / GRID_SIZE), 0, (float)(rows - 1));
        nutrientGrid[gy * cols + gx].push_back(&n);
    }

    bondSet.clear();
    for (auto& b : state.bonds) bondSet.insert(bkey(b.p1, b.p2));

    // ─── Viruses ──────────────────────────────────────────────────
    if (randf() < config.virusSpawnRate * dt) {
        Virus v;
        v.x = randf() * config.width;
        v.y = randf() * config.height;
        v.z = config.enable3D ? randf() * config.depth : 0;
        v.radius = 3; v.life = 10; v.mutationRate = 0.3f + randf() * 0.5f;
        v.mhcTarget = randi(0, 1000000);
        v.strain = nextVirusStrain++;
        state.viruses.push_back(v);
    }

    for (int i = (int)state.viruses.size() - 1; i >= 0; i--) {
        auto& v = state.viruses[i];
        v.life -= dt;
        v.x += randf(-25, 25) * dt;
        v.y += randf(-25, 25) * dt;
        v.x = clampf(v.x, 0, (float)config.width);
        v.y = clampf(v.y, 0, (float)config.height);

        if (v.life <= 0) { state.viruses.erase(state.viruses.begin() + i); continue; }

        bool hit = false;
        int vgx = (int)clampf(std::floor(v.x / GRID_SIZE), 0, (float)(cols - 1));
        int vgy = (int)clampf(std::floor(v.y / GRID_SIZE), 0, (float)(rows - 1));
        for (int dx = -1; dx <= 1 && !hit; dx++) {
            for (int dy = -1; dy <= 1 && !hit; dy++) {
                int nx = vgx + dx, ny = vgy + dy;
                if (nx < 0 || nx >= cols || ny < 0 || ny >= rows) continue;
                for (auto* p : grid[ny * cols + nx]) {
                    if (p->dead) continue;
                    float dSq = (p->x - v.x)*(p->x - v.x) + (p->y - v.y)*(p->y - v.y);
                    if (dSq < (p->radius + v.radius)*(p->radius + v.radius)) {
                        bool blocked = false;
                        if (config.enableImmuneSystem) {
                            for (auto& ab : p->immune.antibodies) {
                                if (std::abs(ab.targetSignature - v.strain) < 100 && ab.strength > 0.5f) {
                                    blocked = true;
                                    ab.strength = std::min(1.0f, ab.strength + 0.1f);
                                    break;
                                }
                            }
                        }
                        if (!blocked) {
                            p->genome = mutateGenome(p->genome);
                            p->energy -= 20;
                            p->infected = true;
                            p->infectionTimer = 5 + randf() * 5;
                            p->immune.inflammationLevel = std::min(1.0f, p->immune.inflammationLevel + 0.5f);
                            if (config.enableImmuneSystem && (int)p->immune.antibodies.size() < NUM_ANTIBODIES)
                                p->immune.antibodies.push_back({v.strain, 0.3f, 0});
                        }
                        hit = true;
                        break;
                    }
                }
            }
        }
        if (hit) state.viruses.erase(state.viruses.begin() + i);
    }

    // ─── Novelty search (throttled) ───────────────────────────────
    if (frameCount % 20 == 0 && !state.particles.empty()) {
        float totalE = 0, totalC = 0;
        for (auto& p : state.particles) { totalE += p.energy; totalC += (float)p.complexity; }
        float avgEnergy = totalE / state.particles.size();
        float avgComp = totalC / state.particles.size();

        NoveltyDescriptor descriptor = {(int)state.particles.size(), avgEnergy, avgComp};
        float minD = 1e18f;
        for (auto& arch : state.noveltyArchive) {
            float d = std::abs((float)(arch.pop - descriptor.pop))
                    + std::abs(arch.avgEnergy - descriptor.avgEnergy)
                    + std::abs(arch.avgComp - descriptor.avgComp);
            if (d < minD) minD = d;
        }
        if (minD > 20 || state.noveltyArchive.empty()) {
            state.noveltyArchive.push_back(descriptor);
            if ((int)state.noveltyArchive.size() > 500) state.noveltyArchive.erase(state.noveltyArchive.begin());
            for (auto& p : state.particles)
                if (p.complexity >= (int)avgComp) p.energy += 20;
        }
    }

    // ═══ PARTICLE UPDATE LOOP ═════════════════════════════════════
    for (int pi = 0; pi < (int)state.particles.size(); pi++) {
        Particle& p = state.particles[pi];
        if (p.dead) continue;

        p.age += dt;
        p.energy -= dt * p.genome.baseMetabolism;

        // Temperature effects
        if (config.enableTemperature) {
            float localTemp = getTemperatureAt(p.x, p.y);
            p.temperature += (localTemp - p.temperature) * 0.1f * dt;
            if (p.temperature > p.genome.heatTolerance)
                p.energy -= (p.temperature - p.genome.heatTolerance) * dt * 0.5f;
            if (p.temperature < p.genome.coldTolerance)
                p.energy -= (p.genome.coldTolerance - p.temperature) * dt * 0.5f;
        }

        // Zone effects
        float localLight = state.dayLight;
        for (auto& z : state.zones) {
            float dSq = (p.x - z.x)*(p.x - z.x) + (p.y - z.y)*(p.y - z.y);
            if (dSq < z.r * z.r) {
                switch (z.type) {
                    case ZoneType::Toxic: p.energy -= 10 * dt; break;
                    case ZoneType::Shadow: localLight = 0; break;
                    case ZoneType::Current: p.x += z.dx * dt; p.y += z.dy * dt; break;
                    case ZoneType::Radiation:
                        if (randf() < dt * z.intensity) {
                            auto& gene = p.genome.dna.genes[randi(0, (int)p.genome.dna.genes.size())];
                            gene.codon = static_cast<Codon>(randi(0, 20));
                            p.stressLevel += 0.1f;
                        }
                        break;
                    default: break;
                }
            }
        }

        // Photosynthesis
        if (p.trophicLevel == TrophicLevel::Autotroph) {
            float greenness = p.genome.color[1] / 255.0f;
            p.energy += dt * localLight * greenness * 2 * state.oxygenLevel * 5;
        }

        // Chemistry
        for (auto& rx : p.genome.reactions) {
            if (rx.inhibitor >= 0 && p.chem[rx.inhibitor] > 0.5f) continue;
            if (rx.isEnzymatic && rx.catalyst >= 0 && p.chem[rx.catalyst] < 0.1f) continue;
            float tempFactor = config.enableTemperature
                ? std::exp(-rx.activationEnergy / (p.temperature + 273)) * 10
                : 1.0f;
            if (p.chem[rx.sub] > 0 && randf() < rx.rate * dt * tempFactor) {
                float amount = std::min(p.chem[rx.sub], 1.0f);
                p.chem[rx.sub] -= amount;
                p.chem[rx.prod] += amount;
                p.energy += rx.energyDelta * amount;
                if (rx.catalyst >= 0)
                    p.chem[rx.catalyst] = std::min(10.0f, p.chem[rx.catalyst] + 0.01f);
            }
        }

        processImmune(p, dt);
        processEpigenetics(p, dt);

        if (p.stressLevel > 0.5f) {
            p.genome.membrane.integrity -= dt * 0.01f * p.stressLevel;
            p.genome.membrane.integrity = std::max(0.1f, p.genome.membrane.integrity);
        }

        // ─── Neighborhood scan (3x3 grid) ────────────────────────
        int fCount = 0, mCount = 0, dCount = 0;
        Nutrient* closestNutrient = nullptr;
        float closestNutrientDist = 1e18f;
        Particle* closestOther = nullptr;
        float closestOtherDist = 1e18f;
        Particle* closestPrey = nullptr;
        float closestPreyDist = 1e18f;

        int gx = (int)clampf(std::floor(p.x / GRID_SIZE), 0, (float)(cols - 1));
        int gy = (int)clampf(std::floor(p.y / GRID_SIZE), 0, (float)(rows - 1));
        float senseR = 100.0f * p.genome.senseRange;
        float senseRSq = senseR * senseR;

        for (int ddx = -1; ddx <= 1; ddx++) {
            for (int ddy = -1; ddy <= 1; ddy++) {
                int nx2 = gx + ddx, ny2 = gy + ddy;
                if (nx2 < 0 || nx2 >= cols || ny2 < 0 || ny2 >= rows) continue;
                int idx = ny2 * cols + nx2;

                // Nutrients
                for (auto* n : nutrientGrid[idx]) {
                    float dX = n->x - p.x, dY = n->y - p.y;
                    float distSq = dX * dX + dY * dY;
                    if (distSq < senseRSq) {
                        float diff = std::abs(std::atan2(dY, dX) - p.angle);
                        if (diff > 3.14159265f) diff = 6.2831853f - diff;
                        if (diff < 0.5f) fCount++;
                    }
                    if (distSq < closestNutrientDist) { closestNutrientDist = distSq; closestNutrient = n; }
                }

                // Other particles
                for (auto* other : grid[idx]) {
                    if (other->id == p.id || other->dead) continue;
                    float dX = other->x - p.x, dY = other->y - p.y;
                    float distSq = dX * dX + dY * dY;

                    if (distSq < senseRSq) {
                        float diff = std::abs(std::atan2(dY, dX) - p.angle);
                        if (diff > 3.14159265f) diff = 6.2831853f - diff;
                        if (diff < 0.5f) {
                            if (other->speciesId == p.speciesId) mCount++;
                            else dCount++;
                        }
                    }
                    if (distSq < closestOtherDist) { closestOtherDist = distSq; closestOther = other; }
                    if (other->trophicLevel < p.trophicLevel && distSq < closestPreyDist) {
                        closestPreyDist = distSq; closestPrey = other;
                    }

                    // Repulsion
                    float minDist = p.radius + other->radius;
                    if (distSq < minDist * minDist && distSq > 0) {
                        float dist = std::sqrt(distSq);
                        float force = (minDist - dist) * config.repulsion;
                        p.vx += (dX / dist) * force * dt;
                        p.vy += (dY / dist) * force * dt;
                    }
                }
            }
        }

        // Sound detection
        float soundLevel = 0;
        for (auto& s : state.sounds) {
            float dSq2 = (p.x - s.x)*(p.x - s.x) + (p.y - s.y)*(p.y - s.y);
            if (dSq2 < s.radius*s.radius && dSq2 > (s.radius - 20)*(s.radius - 20))
                soundLevel += s.volume;
        }

        // Morphogen sensing
        float morphogenLevel = 0;
        for (int c = 0; c < NUM_MORPHOGENS; c++)
            morphogenLevel += getMorphogenAt(p.x, p.y, c) * p.genome.membrane.receptors[c];

        // ─── Neural Network Forward Pass ──────────────────────────
        nnInputs[0] = 1.0f; // Bias
        nnInputs[1] = p.energy / 100.0f;
        nnInputs[2] = std::min(p.age / 1000.0f, 1.0f);
        nnInputs[3] = fCount > 0 ? 1.0f : 0.0f;
        nnInputs[4] = mCount > 0 ? 1.0f : 0.0f;
        nnInputs[5] = dCount > 0 ? 1.0f : 0.0f;
        nnInputs[6] = getPheromoneAt(p.x, p.y) / 100.0f;
        nnInputs[7] = p.mem;
        nnInputs[8] = soundLevel;
        nnInputs[9] = (float)p.trophicLevel / 5.0f;
        nnInputs[10] = config.enableTemperature ? p.temperature / 100.0f : 0.5f;
        nnInputs[11] = p.genome.membrane.integrity;
        nnInputs[12] = p.infected ? 1.0f : 0.0f;
        nnInputs[13] = p.immune.inflammationLevel;
        nnInputs[14] = morphogenLevel / 10.0f;
        nnInputs[15] = p.stressLevel;
        nnInputs[16] = p.divisionsLeft / 100.0f;
        nnInputs[17] = closestPrey ? 1.0f : 0.0f;

        const Brain& brain = p.genome.brain;
        for (int j = 0; j < NEURAL_HIDDEN; j++) {
            float sum = brain.biasH[j];
            for (int k = 0; k < NEURAL_INPUTS; k++) sum += nnInputs[k] * brain.wIH[k][j];
            nnHidden[j] = fastTanh(sum * brain.neuromodulator);
        }
        for (int j = 0; j < NEURAL_OUTPUTS; j++) {
            float sum = brain.biasO[j];
            for (int k = 0; k < NEURAL_HIDDEN; k++) sum += nnHidden[k] * brain.wHO[k][j];
            nnOutputs[j] = sum;
        }

        // ─── Actions ──────────────────────────────────────────────
        float moveFwd = sigmoid(nnOutputs[0]);
        float turn = fastTanh(nnOutputs[1]);
        float speedMult = p.genome.speed;

        p.vx += std::cos(p.angle) * moveFwd * 2 * speedMult;
        p.vy += std::sin(p.angle) * moveFwd * 2 * speedMult;
        if (config.enable3D) p.vz += std::sin(p.pitch) * moveFwd * speedMult;
        p.angle += turn * dt * 5;
        p.energy -= moveFwd * dt * 0.1f * p.genome.baseMetabolism;

        // Eat
        if (sigmoid(nnOutputs[2]) > 0.5f && closestNutrient &&
            closestNutrientDist < (p.radius + 5)*(p.radius + 5)) {
            bool canEat = p.trophicLevel == TrophicLevel::Autotroph ||
                p.trophicLevel == TrophicLevel::Decomposer ||
                closestNutrient->trophicValue <= p.trophicLevel;
            if (canEat) {
                float consume = std::min(closestNutrient->amount, 20 * dt * p.digestEfficiency);
                closestNutrient->amount -= consume;
                p.energy += consume * 3;
                for (int c = 0; c < NUM_CHEMICALS; c++) {
                    float transfer = closestNutrient->chemicalContent[c] * p.genome.membrane.permeability[c] * dt;
                    p.chem[c] += transfer;
                }
            }
        }

        // Reproduce
        if (sigmoid(nnOutputs[3]) > 0.5f && p.energy > 80) {
            Particle* mate = nullptr;
            if (closestOther && closestOther->speciesId == p.speciesId &&
                closestOtherDist < (p.radius + closestOther->radius + 15)*(p.radius + closestOther->radius + 15))
                mate = closestOther;
            reproduce(p, mate);
        }

        // Attack / predation
        if (sigmoid(nnOutputs[4]) > 0.5f) {
            Particle* target = closestPrey ? closestPrey : closestOther;
            if (target && closestOtherDist < (p.radius + target->radius + 5)*(p.radius + target->radius + 5)
                && target->organismId != p.organismId) {
                float damage = 50 * dt * (p.trophicLevel >= TrophicLevel::Predator ? 1.5f : 1.0f);
                target->energy -= damage;
                target->genome.membrane.integrity -= dt * 0.1f;
                p.energy -= 10 * dt;
                if (target->energy <= 0 && !target->dead) {
                    target->dead = true;
                    float harvestEnergy = p.trophicLevel >= TrophicLevel::Predator ? 80.0f : 50.0f;
                    p.energy += harvestEnergy;
                    Nutrient corpse;
                    corpse.x = target->x; corpse.y = target->y; corpse.z = target->z;
                    corpse.amount = 50; corpse.isCorpse = true;
                    std::memcpy(corpse.chemicalContent, target->chem, sizeof(float) * NUM_CHEMICALS);
                    corpse.temperature = target->temperature;
                    corpse.trophicValue = target->trophicLevel;
                    pendingNutrients.push_back(corpse);
                }
            }
        }

        // Emit Pheromone
        if (sigmoid(nnOutputs[5]) > 0.5f) {
            addPheromoneAt(p.x, p.y, 100 * dt);
            p.energy -= dt * 0.5f;
        }

        // Vocalize (capped at 200 sounds to prevent freeze)
        if (sigmoid(nnOutputs[6]) > 0.5f && p.energy > 10 && (int)state.sounds.size() < 200) {
            Sound s;
            s.x = p.x; s.y = p.y; s.z = p.z;
            s.volume = 1.0f; s.radius = 0; s.frequency = nnOutputs[6] * 1000;
            state.sounds.push_back(s);
            p.energy -= 2 * dt;
        }

        // Memory
        p.mem = sigmoid(nnOutputs[7]);

        // Bond
        if (sigmoid(nnOutputs[8]) > 0.5f && closestOther &&
            closestOtherDist < (p.radius + closestOther->radius + 10)*(p.radius + closestOther->radius + 10)) {
            auto key = bkey(p.id, closestOther->id);
            if (bondSet.find(key) == bondSet.end()) {
                bondSet.insert(key);
                Bond b;
                b.p1 = p.id; b.p2 = closestOther->id;
                b.optimalDistance = p.radius + closestOther->radius + 5;
                b.strength = 0.5f;
                b.chemicalTransfer = true;
                b.signalTransfer = config.enableMorphogens;
                b.type = BondType::Structural;
                state.bonds.push_back(b);
            }
        }

        // Emit morphogen
        if (sigmoid(nnOutputs[9]) > 0.5f && config.enableMorphogens) {
            int channel = std::abs((int)(nnOutputs[9] * 100)) % NUM_MORPHOGENS;
            addMorphogenAt(p.x, p.y, channel, 10 * dt);
            p.energy -= dt * 0.3f;
        }

        // Differentiate
        if (sigmoid(nnOutputs[10]) > 0.5f) {
            p.differentiation = clampf(p.differentiation + dt * 0.1f, 0, 1);
            const char* types[] = {"stem", "motor", "sensor", "digest", "immune", "repro"};
            int typeIdx = std::abs((int)(nnOutputs[10] * 100)) % 6;
            p.cellType = types[typeIdx];
        }

        // Heal
        if (sigmoid(nnOutputs[11]) > 0.5f && p.energy > 20) {
            p.genome.membrane.integrity = std::min(1.0f, p.genome.membrane.integrity + dt * 0.1f);
            p.energy -= dt * 2;
        }

        // Membrane
        if (sigmoid(nnOutputs[12]) > 0.5f) {
            p.genome.membrane.integrity = std::min(1.0f, p.genome.membrane.integrity + dt * 0.05f);
        }

        // Antibody production
        if (sigmoid(nnOutputs[13]) > 0.5f && config.enableImmuneSystem &&
            (int)p.immune.antibodies.size() < NUM_ANTIBODIES) {
            p.immune.antibodies.push_back({randi(0, 1000000), 0.3f, 0});
            p.energy -= 5;
        }

        // Assign role
        const char* roleNames[] = {"Motor","Turner","Mouth","Breeder","Weapon","Emitter","Vocal","Brain","Binder","Signaler","Diff","Healer","Membrane","Immune"};
        int maxOutIdx = 0;
        for (int j = 1; j < NEURAL_OUTPUTS; j++)
            if (nnOutputs[j] > nnOutputs[maxOutIdx]) maxOutIdx = j;
        p.role = roleNames[maxOutIdx];

        // ─── Physics ──────────────────────────────────────────────
        p.x += p.vx * dt; p.y += p.vy * dt;
        if (config.enable3D) p.z += p.vz * dt;
        float frictionFactor = std::pow(config.friction, dt * 60);
        p.vx *= frictionFactor; p.vy *= frictionFactor;
        if (config.enable3D) {
            p.vz *= frictionFactor;
            p.vz -= config.gravity * dt;
        }

        // Obstacles
        for (auto& o : state.obstacles) {
            if (p.x + p.radius > o.x && p.x - p.radius < o.x + o.w &&
                p.y + p.radius > o.y && p.y - p.radius < o.y + o.h) {
                if (p.x < o.x || p.x > o.x + o.w) p.vx *= -1;
                if (p.y < o.y || p.y > o.y + o.h) p.vy *= -1;
                p.x += p.vx * dt; p.y += p.vy * dt;
            }
        }

        // Boundary
        if (p.x < 0) { p.x = 0; p.vx *= -1; }
        if (p.x > config.width) { p.x = (float)config.width; p.vx *= -1; }
        if (p.y < 0) { p.y = 0; p.vy *= -1; }
        if (p.y > config.height) { p.y = (float)config.height; p.vy *= -1; }
        if (config.enable3D) {
            if (p.z < 0) { p.z = 0; p.vz *= -1; }
            if (p.z > config.depth) { p.z = (float)config.depth; p.vz *= -1; }
        }

        // Death
        float winterDrain = state.season == "Winter" ? 1.5f : 0.0f;
        bool telomereDeath = p.divisionsLeft <= 0 && p.age > 500;
        if (p.energy <= 0 || p.age > 1000 - winterDrain * 200 || telomereDeath) {
            p.dead = true;
            Nutrient corpse;
            corpse.x = p.x; corpse.y = p.y; corpse.z = p.z;
            corpse.amount = 50; corpse.isCorpse = true;
            std::memcpy(corpse.chemicalContent, p.chem, sizeof(float) * NUM_CHEMICALS);
            corpse.temperature = p.temperature;
            corpse.trophicValue = p.trophicLevel;
            pendingNutrients.push_back(corpse);
        }
    }

    // Flush deferred births and nutrients
    for (auto& baby : pendingBirths)
        state.particles.push_back(std::move(baby));
    pendingBirths.clear();
    for (auto& n : pendingNutrients)
        state.nutrients.push_back(std::move(n));
    pendingNutrients.clear();

    // Nutrient decay
    for (auto& n : state.nutrients) {
        if (n.isCorpse) {
            n.amount -= dt * 2;
            addPheromoneAt(n.x, n.y, -10 * dt);
            if (n.amount < 20) n.isCorpse = false;
        }
    }
    // In-place nutrient removal
    int nWrite = 0;
    for (int i = 0; i < (int)state.nutrients.size(); i++)
        if (state.nutrients[i].amount > 0)
            state.nutrients[nWrite++] = state.nutrients[i];
    state.nutrients.resize(nWrite);

    // ─── Bond springs ─────────────────────────────────────────────
    int bondWrite = 0;
    for (int i = 0; i < (int)state.bonds.size(); i++) {
        auto& b = state.bonds[i];
        auto it1 = particleMap.find(b.p1), it2 = particleMap.find(b.p2);
        if (it1 == particleMap.end() || it2 == particleMap.end()) continue;
        Particle* p1 = it1->second; Particle* p2 = it2->second;
        if (p1->dead || p2->dead) continue;

        float dx = p2->x - p1->x, dy = p2->y - p1->y;
        float dz = config.enable3D ? (p2->z - p1->z) : 0;
        float distSq = dx*dx + dy*dy + dz*dz;
        if (distSq > 0) {
            float dist = std::sqrt(distSq);
            float force = (dist - b.optimalDistance) * b.strength;
            float nx = dx / dist, ny = dy / dist, nz = dz / dist;
            p1->vx += nx * force * dt * 50; p1->vy += ny * force * dt * 50;
            p2->vx -= nx * force * dt * 50; p2->vy -= ny * force * dt * 50;
            if (config.enable3D) { p1->vz += nz * force * dt * 50; p2->vz -= nz * force * dt * 50; }

            if (dist > b.optimalDistance * 3) continue;

            if (b.chemicalTransfer) {
                for (int c = 0; c < NUM_CHEMICALS; c++) {
                    float perm = std::min(p1->genome.membrane.permeability[c], p2->genome.membrane.permeability[c]);
                    float diff2 = p2->chem[c] - p1->chem[c];
                    float transfer = diff2 * 0.1f * dt * perm;
                    p1->chem[c] += transfer; p2->chem[c] -= transfer;
                }
            }
            if (b.signalTransfer && config.enableMorphogens) {
                for (int c = 0; c < NUM_MORPHOGENS; c++) {
                    float diff2 = p2->morphogens[c] - p1->morphogens[c];
                    p1->morphogens[c] += diff2 * 0.05f * dt;
                    p2->morphogens[c] -= diff2 * 0.05f * dt;
                }
            }
        }
        state.bonds[bondWrite++] = b;
    }
    state.bonds.resize(bondWrite);

    // Species tracking
    activeSpecies.clear();
    for (auto& p : state.particles) activeSpecies.insert(p.speciesId);
    for (auto& s : state.speciesHistory)
        if (!s.extinct && activeSpecies.find(s.id) == activeSpecies.end()) s.extinct = true;

    // In-place dead particle removal
    int pWrite = 0;
    for (int i = 0; i < (int)state.particles.size(); i++)
        if (!state.particles[i].dead)
            state.particles[pWrite++] = std::move(state.particles[i]);
    state.particles.resize(pWrite);

    // Record history (single pass)
    if ((int)state.time > (int)(state.time - dt)) {
        int len = std::max(1, (int)state.particles.size());
        float totalEnergy = 0, totalComp = 0, totalTemp = 0;
        int autotrophs = 0, herbivores = 0, predators = 0, decomposers = 0, parasites = 0;
        for (auto& p : state.particles) {
            totalEnergy += p.energy;
            totalComp += (float)p.complexity;
            totalTemp += p.temperature;
            switch (p.trophicLevel) {
                case TrophicLevel::Autotroph: autotrophs++; break;
                case TrophicLevel::Herbivore: herbivores++; break;
                case TrophicLevel::Predator: predators++; break;
                case TrophicLevel::Decomposer: decomposers++; break;
                case TrophicLevel::Parasite: parasites++; break;
                default: break;
            }
        }
        SimHistory h;
        h.time = state.time; h.population = (int)state.particles.size();
        h.avgEnergy = totalEnergy / len; h.avgComplexity = totalComp / len;
        h.autotrophCount = autotrophs; h.herbivoreCount = herbivores;
        h.predatorCount = predators; h.decomposerCount = decomposers; h.parasiteCount = parasites;
        h.avgTemperature = config.enableTemperature ? totalTemp / len : 0;
        h.virusCount = (int)state.viruses.size();
        h.bondCount = (int)state.bonds.size();
        h.speciesCount = (int)activeSpecies.size();
        h.biomass = totalEnergy;
        state.history.push_back(h);
        if ((int)state.history.size() > 200) state.history.erase(state.history.begin());
    }
}
