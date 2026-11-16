import {
    CacheGroup,
    buildCacheFiles,
    fetchChunks,
    getChunkFileName,
    getChunkSpan,
    packChunks,
    readChunk,
} from "./ChunkedCache";
import { MemoryStore } from "./store/MemoryStore";
import { FakeCache } from "./testCache";

// MemoryStore only needs the meta index's id from it, and the rest pulls in a wasm decompressor
// that vitest can't load
vi.mock("./CacheIndex", () => ({ CacheIndex: { META_INDEX_ID: 255 } }));

function group(indexId: number, archiveId: number, size: number, fill = archiveId): CacheGroup {
    const data = new Uint8Array(size);
    for (let i = 0; i < size; i++) {
        data[i] = (fill + i * 7) & 0xff;
    }
    return { indexId, archiveId, data };
}

// Groups across a few indexes and chunk ranges, some spanning many sectors
function sampleGroups(): CacheGroup[] {
    const span = getChunkSpan(7);
    return [
        group(0, 3, 40),
        group(2, 9, 3000),
        group(7, 1, 600),
        group(7, 2, 1),
        group(7, span + 5, 2048),
        group(7, 3 * span, 100),
        group(255, 7, 700),
    ];
}

async function names(chunks: Uint8Array[]): Promise<string[]> {
    return Promise.all(chunks.map(getChunkFileName));
}

describe("packChunks", () => {
    test("gives the same bytes and names whatever order the groups come in", async () => {
        const groups = sampleGroups();
        const a = packChunks(groups);
        const b = packChunks([...groups].reverse());
        expect(b).toEqual(a);
        expect(await names(b)).toEqual(await names(a));
        expect(a.length).toBeGreaterThan(3);
    });

    test("a changed group renames only its own chunk", async () => {
        const groups = sampleGroups();
        const before = await names(packChunks(groups));
        const changed = groups.map((g) =>
            g.indexId === 7 && g.archiveId === getChunkSpan(7) + 5
                ? group(7, g.archiveId, 2048, 1)
                : g,
        );
        const after = await names(packChunks(changed));
        expect(after.length).toBe(before.length);
        const renamed = after.filter((name, i) => name !== before[i]);
        expect(renamed).toHaveLength(1);
        // The model's chunk: 0:3, 2:9, 7:1+7:2, then the one that changed
        expect(after.indexOf(renamed[0])).toBe(3);
    });

    test("a new group renames only the chunk its range falls in", async () => {
        const groups = sampleGroups();
        const before = await names(packChunks(groups));
        const after = await names(packChunks([...groups, group(7, 3 * getChunkSpan(7) + 1, 50)]));
        expect(after.filter((name) => !before.includes(name))).toHaveLength(1);
        expect(before.filter((name) => !after.includes(name))).toHaveLength(1);
    });

    test("refuses the same group twice", () => {
        expect(() => packChunks([group(7, 1, 10), group(7, 1, 20)])).toThrow("twice");
    });
});

describe("readChunk", () => {
    test("reads back what was packed", () => {
        const groups = sampleGroups();
        const read = packChunks(groups).flatMap(readChunk);
        expect(read).toEqual(groups);
    });

    test("throws on a cut-off chunk", () => {
        const [chunk] = packChunks([group(2, 9, 3000)]);
        expect(() => readChunk(chunk.subarray(0, chunk.byteLength - 1))).toThrow("partway");
        expect(() => readChunk(chunk.subarray(0, 4))).toThrow("partway");
    });
});

describe("buildCacheFiles", () => {
    test("every group reads back as it went in, and a group left out reads as empty", () => {
        const groups = [...sampleGroups(), group(5, 70000, 1500)];
        const indexSizes = [10, 0, 20, 0, 0, 70001, 0, 3 * getChunkSpan(7) + 1];
        const files = buildCacheFiles(groups, indexSizes, true);
        expect(files.files.get("main_file_cache.dat2")).toBeInstanceOf(SharedArrayBuffer);
        const store = MemoryStore.fromFiles(files);
        for (const { indexId, archiveId, data } of groups) {
            expect(new Uint8Array(store.read(indexId, archiveId).buffer)).toEqual(data);
        }
        expect(store.read(7, 4).length).toBe(0);
        expect(files.files.get("main_file_cache.idx255")!.byteLength).toBe(indexSizes.length * 6);
        expect(files.files.get("main_file_cache.idx7")!.byteLength).toBe(indexSizes[7] * 6);
    });

    test("throws for a group outside its index", () => {
        expect(() => buildCacheFiles([group(7, 5, 10)], [0, 0, 0, 0, 0, 0, 0, 5])).toThrow(
            "outside",
        );
    });
});

const BASE = "https://game.test/caches/chunks/";

async function served(groups: CacheGroup[]) {
    const chunks = packChunks(groups);
    const files = await names(chunks);
    const bodies = new Map(files.map((file, i) => [BASE + file, chunks[i]]));
    const requested: string[] = [];
    const fetcher = async (url: RequestInfo | URL) => {
        requested.push(String(url));
        const body = bodies.get(String(url));
        return body ? new Response(body.slice()) : new Response(null, { status: 404 });
    };
    const list = files.map((file, i) => ({ file, size: chunks[i].byteLength }));
    return { chunks, list, bodies, requested, fetcher };
}

describe("fetchChunks", () => {
    test("downloads a missing chunk while another stored read is pending, with exact progress", async () => {
        const cache = new FakeCache();
        const site = await served(sampleGroups());
        for (let i = 1; i < site.list.length; i++) {
            cache.entries.set(BASE + site.list[i].file, site.chunks[i]);
        }
        let release!: () => void;
        const blocked = new Promise<void>((resolve) => (release = resolve));
        const match = cache.match.bind(cache);
        vi.spyOn(cache, "match").mockImplementation(async (request) => {
            if (request === BASE + site.list.at(-1)!.file) {
                await blocked;
            }
            return match(request);
        });
        const onProgress = vi.fn();
        const loading = fetchChunks(BASE, site.list, cache as unknown as Cache, {
            fetcher: site.fetcher,
            onProgress,
        });
        try {
            await vi.waitFor(() => {
                expect(cache.entries.get(BASE + site.list[0].file)).toEqual(site.chunks[0]);
            });
            expect(site.requested).toEqual([BASE + site.list[0].file]);
            expect(onProgress).not.toHaveBeenCalled();
        } finally {
            release();
        }
        expect(await loading).toEqual(site.chunks);
        expect(onProgress).toHaveBeenCalledExactlyOnceWith({
            total: site.chunks[0].byteLength,
            current: site.chunks[0].byteLength,
            part: site.chunks[0],
        });
    });

    test("checks and downloads a few at a time each, and reports a download as it lands", async () => {
        const cache = new FakeCache();
        // Nothing stored: a first load
        const site = await served(
            Array.from({ length: 14 }, (_, i) => group(7, i * getChunkSpan(7), 10)),
        );
        let releaseReads!: () => void;
        const reads = new Promise<void>((resolve) => (releaseReads = resolve));
        let reading = 0;
        let mostReading = 0;
        const match = cache.match.bind(cache);
        const read = vi.spyOn(cache, "match").mockImplementation(async (request) => {
            mostReading = Math.max(mostReading, ++reading);
            await reads;
            reading--;
            return match(request);
        });
        // Each download held until it's let go, or none once they're open
        const gates = new Map<string, () => void>();
        let open = false;
        let downloading = 0;
        let mostDownloading = 0;
        const fetcher = vi.fn(async (url: RequestInfo | URL) => {
            mostDownloading = Math.max(mostDownloading, ++downloading);
            if (!open) {
                await new Promise<void>((resolve) => gates.set(String(url), resolve));
            }
            downloading--;
            return site.fetcher(url);
        });
        const onProgress = vi.fn();
        const loading = fetchChunks(BASE, site.list, cache as unknown as Cache, {
            fetcher,
            onProgress,
        });
        const total = site.chunks.reduce((sum, bytes) => sum + bytes.byteLength, 0);
        try {
            await vi.waitFor(() => expect(read).toHaveBeenCalledTimes(6));
            expect(fetcher).not.toHaveBeenCalled();
            releaseReads();
            // Every check finishes with the downloads held, so the total's known
            await vi.waitFor(() => expect(read).toHaveBeenCalledTimes(site.list.length));
            await vi.waitFor(() => expect(fetcher).toHaveBeenCalledTimes(6));
            // and the first to land counts at once, while the rest are still coming
            gates.get(BASE + site.list[0].file)!();
            await vi.waitFor(() => expect(onProgress).toHaveBeenCalledTimes(1));
            expect(onProgress).toHaveBeenCalledWith({
                total,
                current: site.chunks[0].byteLength,
                part: site.chunks[0],
            });
        } finally {
            releaseReads();
            open = true;
            gates.forEach((release) => release());
        }
        expect(await loading).toEqual(site.chunks);
        expect(mostReading).toBe(6);
        expect(mostDownloading).toBe(6);
        expect(onProgress).toHaveBeenCalledTimes(site.list.length);
        let current = 0;
        for (const [progress] of onProgress.mock.calls) {
            current += progress.part.byteLength;
            expect(progress).toEqual({ total, current, part: progress.part });
        }
        expect(current).toBe(total);
    });

    test("does not start downloads or prune stored chunks when aborted during local reads", async () => {
        const cache = new FakeCache();
        const site = await served(sampleGroups());
        cache.entries.set(BASE + "old.bin", new Uint8Array([1]));
        let release!: () => void;
        const blocked = new Promise<void>((resolve) => (release = resolve));
        const read = vi.spyOn(cache, "match").mockImplementation(async () => {
            await blocked;
            return undefined;
        });
        const controller = new AbortController();
        const loading = fetchChunks(BASE, site.list, cache as unknown as Cache, {
            fetcher: site.fetcher,
            signal: controller.signal,
        });
        const rejected = expect(loading).rejects.toThrow("abort");
        try {
            await vi.waitFor(() => expect(read).toHaveBeenCalledTimes(6));
            controller.abort();
        } finally {
            release();
        }
        await rejected;
        expect(site.requested).toEqual([]);
        expect(cache.entries.has(BASE + "old.bin")).toBe(true);
    });

    test("downloads what it doesn't have, keeps it, and drops chunks no longer listed", async () => {
        const cache = new FakeCache();
        const old = await served(sampleGroups());
        await fetchChunks(BASE, old.list, cache as unknown as Cache, { fetcher: old.fetcher });
        expect(old.requested).toHaveLength(old.list.length);
        expect(cache.entries.size).toBe(old.list.length);

        // An update that changes one group
        const groups = sampleGroups().map((g) =>
            g.indexId === 2 ? group(2, g.archiveId, 3000, 5) : g,
        );
        const next = await served(groups);
        const changed = next.list.filter((chunk) => !old.list.some((o) => o.file === chunk.file));
        expect(changed).toHaveLength(1);

        const got = await fetchChunks(BASE, next.list, cache as unknown as Cache, {
            fetcher: next.fetcher,
        });
        expect(next.requested).toEqual([BASE + changed[0].file]);
        expect(got).toEqual(next.chunks);
        expect([...cache.entries.keys()].sort()).toEqual(
            next.list.map((chunk) => BASE + chunk.file).sort(),
        );
    });

    test("fetches again a stored chunk that isn't whole", async () => {
        const cache = new FakeCache();
        const site = await served(sampleGroups());
        const [first] = site.list;
        cache.entries.set(BASE + first.file, site.chunks[0].subarray(1));
        const got = await fetchChunks(BASE, site.list, cache as unknown as Cache, {
            fetcher: site.fetcher,
        });
        expect(got[0]).toEqual(site.chunks[0]);
        expect(site.requested).toContain(BASE + first.file);
    });

    test("fetches again a stored chunk that's damaged but the right length", async () => {
        const cache = new FakeCache();
        const site = await served(sampleGroups());
        const [first] = site.list;
        const damaged = site.chunks[0].slice();
        damaged[damaged.length - 1] ^= 0xff;
        cache.entries.set(BASE + first.file, damaged);
        const got = await fetchChunks(BASE, site.list, cache as unknown as Cache, {
            fetcher: site.fetcher,
        });
        expect(got[0]).toEqual(site.chunks[0]);
        expect(site.requested).toContain(BASE + first.file);
        expect(cache.entries.get(BASE + first.file)).toEqual(site.chunks[0]);
    });

    test("tries once more past the browser's cache, then refuses a file that isn't its name", async () => {
        const cache = new FakeCache();
        const site = await served(sampleGroups());
        const [first] = site.list;
        site.bodies.set(BASE + first.file, site.chunks[1]);
        const modes: (RequestCache | undefined)[] = [];
        const fetcher = async (url: RequestInfo | URL, init?: RequestInit) => {
            modes.push(String(url) === BASE + first.file ? init?.cache : undefined);
            return site.fetcher(url);
        };
        await expect(
            fetchChunks(BASE, site.list, cache as unknown as Cache, { fetcher }),
        ).rejects.toThrow(first.file);
        expect(modes.filter((mode) => mode === "reload")).toHaveLength(1);
        expect(cache.entries.has(BASE + first.file)).toBe(false);
    });

    test("says which chunk the server hasn't got", async () => {
        const site = await served(sampleGroups());
        site.bodies.delete(BASE + site.list[2].file);
        await expect(
            fetchChunks(BASE, site.list, new FakeCache() as unknown as Cache, {
                fetcher: site.fetcher,
            }),
        ).rejects.toThrow(`${site.list[2].file}: 404`);
    });
});
