// Checks that every casket item's id is the item it's named after in the
// cache, and that gear can be worn in its slot, and the customisable max cape's
// parts and presets (content/maxCape.ts). Prints the ones that aren't.
//
//   bun run tsx scripts/cache/check-items.ts
import { GAME_CACHE_NAME } from "../../src/game/cache";
import { GEAR_SLOT_BY_ID, ITEMS } from "../../src/game/content/items";
import { CAPE_PARTS, CAPE_PRESETS, CUSTOM_MAX_CAPE } from "../../src/game/content/maxCape";
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
// The customisable max cape is the max cape's model, and its parts are colours that model has.
// Each preset is what its max cape swaps each part's main colour for (or the part's own).
const maxCape = objTypeLoader.load(13280);
const custom = objTypeLoader.load(CUSTOM_MAX_CAPE);
if (
    custom.maleModel !== maxCape.maleModel ||
    custom.femaleModel !== maxCape.femaleModel ||
    custom.op13 !== maxCape.op13 ||
    custom.recolorFrom
) {
    console.log(`${CUSTOM_MAX_CAPE} isn't the Max cape's look, unrecoloured`);
    problems++;
}
const capeModel = factory.getModelLoader().getModel(maxCape.maleModel)!;
const capeColours = new Set(capeModel.faceColors);
for (const part of CAPE_PARTS) {
    for (const colour of part.colours) {
        if (!capeColours.has(colour)) {
            console.log(`max cape part ${part.id}: the model has no colour ${colour}`);
            problems++;
        }
    }
}
for (const preset of CAPE_PRESETS) {
    const obj = objTypeLoader.load(preset.objId);
    if (obj.maleModel !== maxCape.maleModel) {
        console.log(`max cape preset ${preset.objId} (${obj.name}) isn't the max cape's model`);
        problems++;
    }
    CAPE_PARTS.forEach((part, i) => {
        const at = obj.recolorFrom ? [...obj.recolorFrom].indexOf(part.colours[0]) : -1;
        const expected = at >= 0 ? obj.recolorTo![at] : part.colours[0];
        if (preset.colours[i] !== expected) {
            const name = `${preset.objId} (${obj.name})`;
            console.log(
                `max cape preset ${name}: ${part.id} is ${expected}, not ${preset.colours[i]}`,
            );
            problems++;
        }
    });
}

console.log(problems === 0 ? `All ${ITEMS.length} items check out` : `${problems} problems`);
process.exit(problems === 0 ? 0 : 1);
