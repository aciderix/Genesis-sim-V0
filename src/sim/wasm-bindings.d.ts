export function instantiate(
  module: WebAssembly.Module,
  imports?: Record<string, any>
): Promise<{
  memory: WebAssembly.Memory;
  init(w: number, h: number, initialParticles: number, maxPart: number, fric: number, repul: number, nutrientRate: number, mutRate: number): void;
  tick(dt: number): void;
  setMaxParticles(v: number): void;
  setConfig(key: number, value: number): void;
  getParticleCount(): number;
  packParticleData(): Float32Array;
  getNutrientCount(): number;
  packNutrientData(): Float32Array;
  getBondCount(): number;
  packBondData(): Float32Array;
  getVirusCount(): number;
  packVirusData(): Float32Array;
  getSoundCount(): number;
  packSoundData(): Float32Array;
  getPheromoneData(): Float32Array;
  getObstacleCount(): number;
  getZoneCount(): number;
  getSimTime(): number;
  getSeason(): number;
  getDayLight(): number;
  getNoveltyCount(): number;
  getSpeciesCount(): number;
  getMaxGeneration(): number;
  getAvgEnergy(): number;
  getAvgComplexity(): number;
  getSpeciesHistoryCount(): number;
  packSpeciesHistory(): Float64Array;
  getHistoryCount(): number;
  packHistory(): Float64Array;
  spawnNutrientAt(x: number, y: number, amount: number): void;
  addPheromoneCommand(x: number, y: number, amount: number): void;
  spawnVirusAt(x: number, y: number): void;
  killAt(x: number, y: number): void;
  addObstacleAt(x: number, y: number): void;
  addZoneAt(x: number, y: number): void;
  getClosestParticleId(x: number, y: number): number;
  moveParticle(id: number, x: number, y: number): void;
  resetEngine(): void;
  getFullParticleDataSize(): number;
  packFullParticleData(): Float64Array;
}>;
