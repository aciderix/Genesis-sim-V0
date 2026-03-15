// Genesis 2.0 WASM Engine — AssemblyScript port

const NUM_CHEMICALS: i32 = 8;
const PHEROMONE_CELL_SIZE: f64 = 10.0;

// ═══════════════════════════════════════════════
// Data Structures
// ═══════════════════════════════════════════════

class Reaction {
  sub: i32;
  prod: i32;
  rate: f64;
  energyDelta: f64;
  inhibitor: i32; // -1 = none

  constructor(sub: i32, prod: i32, rate: f64, energyDelta: f64, inhibitor: i32) {
    this.sub = sub;
    this.prod = prod;
    this.rate = rate;
    this.energyDelta = energyDelta;
    this.inhibitor = inhibitor;
  }
}

class Brain {
  wIH: StaticArray<f64>; // 9×6 = 54
  wHO: StaticArray<f64>; // 6×9 = 54

  constructor(wIH: StaticArray<f64>, wHO: StaticArray<f64>) {
    this.wIH = wIH;
    this.wHO = wHO;
  }
}

class Genome {
  reactions: Array<Reaction>;
  brain: Brain | null;
  colorR: f64;
  colorG: f64;
  colorB: f64;

  constructor(reactions: Array<Reaction>, brain: Brain | null, colorR: f64, colorG: f64, colorB: f64) {
    this.reactions = reactions;
    this.brain = brain;
    this.colorR = colorR;
    this.colorG = colorG;
    this.colorB = colorB;
  }
}

class Particle {
  id: i32;
  x: f64;
  y: f64;
  vx: f64;
  vy: f64;
  angle: f64;
  radius: f64;
  energy: f64;
  age: f64;
  chem: StaticArray<f64>;
  mem: f64;
  genome: Genome;
  dead: bool;
  generation: i32;
  parentId: i32;
  organismId: i32;
  speciesId: i32;
  complexity: i32;
  role: i32; // 0=Motor,1=Turner,2=Mouth,3=Breeder,4=Weapon,5=Emitter,6=Vocal,7=Brain,8=Binder

  constructor(id: i32, x: f64, y: f64, vx: f64, vy: f64, angle: f64, radius: f64,
              energy: f64, age: f64, chem: StaticArray<f64>, mem: f64, genome: Genome,
              dead: bool, generation: i32, parentId: i32, organismId: i32, speciesId: i32,
              complexity: i32, role: i32) {
    this.id = id;
    this.x = x;
    this.y = y;
    this.vx = vx;
    this.vy = vy;
    this.angle = angle;
    this.radius = radius;
    this.energy = energy;
    this.age = age;
    this.chem = chem;
    this.mem = mem;
    this.genome = genome;
    this.dead = dead;
    this.generation = generation;
    this.parentId = parentId;
    this.organismId = organismId;
    this.speciesId = speciesId;
    this.complexity = complexity;
    this.role = role;
  }
}

class Bond {
  p1: i32;
  p2: i32;
  optimalDistance: f64;
  strength: f64;

  constructor(p1: i32, p2: i32, optimalDistance: f64, strength: f64) {
    this.p1 = p1;
    this.p2 = p2;
    this.optimalDistance = optimalDistance;
    this.strength = strength;
  }
}

class Nutrient {
  x: f64;
  y: f64;
  amount: f64;
  isCorpse: bool;

  constructor(x: f64, y: f64, amount: f64, isCorpse: bool) {
    this.x = x;
    this.y = y;
    this.amount = amount;
    this.isCorpse = isCorpse;
  }
}

class Virus {
  x: f64;
  y: f64;
  radius: f64;
  genomePayload: Genome;
  life: f64;

  constructor(x: f64, y: f64, radius: f64, genomePayload: Genome, life: f64) {
    this.x = x;
    this.y = y;
    this.radius = radius;
    this.genomePayload = genomePayload;
    this.life = life;
  }
}

class Obstacle {
  x: f64;
  y: f64;
  w: f64;
  h: f64;

  constructor(x: f64, y: f64, w: f64, h: f64) {
    this.x = x;
    this.y = y;
    this.w = w;
    this.h = h;
  }
}

class Zone {
  x: f64;
  y: f64;
  r: f64;
  zoneType: i32; // 0=toxic, 1=shadow, 2=current
  dx: f64;
  dy: f64;

  constructor(x: f64, y: f64, r: f64, zoneType: i32, dx: f64, dy: f64) {
    this.x = x;
    this.y = y;
    this.r = r;
    this.zoneType = zoneType;
    this.dx = dx;
    this.dy = dy;
  }
}

class Sound {
  x: f64;
  y: f64;
  volume: f64;
  radius: f64;

  constructor(x: f64, y: f64, volume: f64, radius: f64) {
    this.x = x;
    this.y = y;
    this.volume = volume;
    this.radius = radius;
  }
}

class SpeciesRecord {
  id: i32;
  parentId: i32;
  colorR: f64;
  colorG: f64;
  colorB: f64;
  timestamp: f64;
  extinct: bool;
  traitX: f64;
  traitY: f64;

  constructor(id: i32, parentId: i32, colorR: f64, colorG: f64, colorB: f64,
              timestamp: f64, extinct: bool, traitX: f64, traitY: f64) {
    this.id = id;
    this.parentId = parentId;
    this.colorR = colorR;
    this.colorG = colorG;
    this.colorB = colorB;
    this.timestamp = timestamp;
    this.extinct = extinct;
    this.traitX = traitX;
    this.traitY = traitY;
  }
}

class HistoryEntry {
  time: f64;
  population: i32;
  avgEnergy: f64;
  avgComplexity: f64;

  constructor(time: f64, population: i32, avgEnergy: f64, avgComplexity: f64) {
    this.time = time;
    this.population = population;
    this.avgEnergy = avgEnergy;
    this.avgComplexity = avgComplexity;
  }
}

class NoveltyDescriptor {
  pop: i32;
  avgEnergy: f64;
  avgComp: f64;

  constructor(pop: i32, avgEnergy: f64, avgComp: f64) {
    this.pop = pop;
    this.avgEnergy = avgEnergy;
    this.avgComp = avgComp;
  }
}

// ═══════════════════════════════════════════════
// Module-Level State
// ═══════════════════════════════════════════════

// Config
let cfgWidth: f64 = 1200.0;
let cfgHeight: f64 = 800.0;
let cfgMaxParticles: i32 = 5000;
let cfgFriction: f64 = 0.95;
let cfgRepulsion: f64 = 5.0;
let cfgNutrientSpawnRate: f64 = 1.0;
let cfgMutationRate: f64 = 0.1;

// State
let simTime: f64 = 0.0;
let season: i32 = 0; // 0=Spring,1=Summer,2=Autumn,3=Winter
let dayLight: f64 = 1.0;

// Collections
let particles: Array<Particle> = new Array<Particle>();
let bonds: Array<Bond> = new Array<Bond>();
let nutrients: Array<Nutrient> = new Array<Nutrient>();
let viruses: Array<Virus> = new Array<Virus>();
let sounds: Array<Sound> = new Array<Sound>();
let obstacles: Array<Obstacle> = new Array<Obstacle>();
let zones: Array<Zone> = new Array<Zone>();
let speciesHistory: Array<SpeciesRecord> = new Array<SpeciesRecord>();
let history: Array<HistoryEntry> = new Array<HistoryEntry>();
let noveltyArchive: Array<NoveltyDescriptor> = new Array<NoveltyDescriptor>();

// Pheromones
let pheromones: Float32Array = new Float32Array(0);
let pheromonesBuffer2: Float32Array = new Float32Array(0);
let pheromoneCols: i32 = 0;
let pheromoneRows: i32 = 0;

// Spatial grid
let gridCols: i32 = 0;
let gridRows: i32 = 0;
let grid: Array<Array<Particle>> = new Array<Array<Particle>>();
let nutrientGrid: Array<Array<Nutrient>> = new Array<Array<Nutrient>>();

// Counters
let nextId: i32 = 1;
let nextSpeciesId: i32 = 1;

// Reusable
let bondSet: Set<i64> = new Set<i64>();
let particleMap: Map<i32, Particle> = new Map<i32, Particle>();
let activeSpecies: Set<i32> = new Set<i32>();

// Pre-allocated NN buffers
let nnInputs: StaticArray<f64> = new StaticArray<f64>(9);
let nnHidden: StaticArray<f64> = new StaticArray<f64>(6);
let nnOutputs: StaticArray<f64> = new StaticArray<f64>(9);

// Render buffers (lazily sized)
let particleRenderBuf: Float32Array = new Float32Array(0);
let nutrientRenderBuf: Float32Array = new Float32Array(0);
let bondRenderBuf: Float32Array = new Float32Array(0);
let virusRenderBuf: Float32Array = new Float32Array(0);
let soundRenderBuf: Float32Array = new Float32Array(0);
let pheromoneRenderBuf: Float32Array = new Float32Array(0);
let speciesRenderBuf: Float64Array = new Float64Array(0);
let historyRenderBuf: Float64Array = new Float64Array(0);

// ═══════════════════════════════════════════════
// Utility Functions
// ═══════════════════════════════════════════════

function sigmoid(x: f64): f64 {
  return 1.0 / (1.0 + Math.exp(-x));
}

// [OPT-2] Numeric bond key — i64 for safe range
function bkey(a: i32, b: i32): i64 {
  if (a < b) return <i64>a * 1000000 + <i64>b;
  return <i64>b * 1000000 + <i64>a;
}

function calculateComplexity(genome: Genome): i32 {
  let comp: f64 = 0.0;
  let brain = genome.brain;
  if (brain !== null) {
    let wIH = brain.wIH;
    for (let i: i32 = 0; i < 54; i++) {
      comp += Math.abs(unchecked(wIH[i]));
    }
    let wHO = brain.wHO;
    for (let i: i32 = 0; i < 54; i++) {
      comp += Math.abs(unchecked(wHO[i]));
    }
  }
  return <i32>Math.floor(comp);
}

function randomBrain(): Brain {
  let wIH = new StaticArray<f64>(54);
  for (let i: i32 = 0; i < 54; i++) {
    unchecked(wIH[i] = (Math.random() - 0.5) * 2.0);
  }
  let wHO = new StaticArray<f64>(54);
  for (let i: i32 = 0; i < 54; i++) {
    unchecked(wHO[i] = (Math.random() - 0.5) * 2.0);
  }
  return new Brain(wIH, wHO);
}

function randomGenome(): Genome {
  let reactions = new Array<Reaction>();
  let numReactions: i32 = <i32>Math.floor(Math.random() * 3.0);
  for (let i: i32 = 0; i < numReactions; i++) {
    let inhibitor: i32 = -1;
    if (Math.random() > 0.8) {
      inhibitor = <i32>Math.floor(Math.random() * <f64>NUM_CHEMICALS);
    }
    reactions.push(new Reaction(
      <i32>Math.floor(Math.random() * <f64>NUM_CHEMICALS),
      <i32>Math.floor(Math.random() * <f64>NUM_CHEMICALS),
      Math.random() * 0.1,
      (Math.random() - 0.5) * 2.0,
      inhibitor
    ));
  }
  return new Genome(
    reactions,
    randomBrain(),
    Math.floor(Math.random() * 255.0),
    Math.floor(Math.random() * 255.0),
    Math.floor(Math.random() * 255.0)
  );
}

function getTraitsX(brain: Brain): f64 {
  let tx: f64 = 0.0;
  let wHO = brain.wHO;
  for (let i: i32 = 0; i < 6; i++) {
    tx += unchecked(wHO[i * 9 + 2]) + unchecked(wHO[i * 9 + 3]);
  }
  return tx;
}

function getTraitsY(brain: Brain): f64 {
  let ty: f64 = 0.0;
  let wHO = brain.wHO;
  for (let i: i32 = 0; i < 6; i++) {
    ty += unchecked(wHO[i * 9 + 4]) + unchecked(wHO[i * 9 + 0]);
  }
  return ty;
}

function cloneGenome(g: Genome): Genome {
  let reactions = new Array<Reaction>();
  for (let i: i32 = 0; i < g.reactions.length; i++) {
    let r = unchecked(g.reactions[i]);
    reactions.push(new Reaction(r.sub, r.prod, r.rate, r.energyDelta, r.inhibitor));
  }
  let newBrain: Brain | null = null;
  let gb = g.brain;
  if (gb !== null) {
    let newWIH = new StaticArray<f64>(54);
    let newWHO = new StaticArray<f64>(54);
    let srcWIH = gb.wIH;
    let srcWHO = gb.wHO;
    for (let i: i32 = 0; i < 54; i++) {
      unchecked(newWIH[i] = srcWIH[i]);
    }
    for (let i: i32 = 0; i < 54; i++) {
      unchecked(newWHO[i] = srcWHO[i]);
    }
    newBrain = new Brain(newWIH, newWHO);
  }
  return new Genome(reactions, newBrain, g.colorR, g.colorG, g.colorB);
}

function newChemArray(): StaticArray<f64> {
  return new StaticArray<f64>(NUM_CHEMICALS);
}

function copyChemArray(src: StaticArray<f64>): StaticArray<f64> {
  let dst = new StaticArray<f64>(NUM_CHEMICALS);
  for (let i: i32 = 0; i < NUM_CHEMICALS; i++) {
    unchecked(dst[i] = src[i]);
  }
  return dst;
}

function spawnNutrient(nx: f64, ny: f64, amount: f64): void {
  let fx: f64 = nx < 0.0 ? Math.random() * cfgWidth : nx;
  let fy: f64 = ny < 0.0 ? Math.random() * cfgHeight : ny;
  let fa: f64 = amount < 0.0 ? (10.0 + Math.random() * 20.0) : amount;
  nutrients.push(new Nutrient(fx, fy, fa, false));
}

function spawnRandomParticle(): void {
  let genome = randomGenome();
  let specId = nextSpeciesId;
  nextSpeciesId++;
  let brain = genome.brain;
  let traitX: f64 = 0.0;
  let traitY: f64 = 0.0;
  if (brain !== null) {
    traitX = getTraitsX(brain);
    traitY = getTraitsY(brain);
  }
  speciesHistory.push(new SpeciesRecord(
    specId, 0, genome.colorR, genome.colorG, genome.colorB,
    simTime, false, traitX, traitY
  ));
  let id = nextId;
  nextId++;
  let chem = newChemArray();
  particles.push(new Particle(
    id,
    Math.random() * cfgWidth,
    Math.random() * cfgHeight,
    0.0, 0.0,
    Math.random() * Math.PI * 2.0,
    4.0,
    80.0 + Math.random() * 40.0,
    0.0,
    chem,
    0.0,
    genome,
    false,
    1, 0, id, specId,
    calculateComplexity(genome),
    0
  ));
}

function crossover(g1: Genome, g2: Genome): Genome {
  let b1 = g1.brain!;
  let b2 = g2.brain!;
  let wIH = new StaticArray<f64>(54);
  let wHO = new StaticArray<f64>(54);
  let b1wIH = b1.wIH;
  let b2wIH = b2.wIH;
  let b1wHO = b1.wHO;
  let b2wHO = b2.wHO;
  for (let i: i32 = 0; i < 54; i++) {
    if (Math.random() > 0.5) {
      unchecked(wIH[i] = b1wIH[i]);
    } else {
      unchecked(wIH[i] = b2wIH[i]);
    }
  }
  for (let i: i32 = 0; i < 54; i++) {
    if (Math.random() > 0.5) {
      unchecked(wHO[i] = b1wHO[i]);
    } else {
      unchecked(wHO[i] = b2wHO[i]);
    }
  }
  let reactions = new Array<Reaction>();
  for (let i: i32 = 0; i < g1.reactions.length; i++) {
    let r = unchecked(g1.reactions[i]);
    reactions.push(new Reaction(r.sub, r.prod, r.rate, r.energyDelta, r.inhibitor));
  }
  return new Genome(
    reactions,
    new Brain(wIH, wHO),
    Math.floor((g1.colorR + g2.colorR) / 2.0),
    Math.floor((g1.colorG + g2.colorG) / 2.0),
    Math.floor((g1.colorB + g2.colorB) / 2.0)
  );
}

function mutateGenome(genome: Genome): Genome {
  let newGenome = cloneGenome(genome);
  newGenome.colorR = Math.max(0.0, Math.min(255.0, newGenome.colorR + (Math.random() - 0.5) * 50.0));
  newGenome.colorG = Math.max(0.0, Math.min(255.0, newGenome.colorG + (Math.random() - 0.5) * 50.0));
  newGenome.colorB = Math.max(0.0, Math.min(255.0, newGenome.colorB + (Math.random() - 0.5) * 50.0));

  let brain = newGenome.brain;
  if (brain !== null) {
    let wIH = brain.wIH;
    for (let i: i32 = 0; i < 9; i++) {
      for (let j: i32 = 0; j < 6; j++) {
        if (Math.random() < cfgMutationRate) {
          let idx = i * 6 + j;
          unchecked(wIH[idx] = wIH[idx] + (Math.random() - 0.5));
        }
      }
    }
    let wHO = brain.wHO;
    for (let i: i32 = 0; i < 6; i++) {
      for (let j: i32 = 0; j < 9; j++) {
        if (Math.random() < cfgMutationRate) {
          let idx = i * 9 + j;
          unchecked(wHO[idx] = wHO[idx] + (Math.random() - 0.5));
        }
      }
    }
  }
  return newGenome;
}

function reproduce(p: Particle, hasMate: bool, mateIdx: i32): void {
  if (cfgMaxParticles > 0 && particles.length >= cfgMaxParticles) return;
  p.energy -= 40.0;

  let childEnergy: f64 = 30.0;
  let baseGenome: Genome;

  if (hasMate) {
    let mate = unchecked(particles[mateIdx]);
    mate.energy -= 40.0;
    childEnergy = 60.0;
    baseGenome = crossover(p.genome, mate.genome);
  } else {
    baseGenome = p.genome;
  }

  let finalGenome = mutateGenome(baseGenome);

  let isMutated: bool = false;
  let fBrain = finalGenome.brain;
  let pBrain = p.genome.brain;
  if (fBrain !== null && pBrain !== null) {
    isMutated = Math.abs(unchecked(fBrain.wHO[0]) - unchecked(pBrain.wHO[0])) > 0.1;
  }

  let specId = p.speciesId;
  if (isMutated) {
    specId = nextSpeciesId;
    nextSpeciesId++;
    let fb = finalGenome.brain;
    let traitX: f64 = 0.0;
    let traitY: f64 = 0.0;
    if (fb !== null) {
      traitX = getTraitsX(fb);
      traitY = getTraitsY(fb);
    }
    speciesHistory.push(new SpeciesRecord(
      specId, p.speciesId, finalGenome.colorR, finalGenome.colorG, finalGenome.colorB,
      simTime, false, traitX, traitY
    ));
  }

  let childId = nextId;
  nextId++;
  let mateGen: i32 = 0;
  if (hasMate) {
    mateGen = unchecked(particles[mateIdx]).generation;
  }
  let gen: i32 = p.generation;
  if (mateGen > gen) gen = mateGen;
  gen++;

  let childChem = copyChemArray(p.chem);
  particles.push(new Particle(
    childId,
    p.x + (Math.random() - 0.5) * 10.0,
    p.y + (Math.random() - 0.5) * 10.0,
    (Math.random() - 0.5) * 2.0,
    (Math.random() - 0.5) * 2.0,
    Math.random() * Math.PI * 2.0,
    4.0,
    childEnergy,
    0.0,
    childChem,
    0.0,
    finalGenome,
    false,
    gen,
    p.id,
    childId,
    specId,
    calculateComplexity(finalGenome),
    0
  ));
}

// Union-Find for organisms
let ufParent: Map<i32, i32> = new Map<i32, i32>();

function ufFind(x: i32): i32 {
  if (!ufParent.has(x)) ufParent.set(x, x);
  let root = x;
  while (true) {
    let p = ufParent.get(root);
    if (p == root) break;
    root = p;
  }
  let cur = x;
  while (cur != root) {
    let p = ufParent.get(cur);
    ufParent.set(cur, root);
    cur = p;
  }
  return root;
}

function updateOrganisms(): void {
  ufParent.clear();
  for (let i: i32 = 0; i < bonds.length; i++) {
    let b = unchecked(bonds[i]);
    let rootI = ufFind(b.p1);
    let rootJ = ufFind(b.p2);
    if (rootI != rootJ) ufParent.set(rootI, rootJ);
  }
  for (let i: i32 = 0; i < particles.length; i++) {
    let p = unchecked(particles[i]);
    p.organismId = ufFind(p.id);
  }
}

function updatePheromones(dt: f64): void {
  let read = pheromones;
  let write = pheromonesBuffer2;
  let cols = pheromoneCols;
  let rows = pheromoneRows;
  let decay: f32 = <f32>Math.pow(0.9, <f64>dt * 60.0);
  for (let y: i32 = 0; y < rows; y++) {
    for (let x: i32 = 0; x < cols; x++) {
      let idx = y * cols + x;
      let sum: f32 = unchecked(read[idx]);
      let count: f32 = 1.0;
      if (x > 0) { sum += unchecked(read[idx - 1]); count += 1.0; }
      if (x < cols - 1) { sum += unchecked(read[idx + 1]); count += 1.0; }
      if (y > 0) { sum += unchecked(read[idx - cols]); count += 1.0; }
      if (y < rows - 1) { sum += unchecked(read[idx + cols]); count += 1.0; }
      unchecked(write[idx] = (sum / count) * decay);
    }
  }
  // Swap
  pheromones = write;
  pheromonesBuffer2 = read;
}

function getPheromoneAt(px: f64, py: f64): f64 {
  let cx: i32 = <i32>Math.floor(px / PHEROMONE_CELL_SIZE);
  let cy: i32 = <i32>Math.floor(py / PHEROMONE_CELL_SIZE);
  if (cx >= 0 && cx < pheromoneCols && cy >= 0 && cy < pheromoneRows) {
    return <f64>unchecked(pheromones[cy * pheromoneCols + cx]);
  }
  return 0.0;
}

function addPheromoneAt(px: f64, py: f64, amount: f64): void {
  let cx: i32 = <i32>Math.floor(px / PHEROMONE_CELL_SIZE);
  let cy: i32 = <i32>Math.floor(py / PHEROMONE_CELL_SIZE);
  if (cx >= 0 && cx < pheromoneCols && cy >= 0 && cy < pheromoneRows) {
    let idx = cy * pheromoneCols + cx;
    unchecked(pheromones[idx] = pheromones[idx] + <f32>amount);
  }
}

// ═══════════════════════════════════════════════
// THE BIG UPDATE FUNCTION
// ═══════════════════════════════════════════════

function update(dt: f64): void {
  simTime += dt;

  // Seasons
  let yearLength: f64 = 120.0;
  let yearPhase: f64 = (simTime % yearLength) / yearLength;
  if (yearPhase < 0.25) season = 0;       // Spring
  else if (yearPhase < 0.5) season = 1;   // Summer
  else if (yearPhase < 0.75) season = 2;  // Autumn
  else season = 3;                          // Winter

  let seasonTemp: f64 = 1.0;
  if (season == 3) seasonTemp = 0.6;    // Winter
  if (season == 1) seasonTemp = 1.4;    // Summer
  dayLight = (Math.sin((simTime / 60.0) * Math.PI * 2.0) * 0.5 + 0.5) * seasonTemp;

  updateOrganisms();
  updatePheromones(dt);

  // Sound decay
  let soundWrite: i32 = 0;
  for (let i: i32 = 0; i < sounds.length; i++) {
    let s = unchecked(sounds[i]);
    s.radius += dt * 200.0;
    s.volume -= dt * 2.0;
    if (s.volume > 0.0) {
      unchecked(sounds[soundWrite] = s);
      soundWrite++;
    }
  }
  while (sounds.length > soundWrite) {
    sounds.pop();
  }

  // Nutrient spawning
  if (Math.random() < cfgNutrientSpawnRate * dt * seasonTemp) {
    spawnNutrient(-1.0, -1.0, -1.0);
  }

  // ═══ BUILD SPATIAL GRIDS ═══
  let gridSize: f64 = 50.0;
  let cols = gridCols;
  let rows = gridRows;

  for (let i: i32 = 0; i < grid.length; i++) {
    unchecked(grid[i]).length = 0;
    unchecked(nutrientGrid[i]).length = 0;
  }

  particleMap.clear();

  for (let i: i32 = 0; i < particles.length; i++) {
    let p = unchecked(particles[i]);
    if (p.dead) continue;
    particleMap.set(p.id, p);
    let gx: i32 = <i32>Math.max(0.0, Math.min(<f64>(cols - 1), Math.floor(p.x / gridSize)));
    let gy: i32 = <i32>Math.max(0.0, Math.min(<f64>(rows - 1), Math.floor(p.y / gridSize)));
    unchecked(grid[gy * cols + gx]).push(p);
  }

  for (let i: i32 = 0; i < nutrients.length; i++) {
    let n = unchecked(nutrients[i]);
    if (n.amount <= 0.0) continue;
    let gx: i32 = <i32>Math.max(0.0, Math.min(<f64>(cols - 1), Math.floor(n.x / gridSize)));
    let gy: i32 = <i32>Math.max(0.0, Math.min(<f64>(rows - 1), Math.floor(n.y / gridSize)));
    unchecked(nutrientGrid[gy * cols + gx]).push(n);
  }

  // [OPT-2] Rebuild bondSet
  bondSet.clear();
  for (let i: i32 = 0; i < bonds.length; i++) {
    let b = unchecked(bonds[i]);
    bondSet.add(bkey(b.p1, b.p2));
  }

  // ═══ VIRUSES ═══
  if (Math.random() < 0.5 * dt) {
    viruses.push(new Virus(
      Math.random() * cfgWidth,
      Math.random() * cfgHeight,
      3.0,
      randomGenome(),
      10.0
    ));
  }

  let virusWrite: i32 = 0;
  for (let i: i32 = 0; i < viruses.length; i++) {
    let v = unchecked(viruses[i]);
    v.life -= dt;
    v.x += (Math.random() - 0.5) * 50.0 * dt;
    v.y += (Math.random() - 0.5) * 50.0 * dt;

    if (v.x < 0.0) v.x = 0.0;
    if (v.x > cfgWidth) v.x = cfgWidth;
    if (v.y < 0.0) v.y = 0.0;
    if (v.y > cfgHeight) v.y = cfgHeight;

    if (v.life <= 0.0) continue;

    // [OPT-1] Grid-based collision
    let hit: bool = false;
    let vgx: i32 = <i32>Math.max(0.0, Math.min(<f64>(cols - 1), Math.floor(v.x / gridSize)));
    let vgy: i32 = <i32>Math.max(0.0, Math.min(<f64>(rows - 1), Math.floor(v.y / gridSize)));
    for (let ddx: i32 = -1; ddx <= 1; ddx++) {
      if (hit) break;
      for (let ddy: i32 = -1; ddy <= 1; ddy++) {
        if (hit) break;
        let nx = vgx + ddx;
        let ny = vgy + ddy;
        if (nx >= 0 && nx < cols && ny >= 0 && ny < rows) {
          let cell = unchecked(grid[ny * cols + nx]);
          for (let j: i32 = 0; j < cell.length; j++) {
            let p = unchecked(cell[j]);
            if (!p.dead) {
              let dpx = p.x - v.x;
              let dpy = p.y - v.y;
              let distSq = dpx * dpx + dpy * dpy;
              let minR = p.radius + v.radius;
              if (distSq < minR * minR) {
                p.genome = mutateGenome(p.genome);
                p.genome = mutateGenome(p.genome);
                p.energy -= 20.0;
                hit = true;
                break;
              }
            }
          }
        }
      }
    }

    if (!hit) {
      unchecked(viruses[virusWrite] = v);
      virusWrite++;
    }
  }
  while (viruses.length > virusWrite) {
    viruses.pop();
  }

  // ═══ NOVELTY SEARCH ═══
  if (Math.random() < 0.05 && particles.length > 0) {
    let totalEnergy: f64 = 0.0;
    let totalComp: f64 = 0.0;
    for (let i: i32 = 0; i < particles.length; i++) {
      totalEnergy += unchecked(particles[i]).energy;
      totalComp += <f64>unchecked(particles[i]).complexity;
    }
    let avgEnergy: f64 = totalEnergy / <f64>particles.length;
    let avgComp: f64 = totalComp / <f64>particles.length;
    let pop: i32 = particles.length;

    let minD: f64 = Infinity;
    for (let i: i32 = 0; i < noveltyArchive.length; i++) {
      let arch = unchecked(noveltyArchive[i]);
      let d: f64 = Math.abs(<f64>arch.pop - <f64>pop) + Math.abs(arch.avgEnergy - avgEnergy) + Math.abs(arch.avgComp - avgComp);
      if (d < minD) minD = d;
    }
    if (minD > 20.0 || noveltyArchive.length == 0) {
      noveltyArchive.push(new NoveltyDescriptor(pop, avgEnergy, avgComp));
      if (noveltyArchive.length > 500) {
        // shift: remove first element
        let newArchive = new Array<NoveltyDescriptor>();
        for (let i: i32 = 1; i < noveltyArchive.length; i++) {
          newArchive.push(unchecked(noveltyArchive[i]));
        }
        noveltyArchive = newArchive;
      }
      for (let i: i32 = 0; i < particles.length; i++) {
        if (<f64>unchecked(particles[i]).complexity >= avgComp) {
          unchecked(particles[i]).energy += 20.0;
        }
      }
    }
  }

  // ═══ PARTICLE UPDATE LOOP ═══
  let particleCount = particles.length;
  for (let i: i32 = 0; i < particleCount; i++) {
    let p = unchecked(particles[i]);
    if (p.dead) continue;

    p.age += dt;
    p.energy -= dt * 0.5;

    // Zone effects
    let localLight: f64 = dayLight;
    for (let zi: i32 = 0; zi < zones.length; zi++) {
      let z = unchecked(zones[zi]);
      let zdx = p.x - z.x;
      let zdy = p.y - z.y;
      let dSq = zdx * zdx + zdy * zdy;
      if (dSq < z.r * z.r) {
        if (z.zoneType == 0) p.energy -= 10.0 * dt;        // toxic
        else if (z.zoneType == 1) localLight = 0.0;         // shadow
        else if (z.zoneType == 2) {                          // current
          p.x += z.dx * dt;
          p.y += z.dy * dt;
        }
      }
    }

    // Photosynthesis
    let greenness: f64 = p.genome.colorG / 255.0;
    if (greenness > 0.5) {
      p.energy += dt * localLight * (greenness - 0.5) * 2.0;
    }

    // Chemical reactions
    let rxns = p.genome.reactions;
    for (let ri: i32 = 0; ri < rxns.length; ri++) {
      let rx = unchecked(rxns[ri]);
      if (rx.inhibitor >= 0 && unchecked(p.chem[rx.inhibitor]) > 0.5) continue;
      if (unchecked(p.chem[rx.sub]) > 0.0 && Math.random() < rx.rate * dt) {
        let amount: f64 = Math.min(unchecked(p.chem[rx.sub]), 1.0);
        unchecked(p.chem[rx.sub] = p.chem[rx.sub] - amount);
        unchecked(p.chem[rx.prod] = p.chem[rx.prod] + amount);
        p.energy += rx.energyDelta * amount;
      }
    }

    // Spatial scanning
    let fCount: i32 = 0;
    let mCount: i32 = 0;
    let dCount: i32 = 0;
    let closestNutrientIdx: i32 = -1;
    let closestNutrientDist: f64 = Infinity;
    let closestOtherIdx: i32 = -1;
    let closestOtherDist: f64 = Infinity;
    // We need to store a reference to the closest nutrient for eating
    let cnRef: Nutrient | null = null;
    let coRef: Particle | null = null;

    let gx: i32 = <i32>Math.max(0.0, Math.min(<f64>(cols - 1), Math.floor(p.x / gridSize)));
    let gy: i32 = <i32>Math.max(0.0, Math.min(<f64>(rows - 1), Math.floor(p.y / gridSize)));

    for (let ddx: i32 = -2; ddx <= 2; ddx++) {
      for (let ddy: i32 = -2; ddy <= 2; ddy++) {
        let nx = gx + ddx;
        let ny = gy + ddy;
        if (nx >= 0 && nx < cols && ny >= 0 && ny < rows) {
          let idx = ny * cols + nx;

          // Nutrients
          let cellNutrients = unchecked(nutrientGrid[idx]);
          for (let j: i32 = 0; j < cellNutrients.length; j++) {
            let n = unchecked(cellNutrients[j]);
            let ndx = n.x - p.x;
            let ndy = n.y - p.y;
            let distSq = ndx * ndx + ndy * ndy;
            if (distSq < 10000.0) {
              let diff = Math.abs(Math.atan2(ndy, ndx) - p.angle);
              if (diff > Math.PI) diff = 2.0 * Math.PI - diff;
              if (diff < 0.5) fCount++;
            }
            if (distSq < closestNutrientDist) {
              closestNutrientDist = distSq;
              cnRef = n;
            }
          }

          // Particles
          let cellParticles = unchecked(grid[idx]);
          for (let j: i32 = 0; j < cellParticles.length; j++) {
            let other = unchecked(cellParticles[j]);
            if (other.id != p.id && !other.dead) {
              let odx = other.x - p.x;
              let ody = other.y - p.y;
              let distSq = odx * odx + ody * ody;

              if (distSq < 10000.0) {
                let diff = Math.abs(Math.atan2(ody, odx) - p.angle);
                if (diff > Math.PI) diff = 2.0 * Math.PI - diff;
                if (diff < 0.5) {
                  if (other.speciesId == p.speciesId) mCount++;
                  else dCount++;
                }
              }

              if (distSq < closestOtherDist) {
                closestOtherDist = distSq;
                coRef = other;
              }

              let minDist = p.radius + other.radius;
              if (distSq < minDist * minDist && distSq > 0.0) {
                let dist = Math.sqrt(distSq);
                let force = (minDist - dist) * cfgRepulsion;
                p.vx += (odx / dist) * force * dt;
                p.vy += (ody / dist) * force * dt;
              }
            }
          }
        }
      }
    }

    // Sound detection
    let soundLevel: f64 = 0.0;
    for (let si: i32 = 0; si < sounds.length; si++) {
      let s = unchecked(sounds[si]);
      let sdx = p.x - s.x;
      let sdy = p.y - s.y;
      let dSq = sdx * sdx + sdy * sdy;
      let sr2 = s.radius * s.radius;
      let inner = s.radius - 20.0;
      let inner2 = inner * inner;
      if (dSq < sr2 && dSq > inner2) soundLevel += s.volume;
    }

    // Neural network
    let brain = p.genome.brain;
    if (brain !== null) {
      let inputs = nnInputs;
      unchecked(inputs[0] = 1.0);
      unchecked(inputs[1] = p.energy / 100.0);
      unchecked(inputs[2] = Math.min(p.age / 1000.0, 1.0));
      unchecked(inputs[3] = fCount > 0 ? 1.0 : 0.0);
      unchecked(inputs[4] = mCount > 0 ? 1.0 : 0.0);
      unchecked(inputs[5] = dCount > 0 ? 1.0 : 0.0);
      unchecked(inputs[6] = getPheromoneAt(p.x, p.y) / 100.0);
      unchecked(inputs[7] = p.mem);
      unchecked(inputs[8] = soundLevel);

      let hidden = nnHidden;
      let bwIH = brain.wIH;
      for (let j: i32 = 0; j < 6; j++) {
        let sum: f64 = 0.0;
        for (let k: i32 = 0; k < 9; k++) {
          sum += unchecked(inputs[k]) * unchecked(bwIH[k * 6 + j]);
        }
        unchecked(hidden[j] = Math.tanh(sum));
      }

      let outputs = nnOutputs;
      let bwHO = brain.wHO;
      for (let j: i32 = 0; j < 9; j++) {
        let sum: f64 = 0.0;
        for (let k: i32 = 0; k < 6; k++) {
          sum += unchecked(hidden[k]) * unchecked(bwHO[k * 9 + j]);
        }
        unchecked(outputs[j] = sum);
      }

      let moveFwd = sigmoid(unchecked(outputs[0]));
      let turn = Math.tanh(unchecked(outputs[1]));

      p.vx += Math.cos(p.angle) * moveFwd * 2.0;
      p.vy += Math.sin(p.angle) * moveFwd * 2.0;
      p.angle += turn * dt * 5.0;
      p.energy -= moveFwd * dt * 0.1;

      // Eat
      if (sigmoid(unchecked(outputs[2])) > 0.5 && cnRef !== null) {
        let cn = cnRef!;
        if (closestNutrientDist < (p.radius + 5.0) * (p.radius + 5.0)) {
          let consume = Math.min(cn.amount, 20.0 * dt);
          cn.amount -= consume;
          p.energy += consume * 3.0;
        }
      }

      // Reproduce
      if (sigmoid(unchecked(outputs[3])) > 0.5 && p.energy > 80.0) {
        reproduce(p, false, 0);
      }

      // Attack
      if (sigmoid(unchecked(outputs[4])) > 0.5 && coRef !== null) {
        let co = coRef!;
        if (closestOtherDist < (p.radius + co.radius + 5.0) * (p.radius + co.radius + 5.0) && co.organismId != p.organismId) {
          co.energy -= 50.0 * dt;
          p.energy -= 10.0 * dt;
          if (co.energy <= 0.0 && !co.dead) {
            co.dead = true;
            p.energy += 50.0;
          }
        }
      }

      // Pheromone
      if (sigmoid(unchecked(outputs[5])) > 0.5) {
        addPheromoneAt(p.x, p.y, 100.0 * dt);
        p.energy -= dt * 0.5;
      }

      // Sound emission
      if (sigmoid(unchecked(outputs[6])) > 0.5 && p.energy > 10.0) {
        sounds.push(new Sound(p.x, p.y, 1.0, 10.0));
        p.energy -= 5.0;
      }

      // Memory
      p.mem = sigmoid(unchecked(outputs[7]));

      // Bond (Output 8)
      if (sigmoid(unchecked(outputs[8])) > 0.5 && coRef !== null) {
        let co2 = coRef!;
        if (closestOtherDist < (p.radius + co2.radius + 10.0) * (p.radius + co2.radius + 10.0) && co2.organismId != p.organismId) {
          let key = bkey(p.id, co2.id);
          if (!bondSet.has(key)) {
            bonds.push(new Bond(p.id, co2.id, p.radius + co2.radius + 2.0, 0.1));
            bondSet.add(key);
            p.energy -= 5.0;
          }
        }
      }

      // Assign Role based on highest output
      let maxOutIdx: i32 = 0;
      for (let j: i32 = 1; j < 9; j++) {
        if (unchecked(outputs[j]) > unchecked(outputs[maxOutIdx])) maxOutIdx = j;
      }
      p.role = maxOutIdx;
    }

    // Physics
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    let fricPow = Math.pow(cfgFriction, dt * 60.0);
    p.vx *= fricPow;
    p.vy *= fricPow;

    // Obstacle collision
    for (let oi: i32 = 0; oi < obstacles.length; oi++) {
      let o = unchecked(obstacles[oi]);
      if (p.x + p.radius > o.x && p.x - p.radius < o.x + o.w &&
          p.y + p.radius > o.y && p.y - p.radius < o.y + o.h) {
        if (p.x < o.x || p.x > o.x + o.w) p.vx *= -1.0;
        if (p.y < o.y || p.y > o.y + o.h) p.vy *= -1.0;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
      }
    }

    // Boundary clamping
    if (p.x < 0.0) { p.x = 0.0; p.vx *= -1.0; }
    if (p.x > cfgWidth) { p.x = cfgWidth; p.vx *= -1.0; }
    if (p.y < 0.0) { p.y = 0.0; p.vy *= -1.0; }
    if (p.y > cfgHeight) { p.y = cfgHeight; p.vy *= -1.0; }

    // Death check
    let winterDrain: f64 = season == 3 ? 1.5 : 0.0;
    if (p.energy <= 0.0 || p.age > 1000.0 - winterDrain * 200.0) {
      p.dead = true;
      nutrients.push(new Nutrient(p.x, p.y, 50.0, true));
    }
  }

  // Filter out consumed nutrients and decay corpses
  for (let i: i32 = 0; i < nutrients.length; i++) {
    let n = unchecked(nutrients[i]);
    if (n.isCorpse) {
      n.amount -= dt * 2.0;
      addPheromoneAt(n.x, n.y, -10.0 * dt);
      if (n.amount < 20.0) n.isCorpse = false;
    }
  }
  // Filter nutrients with amount > 0
  let nWrite: i32 = 0;
  for (let i: i32 = 0; i < nutrients.length; i++) {
    if (unchecked(nutrients[i]).amount > 0.0) {
      unchecked(nutrients[nWrite] = nutrients[i]);
      nWrite++;
    }
  }
  while (nutrients.length > nWrite) {
    nutrients.pop();
  }

  // ═══ BOND SPRINGS ═══ [OPT-4] Compaction instead of splice
  let bondWriteIdx: i32 = 0;
  for (let i: i32 = 0; i < bonds.length; i++) {
    let b = unchecked(bonds[i]);
    let p1ok = particleMap.has(b.p1);
    let p2ok = particleMap.has(b.p2);
    if (!p1ok || !p2ok) continue;
    let p1 = particleMap.get(b.p1);
    let p2 = particleMap.get(b.p2);
    if (p1.dead || p2.dead) continue;

    let bdx = p2.x - p1.x;
    let bdy = p2.y - p1.y;
    let distSq = bdx * bdx + bdy * bdy;
    if (distSq > 0.0) {
      let dist = Math.sqrt(distSq);
      let force = (dist - b.optimalDistance) * b.strength;
      let bnx = bdx / dist;
      let bny = bdy / dist;
      p1.vx += bnx * force * dt * 50.0;
      p1.vy += bny * force * dt * 50.0;
      p2.vx -= bnx * force * dt * 50.0;
      p2.vy -= bny * force * dt * 50.0;
      if (dist > b.optimalDistance * 3.0) continue;
      for (let c: i32 = 0; c < NUM_CHEMICALS; c++) {
        let diff = unchecked(p2.chem[c]) - unchecked(p1.chem[c]);
        let transfer = diff * 0.1 * dt;
        unchecked(p1.chem[c] = p1.chem[c] + transfer);
        unchecked(p2.chem[c] = p2.chem[c] - transfer);
      }
    }
    unchecked(bonds[bondWriteIdx] = b);
    bondWriteIdx++;
  }
  while (bonds.length > bondWriteIdx) {
    bonds.pop();
  }

  // ═══ SPECIES TRACKING ═══
  activeSpecies.clear();
  for (let i: i32 = 0; i < particles.length; i++) {
    activeSpecies.add(unchecked(particles[i]).speciesId);
  }
  for (let i: i32 = 0; i < speciesHistory.length; i++) {
    let s = unchecked(speciesHistory[i]);
    if (!s.extinct && !activeSpecies.has(s.id)) s.extinct = true;
  }

  // Remove dead particles
  let pWrite: i32 = 0;
  for (let i: i32 = 0; i < particles.length; i++) {
    if (!unchecked(particles[i]).dead) {
      unchecked(particles[pWrite] = particles[i]);
      pWrite++;
    }
  }
  while (particles.length > pWrite) {
    particles.pop();
  }

  // Record History
  if (Math.floor(simTime) > Math.floor(simTime - dt)) {
    let avgE: f64 = 0.0;
    let avgC: f64 = 0.0;
    if (particles.length > 0) {
      let totalE: f64 = 0.0;
      let totalC: f64 = 0.0;
      for (let i: i32 = 0; i < particles.length; i++) {
        totalE += unchecked(particles[i]).energy;
        totalC += <f64>unchecked(particles[i]).complexity;
      }
      avgE = totalE / <f64>particles.length;
      avgC = totalC / <f64>particles.length;
    }
    history.push(new HistoryEntry(simTime, particles.length, avgE, avgC));
    if (history.length > 200) {
      let newHistory = new Array<HistoryEntry>();
      for (let i: i32 = 1; i < history.length; i++) {
        newHistory.push(unchecked(history[i]));
      }
      history = newHistory;
    }
  }
}

// ═══════════════════════════════════════════════
// EXPORTED API
// ═══════════════════════════════════════════════

export function init(w: f64, h: f64, initialParticles: i32, maxPart: i32,
                     fric: f64, repul: f64, nutrientRate: f64, mutRate: f64): void {
  cfgWidth = w;
  cfgHeight = h;
  cfgMaxParticles = maxPart;
  cfgFriction = fric;
  cfgRepulsion = repul;
  cfgNutrientSpawnRate = nutrientRate;
  cfgMutationRate = mutRate;

  simTime = 0.0;
  season = 0;
  dayLight = 1.0;
  nextId = 1;
  nextSpeciesId = 1;

  particles = new Array<Particle>();
  bonds = new Array<Bond>();
  nutrients = new Array<Nutrient>();
  viruses = new Array<Virus>();
  sounds = new Array<Sound>();
  speciesHistory = new Array<SpeciesRecord>();
  history = new Array<HistoryEntry>();
  noveltyArchive = new Array<NoveltyDescriptor>();

  obstacles = new Array<Obstacle>();
  obstacles.push(new Obstacle(300.0, 300.0, 20.0, 200.0));
  obstacles.push(new Obstacle(800.0, 400.0, 200.0, 20.0));

  zones = new Array<Zone>();
  zones.push(new Zone(200.0, 200.0, 100.0, 0, 0.0, 0.0));
  zones.push(new Zone(1000.0, 200.0, 150.0, 1, 0.0, 0.0));
  zones.push(new Zone(600.0, 600.0, 120.0, 2, 50.0, -20.0));

  pheromoneCols = <i32>Math.ceil(w / PHEROMONE_CELL_SIZE);
  pheromoneRows = <i32>Math.ceil(h / PHEROMONE_CELL_SIZE);
  let pherSize = pheromoneCols * pheromoneRows;
  pheromones = new Float32Array(pherSize);
  pheromonesBuffer2 = new Float32Array(pherSize);

  gridCols = <i32>Math.ceil(w / 50.0);
  gridRows = <i32>Math.ceil(h / 50.0);
  let totalCells = gridCols * gridRows;
  grid = new Array<Array<Particle>>();
  nutrientGrid = new Array<Array<Nutrient>>();
  for (let i: i32 = 0; i < totalCells; i++) {
    grid.push(new Array<Particle>());
    nutrientGrid.push(new Array<Nutrient>());
  }

  bondSet = new Set<i64>();
  particleMap = new Map<i32, Particle>();
  activeSpecies = new Set<i32>();

  for (let i: i32 = 0; i < initialParticles; i++) {
    spawnRandomParticle();
  }
  for (let i: i32 = 0; i < 100; i++) {
    spawnNutrient(-1.0, -1.0, -1.0);
  }
}

export function tick(dt: f64): void {
  update(dt);
}

export function setMaxParticles(v: i32): void {
  cfgMaxParticles = v;
}

export function setConfig(key: i32, value: f64): void {
  if (key == 0) cfgFriction = value;
  else if (key == 1) cfgRepulsion = value;
  else if (key == 2) cfgNutrientSpawnRate = value;
  else if (key == 3) cfgMutationRate = value;
  else if (key == 4) cfgMaxParticles = <i32>value;
}

export function getParticleCount(): i32 {
  return particles.length;
}

export function packParticleData(): Float32Array {
  let count = particles.length;
  let needed = count * 8;
  if (particleRenderBuf.length < needed) {
    particleRenderBuf = new Float32Array(needed);
  }
  let buf = particleRenderBuf;
  for (let i: i32 = 0; i < count; i++) {
    let p = unchecked(particles[i]);
    let off = i * 8;
    unchecked(buf[off] = <f32>p.x);
    unchecked(buf[off + 1] = <f32>p.y);
    unchecked(buf[off + 2] = <f32>p.radius);
    unchecked(buf[off + 3] = <f32>p.genome.colorR);
    unchecked(buf[off + 4] = <f32>p.genome.colorG);
    unchecked(buf[off + 5] = <f32>p.genome.colorB);
    unchecked(buf[off + 6] = <f32>p.energy);
    unchecked(buf[off + 7] = <f32>p.id);
  }
  return buf;
}

export function getNutrientCount(): i32 {
  return nutrients.length;
}

export function packNutrientData(): Float32Array {
  let count = nutrients.length;
  let needed = count * 4;
  if (nutrientRenderBuf.length < needed) {
    nutrientRenderBuf = new Float32Array(needed);
  }
  let buf = nutrientRenderBuf;
  for (let i: i32 = 0; i < count; i++) {
    let n = unchecked(nutrients[i]);
    let off = i * 4;
    unchecked(buf[off] = <f32>n.x);
    unchecked(buf[off + 1] = <f32>n.y);
    unchecked(buf[off + 2] = <f32>n.amount);
    unchecked(buf[off + 3] = n.isCorpse ? <f32>1.0 : <f32>0.0);
  }
  return buf;
}

export function getBondCount(): i32 {
  return bonds.length;
}

export function packBondData(): Float32Array {
  let count = bonds.length;
  let needed = count * 2;
  if (bondRenderBuf.length < needed) {
    bondRenderBuf = new Float32Array(needed);
  }
  let buf = bondRenderBuf;
  for (let i: i32 = 0; i < count; i++) {
    let b = unchecked(bonds[i]);
    let off = i * 2;
    unchecked(buf[off] = <f32>b.p1);
    unchecked(buf[off + 1] = <f32>b.p2);
  }
  return buf;
}

export function getVirusCount(): i32 {
  return viruses.length;
}

export function packVirusData(): Float32Array {
  let count = viruses.length;
  let needed = count * 3;
  if (virusRenderBuf.length < needed) {
    virusRenderBuf = new Float32Array(needed);
  }
  let buf = virusRenderBuf;
  for (let i: i32 = 0; i < count; i++) {
    let v = unchecked(viruses[i]);
    let off = i * 3;
    unchecked(buf[off] = <f32>v.x);
    unchecked(buf[off + 1] = <f32>v.y);
    unchecked(buf[off + 2] = <f32>v.radius);
  }
  return buf;
}

export function getSoundCount(): i32 {
  return sounds.length;
}

export function packSoundData(): Float32Array {
  let count = sounds.length;
  let needed = count * 4;
  if (soundRenderBuf.length < needed) {
    soundRenderBuf = new Float32Array(needed);
  }
  let buf = soundRenderBuf;
  for (let i: i32 = 0; i < count; i++) {
    let s = unchecked(sounds[i]);
    let off = i * 4;
    unchecked(buf[off] = <f32>s.x);
    unchecked(buf[off + 1] = <f32>s.y);
    unchecked(buf[off + 2] = <f32>s.radius);
    unchecked(buf[off + 3] = <f32>s.volume);
  }
  return buf;
}

export function getPheromoneData(): Float32Array {
  return pheromones;
}

export function getObstacleCount(): i32 {
  return obstacles.length;
}

export function getZoneCount(): i32 {
  return zones.length;
}

export function getSimTime(): f64 {
  return simTime;
}

export function getSeason(): i32 {
  return season;
}

export function getDayLight(): f64 {
  return dayLight;
}

export function getNoveltyCount(): i32 {
  return noveltyArchive.length;
}

export function getSpeciesCount(): i32 {
  let specSet = new Set<i32>();
  for (let i: i32 = 0; i < particles.length; i++) {
    specSet.add(unchecked(particles[i]).speciesId);
  }
  return specSet.size;
}

export function getMaxGeneration(): i32 {
  let maxGen: i32 = 0;
  for (let i: i32 = 0; i < particles.length; i++) {
    let g = unchecked(particles[i]).generation;
    if (g > maxGen) maxGen = g;
  }
  return maxGen;
}

export function getAvgEnergy(): f64 {
  if (particles.length == 0) return 0.0;
  let total: f64 = 0.0;
  for (let i: i32 = 0; i < particles.length; i++) {
    total += unchecked(particles[i]).energy;
  }
  return total / <f64>particles.length;
}

export function getAvgComplexity(): f64 {
  if (particles.length == 0) return 0.0;
  let total: f64 = 0.0;
  for (let i: i32 = 0; i < particles.length; i++) {
    total += <f64>unchecked(particles[i]).complexity;
  }
  return total / <f64>particles.length;
}

export function getSpeciesHistoryCount(): i32 {
  return speciesHistory.length;
}

export function packSpeciesHistory(): Float64Array {
  let count = speciesHistory.length;
  let needed = count * 9;
  if (speciesRenderBuf.length < needed) {
    speciesRenderBuf = new Float64Array(needed);
  }
  let buf = speciesRenderBuf;
  for (let i: i32 = 0; i < count; i++) {
    let s = unchecked(speciesHistory[i]);
    let off = i * 9;
    unchecked(buf[off] = <f64>s.id);
    unchecked(buf[off + 1] = <f64>s.parentId);
    unchecked(buf[off + 2] = s.colorR);
    unchecked(buf[off + 3] = s.colorG);
    unchecked(buf[off + 4] = s.colorB);
    unchecked(buf[off + 5] = s.timestamp);
    unchecked(buf[off + 6] = s.extinct ? 1.0 : 0.0);
    unchecked(buf[off + 7] = s.traitX);
    unchecked(buf[off + 8] = s.traitY);
  }
  return buf;
}

export function getHistoryCount(): i32 {
  return history.length;
}

export function packHistory(): Float64Array {
  let count = history.length;
  let needed = count * 4;
  if (historyRenderBuf.length < needed) {
    historyRenderBuf = new Float64Array(needed);
  }
  let buf = historyRenderBuf;
  for (let i: i32 = 0; i < count; i++) {
    let h = unchecked(history[i]);
    let off = i * 4;
    unchecked(buf[off] = h.time);
    unchecked(buf[off + 1] = <f64>h.population);
    unchecked(buf[off + 2] = h.avgEnergy);
    unchecked(buf[off + 3] = h.avgComplexity);
  }
  return buf;
}

// Interactive commands
export function spawnNutrientAt(x: f64, y: f64, amount: f64): void {
  spawnNutrient(x, y, amount);
}

export function addPheromoneCommand(x: f64, y: f64, amount: f64): void {
  addPheromoneAt(x, y, amount);
}

export function spawnVirusAt(x: f64, y: f64): void {
  viruses.push(new Virus(x, y, 3.0, randomGenome(), 10.0));
}

export function killAt(x: f64, y: f64): void {
  let bestIdx: i32 = -1;
  let bestDist: f64 = 400.0; // 20px radius
  for (let i: i32 = 0; i < particles.length; i++) {
    let p = unchecked(particles[i]);
    let dx = p.x - x;
    let dy = p.y - y;
    let d = dx * dx + dy * dy;
    if (d < bestDist) {
      bestDist = d;
      bestIdx = i;
    }
  }
  if (bestIdx >= 0) {
    unchecked(particles[bestIdx]).dead = true;
  }
}

export function addObstacleAt(x: f64, y: f64): void {
  obstacles.push(new Obstacle(x - 10.0, y - 50.0, 20.0, 100.0));
}

export function addZoneAt(x: f64, y: f64): void {
  zones.push(new Zone(x, y, 80.0, 0, 0.0, 0.0));
}

export function getClosestParticleId(x: f64, y: f64): i32 {
  let bestId: i32 = -1;
  let bestDist: f64 = Infinity;
  for (let i: i32 = 0; i < particles.length; i++) {
    let p = unchecked(particles[i]);
    let dx = p.x - x;
    let dy = p.y - y;
    let d = dx * dx + dy * dy;
    if (d < bestDist) {
      bestDist = d;
      bestId = p.id;
    }
  }
  return bestId;
}

export function moveParticle(id: i32, x: f64, y: f64): void {
  for (let i: i32 = 0; i < particles.length; i++) {
    let p = unchecked(particles[i]);
    if (p.id == id) {
      p.x = x;
      p.y = y;
      p.vx = 0.0;
      p.vy = 0.0;
      break;
    }
  }
}

export function resetEngine(): void {
  init(cfgWidth, cfgHeight, 50, cfgMaxParticles, cfgFriction, cfgRepulsion, cfgNutrientSpawnRate, cfgMutationRate);
}

// Save/Load support
export function getFullParticleDataSize(): i32 {
  let size: i32 = 0;
  for (let i: i32 = 0; i < particles.length; i++) {
    let p = unchecked(particles[i]);
    // Fixed fields: id,x,y,vx,vy,angle,radius,energy,age, chem×8, mem, dead, generation, parentId, organismId, speciesId, complexity, colorR, colorG, colorB, numReactions = 29
    // + reactions * 5 each
    // + brain: 54 + 54 = 108
    size += 29 + p.genome.reactions.length * 5 + 108;
  }
  return size;
}

export function packFullParticleData(): Float64Array {
  let totalSize = getFullParticleDataSize();
  let buf = new Float64Array(totalSize);
  let off: i32 = 0;
  for (let i: i32 = 0; i < particles.length; i++) {
    let p = unchecked(particles[i]);
    unchecked(buf[off++] = <f64>p.id);
    unchecked(buf[off++] = p.x);
    unchecked(buf[off++] = p.y);
    unchecked(buf[off++] = p.vx);
    unchecked(buf[off++] = p.vy);
    unchecked(buf[off++] = p.angle);
    unchecked(buf[off++] = p.radius);
    unchecked(buf[off++] = p.energy);
    unchecked(buf[off++] = p.age);
    for (let c: i32 = 0; c < NUM_CHEMICALS; c++) {
      unchecked(buf[off++] = p.chem[c]);
    }
    unchecked(buf[off++] = p.mem);
    unchecked(buf[off++] = p.dead ? 1.0 : 0.0);
    unchecked(buf[off++] = <f64>p.generation);
    unchecked(buf[off++] = <f64>p.parentId);
    unchecked(buf[off++] = <f64>p.organismId);
    unchecked(buf[off++] = <f64>p.speciesId);
    unchecked(buf[off++] = <f64>p.complexity);
    unchecked(buf[off++] = p.genome.colorR);
    unchecked(buf[off++] = p.genome.colorG);
    unchecked(buf[off++] = p.genome.colorB);
    let rxns = p.genome.reactions;
    unchecked(buf[off++] = <f64>rxns.length);
    for (let ri: i32 = 0; ri < rxns.length; ri++) {
      let r = unchecked(rxns[ri]);
      unchecked(buf[off++] = <f64>r.sub);
      unchecked(buf[off++] = <f64>r.prod);
      unchecked(buf[off++] = r.rate);
      unchecked(buf[off++] = r.energyDelta);
      unchecked(buf[off++] = <f64>r.inhibitor);
    }
    let brain = p.genome.brain;
    if (brain !== null) {
      for (let bi: i32 = 0; bi < 54; bi++) {
        unchecked(buf[off++] = brain.wIH[bi]);
      }
      for (let bi: i32 = 0; bi < 54; bi++) {
        unchecked(buf[off++] = brain.wHO[bi]);
      }
    } else {
      for (let bi: i32 = 0; bi < 108; bi++) {
        unchecked(buf[off++] = 0.0);
      }
    }
  }
  return buf;
}
