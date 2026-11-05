import { CacheFiles, ProgressListener } from "../rs/cache/CacheFiles";
import { CacheInfo, getLatestCache } from "../rs/cache/CacheInfo";
import { CacheType, detectCacheType } from "../rs/cache/CacheType";
import { CHUNK_DIR, buildCacheFiles, fetchChunks, readChunk } from "../rs/cache/ChunkedCache";

// Next to the page, so the game can be served from a folder (fetched from the
// page, never from a worker, so it's relative to the page's URL)
const CACHE_PATH = "caches/";

// The Cache API's copy of a slim cache's chunks. One for every version, so an
// update only adds the chunks that changed.
export const CHUNK_CACHE_NAME = "cache-chunks";

// build, when given, goes in the query, so a CDN can't answer a new page with
// the caches.json it kept for an old one
export async function fetchCacheInfos(build?: string): Promise<CacheInfo[]> {
    const query = build !== undefined ? "?build=" + encodeURIComponent(build) : "";
    // Always checked with the server: it says which cache to load, under the
    // same name each time, and a stale copy loads the wrong one
    const resp = await fetch(CACHE_PATH + "caches.json" + query, { cache: "no-cache" });
    if (!resp.ok) {
        throw new Error(`Failed to fetch caches.json: ${resp.status} ${resp.statusText}`);
    }
    return resp.json();
}

export type CacheList = {
    caches: CacheInfo[];
    latest: CacheInfo;
};

export async function fetchCacheList(build?: string): Promise<CacheList | undefined> {
    try {
        const caches = await fetchCacheInfos(build);
        const latest = getLatestCache(caches);
        if (!latest) {
            return undefined;
        }
        return {
            caches,
            latest,
        };
    } catch (e) {
        console.error(
            "Failed to load cache list. Run `bun run download-caches` to fetch the game caches.",
            e,
        );
        return undefined;
    }
}

export type LoadedCache = {
    info: CacheInfo;
    type: CacheType;
    files: CacheFiles;
    xteas: XteaMap;
};

export async function loadCacheFiles(
    info: CacheInfo,
    signal?: AbortSignal,
    progressListener?: ProgressListener,
): Promise<LoadedCache> {
    if (info.chunks) {
        return loadChunkedCache(info, info.chunks, signal, progressListener);
    }
    const cachePath = CACHE_PATH + info.name + "/";

    const xteasPromise = fetchXteas(cachePath + "keys.json", signal);

    const cacheType = detectCacheType(info);
    const files = await CacheFiles.fetchFiles(
        cacheType,
        cachePath,
        info.name,
        true,
        signal,
        progressListener,
    );

    const xteas = await xteasPromise;

    return {
        info,
        type: cacheType,
        files,
        xteas,
    };
}

async function loadChunkedCache(
    info: CacheInfo,
    chunks: NonNullable<CacheInfo["chunks"]>,
    signal?: AbortSignal,
    onProgress?: ProgressListener,
): Promise<LoadedCache> {
    if (!info.indexSizes) {
        throw new Error(`caches.json has no indexSizes for ${info.name}`);
    }
    const storage = await caches.open(CHUNK_CACHE_NAME);
    const buffers = await fetchChunks(CACHE_PATH + CHUNK_DIR, chunks, storage, {
        signal,
        onProgress,
    });
    const files = buildCacheFiles(buffers.flatMap(readChunk), info.indexSizes, true);
    const xteas: XteaMap = new Map(
        Object.entries(info.xteas ?? {}).map(([key, value]) => [parseInt(key), value]),
    );
    return { info, type: detectCacheType(info), files, xteas };
}

export type XteaMap = Map<number, number[]>;

export async function fetchXteas(url: RequestInfo, signal?: AbortSignal): Promise<XteaMap> {
    const resp = await fetch(url, {
        signal,
    });
    const data: Record<string, number[]> = await resp.json();
    return new Map(Object.keys(data).map((key) => [parseInt(key), data[key]]));
}
