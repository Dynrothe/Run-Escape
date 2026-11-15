import AdmZip from "adm-zip";
import * as fs from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Writable } from "node:stream";
import { runInNewContext } from "node:vm";

const require = createRequire(import.meta.url);
const source = fs.readFileSync(new URL("./download-caches.cjs", import.meta.url), "utf8");
const zip = new AdmZip();
zip.addFile("cache/main_file_cache.dat2", Buffer.from("cache data"));
zip.addFile("cache/main_file_cache.idx255", Buffer.from("index"));
zip.addFile("outside.txt", Buffer.from("not a cache file"));
const archiveBytes = new Uint8Array(zip.toBuffer());
const cacheName = "osrs-241_2026-09-30";
const cacheInfo = {
    id: 2727,
    scope: "runescape",
    game: "oldschool",
    environment: "live",
    language: "en",
    builds: [{ major: 241 }],
    timestamp: "2026-09-30T00:00:00Z",
    size: 100,
    indexes: 1,
    valid_indexes: 1,
    groups: 1,
    valid_groups: 1,
};
const retryHint = expect.stringContaining("CACHE_DOWNLOAD_TIMEOUT_MS");

type ArchiveFetch = (url: string, options: { signal: AbortSignal }) => Promise<Partial<Response>>;

async function runDownloader(
    fetchMock: ArchiveFetch,
    env: Record<string, string> = {},
    writeErrorOn?: string,
    writeDelayMs = 0,
) {
    const directory = fs.mkdtempSync(join(tmpdir(), "cache-download-test-"));
    const local = (path: string) => join(directory, path);
    const files = new Map<string, string>([
        ["src/game/cache.ts", `export const GAME_CACHE_NAME = "${cacheName}";`],
    ]);
    const error = vi.fn();
    const extract = vi.fn();
    const concatenate = vi.fn((parts: Uint8Array[]) => Buffer.concat(parts));
    const writeFile = vi.fn((path: string, content: string) => {
        fs.writeFileSync(local(path), content);
        files.set(path, content);
    });
    const finished = new Promise<number>((resolve) => {
        runInNewContext(source, {
            Buffer: { concat: concatenate },
            AbortController,
            setTimeout,
            clearTimeout,
            fetch: fetchMock,
            console: { log: vi.fn(), error },
            process: {
                argv: ["node", "scripts/download-caches.cjs"],
                env,
                stdin: { isTTY: false },
                stdout: {},
                exit: resolve,
            },
            require: (name: string) => {
                if (name === "fs") {
                    return {
                        readFileSync: (path: string) =>
                            files.get(path) ?? fs.readFileSync(local(path)),
                        existsSync: (path: string) => fs.existsSync(local(path)),
                        mkdirSync: (path: string) => fs.mkdirSync(local(path), { recursive: true }),
                        readdirSync: (path: string) => fs.readdirSync(local(path)),
                        lstatSync: (path: string) => fs.lstatSync(local(path)),
                        writeFileSync: writeFile,
                        createWriteStream: (
                            path: string,
                            options?: Parameters<typeof fs.createWriteStream>[1],
                        ) => {
                            if (path.endsWith(writeErrorOn ?? "\0")) {
                                return new Writable({
                                    write(_chunk, _encoding, callback) {
                                        callback(new Error("ENOSPC: disk full"));
                                    },
                                });
                            }
                            if (writeDelayMs && path.endsWith("disk.zip")) {
                                return new Writable({
                                    highWaterMark: 1,
                                    write(chunk, _encoding, callback) {
                                        setTimeout(
                                            () => fs.appendFile(local(path), chunk, callback),
                                            writeDelayMs,
                                        );
                                    },
                                });
                            }
                            return fs.createWriteStream(local(path), options);
                        },
                        promises: {
                            mkdtemp: async (prefix: string) => {
                                const temporary = await fs.promises.mkdtemp(local(prefix));
                                return temporary.slice(directory.length + 1);
                            },
                            rm: (path: string, options: fs.RmOptions) =>
                                fs.promises.rm(local(path), options),
                        },
                    };
                }
                if (name === "yauzl") {
                    return {
                        open: (path: string, ...args: unknown[]) => {
                            extract(path);
                            require("yauzl").open(local(path), ...args);
                        },
                    };
                }
                if (name === "readline") {
                    return { createInterface: () => ({ question: vi.fn() }) };
                }
                return require(name);
            },
        });
    });
    try {
        const exitCode = await finished;
        const cachePath = local(`caches/${cacheName}`);
        const remaining = fs.existsSync(cachePath) ? fs.readdirSync(cachePath) : [];
        for (const name of remaining) {
            const file = join(cachePath, name);
            if (fs.statSync(file).isFile()) {
                files.set(`caches/${cacheName}/${name}`, fs.readFileSync(file, "utf8"));
            }
        }
        return { exitCode, files, error, extract, writeFile, remaining, concatenate };
    } finally {
        fs.rmSync(directory, { recursive: true, force: true });
    }
}

function waitForAbort(signal: AbortSignal): Promise<never> {
    return new Promise((_resolve, reject) => {
        signal.addEventListener("abort", () => reject(signal.reason), { once: true });
    });
}

describe("cache download archive requests", () => {
    it("downloads the supported cache and writes its manifest without changing the revision", async () => {
        expect.hasAssertions();
        const fetchMock = vi
            .fn<ArchiveFetch>()
            .mockResolvedValueOnce(new Response(JSON.stringify([cacheInfo])))
            .mockResolvedValueOnce(new Response(archiveBytes))
            .mockResolvedValueOnce(new Response(JSON.stringify([{ group: 1, key: [1, 2, 3, 4] }])));

        const result = await runDownloader(fetchMock);

        expect(result.exitCode).toBe(0);
        expect(result.error).not.toHaveBeenCalled();
        expect(result.extract).toHaveBeenCalledTimes(1);
        expect(result.files.get(`caches/${cacheName}/main_file_cache.dat2`)).toBe("cache data");
        expect(result.files.get(`caches/${cacheName}/main_file_cache.idx255`)).toBe("index");
        expect(result.remaining).not.toContain("outside.txt");
        expect(result.remaining.some((name) => name.startsWith(".download-"))).toBe(false);
        expect(JSON.parse(result.files.get("caches/caches.json")!)).toEqual([
            expect.objectContaining({ name: cacheName, revision: 241 }),
        ]);
        expect(JSON.parse(result.files.get(`caches/${cacheName}/keys.json`)!)).toEqual({
            "1": [1, 2, 3, 4],
        });
        expect(fetchMock).toHaveBeenCalledTimes(3);
        for (const [, options] of fetchMock.mock.calls) {
            expect(options.signal).toBeInstanceOf(AbortSignal);
        }
    });

    it("gives up on a request that never receives headers, and says how to wait longer", async () => {
        expect.hasAssertions();
        const fetchMock = vi.fn<ArchiveFetch>((_url, options) => waitForAbort(options.signal));

        const result = await runDownloader(fetchMock, { CACHE_DOWNLOAD_TIMEOUT_MS: "20" });

        expect(result.exitCode).toBe(1);
        expect(fetchMock.mock.calls[0][1].signal.aborted).toBe(true);
        expect(result.error).toHaveBeenCalledWith(
            "Cache download failed:",
            expect.stringContaining(
                "Nothing arrived for 20 ms (https://archive.openrs2.org/caches.json)",
            ),
        );
        expect(result.error).toHaveBeenCalledWith(retryHint);
        expect(result.writeFile).not.toHaveBeenCalled();
    });

    it("gives up on a body that stops arriving, before extraction or metadata writes", async () => {
        expect.hasAssertions();
        const fetchMock = vi
            .fn<ArchiveFetch>()
            .mockResolvedValueOnce(new Response(JSON.stringify([cacheInfo])))
            .mockImplementationOnce(
                async (_url, options) =>
                    new Response(new ReadableStream({ pull: () => waitForAbort(options.signal) })),
            );

        const result = await runDownloader(fetchMock, { CACHE_DOWNLOAD_TIMEOUT_MS: "20" });

        expect(result.exitCode).toBe(1);
        expect(fetchMock.mock.calls[1][1].signal.aborted).toBe(true);
        expect(result.error).toHaveBeenCalledWith(
            "Cache download failed:",
            expect.stringContaining("disk.zip"),
        );
        expect(result.extract).not.toHaveBeenCalled();
        expect(result.writeFile).not.toHaveBeenCalled();
        expect(result.remaining).toEqual([]);
    });

    it("keeps a slow download going for as long as data arrives", async () => {
        expect.hasAssertions();
        let offset = 0;
        const slowArchive = new Response(
            new ReadableStream<Uint8Array>({
                async pull(controller) {
                    await new Promise((resolve) => setTimeout(resolve, 10));
                    if (offset < archiveBytes.length) {
                        controller.enqueue(archiveBytes.slice(offset, offset + 32));
                        offset += 32;
                    } else {
                        controller.close();
                    }
                },
            }),
        );
        const fetchMock = vi
            .fn<ArchiveFetch>()
            .mockResolvedValueOnce(new Response(JSON.stringify([cacheInfo])))
            .mockResolvedValueOnce(slowArchive)
            .mockResolvedValueOnce(new Response(JSON.stringify([])));

        const result = await runDownloader(fetchMock, { CACHE_DOWNLOAD_TIMEOUT_MS: "40" });

        expect(result.exitCode).toBe(0);
        expect(result.error).not.toHaveBeenCalled();
        expect(result.extract).toHaveBeenCalledTimes(1);
    });

    it("rejects an archive-list HTTP failure with the URL and status, without a retry hint", async () => {
        expect.hasAssertions();
        // No statusText, as over HTTP/2
        const fetchMock = vi
            .fn<ArchiveFetch>()
            .mockResolvedValue(new Response("Unavailable", { status: 503 }));

        const result = await runDownloader(fetchMock);

        expect(result.exitCode).toBe(1);
        expect(result.error).toHaveBeenCalledTimes(1);
        expect(result.error).toHaveBeenCalledWith(
            "Cache download failed:",
            "Archive request failed: 503 (https://archive.openrs2.org/caches.json)",
        );
        expect(result.writeFile).not.toHaveBeenCalled();
    });

    it("rejects a disk HTTP failure without extracting an error page", async () => {
        expect.hasAssertions();
        const fetchMock = vi
            .fn<ArchiveFetch>()
            .mockResolvedValueOnce(new Response(JSON.stringify([cacheInfo])))
            .mockResolvedValueOnce(
                new Response("Missing", { status: 404, statusText: "Not Found" }),
            );

        const result = await runDownloader(fetchMock);

        expect(result.exitCode).toBe(1);
        expect(result.error).toHaveBeenCalledWith(
            "Cache download failed:",
            expect.stringContaining(
                "404 Not Found (https://archive.openrs2.org/caches/runescape/2727/disk.zip)",
            ),
        );
        expect(result.extract).not.toHaveBeenCalled();
        expect(result.writeFile).not.toHaveBeenCalled();
    });

    it("reports a network error with its cause and the retry hint", async () => {
        expect.hasAssertions();
        const fetchMock = vi.fn<ArchiveFetch>().mockRejectedValue(
            Object.assign(new TypeError("fetch failed"), {
                cause: new Error("getaddrinfo ENOTFOUND archive.openrs2.org"),
            }),
        );

        const result = await runDownloader(fetchMock);

        expect(result.exitCode).toBe(1);
        expect(result.error).toHaveBeenCalledWith(
            "Cache download failed:",
            "fetch failed (getaddrinfo ENOTFOUND archive.openrs2.org)",
        );
        expect(result.error).toHaveBeenCalledWith(retryHint);
    });

    it("uses the default timeout when CACHE_DOWNLOAD_TIMEOUT_MS is blank", async () => {
        expect.hasAssertions();
        const fetchMock = vi
            .fn<ArchiveFetch>()
            .mockResolvedValueOnce(new Response(JSON.stringify([cacheInfo])))
            .mockResolvedValueOnce(new Response(archiveBytes))
            .mockResolvedValueOnce(new Response(JSON.stringify([])));

        const result = await runDownloader(fetchMock, { CACHE_DOWNLOAD_TIMEOUT_MS: " " });

        expect(result.exitCode).toBe(0);
        expect(result.error).not.toHaveBeenCalled();
    });

    it("does not treat slow disk writes as network inactivity", async () => {
        expect.hasAssertions();
        const fetchMock = vi
            .fn<ArchiveFetch>()
            .mockResolvedValueOnce(new Response(JSON.stringify([cacheInfo])))
            .mockResolvedValueOnce(new Response(archiveBytes))
            .mockResolvedValueOnce(new Response(JSON.stringify([])));

        const result = await runDownloader(
            fetchMock,
            { CACHE_DOWNLOAD_TIMEOUT_MS: "40" },
            undefined,
            120,
        );

        expect(result.exitCode).toBe(0);
        expect(result.error).not.toHaveBeenCalled();
        expect(result.files.get(`caches/${cacheName}/main_file_cache.dat2`)).toBe("cache data");
    });

    it("streams a large data entry without concatenating the ZIP in memory", async () => {
        expect.hasAssertions();
        const largeZip = new AdmZip();
        const size = 16 * 1024 * 1024;
        largeZip.addFile("cache/main_file_cache.dat2", Buffer.alloc(size, 7));
        const fetchMock = vi
            .fn<ArchiveFetch>()
            .mockResolvedValueOnce(new Response(JSON.stringify([cacheInfo])))
            .mockResolvedValueOnce(new Response(new Uint8Array(largeZip.toBuffer())))
            .mockResolvedValueOnce(new Response(JSON.stringify([])));

        const result = await runDownloader(fetchMock);

        expect(result.exitCode).toBe(0);
        const data = result.files.get(`caches/${cacheName}/main_file_cache.dat2`);
        expect(data?.length).toBe(size);
        expect(data?.charCodeAt(0)).toBe(7);
        expect(data?.charCodeAt(size - 1)).toBe(7);
        // Only caches.json and keys.json use Buffer.concat.
        expect(result.concatenate).toHaveBeenCalledTimes(2);
        expect(result.remaining).toEqual(["info.json", "keys.json", "main_file_cache.dat2"]);
    }, 30_000);

    it("cleans up a corrupt ZIP without marking the cache complete", async () => {
        expect.hasAssertions();
        const fetchMock = vi
            .fn<ArchiveFetch>()
            .mockResolvedValueOnce(new Response(JSON.stringify([cacheInfo])))
            .mockResolvedValueOnce(new Response("not a zip"));

        const result = await runDownloader(fetchMock);

        expect(result.exitCode).toBe(1);
        expect(result.error).toHaveBeenCalledTimes(1);
        expect(result.writeFile).not.toHaveBeenCalled();
        expect(result.remaining).toEqual([]);
    });

    it.each(["disk.zip", "main_file_cache.dat2"])(
        "reports disk failure writing %s and cleans up without metadata",
        async (writeErrorOn) => {
            expect.hasAssertions();
            const fetchMock = vi
                .fn<ArchiveFetch>()
                .mockResolvedValueOnce(new Response(JSON.stringify([cacheInfo])))
                .mockResolvedValueOnce(new Response(archiveBytes));

            const result = await runDownloader(fetchMock, {}, writeErrorOn);

            expect(result.exitCode).toBe(1);
            expect(result.error).toHaveBeenCalledWith(
                "Cache download failed:",
                "ENOSPC: disk full",
            );
            expect(result.writeFile).not.toHaveBeenCalled();
            expect(result.remaining.some((name) => name.startsWith(".download-"))).toBe(false);
        },
    );

    it.each(["0", "-1", "NaN", "1.5", "2147483648"])(
        "rejects invalid timeout %s before touching the archive, without a retry hint",
        async (timeout) => {
            expect.hasAssertions();
            const fetchMock = vi.fn<ArchiveFetch>();

            const result = await runDownloader(fetchMock, { CACHE_DOWNLOAD_TIMEOUT_MS: timeout });

            expect(result.exitCode).toBe(1);
            expect(fetchMock).not.toHaveBeenCalled();
            expect(result.error).toHaveBeenCalledTimes(1);
            expect(result.error).toHaveBeenCalledWith(
                "Cache download failed:",
                expect.stringContaining("CACHE_DOWNLOAD_TIMEOUT_MS must be a positive integer"),
            );
        },
    );
});
