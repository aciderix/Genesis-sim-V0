import {
  Codon, DNA, Gene, TrophicLevel, Reaction, Genome, Particle, Bond,
  Nutrient, Virus, Sound, Zone, Obstacle, SimConfig, SimState, SpeciesRecord,
  Brain, Membrane, ImmuneSystem, Antibody, MorphogenField, TemperatureField,
  NUM_CHEMICALS, DNA_LENGTH, NUM_MORPHOGENS, NUM_ANTIBODIES,
  NEURAL_INPUTS, NEURAL_HIDDEN, NEURAL_OUTPUTS, SimHistory, Vec3
} from './types';

export const PHEROMONE_CELL_SIZE = 10;
const MORPHOGEN_CELL_SIZE = 20;
const TEMP_CELL_SIZE = 30;

function sigmoid(x: number) { return 1 / (1 + Math.exp(-x)); }
function clamp(v: number, lo: number, hi: number) { return v < lo ? lo : v > hi ? hi : v; }
function dist3d(a: Vec3, b: Vec3) { return Math.sqrt((a.x-b.x)**2 + (a.y-b.y)**2 + (a.z-b.z)**2); }
function bkey(a: number, b: number): number { return a < b ? a * 1000000 + b : b * 1000000 + a; }
// Fast tanh approximation (Pade approximant, ~6x faster than Math.tanh)
function fastTanh(x: number): number {
  if (x < -3) return -1;
  if (x > 3) return 1;
  const x2 = x * x;
  return x * (27 + x2) / (27 + 9 * x2);
}

export class Engine {
  state: SimState;
  config: SimConfig;
  nextId = 1;
  nextSpeciesId = 1;
  nextVirusStrain = 1;
  pheromoneCols: number;
  pheromoneRows: number;
  pheromoneDepth: number;
  pheromonesBuffer2: Float32Array;

  private gridCols: number;
  private gridRows: number;
  private gridDepth: number;
  private grid: Particle[][];
  private nutrientGrid: Nutrient[][];

  // Performance: frame counter for throttling expensive operations
  private _frameCount = 0;

  // Reusable structures
  private bondSet: Set<number> = new Set();
  private _nnInputs = new Float32Array(NEURAL_INPUTS);
  private _nnHidden = new Float32Array(NEURAL_HIDDEN);
  private _nnOutputs = new Float32Array(NEURAL_OUTPUTS);
  private _particleMap: Map<number, Particle> = new Map();
  private _activeSpecies: Set<number> = new Set();

  constructor(config: SimConfig) {
    this.config = config;
    const d = config.enable3D ? config.depth : 1;
    this.pheromoneCols = Math.ceil(config.width / PHEROMONE_CELL_SIZE);
    this.pheromoneRows = Math.ceil(config.height / PHEROMONE_CELL_SIZE);
    this.pheromoneDepth = Math.ceil(d / PHEROMONE_CELL_SIZE) || 1;
    const pSize = this.pheromoneCols * this.pheromoneRows * this.pheromoneDepth;
    this.pheromonesBuffer2 = new Float32Array(pSize);

    const gs = 50;
    this.gridCols = Math.ceil(config.width / gs);
    this.gridRows = Math.ceil(config.height / gs);
    this.gridDepth = config.enable3D ? Math.ceil(d / gs) : 1;
    const totalCells = this.gridCols * this.gridRows * this.gridDepth;
    this.grid = Array.from({ length: totalCells }, () => []);
    this.nutrientGrid = Array.from({ length: totalCells }, () => []);

    const mCols = Math.ceil(config.width / MORPHOGEN_CELL_SIZE);
    const mRows = Math.ceil(config.height / MORPHOGEN_CELL_SIZE);
    const mDepth = config.enable3D ? Math.ceil(d / MORPHOGEN_CELL_SIZE) : 1;

    const tCols = Math.ceil(config.width / TEMP_CELL_SIZE);
    const tRows = Math.ceil(config.height / TEMP_CELL_SIZE);
    const tDepth = config.enable3D ? Math.ceil(d / TEMP_CELL_SIZE) : 1;

    this.state = {
      particles: [], bonds: [], time: 0,
      width: config.width, height: config.height, depth: d,
      nutrients: [], viruses: [], history: [],
      season: 'Spring', dayLight: 1.0,
      noveltyArchive: [], speciesHistory: [],
      pheromones: new Float32Array(pSize),
      pheromoneCols: this.pheromoneCols,
      pheromoneRows: this.pheromoneRows,
      pheromoneDepth: this.pheromoneDepth,
      morphogens: {
        data: new Float32Array(mCols * mRows * mDepth * NUM_MORPHOGENS),
        cols: mCols, rows: mRows, depth: mDepth
      },
      temperature: {
        data: new Float32Array(tCols * tRows * tDepth).fill(config.ambientTemperature),
        cols: tCols, rows: tRows, depth: tDepth
      },
      obstacles: [
        { x: 300, y: 300, z: 0, w: 20, h: 200, d: config.enable3D ? 200 : 1 },
        { x: 800, y: 400, z: 0, w: 200, h: 20, d: config.enable3D ? 20 : 1 }
      ],
      zones: [
        { x: 200, y: 200, z: 0, r: 100, type: 'toxic' },
        { x: 1000, y: 200, z: 0, r: 150, type: 'shadow' },
        { x: 600, y: 600, z: 0, r: 120, type: 'current', dx: 50, dy: -20, dz: 0 },
        { x: 400, y: 700, z: 0, r: 80, type: 'thermal_vent', temperature: 80, intensity: 1.0 },
        { x: 900, y: 500, z: 0, r: 100, type: 'nutrient_rich', intensity: 2.0 },
      ],
      sounds: [],
      ambientTemperature: config.ambientTemperature,
      oxygenLevel: 0.21,
      co2Level: 0.04,
      abiogenesisMode: config.enableAbiogenesis,
      prebiotic: { molecules: 0, protocells: 0 }
    };
    this.init();
  }

  init() {
    if (this.config.enableAbiogenesis) {
      // Start with simple molecules, no organisms
      for (let i = 0; i < 500; i++) this.spawnNutrient();
      // Spawn a few protocells (very simple organisms)
      for (let i = 0; i < 20; i++) this.spawnProtocell();
    } else {
      for (let i = 0; i < this.config.initialParticles; i++) this.spawnRandomParticle();
      for (let i = 0; i < 100; i++) this.spawnNutrient();
    }
  }

  // ═══ DNA System ═══════════════════════════════════════════════════════
  randomDNA(): DNA {
    const genes: Gene[] = [];
    for (let i = 0; i < DNA_LENGTH; i++) {
      genes.push({
        codon: Math.floor(Math.random() * 20) as Codon,
        value: Math.random(),
        methylated: Math.random() < 0.1,
        expression: Math.random() < 0.8 ? 1.0 : 0.0
      });
    }
    return { genes, mhcSignature: Math.random() * 1e6 | 0, telomereLength: 50 + Math.random() * 50 };
  }

  expressGenome(dna: DNA): Partial<Genome> {
    let photoScore = 0, chemScore = 0, digestScore = 0, decompScore = 0;
    let moveScore = 0, senseScore = 0, attackScore = 0, defendScore = 0;
    let promoter = 1.0;

    for (const gene of dna.genes) {
      if (gene.methylated || gene.expression < 0.5) continue;
      const v = gene.value * promoter;
      switch (gene.codon) {
        case Codon.PHOTOSYNTH: photoScore += v; break;
        case Codon.CHEMSYNTH: chemScore += v; break;
        case Codon.DIGEST: digestScore += v; break;
        case Codon.DECOMPOSE: decompScore += v; break;
        case Codon.MOVE: moveScore += v; break;
        case Codon.SENSE: senseScore += v; break;
        case Codon.ATTACK: attackScore += v; break;
        case Codon.DEFEND: defendScore += v; break;
        case Codon.PROMOTE: promoter = Math.min(3.0, promoter + 0.5); break;
        case Codon.SUPPRESS: promoter = Math.max(0.1, promoter - 0.5); break;
        default: promoter = 1.0;
      }
    }

    const scores = [photoScore + chemScore, digestScore, attackScore, decompScore];
    const maxIdx = scores.indexOf(Math.max(...scores));
    const trophic = maxIdx === 0 ? TrophicLevel.Autotroph :
      maxIdx === 1 ? TrophicLevel.Herbivore :
      maxIdx === 2 ? TrophicLevel.Predator : TrophicLevel.Decomposer;

    return {
      trophicLevel: trophic,
      baseMetabolism: 0.3 + moveScore * 0.1,
      speed: 0.5 + moveScore * 0.3,
      senseRange: 1.0 + senseScore * 0.5,
      size: 0.8 + defendScore * 0.2,
      heatTolerance: 40 + gene_count(dna, Codon.DEFEND) * 10,
      coldTolerance: -10 - gene_count(dna, Codon.DEFEND) * 5,
    };
  }

  // ═══ Immune System ════════════════════════════════════════════════════
  createImmuneSystem(): ImmuneSystem {
    return {
      antibodies: [],
      inflammationLevel: 0,
      immuneEnergy: 10,
      memoryStrength: 0.5
    };
  }

  // ═══ Membrane ═════════════════════════════════════════════════════════
  randomMembrane(): Membrane {
    return {
      permeability: Array.from({ length: NUM_CHEMICALS }, () => Math.random() * 0.5 + 0.1),
      integrity: 1.0,
      osmosisRate: 0.1 + Math.random() * 0.3,
      receptors: Array.from({ length: NUM_MORPHOGENS }, () => Math.random())
    };
  }

  // ═══ Neural Network ═══════════════════════════════════════════════════
  randomBrain(): Brain {
    const wIH = Array.from({ length: NEURAL_INPUTS }, () =>
      Array.from({ length: NEURAL_HIDDEN }, () => (Math.random() - 0.5) * 2));
    const wHO = Array.from({ length: NEURAL_HIDDEN }, () =>
      Array.from({ length: NEURAL_OUTPUTS }, () => (Math.random() - 0.5) * 2));
    return {
      wIH, wHO,
      biasH: Array.from({ length: NEURAL_HIDDEN }, () => (Math.random() - 0.5) * 0.5),
      biasO: Array.from({ length: NEURAL_OUTPUTS }, () => (Math.random() - 0.5) * 0.5),
      neuromodulator: 1.0,
      plasticity: 0.01
    };
  }

  calculateComplexity(genome: Genome): number {
    let comp = 0;
    for (const row of genome.brain.wIH) for (const w of row) comp += Math.abs(w);
    for (const row of genome.brain.wHO) for (const w of row) comp += Math.abs(w);
    // DNA complexity
    let uniqueCodons = new Set(genome.dna.genes.map(g => g.codon)).size;
    comp += uniqueCodons * 5;
    return Math.floor(comp);
  }

  // ═══ Genome Creation ══════════════════════════════════════════════════
  randomGenome(): Genome {
    const dna = this.randomDNA();
    const expressed = this.expressGenome(dna);
    const reactions: Reaction[] = [];
    const numReactions = Math.floor(Math.random() * 5);
    for (let i = 0; i < numReactions; i++) {
      reactions.push({
        sub: Math.floor(Math.random() * NUM_CHEMICALS),
        prod: Math.floor(Math.random() * NUM_CHEMICALS),
        rate: Math.random() * 0.1,
        energyDelta: (Math.random() - 0.5) * 2,
        inhibitor: Math.random() > 0.7 ? Math.floor(Math.random() * NUM_CHEMICALS) : undefined,
        catalyst: Math.random() > 0.8 ? Math.floor(Math.random() * NUM_CHEMICALS) : undefined,
        activationEnergy: 10 + Math.random() * 30,
        isEnzymatic: Math.random() > 0.6
      });
    }

    const trophic = expressed.trophicLevel ?? TrophicLevel.Autotroph;
    const color: [number, number, number] = trophic === TrophicLevel.Autotroph
      ? [30 + Math.random() * 50, 150 + Math.random() * 105, 30 + Math.random() * 50]
      : trophic === TrophicLevel.Herbivore
      ? [100 + Math.random() * 100, 100 + Math.random() * 100, 30 + Math.random() * 50]
      : trophic === TrophicLevel.Predator
      ? [180 + Math.random() * 75, 30 + Math.random() * 50, 30 + Math.random() * 50]
      : [100 + Math.random() * 80, 80 + Math.random() * 60, 150 + Math.random() * 105];

    return {
      dna,
      reactions,
      rules: [],
      brain: this.randomBrain(),
      color: color.map(c => Math.floor(clamp(c, 0, 255))) as [number, number, number],
      trophicLevel: trophic,
      membrane: this.randomMembrane(),
      baseMetabolism: expressed.baseMetabolism ?? 0.5,
      heatTolerance: expressed.heatTolerance ?? 50,
      coldTolerance: expressed.coldTolerance ?? -10,
      size: expressed.size ?? 1.0,
      speed: expressed.speed ?? 1.0,
      senseRange: expressed.senseRange ?? 1.0,
      mhcType: dna.mhcSignature
    };
  }

  // ═══ Protocell (Abiogenesis) ══════════════════════════════════════════
  spawnProtocell() {
    const genome = this.randomGenome();
    // Protocells are simple: few genes active, small, slow
    genome.dna.genes.forEach((g, i) => { if (i > 10) g.methylated = true; });
    genome.trophicLevel = TrophicLevel.Autotroph;
    genome.size = 0.5;
    genome.speed = 0.3;

    const speciesId = this.nextSpeciesId++;
    const traits = this.getTraits(genome.brain);
    this.state.speciesHistory.push({
      id: speciesId, parentId: 0, color: [...genome.color] as [number, number, number],
      timestamp: this.state.time, extinct: false, traitX: traits.traitX, traitY: traits.traitY,
      trophicLevel: genome.trophicLevel, avgSize: genome.size, population: 1
    });

    const id = this.nextId++;
    this.state.particles.push(this.createParticle(id, genome, speciesId, {
      x: Math.random() * this.config.width,
      y: Math.random() * this.config.height,
      z: this.config.enable3D ? Math.random() * this.config.depth : 0,
      energy: 40 + Math.random() * 20
    }));
    this.state.prebiotic.protocells++;
  }

  createParticle(id: number, genome: Genome, speciesId: number, opts: {
    x: number; y: number; z: number; energy?: number; generation?: number; parentId?: number;
  }): Particle {
    return {
      id,
      x: opts.x, y: opts.y, z: opts.z,
      vx: 0, vy: 0, vz: 0,
      angle: Math.random() * Math.PI * 2,
      pitch: this.config.enable3D ? (Math.random() - 0.5) * Math.PI : 0,
      radius: 4 * genome.size,
      mass: 1.0 * genome.size,
      energy: opts.energy ?? (80 + Math.random() * 40),
      age: 0,
      chem: new Array(NUM_CHEMICALS).fill(0),
      mem: 0,
      genome,
      dead: false,
      generation: opts.generation ?? 1,
      parentId: opts.parentId ?? 0,
      organismId: id,
      speciesId,
      complexity: this.calculateComplexity(genome),
      trophicLevel: genome.trophicLevel,
      digestEfficiency: 0.5 + Math.random() * 0.3,
      biofilm: false,
      temperature: this.config.ambientTemperature,
      immune: this.createImmuneSystem(),
      infected: false,
      infectionTimer: 0,
      morphogens: new Array(NUM_MORPHOGENS).fill(0),
      differentiation: 0,
      stressLevel: 0,
      divisionsLeft: genome.dna.telomereLength,
      cellType: 'stem',
      role: undefined
    };
  }

  getTraits(brain: Brain) {
    let tx = 0, ty = 0;
    for (let i = 0; i < Math.min(6, NEURAL_HIDDEN); i++) {
      if (brain.wHO[i]) {
        tx += (brain.wHO[i][2] || 0) + (brain.wHO[i][3] || 0);
        ty += (brain.wHO[i][4] || 0) + (brain.wHO[i][0] || 0);
      }
    }
    return { traitX: tx, traitY: ty };
  }

  spawnNutrient(x?: number, y?: number, amount?: number) {
    this.state.nutrients.push({
      x: x ?? Math.random() * this.config.width,
      y: y ?? Math.random() * this.config.height,
      z: this.config.enable3D ? Math.random() * this.config.depth : 0,
      amount: amount ?? (10 + Math.random() * 20),
      chemicalContent: Array.from({ length: NUM_CHEMICALS }, () => Math.random() > 0.7 ? Math.random() * 5 : 0),
      temperature: this.config.ambientTemperature,
      trophicValue: TrophicLevel.Molecule
    });
  }

  spawnRandomParticle() {
    const genome = this.randomGenome();
    const speciesId = this.nextSpeciesId++;
    const traits = this.getTraits(genome.brain);
    this.state.speciesHistory.push({
      id: speciesId, parentId: 0, color: [...genome.color] as [number, number, number],
      timestamp: this.state.time, extinct: false, traitX: traits.traitX, traitY: traits.traitY,
      trophicLevel: genome.trophicLevel, avgSize: genome.size, population: 1
    });
    const id = this.nextId++;
    this.state.particles.push(this.createParticle(id, genome, speciesId, {
      x: Math.random() * this.config.width,
      y: Math.random() * this.config.height,
      z: this.config.enable3D ? Math.random() * this.config.depth : 0
    }));
  }

  // ═══ Genome Operations ════════════════════════════════════════════════
  cloneGenome(g: Genome): Genome {
    const cloneDNA: DNA = {
      genes: g.dna.genes.map(gene => ({ ...gene })),
      mhcSignature: g.dna.mhcSignature,
      telomereLength: g.dna.telomereLength - 1 // Telomere shortening!
    };
    return {
      dna: cloneDNA,
      reactions: g.reactions.map(r => ({ ...r })),
      rules: [],
      brain: {
        wIH: g.brain.wIH.map(row => row.slice()),
        wHO: g.brain.wHO.map(row => row.slice()),
        biasH: g.brain.biasH.slice(),
        biasO: g.brain.biasO.slice(),
        neuromodulator: g.brain.neuromodulator,
        plasticity: g.brain.plasticity
      },
      color: [g.color[0], g.color[1], g.color[2]],
      trophicLevel: g.trophicLevel,
      membrane: {
        permeability: g.membrane.permeability.slice(),
        integrity: 1.0,
        osmosisRate: g.membrane.osmosisRate,
        receptors: g.membrane.receptors.slice()
      },
      baseMetabolism: g.baseMetabolism,
      heatTolerance: g.heatTolerance,
      coldTolerance: g.coldTolerance,
      size: g.size,
      speed: g.speed,
      senseRange: g.senseRange,
      mhcType: g.dna.mhcSignature
    };
  }

  crossover(g1: Genome, g2: Genome): Genome {
    const child = this.cloneGenome(g1);
    // DNA crossover
    const crossPoint = Math.floor(Math.random() * DNA_LENGTH);
    for (let i = crossPoint; i < Math.min(child.dna.genes.length, g2.dna.genes.length); i++) {
      child.dna.genes[i] = { ...g2.dna.genes[i] };
    }
    // Brain crossover
    for (let i = 0; i < NEURAL_INPUTS; i++)
      for (let j = 0; j < NEURAL_HIDDEN; j++)
        if (Math.random() > 0.5) child.brain.wIH[i][j] = g2.brain.wIH[i]?.[j] ?? child.brain.wIH[i][j];
    for (let i = 0; i < NEURAL_HIDDEN; i++)
      for (let j = 0; j < NEURAL_OUTPUTS; j++)
        if (Math.random() > 0.5) child.brain.wHO[i][j] = g2.brain.wHO[i]?.[j] ?? child.brain.wHO[i][j];
    // Blend colors
    child.color = [
      Math.floor((g1.color[0] + g2.color[0]) / 2),
      Math.floor((g1.color[1] + g2.color[1]) / 2),
      Math.floor((g1.color[2] + g2.color[2]) / 2)
    ];
    // Re-express DNA for phenotype
    const expressed = this.expressGenome(child.dna);
    if (expressed.trophicLevel !== undefined) child.trophicLevel = expressed.trophicLevel;
    return child;
  }

  mutateGenome(genome: Genome): Genome {
    const g = this.cloneGenome(genome);
    const mr = this.config.mutationRate;

    // DNA mutations
    for (const gene of g.dna.genes) {
      if (Math.random() < mr * 0.5) gene.codon = Math.floor(Math.random() * 20) as Codon;
      if (Math.random() < mr) gene.value = clamp(gene.value + (Math.random() - 0.5) * 0.3, 0, 1);
      if (Math.random() < mr * 0.2) gene.methylated = !gene.methylated; // Epigenetic flip
    }
    // Insertions / deletions
    if (Math.random() < mr * 0.1 && g.dna.genes.length < DNA_LENGTH * 2) {
      const idx = Math.floor(Math.random() * g.dna.genes.length);
      g.dna.genes.splice(idx, 0, { codon: Math.floor(Math.random() * 20) as Codon, value: Math.random(), methylated: false, expression: 1.0 });
    }
    if (Math.random() < mr * 0.1 && g.dna.genes.length > 10) {
      g.dna.genes.splice(Math.floor(Math.random() * g.dna.genes.length), 1);
    }

    // Brain mutations
    for (let i = 0; i < NEURAL_INPUTS; i++)
      for (let j = 0; j < NEURAL_HIDDEN; j++)
        if (Math.random() < mr) g.brain.wIH[i][j] += (Math.random() - 0.5);
    for (let i = 0; i < NEURAL_HIDDEN; i++)
      for (let j = 0; j < NEURAL_OUTPUTS; j++)
        if (Math.random() < mr) g.brain.wHO[i][j] += (Math.random() - 0.5);
    for (let i = 0; i < NEURAL_HIDDEN; i++)
      if (Math.random() < mr) g.brain.biasH[i] += (Math.random() - 0.5) * 0.3;
    for (let i = 0; i < NEURAL_OUTPUTS; i++)
      if (Math.random() < mr) g.brain.biasO[i] += (Math.random() - 0.5) * 0.3;

    // Color mutations
    g.color[0] = clamp(g.color[0] + (Math.random() - 0.5) * 50, 0, 255);
    g.color[1] = clamp(g.color[1] + (Math.random() - 0.5) * 50, 0, 255);
    g.color[2] = clamp(g.color[2] + (Math.random() - 0.5) * 50, 0, 255);

    // Phenotype mutations
    if (Math.random() < mr) g.size = clamp(g.size + (Math.random() - 0.5) * 0.2, 0.3, 3.0);
    if (Math.random() < mr) g.speed = clamp(g.speed + (Math.random() - 0.5) * 0.2, 0.1, 3.0);
    if (Math.random() < mr) g.senseRange = clamp(g.senseRange + (Math.random() - 0.5) * 0.3, 0.3, 5.0);

    // Membrane mutations
    for (let i = 0; i < NUM_CHEMICALS; i++)
      if (Math.random() < mr) g.membrane.permeability[i] = clamp(g.membrane.permeability[i] + (Math.random() - 0.5) * 0.1, 0, 1);

    // Re-express DNA
    const expressed = this.expressGenome(g.dna);
    if (expressed.trophicLevel !== undefined) g.trophicLevel = expressed.trophicLevel;

    return g;
  }

  // ═══ Reproduction ═════════════════════════════════════════════════════
  reproduce(p: Particle, mate: Particle | null) {
    if (this.config.maxParticles > 0 && this.state.particles.length >= this.config.maxParticles) return;
    if (p.divisionsLeft <= 0) return; // Hayflick limit!

    p.energy -= 40;
    p.divisionsLeft--;
    if (mate) { mate.energy -= 40; mate.divisionsLeft--; }

    const childEnergy = mate ? 60 : 30;
    const baseGenome = mate ? this.crossover(p.genome, mate.genome) : this.cloneGenome(p.genome);
    const finalGenome = this.mutateGenome(baseGenome);

    let isMutated = false;
    if (finalGenome.brain && p.genome.brain) {
      isMutated = Math.abs(finalGenome.brain.wHO[0]?.[0] - p.genome.brain.wHO[0]?.[0]) > 0.1;
    }

    let speciesId = p.speciesId;
    if (isMutated) {
      speciesId = this.nextSpeciesId++;
      const traits = this.getTraits(finalGenome.brain);
      this.state.speciesHistory.push({
        id: speciesId, parentId: p.speciesId, color: [...finalGenome.color] as [number, number, number],
        timestamp: this.state.time, extinct: false, traitX: traits.traitX, traitY: traits.traitY,
        trophicLevel: finalGenome.trophicLevel, avgSize: finalGenome.size, population: 1
      });
    }

    const childId = this.nextId++;
    this.state.particles.push(this.createParticle(childId, finalGenome, speciesId, {
      x: p.x + (Math.random() - 0.5) * 10,
      y: p.y + (Math.random() - 0.5) * 10,
      z: p.z + (this.config.enable3D ? (Math.random() - 0.5) * 10 : 0),
      energy: childEnergy,
      generation: Math.max(p.generation, mate ? mate.generation : 0) + 1,
      parentId: p.id
    }));
  }

  // ═══ Immune Response ══════════════════════════════════════════════════
  processImmune(p: Particle, dt: number) {
    if (!this.config.enableImmuneSystem) return;
    const im = p.immune;
    // Decay inflammation
    im.inflammationLevel = Math.max(0, im.inflammationLevel - dt * 0.1);
    // Fight infection
    if (p.infected) {
      p.infectionTimer -= dt;
      p.energy -= dt * 2; // Infection costs energy
      im.inflammationLevel = Math.min(1, im.inflammationLevel + dt * 0.3);
      // Check if antibodies can clear
      for (const ab of im.antibodies) {
        if (ab.strength > 0.5) {
          p.infectionTimer -= dt * ab.strength * 2;
        }
      }
      if (p.infectionTimer <= 0) {
        p.infected = false;
        // Strengthen memory
        im.memoryStrength = Math.min(1, im.memoryStrength + 0.1);
      }
    }
    // Age antibodies
    for (let i = im.antibodies.length - 1; i >= 0; i--) {
      im.antibodies[i].age += dt;
      if (im.antibodies[i].age > 100 && im.antibodies[i].strength < 0.3) {
        im.antibodies.splice(i, 1);
      }
    }
  }

  // ═══ Epigenetics ══════════════════════════════════════════════════════
  processEpigenetics(p: Particle, dt: number) {
    if (!this.config.enableEpigenetics) return;
    // Stress-induced epigenetic changes
    if (p.stressLevel > 0.7) {
      for (const gene of p.genome.dna.genes) {
        if (Math.random() < dt * 0.01 * p.stressLevel) {
          gene.methylated = !gene.methylated;
        }
      }
    }
    // Stress from low energy, temperature extremes, infection
    let stress = 0;
    if (p.energy < 30) stress += 0.3;
    if (p.infected) stress += 0.4;
    if (Math.abs(p.temperature - this.config.ambientTemperature) > 20) stress += 0.3;
    p.stressLevel = p.stressLevel * 0.99 + stress * 0.01;
  }

  // ═══ Morphogen Diffusion (Turing Patterns) ════════════════════════════
  updateMorphogens(dt: number) {
    if (!this.config.enableMorphogens) return;
    const m = this.state.morphogens;
    const { cols, rows, depth } = m;
    const decay = Math.pow(0.95, dt * 60);

    for (let z = 0; z < depth; z++) {
      for (let y = 0; y < rows; y++) {
        for (let x = 0; x < cols; x++) {
          for (let c = 0; c < NUM_MORPHOGENS; c++) {
            const idx = ((z * rows + y) * cols + x) * NUM_MORPHOGENS + c;
            let sum = m.data[idx]; let count = 1;
            // 6-neighbor diffusion (3D)
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

  // ═══ Temperature Field ════════════════════════════════════════════════
  updateTemperature(dt: number) {
    if (!this.config.enableTemperature) return;
    const t = this.state.temperature;
    const { cols, rows } = t;
    const ambient = this.state.ambientTemperature;
    const decay = 0.01 * dt;

    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        const idx = y * cols + x;
        // Diffuse toward ambient
        t.data[idx] += (ambient - t.data[idx]) * decay;
        // Neighbor averaging (heat conduction)
        let sum = t.data[idx]; let count = 1;
        if (x > 0) { sum += t.data[idx - 1]; count++; }
        if (x < cols-1) { sum += t.data[idx + 1]; count++; }
        if (y > 0) { sum += t.data[idx - cols]; count++; }
        if (y < rows-1) { sum += t.data[idx + cols]; count++; }
        t.data[idx] = sum / count;
      }
    }

    // Thermal vents heat up their area
    for (const z of this.state.zones) {
      if (z.type === 'thermal_vent' && z.temperature) {
        const cx = Math.floor(z.x / TEMP_CELL_SIZE);
        const cy = Math.floor(z.y / TEMP_CELL_SIZE);
        const r = Math.ceil(z.r / TEMP_CELL_SIZE);
        for (let dy = -r; dy <= r; dy++) {
          for (let dx = -r; dx <= r; dx++) {
            const nx = cx + dx, ny = cy + dy;
            if (nx >= 0 && nx < cols && ny >= 0 && ny < rows) {
              const dist = Math.sqrt(dx*dx + dy*dy);
              if (dist <= r) {
                const idx = ny * cols + nx;
                const influence = (1 - dist / r) * (z.intensity ?? 1.0);
                t.data[idx] += (z.temperature! - t.data[idx]) * influence * dt;
              }
            }
          }
        }
      }
    }
  }

  getTemperatureAt(x: number, y: number): number {
    if (!this.config.enableTemperature) return this.config.ambientTemperature;
    const t = this.state.temperature;
    const cx = clamp(Math.floor(x / TEMP_CELL_SIZE), 0, t.cols - 1);
    const cy = clamp(Math.floor(y / TEMP_CELL_SIZE), 0, t.rows - 1);
    return t.data[cy * t.cols + cx];
  }

  // ═══ Pheromones ═══════════════════════════════════════════════════════
  updatePheromones(dt: number) {
    const read = this.state.pheromones;
    const write = this.pheromonesBuffer2;
    const cols = this.pheromoneCols; const rows = this.pheromoneRows;
    const decay = Math.pow(0.9, dt * 60);
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        const idx = y * cols + x;
        let sum = read[idx]; let count = 1;
        if (x > 0) { sum += read[idx - 1]; count++; }
        if (x < cols - 1) { sum += read[idx + 1]; count++; }
        if (y > 0) { sum += read[idx - cols]; count++; }
        if (y < rows - 1) { sum += read[idx + cols]; count++; }
        write[idx] = (sum / count) * decay;
      }
    }
    this.state.pheromones = write;
    this.pheromonesBuffer2 = read;
  }

  getPheromoneAt(x: number, y: number): number {
    const cx = Math.floor(x / PHEROMONE_CELL_SIZE);
    const cy = Math.floor(y / PHEROMONE_CELL_SIZE);
    if (cx >= 0 && cx < this.pheromoneCols && cy >= 0 && cy < this.pheromoneRows)
      return this.state.pheromones[cy * this.pheromoneCols + cx];
    return 0;
  }

  addPheromoneAt(x: number, y: number, amount: number) {
    const cx = Math.floor(x / PHEROMONE_CELL_SIZE);
    const cy = Math.floor(y / PHEROMONE_CELL_SIZE);
    if (cx >= 0 && cx < this.pheromoneCols && cy >= 0 && cy < this.pheromoneRows)
      this.state.pheromones[cy * this.pheromoneCols + cx] += amount;
  }

  addMorphogenAt(x: number, y: number, channel: number, amount: number) {
    if (!this.config.enableMorphogens) return;
    const m = this.state.morphogens;
    const cx = clamp(Math.floor(x / MORPHOGEN_CELL_SIZE), 0, m.cols - 1);
    const cy = clamp(Math.floor(y / MORPHOGEN_CELL_SIZE), 0, m.rows - 1);
    m.data[(cy * m.cols + cx) * NUM_MORPHOGENS + channel] += amount;
  }

  getMorphogenAt(x: number, y: number, channel: number): number {
    if (!this.config.enableMorphogens) return 0;
    const m = this.state.morphogens;
    const cx = clamp(Math.floor(x / MORPHOGEN_CELL_SIZE), 0, m.cols - 1);
    const cy = clamp(Math.floor(y / MORPHOGEN_CELL_SIZE), 0, m.rows - 1);
    return m.data[(cy * m.cols + cx) * NUM_MORPHOGENS + channel];
  }

  // ═══ Organisms (Union-Find) ═══════════════════════════════════════════
  updateOrganisms() {
    const parent = new Map<number, number>();
    const find = (i: number): number => {
      if (!parent.has(i)) parent.set(i, i);
      if (parent.get(i) === i) return i;
      const root = find(parent.get(i)!);
      parent.set(i, root); return root;
    };
    const union = (i: number, j: number) => {
      const ri = find(i), rj = find(j);
      if (ri !== rj) parent.set(ri, rj);
    };
    for (const b of this.state.bonds) union(b.p1, b.p2);
    for (const p of this.state.particles) p.organismId = find(p.id);
  }

  // ═══ MAIN UPDATE LOOP ════════════════════════════════════════════════
  update(dt: number) {
    this.state.time += dt;

    // Seasons & Daylight
    const yearLength = 120;
    const yearPhase = (this.state.time % yearLength) / yearLength;
    if (yearPhase < 0.25) this.state.season = 'Spring';
    else if (yearPhase < 0.5) this.state.season = 'Summer';
    else if (yearPhase < 0.75) this.state.season = 'Autumn';
    else this.state.season = 'Winter';

    let seasonTemp = 1.0;
    if (this.state.season === 'Winter') seasonTemp = 0.6;
    if (this.state.season === 'Summer') seasonTemp = 1.4;
    this.state.dayLight = (Math.sin((this.state.time / 60) * Math.PI * 2) * 0.5 + 0.5) * seasonTemp;

    // Ambient temperature varies with season
    if (this.config.enableTemperature) {
      this.state.ambientTemperature = this.config.ambientTemperature + (seasonTemp - 1.0) * 20;
    }

    // CO2 / O2 atmosphere
    let totalPhotosynthesis = 0;
    for (let i = 0; i < this.state.particles.length; i++) {
      if (this.state.particles[i].trophicLevel === TrophicLevel.Autotroph) totalPhotosynthesis++;
    }
    const totalRespiration = this.state.particles.length;
    this.state.oxygenLevel = clamp(this.state.oxygenLevel + (totalPhotosynthesis * 0.0001 - totalRespiration * 0.00005) * dt, 0.05, 0.4);
    this.state.co2Level = clamp(this.state.co2Level + (totalRespiration * 0.00005 - totalPhotosynthesis * 0.0001) * dt, 0.01, 0.2);

    this._frameCount++;
    // Throttle expensive field updates: every 2nd frame for pheromones,
    // every 3rd for morphogens/temperature (minimal visual/behavioral impact)
    if (this._frameCount % 3 === 0) this.updateOrganisms();
    if (this._frameCount % 2 === 0) this.updatePheromones(dt * 2);
    if (this._frameCount % 3 === 0) this.updateMorphogens(dt * 3);
    if (this._frameCount % 3 === 0) this.updateTemperature(dt * 3);

    // Sounds
    for (let i = this.state.sounds.length - 1; i >= 0; i--) {
      const s = this.state.sounds[i];
      s.radius += dt * 200;
      s.volume -= dt * 2;
      if (s.volume <= 0) this.state.sounds.splice(i, 1);
    }

    // Nutrient spawning (nutrient-rich zones spawn more)
    if (Math.random() < this.config.nutrientSpawnRate * dt * seasonTemp) this.spawnNutrient();
    for (const z of this.state.zones) {
      if (z.type === 'nutrient_rich' && Math.random() < (z.intensity ?? 1) * dt * 2) {
        this.spawnNutrient(z.x + (Math.random() - 0.5) * z.r, z.y + (Math.random() - 0.5) * z.r);
      }
    }

    // Abiogenesis: spontaneous protocell generation
    if (this.state.abiogenesisMode && this.state.particles.length < 50 && Math.random() < dt * 0.5) {
      this.spawnProtocell();
    }

    // Build spatial grids
    const gridSize = 50;
    const cols = this.gridCols, rows = this.gridRows;
    for (let i = 0; i < this.grid.length; i++) { this.grid[i].length = 0; this.nutrientGrid[i].length = 0; }

    this._particleMap.clear();
    for (const p of this.state.particles) {
      if (p.dead) continue;
      this._particleMap.set(p.id, p);
      const gx = clamp(Math.floor(p.x / gridSize), 0, cols - 1);
      const gy = clamp(Math.floor(p.y / gridSize), 0, rows - 1);
      this.grid[gy * cols + gx].push(p);
    }
    for (const n of this.state.nutrients) {
      if (n.amount <= 0) continue;
      const gx = clamp(Math.floor(n.x / gridSize), 0, cols - 1);
      const gy = clamp(Math.floor(n.y / gridSize), 0, rows - 1);
      this.nutrientGrid[gy * cols + gx].push(n);
    }

    this.bondSet.clear();
    for (const b of this.state.bonds) this.bondSet.add(bkey(b.p1, b.p2));

    // ─── Viruses ──────────────────────────────────────────────
    if (Math.random() < this.config.virusSpawnRate * dt) {
      this.state.viruses.push({
        x: Math.random() * this.config.width,
        y: Math.random() * this.config.height,
        z: this.config.enable3D ? Math.random() * this.config.depth : 0,
        radius: 3, genomePayload: { color: [255, 0, 0] },
        life: 10, mutationRate: 0.3 + Math.random() * 0.5,
        mhcTarget: Math.random() * 1e6 | 0,
        strain: this.nextVirusStrain++
      });
    }

    for (let i = this.state.viruses.length - 1; i >= 0; i--) {
      const v = this.state.viruses[i];
      v.life -= dt;
      v.x += (Math.random() - 0.5) * 50 * dt;
      v.y += (Math.random() - 0.5) * 50 * dt;
      v.x = clamp(v.x, 0, this.config.width);
      v.y = clamp(v.y, 0, this.config.height);

      if (v.life <= 0) { this.state.viruses.splice(i, 1); continue; }

      let hit = false;
      const vgx = clamp(Math.floor(v.x / gridSize), 0, cols - 1);
      const vgy = clamp(Math.floor(v.y / gridSize), 0, rows - 1);
      outerVirus:
      for (let dx = -1; dx <= 1; dx++) {
        for (let dy = -1; dy <= 1; dy++) {
          const nx = vgx + dx, ny = vgy + dy;
          if (nx >= 0 && nx < cols && ny >= 0 && ny < rows) {
            const cell = this.grid[ny * cols + nx];
            for (const p of cell) {
              if (!p.dead && (p.x - v.x)**2 + (p.y - v.y)**2 < (p.radius + v.radius)**2) {
                // Immune check: can antibodies block?
                let blocked = false;
                if (this.config.enableImmuneSystem) {
                  for (const ab of p.immune.antibodies) {
                    if (Math.abs(ab.targetSignature - v.strain) < 100 && ab.strength > 0.5) {
                      blocked = true;
                      ab.strength = Math.min(1, ab.strength + 0.1); // Boost memory
                      break;
                    }
                  }
                }
                if (!blocked) {
                  p.genome = this.mutateGenome(p.genome);
                  p.energy -= 20;
                  p.infected = true;
                  p.infectionTimer = 5 + Math.random() * 5;
                  p.immune.inflammationLevel = Math.min(1, p.immune.inflammationLevel + 0.5);
                  // Create antibody memory
                  if (this.config.enableImmuneSystem && p.immune.antibodies.length < NUM_ANTIBODIES) {
                    p.immune.antibodies.push({
                      targetSignature: v.strain,
                      strength: 0.3,
                      age: 0
                    });
                  }
                }
                hit = true;
                break outerVirus;
              }
            }
          }
        }
      }
      if (hit) this.state.viruses.splice(i, 1);
    }

    // Novelty search (throttled: ~1% of frames instead of 5%)
    if (this._frameCount % 20 === 0 && this.state.particles.length > 0) {
      let totalE = 0, totalC = 0;
      for (let i = 0; i < this.state.particles.length; i++) {
        totalE += this.state.particles[i].energy;
        totalC += this.state.particles[i].complexity;
      }
      const avgEnergy = totalE / this.state.particles.length;
      const avgComp = totalC / this.state.particles.length;
      const descriptor = { pop: this.state.particles.length, avgEnergy, avgComp };
      let minD = Infinity;
      for (const arch of this.state.noveltyArchive) {
        const d = Math.abs(arch.pop - descriptor.pop) + Math.abs(arch.avgEnergy - descriptor.avgEnergy) + Math.abs(arch.avgComp - descriptor.avgComp);
        if (d < minD) minD = d;
      }
      if (minD > 20 || this.state.noveltyArchive.length === 0) {
        this.state.noveltyArchive.push(descriptor);
        if (this.state.noveltyArchive.length > 500) this.state.noveltyArchive.shift();
        for (const p of this.state.particles) if (p.complexity >= avgComp) p.energy += 20;
      }
    }

    // ─── PARTICLE UPDATE LOOP ─────────────────────────────────
    for (let i = 0; i < this.state.particles.length; i++) {
      const p = this.state.particles[i];
      if (p.dead) continue;

      p.age += dt;
      p.energy -= dt * p.genome.baseMetabolism;

      // Temperature effects
      if (this.config.enableTemperature) {
        const localTemp = this.getTemperatureAt(p.x, p.y);
        p.temperature += (localTemp - p.temperature) * 0.1 * dt;
        if (p.temperature > p.genome.heatTolerance) p.energy -= (p.temperature - p.genome.heatTolerance) * dt * 0.5;
        if (p.temperature < p.genome.coldTolerance) p.energy -= (p.genome.coldTolerance - p.temperature) * dt * 0.5;
      }

      // Zone effects
      let localLight = this.state.dayLight;
      for (const z of this.state.zones) {
        const dSq = (p.x - z.x)**2 + (p.y - z.y)**2;
        if (dSq < z.r * z.r) {
          if (z.type === 'toxic') p.energy -= 10 * dt;
          else if (z.type === 'shadow') localLight = 0;
          else if (z.type === 'current') { p.x += (z.dx ?? 0) * dt; p.y += (z.dy ?? 0) * dt; }
          else if (z.type === 'radiation') {
            // Radiation causes mutations and DNA damage
            if (Math.random() < dt * (z.intensity ?? 0.5)) {
              const gene = p.genome.dna.genes[Math.floor(Math.random() * p.genome.dna.genes.length)];
              gene.codon = Math.floor(Math.random() * 20) as Codon;
              p.stressLevel += 0.1;
            }
          }
        }
      }

      // Trophic-based photosynthesis
      if (p.trophicLevel === TrophicLevel.Autotroph) {
        const greenness = p.genome.color[1] / 255;
        p.energy += dt * localLight * greenness * 2 * this.state.oxygenLevel * 5;
      }

      // Chemistry with temperature-dependent reactions
      for (const rx of p.genome.reactions) {
        if (rx.inhibitor !== undefined && p.chem[rx.inhibitor] > 0.5) continue;
        if (rx.isEnzymatic && rx.catalyst !== undefined && p.chem[rx.catalyst] < 0.1) continue;
        // Temperature-dependent rate (Arrhenius-like)
        const tempFactor = this.config.enableTemperature
          ? Math.exp(-rx.activationEnergy / (p.temperature + 273)) * 10
          : 1.0;
        if (p.chem[rx.sub] > 0 && Math.random() < rx.rate * dt * tempFactor) {
          const amount = Math.min(p.chem[rx.sub], 1.0);
          p.chem[rx.sub] -= amount;
          p.chem[rx.prod] += amount;
          p.energy += rx.energyDelta * amount;
          // Catalysts are not consumed
          if (rx.catalyst !== undefined) p.chem[rx.catalyst] = Math.min(10, p.chem[rx.catalyst] + 0.01);
        }
      }

      // Immune & Epigenetics
      this.processImmune(p, dt);
      this.processEpigenetics(p, dt);

      // Membrane integrity decay when stressed
      if (p.stressLevel > 0.5) {
        p.genome.membrane.integrity -= dt * 0.01 * p.stressLevel;
        p.genome.membrane.integrity = Math.max(0.1, p.genome.membrane.integrity);
      }

      // ─── Neighborhood scan ──────────────────────────────
      let fCount = 0, mCount = 0, dCount = 0;
      let closestNutrient: Nutrient | null = null;
      let closestNutrientDist = Infinity;
      let closestOther: Particle | null = null;
      let closestOtherDist = Infinity;
      let closestPrey: Particle | null = null;
      let closestPreyDist = Infinity;

      const gx = clamp(Math.floor(p.x / gridSize), 0, cols - 1);
      const gy = clamp(Math.floor(p.y / gridSize), 0, rows - 1);
      const senseR = 100 * p.genome.senseRange;
      const senseRSq = senseR * senseR;

      for (let ddx = -1; ddx <= 1; ddx++) {
        for (let ddy = -1; ddy <= 1; ddy++) {
          const nx = gx + ddx, ny = gy + ddy;
          if (nx < 0 || nx >= cols || ny < 0 || ny >= rows) continue;
          const idx = ny * cols + nx;

          // Nutrients
          for (const n of this.nutrientGrid[idx]) {
            const dX = n.x - p.x, dY = n.y - p.y;
            const distSq = dX * dX + dY * dY;
            if (distSq < senseRSq) {
              let diff = Math.abs(Math.atan2(dY, dX) - p.angle);
              if (diff > Math.PI) diff = 2 * Math.PI - diff;
              if (diff < 0.5) fCount++;
            }
            if (distSq < closestNutrientDist) { closestNutrientDist = distSq; closestNutrient = n; }
          }

          // Other particles
          for (const other of this.grid[idx]) {
            if (other.id === p.id || other.dead) continue;
            const dX = other.x - p.x, dY = other.y - p.y;
            const distSq = dX * dX + dY * dY;

            if (distSq < senseRSq) {
              let diff = Math.abs(Math.atan2(dY, dX) - p.angle);
              if (diff > Math.PI) diff = 2 * Math.PI - diff;
              if (diff < 0.5) {
                if (other.speciesId === p.speciesId) mCount++;
                else dCount++;
              }
            }

            if (distSq < closestOtherDist) { closestOtherDist = distSq; closestOther = other; }

            // Track closest prey (lower trophic level)
            if (other.trophicLevel < p.trophicLevel && distSq < closestPreyDist) {
              closestPreyDist = distSq; closestPrey = other;
            }

            // Repulsion
            const minDist = p.radius + other.radius;
            if (distSq < minDist * minDist && distSq > 0) {
              const dist = Math.sqrt(distSq);
              const force = (minDist - dist) * this.config.repulsion;
              p.vx += (dX / dist) * force * dt;
              p.vy += (dY / dist) * force * dt;
            }
          }
        }
      }

      // Sound detection
      let soundLevel = 0;
      for (const s of this.state.sounds) {
        const dSq = (p.x - s.x)**2 + (p.y - s.y)**2;
        if (dSq < s.radius**2 && dSq > (s.radius - 20)**2) soundLevel += s.volume;
      }

      // Morphogen sensing
      let morphogenLevel = 0;
      for (let c = 0; c < NUM_MORPHOGENS; c++) {
        morphogenLevel += this.getMorphogenAt(p.x, p.y, c) * (p.genome.membrane.receptors[c] || 0);
      }

      // ─── Neural Network Forward Pass ────────────────────
      const inputs = this._nnInputs;
      inputs[0] = 1.0; // Bias
      inputs[1] = p.energy / 100;
      inputs[2] = Math.min(p.age / 1000, 1.0);
      inputs[3] = fCount > 0 ? 1 : 0;
      inputs[4] = mCount > 0 ? 1 : 0;
      inputs[5] = dCount > 0 ? 1 : 0;
      inputs[6] = this.getPheromoneAt(p.x, p.y) / 100;
      inputs[7] = p.mem;
      inputs[8] = soundLevel;
      // New inputs
      inputs[9] = p.trophicLevel / 5; // Own trophic level
      inputs[10] = this.config.enableTemperature ? p.temperature / 100 : 0.5;
      inputs[11] = p.genome.membrane.integrity;
      inputs[12] = p.infected ? 1 : 0;
      inputs[13] = p.immune.inflammationLevel;
      inputs[14] = morphogenLevel / 10;
      inputs[15] = p.stressLevel;
      inputs[16] = p.divisionsLeft / 100;
      inputs[17] = closestPrey ? 1 : 0;

      const hidden = this._nnHidden;
      const brain = p.genome.brain;
      for (let j = 0; j < NEURAL_HIDDEN; j++) {
        hidden[j] = brain.biasH[j] || 0;
        for (let k = 0; k < NEURAL_INPUTS; k++) hidden[j] += inputs[k] * brain.wIH[k][j];
        hidden[j] = fastTanh(hidden[j] * brain.neuromodulator);
      }

      const outputs = this._nnOutputs;
      for (let j = 0; j < NEURAL_OUTPUTS; j++) {
        outputs[j] = brain.biasO[j] || 0;
        for (let k = 0; k < NEURAL_HIDDEN; k++) outputs[j] += hidden[k] * brain.wHO[k][j];
      }

      // ─── Actions ────────────────────────────────────────
      const moveFwd = sigmoid(outputs[0]);
      const turn = Math.tanh(outputs[1]);
      const speedMult = p.genome.speed;

      p.vx += Math.cos(p.angle) * moveFwd * 2 * speedMult;
      p.vy += Math.sin(p.angle) * moveFwd * 2 * speedMult;
      if (this.config.enable3D) p.vz += Math.sin(p.pitch) * moveFwd * speedMult;
      p.angle += turn * dt * 5;
      p.energy -= moveFwd * dt * 0.1 * p.genome.baseMetabolism;

      // Eat (Output 2) — trophic-aware
      if (sigmoid(outputs[2]) > 0.5 && closestNutrient && closestNutrientDist < (p.radius + 5)**2) {
        const canEat = p.trophicLevel === TrophicLevel.Autotroph ||
          p.trophicLevel === TrophicLevel.Decomposer ||
          closestNutrient.trophicValue <= p.trophicLevel;
        if (canEat) {
          const consume = Math.min(closestNutrient.amount, 20 * dt * p.digestEfficiency);
          closestNutrient.amount -= consume;
          p.energy += consume * 3;
          // Absorb chemicals through membrane
          for (let c = 0; c < NUM_CHEMICALS; c++) {
            const transfer = (closestNutrient.chemicalContent[c] || 0) * p.genome.membrane.permeability[c] * dt;
            p.chem[c] += transfer;
          }
        }
      }

      // Reproduce (Output 3)
      if (sigmoid(outputs[3]) > 0.5 && p.energy > 80) {
        const mate = (closestOther && closestOther.speciesId === p.speciesId &&
          closestOtherDist < (p.radius + closestOther.radius + 15)**2) ? closestOther : null;
        this.reproduce(p, mate);
      }

      // Attack (Output 4) — predation with trophic logic
      if (sigmoid(outputs[4]) > 0.5) {
        const target = closestPrey || closestOther;
        if (target && closestOtherDist < (p.radius + (target.radius || 4) + 5)**2 && target.organismId !== p.organismId) {
          const damage = 50 * dt * (p.trophicLevel >= TrophicLevel.Predator ? 1.5 : 1.0);
          target.energy -= damage;
          target.genome.membrane.integrity -= dt * 0.1; // Damage membrane
          p.energy -= 10 * dt;
          if (target.energy <= 0 && !target.dead) {
            target.dead = true;
            // Predator gets energy from kill
            const harvestEnergy = p.trophicLevel >= TrophicLevel.Predator ? 80 : 50;
            p.energy += harvestEnergy;
            // Corpse drops as nutrient with trophic value
            this.state.nutrients.push({
              x: target.x, y: target.y, z: target.z,
              amount: 50, isCorpse: true,
              chemicalContent: target.chem.slice(),
              temperature: target.temperature,
              trophicValue: target.trophicLevel
            });
          }
        }
      }

      // Emit Pheromone (Output 5)
      if (sigmoid(outputs[5]) > 0.5) {
        this.addPheromoneAt(p.x, p.y, 100 * dt);
        p.energy -= dt * 0.5;
      }

      // Vocalize (Output 6)
      if (sigmoid(outputs[6]) > 0.5 && p.energy > 10) {
        this.state.sounds.push({
          x: p.x, y: p.y, z: p.z,
          volume: 1.0, radius: 10,
          frequency: sigmoid(outputs[7]) * 1000 // Frequency-based communication
        });
        p.energy -= 5;
      }

      // Memory (Output 7)
      p.mem = sigmoid(outputs[7]);

      // Bond (Output 8)
      if (sigmoid(outputs[8]) > 0.5 && closestOther) {
        if (closestOtherDist < (p.radius + closestOther.radius + 10)**2 && closestOther.organismId !== p.organismId) {
          const key = bkey(p.id, closestOther.id);
          if (!this.bondSet.has(key)) {
            this.state.bonds.push({
              p1: p.id, p2: closestOther.id,
              optimalDistance: p.radius + closestOther.radius + 2,
              strength: 0.1,
              chemicalTransfer: true,
              signalTransfer: true,
              type: 'structural'
            });
            this.bondSet.add(key);
            p.energy -= 5;
          }
        }
      }

      // Emit Morphogen (Output 9) — Turing pattern signaling
      if (sigmoid(outputs[9]) > 0.5 && this.config.enableMorphogens) {
        const channel = Math.floor(sigmoid(outputs[10]) * NUM_MORPHOGENS);
        this.addMorphogenAt(p.x, p.y, channel, 10 * dt);
        p.energy -= dt * 0.3;
      }

      // Differentiate (Output 11) — Cell specialization
      if (sigmoid(outputs[11]) > 0.5) {
        const morphLevel = morphogenLevel;
        if (morphLevel > 1) {
          p.differentiation = Math.min(1, p.differentiation + dt * 0.05);
          // Assign cell type based on morphogen gradients
          const types = ['motor', 'sensor', 'digest', 'immune', 'repro', 'structural'];
          p.cellType = types[Math.floor(morphLevel * 0.5) % types.length];
        }
      }

      // Heal Membrane (Output 12)
      if (sigmoid(outputs[12]) > 0.5 && p.energy > 20) {
        p.genome.membrane.integrity = Math.min(1, p.genome.membrane.integrity + dt * 0.1);
        p.energy -= dt * 1;
      }

      // Produce Antibody (Output 13)
      if (sigmoid(outputs[13]) > 0.5 && p.energy > 30 && this.config.enableImmuneSystem) {
        if (p.immune.antibodies.length < NUM_ANTIBODIES) {
          // Target most recent threat
          const targetSig = p.infected ? (this.state.viruses[0]?.strain ?? Math.random() * 1e6) : Math.random() * 1e6;
          p.immune.antibodies.push({ targetSignature: targetSig, strength: 0.2, age: 0 });
          p.energy -= 5;
        }
      }

      // Assign role
      const roleNames = ['Motor', 'Turner', 'Mouth', 'Breeder', 'Weapon', 'Emitter', 'Vocal', 'Brain', 'Binder', 'Signaler', 'Diff', 'Healer', 'Membrane', 'Immune'];
      let maxOutIdx = 0;
      for (let j = 1; j < NEURAL_OUTPUTS; j++) if (outputs[j] > outputs[maxOutIdx]) maxOutIdx = j;
      p.role = roleNames[maxOutIdx] || 'Unknown';

      // ─── Physics ────────────────────────────────────────
      p.x += p.vx * dt; p.y += p.vy * dt;
      if (this.config.enable3D) p.z += p.vz * dt;
      const frictionFactor = Math.pow(this.config.friction, dt * 60);
      p.vx *= frictionFactor; p.vy *= frictionFactor;
      if (this.config.enable3D) {
        p.vz *= frictionFactor;
        p.vz -= this.config.gravity * dt; // Gravity
      }

      // Obstacles
      for (const o of this.state.obstacles) {
        if (p.x + p.radius > o.x && p.x - p.radius < o.x + o.w &&
            p.y + p.radius > o.y && p.y - p.radius < o.y + o.h) {
          if (p.x < o.x || p.x > o.x + o.w) p.vx *= -1;
          if (p.y < o.y || p.y > o.y + o.h) p.vy *= -1;
          p.x += p.vx * dt; p.y += p.vy * dt;
        }
      }

      // Boundary wrapping
      if (p.x < 0) { p.x = 0; p.vx *= -1; }
      if (p.x > this.config.width) { p.x = this.config.width; p.vx *= -1; }
      if (p.y < 0) { p.y = 0; p.vy *= -1; }
      if (p.y > this.config.height) { p.y = this.config.height; p.vy *= -1; }
      if (this.config.enable3D) {
        if (p.z < 0) { p.z = 0; p.vz *= -1; }
        if (p.z > this.config.depth) { p.z = this.config.depth; p.vz *= -1; }
      }

      // Death conditions
      const winterDrain = this.state.season === 'Winter' ? 1.5 : 0;
      const telomereDeath = p.divisionsLeft <= 0 && p.age > 500;
      if (p.energy <= 0 || p.age > 1000 - winterDrain * 200 || telomereDeath) {
        p.dead = true;
        this.state.nutrients.push({
          x: p.x, y: p.y, z: p.z,
          amount: 50, isCorpse: true,
          chemicalContent: p.chem.slice(),
          temperature: p.temperature,
          trophicValue: p.trophicLevel
        });
      }
    }

    // Nutrient decay
    for (const n of this.state.nutrients) {
      if (n.isCorpse) {
        n.amount -= dt * 2;
        this.addPheromoneAt(n.x, n.y, -10 * dt);
        if (n.amount < 20) n.isCorpse = false;
      }
    }
    // In-place nutrient removal
    let nWriteIdx = 0;
    for (let i = 0; i < this.state.nutrients.length; i++) {
      if (this.state.nutrients[i].amount > 0) {
        this.state.nutrients[nWriteIdx++] = this.state.nutrients[i];
      }
    }
    this.state.nutrients.length = nWriteIdx;

    // ─── Bond springs ─────────────────────────────────────
    const particleMap = this._particleMap;
    let bondWriteIdx = 0;
    for (let i = 0; i < this.state.bonds.length; i++) {
      const b = this.state.bonds[i];
      const p1 = particleMap.get(b.p1), p2 = particleMap.get(b.p2);
      if (!p1 || !p2 || p1.dead || p2.dead) continue;

      const dx = p2.x - p1.x, dy = p2.y - p1.y;
      const dz = this.config.enable3D ? (p2.z - p1.z) : 0;
      const distSq = dx * dx + dy * dy + dz * dz;
      if (distSq > 0) {
        const dist = Math.sqrt(distSq);
        const force = (dist - b.optimalDistance) * b.strength;
        const nx = dx / dist, ny = dy / dist, nz = dz / dist;
        p1.vx += nx * force * dt * 50; p1.vy += ny * force * dt * 50;
        p2.vx -= nx * force * dt * 50; p2.vy -= ny * force * dt * 50;
        if (this.config.enable3D) { p1.vz += nz * force * dt * 50; p2.vz -= nz * force * dt * 50; }

        if (dist > b.optimalDistance * 3) continue; // Break

        // Chemical transfer through bonds
        if (b.chemicalTransfer) {
          for (let c = 0; c < NUM_CHEMICALS; c++) {
            const perm = Math.min(p1.genome.membrane.permeability[c], p2.genome.membrane.permeability[c]);
            const diff = p2.chem[c] - p1.chem[c];
            const transfer = diff * 0.1 * dt * perm;
            p1.chem[c] += transfer; p2.chem[c] -= transfer;
          }
        }
        // Morphogen signal transfer
        if (b.signalTransfer && this.config.enableMorphogens) {
          for (let c = 0; c < NUM_MORPHOGENS; c++) {
            const diff = p2.morphogens[c] - p1.morphogens[c];
            p1.morphogens[c] += diff * 0.05 * dt;
            p2.morphogens[c] -= diff * 0.05 * dt;
          }
        }
      }
      this.state.bonds[bondWriteIdx++] = b;
    }
    this.state.bonds.length = bondWriteIdx;

    // Species tracking
    this._activeSpecies.clear();
    for (const p of this.state.particles) this._activeSpecies.add(p.speciesId);
    for (const s of this.state.speciesHistory) {
      if (!s.extinct && !this._activeSpecies.has(s.id)) s.extinct = true;
    }
    // In-place dead particle removal (avoids array allocation)
    let writeIdx = 0;
    for (let i = 0; i < this.state.particles.length; i++) {
      if (!this.state.particles[i].dead) {
        this.state.particles[writeIdx++] = this.state.particles[i];
      }
    }
    this.state.particles.length = writeIdx;

    // Record history (single pass instead of multiple filter/reduce calls)
    if (Math.floor(this.state.time) > Math.floor(this.state.time - dt)) {
      const ps = this.state.particles;
      const len = ps.length || 1;
      let totalEnergy = 0, totalComp = 0, totalTemp = 0;
      let autotrophs = 0, herbivores = 0, predators = 0, decomposers = 0, parasites = 0;
      for (let i = 0; i < ps.length; i++) {
        const p = ps[i];
        totalEnergy += p.energy;
        totalComp += p.complexity;
        totalTemp += p.temperature;
        switch (p.trophicLevel) {
          case TrophicLevel.Autotroph: autotrophs++; break;
          case TrophicLevel.Herbivore: herbivores++; break;
          case TrophicLevel.Predator: predators++; break;
          case TrophicLevel.Decomposer: decomposers++; break;
          case TrophicLevel.Parasite: parasites++; break;
        }
      }
      this.state.history.push({
        time: this.state.time,
        population: ps.length,
        avgEnergy: totalEnergy / len, avgComplexity: totalComp / len,
        autotrophCount: autotrophs,
        herbivoreCount: herbivores,
        predatorCount: predators,
        decomposerCount: decomposers,
        parasiteCount: parasites,
        avgTemperature: this.config.enableTemperature ? totalTemp / len : 0,
        virusCount: this.state.viruses.length,
        bondCount: this.state.bonds.length,
        speciesCount: this._activeSpecies.size,
        biomass: totalEnergy
      });
      if (this.state.history.length > 200) this.state.history.shift();
    }
  }
}

// Helper
function gene_count(dna: DNA, codon: Codon): number {
  return dna.genes.filter(g => g.codon === codon && !g.methylated).length;
}
