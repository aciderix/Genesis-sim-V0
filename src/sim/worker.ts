import { Engine } from './engine';
import { Particle, SimConfig, TrophicLevel, NEURAL_OUTPUTS } from './types';

let engine: Engine | null = null;
let lastTime = performance.now();
let isRunning = false;
let speedMultiplier = 1;
let tickCount = 0;

const TARGET_FPS = 30;

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
  // 3D: x, y, z, radius, r, g, b, energy, id, trophicLevel = 10 floats per particle
  const pData = new Float32Array(particles.length * 10);
  let maxGen = 0;
  let totalEnergy = 0;
  let totalComplexity = 0;
  const speciesSet = new Set<number>();
  let autotrophs = 0, herbivores = 0, predators = 0, decomposers = 0;

  for (let i = 0; i < particles.length; i++) {
    const p = particles[i];
    const off = i * 10;
    pData[off + 0] = p.x;
    pData[off + 1] = p.y;
    pData[off + 2] = p.z;
    pData[off + 3] = p.radius;
    pData[off + 4] = p.genome.color[0] / 255;
    pData[off + 5] = p.genome.color[1] / 255;
    pData[off + 6] = p.genome.color[2] / 255;
    pData[off + 7] = p.energy;
    pData[off + 8] = p.id;
    pData[off + 9] = p.trophicLevel;

    if (p.generation > maxGen) maxGen = p.generation;
    totalEnergy += p.energy;
    totalComplexity += p.complexity;
    speciesSet.add(p.speciesId);

    switch (p.trophicLevel) {
      case TrophicLevel.Autotroph: autotrophs++; break;
      case TrophicLevel.Herbivore: herbivores++; break;
      case TrophicLevel.Predator: predators++; break;
      case TrophicLevel.Decomposer: decomposers++; break;
    }
  }

  const avgEnergy = particles.length > 0 ? totalEnergy / particles.length : 0;
  const avgComplexity = particles.length > 0 ? totalComplexity / particles.length : 0;

  const nutrients = engine.state.nutrients;
  const nData = new Float32Array(nutrients.length * 5);
  for (let i = 0; i < nutrients.length; i++) {
    const n = nutrients[i];
    nData[i * 5 + 0] = n.x;
    nData[i * 5 + 1] = n.y;
    nData[i * 5 + 2] = n.amount;
    nData[i * 5 + 3] = n.isCorpse ? 1 : 0;
    nData[i * 5 + 4] = n.z;
  }

  const bonds = engine.state.bonds;
  const bData = new Float32Array(bonds.length * 3);
  for (let i = 0; i < bonds.length; i++) {
    bData[i * 3 + 0] = bonds[i].p1;
    bData[i * 3 + 1] = bonds[i].p2;
    bData[i * 3 + 2] = bonds[i].type === 'structural' ? 0 : bonds[i].type === 'neural' ? 1 : 2;
  }

  const sounds = engine.state.sounds;
  const sData = new Float32Array(sounds.length * 5);
  for (let i = 0; i < sounds.length; i++) {
    sData[i * 5 + 0] = sounds[i].x;
    sData[i * 5 + 1] = sounds[i].y;
    sData[i * 5 + 2] = sounds[i].radius;
    sData[i * 5 + 3] = sounds[i].volume;
    sData[i * 5 + 4] = sounds[i].z;
  }

  const viruses = engine.state.viruses;
  const vData = new Float32Array(viruses.length * 4);
  for (let i = 0; i < viruses.length; i++) {
    vData[i * 4 + 0] = viruses[i].x;
    vData[i * 4 + 1] = viruses[i].y;
    vData[i * 4 + 2] = viruses[i].radius;
    vData[i * 4 + 3] = viruses[i].z;
  }

  tickCount++;
  const sendHeavyData = tickCount % 15 === 0;
  const sendPheromones = tickCount % 5 === 0;

  const ctx: Worker = self as any;
  ctx.postMessage({
    type: 'TICK',
    payload: {
      particles: pData.buffer,
      nutrients: nData.buffer,
      bonds: bData.buffer,
      pheromones: sendPheromones ? engine.state.pheromones.buffer.slice(0) : null,
      sounds: sData.buffer,
      viruses: vData.buffer,
      obstacles: engine.state.obstacles,
      zones: engine.state.zones,
      season: engine.state.season,
      enable3D: engine.config.enable3D,
      stats: {
        population: particles.length,
        time: engine.state.time,
        avgEnergy,
        maxGeneration: maxGen,
        avgComplexity,
        dayLight: engine.state.dayLight,
        noveltyCount: engine.state.noveltyArchive.length,
        speciesCount: speciesSet.size,
        autotrophs,
        herbivores,
        predators,
        decomposers,
        virusCount: viruses.length,
        bondCount: bonds.length,
        oxygenLevel: engine.state.oxygenLevel,
        co2Level: engine.state.co2Level,
        ambientTemp: engine.state.ambientTemperature,
        biomass: totalEnergy,
      },
      ...(sendHeavyData ? {
        speciesHistory: engine.state.speciesHistory,
        history: engine.state.history,
        temperature: engine.state.temperature.data.buffer.slice(0),
        temperatureCols: engine.state.temperature.cols,
        temperatureRows: engine.state.temperature.rows,
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
        tickCount = 0;
        if (!isRunning) { lastTime = performance.now(); engine.update(0); loop(); }
      }
      break;
    case 'SET_SPEED':
      speedMultiplier = payload;
      break;
    case 'SET_CONFIG':
      if (engine && payload) {
        for (const key of Object.keys(payload)) {
          if (key in engine.config) (engine.config as any)[key] = payload[key];
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
            for (const key in state.pheromones) pArray[key as any] = state.pheromones[key];
            state.pheromones = pArray;
          }
          // Restore temperature field
          if (state.temperature && !(state.temperature.data instanceof Float32Array)) {
            const tData = state.temperature.data;
            state.temperature.data = new Float32Array(Object.keys(tData).length);
            for (const key in tData) state.temperature.data[key as any] = tData[key];
          }
          // Restore morphogen field
          if (state.morphogens && !(state.morphogens.data instanceof Float32Array)) {
            const mData = state.morphogens.data;
            state.morphogens.data = new Float32Array(Object.keys(mData).length);
            for (const key in mData) state.morphogens.data[key as any] = mData[key];
          }
          engine.state = state;
          engine.pheromonesBuffer2 = new Float32Array(state.pheromones.length);
          let maxId = 0;
          for (const p of state.particles) if (p.id > maxId) maxId = p.id;
          engine.nextId = maxId + 1;
          tickCount = 0;
        } catch (err) { console.error("Failed to load state", err); }
      }
      break;
    case 'ADD_FOOD':
      if (engine) engine.spawnNutrient(payload.x, payload.y, 50);
      break;
    case 'PAINT_PHEROMONE':
      if (engine) engine.addPheromoneAt(payload.x, payload.y, payload.amount);
      break;
    case 'SPAWN_VIRUS':
      if (engine) engine.state.viruses.push({
        x: payload.x, y: payload.y, z: 0,
        radius: 3, genomePayload: { color: [255, 0, 0] },
        life: 10, mutationRate: 0.5,
        mhcTarget: Math.random() * 1e6 | 0,
        strain: engine.nextVirusStrain++
      });
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
      if (engine) engine.state.obstacles.push({ x: payload.x - 25, y: payload.y - 25, z: 0, w: 50, h: 50, d: 50 });
      break;
    case 'ADD_ZONE':
      if (engine) engine.state.zones.push({ x: payload.x, y: payload.y, z: 0, r: 80, type: 'toxic' });
      break;
    case 'ADD_THERMAL_VENT':
      if (engine) engine.state.zones.push({ x: payload.x, y: payload.y, z: 0, r: 60, type: 'thermal_vent', temperature: 80, intensity: 1.0 });
      break;
    case 'ADD_RADIATION':
      if (engine) engine.state.zones.push({ x: payload.x, y: payload.y, z: 0, r: 50, type: 'radiation', intensity: 0.5 });
      break;
    case 'SPAWN_GENOME':
      if (engine) {
        const genome = payload.genome;
        const id = engine.nextId++;
        engine.state.particles.push(engine.createParticle(id, genome, engine.nextSpeciesId++, {
          x: payload.x, y: payload.y, z: 0, energy: 100
        }));
      }
      break;
    case 'TOGGLE_ABIOGENESIS':
      if (engine) engine.state.abiogenesisMode = !engine.state.abiogenesisMode;
      break;
  }
};
