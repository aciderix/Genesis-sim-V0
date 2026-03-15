export const NUM_CHEMICALS = 8;

export interface Reaction {
  sub: number;
  prod: number;
  rate: number;
  energyDelta: number;
  inhibitor?: number;
}

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

export interface Brain {
  wIH: number[][]; // 9 inputs x 6 hidden
  wHO: number[][]; // 6 hidden x 9 outputs (added Bond)
}

export interface Genome {
  reactions: Reaction[];
  rules: Rule[]; // Kept for legacy/hybrid
  brain?: Brain; // Neural Network
  color: [number, number, number];
}

export interface Particle {
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  angle: number;
  radius: number;
  energy: number;
  age: number;
  chem: number[];
  mem: number; // Memory register
  genome: Genome;
  dead: boolean;
  generation: number;
  parentId: number;
  organismId: number;
  speciesId: number;
  complexity: number;
  role?: string; // e.g., 'Motor', 'Mouth', 'Weapon'
}

export interface Bond {
  p1: number;
  p2: number;
  optimalDistance: number;
  strength: number;
}

export interface Obstacle {
  x: number; y: number; w: number; h: number;
}

export interface Zone {
  x: number; y: number; r: number;
  type: 'toxic' | 'shadow' | 'current';
  dx?: number; dy?: number;
}

export interface Sound {
  x: number; y: number; volume: number; radius: number;
}

export interface SpeciesRecord {
  id: number;
  parentId: number;
  color: [number, number, number];
  timestamp: number;
  extinct: boolean;
  traitX: number; // For PCA / Genetic Map
  traitY: number;
}

export interface Virus {
  x: number;
  y: number;
  radius: number;
  genomePayload: Genome;
  life: number;
}

export interface SimHistory {
  time: number;
  population: number;
  avgEnergy: number;
  avgComplexity: number;
}

export interface SimState {
  particles: Particle[];
  bonds: Bond[];
  time: number;
  width: number;
  height: number;
  nutrients: { x: number; y: number; amount: number; isCorpse?: boolean }[];
  dayLight: number;
  season: string;
  viruses: Virus[];
  history: SimHistory[];
  noveltyArchive: any[];
  speciesHistory: SpeciesRecord[];
  pheromones: Float32Array;
  obstacles: Obstacle[];
  zones: Zone[];
  sounds: Sound[];
}

export interface SimConfig {
  width: number;
  height: number;
  initialParticles: number;
  maxParticles: number;
  friction: number;
  repulsion: number;
  nutrientSpawnRate: number;
  mutationRate: number;
}
