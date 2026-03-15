/**
 * Genesis CLI — Data Exporter
 * Exports simulation data to CSV or JSON format.
 */

import { SimState, Particle, SpeciesRecord, SimHistory } from '../sim/types';

// ─── CSV helpers ───────────────────────────────────────────────────────

function escapeCsvField(val: string | number | boolean): string {
  const s = String(val);
  if (s.includes(',') || s.includes('"') || s.includes('\n')) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function toCsv(headers: string[], rows: (string | number | boolean)[][]): string {
  const lines = [headers.map(escapeCsvField).join(',')];
  for (const row of rows) {
    lines.push(row.map(escapeCsvField).join(','));
  }
  return lines.join('\n') + '\n';
}

// ─── Export particles ──────────────────────────────────────────────────

export function exportParticles(particles: Particle[], format: 'csv' | 'json'): string {
  if (format === 'json') {
    return JSON.stringify(particles.map(p => ({
      id: p.id,
      x: round(p.x, 2),
      y: round(p.y, 2),
      vx: round(p.vx, 4),
      vy: round(p.vy, 4),
      angle: round(p.angle, 4),
      energy: round(p.energy, 2),
      age: round(p.age, 2),
      generation: p.generation,
      speciesId: p.speciesId,
      organismId: p.organismId,
      complexity: p.complexity,
      role: p.role || 'Unknown',
      color: p.genome.color,
      chem: p.chem.map(c => round(c, 4)),
      mem: round(p.mem, 4),
      reactionCount: p.genome.reactions.length,
      hasBrain: !!p.genome.brain,
    })), null, 2) + '\n';
  }

  const headers = ['id', 'x', 'y', 'vx', 'vy', 'angle', 'energy', 'age', 'generation', 'speciesId', 'organismId', 'complexity', 'role', 'color_r', 'color_g', 'color_b', 'mem', 'reactionCount', 'hasBrain'];
  const rows = particles.map(p => [
    p.id, round(p.x, 2), round(p.y, 2), round(p.vx, 4), round(p.vy, 4), round(p.angle, 4),
    round(p.energy, 2), round(p.age, 2), p.generation, p.speciesId, p.organismId, p.complexity,
    p.role || 'Unknown', p.genome.color[0], p.genome.color[1], p.genome.color[2],
    round(p.mem, 4), p.genome.reactions.length, !!p.genome.brain,
  ]);
  return toCsv(headers, rows);
}

// ─── Export species history ────────────────────────────────────────────

export function exportSpecies(species: SpeciesRecord[], format: 'csv' | 'json'): string {
  if (format === 'json') {
    return JSON.stringify(species, null, 2) + '\n';
  }

  const headers = ['id', 'parentId', 'color_r', 'color_g', 'color_b', 'timestamp', 'extinct', 'traitX', 'traitY'];
  const rows = species.map(s => [
    s.id, s.parentId, s.color[0], s.color[1], s.color[2],
    round(s.timestamp, 2), s.extinct, round(s.traitX, 4), round(s.traitY, 4),
  ]);
  return toCsv(headers, rows);
}

// ─── Export history (time series) ──────────────────────────────────────

export function exportHistory(history: SimHistory[], format: 'csv' | 'json'): string {
  if (format === 'json') {
    return JSON.stringify(history, null, 2) + '\n';
  }

  const headers = ['time', 'population', 'avgEnergy', 'avgComplexity'];
  const rows = history.map(h => [
    round(h.time, 2), h.population, round(h.avgEnergy, 2), round(h.avgComplexity, 2),
  ]);
  return toCsv(headers, rows);
}

// ─── Export genomes (brains weights) ───────────────────────────────────

export function exportGenomes(particles: Particle[], format: 'csv' | 'json'): string {
  const genomes = particles.map(p => ({
    particleId: p.id,
    speciesId: p.speciesId,
    generation: p.generation,
    color: p.genome.color,
    reactions: p.genome.reactions,
    brain: p.genome.brain ? {
      wIH: p.genome.brain.wIH,
      wHO: p.genome.brain.wHO,
    } : null,
  }));

  if (format === 'json') {
    return JSON.stringify(genomes, null, 2) + '\n';
  }

  // For CSV, flatten brain weights into a single row per genome
  const maxWeights = 9 * 6 + 6 * 9; // wIH + wHO
  const headers = ['particleId', 'speciesId', 'generation', 'color_r', 'color_g', 'color_b', 'reactionCount'];
  for (let i = 0; i < 54; i++) headers.push(`wIH_${i}`);
  for (let i = 0; i < 54; i++) headers.push(`wHO_${i}`);

  const rows = particles.map(p => {
    const row: (string | number | boolean)[] = [
      p.id, p.speciesId, p.generation, p.genome.color[0], p.genome.color[1], p.genome.color[2],
      p.genome.reactions.length,
    ];
    // Flatten wIH (9x6 = 54)
    if (p.genome.brain) {
      for (const r of p.genome.brain.wIH) for (const w of r) row.push(round(w, 6));
      for (const r of p.genome.brain.wHO) for (const w of r) row.push(round(w, 6));
    } else {
      for (let i = 0; i < 108; i++) row.push(0);
    }
    return row;
  });
  return toCsv(headers, rows);
}

// ─── Export full state summary ─────────────────────────────────────────

export function exportFullSummary(state: SimState, format: 'csv' | 'json'): string {
  const activeSpecies = new Set(state.particles.map(p => p.speciesId));
  const summary = {
    time: round(state.time, 2),
    population: state.particles.length,
    activeSpecies: activeSpecies.size,
    totalSpeciesEver: state.speciesHistory.length,
    extinctSpecies: state.speciesHistory.filter(s => s.extinct).length,
    nutrients: state.nutrients.length,
    viruses: state.viruses.length,
    bonds: state.bonds.length,
    obstacles: state.obstacles.length,
    zones: state.zones.length,
    season: state.season,
    dayLight: round(state.dayLight, 4),
    avgEnergy: state.particles.length > 0 ? round(state.particles.reduce((a, b) => a + b.energy, 0) / state.particles.length, 2) : 0,
    avgComplexity: state.particles.length > 0 ? round(state.particles.reduce((a, b) => a + b.complexity, 0) / state.particles.length, 2) : 0,
    maxGeneration: state.particles.length > 0 ? Math.max(...state.particles.map(p => p.generation)) : 0,
    avgAge: state.particles.length > 0 ? round(state.particles.reduce((a, b) => a + b.age, 0) / state.particles.length, 2) : 0,
  };

  if (format === 'json') {
    return JSON.stringify(summary, null, 2) + '\n';
  }

  const headers = Object.keys(summary);
  const rows = [Object.values(summary) as (string | number | boolean)[]];
  return toCsv(headers, rows);
}

// ─── Helpers ───────────────────────────────────────────────────────────

function round(n: number, decimals: number): number {
  const f = Math.pow(10, decimals);
  return Math.round(n * f) / f;
}
