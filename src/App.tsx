import React, { useEffect, useRef, useState } from 'react';
import { Play, Pause, RotateCcw, Activity, Info, Save, Upload, Sun, Moon, MousePointer2, Apple, Skull, Hand, Edit3, GitMerge, X, Mountain, Biohazard, Download, Map as MapIcon, FastForward, Bug, Droplet, Snowflake, Leaf, Thermometer, Shield, Dna, Flame, Zap, Eye } from 'lucide-react';
import { Particle, SpeciesRecord, Obstacle, Zone, Genome, TrophicLevel } from './sim/types';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, ScatterChart, Scatter, ZAxis, AreaChart, Area } from 'recharts';

interface SimStats {
  population: number; time: number; avgEnergy: number; maxGeneration: number;
  avgComplexity: number; dayLight: number; noveltyCount: number; speciesCount: number;
  autotrophs: number; herbivores: number; predators: number; decomposers: number;
  virusCount: number; bondCount: number; oxygenLevel: number; co2Level: number;
  ambientTemp: number; biomass: number;
}

type ToolType = 'inspect' | 'food' | 'kill' | 'drag' | 'obstacle' | 'zone' | 'import' | 'virus' | 'pheromone' | 'thermal_vent' | 'radiation';

const TROPHIC_COLORS: Record<string, string> = {
  Autotroph: '#22c55e',
  Herbivore: '#eab308',
  Predator: '#ef4444',
  Decomposer: '#a855f7',
  Parasite: '#f97316',
};

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const workerRef = useRef<Worker | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [simSpeed, setSimSpeed] = useState(1);
  const [stats, setStats] = useState<SimStats>({
    population: 0, time: 0, avgEnergy: 0, maxGeneration: 0, avgComplexity: 0,
    dayLight: 1, noveltyCount: 0, speciesCount: 0, autotrophs: 0, herbivores: 0,
    predators: 0, decomposers: 0, virusCount: 0, bondCount: 0, oxygenLevel: 0.21,
    co2Level: 0.04, ambientTemp: 25, biomass: 0
  });
  const [history, setHistory] = useState<any[]>([]);
  const [season, setSeason] = useState('Spring');
  const [selectedParticleId, setSelectedParticleId] = useState<number | null>(null);
  const [selectedParticleData, setSelectedParticleData] = useState<Particle | null>(null);
  const [activeTool, setActiveTool] = useState<ToolType>('inspect');
  const pheromoneCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const spriteCache = useRef<Map<string, HTMLCanvasElement>>(new Map());
  const [maxParticles, setMaxParticles] = useState(2000);
  const [showTree, setShowTree] = useState(false);
  const [showMap, setShowMap] = useState(false);
  const [showEcology, setShowEcology] = useState(false);
  const [speciesHistory, setSpeciesHistory] = useState<SpeciesRecord[]>([]);
  const [enable3D, setEnable3D] = useState(false);

  const transformRef = useRef({ x: 0, y: 0, scale: 1 });
  const selectedParticleIdRef = useRef<number | null>(null);
  const lastReactUpdateRef = useRef(0);
  const isDragging = useRef(false);
  const isToolActive = useRef(false);
  const lastPos = useRef({ x: 0, y: 0 });

  const width = 1200;
  const height = 800;

  useEffect(() => { selectedParticleIdRef.current = selectedParticleId; }, [selectedParticleId]);

  useEffect(() => {
    const worker = new Worker(new URL('./sim/worker.ts', import.meta.url), { type: 'module' });
    workerRef.current = worker;

    worker.postMessage({
      type: 'INIT',
      payload: {
        width, height, depth: 400,
        initialParticles: 300, maxParticles: 2000,
        friction: 0.92, repulsion: 20.0,
        nutrientSpawnRate: 10.0, mutationRate: 0.1,
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
        worldScale: 1.0
      }
    });

    worker.onmessage = (e) => {
      const { type, payload } = e.data;
      if (type === 'TICK') {
        render(payload);
        const now = performance.now();
        if (now - lastReactUpdateRef.current > 250) {
          lastReactUpdateRef.current = now;
          setStats(payload.stats);
          setSeason(payload.season);
          if (payload.enable3D !== undefined) setEnable3D(payload.enable3D);
          setHistory(prev => {
            if (prev.length === 0 || payload.stats.time - prev[prev.length - 1].time >= 1) {
              const newHistory = [...prev, payload.stats];
              if (newHistory.length > 100) newHistory.shift();
              return newHistory;
            }
            return prev;
          });
        }
        if (payload.speciesHistory) setSpeciesHistory(payload.speciesHistory);
      } else if (type === 'PARTICLE_DATA') {
        setSelectedParticleData(payload);
        setSelectedParticleId(payload ? payload.id : null);
      } else if (type === 'SAVE_DATA') {
        const blob = new Blob([payload], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a'); a.href = url; a.download = 'genesis_save.json'; a.click();
      }
    };

    worker.postMessage({ type: 'START' });
    setIsPlaying(true);
    return () => worker.terminate();
  }, []);

  const render = (payload: any) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const transform = transformRef.current;
    const selId = selectedParticleIdRef.current;

    const bgLight = Math.floor(payload.stats.dayLight * 30);
    ctx.fillStyle = `rgb(${bgLight}, ${bgLight}, ${Math.floor(bgLight * 1.2)})`;
    ctx.fillRect(0, 0, width, height);

    const viewLeft = -transform.x / transform.scale;
    const viewTop = -transform.y / transform.scale;
    const viewRight = viewLeft + canvas.width / transform.scale;
    const viewBottom = viewTop + canvas.height / transform.scale;
    const margin = 50;

    ctx.save();
    ctx.translate(transform.x, transform.y);
    ctx.scale(transform.scale, transform.scale);

    // Pheromones (only update texture when new data arrives, reuse cached canvas otherwise)
    const PHEROMONE_CELL_SIZE = 10;
    const cols = Math.ceil(width / PHEROMONE_CELL_SIZE);
    const rows = Math.ceil(height / PHEROMONE_CELL_SIZE);
    if (!pheromoneCanvasRef.current) {
      pheromoneCanvasRef.current = document.createElement('canvas');
      pheromoneCanvasRef.current.width = cols;
      pheromoneCanvasRef.current.height = rows;
    }
    const pCanvas = pheromoneCanvasRef.current;
    if (payload.pheromones) {
      const pCtx = pCanvas.getContext('2d');
      if (pCtx) {
        const pData = new Float32Array(payload.pheromones);
        const imgData = pCtx.createImageData(cols, rows);
        for (let i = 0; i < Math.min(pData.length, cols * rows); i++) {
          const val = pData[i];
          const idx = i * 4;
          imgData.data[idx] = 139;
          imgData.data[idx + 1] = 92;
          imgData.data[idx + 2] = 246;
          imgData.data[idx + 3] = Math.min(val * 2, 128);
        }
        pCtx.putImageData(imgData, 0, 0);
      }
    }
    ctx.globalAlpha = 0.6;
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(pCanvas, 0, 0, width, height);
    ctx.globalAlpha = 1.0;

    // Grid
    ctx.strokeStyle = `rgba(255, 255, 255, ${0.03 + payload.stats.dayLight * 0.03})`;
    ctx.lineWidth = 1 / transform.scale;
    for (let i = 0; i <= width; i += 50) {
      if (i >= viewLeft - margin && i <= viewRight + margin) {
        ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, height); ctx.stroke();
      }
    }
    for (let i = 0; i <= height; i += 50) {
      if (i >= viewTop - margin && i <= viewBottom + margin) {
        ctx.beginPath(); ctx.moveTo(0, i); ctx.lineTo(width, i); ctx.stroke();
      }
    }

    // Zones
    for (const z of (payload.zones as Zone[])) {
      ctx.beginPath(); ctx.arc(z.x, z.y, z.r, 0, Math.PI * 2);
      if (z.type === 'toxic') ctx.fillStyle = 'rgba(239, 68, 68, 0.2)';
      else if (z.type === 'shadow') ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
      else if (z.type === 'current') ctx.fillStyle = 'rgba(59, 130, 246, 0.2)';
      else if (z.type === 'thermal_vent') ctx.fillStyle = 'rgba(255, 140, 0, 0.3)';
      else if (z.type === 'radiation') ctx.fillStyle = 'rgba(255, 255, 0, 0.15)';
      else if (z.type === 'nutrient_rich') ctx.fillStyle = 'rgba(34, 197, 94, 0.15)';
      ctx.fill();
      // Zone labels
      ctx.fillStyle = 'rgba(255,255,255,0.3)';
      ctx.font = `${10 / transform.scale}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.fillText(z.type.replace('_', ' '), z.x, z.y - z.r - 5 / transform.scale);
    }

    // Obstacles
    ctx.fillStyle = '#333'; ctx.strokeStyle = '#555'; ctx.lineWidth = 2 / transform.scale;
    for (const o of (payload.obstacles as Obstacle[])) {
      ctx.fillRect(o.x, o.y, o.w, o.h); ctx.strokeRect(o.x, o.y, o.w, o.h);
    }

    // Sounds
    const sounds = new Float32Array(payload.sounds);
    ctx.lineWidth = 1 / transform.scale;
    for (let i = 0; i < sounds.length; i += 5) {
      const vol = sounds[i + 3];
      ctx.strokeStyle = `rgba(255, 255, 255, ${vol * 0.15})`;
      ctx.beginPath(); ctx.arc(sounds[i], sounds[i+1], sounds[i+2], 0, Math.PI * 2); ctx.stroke();
    }

    // Nutrients
    const nutrients = new Float32Array(payload.nutrients);
    for (let i = 0; i < nutrients.length; i += 5) {
      const x = nutrients[i], y = nutrients[i+1];
      if (x < viewLeft - margin || x > viewRight + margin || y < viewTop - margin || y > viewBottom + margin) continue;
      const amount = nutrients[i + 2];
      const isCorpse = nutrients[i + 3] === 1;
      const radius = Math.sqrt(amount);
      const colorKey = isCorpse ? 'corpse' : 'nutrient';
      let sprite = spriteCache.current.get(colorKey);
      if (!sprite) {
        sprite = document.createElement('canvas');
        sprite.width = 32; sprite.height = 32;
        const sCtx = sprite.getContext('2d')!;
        sCtx.fillStyle = isCorpse ? '#78350f' : '#22c55e';
        sCtx.beginPath(); sCtx.arc(16, 16, 14, 0, Math.PI * 2); sCtx.fill();
        spriteCache.current.set(colorKey, sprite);
      }
      ctx.drawImage(sprite, x - radius, y - radius, radius * 2, radius * 2);
    }

    // Viruses
    if (payload.viruses) {
      const viruses = new Float32Array(payload.viruses);
      ctx.fillStyle = '#ef4444';
      for (let i = 0; i < viruses.length; i += 4) {
        const vx = viruses[i], vy = viruses[i + 1], vr = viruses[i + 2];
        ctx.beginPath();
        for (let j = 0; j < 8; j++) {
          const angle = (j / 8) * Math.PI * 2;
          const r = j % 2 === 0 ? vr : vr * 0.5;
          if (j === 0) ctx.moveTo(vx + Math.cos(angle) * r, vy + Math.sin(angle) * r);
          else ctx.lineTo(vx + Math.cos(angle) * r, vy + Math.sin(angle) * r);
        }
        ctx.closePath(); ctx.fill();
      }
    }

    // Particles (with trophic-colored rings)
    const particles = new Float32Array(payload.particles);
    const positions = new Map<number, {x: number, y: number}>();

    for (let i = 0; i < particles.length; i += 10) {
      const x = particles[i], y = particles[i + 1], radius = particles[i + 3];
      const id = particles[i + 8];
      const trophic = particles[i + 9];
      positions.set(id, { x, y });

      if (x < viewLeft - margin || x > viewRight + margin || y < viewTop - margin || y > viewBottom + margin) continue;

      const r = Math.floor(particles[i + 4] * 255);
      const g = Math.floor(particles[i + 5] * 255);
      const b = Math.floor(particles[i + 6] * 255);
      const colorKey = `p_${r}_${g}_${b}`;

      let sprite = spriteCache.current.get(colorKey);
      if (!sprite) {
        sprite = document.createElement('canvas');
        sprite.width = 32; sprite.height = 32;
        const sCtx = sprite.getContext('2d')!;
        sCtx.fillStyle = `rgb(${r},${g},${b})`;
        sCtx.beginPath(); sCtx.arc(16, 16, 14, 0, Math.PI * 2); sCtx.fill();
        sCtx.fillStyle = 'rgba(255,255,255,0.3)';
        sCtx.beginPath(); sCtx.arc(12, 12, 4, 0, Math.PI * 2); sCtx.fill();
        spriteCache.current.set(colorKey, sprite);
      }
      ctx.drawImage(sprite, x - radius, y - radius, radius * 2, radius * 2);

      // Trophic ring
      if (trophic >= 2) {
        const trophicColors = ['', '#22c55e', '#eab308', '#ef4444', '#a855f7', '#f97316'];
        ctx.strokeStyle = trophicColors[trophic] || '#fff';
        ctx.lineWidth = 1.5 / transform.scale;
        ctx.beginPath(); ctx.arc(x, y, radius + 2, 0, Math.PI * 2); ctx.stroke();
      }

      if (id === selId) {
        ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 2 / transform.scale;
        ctx.beginPath(); ctx.arc(x, y, radius + 5, 0, Math.PI * 2); ctx.stroke();
      }
    }

    // Bonds (batched by type for fewer state changes)
    const bonds = new Float32Array(payload.bonds);
    ctx.lineWidth = 2 / transform.scale;
    const bondColors = ['rgba(255,255,255,0.3)', 'rgba(59,130,246,0.5)', 'rgba(239,68,68,0.4)'];
    for (let bType = 0; bType < 3; bType++) {
      ctx.strokeStyle = bondColors[bType];
      ctx.beginPath();
      for (let i = 0; i < bonds.length; i += 3) {
        if (bonds[i + 2] !== bType) continue;
        const p1 = positions.get(bonds[i]), p2 = positions.get(bonds[i + 1]);
        if (p1 && p2) { ctx.moveTo(p1.x, p1.y); ctx.lineTo(p2.x, p2.y); }
      }
      ctx.stroke();
    }
    ctx.restore();
  };

  const getSimCoords = (e: React.MouseEvent | React.WheelEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const t = transformRef.current;
    return {
      x: ((e.clientX - rect.left) * scaleX - t.x) / t.scale,
      y: ((e.clientY - rect.top) * scaleY - t.y) / t.scale
    };
  };

  const handleCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (isDragging.current) return;
    const simPos = getSimCoords(e);
    if (activeTool === 'inspect') workerRef.current?.postMessage({ type: 'GET_PARTICLE', payload: simPos });
    else if (activeTool === 'obstacle') workerRef.current?.postMessage({ type: 'ADD_OBSTACLE', payload: simPos });
    else if (activeTool === 'zone') workerRef.current?.postMessage({ type: 'ADD_ZONE', payload: simPos });
    else if (activeTool === 'thermal_vent') workerRef.current?.postMessage({ type: 'ADD_THERMAL_VENT', payload: simPos });
    else if (activeTool === 'radiation') workerRef.current?.postMessage({ type: 'ADD_RADIATION', payload: simPos });
    else if (activeTool === 'import') handleImportGenome(simPos);
  };

  const handleWheel = (e: React.WheelEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const scaleAdjust = e.deltaY > 0 ? 0.9 : 1.1;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const mouseX = (e.clientX - rect.left) * (canvas.width / rect.width);
    const mouseY = (e.clientY - rect.top) * (canvas.height / rect.height);
    const prev = transformRef.current;
    const newScale = Math.max(0.1, Math.min(prev.scale * scaleAdjust, 10));
    transformRef.current = { x: prev.x + (mouseX - prev.x) * (1 - scaleAdjust), y: prev.y + (mouseY - prev.y) * (1 - scaleAdjust), scale: newScale };
  };

  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    isDragging.current = false; isToolActive.current = true; lastPos.current = { x: e.clientX, y: e.clientY };
    const simPos = getSimCoords(e);
    if (activeTool === 'inspect' || activeTool === 'drag') workerRef.current?.postMessage({ type: 'GET_PARTICLE', payload: simPos });
    else if (activeTool === 'food') workerRef.current?.postMessage({ type: 'ADD_FOOD', payload: simPos });
    else if (activeTool === 'kill') workerRef.current?.postMessage({ type: 'KILL', payload: simPos });
    else if (activeTool === 'virus') workerRef.current?.postMessage({ type: 'SPAWN_VIRUS', payload: simPos });
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (e.buttons === 1) {
      isDragging.current = true;
      if (activeTool === 'inspect') {
        const dx = e.clientX - lastPos.current.x, dy = e.clientY - lastPos.current.y;
        lastPos.current = { x: e.clientX, y: e.clientY };
        const canvas = canvasRef.current;
        if (!canvas) return;
        const prev = transformRef.current;
        transformRef.current = { ...prev, x: prev.x + dx * (canvas.width / canvas.getBoundingClientRect().width), y: prev.y + dy * (canvas.height / canvas.getBoundingClientRect().height) };
      } else if (isToolActive.current) {
        const simPos = getSimCoords(e);
        if (activeTool === 'food') workerRef.current?.postMessage({ type: 'ADD_FOOD', payload: simPos });
        if (activeTool === 'kill') workerRef.current?.postMessage({ type: 'KILL', payload: simPos });
        if (activeTool === 'drag' && selectedParticleId) workerRef.current?.postMessage({ type: 'MOVE_PARTICLE', payload: { id: selectedParticleId, ...simPos } });
        if (activeTool === 'pheromone') workerRef.current?.postMessage({ type: 'PAINT_PHEROMONE', payload: { ...simPos, amount: 50 } });
      }
    }
  };

  const handleMouseUp = () => isToolActive.current = false;
  const togglePlay = () => { workerRef.current?.postMessage({ type: isPlaying ? 'PAUSE' : 'START' }); setIsPlaying(!isPlaying); };
  const handleSpeedChange = () => {
    const nextSpeed = simSpeed === 1 ? 2 : simSpeed === 2 ? 5 : simSpeed === 5 ? 10 : 1;
    setSimSpeed(nextSpeed);
    workerRef.current?.postMessage({ type: 'SET_SPEED', payload: nextSpeed });
  };
  const resetSim = () => { workerRef.current?.postMessage({ type: 'RESET' }); if (isPlaying) workerRef.current?.postMessage({ type: 'START' }); setSelectedParticleId(null); setSelectedParticleData(null); transformRef.current = { x: 0, y: 0, scale: 1 }; };
  const handleSave = () => workerRef.current?.postMessage({ type: 'SAVE' });
  const handleLoad = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (evt) => workerRef.current?.postMessage({ type: 'LOAD', payload: evt.target?.result });
    reader.readAsText(file);
  };
  const handleExportGenome = () => {
    if (!selectedParticleData) return;
    const blob = new Blob([JSON.stringify(selectedParticleData.genome, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = `genome_${selectedParticleData.speciesId}.json`; a.click();
  };
  const handleImportGenome = async (pos: {x: number, y: number}) => {
    try {
      let text = '';
      try { text = await navigator.clipboard.readText(); } catch { text = prompt("Paste genome JSON:") || ''; }
      if (!text) return;
      const genome = JSON.parse(text) as Genome;
      if (genome.brain || genome.dna) workerRef.current?.postMessage({ type: 'SPAWN_GENOME', payload: { x: pos.x, y: pos.y, genome } });
    } catch { alert("Invalid genome JSON!"); }
  };

  const trophicName = (t: TrophicLevel) => ['Molecule', 'Autotroph', 'Herbivore', 'Predator', 'Decomposer', 'Parasite'][t] || 'Unknown';

  const pcaData = speciesHistory.filter(s => !s.extinct).map(s => ({
    x: s.traitX, y: s.traitY, z: 1, name: `Species ${s.id}`, fill: `rgb(${s.color.join(',')})`
  }));

  return (
    <div className="h-[100dvh] bg-[#0a0a0a] text-white font-sans flex flex-col overflow-hidden">
      <header className="border-b border-white/10 p-3 sm:p-4 flex flex-wrap items-center justify-between gap-3 bg-black/50 backdrop-blur-md z-10 shrink-0">
        <div className="flex items-center gap-2 sm:gap-3">
          <Activity className="text-emerald-500 w-5 h-5 sm:w-6 sm:h-6" />
          <h1 className="text-base sm:text-xl font-medium tracking-tight">Genesis 3.0 <span className="hidden md:inline text-white/40 text-sm ml-2">Revolutionary Life Simulator</span></h1>
        </div>

        <div className="flex items-center gap-3 sm:gap-6">
          <div className="flex gap-3 sm:gap-4 text-xs sm:text-sm font-mono text-white/60">
            <div className="flex items-center gap-1">
              {stats.dayLight > 0.5 ? <Sun size={14} className="text-yellow-500" /> : <Moon size={14} className="text-blue-400" />}
              <span>{(stats.dayLight * 100).toFixed(0)}%</span>
            </div>
            <div className="flex items-center gap-1">
              {season === 'Spring' && <Leaf size={14} className="text-green-400" />}
              {season === 'Summer' && <Sun size={14} className="text-yellow-500" />}
              {season === 'Autumn' && <Leaf size={14} className="text-orange-400" />}
              {season === 'Winter' && <Snowflake size={14} className="text-blue-200" />}
              <span className="hidden sm:inline">{season}</span>
            </div>
            <div className="flex items-center gap-1">
              <Thermometer size={14} className="text-orange-400" />
              <span>{stats.ambientTemp?.toFixed(0) ?? 25}&deg;C</span>
            </div>
            <div className="flex items-center gap-1">
              POP: <span className="text-white">{stats.population}</span>
              <span className="text-white/30">/</span>
              <span className="text-white/80 cursor-pointer hover:text-white"
                onClick={() => {
                  const presets = [500, 1000, 2000, 5000, 10000, 0];
                  const idx = presets.indexOf(maxParticles);
                  const next = presets[(idx + 1) % presets.length];
                  setMaxParticles(next);
                  workerRef.current?.postMessage({ type: 'SET_CONFIG', payload: { maxParticles: next } });
                }}
              >{maxParticles === 0 ? '\u221E' : maxParticles}</span>
            </div>
            <div className="hidden sm:block">GEN: <span className="text-white">{stats.maxGeneration}</span></div>
            <div>TIME: <span className="text-white">{stats.time.toFixed(0)}s</span></div>
          </div>

          <div className="flex items-center gap-1 sm:gap-2">
            <button onClick={() => setShowEcology(!showEcology)} className={`p-1.5 sm:p-2 rounded-lg transition-colors ${showEcology ? 'bg-green-500/20 text-green-400' : 'hover:bg-white/10'}`} title="Ecology Dashboard">
              <Eye size={18} />
            </button>
            <button onClick={() => setShowMap(!showMap)} className={`p-1.5 sm:p-2 rounded-lg transition-colors ${showMap ? 'bg-blue-500/20 text-blue-400' : 'hover:bg-white/10'}`} title="Genetic Map">
              <MapIcon size={18} />
            </button>
            <button onClick={() => setShowTree(!showTree)} className={`p-1.5 sm:p-2 rounded-lg transition-colors ${showTree ? 'bg-emerald-500/20 text-emerald-400' : 'hover:bg-white/10'}`} title="Phylogenetic Tree">
              <GitMerge size={18} />
            </button>
            <div className="w-px h-6 bg-white/20 mx-1" />
            <button onClick={handleSave} className="p-1.5 sm:p-2 hover:bg-white/10 rounded-lg" title="Save"><Save size={18} /></button>
            <button onClick={() => fileInputRef.current?.click()} className="p-1.5 sm:p-2 hover:bg-white/10 rounded-lg" title="Load"><Upload size={18} /></button>
            <input type="file" ref={fileInputRef} onChange={handleLoad} className="hidden" accept=".json" />
            <div className="w-px h-6 bg-white/20 mx-1" />
            <button onClick={togglePlay} className="p-1.5 sm:p-2 hover:bg-white/10 rounded-lg">{isPlaying ? <Pause size={18} /> : <Play size={18} />}</button>
            <button onClick={handleSpeedChange} className={`p-1.5 sm:p-2 rounded-lg flex items-center gap-1 ${simSpeed > 1 ? 'bg-yellow-500/20 text-yellow-400' : 'hover:bg-white/10'}`} title="Speed">
              <FastForward size={18} /><span className="text-xs font-mono">{simSpeed}x</span>
            </button>
            <button onClick={resetSim} className="p-1.5 sm:p-2 hover:bg-white/10 rounded-lg"><RotateCcw size={18} /></button>
          </div>
        </div>
      </header>

      <main className="flex-1 flex flex-col lg:flex-row relative overflow-hidden">
        {/* Toolbar */}
        <div className="absolute left-4 top-4 z-20 flex flex-col gap-2 bg-black/80 backdrop-blur-md p-2 rounded-xl border border-white/10">
          {([
            ['inspect', MousePointer2, '', 'Inspect / Pan'],
            ['food', Apple, 'emerald', 'Spawn Food'],
            ['kill', Skull, 'red', 'Kill'],
            ['drag', Hand, 'blue', 'Drag'],
            ['---'],
            ['obstacle', Mountain, 'gray', 'Obstacle'],
            ['zone', Biohazard, 'purple', 'Toxic Zone'],
            ['thermal_vent', Flame, 'orange', 'Thermal Vent'],
            ['radiation', Zap, 'yellow', 'Radiation Zone'],
            ['---'],
            ['import', Download, 'yellow', 'Import Genome'],
            ['virus', Bug, 'red', 'Spawn Virus'],
            ['pheromone', Droplet, 'blue', 'Paint Pheromone'],
          ] as any[]).map((item: any, idx: number) => {
            if (item[0] === '---') return <div key={idx} className="w-full h-px bg-white/10 my-1" />;
            const [tool, Icon, color, title] = item;
            const isActive = activeTool === tool;
            const colorClass = isActive && color ? `bg-${color}-500/20 text-${color}-400` : '';
            return (
              <button key={tool} onClick={() => setActiveTool(tool)} className={`p-2 rounded-lg transition-colors ${isActive ? (colorClass || 'bg-white/20 text-white') : 'text-white/50 hover:text-white hover:bg-white/10'}`} title={title}>
                <Icon size={20} />
              </button>
            );
          })}
        </div>

        {/* Ecology Dashboard Overlay */}
        {showEcology && (
          <div className="absolute inset-0 z-10 bg-black/90 backdrop-blur-sm p-8 overflow-auto">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-2xl font-medium tracking-tight">Ecology Dashboard</h2>
              <button onClick={() => setShowEcology(false)} className="p-2 hover:bg-white/10 rounded-full"><X size={24} /></button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {/* Trophic Distribution */}
              <div className="bg-white/5 rounded-xl p-4 border border-white/10">
                <h3 className="text-sm font-medium mb-3 text-white/60">Trophic Distribution</h3>
                <div className="space-y-2">
                  {[
                    { name: 'Autotrophs', count: stats.autotrophs, color: '#22c55e' },
                    { name: 'Herbivores', count: stats.herbivores, color: '#eab308' },
                    { name: 'Predators', count: stats.predators, color: '#ef4444' },
                    { name: 'Decomposers', count: stats.decomposers, color: '#a855f7' },
                  ].map(t => (
                    <div key={t.name} className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-full" style={{ backgroundColor: t.color }} />
                      <span className="text-sm flex-1">{t.name}</span>
                      <span className="font-mono text-sm">{t.count}</span>
                      <div className="w-20 h-2 bg-white/10 rounded-full overflow-hidden">
                        <div className="h-full rounded-full" style={{ backgroundColor: t.color, width: `${stats.population > 0 ? (t.count / stats.population) * 100 : 0}%` }} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Trophic Pyramid Over Time */}
              <div className="bg-white/5 rounded-xl p-4 border border-white/10">
                <h3 className="text-sm font-medium mb-3 text-white/60">Trophic Pyramid (History)</h3>
                <div className="h-48">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={history}>
                      <XAxis dataKey="time" hide />
                      <YAxis hide />
                      <Tooltip contentStyle={{ backgroundColor: '#000', border: '1px solid #333', fontSize: '12px' }} />
                      <Area type="monotone" dataKey="autotrophs" stackId="1" stroke="#22c55e" fill="#22c55e" fillOpacity={0.6} />
                      <Area type="monotone" dataKey="herbivores" stackId="1" stroke="#eab308" fill="#eab308" fillOpacity={0.6} />
                      <Area type="monotone" dataKey="predators" stackId="1" stroke="#ef4444" fill="#ef4444" fillOpacity={0.6} />
                      <Area type="monotone" dataKey="decomposers" stackId="1" stroke="#a855f7" fill="#a855f7" fillOpacity={0.6} />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Atmosphere */}
              <div className="bg-white/5 rounded-xl p-4 border border-white/10">
                <h3 className="text-sm font-medium mb-3 text-white/60">Atmosphere</h3>
                <div className="space-y-3">
                  <div>
                    <div className="flex justify-between text-xs text-white/40 mb-1"><span>O2</span><span>{(stats.oxygenLevel * 100).toFixed(1)}%</span></div>
                    <div className="w-full h-2 bg-white/10 rounded-full"><div className="h-full bg-blue-400 rounded-full" style={{ width: `${stats.oxygenLevel * 250}%` }} /></div>
                  </div>
                  <div>
                    <div className="flex justify-between text-xs text-white/40 mb-1"><span>CO2</span><span>{(stats.co2Level * 100).toFixed(2)}%</span></div>
                    <div className="w-full h-2 bg-white/10 rounded-full"><div className="h-full bg-orange-400 rounded-full" style={{ width: `${stats.co2Level * 500}%` }} /></div>
                  </div>
                  <div className="flex justify-between text-sm mt-2">
                    <span className="text-white/40">Viruses</span><span className="font-mono text-red-400">{stats.virusCount}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-white/40">Bonds</span><span className="font-mono text-blue-400">{stats.bondCount}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-white/40">Biomass</span><span className="font-mono text-green-400">{stats.biomass?.toFixed(0) ?? 0}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Tree Overlay */}
        {showTree && (
          <div className="absolute inset-0 z-10 bg-black/90 backdrop-blur-sm p-8 overflow-auto">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-2xl font-medium tracking-tight">Phylogenetic Tree</h2>
              <button onClick={() => setShowTree(false)} className="p-2 hover:bg-white/10 rounded-full"><X size={24} /></button>
            </div>
            <div className="relative min-h-full">
              {speciesHistory.map(s => (
                <div key={s.id} className="flex items-center gap-4 mb-2 text-sm font-mono">
                  <div className={`w-4 h-4 rounded-full ${s.extinct ? 'opacity-20' : ''}`} style={{ backgroundColor: `rgb(${s.color.join(',')})` }} />
                  <span className={s.extinct ? 'text-white/30' : 'text-white'}>Species {s.id}</span>
                  <span className="text-white/30">&larr; Parent {s.parentId}</span>
                  <span className="text-white/30">@ {s.timestamp.toFixed(0)}s</span>
                  <span className={`text-xs px-2 py-0.5 rounded-full ${!s.extinct ? 'bg-white/10' : ''}`} style={{ color: TROPHIC_COLORS[trophicName(s.trophicLevel)] }}>
                    {trophicName(s.trophicLevel)}
                  </span>
                  {s.extinct && <span className="text-red-500/50 text-xs uppercase">Extinct</span>}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Genetic Map Overlay */}
        {showMap && (
          <div className="absolute inset-0 z-10 bg-black/90 backdrop-blur-sm p-8 flex flex-col">
            <div className="flex justify-between items-center mb-6 shrink-0">
              <h2 className="text-2xl font-medium tracking-tight">Genetic Space Map (PCA)</h2>
              <button onClick={() => setShowMap(false)} className="p-2 hover:bg-white/10 rounded-full"><X size={24} /></button>
            </div>
            <div className="flex-1 w-full bg-white/5 rounded-xl p-4 border border-white/10">
              <ResponsiveContainer width="100%" height="100%">
                <ScatterChart margin={{ top: 20, right: 20, bottom: 20, left: 20 }}>
                  <XAxis type="number" dataKey="x" name="Eat/Reproduce" stroke="#fff" />
                  <YAxis type="number" dataKey="y" name="Attack/Move" stroke="#fff" />
                  <ZAxis type="number" dataKey="z" range={[100, 100]} />
                  <Tooltip cursor={{ strokeDasharray: '3 3' }} contentStyle={{ backgroundColor: '#000', border: '1px solid #333' }} />
                  {pcaData.map((entry, index) => (
                    <Scatter key={index} name={entry.name} data={[entry]} fill={entry.fill} />
                  ))}
                </ScatterChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        {/* Canvas */}
        <div className="flex-1 relative flex items-center justify-center bg-[#111] p-2 sm:p-4 min-h-[50vh] lg:min-h-0">
          <canvas
            ref={canvasRef} width={width} height={height}
            onClick={handleCanvasClick} onWheel={handleWheel} onMouseDown={handleMouseDown} onMouseMove={handleMouseMove} onMouseUp={handleMouseUp} onMouseLeave={handleMouseUp}
            className={`max-w-full max-h-full object-contain shadow-2xl shadow-black/50 rounded-lg border border-white/5 ${activeTool === 'inspect' ? 'cursor-grab active:cursor-grabbing' : 'cursor-crosshair'}`}
            style={{ aspectRatio: `${width}/${height}` }}
          />
        </div>

        {/* Sidebar */}
        <div className="w-full lg:w-80 h-[40vh] lg:h-auto shrink-0 border-t lg:border-t-0 lg:border-l border-white/10 bg-black/80 backdrop-blur-xl p-4 sm:p-6 overflow-y-auto flex flex-col gap-4">
          {/* Inspector */}
          <div className="flex items-center justify-between text-white/80 border-b border-white/10 pb-3">
            <div className="flex items-center gap-2"><Info size={18} /><h2 className="font-medium">Organism Inspector</h2></div>
            {selectedParticleData && (
              <button onClick={handleExportGenome} className="p-1.5 rounded hover:bg-white/10" title="Export Genome"><Upload size={16} /></button>
            )}
          </div>

          {selectedParticleData ? (
            <div className="flex flex-col gap-3">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full border border-white/20" style={{ backgroundColor: `rgb(${selectedParticleData.genome.color.join(',')})` }} />
                <div>
                  <div className="text-sm font-mono text-white/60">ID: {selectedParticleData.id}</div>
                  <div className="text-xs text-white/40">Gen {selectedParticleData.generation} | Species {selectedParticleData.speciesId}</div>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2 text-sm">
                <div className="bg-white/5 p-2 rounded"><div className="text-white/40 text-xs">Energy</div><div className="font-mono">{selectedParticleData.energy.toFixed(0)}</div></div>
                <div className="bg-white/5 p-2 rounded"><div className="text-white/40 text-xs">Complexity</div><div className="font-mono">{selectedParticleData.complexity}</div></div>
                <div className="bg-white/5 p-2 rounded"><div className="text-white/40 text-xs">Age</div><div className="font-mono">{selectedParticleData.age.toFixed(0)}</div></div>
              </div>

              <div className="grid grid-cols-2 gap-2 text-sm">
                <div className="bg-white/5 p-2 rounded">
                  <div className="text-white/40 text-xs">Trophic Level</div>
                  <div className="font-mono" style={{ color: TROPHIC_COLORS[trophicName(selectedParticleData.trophicLevel)] }}>
                    {trophicName(selectedParticleData.trophicLevel)}
                  </div>
                </div>
                <div className="bg-white/5 p-2 rounded">
                  <div className="text-white/40 text-xs">Cell Type</div>
                  <div className="font-mono text-xs">{selectedParticleData.cellType || 'stem'}</div>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2 text-sm">
                <div className="bg-white/5 p-2 rounded"><div className="text-white/40 text-xs">Temp</div><div className="font-mono text-xs">{selectedParticleData.temperature?.toFixed(0) ?? '?'}&deg;</div></div>
                <div className="bg-white/5 p-2 rounded"><div className="text-white/40 text-xs">Stress</div><div className="font-mono text-xs">{(selectedParticleData.stressLevel * 100).toFixed(0)}%</div></div>
                <div className="bg-white/5 p-2 rounded"><div className="text-white/40 text-xs">Divs Left</div><div className="font-mono text-xs">{selectedParticleData.divisionsLeft}</div></div>
              </div>

              {/* Immune Status */}
              <div className="bg-white/5 p-2 rounded text-xs">
                <div className="text-white/40 text-xs font-semibold mb-1 flex items-center gap-1"><Shield size={12} /> Immune System</div>
                <div className="flex gap-2">
                  <span className={selectedParticleData.infected ? 'text-red-400' : 'text-green-400'}>
                    {selectedParticleData.infected ? 'INFECTED' : 'Healthy'}
                  </span>
                  <span className="text-white/30">|</span>
                  <span>Ab: {selectedParticleData.immune?.antibodies?.length ?? 0}</span>
                  <span className="text-white/30">|</span>
                  <span>Inflammation: {((selectedParticleData.immune?.inflammationLevel ?? 0) * 100).toFixed(0)}%</span>
                </div>
              </div>

              {/* DNA Info */}
              <div className="bg-white/5 p-2 rounded text-xs">
                <div className="text-white/40 text-xs font-semibold mb-1 flex items-center gap-1"><Dna size={12} /> DNA</div>
                <div className="flex gap-2 flex-wrap">
                  <span>{selectedParticleData.genome.dna?.genes?.length ?? '?'} genes</span>
                  <span className="text-white/30">|</span>
                  <span>{selectedParticleData.genome.dna?.genes?.filter((g: any) => g.methylated).length ?? 0} methylated</span>
                  <span className="text-white/30">|</span>
                  <span>Telomere: {selectedParticleData.genome.dna?.telomereLength?.toFixed(0) ?? '?'}</span>
                </div>
              </div>

              {/* Brain */}
              <div className="bg-white/5 p-2 rounded text-xs font-mono text-white/60">
                <div className="flex justify-between mb-1">
                  <span>18 In</span> &rarr; <span>12 Hid</span> &rarr; <span>14 Out</span>
                </div>
                <div className="text-[10px] text-white/40">+Temp, Trophic, Membrane, Infection, Inflammation, Morphogen, Stress, Telomere, Prey</div>
                <div className="mt-1 text-emerald-400">Role: {selectedParticleData.role || 'Unknown'}</div>
              </div>
            </div>
          ) : (
            <div className="text-sm text-white/40 text-center py-6">Click an organism to inspect</div>
          )}

          {/* Global Metrics */}
          <div className="flex items-center gap-2 text-white/80 border-b border-white/10 pb-3 mt-2">
            <Activity size={18} /><h2 className="font-medium">Metrics</h2>
          </div>

          <div className="grid grid-cols-2 gap-2 text-sm">
            <div className="bg-white/5 p-2 rounded"><div className="text-white/40 text-xs">Species</div><div className="font-mono">{stats.speciesCount}</div></div>
            <div className="bg-white/5 p-2 rounded"><div className="text-white/40 text-xs">Novelty</div><div className="font-mono">{stats.noveltyCount}</div></div>
          </div>

          {/* Trophic Mini-bars */}
          <div className="flex gap-1 h-4 rounded overflow-hidden">
            <div className="bg-green-500" style={{ flex: stats.autotrophs || 1 }} title={`Autotrophs: ${stats.autotrophs}`} />
            <div className="bg-yellow-500" style={{ flex: stats.herbivores || 0 }} title={`Herbivores: ${stats.herbivores}`} />
            <div className="bg-red-500" style={{ flex: stats.predators || 0 }} title={`Predators: ${stats.predators}`} />
            <div className="bg-purple-500" style={{ flex: stats.decomposers || 0 }} title={`Decomposers: ${stats.decomposers}`} />
          </div>
          <div className="flex justify-between text-[10px] text-white/40">
            <span>Auto:{stats.autotrophs}</span><span>Herb:{stats.herbivores}</span><span>Pred:{stats.predators}</span><span>Dec:{stats.decomposers}</span>
          </div>

          {/* Charts */}
          <div className="h-20 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={history}>
                <XAxis dataKey="time" hide /><YAxis domain={['auto', 'auto']} hide />
                <Tooltip contentStyle={{ backgroundColor: '#000', border: '1px solid #333', fontSize: '11px' }} labelStyle={{ display: 'none' }} />
                <Line type="monotone" dataKey="population" stroke="#10b981" strokeWidth={2} dot={false} isAnimationActive={false} />
              </LineChart>
            </ResponsiveContainer>
            <div className="text-xs text-white/40 text-center">Population</div>
          </div>

          <div className="h-20 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={history}>
                <XAxis dataKey="time" hide /><YAxis domain={['auto', 'auto']} hide />
                <Tooltip contentStyle={{ backgroundColor: '#000', border: '1px solid #333', fontSize: '11px' }} labelStyle={{ display: 'none' }} />
                <Line type="monotone" dataKey="avgEnergy" stroke="#eab308" strokeWidth={2} dot={false} isAnimationActive={false} />
              </LineChart>
            </ResponsiveContainer>
            <div className="text-xs text-white/40 text-center">Avg Energy</div>
          </div>

          <div className="h-20 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={history}>
                <XAxis dataKey="time" hide /><YAxis domain={['auto', 'auto']} hide />
                <Tooltip contentStyle={{ backgroundColor: '#000', border: '1px solid #333', fontSize: '11px' }} labelStyle={{ display: 'none' }} />
                <Line type="monotone" dataKey="avgComplexity" stroke="#8b5cf6" strokeWidth={2} dot={false} isAnimationActive={false} />
              </LineChart>
            </ResponsiveContainer>
            <div className="text-xs text-white/40 text-center">Avg Complexity</div>
          </div>

          <div className="h-20 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={history}>
                <XAxis dataKey="time" hide /><YAxis domain={['auto', 'auto']} hide />
                <Tooltip contentStyle={{ backgroundColor: '#000', border: '1px solid #333', fontSize: '11px' }} labelStyle={{ display: 'none' }} />
                <Line type="monotone" dataKey="virusCount" stroke="#ef4444" strokeWidth={1.5} dot={false} isAnimationActive={false} />
                <Line type="monotone" dataKey="bondCount" stroke="#3b82f6" strokeWidth={1.5} dot={false} isAnimationActive={false} />
              </LineChart>
            </ResponsiveContainer>
            <div className="text-xs text-white/40 text-center">Viruses / Bonds</div>
          </div>
        </div>
      </main>
    </div>
  );
}
