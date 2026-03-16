/**
 * Genesis CLI — Headless Simulation Runner
 * Runs the simulation engine directly in Node.js without any DOM or Web Worker.
 */

import { Engine } from '../sim/engine';
import { SimConfig, SimState, Particle } from '../sim/types';
import { SimSnapshot, printStatsLine } from './reporter';

export interface RunOptions {
  ticks: number;
  dt: number;
  speed: number;     // Speed multiplier: run N engine updates per tick (like web's speedMultiplier)
  config: SimConfig;
  interval: number;  // Print stats every N ticks (0 = silent)
  quiet: boolean;
  onTick?: (snap: SimSnapshot) => void;
}

export interface RunResult {
  engine: Engine;
  finalSnapshot: SimSnapshot;
  totalMs: number;
  ticksPerSec: number;
}

/**
 * Creates a snapshot of the current engine state for reporting.
 */
export function takeSnapshot(engine: Engine, tick: number): SimSnapshot {
  const state = engine.state;
  const particles = state.particles;
  const activeSpecies = new Set<number>();
  let totalEnergy = 0;
  let totalComplexity = 0;

  for (const p of particles) {
    activeSpecies.add(p.speciesId);
    totalEnergy += p.energy;
    totalComplexity += p.complexity;
  }

  return {
    tick,
    time: state.time,
    population: particles.length,
    species: activeSpecies.size,
    avgEnergy: particles.length > 0 ? totalEnergy / particles.length : 0,
    avgComplexity: particles.length > 0 ? totalComplexity / particles.length : 0,
    season: state.season,
    dayLight: state.dayLight,
    nutrients: state.nutrients.length,
    viruses: state.viruses.length,
    bonds: state.bonds.length,
  };
}

/**
 * Runs the simulation for a given number of ticks.
 * Returns the engine (with full state) and performance metrics.
 */
export function runSimulation(options: RunOptions): RunResult {
  const { ticks, dt, speed, config, interval, quiet, onTick } = options;
  const engine = new Engine(config);

  const startTime = performance.now();

  for (let tick = 1; tick <= ticks; tick++) {
    for (let s = 0; s < speed; s++) {
      engine.update(dt);
    }

    if (interval > 0 && tick % interval === 0) {
      const snap = takeSnapshot(engine, tick);
      if (!quiet) printStatsLine(snap, ticks);
      if (onTick) onTick(snap);
    }
  }

  const endTime = performance.now();
  const totalMs = endTime - startTime;
  const finalSnapshot = takeSnapshot(engine, ticks);

  return {
    engine,
    finalSnapshot,
    totalMs,
    ticksPerSec: (ticks / totalMs) * 1000,
  };
}

/**
 * Runs the simulation from a loaded state.
 */
export function runFromState(state: SimState, config: SimConfig, options: Omit<RunOptions, 'config'>): RunResult {
  const engine = new Engine(config);
  
  // Restore pheromones as Float32Array if loaded from JSON
  if (state.pheromones && !(state.pheromones instanceof Float32Array)) {
    const pArray = new Float32Array(Object.keys(state.pheromones).length);
    for (const key in state.pheromones as any) {
      pArray[key as any] = (state.pheromones as any)[key];
    }
    state.pheromones = pArray;
  }

  engine.state = state;
  engine.pheromonesBuffer2 = new Float32Array(state.pheromones.length);

  // Restore nextId
  let maxId = 0;
  for (const p of state.particles) if (p.id > maxId) maxId = p.id;
  engine.nextId = maxId + 1;

  // Restore nextSpeciesId
  let maxSpeciesId = 0;
  for (const s of state.speciesHistory) if (s.id > maxSpeciesId) maxSpeciesId = s.id;
  engine.nextSpeciesId = maxSpeciesId + 1;

  const { ticks, dt, speed, interval, quiet, onTick } = options;
  const startTime = performance.now();

  for (let tick = 1; tick <= ticks; tick++) {
    for (let s = 0; s < speed; s++) {
      engine.update(dt);
    }

    if (interval > 0 && tick % interval === 0) {
      const snap = takeSnapshot(engine, tick);
      if (!quiet) printStatsLine(snap, ticks);
      if (onTick) onTick(snap);
    }
  }

  const endTime = performance.now();
  const totalMs = endTime - startTime;
  const finalSnapshot = takeSnapshot(engine, ticks);

  return {
    engine,
    finalSnapshot,
    totalMs,
    ticksPerSec: (ticks / totalMs) * 1000,
  };
}

/**
 * Default simulation config — matches the web app's defaults.
 */
export function defaultConfig(overrides?: Partial<SimConfig>): SimConfig {
  return {
    width: 1200,
    height: 800,
    depth: 400,
    initialParticles: 300,
    maxParticles: 2000,
    friction: 0.92,
    repulsion: 20.0,
    nutrientSpawnRate: 10.0,
    mutationRate: 0.1,
    enable3D: false,
    enableAbiogenesis: false,
    enableImmuneSystem: true,
    enableEpigenetics: true,
    enableMorphogens: true,
    enableTemperature: true,
    enableTrophicLevels: true,
    gravity: 0.5,
    ambientTemperature: 25,
    virusSpawnRate: 0.5,
    worldScale: 1.0,
    ...overrides,
  };
}
