#!/usr/bin/env node
/**
 * Genesis 2.0 — CLI Interface
 * 
 * Usage:
 *   npx tsx src/cli/index.ts <command> [options]
 *   npm run cli -- <command> [options]
 * 
 * Commands:
 *   run           Run a headless simulation
 *   benchmark     Performance benchmark
 *   batch         Run multiple simulations with varying params
 *   export        Export data from a save file
 *   info          Show info about a save file
 *   help          Show this help message
 */

import * as fs from 'fs';
import * as path from 'path';
import { SimConfig, SimState } from '../sim/types';
import { runSimulation, runFromState, defaultConfig, takeSnapshot, RunResult } from './runner';
import { exportParticles, exportSpecies, exportHistory, exportGenomes, exportFullSummary } from './exporter';
import { banner, c, printStatsTable, printBenchmarkResult, formatDuration, formatNumber, SimSnapshot } from './reporter';

// ─── Argument Parser ───────────────────────────────────────────────────

function parseArgs(args: string[]): { command: string; flags: Record<string, string | boolean>; positional: string[] } {
  const flags: Record<string, string | boolean> = {};
  const positional: string[] = [];
  let command = 'help';

  let i = 0;
  if (args.length > 0 && !args[0].startsWith('-')) {
    command = args[0];
    i = 1;
  }

  for (; i < args.length; i++) {
    const arg = args[i];
    if (arg.startsWith('--')) {
      const key = arg.slice(2);
      if (key.includes('=')) {
        const [k, v] = key.split('=', 2);
        flags[k] = v;
      } else if (i + 1 < args.length && !args[i + 1].startsWith('-')) {
        flags[key] = args[++i];
      } else {
        flags[key] = true;
      }
    } else if (arg.startsWith('-') && arg.length === 2) {
      const key = arg.slice(1);
      if (i + 1 < args.length && !args[i + 1].startsWith('-')) {
        flags[key] = args[++i];
      } else {
        flags[key] = true;
      }
    } else {
      positional.push(arg);
    }
  }

  return { command, flags, positional };
}

function getNum(flags: Record<string, string | boolean>, key: string, def: number): number {
  const val = flags[key];
  if (val === undefined || val === true) return def;
  const n = Number(val);
  return isNaN(n) ? def : n;
}

function getStr(flags: Record<string, string | boolean>, key: string, def: string): string {
  const val = flags[key];
  if (val === undefined || val === true) return def;
  return String(val);
}

function getBool(flags: Record<string, string | boolean>, key: string): boolean {
  return flags[key] === true || flags[key] === 'true';
}

// ─── Commands ──────────────────────────────────────────────────────────

function cmdRun(flags: Record<string, string | boolean>, positional: string[]) {
  const ticks = getNum(flags, 'ticks', 1000);
  const dt = getNum(flags, 'dt', 0.016);
  const speed = getNum(flags, 'speed', 1);
  const interval = getNum(flags, 'interval', 50);
  const quiet = getBool(flags, 'quiet') || getBool(flags, 'q');
  const output = getStr(flags, 'output', '') || getStr(flags, 'o', '');
  const format = getStr(flags, 'format', 'json') as 'json' | 'csv';
  const saveState = getStr(flags, 'save-state', '') || getStr(flags, 'save', '');

  // Load from file if specified
  const loadFile = getStr(flags, 'load', '') || (positional.length > 0 ? positional[0] : '');

  const config = defaultConfig({
    width: getNum(flags, 'width', 1200),
    height: getNum(flags, 'height', 800),
    initialParticles: getNum(flags, 'population', 300),
    maxParticles: getNum(flags, 'max-particles', 2000),
    friction: getNum(flags, 'friction', 0.92),
    repulsion: getNum(flags, 'repulsion', 20.0),
    nutrientSpawnRate: getNum(flags, 'nutrient-rate', 10.0),
    mutationRate: getNum(flags, 'mutation-rate', 0.1),
  });

  if (!quiet) {
    banner();
    console.log(`  ${c.dim}Config:${c.reset} ${c.white}${config.initialParticles}${c.reset} particles, ${c.white}${config.width}x${config.height}${c.reset} world`);
    console.log(`  ${c.dim}Run:${c.reset}    ${c.white}${formatNumber(ticks)}${c.reset} ticks @ dt=${c.white}${dt}${c.reset}, speed=${c.white}${speed}x${c.reset}, interval=${c.white}${interval}${c.reset}`);
    console.log('');
  }

  let result: RunResult;

  if (loadFile) {
    if (!quiet) console.log(`  ${c.cyan}Loading state from:${c.reset} ${loadFile}`);
    const stateJson = fs.readFileSync(loadFile, 'utf-8');
    const state = JSON.parse(stateJson) as SimState;
    if (!quiet) console.log(`  ${c.green}✓${c.reset} Loaded: pop=${state.particles.length}, time=${state.time.toFixed(0)}s\n`);
    result = runFromState(state, config, { ticks, dt, speed, interval, quiet });
  } else {
    result = runSimulation({ ticks, dt, speed, config, interval, quiet });
  }

  if (!quiet) {
    console.log('\n');
    printStatsTable(result.finalSnapshot);
    console.log(`\n  ${c.bold}${c.green}✓ Completed ${formatNumber(ticks)} ticks in ${formatDuration(result.totalMs)}${c.reset} (${c.cyan}${formatNumber(result.ticksPerSec, 1)} ticks/s${c.reset})\n`);
  }

  // Save final state
  if (saveState) {
    const stateJson = JSON.stringify(result.engine.state, (key, val) => {
      if (val instanceof Float32Array) {
        return Array.from(val);
      }
      return val;
    });
    fs.writeFileSync(saveState, stateJson);
    if (!quiet) console.log(`  ${c.green}✓${c.reset} State saved to: ${c.white}${saveState}${c.reset}\n`);
  }

  // Export data
  if (output) {
    const what = getStr(flags, 'what', 'summary');
    const data = exportData(result.engine.state, what, format);
    fs.writeFileSync(output, data);
    if (!quiet) console.log(`  ${c.green}✓${c.reset} Exported ${what} (${format}) to: ${c.white}${output}${c.reset}\n`);
  }
}

function cmdBenchmark(flags: Record<string, string | boolean>) {
  const ticks = getNum(flags, 'ticks', 500);
  const runs = getNum(flags, 'runs', 3);
  const population = getNum(flags, 'population', 300);

  banner();
  console.log(`  ${c.dim}Benchmark:${c.reset} ${c.white}${runs}${c.reset} runs × ${c.white}${formatNumber(ticks)}${c.reset} ticks, ${c.white}${population}${c.reset} initial particles\n`);

  const config = defaultConfig({ initialParticles: population });
  const results: { ticks: number; totalMs: number; ticksPerSec: number; avgMsPerTick: number }[] = [];

  for (let run = 0; run < runs; run++) {
    process.stdout.write(`  ${c.dim}Run ${run + 1}/${runs}...${c.reset}`);
    const result = runSimulation({ ticks, dt: 0.016, speed: 1, config, interval: 0, quiet: true });
    results.push({
      ticks,
      totalMs: result.totalMs,
      ticksPerSec: result.ticksPerSec,
      avgMsPerTick: result.totalMs / ticks,
    });
    process.stdout.write(` ${c.green}done${c.reset} (${formatDuration(result.totalMs)}, final pop: ${result.finalSnapshot.population})\n`);
  }

  printBenchmarkResult(`${population} particles, ${formatNumber(ticks)} ticks`, results);
  console.log('');
}

function cmdBatch(flags: Record<string, string | boolean>, positional: string[]) {
  const configFile = positional[0] || getStr(flags, 'config', '');
  if (!configFile) {
    console.error(`${c.red}Error:${c.reset} Batch mode requires a config file.`);
    console.log(`\n  Usage: genesis-cli batch <config.json>`);
    console.log(`\n  Config format (JSON array):`);
    console.log(`  [
    { "name": "small", "ticks": 500, "population": 100 },
    { "name": "large", "ticks": 500, "population": 500, "mutation-rate": 0.2 }
  ]`);
    process.exit(1);
  }

  banner();

  const rawConfig = fs.readFileSync(configFile, 'utf-8');
  const scenarios = JSON.parse(rawConfig) as Array<Record<string, any>>;

  console.log(`  ${c.dim}Batch:${c.reset} ${c.white}${scenarios.length}${c.reset} scenarios from ${c.white}${configFile}${c.reset}\n`);

  const outputDir = getStr(flags, 'output-dir', '') || getStr(flags, 'o', '');
  if (outputDir) {
    fs.mkdirSync(outputDir, { recursive: true });
  }
  const format = getStr(flags, 'format', 'json') as 'json' | 'csv';

  const allResults: { name: string; result: RunResult }[] = [];

  for (let i = 0; i < scenarios.length; i++) {
    const scenario = scenarios[i];
    const name = scenario.name || `scenario_${i + 1}`;
    const ticks = scenario.ticks || 1000;
    const dt = scenario.dt || 0.016;

    const config = defaultConfig({
      initialParticles: scenario.population || 300,
      maxParticles: scenario['max-particles'] || 2000,
      width: scenario.width || 1200,
      height: scenario.height || 800,
      mutationRate: scenario['mutation-rate'] || 0.1,
      nutrientSpawnRate: scenario['nutrient-rate'] || 10.0,
      friction: scenario.friction || 0.92,
      repulsion: scenario.repulsion || 20.0,
    });

    process.stdout.write(`  ${c.cyan}[${i + 1}/${scenarios.length}]${c.reset} ${c.white}${name}${c.reset} (${formatNumber(ticks)} ticks, pop=${config.initialParticles})... `);

    const result = runSimulation({ ticks, dt, speed: scenario.speed || 1, config, interval: 0, quiet: true });
    allResults.push({ name, result });

    console.log(`${c.green}✓${c.reset} ${formatDuration(result.totalMs)} | pop=${result.finalSnapshot.population} species=${result.finalSnapshot.species}`);

    // Save per-scenario output
    if (outputDir) {
      const summaryData = exportFullSummary(result.engine.state, format);
      const ext = format === 'csv' ? 'csv' : 'json';
      fs.writeFileSync(path.join(outputDir, `${name}_summary.${ext}`), summaryData);

      const particlesData = exportParticles(result.engine.state.particles, format);
      fs.writeFileSync(path.join(outputDir, `${name}_particles.${ext}`), particlesData);

      const speciesData = exportSpecies(result.engine.state.speciesHistory, format);
      fs.writeFileSync(path.join(outputDir, `${name}_species.${ext}`), speciesData);
    }
  }

  // Summary table
  console.log(`\n${c.bold}${c.cyan}┌──────────────────┬──────────┬──────────┬──────────┬──────────────┐${c.reset}`);
  console.log(`${c.cyan}│${c.reset} ${c.bold}Scenario${c.reset}         ${c.cyan}│${c.reset} ${c.bold}Pop${c.reset}      ${c.cyan}│${c.reset} ${c.bold}Species${c.reset}  ${c.cyan}│${c.reset} ${c.bold}Energy${c.reset}   ${c.cyan}│${c.reset} ${c.bold}Ticks/s${c.reset}      ${c.cyan}│${c.reset}`);
  console.log(`${c.cyan}├──────────────────┼──────────┼──────────┼──────────┼──────────────┤${c.reset}`);
  for (const { name, result } of allResults) {
    const s = result.finalSnapshot;
    console.log(`${c.cyan}│${c.reset} ${name.padEnd(16).slice(0, 16)} ${c.cyan}│${c.reset} ${String(s.population).padEnd(8)} ${c.cyan}│${c.reset} ${String(s.species).padEnd(8)} ${c.cyan}│${c.reset} ${s.avgEnergy.toFixed(1).padEnd(8)} ${c.cyan}│${c.reset} ${formatNumber(result.ticksPerSec, 1).padEnd(12)} ${c.cyan}│${c.reset}`);
  }
  console.log(`${c.bold}${c.cyan}└──────────────────┴──────────┴──────────┴──────────┴──────────────┘${c.reset}\n`);

  if (outputDir) {
    console.log(`  ${c.green}✓${c.reset} All results exported to: ${c.white}${outputDir}/${c.reset}\n`);
  }
}

function cmdExport(flags: Record<string, string | boolean>, positional: string[]) {
  const inputFile = positional[0] || getStr(flags, 'input', '') || getStr(flags, 'i', '');
  if (!inputFile) {
    console.error(`${c.red}Error:${c.reset} Export requires a save file.`);
    console.log(`\n  Usage: genesis-cli export <save_file.json> [options]`);
    console.log(`    --what <type>    What to export: particles, species, history, genomes, summary, all (default: summary)`);
    console.log(`    --format <fmt>   Output format: json, csv (default: json)`);
    console.log(`    --output <path>  Output file (default: stdout)`);
    process.exit(1);
  }

  const format = getStr(flags, 'format', 'json') as 'json' | 'csv';
  const what = getStr(flags, 'what', 'summary');
  const output = getStr(flags, 'output', '') || getStr(flags, 'o', '');

  const stateJson = fs.readFileSync(inputFile, 'utf-8');
  const state = JSON.parse(stateJson) as SimState;

  // Restore Float32Array
  if (state.pheromones && !(state.pheromones instanceof Float32Array)) {
    const pArray = new Float32Array(Object.keys(state.pheromones).length);
    for (const key in state.pheromones as any) {
      pArray[key as any] = (state.pheromones as any)[key];
    }
    state.pheromones = pArray;
  }

  if (what === 'all') {
    // Export everything to separate files
    const baseName = output || path.basename(inputFile, '.json');
    const dir = path.dirname(output || inputFile);
    const ext = format === 'csv' ? 'csv' : 'json';

    const files = [
      { name: `${baseName}_particles.${ext}`, data: exportParticles(state.particles, format) },
      { name: `${baseName}_species.${ext}`, data: exportSpecies(state.speciesHistory, format) },
      { name: `${baseName}_history.${ext}`, data: exportHistory(state.history, format) },
      { name: `${baseName}_genomes.${ext}`, data: exportGenomes(state.particles, format) },
      { name: `${baseName}_summary.${ext}`, data: exportFullSummary(state, format) },
    ];

    for (const f of files) {
      const fullPath = path.join(dir, f.name);
      fs.writeFileSync(fullPath, f.data);
      console.error(`  ${c.green}✓${c.reset} ${fullPath} (${(f.data.length / 1024).toFixed(1)} KB)`);
    }
    return;
  }

  const data = exportData(state, what, format);

  if (output) {
    fs.writeFileSync(output, data);
    console.error(`  ${c.green}✓${c.reset} Exported to: ${output}`);
  } else {
    process.stdout.write(data);
  }
}

function cmdInfo(flags: Record<string, string | boolean>, positional: string[]) {
  const inputFile = positional[0] || getStr(flags, 'input', '');
  if (!inputFile) {
    console.error(`${c.red}Error:${c.reset} Info requires a save file.`);
    console.log(`\n  Usage: genesis-cli info <save_file.json>`);
    process.exit(1);
  }

  banner();

  const stateJson = fs.readFileSync(inputFile, 'utf-8');
  const state = JSON.parse(stateJson) as SimState;

  const fileSizeKB = (Buffer.byteLength(stateJson) / 1024).toFixed(1);
  const activeSpecies = new Set(state.particles.map(p => p.speciesId));

  console.log(`  ${c.bold}${c.cyan}File:${c.reset}          ${c.white}${inputFile}${c.reset} (${fileSizeKB} KB)`);
  console.log(`  ${c.bold}${c.cyan}Sim Time:${c.reset}      ${c.white}${state.time.toFixed(1)}s${c.reset}`);
  console.log(`  ${c.bold}${c.cyan}Season:${c.reset}        ${c.white}${state.season}${c.reset}`);
  console.log(`  ${c.bold}${c.cyan}World:${c.reset}         ${c.white}${state.width}x${state.height}${c.reset}`);
  console.log('');
  console.log(`  ${c.bold}${c.green}Population:${c.reset}    ${c.white}${state.particles.length}${c.reset} organisms`);
  console.log(`  ${c.bold}${c.yellow}Species:${c.reset}       ${c.white}${activeSpecies.size}${c.reset} active / ${c.dim}${state.speciesHistory.length}${c.reset} total`);
  console.log(`  ${c.bold}${c.magenta}Extinct:${c.reset}       ${c.white}${state.speciesHistory.filter(s => s.extinct).length}${c.reset}`);

  if (state.particles.length > 0) {
    const avgEnergy = state.particles.reduce((a, b) => a + b.energy, 0) / state.particles.length;
    const avgComplexity = state.particles.reduce((a, b) => a + b.complexity, 0) / state.particles.length;
    const maxGen = Math.max(...state.particles.map(p => p.generation));
    const avgAge = state.particles.reduce((a, b) => a + b.age, 0) / state.particles.length;

    console.log('');
    console.log(`  ${c.bold}${c.yellow}Avg Energy:${c.reset}    ${c.white}${avgEnergy.toFixed(2)}${c.reset}`);
    console.log(`  ${c.bold}${c.magenta}Avg Complexity:${c.reset}${c.white}${avgComplexity.toFixed(2)}${c.reset}`);
    console.log(`  ${c.bold}${c.cyan}Max Generation:${c.reset}${c.white}${maxGen}${c.reset}`);
    console.log(`  ${c.bold}${c.blue}Avg Age:${c.reset}       ${c.white}${avgAge.toFixed(1)}s${c.reset}`);
  }

  console.log('');
  console.log(`  ${c.dim}Nutrients:${c.reset}     ${state.nutrients.length}`);
  console.log(`  ${c.dim}Viruses:${c.reset}       ${state.viruses.length}`);
  console.log(`  ${c.dim}Bonds:${c.reset}         ${state.bonds.length}`);
  console.log(`  ${c.dim}Obstacles:${c.reset}     ${state.obstacles.length}`);
  console.log(`  ${c.dim}Zones:${c.reset}         ${state.zones.length}`);
  console.log(`  ${c.dim}History Pts:${c.reset}   ${state.history.length}`);
  console.log('');
}

// ─── Help ──────────────────────────────────────────────────────────────

function cmdHelp() {
  banner();
  console.log(`${c.bold}Usage:${c.reset} npx tsx src/cli/index.ts ${c.cyan}<command>${c.reset} [options]
       npm run cli -- ${c.cyan}<command>${c.reset} [options]

${c.bold}Commands:${c.reset}

  ${c.cyan}run${c.reset}              Run a headless simulation
    --ticks <n>        Number of ticks (default: 1000)
    --dt <n>           Delta time per tick (default: 0.016)
    --speed <n>        Speed multiplier: N engine updates per tick (default: 1)
    --population <n>   Initial population (default: 300)
    --max-particles <n> Max particles (default: 2000, 0 = unlimited)
    --width <n>        World width (default: 1200)
    --height <n>       World height (default: 800)
    --mutation-rate <n> Mutation rate (default: 0.1)
    --nutrient-rate <n> Nutrient spawn rate (default: 10.0)
    --friction <n>     Friction coefficient (default: 0.92)
    --repulsion <n>    Repulsion force (default: 20.0)
    --interval <n>     Print stats every N ticks (default: 50)
    --load <file>      Load initial state from save file
    --save <file>      Save final state to file
    --output <file>    Export data to file
    --what <type>      What to export: summary, particles, species, history, genomes, all
    --format <fmt>     Export format: json, csv (default: json)
    --quiet            Suppress progress output

  ${c.cyan}benchmark${c.reset}        Performance benchmark
    --ticks <n>        Ticks per run (default: 500)
    --runs <n>         Number of runs (default: 3)
    --population <n>   Initial population (default: 300)

  ${c.cyan}batch${c.reset} <config>   Run multiple simulations from a JSON config
    --output-dir <dir> Directory for output files
    --format <fmt>     Export format: json, csv (default: json)

  ${c.cyan}export${c.reset} <file>    Export data from a save file
    --what <type>      Type: particles, species, history, genomes, summary, all
    --format <fmt>     Format: json, csv (default: json)
    --output <file>    Output file (default: stdout)

  ${c.cyan}info${c.reset} <file>      Show information about a save file

  ${c.cyan}help${c.reset}             Show this help message

${c.bold}Examples:${c.reset}

  ${c.dim}# Run 2000 ticks with 500 organisms and save state${c.reset}
  npm run cli -- run --ticks 2000 --population 500 --save state.json

  ${c.dim}# Benchmark with 1000 particles${c.reset}
  npm run cli -- benchmark --population 1000 --ticks 1000

  ${c.dim}# Export species data as CSV${c.reset}
  npm run cli -- export state.json --what species --format csv --output species.csv

  ${c.dim}# Run batch scenarios${c.reset}
  npm run cli -- batch scenarios.json --output-dir results/ --format csv

  ${c.dim}# Quick info about a save file${c.reset}
  npm run cli -- info state.json

  ${c.dim}# Resume from a save and run 500 more ticks${c.reset}
  npm run cli -- run --load state.json --ticks 500 --save state_v2.json

  ${c.dim}# Pipe export to another tool${c.reset}
  npm run cli -- export state.json --what particles --format csv | head -20
`);
}

// ─── Data Export Helper ────────────────────────────────────────────────

function exportData(state: SimState, what: string, format: 'json' | 'csv'): string {
  switch (what) {
    case 'particles': return exportParticles(state.particles, format);
    case 'species': return exportSpecies(state.speciesHistory, format);
    case 'history': return exportHistory(state.history, format);
    case 'genomes': return exportGenomes(state.particles, format);
    case 'summary': return exportFullSummary(state, format);
    default:
      console.error(`${c.red}Error:${c.reset} Unknown export type: ${what}`);
      console.log(`  Valid types: particles, species, history, genomes, summary, all`);
      process.exit(1);
  }
}

// ─── Main ──────────────────────────────────────────────────────────────

function main() {
  const { command, flags, positional } = parseArgs(process.argv.slice(2));

  try {
    switch (command) {
      case 'run':       cmdRun(flags, positional); break;
      case 'benchmark': cmdBenchmark(flags); break;
      case 'batch':     cmdBatch(flags, positional); break;
      case 'export':    cmdExport(flags, positional); break;
      case 'info':      cmdInfo(flags, positional); break;
      case 'help':
      case '--help':
      case '-h':        cmdHelp(); break;
      default:
        console.error(`${c.red}Error:${c.reset} Unknown command: ${command}`);
        console.log(`  Run ${c.cyan}genesis-cli help${c.reset} for usage.`);
        process.exit(1);
    }
  } catch (err: any) {
    console.error(`\n${c.red}Error:${c.reset} ${err.message}`);
    if (err.code === 'ENOENT') {
      console.error(`  File not found: ${err.path}`);
    }
    process.exit(1);
  }
}

main();
