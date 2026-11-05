// Writes a slim copy of the game's cache for hosting: only the groups the game
// reads, in chunks (src/rs/cache/ChunkedCache.ts), so a first visit downloads a
// few MB instead of the whole cache, and an update only the chunks that changed.
//
// What the game reads is found by loading what it loads, with its own loaders
// (slim-load.ts): the renderer's textures, every model it bakes (enemies, spot
// animations, pickups and power-ups, the player in every outfit and every
// wearable item), its sounds and sprites, an icon for every item in the
// content, and each map's arena with the map squares around it. The chunks are
// written to the out dir and read back, and every group has to come out of them
// as it went in. Then it all gets loaded again from those chunks, and a group
// that's missing fails the script. Both loads run in worker threads, a unit (a
// map, a batch of bakes) at a time.
//
//   bun run tsx scripts/cache/slim-cache.ts [out dir]
//
//   SLIM_WORKERS=n    worker threads, each holding a copy of the full cache;
//                     the cores less one, up to 4, unless it's set
//   SLIM_CHECK=0      skip loading it again from the slim cache (local runs only)
//   SLIM_REUSE=0      do it all even if nothing it reads has changed
//
// The out dir (dist/caches by default, so run it after the build) gets the
// chunks in chunks/, each named after its sha256, and a caches.json listing
// them, with the build it was made for (dist/build.json): the game won't load
// another build's. The same cache and content always give the same chunks.
// Make it again after every build. A checked run is kept in caches/slim/, and
// when nothing it read from (src/, scripts/cache/, the packages, the full
// cache) has changed since, the next run reuses it rather than loading it all.
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
import { findReusable, hashInputs, pruneChunks, storeRun, writeChunks } from "./slim-files";
import type { SlimUnit } from "./slim-load";

// Before slim-load.ts, which counts reads through it, is loaded
const readGroup = MemoryStore.prototype.read;

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
): Promise<Set<string>> {
    const started = performance.now();
    const reads = new Set<string>();
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
                    reply.reads.forEach((key) => reads.add(key));
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
        const data = readGroup.call(store, indexId, archiveId);
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

// Everything that decides what the slim cache holds: the game's code and
// content, this script, the packages and the full cache (its listing, keys, and
// every file's length, which download-caches changes when it fills one in).
// Undefined, with a warning, if one can't be read: then the run is neither
// reused nor kept.
function hashSlimInputs(fullInfo: CacheInfo): string | undefined {
    const cacheDir = `caches/${GAME_CACHE_NAME}/`;
    try {
        const cacheFiles = fs
            .readdirSync(cacheDir)
            .sort()
            .map((file) => [file, fs.statSync(cacheDir + file).size]);
        return hashInputs(
            ["src", "scripts/cache"],
            [
                "package.json",
                "bun.lock",
                "tsconfig.json",
                cacheDir + "info.json",
                cacheDir + "keys.json",
            ],
            JSON.stringify({ cache: fullInfo, files: cacheFiles }),
        );
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
        const expected = readGroup.call(fullStore, indexId, archiveId);
        const actual = readGroup.call(slim, indexId, archiveId);
        if (Buffer.compare(Buffer.from(expected), Buffer.from(actual)) !== 0) {
            throw new Error(`Group ${indexId}:${archiveId} was written wrong`);
        }
    }
}

// Loads what the game loads again, from the chunks in the out dir, and fails if
// that reads a group the full cache has and the slim one doesn't
async function checkSlimCache(
    full: CacheFiles,
    info: CacheInfo,
    keys: string[],
    pass: Pass,
): Promise<void> {
    const reads = await runPass("Loaded it again from the slim cache", { info, chunkDir }, pass);
    const kept = new Set(keys);
    // Including reads whose error a loader caught and went on from
    const missing = [...reads].filter((key) => {
        const [indexId, archiveId] = parseKey(key);
        return !kept.has(key) && getGroupSize(full, indexId, archiveId) > 0;
    });
    if (missing.length > 0) {
        throw new Error(`Missing from the slim cache: ${missing.join(", ")}`);
    }
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

    const inputs = hashSlimInputs(fullInfo);
    const reusable = REUSE && inputs ? await findReusable(STORE_DIR, inputs) : undefined;
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
    const { describeUnit, getSlimUnits } = await import("./slim-load");
    const pass: Pass = { workers, units: getSlimUnits(), describe: describeUnit };
    const full = loadCache(fullInfo);
    console.log(`Loading what the game loads from ${GAME_CACHE_NAME}...`);
    const reads = await runPass("Loaded what the game loads", { info: fullInfo }, pass);
    const metaEntries = full.files.files.get(CacheFiles.META_FILE_NAME)!.byteLength;
    for (let indexId = 0; indexId < metaEntries / SectorCluster.SIZE; indexId++) {
        // The reference tables, for every index there is
        if (getGroupSize(full.files, CacheIndex.META_INDEX_ID, indexId) > 0) {
            reads.add(CacheIndex.META_INDEX_ID + ":" + indexId);
        }
    }
    const sorted = [...reads].sort((a, b) => {
        const [indexA, archiveA] = parseKey(a);
        const [indexB, archiveB] = parseKey(b);
        return indexA - indexB || archiveA - archiveB;
    });
    const { groups, absent } = readGroups(full.files, sorted);
    const keys = groups.map((group) => group.indexId + ":" + group.archiveId);
    printSummary(full.files, keys);
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
    const indexSizes = getIndexSizes(full.files);
    const xteas: Record<string, number[]> = JSON.parse(
        fs.readFileSync(`./caches/${GAME_CACHE_NAME}/keys.json`, "utf8"),
    );
    // Named after what's in it, not the build, so it's the same wherever it's made
    const hash = createHash("sha256")
        .update(JSON.stringify({ files, indexSizes, xteas }))
        .digest("hex");
    const name = `${GAME_CACHE_NAME}-slim-${hash.slice(0, 8)}`;
    const size = chunks.reduce((sum, chunk) => sum + chunk.byteLength, 0);
    // The build goes last, where a reused run puts it, so both write the same caches.json
    const info: CacheInfo = {
        ...fullInfo,
        name,
        size,
        slimOf: GAME_CACHE_NAME,
        indexSizes,
        xteas,
        chunks: files.map((file, i) => ({ file, size: chunks[i].byteLength })),
        build,
    };

    // Until caches.json is written, the out dir still says to load the chunks it had
    const written = await writeShippedChunks(files, chunks);
    checkGroups(full.files, info, written, keys);
    if (CHECK) {
        console.log(`Checking ${name}...`);
        await checkSlimCache(full.files, info, keys, pass);
    } else {
        console.warn("SLIM_CHECK=0: not loaded again from the slim cache, and not kept for reuse");
    }
    finishPublish(info, files);
    if (CHECK && inputs) {
        try {
            storeRun(STORE_DIR, inputs, info, files, chunks);
        } catch (e) {
            console.warn(`Couldn't keep this run in ${STORE_DIR} for the next to reuse: ${e}`);
        }
    }

    const seconds = ((performance.now() - started) / 1000).toFixed(0);
    console.log(
        `Wrote ${outDir}caches.json: ${name}, ${files.length} chunks ` +
            `(${formatMb(size).trim()}), for build ${build ?? "(none)"}, in ${seconds}s`,
    );
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
