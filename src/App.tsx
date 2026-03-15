import React, { useEffect, useRef, useState } from 'react';
import { Play, Pause, RotateCcw, Activity, Info, Save, Upload, Sun, Moon, MousePointer2, Apple, Skull, Hand, Edit3, GitMerge, X, Mountain, Biohazard, Download, Map as MapIcon, FastForward, Bug, Droplet, Snowflake, Leaf } from 'lucide-react';
import { ActionType, ConditionType, Particle, Rule, SpeciesRecord, Obstacle, Zone, Genome } from './sim/types';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, ScatterChart, Scatter, ZAxis } from 'recharts';

interface SimStats {
  population: number; time: number; avgEnergy: number; maxGeneration: number;
  avgComplexity: number; dayLight: number; noveltyCount: number; speciesCount: number;
}

type ToolType = 'inspect' | 'food' | 'kill' | 'drag' | 'obstacle' | 'zone' | 'import' | 'virus' | 'pheromone';

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const workerRef = useRef<Worker | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [simSpeed, setSimSpeed] = useState(1);
  const [stats, setStats] = useState<SimStats>({ 
    population: 0, time: 0, avgEnergy: 0, maxGeneration: 0, avgComplexity: 0, dayLight: 1, noveltyCount: 0, speciesCount: 0 
  });
  const [history, setHistory] = useState<SimStats[]>([]);
  const [season, setSeason] = useState('Spring');
  const [selectedParticleId, setSelectedParticleId] = useState<number | null>(null);
  const [selectedParticleData, setSelectedParticleData] = useState<Particle | null>(null);
  
  const [activeTool, setActiveTool] = useState<ToolType>('inspect');
  const pheromoneCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const spriteCache = useRef<Map<string, HTMLCanvasElement>>(new Map());
  const [maxParticles, setMaxParticles] = useState(2000);
  const [showTree, setShowTree] = useState(false);
  const [showMap, setShowMap] = useState(false);
  const [speciesHistory, setSpeciesHistory] = useState<SpeciesRecord[]>([]);

  // Perf: transform as ref avoids stale closures in worker callback + unnecessary re-renders
  const transformRef = useRef({ x: 0, y: 0, scale: 1 });
  const selectedParticleIdRef = useRef<number | null>(null);
  const lastReactUpdateRef = useRef(0);
  const isDragging = useRef(false);
  const isToolActive = useRef(false);
  const lastPos = useRef({ x: 0, y: 0 });

  const width = 1200;
  const height = 800;

  // Keep ref in sync with state for worker callback
  useEffect(() => { selectedParticleIdRef.current = selectedParticleId; }, [selectedParticleId]);

  useEffect(() => {
    const worker = new Worker(new URL('./sim/worker.ts', import.meta.url), { type: 'module' });
    workerRef.current = worker;

    worker.postMessage({
      type: 'INIT',
      payload: { width, height, initialParticles: 300, maxParticles: 2000, friction: 0.92, repulsion: 20.0, nutrientSpawnRate: 10.0, mutationRate: 0.1 }
    });

    worker.onmessage = (e) => {
      const { type, payload } = e.data;
      if (type === 'TICK') {
        render(payload);

        // Perf: throttle React state updates to ~4 FPS (canvas stays at full FPS)
        const now = performance.now();
        if (now - lastReactUpdateRef.current > 250) {
          lastReactUpdateRef.current = now;
          setStats(payload.stats);
          setSeason(payload.season);
          setHistory(prev => {
            if (prev.length === 0 || payload.stats.time - prev[prev.length - 1].time >= 1) {
              const newHistory = [...prev, payload.stats];
              if (newHistory.length > 50) newHistory.shift();
              return newHistory;
            }
            return prev;
          });
        }

        // Species history only arrives periodically from worker
        if (payload.speciesHistory) {
          setSpeciesHistory(payload.speciesHistory);
        }
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

    // Use refs for latest values (avoids stale closure from useEffect)
    const transform = transformRef.current;
    const selectedParticleId = selectedParticleIdRef.current;

    const bgLight = Math.floor(payload.stats.dayLight * 30);
    ctx.fillStyle = `rgb(${bgLight}, ${bgLight}, ${bgLight})`;
    ctx.fillRect(0, 0, width, height);

    // Viewport bounds for culling
    const viewLeft = -transform.x / transform.scale;
    const viewTop = -transform.y / transform.scale;
    const viewRight = viewLeft + canvas.width / transform.scale;
    const viewBottom = viewTop + canvas.height / transform.scale;
    const margin = 50;

    ctx.save();
    ctx.translate(transform.x, transform.y);
    ctx.scale(transform.scale, transform.scale);

    // Pheromones Optimization: Use offscreen canvas as a texture
    const PHEROMONE_CELL_SIZE = 10;
    const cols = Math.ceil(width / PHEROMONE_CELL_SIZE);
    const rows = Math.ceil(height / PHEROMONE_CELL_SIZE);
    
    if (!pheromoneCanvasRef.current) {
      pheromoneCanvasRef.current = document.createElement('canvas');
      pheromoneCanvasRef.current.width = cols;
      pheromoneCanvasRef.current.height = rows;
    }
    
    const pCanvas = pheromoneCanvasRef.current;
    const pCtx = pCanvas.getContext('2d');
    if (pCtx) {
      const pData = new Float32Array(payload.pheromones);
      const imgData = pCtx.createImageData(cols, rows);
      for (let i = 0; i < pData.length; i++) {
        const val = pData[i];
        const idx = i * 4;
        imgData.data[idx] = 139;     // R
        imgData.data[idx + 1] = 92;  // G
        imgData.data[idx + 2] = 246; // B
        imgData.data[idx + 3] = Math.min(val * 2, 128); // A
      }
      pCtx.putImageData(imgData, 0, 0);
      ctx.globalAlpha = 0.6;
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(pCanvas, 0, 0, width, height);
      ctx.globalAlpha = 1.0;
    }

    // Grid (Only draw if visible)
    ctx.strokeStyle = `rgba(255, 255, 255, ${0.05 + payload.stats.dayLight * 0.05})`;
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
    for (const z of payload.zones as Zone[]) {
      ctx.beginPath(); ctx.arc(z.x, z.y, z.r, 0, Math.PI * 2);
      if (z.type === 'toxic') ctx.fillStyle = 'rgba(239, 68, 68, 0.2)';
      else if (z.type === 'shadow') ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
      else if (z.type === 'current') ctx.fillStyle = 'rgba(59, 130, 246, 0.2)';
      ctx.fill();
    }

    // Obstacles
    ctx.fillStyle = '#333'; ctx.strokeStyle = '#555'; ctx.lineWidth = 2 / transform.scale;
    for (const o of payload.obstacles as Obstacle[]) {
      ctx.fillRect(o.x, o.y, o.w, o.h); ctx.strokeRect(o.x, o.y, o.w, o.h);
    }

    // Sounds
    const sounds = new Float32Array(payload.sounds);
    ctx.lineWidth = 1 / transform.scale;
    for (let i = 0; i < sounds.length; i += 4) {
      const vol = sounds[i + 3];
      ctx.strokeStyle = `rgba(255, 255, 255, ${vol * 0.15})`;
      ctx.beginPath(); ctx.arc(sounds[i], sounds[i+1], sounds[i+2], 0, Math.PI * 2); ctx.stroke();
    }

    // Nutrients and Corpses
    const nutrients = new Float32Array(payload.nutrients);
    for (let i = 0; i < nutrients.length; i += 4) {
      const x = nutrients[i]; const y = nutrients[i+1];
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
      ctx.fillStyle = '#ef4444'; // Red for virus
      for (let i = 0; i < viruses.length; i += 3) {
        ctx.beginPath();
        const vx = viruses[i];
        const vy = viruses[i + 1];
        const vr = viruses[i + 2];
        // Draw spiky virus shape
        for (let j = 0; j < 8; j++) {
          const angle = (j / 8) * Math.PI * 2;
          const r = j % 2 === 0 ? vr : vr * 0.5;
          if (j === 0) ctx.moveTo(vx + Math.cos(angle) * r, vy + Math.sin(angle) * r);
          else ctx.lineTo(vx + Math.cos(angle) * r, vy + Math.sin(angle) * r);
        }
        ctx.closePath();
        ctx.fill();
      }
    }

    // Particles
    const particles = new Float32Array(payload.particles);
    const positions = new Map<number, {x: number, y: number}>();
    
    for (let i = 0; i < particles.length; i += 8) {
      const x = particles[i]; const y = particles[i + 1]; const radius = particles[i + 2];
      const id = particles[i + 7];
      
      positions.set(id, { x, y });

      // Culling
      if (x < viewLeft - margin || x > viewRight + margin || y < viewTop - margin || y > viewBottom + margin) continue;

      const r = Math.floor(particles[i + 3] * 255); const g = Math.floor(particles[i + 4] * 255); const b = Math.floor(particles[i + 5] * 255);
      const colorKey = `p_${r}_${g}_${b}`;
      
      let sprite = spriteCache.current.get(colorKey);
      if (!sprite) {
        sprite = document.createElement('canvas');
        sprite.width = 32; sprite.height = 32;
        const sCtx = sprite.getContext('2d')!;
        sCtx.fillStyle = `rgb(${r},${g},${b})`;
        sCtx.beginPath(); sCtx.arc(16, 16, 14, 0, Math.PI * 2); sCtx.fill();
        // Add a small highlight for depth
        sCtx.fillStyle = 'rgba(255,255,255,0.3)';
        sCtx.beginPath(); sCtx.arc(12, 12, 4, 0, Math.PI * 2); sCtx.fill();
        spriteCache.current.set(colorKey, sprite);
      }

      ctx.drawImage(sprite, x - radius, y - radius, radius * 2, radius * 2);

      if (id === selectedParticleId) {
        ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 2 / transform.scale;
        ctx.beginPath(); ctx.arc(x, y, radius + 4, 0, Math.PI * 2); ctx.stroke();
      }
    }

    // Bonds
    const bonds = new Float32Array(payload.bonds);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)'; ctx.lineWidth = 2 / transform.scale;
    for (let i = 0; i < bonds.length; i += 2) {
      const p1 = positions.get(bonds[i]); const p2 = positions.get(bonds[i + 1]);
      if (p1 && p2) { ctx.beginPath(); ctx.moveTo(p1.x, p1.y); ctx.lineTo(p2.x, p2.y); ctx.stroke(); }
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
    if (activeTool === 'inspect' || activeTool === 'drag') {
      workerRef.current?.postMessage({ type: 'GET_PARTICLE', payload: simPos });
    } else if (activeTool === 'food') {
      workerRef.current?.postMessage({ type: 'ADD_FOOD', payload: simPos });
    } else if (activeTool === 'kill') {
      workerRef.current?.postMessage({ type: 'KILL', payload: simPos });
    } else if (activeTool === 'obstacle') {
      workerRef.current?.postMessage({ type: 'ADD_OBSTACLE', payload: simPos });
    } else if (activeTool === 'zone') {
      workerRef.current?.postMessage({ type: 'ADD_ZONE', payload: simPos });
    } else if (activeTool === 'import') {
      handleImportGenome(simPos);
    } else if (activeTool === 'virus') {
      workerRef.current?.postMessage({ type: 'SPAWN_VIRUS', payload: simPos });
    }
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (e.buttons === 1) {
      isDragging.current = true;
      if (activeTool === 'inspect') {
        const dx = e.clientX - lastPos.current.x; const dy = e.clientY - lastPos.current.y;
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
      try {
        text = await navigator.clipboard.readText();
      } catch (err) {
        text = prompt("Paste the genome JSON here:") || '';
      }
      
      if (!text) return;
      const genome = JSON.parse(text) as Genome;
      if (genome.brain || genome.rules) {
        workerRef.current?.postMessage({ type: 'SPAWN_GENOME', payload: { x: pos.x, y: pos.y, genome } });
      }
    } catch (e) { alert("Invalid genome JSON!"); }
  };

  const pcaData = speciesHistory.filter(s => !s.extinct).map(s => ({
    x: s.traitX, y: s.traitY, z: 1, name: `Species ${s.id}`, fill: `rgb(${s.color.join(',')})`
  }));

  return (
    <div className="h-[100dvh] bg-[#0a0a0a] text-white font-sans flex flex-col overflow-hidden">
      <header className="border-b border-white/10 p-3 sm:p-4 flex flex-wrap items-center justify-between gap-3 bg-black/50 backdrop-blur-md z-10 shrink-0">
        <div className="flex items-center gap-2 sm:gap-3">
          <Activity className="text-emerald-500 w-5 h-5 sm:w-6 sm:h-6" />
          <h1 className="text-base sm:text-xl font-medium tracking-tight">Genesis 2.0 <span className="hidden md:inline text-white/40 text-sm ml-2">Artificial Life Simulator</span></h1>
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
              POP: <span className="text-white">{stats.population}</span>
              <span className="text-white/30">/</span>
              <span className={`text-white/80 cursor-pointer hover:text-white ${maxParticles === 0 ? 'text-yellow-400' : ''}`}
                title="Click to change population cap"
                onClick={() => {
                  const presets = [500, 1000, 2000, 5000, 10000, 0];
                  const currentIdx = presets.indexOf(maxParticles);
                  const next = presets[(currentIdx + 1) % presets.length];
                  setMaxParticles(next);
                  workerRef.current?.postMessage({ type: 'SET_CONFIG', payload: { maxParticles: next } });
                }}
              >{maxParticles === 0 ? '∞' : maxParticles}</span>
            </div>
            <div className="hidden sm:block">GEN: <span className="text-white">{stats.maxGeneration}</span></div>
            <div>TIME: <span className="text-white">{stats.time.toFixed(0)}s</span></div>
          </div>
          
          <div className="flex items-center gap-1 sm:gap-2">
            <button onClick={() => setShowMap(!showMap)} className={`p-1.5 sm:p-2 rounded-lg transition-colors ${showMap ? 'bg-blue-500/20 text-blue-400' : 'hover:bg-white/10'}`} title="Genetic Map (PCA)">
              <MapIcon size={18} />
            </button>
            <button onClick={() => setShowTree(!showTree)} className={`p-1.5 sm:p-2 rounded-lg transition-colors ${showTree ? 'bg-emerald-500/20 text-emerald-400' : 'hover:bg-white/10'}`} title="Phylogenetic Tree">
              <GitMerge size={18} />
            </button>
            <div className="w-px h-6 bg-white/20 mx-1"></div>
            <button onClick={handleSave} className="p-1.5 sm:p-2 hover:bg-white/10 rounded-lg transition-colors" title="Save State">
              <Save size={18} />
            </button>
            <button onClick={() => fileInputRef.current?.click()} className="p-1.5 sm:p-2 hover:bg-white/10 rounded-lg transition-colors" title="Load State">
              <Upload size={18} />
            </button>
            <input type="file" ref={fileInputRef} onChange={handleLoad} className="hidden" accept=".json" />
            <div className="w-px h-6 bg-white/20 mx-1"></div>
            <button onClick={togglePlay} className="p-1.5 sm:p-2 hover:bg-white/10 rounded-lg transition-colors">
              {isPlaying ? <Pause size={18} /> : <Play size={18} />}
            </button>
            <button onClick={handleSpeedChange} className={`p-1.5 sm:p-2 rounded-lg transition-colors flex items-center gap-1 ${simSpeed > 1 ? 'bg-yellow-500/20 text-yellow-400' : 'hover:bg-white/10'}`} title="Simulation Speed">
              <FastForward size={18} />
              <span className="text-xs font-mono">{simSpeed}x</span>
            </button>
            <button onClick={resetSim} className="p-1.5 sm:p-2 hover:bg-white/10 rounded-lg transition-colors">
              <RotateCcw size={18} />
            </button>
          </div>
        </div>
      </header>

      <main className="flex-1 flex flex-col lg:flex-row relative overflow-hidden">
        {/* Toolbar */}
        <div className="absolute left-4 top-4 z-20 flex flex-col gap-2 bg-black/80 backdrop-blur-md p-2 rounded-xl border border-white/10">
          <button onClick={() => setActiveTool('inspect')} className={`p-2 rounded-lg transition-colors ${activeTool === 'inspect' ? 'bg-white/20 text-white' : 'text-white/50 hover:text-white hover:bg-white/10'}`} title="Inspect / Pan"><MousePointer2 size={20} /></button>
          <button onClick={() => setActiveTool('food')} className={`p-2 rounded-lg transition-colors ${activeTool === 'food' ? 'bg-emerald-500/20 text-emerald-400' : 'text-white/50 hover:text-emerald-400 hover:bg-white/10'}`} title="Spawn Food"><Apple size={20} /></button>
          <button onClick={() => setActiveTool('kill')} className={`p-2 rounded-lg transition-colors ${activeTool === 'kill' ? 'bg-red-500/20 text-red-400' : 'text-white/50 hover:text-red-400 hover:bg-white/10'}`} title="Kill Particles"><Skull size={20} /></button>
          <button onClick={() => setActiveTool('drag')} className={`p-2 rounded-lg transition-colors ${activeTool === 'drag' ? 'bg-blue-500/20 text-blue-400' : 'text-white/50 hover:text-blue-400 hover:bg-white/10'}`} title="Drag Particle"><Hand size={20} /></button>
          <div className="w-full h-px bg-white/10 my-1"></div>
          <button onClick={() => setActiveTool('obstacle')} className={`p-2 rounded-lg transition-colors ${activeTool === 'obstacle' ? 'bg-gray-500/20 text-gray-400' : 'text-white/50 hover:text-gray-400 hover:bg-white/10'}`} title="Add Obstacle"><Mountain size={20} /></button>
          <button onClick={() => setActiveTool('zone')} className={`p-2 rounded-lg transition-colors ${activeTool === 'zone' ? 'bg-purple-500/20 text-purple-400' : 'text-white/50 hover:text-purple-400 hover:bg-white/10'}`} title="Add Toxic Zone"><Biohazard size={20} /></button>
          <div className="w-full h-px bg-white/10 my-1"></div>
          <button onClick={() => setActiveTool('import')} className={`p-2 rounded-lg transition-colors ${activeTool === 'import' ? 'bg-yellow-500/20 text-yellow-400' : 'text-white/50 hover:text-yellow-400 hover:bg-white/10'}`} title="Import Genome (Click canvas to spawn)"><Download size={20} /></button>
          <button onClick={() => setActiveTool('virus')} className={`p-2 rounded-lg transition-colors ${activeTool === 'virus' ? 'bg-red-600/20 text-red-500' : 'text-white/50 hover:text-red-500 hover:bg-white/10'}`} title="Spawn Virus"><Bug size={20} /></button>
          <button onClick={() => setActiveTool('pheromone')} className={`p-2 rounded-lg transition-colors ${activeTool === 'pheromone' ? 'bg-blue-400/20 text-blue-300' : 'text-white/50 hover:text-blue-300 hover:bg-white/10'}`} title="Paint Pheromone"><Droplet size={20} /></button>
        </div>

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
                  <XAxis type="number" dataKey="x" name="Focus: Eat/Reproduce" stroke="#fff" />
                  <YAxis type="number" dataKey="y" name="Focus: Attack/Move" stroke="#fff" />
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

        <div className="flex-1 relative flex items-center justify-center bg-[#111] p-2 sm:p-4 min-h-[50vh] lg:min-h-0">
          <canvas
            ref={canvasRef} width={width} height={height}
            onClick={handleCanvasClick} onWheel={handleWheel} onMouseDown={handleMouseDown} onMouseMove={handleMouseMove} onMouseUp={handleMouseUp} onMouseLeave={handleMouseUp}
            className={`max-w-full max-h-full object-contain shadow-2xl shadow-black/50 rounded-lg border border-white/5 ${activeTool === 'inspect' ? 'cursor-grab active:cursor-grabbing' : 'cursor-crosshair'}`}
            style={{ aspectRatio: `${width}/${height}` }}
          />
        </div>

        <div className="w-full lg:w-80 h-[40vh] lg:h-auto shrink-0 border-t lg:border-t-0 lg:border-l border-white/10 bg-black/80 backdrop-blur-xl p-4 sm:p-6 overflow-y-auto flex flex-col gap-6">
          <div className="flex items-center justify-between text-white/80 border-b border-white/10 pb-4">
            <div className="flex items-center gap-2">
              <Info size={18} />
              <h2 className="font-medium">Organism Inspector</h2>
            </div>
            {selectedParticleData && (
              <button onClick={handleExportGenome} className="p-1.5 rounded hover:bg-white/10 transition-colors" title="Export Genome to JSON">
                <Upload size={16} />
              </button>
            )}
          </div>

          {selectedParticleData ? (
            <div className="flex flex-col gap-4">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full border border-white/20" style={{ backgroundColor: `rgb(${selectedParticleData.genome.color.join(',')})` }} />
                <div>
                  <div className="text-sm font-mono text-white/60">ID: {selectedParticleData.id} | Org: {selectedParticleData.organismId}</div>
                  <div className="text-xs text-white/40">Gen: {selectedParticleData.generation} | Species: {selectedParticleData.speciesId}</div>
                </div>
              </div>

              <div className="space-y-2">
                <div className="text-xs font-semibold text-white/40 uppercase tracking-wider">Stats</div>
                <div className="grid grid-cols-3 gap-2 text-sm">
                  <div className="bg-white/5 p-2 rounded">
                    <div className="text-white/40 text-xs">Energy</div>
                    <div className="font-mono">{selectedParticleData.energy.toFixed(0)}</div>
                  </div>
                  <div className="bg-white/5 p-2 rounded">
                    <div className="text-white/40 text-xs">Complexity</div>
                    <div className="font-mono">{selectedParticleData.complexity}</div>
                  </div>
                  <div className="bg-white/5 p-2 rounded">
                    <div className="text-white/40 text-xs">Memory</div>
                    <div className="font-mono">{selectedParticleData.mem.toFixed(2)}</div>
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <div className="text-xs font-semibold text-white/40 uppercase tracking-wider">Neural Network (Brain)</div>
                {selectedParticleData.genome.brain ? (
                  <div className="bg-white/5 p-3 rounded text-xs font-mono text-white/60">
                    <div className="flex justify-between mb-2">
                      <span>9 Inputs</span> &rarr; <span>6 Hidden</span> &rarr; <span>9 Outputs</span>
                    </div>
                    <div className="text-[10px] text-white/40 mb-1">Inputs: Bias, Energy, Age, Food, Mate, Danger, Pheromone, Mem, Sound</div>
                    <div className="text-[10px] text-white/40">Outputs: Move, Turn, Eat, Repro, Attack, Phero, Sound, MemWrite, Bond</div>
                    <div className="mt-2 text-emerald-400">Brain Active</div>
                  </div>
                ) : (
                  <div className="text-xs text-white/40">Legacy Rule-Based System</div>
                )}
              </div>
            </div>
          ) : (
            <div className="text-sm text-white/40 text-center py-10">Click on an organism to inspect its genome and state.</div>
          )}

          <div className="flex items-center gap-2 text-white/80 border-b border-white/10 pb-4 mt-4">
            <Activity size={18} />
            <h2 className="font-medium">Global Metrics</h2>
          </div>

          <div className="grid grid-cols-2 gap-2 text-sm mb-2">
            <div className="bg-white/5 p-2 rounded">
              <div className="text-white/40 text-xs">Active Species</div>
              <div className="font-mono">{stats.speciesCount}</div>
            </div>
            <div className="bg-white/5 p-2 rounded">
              <div className="text-white/40 text-xs">Novel Behaviors</div>
              <div className="font-mono">{stats.noveltyCount}</div>
            </div>
          </div>

          <div className="h-24 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={history}>
                <XAxis dataKey="time" hide />
                <YAxis domain={['auto', 'auto']} hide />
                <Tooltip contentStyle={{ backgroundColor: '#000', border: '1px solid #333', fontSize: '12px' }} labelStyle={{ display: 'none' }} />
                <Line type="monotone" dataKey="population" stroke="#10b981" strokeWidth={2} dot={false} isAnimationActive={false} />
              </LineChart>
            </ResponsiveContainer>
            <div className="text-xs text-white/40 text-center mt-1">Population</div>
          </div>

          <div className="h-24 w-full mt-4">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={history}>
                <XAxis dataKey="time" hide />
                <YAxis domain={['auto', 'auto']} hide />
                <Tooltip contentStyle={{ backgroundColor: '#000', border: '1px solid #333', fontSize: '12px' }} labelStyle={{ display: 'none' }} />
                <Line type="monotone" dataKey="avgEnergy" stroke="#eab308" strokeWidth={2} dot={false} isAnimationActive={false} />
              </LineChart>
            </ResponsiveContainer>
            <div className="text-xs text-white/40 text-center mt-1">Avg Energy</div>
          </div>

          <div className="h-24 w-full mt-4">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={history}>
                <XAxis dataKey="time" hide />
                <YAxis domain={['auto', 'auto']} hide />
                <Tooltip contentStyle={{ backgroundColor: '#000', border: '1px solid #333', fontSize: '12px' }} labelStyle={{ display: 'none' }} />
                <Line type="monotone" dataKey="avgComplexity" stroke="#8b5cf6" strokeWidth={2} dot={false} isAnimationActive={false} />
              </LineChart>
            </ResponsiveContainer>
            <div className="text-xs text-white/40 text-center mt-1">Avg Complexity</div>
          </div>
        </div>
      </main>
    </div>
  );
}
