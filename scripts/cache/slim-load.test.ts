import fs from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { Worker } from "node:worker_threads";

import { GAME_CACHE_NAME } from "../../src/game/cache";
import { CacheFiles } from "../../src/rs/cache/CacheFiles";
import { CacheGroup, buildCacheFiles, packChunks } from "../../src/rs/cache/ChunkedCache";
import { MemoryStore } from "../../src/rs/cache/store/MemoryStore";
import { SectorCluster } from "../../src/rs/cache/store/SectorCluster";
import { Hasher } from "../../src/util/Hasher";
import { loadCache, loadCacheInfos } from "./load-util";
import type { WorkerReply } from "./slim-cache-worker";
import { extractUnit } from "./slim-load";
import { SlimUnit, getSlimUnits } from "./slim-plan";
import { mergeUnitReads, reusableUnitReads, storeUnitReads, unitId } from "./slim-unit-cache";

// Vite prefers browser codecs; extraction workers run the Node variants.
vi.mock("../../src/rs/compression/Gzip", () => vi.importActual("../../src/rs/compression/Gzip.ts"));
vi.mock("../../src/rs/compression/Bzip2", () =>
    vi.importActual("../../src/rs/compression/Bzip2.ts"),
);

test("the plan has unique, serializable payloads and separate asset groups", () => {
    const units = getSlimUnits();
    expect(new Set(units.map(unitId)).size).toBe(units.length);
    expect(structuredClone(units)).toEqual(units);
    expect(units.filter((unit) => unit.kind === "map").length).toBeGreaterThan(1);
    for (const kind of ["textures", "sounds", "sprites", "icons"]) {
        expect(units.filter((unit) => unit.kind === kind)).toHaveLength(1);
    }
    for (const unit of units) {
        if (unit.kind === "bake") {
            expect(unit.requests.length).toBeGreaterThan(0);
            expect(unit.requests.length).toBeLessThanOrEqual(25);
        }
    }
});

const hasCache = fs.existsSync(`caches/${GAME_CACHE_NAME}/main_file_cache.dat2`);

describe.skipIf(!hasCache)("independent extraction with the game cache", () => {
    const map: SlimUnit = {
        kind: "map",
        id: "lumbridge",
        region: { baseX: 3200, baseY: 3200, sizeX: 8, sizeY: 8, plane: 0 },
    };
    const icons: SlimUnit = { kind: "icons", objIds: [2570] };
    const bake: SlimUnit = {
        kind: "bake",
        group: "base",
        from: 0,
        requests: [{ kind: "obj", key: "bones", objId: 526, count: 1 }],
    };

    test("incremental and cold extraction give identical chunks, independent of unit order", async () => {
        await Hasher.init();
        const cache = loadCache(loadCacheInfos().find((info) => info.name === GAME_CACHE_NAME)!);
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

    test("a failed extraction restores read tracking", async () => {
        const cache = loadCache(loadCacheInfos().find((info) => info.name === GAME_CACHE_NAME)!);
        const read = MemoryStore.prototype.read;
        await expect(
            extractUnit({ ...cache, files: new CacheFiles(new Map()) }, icons),
        ).rejects.toThrow();
        expect(MemoryStore.prototype.read).toBe(read);
    });
});
