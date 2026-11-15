// Writes src/game/content/cosmeticItems.ts from the cache: every item a player can wear outside
// the weapon slot (one of each look), and the identity kits character creation offers. Run it
// again on a newer cache (see A newer cache in docs/DEVELOPMENT.md).
//
//   bun run tsx scripts/cache/cosmetics.ts
import fs from "fs";

import { GAME_CACHE_NAME } from "../../src/game/cache";
import { CHARACTERS } from "../../src/game/content/characters";
import { CacheSystem } from "../../src/rs/cache/CacheSystem";
import { getCacheLoaderFactory } from "../../src/rs/cache/loader/CacheLoaderFactory";
import { createIdkTypeLoader } from "../../src/rs/config/idktype/IdkTypeLoader";
import { ObjType } from "../../src/rs/config/objtype/ObjType";
import { EquipSlot } from "../../src/rs/model/player/PlayerModelLoader";
import { loadCache, loadCacheInfos } from "./load-util";

const OUT = "src/game/content/cosmeticItems.ts";

// The slots a cosmetic can go in, in the order the wardrobe lists them. The weapon's the run's.
const SLOTS = [
    EquipSlot.HEAD,
    EquipSlot.CAPE,
    EquipSlot.AMULET,
    EquipSlot.TORSO,
    EquipSlot.LEGS,
    EquipSlot.HANDS,
    EquipSlot.FEET,
    EquipSlot.SHIELD,
];

// Discontinued holiday rares, worth next to nothing by the cache's value
const RARES =
    /partyhat|h'ween mask|halloween mask|santa hat|bunny ears|3rd age|gilded|christmas cracker/i;
// Names no player's item has
const JUNK = /^(null|unused|dummy|test|placeholder)\b|\btest\b|<col|^\W/i;

// Rarity by the item's value in the cache: c, u, r, v (common to very rare)
function rarityOf(obj: ObjType): string {
    if (RARES.test(obj.name) || obj.price > 600_000) {
        return "v";
    }
    if (obj.price > 60_000) {
        return "r";
    }
    if (obj.price > 2_000) {
        return "u";
    }
    return "c";
}

const cacheInfo = loadCacheInfos().find((c) => c.name === GAME_CACHE_NAME)!;
const loaded = loadCache(cacheInfo);
const system = CacheSystem.fromFiles(loaded.type, loaded.files);
const objs = getCacheLoaderFactory(cacheInfo, system).getObjTypeLoader();

// One item for each look: items that wear the same models with the same colours are the same
// cosmetic (charged and uncharged, a Barrows piece at each degrade), under the shortest name. An
// adventurer's own piece is the one kept, as it's theirs to wear for nothing.
const adventurers = new Set(CHARACTERS.flatMap((c) => Object.values(c.equipment)));
const looks = new Map<string, { id: number; obj: ObjType }>();
for (let id = 0; id < objs.getCount(); id++) {
    const obj = objs.load(id);
    if (
        !obj.name ||
        JUNK.test(obj.name) ||
        obj.noteTemplate !== -1 ||
        obj.placeholderTemplate !== -1 ||
        !SLOTS.includes(obj.op13) ||
        // Both bodies wear it
        obj.maleModel === -1 ||
        obj.femaleModel === -1 ||
        !obj.inventoryActions.some((op) => op && /^(wear|wield|equip)$/i.test(op))
    ) {
        continue;
    }
    const key = [
        obj.op13,
        obj.maleModel,
        obj.maleModel1,
        obj.maleModel2,
        obj.femaleModel,
        obj.femaleModel1,
        obj.femaleModel2,
        obj.recolorTo?.join(","),
        obj.retextureTo?.join(","),
    ].join("|");
    const kept = looks.get(key);
    const better =
        !kept ||
        (adventurers.has(id) !== adventurers.has(kept.id)
            ? adventurers.has(id)
            : obj.name.length < kept.obj.name.length);
    if (better) {
        looks.set(key, { id, obj });
    }
}

const bySlot = new Map<number, string[]>(SLOTS.map((slot) => [slot, []]));
for (const { id, obj } of [...looks.values()].sort(
    (a, b) => a.obj.name.localeCompare(b.obj.name) || a.id - b.id,
)) {
    bySlot.get(obj.op13)!.push(`[${id}, ${JSON.stringify(obj.name)}, "${rarityOf(obj)}"]`);
}

// Character creation's kits for each body part, body type A's (male in the cache) and B's
const idks = createIdkTypeLoader(cacheInfo, system);
const kits: number[][][] = [0, 1].map(() => [[], [], [], [], [], [], []]);
for (let id = 0; id < idks.getCount(); id++) {
    const idk = idks.load(id);
    if (idk.bodyPartyId !== -1 && !idk.nonSelectable) {
        kits[idk.bodyPartyId >= 7 ? 1 : 0][idk.bodyPartyId % 7].push(id);
    }
}

const SLOT_NAMES: Record<number, string> = {
    [EquipSlot.HEAD]: "HEAD",
    [EquipSlot.CAPE]: "CAPE",
    [EquipSlot.AMULET]: "AMULET",
    [EquipSlot.TORSO]: "TORSO",
    [EquipSlot.SHIELD]: "SHIELD",
    [EquipSlot.LEGS]: "LEGS",
    [EquipSlot.HANDS]: "HANDS",
    [EquipSlot.FEET]: "FEET",
};

const lines = [
    "// Generated from the game's cache by scripts/cache/cosmetics.ts: don't edit by hand.",
    "//",
    "// Every item that can be worn outside the weapon slot, one of each look, as [item id, name,",
    "// rarity (c, u, r, v: common to very rare, by its value)], by slot; and character creation's",
    "// identity kits for each body part (hair, jaw, torso, arms, hands, legs, feet), for body type",
    "// A and B.",
    'import { EquipSlot } from "../../rs/model/player/PlayerModelLoader";',
    "",
    "export type CosmeticRow = [objId: number, name: string, rarity: string];",
    "",
    "export const COSMETIC_ROWS: [EquipSlot, CosmeticRow[]][] = [",
    ...SLOTS.flatMap((slot) => [
        `    [EquipSlot.${SLOT_NAMES[slot]}, [`,
        ...bySlot.get(slot)!.map((row) => `        ${row},`),
        "    ]],",
    ]),
    "];",
    "",
    `export const BODY_KIT_IDS: number[][][] = ${JSON.stringify(kits)};`,
    "",
];
fs.writeFileSync(OUT, lines.join("\n"));
console.log(
    `${looks.size} cosmetics (${SLOTS.map((s) => `${SLOT_NAMES[s]} ${bySlot.get(s)!.length}`).join(", ")}) to ${OUT}`,
);
