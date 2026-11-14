// What slim-cache.ts loads to find out which groups the game reads, resolved
// from the content into plain units that can run apart (in worker threads,
// slim-load.ts): each map, batches of bakes and of item icons, and the textures,
// sounds and sprites. Workers don't import this, so a content change only
// changes the units whose inputs it changes, and only those are loaded again.
import { createHash } from "node:crypto";

import {
    GameAssets,
    PICKUP_OBJS,
    PILE_LOOKS,
    PLAYER_SEQS,
    getCharacterAppearance,
    getGameSpriteIds,
    getPlayerAttackSeqs,
    getPowerUpLookRequests,
} from "../../src/game/client/GameAssets";
import { getGameSoundIds } from "../../src/game/client/GameSounds";
import { CHARACTERS } from "../../src/game/content/characters";
import { ENEMIES } from "../../src/game/content/enemies";
import { BLOOD_SOULREAPER_AXE_OBJ } from "../../src/game/content/gauntlet";
import { CASKETS, GEAR, GEAR_SLOT_BY_ID, ITEMS } from "../../src/game/content/items";
import { ALL_MAPS, getArenaRegion } from "../../src/game/content/maps";
import { PASSIVES } from "../../src/game/content/passives";
import { PETS } from "../../src/game/content/pets";
import { POWER_UPS, THRALLS } from "../../src/game/content/powerups";
import { RANDOM_EVENTS } from "../../src/game/content/randomEvents";
import { SHOP_UPGRADES } from "../../src/game/content/shop";
import { getPlayerStanceSeqs } from "../../src/game/content/stances";
import { STAT_ICON_OBJ_IDS } from "../../src/game/content/statIcons";
import { COLLECTION_LOG_OBJ } from "../../src/game/content/titleIcons";
import { TROPHIES } from "../../src/game/content/trophies";
import {
    BODY_PARTS,
    COSMETICS,
    WARDROBE_SLOTS,
    getBodyKits,
    getDefaultBody,
} from "../../src/game/content/wardrobe";
import { WEAPONS } from "../../src/game/content/weapons";
import { getRecipe } from "../../src/game/scaperune/squares";
import { BakeRequest } from "../../src/mapviewer/webgl/actor/ActorBakeTypes";
import { RegionDataInput } from "../../src/mapviewer/worker/RegionData";
import {
    EquipSlot,
    PlayerAppearance,
    createAppearance,
} from "../../src/rs/model/player/PlayerModelLoader";
import { MAP_MARGIN, getMapSquares } from "./slim-squares";

// The most bake requests put through one buffer. The game bakes a map's worth
// at a time: everything in one buffer is more than an array can hold (Invalid
// array length).
const BAKE_BATCH = 25;
// Icons fill no buffer, so their batches can be bigger
const ICON_BATCH = 64;

type BakeGroup = "base" | "enemies" | "pets" | "players";

// A piece of what the game loads. Plain data, to be sent to a worker. A map
// with a ScapeRune recipe carries the fingerprint of the recipes' code.
export type SlimUnit =
    | { kind: "map"; id: string; region: RegionDataInput; recipe?: string }
    | { kind: "bake"; group: BakeGroup; requests: BakeRequest[] }
    | { kind: "textures" }
    | { kind: "sounds"; ids: number[] }
    | { kind: "sprites"; ids: number[] }
    | { kind: "icons"; objIds: number[] };

export function describeUnit(unit: SlimUnit): string {
    switch (unit.kind) {
        case "map":
            return `map ${unit.id}`;
        case "bake":
            return `${unit.group} bakes from ${unit.requests[0].key}`;
        case "icons":
            return `icons from ${unit.objIds[0]}`;
        default:
            return unit.kind;
    }
}

// Cuts items into batches by their keys rather than their places in the
// content, so that adding or taking out one changes only the batch it's in (or
// two, at a full one), and every other batch's reads are reused. They're sorted
// by a hash of the key, and a batch ends after a key whose hash is a multiple
// of `every`, or when it's full. Items with the same key stay together, so each
// batch's first key names it.
export function batchByKey<T>(
    items: T[],
    getKey: (item: T) => string,
    every: number,
    max: number,
): T[][] {
    const keyed = items.map((item) => {
        const key = getKey(item);
        return { item, key, hash: createHash("sha256").update(key).digest().readUInt32BE(0) };
    });
    keyed.sort((a, b) => a.hash - b.hash || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
    const batches: T[][] = [];
    let batch: T[] = [];
    keyed.forEach(({ item, key, hash }, i) => {
        batch.push(item);
        const next = keyed[i + 1];
        if (!next || (next.key !== key && (hash % every === 0 || batch.length >= max))) {
            batches.push(batch);
            batch = [];
        }
    });
    return batches;
}

// Every item the player can wear, in its slot: the outfits, held weapons, the
// pieces passives put on and casket gear
function getWornObjs(): [EquipSlot, number][] {
    const worn: [EquipSlot, number][] = [];
    for (const character of CHARACTERS) {
        for (const [slot, objId] of Object.entries(character.equipment)) {
            if (objId !== undefined) {
                worn.push([Number(slot), objId]);
            }
        }
    }
    // The fun maps' players (baked in getBaseRequests too)
    for (const enemy of ENEMIES) {
        for (const outfit of enemy.outfits ?? []) {
            for (const [slot, objId] of Object.entries(outfit.equipment)) {
                if (objId !== undefined && objId !== -1) {
                    worn.push([Number(slot), objId]);
                }
            }
        }
    }
    for (const weapon of WEAPONS) {
        for (const level of weapon.levels) {
            if (level.objId !== undefined) {
                worn.push([EquipSlot.WEAPON, level.objId]);
            }
        }
    }
    // The Soulreaper axe, blood-touched (the Forgotten Four's look, setGauntletLooks in GameAssets.ts)
    worn.push([EquipSlot.WEAPON, BLOOD_SOULREAPER_AXE_OBJ]);
    for (const passive of PASSIVES) {
        for (const piece of passive.equipment ?? []) {
            for (const objId of piece.objIds) {
                if (objId !== -1) {
                    worn.push([piece.slot, objId]);
                }
            }
        }
    }
    for (const gear of GEAR) {
        const equipSlot = GEAR_SLOT_BY_ID.get(gear.slot)?.equipSlot;
        if (equipSlot !== undefined) {
            worn.push([equipSlot, gear.objId]);
        }
    }
    return worn;
}

// Every item id in the content (objId, iconObjId, casketObjId, objIds...), for
// their icons
function getContentObjIds(): number[] {
    const ids = new Set<number>([
        COLLECTION_LOG_OBJ,
        ...Object.values(PICKUP_OBJS),
        ...Object.values(PILE_LOOKS).flatMap((looks) => looks.map((look) => look.objId)),
        ...STAT_ICON_OBJ_IDS,
        // The Wardrobe's store
        ...COSMETICS.map((cosmetic) => cosmetic.objId),
    ]);
    for (const [, objId] of getWornObjs()) {
        ids.add(objId);
    }
    const seen = new Set<object>();
    const visit = (value: unknown, key: string): void => {
        if (typeof value === "number") {
            if (/objIds?$/i.test(key) && value >= 0) {
                ids.add(value);
            }
        } else if (value && typeof value === "object" && !seen.has(value)) {
            seen.add(value);
            for (const [childKey, child] of Object.entries(value)) {
                visit(child, Array.isArray(value) ? key : childKey);
            }
        }
    };
    visit(
        {
            CHARACTERS,
            ENEMIES,
            WEAPONS,
            PASSIVES,
            ITEMS,
            CASKETS,
            POWER_UPS,
            RANDOM_EVENTS,
            THRALLS,
            ALL_MAPS,
            SHOP_UPGRADES,
            TROPHIES,
        },
        "",
    );
    return [...ids];
}

function playerRequest(key: string, appearance: PlayerAppearance, seqIds: number[]): BakeRequest {
    return { kind: "player", key, appearance, seqIds };
}

// A body of type B (the cache's female), which wears items' female models
function bodyB(appearance: PlayerAppearance): PlayerAppearance {
    const body = getDefaultBody(1);
    return { ...appearance, female: true, kits: body.kits, colors: body.colors };
}

// Every kit the Wardrobe offers, on both bodies: the nth of each body part's kits at once
function getKitRequests(): BakeRequest[] {
    return ([0, 1] as const).flatMap((bodyType) => {
        const lists = BODY_PARTS.map((_, part) => getBodyKits(bodyType, part));
        const most = Math.max(...lists.map((list) => list.length));
        return Array.from({ length: most }, (_, i) => {
            const body = getDefaultBody(bodyType);
            const appearance = createAppearance();
            appearance.female = bodyType === 1;
            appearance.kits = lists.map((list, part) => list[i] ?? body.kits[part]);
            return playerRequest(`kits:${bodyType}:${i}`, appearance, []);
        });
    });
}

// Every piece in the Wardrobe's store, on both bodies: the nth of each slot's at once, but for
// shields, which go one at a time (a piece that covers the shield slot would hide one)
function getCosmeticRequests(): BakeRequest[] {
    const bySlot = WARDROBE_SLOTS.map(({ equipSlot }) =>
        COSMETICS.filter((cosmetic) => cosmetic.slot === equipSlot),
    );
    const most = Math.max(...bySlot.map((list) => list.length));
    const looks: [string, PlayerAppearance][] = [];
    for (let i = 0; i < most; i++) {
        const worn: Partial<Record<EquipSlot, number>> = {};
        for (const list of bySlot) {
            const piece = list[i];
            if (piece && piece.slot !== EquipSlot.SHIELD) {
                worn[piece.slot] = piece.objId;
            }
        }
        looks.push([`cosmetics:${i}`, createAppearance(worn)]);
    }
    for (const shield of COSMETICS.filter((cosmetic) => cosmetic.slot === EquipSlot.SHIELD)) {
        looks.push([
            `cosmetics:shield:${shield.objId}`,
            createAppearance({ [EquipSlot.SHIELD]: shield.objId }),
        ]);
    }
    return looks.flatMap(([key, appearance]) => [
        playerRequest(key, appearance, []),
        playerRequest(key + ":b", bodyB(appearance), []),
    ]);
}

function getPlayerRequests(): BakeRequest[] {
    const playerSeqs = [...Object.values(PLAYER_SEQS), ...getPlayerAttackSeqs()];
    return [
        // Every body kit
        playerRequest("bare", createAppearance(), playerSeqs),
        // and body type B's, which the Wardrobe can pick
        playerRequest("bare:b", bodyB(createAppearance()), playerSeqs),
        ...getKitRequests(),
        ...getCosmeticRequests(),
        // Only the look holding the weapon plays these, so one bake reads them
        playerRequest("stances", createAppearance(), getPlayerStanceSeqs()),
        ...CHARACTERS.map((character) =>
            playerRequest(character.id, getCharacterAppearance(character.id), playerSeqs),
        ),
        // Power-ups' worn items and their animations
        ...getPowerUpLookRequests(createAppearance()),
        ...getPowerUpLookRequests(bodyB(createAppearance())).map((request) => ({
            ...request,
            key: request.key + ":b",
        })),
        // On both bodies
        ...getWornObjs().flatMap(([slot, objId]) => [
            playerRequest(`${slot}:${objId}`, createAppearance({ [slot]: objId }), []),
            playerRequest(`${slot}:${objId}:b`, bodyB(createAppearance({ [slot]: objId })), []),
        ]),
    ];
}

const bakeRequests = new Map<BakeGroup, BakeRequest[]>();

function getBakeRequests(group: BakeGroup): BakeRequest[] {
    let requests = bakeRequests.get(group);
    if (!requests) {
        requests =
            group === "base"
                ? GameAssets.getBaseRequests()
                : group === "enemies"
                  ? GameAssets.getEnemyRequests(ENEMIES)
                  : // Pets are baked as they're picked, not with the base: every one of them
                    group === "pets"
                    ? [
                          ...GameAssets.getPetRequests(PETS),
                          // Heroes drawn as NPCs, which are baked as their map's played
                          ...GameAssets.getHeroLookRequests(CHARACTERS),
                          // and maps' NPCs posed as scenery, and their cinematics' casts, which
                          // are baked as their map's played
                          ...GameAssets.getPropRequests(ALL_MAPS),
                      ]
                    : getPlayerRequests();
        bakeRequests.set(group, requests);
    }
    return requests;
}

// Everything the game loads, as units: the maps first, biggest first, as they
// take longest, so that a pool of workers finishes about together. recipes is
// the fingerprint of ScapeRune's recipe code (slim-cache.ts hashes it), for the
// maps that have one.
export function getSlimUnits(recipes: string): SlimUnit[] {
    const squares = (region: RegionDataInput) => {
        const { firstX, firstY, lastX, lastY } = getMapSquares(region);
        return (lastX - firstX + 1 + 2 * MAP_MARGIN) * (lastY - firstY + 1 + 2 * MAP_MARGIN);
    };
    const maps = ALL_MAPS.map(
        (map): Extract<SlimUnit, { kind: "map" }> => ({
            kind: "map",
            id: map.id,
            region: getArenaRegion(map),
            ...(getRecipe(map.id) && { recipe: recipes }),
        }),
    ).sort((a, b) => squares(b.region) - squares(a.region));
    const bakes: SlimUnit[] = [];
    for (const group of ["enemies", "players", "base", "pets"] as const) {
        // The same request twice reads the same groups
        const requests = new Map(
            getBakeRequests(group).map((request) => [JSON.stringify(request), request]),
        );
        for (const batch of batchByKey([...requests.values()], (r) => r.key, 16, BAKE_BATCH)) {
            bakes.push({ kind: "bake", group, requests: batch });
        }
    }
    const icons = batchByKey(getContentObjIds(), String, 32, ICON_BATCH);
    return [
        ...maps,
        ...bakes,
        { kind: "textures" },
        { kind: "sounds", ids: getGameSoundIds() },
        { kind: "sprites", ids: getGameSpriteIds() },
        ...icons.map((objIds): SlimUnit => ({ kind: "icons", objIds })),
    ];
}
