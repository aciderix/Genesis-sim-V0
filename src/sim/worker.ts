import { Engine } from './engine';
import { Particle, SimConfig } from './types';

let engine: Engine | null = null;
let lastTime = performance.now();
let isRunning = false;
let speedMultiplier = 1;
let tickCount = 0;
let lastSpeciesHistoryLen = 0;

const TARGET_FPS = 60;

function loop() {
  if (!isRunning || !engine) return;

  const now = performance.now();
  let dt = (now - lastTime) / 1000;
  lastTime = now;

  if (dt > 0.1) dt = 0.1;

  for (let i = 0; i < speedMultiplier; i++) {
    engine.update(dt);
  }

  const particles = engine.state.particles;
  const pData = new Float32Array(particles.length * 8);
  let maxGen = 0;
  let totalEnergy = 0;
  let totalComplexity = 0;
  const speciesSet = new Set<number>();
  
  for (let i = 0; i < particles.length; i++) {
    const p = particles[i];
    pData[i * 8 + 0] = p.x;
    pData[i * 8 + 1] = p.y;
    pData[i * 8 + 2] = p.radius;
    pData[i * 8 + 3] = p.genome.color[0] / 255;
    pData[i * 8 + 4] = p.genome.color[1] / 255;
    pData[i * 8 + 5] = p.genome.color[2] / 255;
    pData[i * 8 + 6] = p.energy;
    pData[i * 8 + 7] = p.id;
    
    if (p.generation > maxGen) maxGen = p.generation;
    totalEnergy += p.energy;
    totalComplexity += p.complexity;
    speciesSet.add(p.speciesId);
  }

  const avgEnergy = particles.length > 0 ? totalEnergy / particles.length : 0;
  const avgComplexity = particles.length > 0 ? totalComplexity / particles.length : 0;

  const nutrients = engine.state.nutrients;
  const nData = new Float32Array(nutrients.length * 4);
  for (let i = 0; i < nutrients.length; i++) {
    const n = nutrients[i];
    nData[i * 4 + 0] = n.x;
    nData[i * 4 + 1] = n.y;
    nData[i * 4 + 2] = n.amount;
    nData[i * 4 + 3] = n.isCorpse ? 1 : 0;
  }

  const bonds = engine.state.bonds;
  const bData = new Float32Array(bonds.length * 2);
  for (let i = 0; i < bonds.length; i++) {
    const b = bonds[i];
    bData[i * 2 + 0] = b.p1;
    bData[i * 2 + 1] = b.p2;
  }

  const sounds = engine.state.sounds;
  const sData = new Float32Array(sounds.length * 4);
  for (let i = 0; i < sounds.length; i++) {
    sData[i * 4 + 0] = sounds[i].x;
    sData[i * 4 + 1] = sounds[i].y;
    sData[i * 4 + 2] = sounds[i].radius;
    sData[i * 4 + 3] = sounds[i].volume;
  }

  const viruses = engine.state.viruses;
  const vData = new Float32Array(viruses.length * 3);
  for (let i = 0; i < viruses.length; i++) {
    vData[i * 3 + 0] = viruses[i].x;
    vData[i * 3 + 1] = viruses[i].y;
    vData[i * 3 + 2] = viruses[i].radius;
  }

  tickCount++;
  // Perf: only send heavy data (speciesHistory, history) every ~15 ticks (~4 FPS)
  const sendHeavyData = tickCount % 15 === 0;

  const ctx: Worker = self as any;
  ctx.postMessage({
    type: 'TICK',
    payload: {
      particles: pData.buffer,
      nutrients: nData.buffer,
      bonds: bData.buffer,
      pheromones: engine.state.pheromones.buffer.slice(0),
      sounds: sData.buffer,
      viruses: vData.buffer,
      obstacles: engine.state.obstacles,
      zones: engine.state.zones,
      season: engine.state.season,
      stats: {
        population: particles.length,
        time: engine.state.time,
        avgEnergy,
        maxGeneration: maxGen,
        avgComplexity,
        dayLight: engine.state.dayLight,
        noveltyCount: engine.state.noveltyArchive.length,
        speciesCount: speciesSet.size,
      },
      // Heavy data sent periodically to reduce serialization cost
      ...(sendHeavyData ? {
        speciesHistory: engine.state.speciesHistory,
        history: engine.state.history,
      } : {}),
    }
  }, [pData.buffer, nData.buffer, bData.buffer, sData.buffer, vData.buffer]);

  setTimeout(loop, 1000 / TARGET_FPS);
}

self.onmessage = (e) => {
  const { type, payload } = e.data;
  const ctx: Worker = self as any;

  switch (type) {
    case 'INIT':
      engine = new Engine(payload);
      break;
    case 'START':
      if (!isRunning) { isRunning = true; lastTime = performance.now(); loop(); }
      break;
    case 'PAUSE':
      isRunning = false;
      break;
    case 'RESET':
      if (engine) {
        engine = new Engine(engine.config);
        tickCount = 0; lastSpeciesHistoryLen = 0;
        if (!isRunning) { lastTime = performance.now(); engine.update(0); loop(); }
      }
      break;
    case 'SET_SPEED':
      speedMultiplier = payload;
      break;
    case 'SET_CONFIG':
      if (engine && payload) {
        for (const key of Object.keys(payload)) {
          if (key in engine.config) {
            (engine.config as any)[key] = payload[key];
          }
        }
      }
      break;
    case 'GET_PARTICLE':
      if (engine) {
        const { x, y } = payload;
        let closest: Particle | null = null;
        let minDist = Infinity;
        for (const p of engine.state.particles) {
          const d = (p.x - x) ** 2 + (p.y - y) ** 2;
          if (d < minDist && d < (p.radius + 10) ** 2) { minDist = d; closest = p; }
        }
        ctx.postMessage({ type: 'PARTICLE_DATA', payload: closest ? JSON.parse(JSON.stringify(closest)) : null });
      }
      break;
    case 'SAVE':
      if (engine) ctx.postMessage({ type: 'SAVE_DATA', payload: JSON.stringify(engine.state) });
      break;
    case 'LOAD':
      if (engine) {
        try {
          const state = JSON.parse(payload);
          
          if (state.pheromones) {
            const pArray = new Float32Array(Object.keys(state.pheromones).length);
            for (const key in state.pheromones) {
              pArray[key as any] = state.pheromones[key];
            }
            state.pheromones = pArray;
          }
          
          engine.state = state;
          engine.pheromonesBuffer2 = new Float32Array(state.pheromones.length);
          
          let maxId = 0;
          for(const p of state.particles) if(p.id > maxId) maxId = p.id;
          engine.nextId = maxId + 1;
          tickCount = 0; lastSpeciesHistoryLen = 0;
        } catch(err) { console.error("Failed to load state", err); }
      }
      break;
    case 'ADD_FOOD':
      if (engine) engine.spawnNutrient(payload.x, payload.y, 50);
      break;
    case 'PAINT_PHEROMONE':
      if (engine) engine.addPheromoneAt(payload.x, payload.y, payload.amount);
      break;
    case 'SPAWN_VIRUS':
      if (engine) engine.state.viruses.push({x: payload.x, y: payload.y, radius: 3, genomePayload: engine.randomGenome(), life: 10});
      break;
    case 'KILL':
      if (engine) {
        for (const p of engine.state.particles) {
          if ((p.x - payload.x) ** 2 + (p.y - payload.y) ** 2 < 400) p.dead = true;
        }
      }
      break;
    case 'MOVE_PARTICLE':
      if (engine) {
        const p = engine.state.particles.find(x => x.id === payload.id);
        if (p) { p.x = payload.x; p.y = payload.y; p.vx = 0; p.vy = 0; }
      }
      break;
    case 'ADD_OBSTACLE':
      if (engine) engine.state.obstacles.push({ x: payload.x - 25, y: payload.y - 25, w: 50, h: 50 });
      break;
    case 'ADD_ZONE':
      if (engine) engine.state.zones.push({ x: payload.x, y: payload.y, r: 80, type: 'toxic' });
      break;
    case 'SPAWN_GENOME':
      if (engine) {
        const genome = payload.genome;
        const id = engine.nextId++;
        engine.state.particles.push({
          id, x: payload.x, y: payload.y, vx: 0, vy: 0, angle: Math.random() * Math.PI * 2,
          radius: 4, energy: 100, age: 0, chem: new Array(8).fill(0), mem: 0, genome, dead: false,
          generation: 1, parentId: 0, organismId: id, speciesId: engine.nextSpeciesId++,
          complexity: engine.calculateComplexity(genome),
        });
      }
      break;
  }
};
