async function instantiate(module, imports = {}) {
  const adaptedImports = {
    env: Object.setPrototypeOf({
      abort(message, fileName, lineNumber, columnNumber) {
        // ~lib/builtins/abort(~lib/string/String | null?, ~lib/string/String | null?, u32?, u32?) => void
        message = __liftString(message >>> 0);
        fileName = __liftString(fileName >>> 0);
        lineNumber = lineNumber >>> 0;
        columnNumber = columnNumber >>> 0;
        (() => {
          // @external.js
          throw Error(`${message} in ${fileName}:${lineNumber}:${columnNumber}`);
        })();
      },
      seed() {
        // ~lib/builtins/seed() => f64
        return (() => {
          // @external.js
          return Date.now() * Math.random();
        })();
      },
    }, Object.assign(Object.create(globalThis), imports.env || {})),
  };
  const { exports } = await WebAssembly.instantiate(module, adaptedImports);
  const memory = exports.memory || imports.env.memory;
  const adaptedExports = Object.setPrototypeOf({
    packParticleData() {
      // assembly/index/packParticleData() => ~lib/typedarray/Float32Array
      return __liftTypedArray(Float32Array, exports.packParticleData() >>> 0);
    },
    packNutrientData() {
      // assembly/index/packNutrientData() => ~lib/typedarray/Float32Array
      return __liftTypedArray(Float32Array, exports.packNutrientData() >>> 0);
    },
    packBondData() {
      // assembly/index/packBondData() => ~lib/typedarray/Float32Array
      return __liftTypedArray(Float32Array, exports.packBondData() >>> 0);
    },
    packVirusData() {
      // assembly/index/packVirusData() => ~lib/typedarray/Float32Array
      return __liftTypedArray(Float32Array, exports.packVirusData() >>> 0);
    },
    packSoundData() {
      // assembly/index/packSoundData() => ~lib/typedarray/Float32Array
      return __liftTypedArray(Float32Array, exports.packSoundData() >>> 0);
    },
    getPheromoneData() {
      // assembly/index/getPheromoneData() => ~lib/typedarray/Float32Array
      return __liftTypedArray(Float32Array, exports.getPheromoneData() >>> 0);
    },
    packSpeciesHistory() {
      // assembly/index/packSpeciesHistory() => ~lib/typedarray/Float64Array
      return __liftTypedArray(Float64Array, exports.packSpeciesHistory() >>> 0);
    },
    packHistory() {
      // assembly/index/packHistory() => ~lib/typedarray/Float64Array
      return __liftTypedArray(Float64Array, exports.packHistory() >>> 0);
    },
    packFullParticleData() {
      // assembly/index/packFullParticleData() => ~lib/typedarray/Float64Array
      return __liftTypedArray(Float64Array, exports.packFullParticleData() >>> 0);
    },
  }, exports);
  function __liftString(pointer) {
    if (!pointer) return null;
    const
      end = pointer + new Uint32Array(memory.buffer)[pointer - 4 >>> 2] >>> 1,
      memoryU16 = new Uint16Array(memory.buffer);
    let
      start = pointer >>> 1,
      string = "";
    while (end - start > 1024) string += String.fromCharCode(...memoryU16.subarray(start, start += 1024));
    return string + String.fromCharCode(...memoryU16.subarray(start, end));
  }
  function __liftTypedArray(constructor, pointer) {
    if (!pointer) return null;
    return new constructor(
      memory.buffer,
      __getU32(pointer + 4),
      __dataview.getUint32(pointer + 8, true) / constructor.BYTES_PER_ELEMENT
    ).slice();
  }
  let __dataview = new DataView(memory.buffer);
  function __getU32(pointer) {
    try {
      return __dataview.getUint32(pointer, true);
    } catch {
      __dataview = new DataView(memory.buffer);
      return __dataview.getUint32(pointer, true);
    }
  }
  return adaptedExports;
}
export const {
  memory,
  init,
  tick,
  setMaxParticles,
  setConfig,
  getParticleCount,
  packParticleData,
  getNutrientCount,
  packNutrientData,
  getBondCount,
  packBondData,
  getVirusCount,
  packVirusData,
  getSoundCount,
  packSoundData,
  getPheromoneData,
  getObstacleCount,
  getZoneCount,
  getSimTime,
  getSeason,
  getDayLight,
  getNoveltyCount,
  getSpeciesCount,
  getMaxGeneration,
  getAvgEnergy,
  getAvgComplexity,
  getSpeciesHistoryCount,
  packSpeciesHistory,
  getHistoryCount,
  packHistory,
  spawnNutrientAt,
  addPheromoneCommand,
  spawnVirusAt,
  killAt,
  addObstacleAt,
  addZoneAt,
  getClosestParticleId,
  moveParticle,
  resetEngine,
  getFullParticleDataSize,
  packFullParticleData,
} = await (async url => instantiate(
  await (async () => {
    const isNodeOrBun = typeof process != "undefined" && process.versions != null && (process.versions.node != null || process.versions.bun != null);
    if (isNodeOrBun) { return globalThis.WebAssembly.compile(await (await import("node:fs/promises")).readFile(url)); }
    else { return await globalThis.WebAssembly.compileStreaming(globalThis.fetch(url)); }
  })(), {
  }
))(new URL("release.wasm", import.meta.url));
