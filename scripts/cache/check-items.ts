// Checks that every casket item's id is the item it's named after in the
// cache, and that gear can be worn in its slot. Prints the ones that aren't.
//
//   npx tsx scripts/cache/check-items.ts
import { GAME_CACHE_NAME } from "../../src/game/cache";
import { GEAR_SLOT_BY_ID, ITEMS } from "../../src/game/content/items";
import { CacheSystem } from "../../src/rs/cache/CacheSystem";
import { getCacheLoaderFactory } from "../../src/rs/cache/loader/CacheLoaderFactory";
import { loadCache, loadCacheInfos } from "./load-util";

const cacheInfo = loadCacheInfos().find((c) => c.name === GAME_CACHE_NAME)!;
const loaded = loadCache(cacheInfo);
const factory = getCacheLoaderFactory(cacheInfo, CacheSystem.fromFiles(loaded.type, loaded.files));
const objTypeLoader = factory.getObjTypeLoader();

// Doses, charges and tiers aren't part of the name: "Saradomin brew(4)",
// "Overload (4)", "Ardougne cloak 1"
function normalize(name: string): string {
    return name
        .toLowerCase()
        .replace(/\s*\(?\d+\)?$/, "")
        .trim();
}

// Items the game names itself, where the cache's name doesn't tell them
// apart: the black and red crystal armour is plain "Crystal ..." in the cache
const CACHE_NAMES: Record<string, string> = {
    corrupted_crystal_helm: "Crystal helm",
    corrupted_crystal_body: "Crystal body",
    corrupted_crystal_legs: "Crystal legs",
};

let problems = 0;
for (const item of ITEMS) {
    const obj = objTypeLoader.load(item.objId);
    if (normalize(obj.name) !== normalize(CACHE_NAMES[item.id] ?? item.name)) {
        console.log(`${item.id}: ${item.objId} is "${obj.name}", not "${item.name}"`);
        problems++;
    }
    if (item.kind !== "gear") {
        continue;
    }
    const equipSlot = GEAR_SLOT_BY_ID.get(item.slot)?.equipSlot;
    if (equipSlot !== undefined && obj.op13 !== equipSlot) {
        console.log(`${item.id}: worn in slot ${obj.op13}, not ${equipSlot} (${item.slot})`);
        problems++;
    }
}
console.log(problems === 0 ? `All ${ITEMS.length} items check out` : `${problems} problems`);
process.exit(problems === 0 ? 0 : 1);
