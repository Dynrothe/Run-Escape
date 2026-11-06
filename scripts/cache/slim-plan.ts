// Resolve content into the exact inputs each extraction unit will load.
// Workers don't import this module: content changes invalidate only changed payloads.
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
import { CASKETS, GEAR, GEAR_SLOT_BY_ID, ITEMS } from "../../src/game/content/items";
import { ALL_MAPS, getArenaRegion } from "../../src/game/content/maps";
import { PASSIVES } from "../../src/game/content/passives";
import { PETS } from "../../src/game/content/pets";
import { POWER_UPS, THRALLS } from "../../src/game/content/powerups";
import { RANDOM_EVENTS } from "../../src/game/content/randomEvents";
import { SHOP_UPGRADES } from "../../src/game/content/shop";
import { getPlayerStanceSeqs } from "../../src/game/content/stances";
import { COLLECTION_LOG_OBJ } from "../../src/game/content/titleIcons";
import { TROPHIES } from "../../src/game/content/trophies";
import { WEAPONS } from "../../src/game/content/weapons";
import { BakeRequest } from "../../src/mapviewer/webgl/actor/ActorBakeTypes";
import { RegionDataInput } from "../../src/mapviewer/worker/RegionData";
import {
    EquipSlot,
    PlayerAppearance,
    createAppearance,
} from "../../src/rs/model/player/PlayerModelLoader";
import { MAP_MARGIN, getMapSquares } from "./slim-load";

// Bake requests to put through one buffer
const BAKE_BATCH = 25;

type BakeGroup = "base" | "enemies" | "pets" | "players";

// A piece of what the game loads. Plain data, to be sent to a worker.
export type SlimUnit =
    | { kind: "map"; id: string; region: RegionDataInput }
    | { kind: "bake"; group: BakeGroup; from: number; requests: BakeRequest[] }
    | { kind: "textures" }
    | { kind: "sounds"; ids: number[] }
    | { kind: "sprites"; ids: number[] }
    | { kind: "icons"; objIds: number[] };

export function describeUnit(unit: SlimUnit): string {
    switch (unit.kind) {
        case "map":
            return `map ${unit.id}`;
        case "bake":
            return `${unit.group} bakes from ${unit.from}`;
        default:
            return unit.kind;
    }
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

function getPlayerRequests(): BakeRequest[] {
    const playerSeqs = [...Object.values(PLAYER_SEQS), ...getPlayerAttackSeqs()];
    return [
        // Every body kit
        playerRequest("bare", createAppearance(), playerSeqs),
        // Only the look holding the weapon plays these, so one bake reads them
        playerRequest("stances", createAppearance(), getPlayerStanceSeqs()),
        ...CHARACTERS.map((character) =>
            playerRequest(character.id, getCharacterAppearance(character.id), playerSeqs),
        ),
        // Power-ups' worn items and their animations
        ...getPowerUpLookRequests(createAppearance()),
        ...getWornObjs().map(([slot, objId]) =>
            playerRequest(`${slot}:${objId}`, createAppearance({ [slot]: objId }), []),
        ),
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
                    ? GameAssets.getPetRequests(PETS)
                    : getPlayerRequests();
        bakeRequests.set(group, requests);
    }
    return requests;
}

// Everything the game loads, as units: the maps first, biggest first, as they
// take longest, so that a pool of workers finishes about together
export function getSlimUnits(): SlimUnit[] {
    const squares = (region: RegionDataInput) => {
        const { firstX, firstY, lastX, lastY } = getMapSquares(region);
        return (lastX - firstX + 1 + 2 * MAP_MARGIN) * (lastY - firstY + 1 + 2 * MAP_MARGIN);
    };
    const maps = ALL_MAPS.map((map): Extract<SlimUnit, { kind: "map" }> => ({
        kind: "map",
        id: map.id,
        region: getArenaRegion(map),
    })).sort((a, b) => squares(b.region) - squares(a.region));
    const bakes: SlimUnit[] = [];
    for (const group of ["enemies", "players", "base", "pets"] as const) {
        const requests = getBakeRequests(group);
        for (let from = 0; from < requests.length; from += BAKE_BATCH) {
            bakes.push({
                kind: "bake",
                group,
                from,
                requests: requests.slice(from, from + BAKE_BATCH),
            });
        }
    }
    return [
        ...maps,
        ...bakes,
        { kind: "textures" },
        { kind: "sounds", ids: getGameSoundIds() },
        { kind: "sprites", ids: getGameSpriteIds() },
        { kind: "icons", objIds: getContentObjIds() },
    ];
}
