// Lists NPC types whose name matches, with their combat level, size and
// idle/walk animations.
//
//   npx tsx scripts/cache/find-npcs.ts goblin
//   npx tsx scripts/cache/find-npcs.ts "^count draynor$"
import { GAME_CACHE_NAME } from "../../src/game/cache";
import { CacheSystem } from "../../src/rs/cache/CacheSystem";
import { getCacheLoaderFactory } from "../../src/rs/cache/loader/CacheLoaderFactory";
import { loadCache, loadCacheInfos } from "./load-util";

const pattern = new RegExp(process.argv[2] ?? ".", "i");

const cacheInfo = loadCacheInfos().find((c) => c.name === GAME_CACHE_NAME)!;
const loaded = loadCache(cacheInfo);
const factory = getCacheLoaderFactory(cacheInfo, CacheSystem.fromFiles(loaded.type, loaded.files));
const npcTypeLoader = factory.getNpcTypeLoader();
const basTypeLoader = factory.getBasTypeLoader();

for (let id = 0; id < npcTypeLoader.getCount(); id++) {
    const npc = npcTypeLoader.load(id);
    if (!npc.name || npc.name === "null" || !pattern.test(npc.name)) {
        continue;
    }
    const attackable = npc.actions.some((a) => a?.toLowerCase() === "attack");
    console.log(
        [
            `${id}`.padStart(5),
            npc.name.padEnd(24),
            `lvl ${npc.combatLevel}`.padEnd(8),
            `size ${npc.size}`,
            `idle ${npc.getIdleSeqId(basTypeLoader)}`,
            `walk ${npc.getWalkSeqId(basTypeLoader)}`,
            `models [${npc.modelIds?.join(",")}]`,
            attackable ? "attackable" : "",
            npc.transforms ? "transforms" : "",
        ].join("  "),
    );
}
