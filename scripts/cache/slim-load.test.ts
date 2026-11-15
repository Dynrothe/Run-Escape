import fs from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { Worker } from "node:worker_threads";

import { GAME_CACHE_NAME } from "../../src/game/cache";
import { getRecipe } from "../../src/game/scaperune/squares";
import { LoadedCache } from "../../src/mapviewer/Caches";
import { createTypeLoaders } from "../../src/mapviewer/worker/WorkerState";
import { CacheFiles } from "../../src/rs/cache/CacheFiles";
import { CacheSystem } from "../../src/rs/cache/CacheSystem";
import { CacheGroup, buildCacheFiles, packChunks } from "../../src/rs/cache/ChunkedCache";
import { getCacheLoaderFactory } from "../../src/rs/cache/loader/CacheLoaderFactory";
import { MemoryStore } from "../../src/rs/cache/store/MemoryStore";
import { SectorCluster } from "../../src/rs/cache/store/SectorCluster";
import { ArchiveTypeLoader } from "../../src/rs/config/TypeLoader";
import { Hasher } from "../../src/util/Hasher";
import { loadCache, loadCacheInfos } from "./load-util";
import type { WorkerReply } from "./slim-cache-worker";
import { extractUnit } from "./slim-load";
import { SlimUnit, batchByKey, getSlimUnits } from "./slim-plan";
import { mergeUnitReads, reusableUnitReads, storeUnitReads, unitId } from "./slim-unit-cache";

// Vite prefers browser codecs; extraction workers run the Node variants.
vi.mock("../../src/rs/compression/Gzip", () => vi.importActual("../../src/rs/compression/Gzip.ts"));
vi.mock("../../src/rs/compression/Bzip2", () =>
    vi.importActual("../../src/rs/compression/Bzip2.ts"),
);

test("the plan has unique, serializable payloads and separate asset groups", () => {
    const units = getSlimUnits("recipes");
    expect(new Set(units.map(unitId)).size).toBe(units.length);
    expect(structuredClone(units)).toEqual(units);
    expect(units.filter((unit) => unit.kind === "map").length).toBeGreaterThan(1);
    for (const kind of ["textures", "sounds", "sprites"]) {
        expect(units.filter((unit) => unit.kind === kind)).toHaveLength(1);
    }
    expect(units.filter((unit) => unit.kind === "icons").length).toBeGreaterThan(1);
    for (const unit of units) {
        if (unit.kind === "bake") {
            expect(unit.requests.length).toBeGreaterThan(0);
            expect(unit.requests.length).toBeLessThanOrEqual(25);
        }
        // Only a ScapeRune map's reads depend on the recipes
        if (unit.kind === "map") {
            expect(unit.recipe).toBe(getRecipe(unit.id) ? "recipes" : undefined);
        }
    }
});

describe("batchByKey", () => {
    const keys = Array.from({ length: 500 }, (_, i) => `item-${i}`);
    const batch = (items: string[]) => batchByKey(items, (key) => key, 16, 25);
    const changed = (before: string[][], after: string[][]) => {
        const kept = new Set(before.map((items) => items.join()));
        return after.filter((items) => !kept.has(items.join())).length;
    };

    test("keeps every item once, in full batches at most, whatever order they come in", () => {
        const batches = batch(keys);
        expect(batches.flat().sort()).toEqual([...keys].sort());
        expect(Math.max(...batches.map((items) => items.length))).toBeLessThanOrEqual(25);
        expect(batch([...keys].reverse())).toEqual(batches);
    });

    test("adding or taking out an item changes only the batches around it", () => {
        const before = batch(keys);
        for (const after of [batch([...keys, "item-new"]), batch(keys.slice(1))]) {
            expect(changed(before, after)).toBeGreaterThan(0);
            expect(changed(before, after)).toBeLessThanOrEqual(2);
        }
    });

    test("keeps items with the same key together", () => {
        const items = [...keys, ...keys.slice(0, 100)];
        for (const group of batch(items)) {
            for (const key of new Set(group)) {
                expect(group.filter((item) => item === key)).toHaveLength(
                    items.filter((item) => item === key).length,
                );
            }
        }
    });
});

const hasCache = fs.existsSync(`caches/${GAME_CACHE_NAME}/main_file_cache.dat2`);

describe.skipIf(!hasCache)("independent extraction with the game cache", () => {
    let cache: LoadedCache;
    beforeAll(async () => {
        await Hasher.init();
        cache = loadCache(loadCacheInfos().find((info) => info.name === GAME_CACHE_NAME)!);
    }, 60000);

    const map: SlimUnit = {
        kind: "map",
        id: "lumbridge",
        region: { baseX: 3200, baseY: 3200, sizeX: 8, sizeY: 8, plane: 0 },
    };
    const icons: SlimUnit = { kind: "icons", objIds: [2570] };
    const bake: SlimUnit = {
        kind: "bake",
        group: "base",
        requests: [{ kind: "obj", key: "bones", objId: 526, count: 1 }],
    };

    test("incremental and cold extraction give identical chunks, independent of unit order", async () => {
        const extract = async (unit: SlimUnit, from = cache) => {
            const reads = await extractUnit(from, unit);
            // Keep a long cache-backed test responsive on a busy release runner.
            await new Promise<void>((resolve) => setImmediate(resolve));
            return reads;
        };
        const store = MemoryStore.fromFiles(cache.files);
        const indexCount =
            cache.files.files.get(CacheFiles.META_FILE_NAME)!.byteLength / SectorCluster.SIZE;
        const indexSizes = Array.from(
            { length: indexCount },
            (_, id) => (store.getIndexFile(id)?.byteLength ?? 0) / SectorCluster.SIZE,
        );
        const groupsFor = (reads: Set<string>): CacheGroup[] => {
            const keys = new Set(reads);
            for (let id = 0; id < indexCount; id++) {
                keys.add(`255:${id}`);
            }
            const groups: CacheGroup[] = [];
            for (const key of keys) {
                const [indexId, archiveId] = key.split(":").map(Number);
                const index = store.getIndexFile(indexId);
                if (!index || (archiveId + 1) * SectorCluster.SIZE > index.byteLength) {
                    continue;
                }
                const data = store.read(indexId, archiveId);
                if (data.length > 0) {
                    groups.push({ indexId, archiveId, data: new Uint8Array(data) });
                }
            }
            return groups;
        };
        const dir = fs.mkdtempSync(path.join(tmpdir(), "slim-extraction-"));
        try {
            const initial = new Map<string, string[]>();
            for (const unit of [map, icons, bake]) {
                initial.set(unitId(unit), await extract(unit));
            }
            storeUnitReads(dir, "same-runtime", [map, icons, bake], initial);
            const changed: SlimUnit = { kind: "icons", objIds: [2570, 526] };
            const units = [bake, changed, map];
            const incremental = reusableUnitReads(dir, "same-runtime", units);
            const pending = units.filter((unit) => !incremental.has(unitId(unit)));
            expect(pending).toEqual([changed]);
            for (const unit of pending) {
                incremental.set(unitId(unit), await extract(unit));
            }

            const cold = new Map<string, string[]>();
            for (const unit of units) {
                cold.set(unitId(unit), await extract(unit));
            }
            expect(cold.get(unitId(map))).toEqual(initial.get(unitId(map)));
            expect(cold.get(unitId(bake))).toEqual(initial.get(unitId(bake)));
            expect(incremental).toEqual(cold);
            const groups = groupsFor(mergeUnitReads(incremental));
            expect(packChunks(groups)).toEqual(packChunks(groupsFor(mergeUnitReads(cold))));

            const slim = {
                ...cache,
                info: { ...cache.info, slimOf: cache.info.name },
                files: buildCacheFiles(groups, indexSizes),
            };
            for (const unit of units) {
                expect(await extract(unit, slim)).toEqual(cold.get(unitId(unit)));
            }
        } finally {
            fs.rmSync(dir, { recursive: true, force: true });
        }
    }, 180000);

    test("workers return complete read lists even when the same unit runs twice", async () => {
        const info = loadCacheInfos().find((info) => info.name === GAME_CACHE_NAME)!;
        const worker = new Worker(new URL("./slim-cache-boot.mjs", import.meta.url), {
            workerData: {
                info,
                entry: new URL("./slim-cache-worker.ts", import.meta.url).href,
            },
        });
        try {
            const replies: string[][] = [];
            await new Promise<void>((resolve, reject) => {
                const queue = [icons, bake, icons];
                worker.on("error", reject);
                worker.on("exit", (code) => reject(new Error(`Worker stopped: ${code}`)));
                worker.on("message", (reply: WorkerReply) => {
                    if ("error" in reply) {
                        reject(new Error(reply.error));
                        return;
                    }
                    if ("reads" in reply) {
                        replies.push(reply.reads);
                    }
                    const next = queue.shift();
                    if (next) {
                        worker.postMessage(next);
                    } else {
                        resolve();
                    }
                });
            });
            expect(replies).toHaveLength(3);
            expect(replies[0].length).toBeGreaterThan(0);
            expect(replies[2]).toEqual(replies[0]);
        } finally {
            await worker.terminate();
        }
    }, 60000);

    // What lets a worker make them once for every unit
    test("the type loaders a worker shares read nothing after they're made", () => {
        const factory = getCacheLoaderFactory(
            cache.info,
            CacheSystem.fromFiles(cache.type, cache.files),
        );
        const shared = Object.values(createTypeLoaders(factory)).filter(
            (loader) => loader instanceof ArchiveTypeLoader,
        );
        expect(shared.length).toBeGreaterThan(0);
        const reads: string[] = [];
        const read = MemoryStore.prototype.read;
        MemoryStore.prototype.read = function (indexId, archiveId) {
            reads.push(`${indexId}:${archiveId}`);
            return read.call(this, indexId, archiveId);
        };
        try {
            for (const loader of shared) {
                for (let id = 0; id < loader.getCount(); id += 13) {
                    loader.load(id);
                }
            }
        } finally {
            MemoryStore.prototype.read = read;
        }
        expect(reads).toEqual([]);
    }, 60000);

    test("extracts one unit at a time", async () => {
        const first = extractUnit(cache, icons);
        await expect(extractUnit(cache, icons)).rejects.toThrow("one at a time");
        expect((await first).length).toBeGreaterThan(0);
    }, 30000);

    test("a failed extraction restores read tracking", async () => {
        const read = MemoryStore.prototype.read;
        await expect(
            extractUnit({ ...cache, files: new CacheFiles(new Map()) }, icons),
        ).rejects.toThrow();
        expect(MemoryStore.prototype.read).toBe(read);
        expect((await extractUnit(cache, icons)).length).toBeGreaterThan(0);
    }, 30000);
});
