// Lists item types whose name matches, with their wear slots and worn models.
//
//   npx tsx scripts/cache/find-objs.ts "^rune platebody$"
import { GAME_CACHE_NAME } from "../../src/game/cache";
import { CacheSystem } from "../../src/rs/cache/CacheSystem";
import { getCacheLoaderFactory } from "../../src/rs/cache/loader/CacheLoaderFactory";
import { loadCache, loadCacheInfos } from "./load-util";

const pattern = new RegExp(process.argv[2] ?? ".", "i");

const cacheInfo = loadCacheInfos().find((c) => c.name === GAME_CACHE_NAME)!;
const loaded = loadCache(cacheInfo);
const factory = getCacheLoaderFactory(cacheInfo, CacheSystem.fromFiles(loaded.type, loaded.files));
const objTypeLoader = factory.getObjTypeLoader();

for (let id = 0; id < objTypeLoader.getCount(); id++) {
    const obj = objTypeLoader.load(id);
    if (!obj.name || obj.name === "null" || !pattern.test(obj.name) || obj.noteTemplate !== -1) {
        continue;
    }
    console.log(
        [
            `${id}`.padStart(5),
            obj.name.padEnd(28),
            `slot ${obj.op13} hides ${obj.op14}/${obj.op27}`.padEnd(20),
            `male [${obj.maleModel},${obj.maleModel1},${obj.maleModel2}] +${obj.maleOffset}`,
            `inv ${obj.model}`,
            obj.placeholderTemplate !== -1 ? "placeholder" : "",
        ].join("  "),
    );
}
