// Lists identity kits (player body parts): id, body part, whether players can
// pick it in character creation, and its models.
//
//   npx tsx scripts/cache/dump-idk.ts
import { GAME_CACHE_NAME } from "../../src/game/cache";
import { CacheSystem } from "../../src/rs/cache/CacheSystem";
import { createIdkTypeLoader } from "../../src/rs/config/idktype/IdkTypeLoader";
import { loadCache, loadCacheInfos } from "./load-util";

const BODY_PARTS = ["hair", "jaw", "torso", "arms", "hands", "legs", "feet"];

const cacheInfo = loadCacheInfos().find((c) => c.name === GAME_CACHE_NAME)!;
const loaded = loadCache(cacheInfo);
const idkTypeLoader = createIdkTypeLoader(
    cacheInfo,
    CacheSystem.fromFiles(loaded.type, loaded.files),
);

for (let id = 0; id < idkTypeLoader.getCount(); id++) {
    const idk = idkTypeLoader.load(id);
    if (idk.bodyPartyId === -1) {
        continue;
    }
    const female = idk.bodyPartyId >= 7;
    const part = BODY_PARTS[idk.bodyPartyId % 7];
    console.log(
        `${id}`.padStart(4),
        `${female ? "female" : "male"} ${part}`.padEnd(14),
        idk.nonSelectable ? "hidden    " : "selectable",
        `models [${idk.modelIds?.join(",")}]`,
        idk.recolorFrom ? `recolor ${idk.recolorFrom.join(",")}` : "",
    );
}
