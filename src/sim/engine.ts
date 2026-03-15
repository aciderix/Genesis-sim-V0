import {
  ActionType, ConditionType, Genome, NUM_CHEMICALS, Particle,
  Reaction, Rule, SimConfig, SimState, SpeciesRecord, Brain
} from './types';

export const PHEROMONE_CELL_SIZE = 10;

function sigmoid(x: number) { return 1 / (1 + Math.exp(-x)); }

export class Engine {
  state: SimState;
  config: SimConfig;
  nextId: number = 1;
  nextSpeciesId: number = 1;
  pheromoneCols: number;
  pheromoneRows: number;
  pheromonesBuffer2: Float32Array;
  private gridCols: number;
  private gridRows: number;
  private grid: Particle[][];
  private nutrientGrid: { x: number; y: number; amount: number; isCorpse?: boolean }[][];

  constructor(config: SimConfig) {
    this.config = config;
    this.pheromoneCols = Math.ceil(config.width / PHEROMONE_CELL_SIZE);
    this.pheromoneRows = Math.ceil(config.height / PHEROMONE_CELL_SIZE);
    this.pheromonesBuffer2 = new Float32Array(this.pheromoneCols * this.pheromoneRows);
    this.gridCols = Math.ceil(config.width / 50);
    this.gridRows = Math.ceil(config.height / 50);
    const totalCells = this.gridCols * this.gridRows;
    this.grid = Array.from({ length: totalCells }, () => []);
    this.nutrientGrid = Array.from({ length: totalCells }, () => []);
    
    this.state = {
      particles: [], bonds: [], time: 0, width: config.width, height: config.height,
      nutrients: [], viruses: [], history: [], season: 'Spring', dayLight: 1.0, noveltyArchive: [], speciesHistory: [],
      pheromones: new Float32Array(this.pheromoneCols * this.pheromoneRows),
      obstacles: [
        { x: 300, y: 300, w: 20, h: 200 },
        { x: 800, y: 400, w: 200, h: 20 }
      ],
      zones: [
        { x: 200, y: 200, r: 100, type: 'toxic' },
        { x: 1000, y: 200, r: 150, type: 'shadow' },
        { x: 600, y: 600, r: 120, type: 'current', dx: 50, dy: -20 }
      ],
      sounds: []
    };
    this.init();
  }

  init() {
    for (let i = 0; i < this.config.initialParticles; i++) this.spawnRandomParticle();
    for (let i = 0; i < 100; i++) this.spawnNutrient();
  }

  spawnNutrient(x?: number, y?: number, amount?: number) {
    this.state.nutrients.push({
      x: x ?? Math.random() * this.config.width,
      y: y ?? Math.random() * this.config.height,
      amount: amount ?? (10 + Math.random() * 20),
    });
  }

  calculateComplexity(genome: Genome): number {
    let comp = 0;
    if (genome.brain) {
      for (const row of genome.brain.wIH) for (const w of row) comp += Math.abs(w);
      for (const row of genome.brain.wHO) for (const w of row) comp += Math.abs(w);
    }
    return Math.floor(comp);
  }

  randomBrain(): Brain {
    const wIH = Array.from({length: 9}, () => Array.from({length: 6}, () => (Math.random() - 0.5) * 2));
    const wHO = Array.from({length: 6}, () => Array.from({length: 9}, () => (Math.random() - 0.5) * 2));
    return { wIH, wHO };
  }

  randomGenome(): Genome {
    const reactions: Reaction[] = [];
    const numReactions = Math.floor(Math.random() * 3);
    for (let i = 0; i < numReactions; i++) {
      reactions.push({
        sub: Math.floor(Math.random() * NUM_CHEMICALS),
        prod: Math.floor(Math.random() * NUM_CHEMICALS),
        rate: Math.random() * 0.1,
        energyDelta: (Math.random() - 0.5) * 2,
        inhibitor: Math.random() > 0.8 ? Math.floor(Math.random() * NUM_CHEMICALS) : undefined,
      });
    }
    return {
      reactions,
      rules: [], // Legacy
      brain: this.randomBrain(),
      color: [Math.floor(Math.random() * 255), Math.floor(Math.random() * 255), Math.floor(Math.random() * 255)],
    };
  }

  getTraits(brain: Brain) {
    let tx = 0;
    for(let i=0; i<6; i++) tx += brain.wHO[i][2] + brain.wHO[i][3];
    let ty = 0;
    for(let i=0; i<6; i++) ty += brain.wHO[i][4] + brain.wHO[i][0];
    return { traitX: tx, traitY: ty };
  }

  // Perf: manual deep clone — much faster than JSON roundtrip
  cloneGenome(g: Genome): Genome {
    const reactions = g.reactions.map(r => {
      const c: Reaction = { sub: r.sub, prod: r.prod, rate: r.rate, energyDelta: r.energyDelta };
      if (r.inhibitor !== undefined) c.inhibitor = r.inhibitor;
      return c;
    });
    return {
      reactions,
      rules: [],
      brain: g.brain ? {
        wIH: g.brain.wIH.map(row => row.slice()),
        wHO: g.brain.wHO.map(row => row.slice()),
      } : undefined,
      color: [g.color[0], g.color[1], g.color[2]],
    };
  }

  spawnRandomParticle() {
    const genome = this.randomGenome();
    const speciesId = this.nextSpeciesId++;
    const traits = this.getTraits(genome.brain!);
    
    this.state.speciesHistory.push({
      id: speciesId, parentId: 0, color: [...genome.color] as [number, number, number],
      timestamp: this.state.time, extinct: false, traitX: traits.traitX, traitY: traits.traitY
    });

    const id = this.nextId++;
    this.state.particles.push({
      id,
      x: Math.random() * this.config.width, y: Math.random() * this.config.height,
      vx: 0, vy: 0, angle: Math.random() * Math.PI * 2, radius: 4,
      energy: 80 + Math.random() * 40, age: 0, chem: new Array(NUM_CHEMICALS).fill(0), mem: 0,
      genome, dead: false, generation: 1, parentId: 0, organismId: id, speciesId,
      complexity: this.calculateComplexity(genome),
    });
  }

  crossover(g1: Genome, g2: Genome): Genome {
    const b1 = g1.brain!; const b2 = g2.brain!;
    const wIH = b1.wIH.map((row, i) => row.map((w, j) => Math.random() > 0.5 ? w : b2.wIH[i][j]));
    const wHO = b1.wHO.map((row, i) => row.map((w, j) => {
      const w2 = (b2.wHO[i] && b2.wHO[i][j] !== undefined) ? b2.wHO[i][j] : w;
      return Math.random() > 0.5 ? w : w2;
    }));
    return {
      reactions: g1.reactions.map(r => {
        const c: Reaction = { sub: r.sub, prod: r.prod, rate: r.rate, energyDelta: r.energyDelta };
        if (r.inhibitor !== undefined) c.inhibitor = r.inhibitor;
        return c;
      }),
      rules: [],
      brain: { wIH, wHO },
      color: [
        Math.floor((g1.color[0] + g2.color[0]) / 2),
        Math.floor((g1.color[1] + g2.color[1]) / 2),
        Math.floor((g1.color[2] + g2.color[2]) / 2),
      ]
    };
  }

  mutateGenome(genome: Genome): Genome {
    const newGenome: Genome = this.cloneGenome(genome);
    newGenome.color[0] = Math.max(0, Math.min(255, newGenome.color[0] + (Math.random() - 0.5) * 50));
    newGenome.color[1] = Math.max(0, Math.min(255, newGenome.color[1] + (Math.random() - 0.5) * 50));
    newGenome.color[2] = Math.max(0, Math.min(255, newGenome.color[2] + (Math.random() - 0.5) * 50));

    if (newGenome.brain) {
      for (let i = 0; i < 9; i++) {
        for (let j = 0; j < 6; j++) {
          if (Math.random() < this.config.mutationRate) newGenome.brain.wIH[i][j] += (Math.random() - 0.5);
        }
      }
      for (let i = 0; i < 6; i++) {
        for (let j = 0; j < newGenome.brain.wHO[i].length; j++) {
          if (Math.random() < this.config.mutationRate) newGenome.brain.wHO[i][j] += (Math.random() - 0.5);
        }
      }
    }
    return newGenome;
  }

  reproduce(p: Particle, mate: Particle | null) {
    if (this.state.particles.length >= this.config.maxParticles) return;
    p.energy -= 40;
    if (mate) mate.energy -= 40;
    
    const childEnergy = mate ? 60 : 30;
    const baseGenome = mate ? this.crossover(p.genome, mate.genome) : p.genome;
    const finalGenome = this.mutateGenome(baseGenome);
    
    let isMutated = false;
    if (finalGenome.brain && p.genome.brain) {
      isMutated = Math.abs(finalGenome.brain.wHO[0][0] - p.genome.brain.wHO[0][0]) > 0.1;
    }
    
    let speciesId = p.speciesId;
    if (isMutated) {
      speciesId = this.nextSpeciesId++;
      const traits = this.getTraits(finalGenome.brain!);
      this.state.speciesHistory.push({
        id: speciesId, parentId: p.speciesId, color: [...finalGenome.color] as [number, number, number],
        timestamp: this.state.time, extinct: false, traitX: traits.traitX, traitY: traits.traitY
      });
    }

    const childId = this.nextId++;
    const child: Particle = {
      id: childId, x: p.x + (Math.random() - 0.5) * 10, y: p.y + (Math.random() - 0.5) * 10,
      vx: (Math.random() - 0.5) * 2, vy: (Math.random() - 0.5) * 2, angle: Math.random() * Math.PI * 2,
      radius: 4, energy: childEnergy, age: 0, chem: [...p.chem], mem: 0, genome: finalGenome,
      dead: false, generation: Math.max(p.generation, mate ? mate.generation : 0) + 1,
      parentId: p.id, organismId: childId, speciesId, complexity: this.calculateComplexity(finalGenome),
    };
    this.state.particles.push(child);
  }

  updateOrganisms() {
    const parent = new Map<number, number>();
    const find = (i: number): number => {
      if (!parent.has(i)) parent.set(i, i);
      if (parent.get(i) === i) return i;
      const root = find(parent.get(i)!);
      parent.set(i, root); return root;
    };
    const union = (i: number, j: number) => {
      const rootI = find(i); const rootJ = find(j);
      if (rootI !== rootJ) parent.set(rootI, rootJ);
    };
    for (const b of this.state.bonds) union(b.p1, b.p2);
    for (const p of this.state.particles) p.organismId = find(p.id);
  }

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
    if (cx >= 0 && cx < this.pheromoneCols && cy >= 0 && cy < this.pheromoneRows) {
      return this.state.pheromones[cy * this.pheromoneCols + cx];
    }
    return 0;
  }

  addPheromoneAt(x: number, y: number, amount: number) {
    const cx = Math.floor(x / PHEROMONE_CELL_SIZE);
    const cy = Math.floor(y / PHEROMONE_CELL_SIZE);
    if (cx >= 0 && cx < this.pheromoneCols && cy >= 0 && cy < this.pheromoneRows) {
      this.state.pheromones[cy * this.pheromoneCols + cx] += amount;
    }
  }

  update(dt: number) {
    this.state.time += dt;
    
    // Seasons
    const yearLength = 120; // 120 seconds per year
    const yearPhase = (this.state.time % yearLength) / yearLength;
    if (yearPhase < 0.25) this.state.season = 'Spring';
    else if (yearPhase < 0.5) this.state.season = 'Summer';
    else if (yearPhase < 0.75) this.state.season = 'Autumn';
    else this.state.season = 'Winter';

    let seasonTemp = 1.0;
    if (this.state.season === 'Winter') seasonTemp = 0.6;
    if (this.state.season === 'Summer') seasonTemp = 1.4;
    this.state.dayLight = (Math.sin((this.state.time / 60) * Math.PI * 2) * 0.5 + 0.5) * seasonTemp;

    this.updateOrganisms();
    this.updatePheromones(dt);

    for (let i = this.state.sounds.length - 1; i >= 0; i--) {
      const s = this.state.sounds[i];
      s.radius += dt * 200;
      s.volume -= dt * 2;
      if (s.volume <= 0) this.state.sounds.splice(i, 1);
    }

    if (Math.random() < this.config.nutrientSpawnRate * dt * seasonTemp) this.spawnNutrient();

    // Viruses
    if (Math.random() < 0.5 * dt) {
      this.state.viruses.push({
        x: Math.random() * this.config.width, y: Math.random() * this.config.height,
        radius: 3,
        genomePayload: this.randomGenome(),
        life: 10
      });
    }
    for (let i = this.state.viruses.length - 1; i >= 0; i--) {
      const v = this.state.viruses[i];
      v.life -= dt;
      v.x += (Math.random() - 0.5) * 50 * dt;
      v.y += (Math.random() - 0.5) * 50 * dt;
      
      if (v.x < 0) v.x = 0; if (v.x > this.config.width) v.x = this.config.width;
      if (v.y < 0) v.y = 0; if (v.y > this.config.height) v.y = this.config.height;

      if (v.life <= 0) {
        this.state.viruses.splice(i, 1);
        continue;
      }
      
      let hit = false;
      for (const p of this.state.particles) {
        if (!p.dead && (p.x - v.x)**2 + (p.y - v.y)**2 < (p.radius + v.radius)**2) {
          p.genome = this.mutateGenome(p.genome); // Virus mutates genome
          p.genome = this.mutateGenome(p.genome); // Double mutation for impact
          p.energy -= 20; // Sickness
          hit = true; break;
        }
      }
      if (hit) this.state.viruses.splice(i, 1);
    }

    if (Math.random() < 0.05 && this.state.particles.length > 0) {
      const avgEnergy = this.state.particles.reduce((a,b)=>a+b.energy,0)/this.state.particles.length;
      const avgComp = this.state.particles.reduce((a,b)=>a+b.complexity,0)/this.state.particles.length;
      const descriptor = { pop: this.state.particles.length, avgEnergy, avgComp };
      let minD = Infinity;
      for(const arch of this.state.noveltyArchive) {
        const d = Math.abs(arch.pop - descriptor.pop) + Math.abs(arch.avgEnergy - descriptor.avgEnergy) + Math.abs(arch.avgComp - descriptor.avgComp);
        if (d < minD) minD = d;
      }
      if (minD > 20 || this.state.noveltyArchive.length === 0) {
        this.state.noveltyArchive.push(descriptor);
        if (this.state.noveltyArchive.length > 500) this.state.noveltyArchive.shift();
        for (const p of this.state.particles) if (p.complexity >= avgComp) p.energy += 20;
      }
    }

    const gridSize = 50;
    const cols = this.gridCols;
    const rows = this.gridRows;
    
    // Perf: clear pre-allocated grids instead of creating new ones (avoids GC pressure)
    for (let i = 0; i < this.grid.length; i++) {
      this.grid[i].length = 0;
      this.nutrientGrid[i].length = 0;
    }
    const grid = this.grid;
    const nutrientGrid = this.nutrientGrid;
    const particleMap = new Map<number, Particle>();

    for (let i = 0; i < this.state.particles.length; i++) {
      const p = this.state.particles[i];
      if (p.dead) continue;
      particleMap.set(p.id, p);
      const gx = Math.max(0, Math.min(cols - 1, Math.floor(p.x / gridSize)));
      const gy = Math.max(0, Math.min(rows - 1, Math.floor(p.y / gridSize)));
      grid[gy * cols + gx].push(p);
    }
    
    for (let i = 0; i < this.state.nutrients.length; i++) {
      const n = this.state.nutrients[i];
      if (n.amount <= 0) continue;
      const gx = Math.max(0, Math.min(cols - 1, Math.floor(n.x / gridSize)));
      const gy = Math.max(0, Math.min(rows - 1, Math.floor(n.y / gridSize)));
      nutrientGrid[gy * cols + gx].push(n);
    }

    for (let i = 0; i < this.state.particles.length; i++) {
      const p = this.state.particles[i];
      if (p.dead) continue;

      p.age += dt;
      p.energy -= dt * 0.5;

      let localLight = this.state.dayLight;
      for (const z of this.state.zones) {
        const dSq = (p.x - z.x)**2 + (p.y - z.y)**2;
        if (dSq < z.r * z.r) {
          if (z.type === 'toxic') p.energy -= 10 * dt;
          else if (z.type === 'shadow') localLight = 0;
          else if (z.type === 'current') { p.x += z.dx! * dt; p.y += z.dy! * dt; }
        }
      }

      const greenness = p.genome.color[1] / 255;
      if (greenness > 0.5) p.energy += dt * localLight * (greenness - 0.5) * 2;

      for (const rx of p.genome.reactions) {
        if (rx.inhibitor !== undefined && p.chem[rx.inhibitor] > 0.5) continue;
        if (p.chem[rx.sub] > 0 && Math.random() < rx.rate * dt) {
          const amount = Math.min(p.chem[rx.sub], 1.0);
          p.chem[rx.sub] -= amount; p.chem[rx.prod] += amount;
          p.energy += rx.energyDelta * amount;
        }
      }

      let fCount = 0, mCount = 0, dCount = 0;
      let closestNutrient: typeof this.state.nutrients[0] | null = null;
      let closestNutrientDist = Infinity;
      let closestOther: Particle | null = null;
      let closestOtherDist = Infinity;
      
      const gx = Math.max(0, Math.min(cols - 1, Math.floor(p.x / gridSize)));
      const gy = Math.max(0, Math.min(rows - 1, Math.floor(p.y / gridSize)));
      
      for (let dx = -2; dx <= 2; dx++) {
        for (let dy = -2; dy <= 2; dy++) {
          const nx = gx + dx; const ny = gy + dy;
          if (nx >= 0 && nx < cols && ny >= 0 && ny < rows) {
            const idx = ny * cols + nx;
            
            const cellNutrients = nutrientGrid[idx];
            for (let j = 0; j < cellNutrients.length; j++) {
              const n = cellNutrients[j];
              const dX = n.x - p.x; const dY = n.y - p.y;
              const distSq = dX*dX + dY*dY;
              if (distSq < 10000) {
                let diff = Math.abs(Math.atan2(dY, dX) - p.angle);
                if (diff > Math.PI) diff = 2 * Math.PI - diff;
                if (diff < 0.5) fCount++;
              }
              if (distSq < closestNutrientDist) {
                closestNutrientDist = distSq;
                closestNutrient = n;
              }
            }
            
            const cellParticles = grid[idx];
            for (let j = 0; j < cellParticles.length; j++) {
              const other = cellParticles[j];
              if (other.id !== p.id && !other.dead) {
                const dX = other.x - p.x; const dY = other.y - p.y;
                const distSq = dX*dX + dY*dY;
                
                if (distSq < 10000) {
                  let diff = Math.abs(Math.atan2(dY, dX) - p.angle);
                  if (diff > Math.PI) diff = 2 * Math.PI - diff;
                  if (diff < 0.5) {
                    if (other.speciesId === p.speciesId) mCount++; else dCount++;
                  }
                }
                
                if (distSq < closestOtherDist) {
                  closestOtherDist = distSq;
                  closestOther = other;
                }

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
        }
      }

      let soundLevel = 0;
      for (const s of this.state.sounds) {
        const dSq = (p.x - s.x)**2 + (p.y - s.y)**2;
        if (dSq < s.radius**2 && dSq > (s.radius - 20)**2) soundLevel += s.volume;
      }

      if (p.genome.brain) {
        const inputs = [
          1.0, p.energy / 100, Math.min(p.age / 1000, 1.0),
          fCount > 0 ? 1 : 0, mCount > 0 ? 1 : 0, dCount > 0 ? 1 : 0,
          this.getPheromoneAt(p.x, p.y) / 100, p.mem, soundLevel
        ];

        const hidden = new Array(6).fill(0);
        for(let j=0; j<6; j++) {
          for(let k=0; k<9; k++) hidden[j] += inputs[k] * p.genome.brain.wIH[k][j];
          hidden[j] = Math.tanh(hidden[j]);
        }
        
        const outCount = p.genome.brain.wHO[0].length;
        const outputs = new Array(outCount).fill(0);
        for(let j=0; j<outCount; j++) {
          for(let k=0; k<6; k++) outputs[j] += hidden[k] * p.genome.brain.wHO[k][j];
        }

        const moveFwd = sigmoid(outputs[0]);
        const turn = Math.tanh(outputs[1]);
        
        p.vx += Math.cos(p.angle) * moveFwd * 2;
        p.vy += Math.sin(p.angle) * moveFwd * 2;
        p.angle += turn * dt * 5;
        p.energy -= moveFwd * dt * 0.1;

        if (sigmoid(outputs[2]) > 0.5 && closestNutrient) {
          if (closestNutrientDist < (p.radius + 5)**2) {
            const consume = Math.min(closestNutrient.amount, 20 * dt);
            closestNutrient.amount -= consume; p.energy += consume * 3; // Increased energy gain from 2 to 3
          }
        }
        if (sigmoid(outputs[3]) > 0.5 && p.energy > 80) {
          this.reproduce(p, null);
        }
        if (sigmoid(outputs[4]) > 0.5 && closestOther) {
          if (closestOtherDist < (p.radius + closestOther.radius + 5)**2 && closestOther.organismId !== p.organismId) {
            closestOther.energy -= 50 * dt; p.energy -= 10 * dt;
            if (closestOther.energy <= 0 && !closestOther.dead) { closestOther.dead = true; p.energy += 50; }
          }
        }
        if (sigmoid(outputs[5]) > 0.5) {
          this.addPheromoneAt(p.x, p.y, 100 * dt);
          p.energy -= dt * 0.5;
        }
        if (sigmoid(outputs[6]) > 0.5 && p.energy > 10) {
          this.state.sounds.push({ x: p.x, y: p.y, volume: 1.0, radius: 10 });
          p.energy -= 5;
        }
        p.mem = sigmoid(outputs[7]);
        
        // Bond (Output 8)
        if (outCount > 8 && sigmoid(outputs[8]) > 0.5 && closestOther) {
          if (closestOtherDist < (p.radius + closestOther.radius + 10)**2 && closestOther.organismId !== p.organismId) {
            let exists = false;
            for(let j=0; j<this.state.bonds.length; j++) {
              const b = this.state.bonds[j];
              if ((b.p1 === p.id && b.p2 === closestOther.id) || (b.p2 === p.id && b.p1 === closestOther.id)) {
                exists = true; break;
              }
            }
            if (!exists) {
              this.state.bonds.push({ p1: p.id, p2: closestOther.id, optimalDistance: p.radius + closestOther.radius + 2, strength: 0.1 });
              p.energy -= 5; // Bonding cost reduced from 50 to 5
            }
          }
        }
        // Assign Role based on highest output
        const roleNames = ['Motor', 'Turner', 'Mouth', 'Breeder', 'Weapon', 'Emitter', 'Vocal', 'Brain', 'Binder'];
        let maxOutIdx = 0;
        for(let j=1; j<outCount; j++) if(outputs[j] > outputs[maxOutIdx]) maxOutIdx = j;
        p.role = roleNames[maxOutIdx] || 'Unknown';
      }

      p.x += p.vx * dt; p.y += p.vy * dt;
      p.vx *= Math.pow(this.config.friction, dt * 60);
      p.vy *= Math.pow(this.config.friction, dt * 60);

      for (const o of this.state.obstacles) {
        if (p.x + p.radius > o.x && p.x - p.radius < o.x + o.w &&
            p.y + p.radius > o.y && p.y - p.radius < o.y + o.h) {
          if (p.x < o.x || p.x > o.x + o.w) p.vx *= -1;
          if (p.y < o.y || p.y > o.y + o.h) p.vy *= -1;
          p.x += p.vx * dt; p.y += p.vy * dt;
        }
      }

      if (p.x < 0) { p.x = 0; p.vx *= -1; }
      if (p.x > this.config.width) { p.x = this.config.width; p.vx *= -1; }
      if (p.y < 0) { p.y = 0; p.vy *= -1; }
      if (p.y > this.config.height) { p.y = this.config.height; p.vy *= -1; }

      // Winter is harsher
      const winterDrain = this.state.season === 'Winter' ? 1.5 : 0;
      if (p.energy <= 0 || p.age > 1000 - winterDrain * 200) {
        p.dead = true;
        this.state.nutrients.push({ x: p.x, y: p.y, amount: 50, isCorpse: true });
      }
    }

    // Filter out consumed nutrients and decay corpses
    for (const n of this.state.nutrients) {
      if (n.isCorpse) {
        n.amount -= dt * 2; // Corpses decay
        this.addPheromoneAt(n.x, n.y, -10 * dt); // Emit bad smell
        if (n.amount < 20) n.isCorpse = false; // Turns into normal food
      }
    }
    this.state.nutrients = this.state.nutrients.filter(n => n.amount > 0);

    for (let i = this.state.bonds.length - 1; i >= 0; i--) {
      const b = this.state.bonds[i];
      const p1 = particleMap.get(b.p1);
      const p2 = particleMap.get(b.p2);
      if (!p1 || !p2 || p1.dead || p2.dead) { this.state.bonds.splice(i, 1); continue; }

      const dx = p2.x - p1.x; const dy = p2.y - p1.y;
      const distSq = dx * dx + dy * dy;
      if (distSq > 0) {
        const dist = Math.sqrt(distSq);
        const force = (dist - b.optimalDistance) * b.strength;
        const nx = dx / dist; const ny = dy / dist;
        p1.vx += nx * force * dt * 50; p1.vy += ny * force * dt * 50;
        p2.vx -= nx * force * dt * 50; p2.vy -= ny * force * dt * 50;
        if (dist > b.optimalDistance * 3) { this.state.bonds.splice(i, 1); continue; }
        for (let c = 0; c < NUM_CHEMICALS; c++) {
          const diff = p2.chem[c] - p1.chem[c];
          const transfer = diff * 0.1 * dt;
          p1.chem[c] += transfer; p2.chem[c] -= transfer;
        }
      }
    }

    const activeSpecies = new Set(this.state.particles.map(p => p.speciesId));
    for (const s of this.state.speciesHistory) {
      if (!s.extinct && !activeSpecies.has(s.id)) s.extinct = true;
    }
    this.state.particles = this.state.particles.filter(p => !p.dead);

    // Record History (every 1 second approx)
    if (Math.floor(this.state.time) > Math.floor(this.state.time - dt)) {
      const avgEnergy = this.state.particles.length > 0 ? this.state.particles.reduce((a,b)=>a+b.energy,0)/this.state.particles.length : 0;
      const avgComp = this.state.particles.length > 0 ? this.state.particles.reduce((a,b)=>a+b.complexity,0)/this.state.particles.length : 0;
      this.state.history.push({ time: this.state.time, population: this.state.particles.length, avgEnergy, avgComplexity: avgComp });
      if (this.state.history.length > 200) this.state.history.shift();
    }
  }
}
