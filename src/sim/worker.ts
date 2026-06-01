import { Engine } from './engine';
import { Particle, SimConfig } from './types';

// ═══════════════════════════════════════════════════════════════
// Genesis 2.0 Worker — WASM engine with automatic JS fallback
// ═══════════════════════════════════════════════════════════════

let mode: 'wasm' | 'js' = 'js';
let jsEngine: Engine | null = null;
let wasm: any = null;

let lastTime = performance.now();
let isRunning = false;
let speedMultiplier = 1;
let tickCount = 0;
let savedConfig: SimConfig | null = null;

const TARGET_FPS = 60;
const SEASON_NAMES = ['Spring', 'Summer', 'Autumn', 'Winter'];

// Static obstacles & zones (same as engine defaults)
const OBSTACLES = [
  { x: 300, y: 300, w: 20, h: 200 },
  { x: 800, y: 400, w: 200, h: 20 }
];
const ZONES = [
  { x: 200, y: 200, r: 100, type: 'toxic' as const },
  { x: 1000, y: 200, r: 150, type: 'shadow' as const },
  { x: 600, y: 600, r: 120, type: 'current' as const, dx: 50, dy: -20 }
];

// Track dynamically added obstacles/zones
let dynamicObstacles: typeof OBSTACLES = [];
let dynamicZones: { x: number; y: number; r: number; type: string }[] = [];

// ═══════════════════════════════════════════════════════════════
// WASM LOADING
// ═══════════════════════════════════════════════════════════════

async function loadWasm(config: SimConfig): Promise<boolean> {
  try {
    const { instantiate } = await import('./wasm-bindings.js');
    const response = await fetch('/genesis-engine.wasm');
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const buffer = await response.arrayBuffer();
    const module = await WebAssembly.compile(buffer);
    wasm = await instantiate(module);
    wasm.init(
      config.width, config.height, config.initialParticles, config.maxParticles,
      config.friction, config.repulsion, config.nutrientSpawnRate, config.mutationRate
    );
    mode = 'wasm';
    console.log('🚀 Genesis WASM engine loaded (55KB)');
    return true;
  } catch (e) {
    console.warn('⚠️ WASM unavailable, using JS engine:', e);
    return false;
  }
}

// ═══════════════════════════════════════════════════════════════
// TICK LOOP
// ═══════════════════════════════════════════════════════════════

function loop() {
  if (!isRunning) return;

  const now = performance.now();
  let dt = (now - lastTime) / 1000;
  lastTime = now;
  if (dt > 0.1) dt = 0.1;

  for (let i = 0; i < speedMultiplier; i++) {
    if (mode === 'wasm') {
      wasm.tick(dt);
    } else {
      jsEngine!.update(dt);
    }
  }

  tickCount++;
  if (mode === 'wasm') {
    sendWasmTick();
  } else {
    sendJsTick();
  }

  setTimeout(loop, 1000 / TARGET_FPS);
}

// ═══════════════════════════════════════════════════════════════
// WASM TICK — Extract data from WASM and send to main thread
// ═══════════════════════════════════════════════════════════════

function sendWasmTick() {
  const sendHeavy = tickCount % 15 === 0;

  // Pack render data — these return views into WASM memory, we must copy
  const pDataSrc = wasm.packParticleData();
  const pData = new Float32Array(pDataSrc.length);
  pData.set(pDataSrc);

  const nDataSrc = wasm.packNutrientData();
  const nData = new Float32Array(nDataSrc.length);
  nData.set(nDataSrc);

  const bDataSrc = wasm.packBondData();
  const bData = new Float32Array(bDataSrc.length);
  bData.set(bDataSrc);

  const sDataSrc = wasm.packSoundData();
  const sData = new Float32Array(sDataSrc.length);
  sData.set(sDataSrc);

  const vDataSrc = wasm.packVirusData();
  const vData = new Float32Array(vDataSrc.length);
  vData.set(vDataSrc);

  const pheroSrc = wasm.getPheromoneData();
  const phero = new Float32Array(pheroSrc.length);
  phero.set(pheroSrc);

  const payload: any = {
    particles: pData.buffer,
    nutrients: nData.buffer,
    bonds: bData.buffer,
    pheromones: phero.buffer,
    sounds: sData.buffer,
    viruses: vData.buffer,
    obstacles: [...OBSTACLES, ...dynamicObstacles],
    zones: [...ZONES, ...dynamicZones],
    season: SEASON_NAMES[wasm.getSeason()] || 'Spring',
    stats: {
      population: wasm.getParticleCount(),
      time: wasm.getSimTime(),
      avgEnergy: wasm.getAvgEnergy(),
      maxGeneration: wasm.getMaxGeneration(),
      avgComplexity: wasm.getAvgComplexity(),
      dayLight: wasm.getDayLight(),
      noveltyCount: wasm.getNoveltyCount(),
      speciesCount: wasm.getSpeciesCount(),
    },
  };

  if (sendHeavy) {
    // Unpack species history from packed Float64Array [id,parentId,r,g,b,timestamp,extinct,traitX,traitY] × N
    const shCount = wasm.getSpeciesHistoryCount();
    const shData = wasm.packSpeciesHistory();
    const speciesHistory = [];
    for (let i = 0; i < shCount; i++) {
      const o = i * 9;
      speciesHistory.push({
        id: shData[o], parentId: shData[o + 1],
        color: [shData[o + 2], shData[o + 3], shData[o + 4]] as [number, number, number],
        timestamp: shData[o + 5], extinct: shData[o + 6] !== 0,
        traitX: shData[o + 7], traitY: shData[o + 8],
      });
    }
    payload.speciesHistory = speciesHistory;

    // Unpack sim history from packed Float64Array [time,pop,avgEnergy,avgComplexity] × N
    const hCount = wasm.getHistoryCount();
    const hData = wasm.packHistory();
    const history = [];
    for (let i = 0; i < hCount; i++) {
      const o = i * 4;
      history.push({
        time: hData[o], population: hData[o + 1],
        avgEnergy: hData[o + 2], avgComplexity: hData[o + 3],
      });
    }
    payload.history = history;
  }

  const ctx: Worker = self as any;
  ctx.postMessage({ type: 'TICK', payload },
    [pData.buffer, nData.buffer, bData.buffer, sData.buffer, vData.buffer]);
}

// ═══════════════════════════════════════════════════════════════
// JS TICK — Original Engine path (unchanged logic)
// ═══════════════════════════════════════════════════════════════

function sendJsTick() {
  const engine = jsEngine!;
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
    bData[i * 2 + 0] = bonds[i].p1;
    bData[i * 2 + 1] = bonds[i].p2;
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

  const sendHeavy = tickCount % 15 === 0;
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
      ...(sendHeavy ? {
        speciesHistory: engine.state.speciesHistory,
        history: engine.state.history,
      } : {}),
    }
  }, [pData.buffer, nData.buffer, bData.buffer, sData.buffer, vData.buffer]);
}

// ═══════════════════════════════════════════════════════════════
// MESSAGE HANDLER
// ═══════════════════════════════════════════════════════════════

self.onmessage = async (e) => {
  const { type, payload } = e.data;
  const ctx: Worker = self as any;

  switch (type) {
    case 'INIT': {
      savedConfig = payload;
      // Try WASM first, fall back to JS
      const wasmOk = await loadWasm(payload);
      if (!wasmOk) {
        jsEngine = new Engine(payload);
        mode = 'js';
      }
      ctx.postMessage({ type: 'ENGINE_MODE', payload: mode });
      break;
    }

    case 'START':
      if (!isRunning) {
        isRunning = true;
        lastTime = performance.now();
        loop();
      }
      break;

    case 'PAUSE':
      isRunning = false;
      break;

    case 'RESET':
      tickCount = 0;
      dynamicObstacles = [];
      dynamicZones = [];
      if (mode === 'wasm') {
        wasm.resetEngine();
        if (!isRunning) {
          lastTime = performance.now();
          wasm.tick(0);
          sendWasmTick();
        }
      } else if (jsEngine) {
        jsEngine = new Engine(jsEngine.config);
        if (!isRunning) {
          lastTime = performance.now();
          jsEngine.update(0);
          loop();
        }
      }
      break;

    case 'SET_SPEED':
      speedMultiplier = payload;
      break;

    case 'SET_CONFIG':
      if (mode === 'wasm' && payload) {
        for (const key of Object.keys(payload)) {
          if (key === 'maxParticles') wasm.setMaxParticles(payload[key]);
          else if (key === 'friction') wasm.setConfig(0, payload[key]);
          else if (key === 'repulsion') wasm.setConfig(1, payload[key]);
          else if (key === 'nutrientSpawnRate') wasm.setConfig(2, payload[key]);
          else if (key === 'mutationRate') wasm.setConfig(3, payload[key]);
        }
      } else if (jsEngine && payload) {
        for (const key of Object.keys(payload)) {
          if (key in jsEngine.config) {
            (jsEngine.config as any)[key] = payload[key];
          }
        }
      }
      break;

    case 'GET_PARTICLE':
      if (mode === 'wasm') {
        const id = wasm.getClosestParticleId(payload.x, payload.y);
        // For WASM, we return minimal data (full genome is in WASM memory)
        ctx.postMessage({
          type: 'PARTICLE_DATA',
          payload: id >= 0 ? { id, x: payload.x, y: payload.y } : null
        });
      } else if (jsEngine) {
        const { x, y } = payload;
        let closest: Particle | null = null;
        let minDist = Infinity;
        for (const p of jsEngine.state.particles) {
          const d = (p.x - x) ** 2 + (p.y - y) ** 2;
          if (d < minDist && d < (p.radius + 10) ** 2) { minDist = d; closest = p; }
        }
        ctx.postMessage({ type: 'PARTICLE_DATA', payload: closest ? JSON.parse(JSON.stringify(closest)) : null });
      }
      break;

    case 'SAVE':
      if (mode === 'wasm') {
        // Pack full state from WASM for saving
        const state: any = {
          time: wasm.getSimTime(),
          width: savedConfig?.width || 1200,
          height: savedConfig?.height || 800,
          season: SEASON_NAMES[wasm.getSeason()],
          dayLight: wasm.getDayLight(),
          // Particle data
          _wasmParticleData: Array.from(wasm.packFullParticleData() as Float64Array),
          _wasmParticleCount: wasm.getParticleCount(),
          // Bond data
          _wasmBondData: Array.from(wasm.packBondData() as Float32Array),
          _wasmBondCount: wasm.getBondCount(),
          // Nutrients
          _wasmNutrientData: Array.from(wasm.packNutrientData() as Float32Array),
          _wasmNutrientCount: wasm.getNutrientCount(),
          _engineMode: 'wasm',
        };
        ctx.postMessage({ type: 'SAVE_DATA', payload: JSON.stringify(state) });
      } else if (jsEngine) {
        ctx.postMessage({ type: 'SAVE_DATA', payload: JSON.stringify(jsEngine.state) });
      }
      break;

    case 'LOAD':
      if (jsEngine && mode === 'js') {
        try {
          const state = JSON.parse(payload);
          if (state.pheromones) {
            const pArray = new Float32Array(Object.keys(state.pheromones).length);
            for (const key in state.pheromones) {
              pArray[key as any] = state.pheromones[key];
            }
            state.pheromones = pArray;
          }
          jsEngine.state = state;
          jsEngine.pheromonesBuffer2 = new Float32Array(state.pheromones.length);
          let maxId = 0;
          for (const p of state.particles) if (p.id > maxId) maxId = p.id;
          jsEngine.nextId = maxId + 1;
          tickCount = 0;
        } catch (err) { console.error("Failed to load state", err); }
      }
      // Note: WASM load would need a full state reconstruction — complex but doable
      break;

    case 'ADD_FOOD':
      if (mode === 'wasm') {
        wasm.spawnNutrientAt(payload.x, payload.y, 50);
      } else if (jsEngine) {
        jsEngine.spawnNutrient(payload.x, payload.y, 50);
      }
      break;

    case 'PAINT_PHEROMONE':
      if (mode === 'wasm') {
        wasm.addPheromoneCommand(payload.x, payload.y, payload.amount);
      } else if (jsEngine) {
        jsEngine.addPheromoneAt(payload.x, payload.y, payload.amount);
      }
      break;

    case 'SPAWN_VIRUS':
      if (mode === 'wasm') {
        wasm.spawnVirusAt(payload.x, payload.y);
      } else if (jsEngine) {
        jsEngine.state.viruses.push({
          x: payload.x, y: payload.y, radius: 3,
          genomePayload: jsEngine.randomGenome(), life: 10
        });
      }
      break;

    case 'KILL':
      if (mode === 'wasm') {
        wasm.killAt(payload.x, payload.y);
      } else if (jsEngine) {
        for (const p of jsEngine.state.particles) {
          if ((p.x - payload.x) ** 2 + (p.y - payload.y) ** 2 < 400) p.dead = true;
        }
      }
      break;

    case 'MOVE_PARTICLE':
      if (mode === 'wasm') {
        wasm.moveParticle(payload.id, payload.x, payload.y);
      } else if (jsEngine) {
        const p = jsEngine.state.particles.find((x: Particle) => x.id === payload.id);
        if (p) { p.x = payload.x; p.y = payload.y; p.vx = 0; p.vy = 0; }
      }
      break;

    case 'ADD_OBSTACLE':
      if (mode === 'wasm') {
        wasm.addObstacleAt(payload.x, payload.y);
        dynamicObstacles.push({ x: payload.x - 25, y: payload.y - 25, w: 50, h: 50 });
      } else if (jsEngine) {
        jsEngine.state.obstacles.push({ x: payload.x - 25, y: payload.y - 25, w: 50, h: 50 });
      }
      break;

    case 'ADD_ZONE':
      if (mode === 'wasm') {
        wasm.addZoneAt(payload.x, payload.y);
        dynamicZones.push({ x: payload.x, y: payload.y, r: 80, type: 'toxic' });
      } else if (jsEngine) {
        jsEngine.state.zones.push({ x: payload.x, y: payload.y, r: 80, type: 'toxic' });
      }
      break;

    case 'SPAWN_GENOME':
      // Complex — genome injection only supported in JS mode
      if (jsEngine && mode === 'js') {
        const genome = payload.genome;
        const id = jsEngine.nextId++;
        jsEngine.state.particles.push({
          id, x: payload.x, y: payload.y, vx: 0, vy: 0, angle: Math.random() * Math.PI * 2,
          radius: 4, energy: 100, age: 0, chem: new Array(8).fill(0), mem: 0, genome, dead: false,
          generation: 1, parentId: 0, organismId: id, speciesId: jsEngine.nextSpeciesId++,
          complexity: jsEngine.calculateComplexity(genome),
        });
      }
      break;
  }
};
