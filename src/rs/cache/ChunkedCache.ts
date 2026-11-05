// A slim cache stored as chunks: each one a run of groups from one index, in a file named after
// its sha256 (scripts/cache/slim-cache.ts writes them). A change to a group changes only its own
// chunk's name, so an update downloads that chunk and keeps the rest, and a file can never be
// served under a name that doesn't match what's in it. The game puts the groups back into the
// dat2 layout the rest of the cache code reads.
import { CacheFiles, ProgressListener } from "./CacheFiles";
import { Sector } from "./store/Sector";
import { SectorCluster } from "./store/SectorCluster";

export type CacheGroup = { indexId: number; archiveId: number; data: Uint8Array };

// A chunk as caches.json lists it: <the first 32 hex digits of its sha256>.bin, and its length
export type CacheChunk = { file: string; size: number };

// The chunks' folder, under caches/
export const CHUNK_DIR = "chunks/";

export const CHUNK_FILE_PATTERN = /^[0-9a-f]{32}\.bin$/;

const META_INDEX_ID = 255;

// How many archive ids each chunk of an index covers. Fixed ranges, so adding or changing a group
// never moves another into a different chunk. Picked so that, with what the game keeps, a chunk
// is under a megabyte or two: few enough requests, and a small download for an update. The
// indexes not listed are small, and one chunk each. Changing a span renames that index's chunks.
export const CHUNK_SPANS: Readonly<Record<number, number>> = {
    // Animation frames
    0: 4096,
    // Configs: a few large groups (items, npcs, ...)
    2: 8,
    // Map squares
    5: 1024,
    // Models
    7: 4096,
    // Sprites
    8: 4096,
    // A few large animations
    22: 128,
};
const DEFAULT_SPAN = 1 << 24;

export function getChunkSpan(indexId: number): number {
    return CHUNK_SPANS[indexId] ?? DEFAULT_SPAN;
}

// Each group in a chunk: its index (1 byte), archive (4) and length (4), then its bytes
const RECORD_HEADER_SIZE = 9;

function compareGroups(a: CacheGroup, b: CacheGroup): number {
    return a.indexId - b.indexId || a.archiveId - b.archiveId;
}

// The groups as chunk files, in order of index and archive. The same groups always give the same
// bytes, whatever order they come in.
export function packChunks(groups: Iterable<CacheGroup>): Uint8Array[] {
    const sorted = [...groups].sort(compareGroups);
    const runs: CacheGroup[][] = [];
    let lastKey: string | undefined;
    for (let i = 0; i < sorted.length; i++) {
        const group = sorted[i];
        if (i > 0 && compareGroups(sorted[i - 1], group) === 0) {
            throw new Error(`Group ${group.indexId}:${group.archiveId} is in there twice`);
        }
        const key = group.indexId + ":" + Math.floor(group.archiveId / getChunkSpan(group.indexId));
        if (key !== lastKey) {
            runs.push([]);
            lastKey = key;
        }
        runs[runs.length - 1].push(group);
    }
    return runs.map((run) => {
        let size = 0;
        for (const group of run) {
            size += RECORD_HEADER_SIZE + group.data.byteLength;
        }
        const bytes = new Uint8Array(size);
        const view = new DataView(bytes.buffer);
        let offset = 0;
        for (const { indexId, archiveId, data } of run) {
            view.setUint8(offset, indexId);
            view.setUint32(offset + 1, archiveId);
            view.setUint32(offset + 5, data.byteLength);
            bytes.set(data, offset + RECORD_HEADER_SIZE);
            offset += RECORD_HEADER_SIZE + data.byteLength;
        }
        return bytes;
    });
}

// The groups in a chunk. Throws if it isn't one, rather than reading past a record's end.
export function readChunk(bytes: Uint8Array): CacheGroup[] {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const groups: CacheGroup[] = [];
    let offset = 0;
    while (offset < bytes.byteLength) {
        if (offset + RECORD_HEADER_SIZE > bytes.byteLength) {
            throw new Error("A cache chunk ends partway through a group");
        }
        const indexId = view.getUint8(offset);
        const archiveId = view.getUint32(offset + 1);
        const size = view.getUint32(offset + 5);
        const start = offset + RECORD_HEADER_SIZE;
        if (start + size > bytes.byteLength) {
            throw new Error("A cache chunk ends partway through a group");
        }
        groups.push({ indexId, archiveId, data: bytes.subarray(start, start + size) });
        offset = start + size;
    }
    return groups;
}

export async function sha256Hex(bytes: Uint8Array): Promise<string> {
    // A copy when it's a view of a SharedArrayBuffer, which digest won't take
    const input = bytes.buffer instanceof ArrayBuffer ? bytes : bytes.slice();
    const digest = await crypto.subtle.digest("SHA-256", input as Uint8Array<ArrayBuffer>);
    let hex = "";
    for (const byte of new Uint8Array(digest)) {
        hex += byte.toString(16).padStart(2, "0");
    }
    return hex;
}

export async function getChunkFileName(bytes: Uint8Array): Promise<string> {
    return (await sha256Hex(bytes)).slice(0, 32) + ".bin";
}

// Whether bytes are the chunk the name says they are
export async function isChunk(file: string, bytes: Uint8Array): Promise<boolean> {
    return (await getChunkFileName(bytes)) === file;
}

// The groups in the layout the client stores them: each one in a chain of sectors in the dat2,
// its index file entry pointing at the first. indexSizes is how many archive ids each index file
// has room for (the full cache's length), so a group that's left out reads as empty rather than
// out of range. The reference tables are index 255's groups. Shared, the files are
// SharedArrayBuffers, for the workers.
export function buildCacheFiles(
    groups: Iterable<CacheGroup>,
    indexSizes: number[],
    shared = false,
): CacheFiles {
    const alloc = (size: number) =>
        new Uint8Array(shared ? new SharedArrayBuffer(size) : new ArrayBuffer(size));
    const sorted = [...groups].sort(compareGroups);
    let sectorCount = 1;
    for (const { archiveId, data } of sorted) {
        const dataSize = archiveId > 0xffff ? Sector.EXTENDED_DATA_SIZE : Sector.DATA_SIZE;
        sectorCount += Math.ceil(data.byteLength / dataSize);
    }

    const indexFiles = new Map<number, Uint8Array>();
    indexSizes.forEach((archives, indexId) =>
        indexFiles.set(indexId, alloc(archives * SectorCluster.SIZE)),
    );
    indexFiles.set(META_INDEX_ID, alloc(indexSizes.length * SectorCluster.SIZE));

    // Sector 0 stays empty: an entry pointing there means no group
    const dat2 = alloc(sectorCount * Sector.SIZE);
    const view = new DataView(dat2.buffer);
    let sector = 1;
    for (const { indexId, archiveId, data } of sorted) {
        const indexFile = indexFiles.get(indexId);
        const entry = archiveId * SectorCluster.SIZE;
        if (!indexFile || entry + SectorCluster.SIZE > indexFile.byteLength) {
            throw new Error(`Group ${indexId}:${archiveId} is outside its index`);
        }
        if (data.byteLength === 0) {
            continue;
        }
        const extended = archiveId > 0xffff;
        const dataSize = extended ? Sector.EXTENDED_DATA_SIZE : Sector.DATA_SIZE;
        const count = Math.ceil(data.byteLength / dataSize);
        const first = sector;
        writeMedium(indexFile, entry, data.byteLength);
        writeMedium(indexFile, entry + 3, first);
        for (let part = 0; part < count; part++) {
            let offset = sector * Sector.SIZE;
            if (extended) {
                view.setInt32(offset, archiveId);
                offset += 4;
            } else {
                view.setUint16(offset, archiveId);
                offset += 2;
            }
            view.setUint16(offset, part);
            writeMedium(dat2, offset + 2, part + 1 < count ? first + part + 1 : 0);
            view.setUint8(offset + 5, indexId);
            dat2.set(data.subarray(part * dataSize, (part + 1) * dataSize), offset + 6);
            sector++;
        }
    }

    const files = new Map<string, ArrayBuffer>();
    files.set(CacheFiles.DAT2_FILE_NAME, dat2.buffer as ArrayBuffer);
    for (const [indexId, indexFile] of indexFiles) {
        files.set(CacheFiles.INDEX_FILE_PREFIX + indexId, indexFile.buffer as ArrayBuffer);
    }
    return new CacheFiles(files);
}

export type FetchChunksOptions = {
    signal?: AbortSignal;
    onProgress?: ProgressListener;
    fetcher?: typeof fetch;
};

// Chunks downloaded at once
const CONCURRENCY = 6;

// The chunks' bytes, in the order given. The ones already in the Cache API are read from there
// and the rest downloaded and checked against their names, then put there. Afterwards it drops
// every stored chunk that isn't listed: what an update replaced. Progress counts only what's
// downloaded.
export async function fetchChunks(
    baseUrl: string,
    chunks: CacheChunk[],
    cache: Cache,
    { signal, onProgress, fetcher = fetch }: FetchChunksOptions = {},
): Promise<Uint8Array[]> {
    const stored = await Promise.all(
        chunks.map(async ({ file, size }) => {
            const response = await cache.match(baseUrl + file);
            const bytes = response && new Uint8Array(await response.arrayBuffer());
            // Each one was checked before it was put, but a damaged copy would fail every load
            // from then on, and hashing them all takes milliseconds
            return bytes?.byteLength === size && (await isChunk(file, bytes)) ? bytes : undefined;
        }),
    );
    const result: Uint8Array[] = [];
    const missing: number[] = [];
    stored.forEach((bytes, i) => (bytes ? (result[i] = bytes) : missing.push(i)));

    const total = missing.reduce((sum, i) => sum + chunks[i].size, 0);
    let current = 0;
    const download = async (i: number) => {
        const { file } = chunks[i];
        const url = baseUrl + file;
        let bytes: Uint8Array | undefined;
        // A second try past the browser's own cache, in case something on the way kept a
        // broken copy
        for (const mode of ["default", "reload"] as const) {
            const response = await fetcher(url, { signal, cache: mode });
            if (!response.ok) {
                throw new Error(`Couldn't download the cache's chunk ${file}: ${response.status}`);
            }
            bytes = new Uint8Array(await response.arrayBuffer());
            if (await isChunk(file, bytes)) {
                break;
            }
            bytes = undefined;
        }
        if (!bytes) {
            throw new Error(
                `The cache's chunk ${file} came back as a different file. The server has ` +
                    "something else under its name.",
            );
        }
        result[i] = bytes;
        current += bytes.byteLength;
        onProgress?.({ total, current, part: bytes });
        await cache
            .put(
                url,
                // A Response takes a copy of what it's given
                new Response(bytes as Uint8Array<ArrayBuffer>, {
                    headers: { "Content-Type": "application/octet-stream" },
                }),
            )
            .catch((e) => console.warn(`Couldn't keep ${file}`, e));
    };
    let next = 0;
    let failed = false;
    const worker = async () => {
        while (next < missing.length && !failed) {
            try {
                await download(missing[next++]);
            } catch (e) {
                failed = true;
                throw e;
            }
        }
    };
    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, missing.length) }, worker));

    // Every chunk's in the one Cache, under its file name
    const listed = new Set(chunks.map((chunk) => chunk.file));
    for (const request of await cache.keys()) {
        const file = request.url.slice(request.url.lastIndexOf("/") + 1);
        if (!listed.has(file)) {
            await cache.delete(request);
        }
    }
    return result;
}

function writeMedium(bytes: Uint8Array, offset: number, value: number): void {
    bytes[offset] = value >>> 16;
    bytes[offset + 1] = value >>> 8;
    bytes[offset + 2] = value;
}
