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

// A stand-in for the Cache API, keyed by URL
class FakeCache {
    readonly entries = new Map<string, Uint8Array>();

    async match(url: string): Promise<Response | undefined> {
        const data = this.entries.get(url);
        return data && new Response(data.slice());
    }

    async put(url: string, response: Response): Promise<void> {
        this.entries.set(url, new Uint8Array(await response.arrayBuffer()));
    }

    async delete(request: string | Request): Promise<boolean> {
        return this.entries.delete(typeof request === "string" ? request : request.url);
    }

    async keys(): Promise<Request[]> {
        return [...this.entries.keys()].map((url) => new Request(url));
    }
}

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
