// Lists spot animations: their model, animation, how long it runs and its size.
//   npx tsx scripts/cache/spotanims.ts 2242 2243 1727 [from-to]
import { GAME_CACHE_NAME } from "../../src/game/cache";
import { CacheSystem } from "../../src/rs/cache/CacheSystem";
import { getCacheLoaderFactory } from "../../src/rs/cache/loader/CacheLoaderFactory";
import { createSpotAnimTypeLoader } from "../../src/rs/config/spotanimtype/SpotAnimTypeLoader";
import { loadCache, loadCacheInfos } from "./load-util";

const ids = process.argv.slice(2).flatMap((arg) => {
    const [a, b] = arg.split("-").map(Number);
    return b === undefined ? [a] : Array.from({ length: b - a + 1 }, (_, i) => a + i);
});
const cacheInfo = loadCacheInfos().find((c) => c.name === GAME_CACHE_NAME)!;
const loaded = loadCache(cacheInfo);
const system = CacheSystem.fromFiles(loaded.type, loaded.files);
const factory = getCacheLoaderFactory(cacheInfo, system);
const spots = createSpotAnimTypeLoader(cacheInfo, system);
const seqs = factory.getSeqTypeLoader();
const frames = factory.getSeqFrameLoader();
for (const id of ids) {
    const spot = spots.load(id) as unknown as Record<string, number>;
    const seq = spot.sequenceId >= 0 ? seqs.load(spot.sequenceId) : undefined;
    let ticks = 0;
    if (seq && !seq.isSkeletalSeq() && seq.frameIds) {
        for (let f = 0; f < seq.frameIds.length; f++) ticks += seq.getFrameLength(frames, f);
    } else if (seq?.isSkeletalSeq()) {
        ticks = seq.getSkeletalDuration?.() ?? -1;
    }
    console.log(
        `${id}  model ${spot.modelId}  seq ${spot.sequenceId}  ${seq ? (seq.isSkeletalSeq() ? "skeletal " : "") + ticks + " client ticks" : ""}  scale ${spot.widthScale}x${spot.heightScale}`,
    );
}
