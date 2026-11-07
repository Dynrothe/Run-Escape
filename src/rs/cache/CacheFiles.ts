import { CacheType } from "./CacheType";
import { SectorCluster } from "./store/SectorCluster";

export class CacheFiles {
    static DAT_FILE_NAME = "main_file_cache.dat";
    static DAT2_FILE_NAME = "main_file_cache.dat2";

    static INDEX_FILE_PREFIX = "main_file_cache.idx";

    static META_FILE_NAME = "main_file_cache.idx255";

    static DAT_INDEX_COUNT = 5;

    static fetchFiles(
        cacheType: CacheType,
        baseUrl: string,
        name: string,
        shared: boolean = false,
        signal?: AbortSignal,
        progressListener?: ProgressListener,
    ): Promise<CacheFiles> {
        switch (cacheType) {
            case "legacy":
                return CacheFiles.fetchLegacy(baseUrl, name, shared, signal, progressListener);
            case "dat":
                return CacheFiles.fetchDat(baseUrl, name, shared, signal, progressListener);
            case "dat2":
                return CacheFiles.fetchDat2(baseUrl, name, [], shared, signal, progressListener);
        }
        throw new Error("Not implemented");
    }

    static async fetchLegacy(
        baseUrl: string,
        cacheName: string,
        shared: boolean = false,
        signal?: AbortSignal,
        progressListener?: ProgressListener,
    ): Promise<CacheFiles> {
        const files = new Map<string, ArrayBuffer>();

        const cache = await caches.open(cacheName);

        const modelsFilePromise = fetchCachedFile(
            baseUrl,
            "models",
            shared,
            false,
            cache,
            signal,
            progressListener,
        );

        const fileNames = ["title", "config", "media", "textures"];
        const filePromises = fileNames.map((name) =>
            fetchCachedFile(baseUrl, name, shared, false, cache, signal),
        );

        let mapNames: string[] = [];
        try {
            mapNames = await fetch(baseUrl + "maps.json").then((resp) => resp.json());
        } catch (e) {}

        for (const mapName of mapNames) {
            filePromises.push(
                fetchCachedFile(baseUrl, "maps/" + mapName, shared, false, cache, signal),
            );
        }

        const cachedFiles = await Promise.all([modelsFilePromise, ...filePromises]);

        for (const file of cachedFiles) {
            files.set(file.name, file.data);
        }

        return new CacheFiles(files);
    }

    static async fetchDat(
        baseUrl: string,
        cacheName: string,
        shared: boolean = false,
        signal?: AbortSignal,
        progressListener?: ProgressListener,
    ): Promise<CacheFiles> {
        const files = new Map<string, ArrayBuffer>();

        const cache = await caches.open(cacheName);

        const dataFilePromise = fetchCachedFile(
            baseUrl,
            CacheFiles.DAT_FILE_NAME,
            shared,
            true,
            cache,
            signal,
            progressListener,
        );
        const indexFilePromises: Promise<CachedFile>[] = [];
        for (let i = 0; i < CacheFiles.DAT_INDEX_COUNT; i++) {
            indexFilePromises.push(
                fetchCachedFile(baseUrl, CacheFiles.INDEX_FILE_PREFIX + i, shared, false, cache),
            );
        }

        const dataAndIndices = await Promise.all([dataFilePromise, ...indexFilePromises]);
        for (const file of dataAndIndices) {
            files.set(file.name, file.data);
        }

        return new CacheFiles(files);
    }

    static async fetchDat2(
        baseUrl: string,
        cacheName: string,
        indicesToLoad: number[] = [],
        shared: boolean = false,
        signal?: AbortSignal,
        progressListener?: ProgressListener,
    ): Promise<CacheFiles> {
        const files = new Map<string, ArrayBuffer>();

        const cache = await caches.open(cacheName);

        const dataFilePromise = fetchCachedFile(
            baseUrl,
            CacheFiles.DAT2_FILE_NAME,
            shared,
            true,
            cache,
            signal,
            progressListener,
        );
        const metaFile = await fetchCachedFile(
            baseUrl,
            CacheFiles.META_FILE_NAME,
            shared,
            false,
            cache,
        );
        const indexCount = metaFile.data.byteLength / SectorCluster.SIZE;

        if (indicesToLoad.length === 0) {
            indicesToLoad = Array.from({ length: indexCount }, (_, i) => i);
        }

        const indexPromises = indicesToLoad.map((indexId) =>
            fetchCachedFile(
                baseUrl,
                CacheFiles.INDEX_FILE_PREFIX + indexId,
                shared,
                false,
                cache,
            ).catch(console.error),
        );

        const dataAndIndices = await Promise.all([dataFilePromise, ...indexPromises]);
        for (const file of dataAndIndices) {
            if (file) {
                files.set(file.name, file.data);
            }
        }
        files.set(metaFile.name, metaFile.data);

        return new CacheFiles(files);
    }

    constructor(readonly files: Map<string, ArrayBuffer>) {}
}

export type DownloadProgress = {
    total: number;
    current: number;
    part: Uint8Array;
    // Downloaded, and being kept for next time: on a phone that can take a while
    saving?: boolean;
};

export type ProgressListener = (progress: DownloadProgress) => void;

function ReadableBufferStream(ab: ArrayBuffer): ReadableStream<Uint8Array> {
    return new ReadableStream({
        start(controller) {
            controller.enqueue(new Uint8Array(ab));
            controller.close();
        },
    });
}

async function toBufferParts(
    response: Response,
    offset: number,
    progressListener?: ProgressListener,
): Promise<Uint8Array[]> {
    if (!response.body) {
        return [];
    }
    const contentLength = offset + Number(response.headers.get("Content-Length") || 0);

    const reader = response.body.getReader();
    const parts: Uint8Array[] = [];
    let currentLength = offset;

    if (progressListener) {
        progressListener({
            total: contentLength,
            current: currentLength,
            part: new Uint8Array(0),
        });
    }

    for (let res = await reader.read(); !res.done && res.value; res = await reader.read()) {
        parts.push(res.value);
        currentLength += res.value.byteLength;
        if (progressListener) {
            progressListener({
                total: contentLength,
                current: currentLength,
                part: res.value,
            });
        }
    }
    return parts;
}

function partsToBuffer(parts: Uint8Array[], shared: boolean): ArrayBuffer {
    let totalLength = 0;
    for (const part of parts) {
        totalLength += part.byteLength;
    }

    const sab = shared ? new SharedArrayBuffer(totalLength) : new ArrayBuffer(totalLength);
    const u8 = new Uint8Array(sab);
    let offset = 0;
    for (const buffer of parts) {
        u8.set(buffer, offset);
        offset += buffer.byteLength;
    }
    return sab as ArrayBuffer;
}

type CachedFile = {
    name: string;
    data: ArrayBuffer;
};

async function fetchCachedFile(
    baseUrl: string,
    name: string,
    shared: boolean,
    incremental: boolean,
    cache: Cache,
    signal?: AbortSignal,
    progressListener?: ProgressListener,
): Promise<CachedFile> {
    const path = baseUrl + name;
    const cachedResp = await cache.match(path);
    if (cachedResp) {
        const parts = await toBufferParts(cachedResp, 0, progressListener);
        return {
            name,
            data: partsToBuffer(parts, shared),
        };
    }
    const partUrls: RequestInfo[] = [];
    const partResponses: (Response | undefined)[] = [];
    if (incremental) {
        const stored = await cache.matchAll(path + "/part/", {
            ignoreSearch: true,
        });
        for (const partResp of stored) {
            const index = parseInt(partResp.headers.get("Cache-Part") || "0");
            partUrls.push(path + "/part/?p=" + index);
            partResponses[index] = partResp;
        }
    }

    // The parts in order, for as long as each starts where the last one ended and they're all from
    // the same copy of the file (its Last-Modified). One left from another download ends it there.
    const parts: Uint8Array[] = [];
    let partCount = 0;
    let offset = 0;
    let modified: string | null = null;
    for (const partResp of partResponses) {
        if (
            !partResp ||
            partResp.headers.get("Cache-Offset") !== String(offset) ||
            (partCount > 0 && partResp.headers.get("Cache-Modified") !== modified)
        ) {
            break;
        }
        modified = partResp.headers.get("Cache-Modified");
        for (const part of await toBufferParts(partResp, 0)) {
            parts.push(part);
            offset += part.byteLength;
        }
        partCount++;
    }

    const restart = async () => {
        await Promise.all(partUrls.map((url) => cache.delete(url)));
        partUrls.length = 0;
        parts.length = 0;
        partCount = 0;
        offset = 0;
        modified = null;
    };
    // The rest of the file. With If-Range, one that's changed since its parts were saved comes
    // back whole (a 200), not as the rest of a different file.
    const request = () => {
        const headers: Record<string, string> = {};
        if (offset > 0) {
            headers["Range"] = `bytes=${offset}-${Number.MAX_SAFE_INTEGER}`;
            if (modified) {
                headers["If-Range"] = modified;
            }
        }
        return fetch(path, { headers, signal });
    };

    let resp = await request();
    // Asked for what's past the end. If the file's as long as the parts, every part was saved and
    // only the whole file's copy wasn't (the page was closed or reloaded as it was written).
    // Otherwise they're from another copy of it.
    let complete = false;
    if (offset > 0 && resp.status === 416) {
        complete = resp.headers.get("Content-Range") === `bytes */${offset}`;
        if (!complete) {
            await restart();
            resp = await request();
        }
    }
    if (!complete && resp.status !== 200 && resp.status !== 206) {
        throw new Error("Failed downloading " + path + ", " + resp.status);
    }
    if (!complete && offset > 0 && resp.status !== 206) {
        // The server ignored the Range, or the file's changed (If-Range), and sent it all: start
        // again from the top rather than adding the whole file to the parts already here
        await restart();
    }
    const fileModified = resp.headers.get("Last-Modified");
    const cacheUpdates: Promise<void>[] = [];
    let partCache: Uint8Array[] = [];
    let partCacheLength = 0;
    let partStart = offset;
    let partsFailed = false;
    // Keeps what's come since the last part, so a download that's cut off picks up from here
    const savePart = () => {
        const partUrl = path + "/part/?p=" + partCount;
        partUrls.push(partUrl);
        const headers: Record<string, string> = {
            "Content-Type": "application/octet-stream",
            "Content-Length": partCacheLength.toString(),
            "Cache-Part": partCount.toString(),
            "Cache-Offset": partStart.toString(),
        };
        if (fileModified) {
            headers["Cache-Modified"] = fileModified;
        }
        const partResp = new Response(ReadableBufferStream(partsToBuffer(partCache, false)), {
            status: 200,
            headers,
        });
        Object.defineProperty(partResp, "url", { value: partUrl });
        // Out of room, say: the load goes on, and the parts before this one are still a place
        // to pick up from. Any after it are left out (see above), so it stops writing them.
        const update = cache.put(partUrl, partResp).catch((e) => {
            if (!partsFailed) {
                console.warn("Couldn't keep part of " + path, e);
            }
            partsFailed = true;
        });
        cacheUpdates.push(update);
        partCount++;
        partStart += partCacheLength;

        partCache = [];
        partCacheLength = 0;
    };
    const partProgressListener = (progress: DownloadProgress) => {
        if (incremental && !partsFailed && progress.part.byteLength > 0) {
            partCache.push(progress.part);
            partCacheLength += progress.part.byteLength;

            // cache every 1% of the total file size
            const partCacheThreshold = Math.max(progress.total * 0.01, 1000 * 1024);

            if (partCacheLength > partCacheThreshold) {
                savePart();
            }
        }
        if (progressListener) {
            progressListener(progress);
        }
    };
    if (!complete) {
        for (const part of await toBufferParts(resp, offset, partProgressListener)) {
            parts.push(part);
        }
    }
    // The last of it too, so the parts hold the whole file if it can't be kept in one piece
    if (incremental && !partsFailed && partCacheLength > 0) {
        savePart();
    }

    const buffer = partsToBuffer(parts, shared);

    await Promise.all(cacheUpdates);
    progressListener?.({
        total: buffer.byteLength,
        current: buffer.byteLength,
        part: new Uint8Array(0),
        saving: true,
    });
    await saveWhole(cache, path, buffer, partUrls);

    return {
        name,
        data: buffer,
    };
}

// Keeps the whole file, and drops its parts only once that's saved: a phone can take a while to
// write a big cache, or run out of room, and with the parts gone first a reload started the
// download again from where the last part left off. If it can't be saved, the parts stay, so
// the next load is put together from them rather than downloaded again.
async function saveWhole(
    cache: Cache,
    path: string,
    buffer: ArrayBuffer,
    partUrls: RequestInfo[],
): Promise<void> {
    try {
        await cache.put(
            path,
            new Response(ReadableBufferStream(buffer), {
                status: 200,
                headers: {
                    "Content-Type": "application/octet-stream",
                    "Content-Length": buffer.byteLength.toString(),
                },
            }),
        );
    } catch (e) {
        console.warn("Couldn't keep " + path + ", it'll load from its parts next time", e);
        return;
    }
    // A part that's left does no harm: the whole file's read first
    await Promise.all(partUrls.map((url) => cache.delete(url))).catch((e) =>
        console.warn("Couldn't drop the parts of " + path, e),
    );
}
