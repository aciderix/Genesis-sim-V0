// ═══════════════════════════════════════════════════════════════════════════
// GENESIS 3.0 — Revolutionary Artificial Life Simulator
// Type definitions for: 3D physics, DNA genetics, trophic ecology,
// morphogen signaling, immune system, epigenetics, thermodynamics,
// abiogenesis, membrane compartments
// ═══════════════════════════════════════════════════════════════════════════

export const NUM_CHEMICALS = 16; // Doubled from 8
export const DNA_LENGTH = 64; // Synthetic DNA codon count
export const NUM_MORPHOGENS = 4; // Turing pattern channels
export const NUM_ANTIBODIES = 8; // Immune memory slots
export const NEURAL_INPUTS = 18; // Expanded sensory inputs
export const NEURAL_HIDDEN = 12; // Doubled hidden layer
export const NEURAL_OUTPUTS = 14; // Expanded motor outputs

// ─── 3D Vector ────────────────────────────────────────────────────────────
export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

// ─── Chemistry ────────────────────────────────────────────────────────────
export interface Reaction {
  sub: number;
  prod: number;
  rate: number;
  energyDelta: number;
  inhibitor?: number;
  catalyst?: number; // Chemical that speeds up reaction
  activationEnergy: number; // Temperature threshold for reaction
  isEnzymatic: boolean; // Requires catalyst to proceed
}

// ─── Synthetic DNA System ─────────────────────────────────────────────────
export enum Codon {
  NOP = 0, // No operation
  // Structural genes
  GROW = 1, // Increase cell size
  DIVIDE = 2, // Trigger cell division
  BOND = 3, // Form bond with neighbor
  UNBOND = 4, // Break bonds
  // Metabolic genes
  PHOTOSYNTH = 5, // Enable photosynthesis
  CHEMSYNTH = 6, // Enable chemosynthesis
  DIGEST = 7, // Enable predation/digestion
  DECOMPOSE = 8, // Enable decomposition
  // Behavioral genes
  MOVE = 9, // Movement capability
  SENSE = 10, // Enhanced sensing
  ATTACK = 11, // Offensive capability
  DEFEND = 12, // Defensive capability
  SIGNAL = 13, // Emit morphogen
  // Regulatory genes
  PROMOTE = 14, // Enhance next gene expression
  SUPPRESS = 15, // Suppress next gene expression
  EPIMASK = 16, // Epigenetic marker (can be toggled by environment)
  REPEAT = 17, // Repeat previous gene N times
  // Immune genes
  ANTIBODY = 18, // Produce antibody
  MHC = 19, // Major Histocompatibility Complex marker
}

export interface Gene {
  codon: Codon;
  value: number; // Parameter for the codon (0-1)
  methylated: boolean; // Epigenetic silencing
  expression: number; // Current expression level (0-1)
}

export interface DNA {
  genes: Gene[];
  mhcSignature: number; // Unique immune identity (hash)
  telomereLength: number; // Decreases with each division (aging)
}

// ─── Trophic Levels ───────────────────────────────────────────────────────
export enum TrophicLevel {
  Molecule = 0, // Pre-life (abiogenesis mode)
  Autotroph = 1, // Photosynthesis/chemosynthesis
  Herbivore = 2, // Eats autotrophs
  Predator = 3, // Eats herbivores/other predators
  Decomposer = 4, // Eats corpses, recycles nutrients
  Parasite = 5, // Steals energy from host
}

// ─── Membrane / Compartment ───────────────────────────────────────────────
export interface Membrane {
  permeability: number[]; // Per-chemical permeability (0-1) [NUM_CHEMICALS]
  integrity: number; // 0-1, damaged by attack/virus
  osmosisRate: number; // Water/nutrient flow rate
  receptors: number[]; // Morphogen receptor sensitivity [NUM_MORPHOGENS]
}

// ─── Immune System ────────────────────────────────────────────────────────
export interface Antibody {
  targetSignature: number; // MHC signature this antibody targets
  strength: number; // Recognition strength (0-1)
  age: number; // Time since creation
}

export interface ImmuneSystem {
  antibodies: Antibody[];
  inflammationLevel: number; // 0-1, triggered by infection
  immuneEnergy: number; // Energy dedicated to immune function
  memoryStrength: number; // How well past infections are remembered
}

// ─── Neural Network (Expanded) ────────────────────────────────────────────
export interface Brain {
  wIH: number[][]; // NEURAL_INPUTS x NEURAL_HIDDEN
  wHO: number[][]; // NEURAL_HIDDEN x NEURAL_OUTPUTS
  biasH: number[]; // Hidden layer biases
  biasO: number[]; // Output layer biases
  neuromodulator: number; // Global gain modulation (dopamine analog)
  plasticity: number; // Hebbian learning rate
}

// ─── Legacy enums (kept for backward compat) ─────────────────────────────
export enum ConditionType {
  Always = 0, EnergyAbove = 1, EnergyBelow = 2, Chem0Above = 3, Chem1Above = 4,
  AgeAbove = 5, LightAbove = 6, NeighborsAbove = 7, FoodAhead = 8, MateAhead = 9,
  DangerAhead = 10, PheromoneAhead = 11,
}

export enum ActionType {
  None = 0, MoveRandom = 1, MoveForward = 2, TurnLeft = 3, TurnRight = 4,
  Eat = 5, Reproduce = 6, Bond = 7, Unbond = 8, Attack = 9, EmitPheromone = 10,
}

export interface Rule {
  condition: ConditionType;
  threshold: number;
  action: ActionType;
  value: number;
}

// ─── Genome (Massively Expanded) ──────────────────────────────────────────
export interface Genome {
  // Core genetics
  dna: DNA;
  reactions: Reaction[];
  rules: Rule[]; // Legacy
  brain: Brain;
  color: [number, number, number];
  // Phenotype expression
  trophicLevel: TrophicLevel;
  membrane: Membrane;
  baseMetabolism: number; // Energy cost per tick (evolved)
  heatTolerance: number; // Temperature range tolerance
  coldTolerance: number;
  size: number; // Base radius multiplier
  speed: number; // Movement efficiency
  senseRange: number; // Detection radius multiplier
  // Immune identity
  mhcType: number; // Self/non-self recognition
}

// ─── Particle (3D, Full Biology) ──────────────────────────────────────────
export interface Particle {
  id: number;
  // 3D Position & Physics
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  angle: number; // Yaw (XY plane)
  pitch: number; // Pitch (Z axis)
  radius: number;
  mass: number;
  // Biology
  energy: number;
  age: number;
  chem: number[]; // Internal chemicals [NUM_CHEMICALS]
  mem: number;
  genome: Genome;
  dead: boolean;
  generation: number;
  parentId: number;
  organismId: number;
  speciesId: number;
  complexity: number;
  role?: string;
  // Trophic & Ecology
  trophicLevel: TrophicLevel;
  digestEfficiency: number; // How well it extracts energy from food
  biofilm: boolean; // Part of a biofilm colony
  // Temperature
  temperature: number; // Internal temperature
  // Immune system
  immune: ImmuneSystem;
  infected: boolean;
  infectionTimer: number;
  // Morphogen state
  morphogens: number[]; // Emitted morphogen levels [NUM_MORPHOGENS]
  differentiation: number; // Cell differentiation state (0=stem, 1=fully differentiated)
  // Epigenetics
  stressLevel: number; // Accumulated stress (affects epigenetic marks)
  // Telomere / Aging
  divisionsLeft: number; // Hayflick limit
  // Multicellular
  cellType: string; // Differentiated type: 'stem', 'motor', 'sensor', 'digest', 'immune', 'repro'
}

// ─── Bond (3D) ────────────────────────────────────────────────────────────
export interface Bond {
  p1: number;
  p2: number;
  optimalDistance: number;
  strength: number;
  chemicalTransfer: boolean; // Whether chemicals diffuse through this bond
  signalTransfer: boolean; // Whether morphogens pass through
  type: 'structural' | 'neural' | 'vascular'; // Bond type affects behavior
}

// ─── Obstacle (3D) ────────────────────────────────────────────────────────
export interface Obstacle {
  x: number; y: number; z: number;
  w: number; h: number; d: number; // depth for 3D
}

// ─── Zone (3D sphere) ─────────────────────────────────────────────────────
export interface Zone {
  x: number; y: number; z: number; r: number;
  type: 'toxic' | 'shadow' | 'current' | 'thermal_vent' | 'radiation' | 'nutrient_rich';
  dx?: number; dy?: number; dz?: number;
  temperature?: number; // For thermal zones
  intensity?: number; // Effect strength
}

// ─── Sound (3D) ───────────────────────────────────────────────────────────
export interface Sound {
  x: number; y: number; z: number;
  volume: number; radius: number;
  frequency: number; // Allows frequency-based communication
}

// ─── Species Record ───────────────────────────────────────────────────────
export interface SpeciesRecord {
  id: number;
  parentId: number;
  color: [number, number, number];
  timestamp: number;
  extinct: boolean;
  traitX: number;
  traitY: number;
  trophicLevel: TrophicLevel;
  avgSize: number;
  population: number;
}

// ─── Virus (3D, Enhanced) ─────────────────────────────────────────────────
export interface Virus {
  x: number; y: number; z: number;
  radius: number;
  genomePayload: Partial<Genome>;
  life: number;
  mutationRate: number; // How aggressively it mutates host
  mhcTarget: number; // Which MHC type it targets
  strain: number; // Virus strain ID for immune memory
}

// ─── Nutrient (3D) ────────────────────────────────────────────────────────
export interface Nutrient {
  x: number; y: number; z: number;
  amount: number;
  isCorpse?: boolean;
  chemicalContent: number[]; // Which chemicals the nutrient contains
  temperature: number;
  trophicValue: TrophicLevel; // What trophic level can eat this
}

// ─── Morphogen Field ──────────────────────────────────────────────────────
export interface MorphogenField {
  data: Float32Array; // 3D grid (cols × rows × depth × NUM_MORPHOGENS)
  cols: number;
  rows: number;
  depth: number;
}

// ─── Temperature Field ────────────────────────────────────────────────────
export interface TemperatureField {
  data: Float32Array; // 3D grid
  cols: number;
  rows: number;
  depth: number;
}

// ─── Simulation History ───────────────────────────────────────────────────
export interface SimHistory {
  time: number;
  population: number;
  avgEnergy: number;
  avgComplexity: number;
  // New metrics
  autotrophCount: number;
  herbivoreCount: number;
  predatorCount: number;
  decomposerCount: number;
  parasiteCount: number;
  avgTemperature: number;
  virusCount: number;
  bondCount: number;
  speciesCount: number;
  biomass: number; // Total energy in all organisms
}

// ─── Simulation State (3D) ────────────────────────────────────────────────
export interface SimState {
  particles: Particle[];
  bonds: Bond[];
  time: number;
  width: number;
  height: number;
  depth: number; // 3D depth
  nutrients: Nutrient[];
  dayLight: number;
  season: string;
  viruses: Virus[];
  history: SimHistory[];
  noveltyArchive: any[];
  speciesHistory: SpeciesRecord[];
  // Pheromone field (3D)
  pheromones: Float32Array;
  pheromoneCols: number;
  pheromoneRows: number;
  pheromoneDepth: number;
  // Morphogen fields (Turing patterns)
  morphogens: MorphogenField;
  // Temperature field
  temperature: TemperatureField;
  // Environment
  obstacles: Obstacle[];
  zones: Zone[];
  sounds: Sound[];
  // Global environment
  ambientTemperature: number;
  oxygenLevel: number;
  co2Level: number;
  // Abiogenesis mode
  abiogenesisMode: boolean;
  prebiotic: { molecules: number; protocells: number; };
}

// ─── Simulation Config ────────────────────────────────────────────────────
export interface SimConfig {
  width: number;
  height: number;
  depth: number; // 3D depth
  initialParticles: number;
  maxParticles: number;
  friction: number;
  repulsion: number;
  nutrientSpawnRate: number;
  mutationRate: number;
  // New config options
  enable3D: boolean;
  enableAbiogenesis: boolean;
  enableImmuneSystem: boolean;
  enableEpigenetics: boolean;
  enableMorphogens: boolean;
  enableTemperature: boolean;
  enableTrophicLevels: boolean;
  gravity: number; // Z-axis gravity
  ambientTemperature: number;
  virusSpawnRate: number;
  worldScale: number; // Multiplier for world size
}
