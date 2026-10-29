// Checks that every item the fun maps' players wear is what it's called in the
// cache (by the key it has in fun/enemies.ts), and is worn in the slot it's
// put in. Prints the ones that aren't.
//
//   npx tsx scripts/cache/check-fun-outfits.ts
import { GAME_CACHE_NAME } from "../../src/game/cache";
import { ENEMIES } from "../../src/game/content/enemies";
import { FUN_OUTFIT_ITEMS } from "../../src/game/content/fun/enemies";
import { CacheSystem } from "../../src/rs/cache/CacheSystem";
import { getCacheLoaderFactory } from "../../src/rs/cache/loader/CacheLoaderFactory";
import { loadCache, loadCacheInfos } from "./load-util";

const cacheInfo = loadCacheInfos().find((c) => c.name === GAME_CACHE_NAME)!;
const loaded = loadCache(cacheInfo);
const factory = getCacheLoaderFactory(cacheInfo, CacheSystem.fromFiles(loaded.type, loaded.files));
const objTypeLoader = factory.getObjTypeLoader();

// "runePlatebodyG" -> "rune platebody g", "dharoksHelm" -> "dharoks helm"
const words = (s: string) =>
    s
        .replace(/([a-z])([A-Z])/g, "$1 $2")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, " ")
        .replace(/s$/, "")
        .trim();

let problems = 0;
for (const [id, key] of Object.entries(FUN_OUTFIT_ITEMS)) {
    const obj = objTypeLoader.load(Number(id));
    const name = words(obj.name);
    // Close enough: the cache name's last word is in the key, or the key's in
    // the name ("ghostlyRobeBottom" is a "Ghostly robe"; lists like
    // "partyhats" are checked by their family)
    const keyWords = words(key).split(" ");
    const nameWords = name.split(" ");
    if (
        !keyWords.includes(nameWords[nameWords.length - 1]) &&
        !name.includes(keyWords[keyWords.length - 1])
    ) {
        console.log(`${key}: ${id} is "${obj.name}"`);
        problems++;
    }
}
for (const enemy of ENEMIES) {
    for (const outfit of enemy.outfits ?? []) {
        for (const [slot, id] of Object.entries(outfit.equipment)) {
            if (id === undefined || id === -1) {
                continue;
            }
            const obj = objTypeLoader.load(id);
            if (obj.op13 !== Number(slot)) {
                console.log(
                    `${enemy.id}: ${obj.name} (${id}) is worn in slot ${obj.op13}, not ${slot}`,
                );
                problems++;
            }
        }
    }
}
console.log(
    problems === 0
        ? `All ${Object.keys(FUN_OUTFIT_ITEMS).length} outfit items check out`
        : `${problems} problems`,
);
process.exit(problems === 0 ? 0 : 1);
