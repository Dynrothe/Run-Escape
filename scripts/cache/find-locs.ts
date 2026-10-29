// Lists loc (scenery) types whose name matches, with their size and animation.
//
//   npx tsx scripts/cache/find-locs.ts "multicannon"
import { GAME_CACHE_NAME } from "../../src/game/cache";
import { CacheSystem } from "../../src/rs/cache/CacheSystem";
import { getCacheLoaderFactory } from "../../src/rs/cache/loader/CacheLoaderFactory";
import { loadCache, loadCacheInfos } from "./load-util";

const pattern = new RegExp(process.argv[2] ?? ".", "i");

const cacheInfo = loadCacheInfos().find((c) => c.name === GAME_CACHE_NAME)!;
const loaded = loadCache(cacheInfo);
const factory = getCacheLoaderFactory(cacheInfo, CacheSystem.fromFiles(loaded.type, loaded.files));
const locTypeLoader = factory.getLocTypeLoader();

for (let id = 0; id < locTypeLoader.getCount(); id++) {
    const loc = locTypeLoader.load(id);
    if (!loc.name || loc.name === "null" || !pattern.test(loc.name)) {
        continue;
    }
    console.log(
        `${id}`.padStart(6),
        loc.name.padEnd(28),
        `size ${loc.sizeX}x${loc.sizeY}`,
        `seq ${loc.seqId}`,
        `models [${loc.models?.flat().join(",")}] types [${loc.types?.join(",")}]`,
    );
}
