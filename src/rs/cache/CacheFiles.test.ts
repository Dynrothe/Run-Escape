import { CacheFiles, DownloadProgress } from "./CacheFiles";
import { FakeCache } from "./testCache";

const BASE = "https://game.test/caches/test/";
const DAT = BASE + CacheFiles.DAT_FILE_NAME;
// Not a whole number of parts, so its last bytes are a part of their own
const SIZE = 5 * 1024 * 1024 + 12345;
const CHUNK = 64 * 1024;
const CUT_AT = 3 * 1024 * 1024;
const TO_END = Number.MAX_SAFE_INTEGER;

type Site = {
    dat: Uint8Array;
    modified: string;
    // Answers Range but not If-Range, as gameServer.ts and serve.mjs do
    ignoreIfRange?: boolean;
    // Cuts the next download of the file off after this many of its bytes
    cutAt?: number;
    requests: { range?: string; ifRange?: string }[];
};

function bytes(size: number, seed: number): Uint8Array {
    const data = new Uint8Array(size);
    for (let i = 0; i < size; i++) {
        data[i] = (i * 31 + seed * 7 + (i >> 8)) & 0xff;
    }
    return data;
}

function site(options: Partial<Site> = {}): Site {
    return {
        dat: bytes(SIZE, 1),
        modified: "Fri, 06 Nov 2026 19:00:00 GMT",
        requests: [],
        ...options,
    };
}

// The file's body in chunks, as a network would give it
function stream(body: Uint8Array, cutAt = Infinity): ReadableStream<Uint8Array> {
    let at = 0;
    return new ReadableStream({
        pull(controller) {
            if (at >= cutAt) {
                controller.error(new TypeError("network error"));
            } else if (at >= body.byteLength) {
                controller.close();
            } else {
                controller.enqueue(body.slice(at, at + CHUNK));
                at += CHUNK;
            }
        },
    });
}

// A server like the dev server's /caches: Range, If-Range against Last-Modified, and a 416 past
// the end. The index files are a few bytes each.
function serve(site: Site) {
    return async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
        if (String(input) !== DAT) {
            return new Response(new Uint8Array(6));
        }
        const headers = new Headers(init?.headers);
        const range = headers.get("Range") ?? undefined;
        const ifRange = headers.get("If-Range") ?? undefined;
        site.requests.push({ range, ifRange });
        const size = site.dat.byteLength;
        const partial =
            range !== undefined && (site.ignoreIfRange || !ifRange || ifRange === site.modified);
        const start = partial ? Number(/^bytes=(\d+)-/.exec(range)![1]) : 0;
        if (start >= size) {
            return new Response(null, {
                status: 416,
                headers: { "Content-Range": `bytes */${size}` },
            });
        }
        const body = site.dat.subarray(start);
        const cutAt = site.cutAt;
        site.cutAt = undefined;
        return new Response(stream(body, cutAt), {
            status: partial ? 206 : 200,
            headers: { "Content-Length": String(body.byteLength), "Last-Modified": site.modified },
        });
    };
}

async function load(site: Site, cache: FakeCache, progress?: DownloadProgress[]) {
    vi.stubGlobal("caches", { open: async () => cache });
    vi.stubGlobal("fetch", serve(site));
    try {
        const files = await CacheFiles.fetchDat(BASE, "test", false, undefined, (p) =>
            progress?.push(p),
        );
        return new Uint8Array(files.files.get(CacheFiles.DAT_FILE_NAME)!);
    } finally {
        await cache.settled();
    }
}

// Not toEqual, which goes through megabytes one element at a time
function expectSame(actual: Uint8Array | undefined, expected: Uint8Array) {
    expect(actual?.byteLength).toBe(expected.byteLength);
    expect(Buffer.compare(actual!, expected)).toBe(0);
}

function partBytes(cache: FakeCache): number {
    let total = 0;
    for (const [url, data] of cache.entries) {
        if (url.startsWith(DAT + "/part/")) {
            total += data.byteLength;
        }
    }
    return total;
}

describe("CacheFiles' download of a full cache", () => {
    afterEach(() => {
        vi.unstubAllGlobals();
        vi.restoreAllMocks();
    });

    test("keeps the whole file once it's downloaded, then drops its parts", async () => {
        const server = site();
        const cache = new FakeCache();
        expectSame(await load(server, cache), server.dat);
        expectSame(cache.entries.get(DAT), server.dat);
        expect(partBytes(cache)).toBe(0);

        server.requests.length = 0;
        expectSame(await load(server, cache), server.dat);
        expect(server.requests).toEqual([]);
    });

    test("picks up a cut-off download where its parts end, from the same copy", async () => {
        const server = site({ cutAt: CUT_AT });
        const cache = new FakeCache();
        await expect(load(server, cache)).rejects.toThrow("network error");
        const kept = partBytes(cache);
        expect(kept).toBeGreaterThan(0);

        expectSame(await load(server, cache), server.dat);
        expect(server.requests[1]).toEqual({
            range: `bytes=${kept}-${TO_END}`,
            ifRange: server.modified,
        });
    });

    test("starts again if the file's changed since its parts were saved", async () => {
        const server = site({ cutAt: CUT_AT });
        const cache = new FakeCache();
        await expect(load(server, cache)).rejects.toThrow("network error");

        server.dat = bytes(SIZE, 2);
        server.modified = "Sat, 07 Nov 2026 12:00:00 GMT";
        expectSame(await load(server, cache), server.dat);
    });

    test("starts again on a 416 for parts longer than the file", async () => {
        // A server that doesn't check If-Range, and a copy of the file that's got shorter since
        const server = site({ cutAt: CUT_AT, ignoreIfRange: true });
        const cache = new FakeCache();
        await expect(load(server, cache)).rejects.toThrow("network error");
        expect(partBytes(cache)).toBeGreaterThan(1024 * 1024);

        server.dat = bytes(1024 * 1024, 3);
        expectSame(await load(server, cache), server.dat);
        expectSame(cache.entries.get(DAT), server.dat);
    });

    test("keeps every byte in parts if the whole file can't be kept, and loads from them", async () => {
        vi.spyOn(console, "warn").mockImplementation(() => {});
        const server = site();
        const cache = new FakeCache();
        cache.refusePut = (url) => url === DAT;
        expectSame(await load(server, cache), server.dat);
        expect(cache.entries.has(DAT)).toBe(false);
        expect(partBytes(cache)).toBe(SIZE);

        // Room again: put together from the parts, with nothing downloaded
        cache.refusePut = () => false;
        server.requests.length = 0;
        expectSame(await load(server, cache), server.dat);
        expect(server.requests).toEqual([
            { range: `bytes=${SIZE}-${TO_END}`, ifRange: server.modified },
        ]);
        expectSame(cache.entries.get(DAT), server.dat);
        expect(partBytes(cache)).toBe(0);
    });

    test("loads on when a part can't be kept, and picks up from the parts before it", async () => {
        vi.spyOn(console, "warn").mockImplementation(() => {});
        const server = site();
        const cache = new FakeCache();
        cache.refusePut = (url) => url === DAT || url.endsWith("/part/?p=1");
        expectSame(await load(server, cache), server.dat);
        const kept = partBytes(cache);
        expect(cache.entries.has(DAT + "/part/?p=0")).toBe(true);
        expect([...cache.entries.keys()].filter((url) => url.includes("/part/"))).toHaveLength(1);

        cache.refusePut = () => false;
        server.requests.length = 0;
        expectSame(await load(server, cache), server.dat);
        expect(server.requests[0].range).toBe(`bytes=${kept}-${TO_END}`);
    });

    test("only counts parts that start where the one before ended", async () => {
        const server = site();
        const cache = new FakeCache();
        const part = (index: number, start: number, end: number) => {
            const url = `${DAT}/part/?p=${index}`;
            cache.entries.set(url, server.dat.slice(start, end));
            cache.headers.set(
                url,
                new Headers({
                    "Cache-Part": String(index),
                    "Cache-Offset": String(start),
                    "Cache-Modified": server.modified,
                }),
            );
        };
        // The second's from another download, whose first part was longer
        part(0, 0, 1000);
        part(1, 1500, 2500);
        expectSame(await load(server, cache), server.dat);
        expect(server.requests[0].range).toBe(`bytes=1000-${TO_END}`);
    });

    test("says when it's saving what it downloaded", async () => {
        const progress: DownloadProgress[] = [];
        await load(site(), new FakeCache(), progress);
        expect(progress.at(-1)).toMatchObject({ total: SIZE, current: SIZE, saving: true });
        expect(progress.slice(0, -1).some((p) => p.saving)).toBe(false);
    });
});
