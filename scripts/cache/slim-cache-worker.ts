// One of slim-cache.ts's worker threads: loads the full cache, or the slim one
// being checked, then runs the units it's sent (slim-load.ts) one at a time and
// sends back the groups each one read.
import fs from "node:fs";
import { parentPort, workerData } from "node:worker_threads";

import { LoadedCache } from "../../src/mapviewer/Caches";
import { CacheInfo } from "../../src/rs/cache/CacheInfo";
import { detectCacheType } from "../../src/rs/cache/CacheType";
import { buildCacheFiles, readChunk } from "../../src/rs/cache/ChunkedCache";
import { Hasher } from "../../src/util/Hasher";
import { loadCache } from "./load-util";
import { SlimLoader, SlimUnit, takeReads } from "./slim-load";

export type WorkerData = {
    entry: string;
    // The full cache, or a slim one whose chunks are in chunkDir
    info: CacheInfo;
    chunkDir?: string;
};

export type WorkerReply = { ready: true } | { reads: string[] } | { error: string };

function loadSlim(info: CacheInfo, chunkDir: string): LoadedCache {
    const chunks = (info.chunks ?? []).map(
        (chunk) => new Uint8Array(fs.readFileSync(chunkDir + chunk.file)),
    );
    const xteas = new Map(
        Object.entries(info.xteas ?? {}).map(([key, value]) => [parseInt(key), value]),
    );
    return {
        info,
        type: detectCacheType(info),
        files: buildCacheFiles(chunks.flatMap(readChunk), info.indexSizes ?? []),
        xteas,
    };
}

const { info, chunkDir } = workerData as WorkerData;
const port = parentPort!;
const reply = (message: WorkerReply) => port.postMessage(message);

await Hasher.init();
const loader = new SlimLoader(chunkDir ? loadSlim(info, chunkDir) : loadCache(info));
// What making the loaders read goes with the first unit
port.on("message", (unit: SlimUnit) => {
    loader
        .run(unit)
        .then(() => reply({ reads: takeReads() }))
        .catch((e) => reply({ error: e instanceof Error ? (e.stack ?? e.message) : String(e) }));
});
reply({ ready: true });
