/**
 * Genesis CLI — Terminal Reporter
 * Handles colored output, progress bars, tables, and live stats display.
 */

const isTTY = process.stdout.isTTY ?? false;

// ANSI color helpers (no-op if not TTY or piped)
const c = {
  reset: isTTY ? '\x1b[0m' : '',
  bold: isTTY ? '\x1b[1m' : '',
  dim: isTTY ? '\x1b[2m' : '',
  green: isTTY ? '\x1b[32m' : '',
  yellow: isTTY ? '\x1b[33m' : '',
  blue: isTTY ? '\x1b[34m' : '',
  magenta: isTTY ? '\x1b[35m' : '',
  cyan: isTTY ? '\x1b[36m' : '',
  red: isTTY ? '\x1b[31m' : '',
  white: isTTY ? '\x1b[37m' : '',
  bgGreen: isTTY ? '\x1b[42m' : '',
  bgBlue: isTTY ? '\x1b[44m' : '',
};

export { c };

export function banner() {
  console.log(`
${c.green}${c.bold}  ╔══════════════════════════════════════╗
  ║     🧬 Genesis 2.0 — CLI Engine     ║
  ╚══════════════════════════════════════╝${c.reset}
`);
}

export function progressBar(current: number, total: number, width: number = 30): string {
  const ratio = Math.min(current / total, 1);
  const filled = Math.round(width * ratio);
  const empty = width - filled;
  const bar = `${c.green}${'█'.repeat(filled)}${c.dim}${'░'.repeat(empty)}${c.reset}`;
  const pct = (ratio * 100).toFixed(1).padStart(5);
  return `${bar} ${pct}%`;
}

export function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms.toFixed(0)}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(2)}s`;
  const mins = Math.floor(ms / 60000);
  const secs = ((ms % 60000) / 1000).toFixed(1);
  return `${mins}m ${secs}s`;
}

export function formatNumber(n: number, decimals: number = 0): string {
  if (decimals === 0) return Math.round(n).toLocaleString('en-US');
  return n.toFixed(decimals);
}

export interface SimSnapshot {
  tick: number;
  time: number;
  population: number;
  species: number;
  avgEnergy: number;
  avgComplexity: number;
  season: string;
  dayLight: number;
  nutrients: number;
  viruses: number;
  bonds: number;
}

export function printStatsLine(snap: SimSnapshot, total: number) {
  if (!isTTY) {
    // Simple output for piped mode
    console.log(`tick=${snap.tick} t=${snap.time.toFixed(1)}s pop=${snap.population} species=${snap.species} energy=${snap.avgEnergy.toFixed(1)} complexity=${snap.avgComplexity.toFixed(1)} season=${snap.season} daylight=${(snap.dayLight*100).toFixed(0)}%`);
    return;
  }
  
  const bar = progressBar(snap.tick, total, 20);
  const seasonIcon = snap.season === 'Spring' ? '🌱' : snap.season === 'Summer' ? '☀️' : snap.season === 'Autumn' ? '🍂' : '❄️';
  
  process.stdout.write(`\r  ${bar}  ${c.cyan}Pop:${c.white}${String(snap.population).padStart(5)} ${c.yellow}Spc:${c.white}${String(snap.species).padStart(4)} ${c.green}E̅:${c.white}${snap.avgEnergy.toFixed(1).padStart(6)} ${c.magenta}C̅:${c.white}${snap.avgComplexity.toFixed(1).padStart(6)} ${seasonIcon} ${c.dim}t=${snap.time.toFixed(0)}s${c.reset}  `);
}

export function printStatsTable(snap: SimSnapshot) {
  console.log(`
${c.bold}${c.cyan}┌────────────────────┬──────────────┐${c.reset}
${c.bold}${c.cyan}│${c.reset} ${c.bold}Metric${c.reset}             ${c.bold}${c.cyan}│${c.reset} ${c.bold}Value${c.reset}        ${c.bold}${c.cyan}│${c.reset}
${c.bold}${c.cyan}├────────────────────┼──────────────┤${c.reset}
${c.cyan}│${c.reset} Population         ${c.cyan}│${c.reset} ${c.white}${String(snap.population).padEnd(12)}${c.reset} ${c.cyan}│${c.reset}
${c.cyan}│${c.reset} Active Species     ${c.cyan}│${c.reset} ${c.white}${String(snap.species).padEnd(12)}${c.reset} ${c.cyan}│${c.reset}
${c.cyan}│${c.reset} Avg Energy         ${c.cyan}│${c.reset} ${c.yellow}${snap.avgEnergy.toFixed(2).padEnd(12)}${c.reset} ${c.cyan}│${c.reset}
${c.cyan}│${c.reset} Avg Complexity     ${c.cyan}│${c.reset} ${c.magenta}${snap.avgComplexity.toFixed(2).padEnd(12)}${c.reset} ${c.cyan}│${c.reset}
${c.cyan}│${c.reset} Season             ${c.cyan}│${c.reset} ${c.green}${snap.season.padEnd(12)}${c.reset} ${c.cyan}│${c.reset}
${c.cyan}│${c.reset} Daylight           ${c.cyan}│${c.reset} ${c.white}${(snap.dayLight * 100).toFixed(0).padStart(3)}%${' '.repeat(8)}${c.reset} ${c.cyan}│${c.reset}
${c.cyan}│${c.reset} Sim Time           ${c.cyan}│${c.reset} ${c.white}${snap.time.toFixed(1).padEnd(10)}${c.reset}s ${c.cyan}│${c.reset}
${c.cyan}│${c.reset} Nutrients          ${c.cyan}│${c.reset} ${c.green}${String(snap.nutrients).padEnd(12)}${c.reset} ${c.cyan}│${c.reset}
${c.cyan}│${c.reset} Viruses            ${c.cyan}│${c.reset} ${c.red}${String(snap.viruses).padEnd(12)}${c.reset} ${c.cyan}│${c.reset}
${c.cyan}│${c.reset} Bonds              ${c.cyan}│${c.reset} ${c.blue}${String(snap.bonds).padEnd(12)}${c.reset} ${c.cyan}│${c.reset}
${c.bold}${c.cyan}└────────────────────┴──────────────┘${c.reset}`);
}

export function printBenchmarkResult(label: string, results: { ticks: number; totalMs: number; ticksPerSec: number; avgMsPerTick: number }[]) {
  console.log(`\n${c.bold}${c.yellow}⚡ Benchmark Results: ${label}${c.reset}\n`);
  
  for (let i = 0; i < results.length; i++) {
    const r = results[i];
    console.log(`  ${c.dim}Run ${i + 1}:${c.reset} ${c.white}${formatNumber(r.ticks)}${c.reset} ticks in ${c.cyan}${formatDuration(r.totalMs)}${c.reset} → ${c.green}${c.bold}${formatNumber(r.ticksPerSec, 1)}${c.reset} ticks/s ${c.dim}(${r.avgMsPerTick.toFixed(3)}ms/tick)${c.reset}`);
  }
  
  if (results.length > 1) {
    const avgTps = results.reduce((a, b) => a + b.ticksPerSec, 0) / results.length;
    console.log(`\n  ${c.bold}${c.green}Average: ${formatNumber(avgTps, 1)} ticks/s${c.reset}`);
  }
}
