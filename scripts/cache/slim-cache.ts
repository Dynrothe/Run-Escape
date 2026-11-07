// Writes a slim copy of the game's cache for hosting: only the groups the game
// reads, in chunks (src/rs/cache/ChunkedCache.ts), so a first visit downloads a
// few MB instead of the whole cache, and an update only the chunks that changed.
//
// What the game reads is found by loading what it loads, with its own loaders:
// textures, models (enemies, spot animations, pickups and power-ups, the player
// in every outfit and every wearable item), its sounds and sprites, an icon for
// every item in the content, and each map's arena with the map squares around
// it. slim-plan.ts splits that into units (a map, a batch of bakes) and
// slim-load.ts loads them, in worker threads. The chunks are written to the out
// dir and read back, and every group has to come out of them as it went in.
// Then it all gets loaded again from those chunks, and a group that's missing
// fails the script.
//
//   bun run tsx scripts/cache/slim-cache.ts [out dir]
//
//   SLIM_WORKERS=n    worker threads, each holding a copy of the full cache;
//                     the cores less one, up to 4, unless it's set
//   SLIM_CHECK=0      skip loading it again from the slim cache (local runs only)
//   SLIM_REUSE=0      load it all, reusing neither the last run nor its units
//
// The out dir (dist/caches by default, so run it after the build) gets the
// chunks in chunks/, each named after its sha256, and a caches.json listing
// them, with the build it was made for (dist/build.json): the game won't load
// another build's. The same cache and content always give the same chunks.
// Make it again after every build. A checked run is kept in caches/slim/, and
// when its runtime dependencies, configuration and full cache haven't changed,
// the next run reuses it rather than loading it all. When they have, it keeps
// what each unit read, and the next run loads only the units whose own inputs
// changed (slim-unit-cache.ts).
import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Worker } from "node:worker_threads";

import { GAME_CACHE_NAME } from "../../src/game/cache";
import { assembleChunkedCache } from "../../src/mapviewer/Caches";
import { CacheFiles } from "../../src/rs/cache/CacheFiles";
import { CacheIndex } from "../../src/rs/cache/CacheIndex";
import { CacheInfo } from "../../src/rs/cache/CacheInfo";
import {
    CHUNK_DIR,
    CacheGroup,
    getChunkFileName,
    isChunk,
    packChunks,
} from "../../src/rs/cache/ChunkedCache";
import { MemoryStore } from "../../src/rs/cache/store/MemoryStore";
import { SectorCluster } from "../../src/rs/cache/store/SectorCluster";
import { loadCache, loadCacheInfos } from "./load-util";
import type { WorkerData, WorkerReply } from "./slim-cache-worker";
import { findReusable, hashInputSets, pruneChunks, storeRun, writeChunks } from "./slim-files";
import type { SlimUnit } from "./slim-plan";
import {
    UnitReads,
    checkUnitIds,
    mergeUnitReads,
    reusableUnitReads,
    storeUnitReads,
    unitId,
} from "./slim-unit-cache";

const outDir = (process.argv[2] ?? "dist/caches").replace(/\/?$/, "/");
const chunkDir = outDir + CHUNK_DIR;

// The last checked run, for reuse
const STORE_DIR = "caches/slim/";

const CHECK = process.env.SLIM_CHECK !== "0";
const REUSE = process.env.SLIM_REUSE !== "0";

function getWorkerCount(): number {
    const setting = process.env.SLIM_WORKERS ?? "";
    if (setting === "") {
        return Math.max(1, Math.min(4, (os.availableParallelism?.() ?? os.cpus().length) - 1));
    }
    const count = Number(setting);
    if (!Number.isInteger(count) || count < 1) {
        throw new Error(`SLIM_WORKERS=${setting}: it takes a whole number of threads, 1 or more`);
    }
    return count;
}

type Pass = {
    workers: number;
    units: SlimUnit[];
    describe: (unit: SlimUnit) => string;
};

// Runs the units across the workers, each taking the next as it finishes one,
// and gives back every group they read
async function runPass(
    label: string,
    data: Omit<WorkerData, "entry">,
    { workers: count, units, describe }: Pass,
): Promise<UnitReads> {
    const started = performance.now();
    const reads: UnitReads = new Map();
    const boot = new URL("./slim-cache-boot.mjs", import.meta.url);
    const entry = new URL("./slim-cache-worker.ts", import.meta.url).href;
    let next = 0;
    let done = 0;
    const workers: Worker[] = [];
    const runWorker = () =>
        new Promise<void>((resolve, reject) => {
            const worker = new Worker(boot, { workerData: { ...data, entry } });
            workers.push(worker);
            let unit: SlimUnit | undefined;
            let finished = false;
            const give = () => {
                unit = units[next++];
                if (unit) {
                    worker.postMessage(unit);
                } else {
                    finished = true;
                    worker.terminate().then(() => resolve(), reject);
                }
            };
            worker.on("message", (reply: WorkerReply) => {
                if ("error" in reply) {
                    reject(new Error(`${describe(unit!)} failed: ${reply.error}`));
                    return;
                }
                if ("reads" in reply) {
                    reads.set(unitId(unit!), reply.reads);
                    done++;
                }
                give();
            });
            // An error outside a unit's own work, such as running out of memory
            worker.on("error", (e) =>
                reject(unit ? new Error(`${describe(unit)} failed`, { cause: e }) : e),
            );
            worker.on("exit", (code) => {
                if (!finished) {
                    const doing = unit ? ` on ${describe(unit)}` : "";
                    reject(new Error(`A worker stopped (${code})${doing}`));
                }
            });
        });
    const running = Math.min(count, units.length);
    try {
        await Promise.all(Array.from({ length: running }, runWorker));
    } finally {
        await Promise.all(workers.map((worker) => worker.terminate()));
    }
    const seconds = ((performance.now() - started) / 1000).toFixed(0);
    console.log(`${label}: ${done} units on ${running} workers in ${seconds}s`);
    return reads;
}

function parseKey(key: string): [number, number] {
    const [indexId, archiveId] = key.split(":").map(Number);
    return [indexId, archiveId];
}

function getIndexId(fileName: string): number | undefined {
    if (!fileName.startsWith(CacheFiles.INDEX_FILE_PREFIX)) {
        return undefined;
    }
    return parseInt(fileName.slice(CacheFiles.INDEX_FILE_PREFIX.length));
}

// A group's stored size, from its index file entry
function getGroupSize(files: CacheFiles, indexId: number, archiveId: number): number {
    const indexFile = files.files.get(CacheFiles.INDEX_FILE_PREFIX + indexId);
    const ptr = archiveId * SectorCluster.SIZE;
    if (!indexFile || ptr + SectorCluster.SIZE > indexFile.byteLength) {
        return 0;
    }
    const entry = new Uint8Array(indexFile, ptr, 3);
    return (entry[0] << 16) | (entry[1] << 8) | entry[2];
}

// The groups the game reads, as they are in the full cache. A group the full
// cache lists but hasn't got can't be kept: those are returned apart.
function readGroups(full: CacheFiles, keys: string[]): { groups: CacheGroup[]; absent: string[] } {
    const store = MemoryStore.fromFiles(full);
    const groups: CacheGroup[] = [];
    const absent: string[] = [];
    for (const key of keys) {
        const [indexId, archiveId] = parseKey(key);
        if (getGroupSize(full, indexId, archiveId) === 0) {
            absent.push(key);
            continue;
        }
        const data = store.read(indexId, archiveId);
        groups.push({
            indexId,
            archiveId,
            data: new Uint8Array(data.buffer, data.byteOffset, data.length),
        });
    }
    return { groups, absent };
}

// How many archive ids each index file has room for, by index: the slim cache
// keeps the lengths, so a group it left out reads as missing, not out of range
function getIndexSizes(full: CacheFiles): number[] {
    const indexCount = full.files.get(CacheFiles.META_FILE_NAME)!.byteLength / SectorCluster.SIZE;
    return Array.from({ length: indexCount }, (_, indexId) => {
        const indexFile = full.files.get(CacheFiles.INDEX_FILE_PREFIX + indexId);
        return indexFile ? indexFile.byteLength / SectorCluster.SIZE : 0;
    });
}

// The build in dist/build.json (written by bun run build), for an out dir in
// dist. The game checks it against its own.
function readBuildId(): string | undefined {
    const file = path.join(outDir, "..", "build.json");
    try {
        const { build } = JSON.parse(fs.readFileSync(file, "utf8"));
        return typeof build === "string" ? build : undefined;
    } catch {
        return undefined;
    }
}

// What the slim cache is made from, as three fingerprints, from the runtime
// imports esbuild traces, the configuration and the full cache (its listing,
// keys and file lengths, which change when a download fills one in):
// - run: the whole script, for reusing the last run as it is
// - units: what any unit's reads depend on besides its own inputs (the workers'
//   code), for reusing units
// - recipes: ScapeRune's recipe code, which the workers import by address, part
//   of the inputs of each map with a recipe (slim-plan.ts)
// Undefined, with a warning, if one can't be read: then the run is neither
// reused nor kept.
type SlimInputs = { run: string; units: string; recipes: string };

async function hashSlimInputs(fullInfo: CacheInfo): Promise<SlimInputs | undefined> {
    const cacheDir = `caches/${GAME_CACHE_NAME}/`;
    // Worker entry points are passed through URLs and workerData, not static imports.
    const workers = ["scripts/cache/slim-cache-worker.ts", "scripts/cache/slim-cache-boot.mjs"];
    try {
        const cacheFiles = fs
            .readdirSync(cacheDir)
            .sort()
            .map((file) => [file, fs.statSync(cacheDir + file).size]);
        const [run, units, recipes] = await hashInputSets(
            [
                ["scripts/cache/slim-cache.ts", ...workers],
                [...workers, "scripts/cache/slim-unit-cache.ts"],
                ["src/game/scaperune/squares.ts"],
            ],
            ["bun.lock", "tsconfig.json", cacheDir + "info.json", cacheDir + "keys.json"],
            JSON.stringify({
                cache: fullInfo,
                files: cacheFiles,
                // It adds ScapeRune's dev maps to the content (content/maps.ts)
                devMaps: process.env.DEV_MAPS === "1",
            }),
        );
        return { run, units, recipes };
    } catch (e) {
        console.warn(`Couldn't hash what the slim cache is made from, so it's not reused: ${e}`);
        return undefined;
    }
}

function formatMb(bytes: number): string {
    return (bytes / 1024 / 1024).toFixed(1).padStart(6) + " MB";
}

function printSummary(full: CacheFiles, keys: string[]): void {
    const kept = new Map<number, { groups: number; bytes: number }>();
    for (const [indexId, archiveId] of keys.map(parseKey)) {
        const size = getGroupSize(full, indexId, archiveId);
        if (size > 0) {
            const index = kept.get(indexId) ?? { groups: 0, bytes: 0 };
            index.groups++;
            index.bytes += size;
            kept.set(indexId, index);
        }
    }
    const indexIds = [...full.files.keys()]
        .map(getIndexId)
        .filter((indexId) => indexId !== undefined)
        .sort((a, b) => a - b);
    console.log("index    groups kept              size kept");
    for (const indexId of indexIds) {
        const indexFile = full.files.get(CacheFiles.INDEX_FILE_PREFIX + indexId)!;
        let groups = 0;
        let bytes = 0;
        for (
            let archiveId = 0;
            archiveId < indexFile.byteLength / SectorCluster.SIZE;
            archiveId++
        ) {
            const size = getGroupSize(full, indexId, archiveId);
            if (size > 0) {
                groups++;
                bytes += size;
            }
        }
        const index = kept.get(indexId) ?? { groups: 0, bytes: 0 };
        console.log(
            String(indexId).padStart(5),
            `${index.groups} / ${groups}`.padStart(17),
            `${formatMb(index.bytes)} / ${formatMb(bytes)}`,
        );
    }
}

// Writes the chunks to the out dir and reads them back: they're what players
// download. caches.json, which says which chunks to load, isn't touched yet.
async function writeShippedChunks(files: string[], chunks: Uint8Array[]): Promise<Uint8Array[]> {
    writeChunks(chunkDir, files, chunks);
    const written = files.map((file) => new Uint8Array(fs.readFileSync(chunkDir + file)));
    for (let i = 0; i < files.length; i++) {
        if (!(await isChunk(files[i], written[i]))) {
            throw new Error(`${chunkDir}${files[i]} isn't what was written`);
        }
    }
    return written;
}

// Drops the chunks and the older slim caches caches.json won't list, then
// writes it, as players read it first
function finishPublish(info: CacheInfo, files: string[]): void {
    pruneChunks(chunkDir, files);
    // The slim caches from before chunks
    for (const entry of fs.readdirSync(outDir)) {
        if (/-slim-[0-9a-f]+$/.test(entry)) {
            fs.rmSync(outDir + entry, { recursive: true, force: true });
        }
    }
    fs.writeFileSync(outDir + "caches.json", JSON.stringify([info]), "utf8");
}

// Every group comes out of the chunks on disk as it went in
function checkGroups(full: CacheFiles, info: CacheInfo, written: Uint8Array[], keys: string[]) {
    const slim = MemoryStore.fromFiles(assembleChunkedCache(info, written, false).files);
    const fullStore = MemoryStore.fromFiles(full);
    for (const [indexId, archiveId] of keys.map(parseKey)) {
        const expected = fullStore.read(indexId, archiveId);
        const actual = slim.read(indexId, archiveId);
        if (Buffer.compare(Buffer.from(expected), Buffer.from(actual)) !== 0) {
            throw new Error(`Group ${indexId}:${archiveId} was written wrong`);
        }
    }
}

type SlimCache = { info: CacheInfo; files: string[]; chunks: Uint8Array[]; keys: string[] };

// Packs the groups the units read into chunks, writes them to the out dir and
// reads them back
async function makeSlimCache(
    fullInfo: CacheInfo,
    full: CacheFiles,
    results: UnitReads,
    build: string | undefined,
): Promise<SlimCache> {
    const reads = mergeUnitReads(results);
    const metaEntries = full.files.get(CacheFiles.META_FILE_NAME)!.byteLength;
    for (let indexId = 0; indexId < metaEntries / SectorCluster.SIZE; indexId++) {
        // The reference tables, for every index there is
        if (getGroupSize(full, CacheIndex.META_INDEX_ID, indexId) > 0) {
            reads.add(CacheIndex.META_INDEX_ID + ":" + indexId);
        }
    }
    const sorted = [...reads].sort((a, b) => {
        const [indexA, archiveA] = parseKey(a);
        const [indexB, archiveB] = parseKey(b);
        return indexA - indexB || archiveA - archiveB;
    });
    const { groups, absent } = readGroups(full, sorted);
    const keys = groups.map((group) => group.indexId + ":" + group.archiveId);
    printSummary(full, keys);
    if (absent.length > 0) {
        // The loaders went on without them. A download of the same cache with
        // them would give a different slim cache.
        console.warn(
            `${absent.length} groups the game asked for aren't in ${GAME_CACHE_NAME}: ` +
                absent.slice(0, 20).join(", ") +
                (absent.length > 20 ? ", ..." : ""),
        );
    }
    const chunks = packChunks(groups);
    const files = await Promise.all(chunks.map(getChunkFileName));
    const indexSizes = getIndexSizes(full);
    const xteas: Record<string, number[]> = JSON.parse(
        fs.readFileSync(`./caches/${GAME_CACHE_NAME}/keys.json`, "utf8"),
    );
    // Named after what's in it, not the build, so it's the same wherever it's made
    const hash = createHash("sha256")
        .update(JSON.stringify({ files, indexSizes, xteas }))
        .digest("hex");
    // The build goes last, where a reused run puts it, so both write the same caches.json
    const info: CacheInfo = {
        ...fullInfo,
        name: `${GAME_CACHE_NAME}-slim-${hash.slice(0, 8)}`,
        size: chunks.reduce((sum, chunk) => sum + chunk.byteLength, 0),
        slimOf: GAME_CACHE_NAME,
        indexSizes,
        xteas,
        chunks: files.map((file, i) => ({ file, size: chunks[i].byteLength })),
        build,
    };
    // Until caches.json is written, the out dir still says to load the chunks it had
    const written = await writeShippedChunks(files, chunks);
    checkGroups(full, info, written, keys);
    return { info, files, chunks, keys };
}

// Loads what the game loads again, from the chunks in the out dir. Gives back
// what each unit read, and the groups read that the full cache has and the
// slim one doesn't.
async function checkSlimCache(
    full: CacheFiles,
    slim: SlimCache,
    pass: Pass,
): Promise<{ reads: UnitReads; missing: string[] }> {
    console.log(`Checking ${slim.info.name}...`);
    const reads = await runPass(
        "Loaded it again from the slim cache",
        { info: slim.info, chunkDir },
        pass,
    );
    const kept = new Set(slim.keys);
    // Including reads whose error a loader caught and went on from
    const missing = [...mergeUnitReads(reads)].filter((key) => {
        const [indexId, archiveId] = parseKey(key);
        return !kept.has(key) && getGroupSize(full, indexId, archiveId) > 0;
    });
    return { reads, missing };
}

async function main(): Promise<void> {
    const started = performance.now();
    const workers = getWorkerCount();
    const fullInfo = loadCacheInfos().find((c) => c.name === GAME_CACHE_NAME);
    if (!fullInfo) {
        throw new Error(`Cache ${GAME_CACHE_NAME} not found in caches/caches.json`);
    }
    const build = readBuildId();
    if (build === undefined) {
        console.warn(
            `No build.json beside ${outDir}: the game won't check that its cache is its own. ` +
                "Run bun run build first.",
        );
    }

    const inputs = await hashSlimInputs(fullInfo);
    const reusable = REUSE && inputs ? await findReusable(STORE_DIR, inputs.run) : undefined;
    if (reusable) {
        const info: CacheInfo = { ...reusable, build };
        const files = reusable.chunks!.map((chunk) => chunk.file);
        const chunks = files.map(
            (file) => new Uint8Array(fs.readFileSync(STORE_DIR + CHUNK_DIR + file)),
        );
        await writeShippedChunks(files, chunks);
        finishPublish(info, files);
        console.log(
            `Nothing it reads has changed since the last run: reused ${info.name} ` +
                `(${files.length} chunks) for build ${build ?? "(none)"}. ` +
                "SLIM_REUSE=0 makes it again.",
        );
        return;
    }

    // The game's content and loaders, only when there's loading to do
    const { describeUnit, getSlimUnits } = await import("./slim-plan");
    // Without fingerprints nothing is reused or kept, so the recipes' doesn't matter
    const units = getSlimUnits(inputs?.recipes ?? "");
    checkUnitIds(units);
    const pass: Pass = { workers, units, describe: describeUnit };
    const reused: UnitReads =
        REUSE && inputs ? reusableUnitReads(STORE_DIR, inputs.units, units) : new Map();
    console.log(`Reused what ${reused.size} of ${units.length} units read last time`);
    const full = loadCache(fullInfo);
    const extract = (only: SlimUnit[]) => {
        console.log(`Loading what the game loads from ${GAME_CACHE_NAME}...`);
        return runPass("Loaded what the game loads", { info: fullInfo }, { ...pass, units: only });
    };
    const extracted = await extract(units.filter((unit) => !reused.has(unitId(unit))));
    let slim = await makeSlimCache(fullInfo, full.files, new Map([...reused, ...extracted]), build);

    // What each unit read from the checked slim cache, to keep for the next run
    let checked: UnitReads | undefined;
    if (CHECK) {
        // A loader that doesn't catch a missing group stops the check instead
        let check = await checkSlimCache(full.files, slim, pass).catch((error: unknown) => ({
            error,
        }));
        if (reused.size > 0 && ("error" in check || check.missing.length > 0)) {
            // Something changed that the fingerprints don't cover, so reused
            // reads can be short: load those units again rather than stop
            console.warn(
                ("error" in check
                    ? `The check failed: ${check.error instanceof Error ? check.error.message : check.error}`
                    : `Missing from the slim cache: ${check.missing.join(", ")}`) +
                    `\nLoading the ${reused.size} reused units again...`,
            );
            const again = await extract(units.filter((unit) => reused.has(unitId(unit))));
            slim = await makeSlimCache(
                fullInfo,
                full.files,
                new Map([...extracted, ...again]),
                build,
            );
            check = await checkSlimCache(full.files, slim, pass);
        }
        if ("error" in check) {
            throw check.error;
        }
        if (check.missing.length > 0) {
            throw new Error(`Missing from the slim cache: ${check.missing.join(", ")}`);
        }
        checked = check.reads;
    } else {
        console.warn("SLIM_CHECK=0: not loaded again from the slim cache, and not kept for reuse");
    }
    finishPublish(slim.info, slim.files);
    if (checked && inputs) {
        try {
            storeRun(STORE_DIR, inputs.run, slim.info, slim.files, slim.chunks);
            // With nothing missing, each unit read the same from the slim cache as
            // from the full one, and these were checked unit by unit, so a short
            // read list reused this time isn't kept
            storeUnitReads(STORE_DIR, inputs.units, units, checked);
        } catch (e) {
            console.warn(`Couldn't keep this run in ${STORE_DIR} for the next to reuse: ${e}`);
        }
    }

    const seconds = ((performance.now() - started) / 1000).toFixed(0);
    console.log(
        `Wrote ${outDir}caches.json: ${slim.info.name}, ${slim.files.length} chunks ` +
            `(${formatMb(slim.info.size).trim()}), for build ${build ?? "(none)"}, in ${seconds}s`,
    );
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
