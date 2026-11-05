// One of slim-cache.ts's worker threads: loads the full cache, or the slim one
// being checked, then runs the units it's sent (slim-load.ts) one at a time and
// sends back the groups each one read.
import fs from "node:fs";
import { parentPort, workerData } from "node:worker_threads";

import { assembleChunkedCache } from "../../src/mapviewer/Caches";
import { CacheInfo } from "../../src/rs/cache/CacheInfo";
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

const { info, chunkDir } = workerData as WorkerData;
const port = parentPort!;
const reply = (message: WorkerReply) => port.postMessage(message);

await Hasher.init();
// A slim cache is put together from its chunks the way the game does it, in shared memory
const cache = chunkDir
    ? assembleChunkedCache(
          info,
          (info.chunks ?? []).map(
              (chunk) => new Uint8Array(fs.readFileSync(chunkDir + chunk.file)),
          ),
          true,
      )
    : loadCache(info);
const loader = new SlimLoader(cache);
// What making the loaders read goes with the first unit
port.on("message", (unit: SlimUnit) => {
    loader
        .run(unit)
        .then(() => reply({ reads: takeReads() }))
        .catch((e) => reply({ error: e instanceof Error ? (e.stack ?? e.message) : String(e) }));
});
reply({ ready: true });
