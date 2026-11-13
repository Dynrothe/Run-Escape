import {
    BODY_COLOR_COUNTS,
    DEFAULT_FEMALE_KITS,
    DEFAULT_MALE_KITS,
    EquipSlot,
    PlayerAppearance,
} from "../../rs/model/player/PlayerModelLoader";
import { tr } from "../i18n";
import { CHARACTERS } from "./characters";
import { BODY_KIT_IDS, COSMETIC_ROWS } from "./cosmeticItems";
import { GEAR_SLOTS } from "./items";
import { Rarity } from "./rarity";
import { TROPHY_BY_ID, TrophyDef } from "./trophies";
import { CharacterDef } from "./types";

// The Wardrobe: how the player looks, on every adventurer. A body (its type, kits and colours, as
// character creation picks them) and an outfit over it, slot by slot, of pieces bought in the
// Wardrobe's store or worn by an adventurer who's been unlocked. Looks only: the sim never sees
// any of it, and co-op sends it along with the loadout, as it does the pet.

// The body: type A or B (the cache's male and female), a kit per body part (BODY_PARTS) and a
// colour per body colour (BODY_COLOURS)
export type BodyLook = { bodyType: 0 | 1; kits: number[]; colors: number[] };

// Equipment slot -> the item worn there, or -1 for nothing over the body. A slot that isn't set
// wears the adventurer's own piece.
export type Outfit = Partial<Record<number, number>>;

export type WardrobeLook = {
    body?: BodyLook;
    outfit?: Outfit;
    // The outfit stays on over gear from passives and caskets, as an adventurer's fixed outfit does
    overGear?: boolean;
};

export type CosmeticDef = { objId: number; name: string; slot: EquipSlot; rarity: Rarity };

const RARITY_CODES: Record<string, Rarity> = {
    c: "common",
    u: "uncommon",
    r: "rare",
    v: "veryRare",
};

// What a piece costs in the store, by its rarity (from its value in the cache). A late map's run
// banks around a thousand coins, so the dearest are something to save up for.
export const COSMETIC_PRICES: Record<Rarity, number> = {
    common: 200,
    uncommon: 1_000,
    rare: 5_000,
    veryRare: 25_000,
};

// 3rd Age, the rarest the store sells, is dearer than its rarity says: a piece is about half of a
// combat style's whole skill page
const THIRD_AGE = /^3rd age\b/i;
export const THIRD_AGE_PRICE = 250_000;

export const COSMETICS: CosmeticDef[] = COSMETIC_ROWS.flatMap(([slot, rows]) =>
    rows.map(([objId, name, rarity]) => ({
        objId,
        name,
        slot,
        rarity: RARITY_CODES[rarity] ?? "common",
    })),
);

export const COSMETIC_BY_ID: Map<number, CosmeticDef> = new Map(COSMETICS.map((c) => [c.objId, c]));

// The wardrobe's slots, as the Armoury names them (rings aren't drawn)
export const WARDROBE_SLOTS = GEAR_SLOTS.flatMap((slot) =>
    slot.equipSlot === undefined ? [] : [{ ...slot, equipSlot: slot.equipSlot }],
);

const WARDROBE_SLOT_IDS = new Set<number>(WARDROBE_SLOTS.map((slot) => slot.equipSlot));

export function cosmeticName(cosmetic: CosmeticDef): string {
    return tr(`cosmetic.${cosmetic.objId}.name`, cosmetic.name);
}

export function getCosmeticPrice(cosmetic: CosmeticDef): number {
    return THIRD_AGE.test(cosmetic.name) ? THIRD_AGE_PRICE : COSMETIC_PRICES[cosmetic.rarity];
}

// The body parts character creation has, in the order of PlayerAppearance.kits
export const BODY_PARTS = [
    { id: "hair", name: "Hair" },
    { id: "jaw", name: "Jaw" },
    { id: "torso", name: "Torso" },
    { id: "arms", name: "Arms" },
    { id: "hands", name: "Hands" },
    { id: "legs", name: "Legs" },
    { id: "feet", name: "Feet" },
] as const;

const JAW = 1;

export function bodyPartName(part: (typeof BODY_PARTS)[number]): string {
    return tr(`wardrobe.part.${part.id}.name`, part.name);
}

// The body colours, in the order of PlayerAppearance.colors, and how many choices each has
export const BODY_COLOURS = [
    { id: "hair", name: "Hair" },
    { id: "torso", name: "Top" },
    { id: "legs", name: "Legs" },
    { id: "feet", name: "Boots" },
    { id: "skin", name: "Skin" },
].map((colour, i) => ({ ...colour, count: BODY_COLOR_COUNTS[i] }));

export function bodyColourName(colour: (typeof BODY_COLOURS)[number]): string {
    return tr(`wardrobe.colour.${colour.id}.name`, colour.name);
}

// The kits a body type can pick for a body part. Hair and jaw go with either body, as in OSRS
// (its own first). There's always a jaw: it's the chin and mouth, so a face without one has a hole.
export function getBodyKits(bodyType: 0 | 1, part: number): number[] {
    const own = BODY_KIT_IDS[bodyType]?.[part] ?? [];
    if (part > JAW) {
        return own;
    }
    return [...own, ...(BODY_KIT_IDS[1 - bodyType]?.[part] ?? [])];
}

export function getDefaultBody(bodyType: 0 | 1 = 0): BodyLook {
    return {
        bodyType,
        kits: (bodyType === 1 ? DEFAULT_FEMALE_KITS : DEFAULT_MALE_KITS).slice(),
        colors: [0, 0, 0, 0, 0],
    };
}

// A body picked at random, of either type: any kit it can have for each part, and any colour.
// random: a number from 0 up to 1 (Math.random; the menus aren't the sim's).
export function randomBody(random: () => number): BodyLook {
    const pick = (count: number) => Math.min(count - 1, Math.floor(random() * count));
    const bodyType = pick(2) as 0 | 1;
    return {
        bodyType,
        kits: BODY_PARTS.map((_, part) => {
            const kits = getBodyKits(bodyType, part);
            return kits[pick(kits.length)];
        }),
        colors: BODY_COLOURS.map((colour) => pick(colour.count)),
    };
}

// Someone in particular keeps their own look: a fixed outfit (the Avian Assaulter's chicken) or a
// body of their own (Durial321's hair)
export function wearsWardrobe(character: CharacterDef): boolean {
    return !character.fixedOutfit && !character.kits;
}

// Each piece an adventurer wears, by the first adventurer that wears it: theirs to wear for nothing
// once they're unlocked
const ADVENTURER_PIECES = new Map<number, string>();
for (const character of CHARACTERS) {
    if (character.only || !wearsWardrobe(character)) {
        continue;
    }
    for (const objId of Object.values(character.equipment)) {
        if (objId !== undefined && COSMETIC_BY_ID.has(objId) && !ADVENTURER_PIECES.has(objId)) {
            ADVENTURER_PIECES.set(objId, character.id);
        }
    }
}

// The adventurer who brings this piece for nothing, if one does
export function getPieceAdventurer(objId: number): string | undefined {
    return ADVENTURER_PIECES.get(objId);
}

// Pieces the store never sells, each worn once its trophy's in the Collection log: trophy id ->
// the pieces it brings besides its own item (if that's worn): what it makes in OSRS, or other
// looks of it
const FOUND_PIECE_TROPHIES: Record<string, number[]> = {
    // The Hallowed Night's pumpkins
    red_halloween_mask: [],
    blue_halloween_mask: [],
    green_halloween_mask: [],
    black_hween_mask: [],
    jack_lantern_mask: [],
    skeleton_mask: [],
    // The Theatre of Blood's chest: the defender the hilt makes, and Ghommal's
    avernic_defender_hilt: [22322, 27550, 27552],
    justiciar_faceguard: [],
    justiciar_chestguard: [],
    justiciar_legguards: [],
    // The Tombs of Amascut's chest, and each piece fortified (and the ward's ornament)
    masori_mask: [27235],
    masori_body: [27238],
    masori_chaps: [27241],
    elidinis_ward: [27251, 27253],
    // Thanksgiving Harvest, and every other look of the Chompy bird hat
    turkey_hat: [],
    chompy_hat: [
        2979, 2980, 2981, 2982, 2983, 2984, 2985, 2986, 2987, 2988, 2989, 2990, 2991, 2992, 2993,
        2994, 2995,
    ],
};

const FOUND_PIECES = new Map<number, TrophyDef>(
    Object.entries(FOUND_PIECE_TROPHIES).flatMap(([id, also]) => {
        const trophy = TROPHY_BY_ID.get(id)!;
        return [trophy.objId, ...also]
            .filter((objId) => COSMETIC_BY_ID.has(objId))
            .map((objId) => [objId, trophy] as const);
    }),
);

// The trophy that brings this piece, if it's found rather than bought
export function getPieceTrophy(objId: number): TrophyDef | undefined {
    return FOUND_PIECES.get(objId);
}

// What a save says of the pieces a player has
export type WardrobeOwner = {
    cosmetics?: readonly number[];
    unlockedCharacters: readonly string[];
    trophies: readonly string[];
};

// Whether a piece can be worn: bought, an unlocked adventurer's, or found
export function ownsCosmetic(owner: WardrobeOwner, objId: number): boolean {
    const trophy = FOUND_PIECES.get(objId);
    if (trophy) {
        return owner.trophies.includes(trophy.id);
    }
    if (owner.cosmetics?.includes(objId)) {
        return true;
    }
    const adventurer = ADVENTURER_PIECES.get(objId);
    return adventurer !== undefined && owner.unlockedCharacters.includes(adventurer);
}

function cleanBody(raw: unknown): BodyLook | undefined {
    if (!raw || typeof raw !== "object") {
        return undefined;
    }
    const data = raw as Partial<BodyLook>;
    const bodyType = data.bodyType === 1 ? 1 : 0;
    const body = getDefaultBody(bodyType);
    BODY_PARTS.forEach((_, part) => {
        const kit = Array.isArray(data.kits) ? data.kits[part] : undefined;
        if (typeof kit === "number" && getBodyKits(bodyType, part).includes(kit)) {
            body.kits[part] = kit;
        }
    });
    BODY_COLOURS.forEach((colour, i) => {
        const value = Array.isArray(data.colors) ? data.colors[i] : undefined;
        if (Number.isInteger(value) && value! >= 0 && value! < colour.count) {
            body.colors[i] = value!;
        }
    });
    return body;
}

// A look as it can be worn, from a save or another player's game (which could send anything): what
// this game doesn't know is left off. canWear: the pieces this player may wear (their own save's),
// any the store has if not given.
export function cleanLook(
    raw: unknown,
    canWear: (objId: number) => boolean = () => true,
): WardrobeLook | undefined {
    if (!raw || typeof raw !== "object") {
        return undefined;
    }
    const data = raw as WardrobeLook;
    const look: WardrobeLook = {};
    const body = cleanBody(data.body);
    if (body) {
        look.body = body;
    }
    if (data.outfit && typeof data.outfit === "object") {
        const outfit: Outfit = {};
        for (const [key, value] of Object.entries(data.outfit)) {
            const slot = Number(key);
            if (!WARDROBE_SLOT_IDS.has(slot) || typeof value !== "number") {
                continue;
            }
            if (value === -1 || (COSMETIC_BY_ID.get(value)?.slot === slot && canWear(value))) {
                outfit[slot] = value;
            }
        }
        if (Object.keys(outfit).length > 0) {
            look.outfit = outfit;
        }
    }
    if (data.overGear === true) {
        look.overGear = true;
    }
    return Object.keys(look).length > 0 ? look : undefined;
}

// Puts the body on a look (an adventurer's, before the outfit goes on)
export function applyBody(appearance: PlayerAppearance, body: BodyLook | undefined): void {
    if (!body) {
        return;
    }
    appearance.female = body.bodyType === 1;
    appearance.kits = body.kits.slice();
    appearance.colors = body.colors.slice();
}

// Puts the outfit's pieces on, slot by slot, over what's worn there
export function applyOutfit(appearance: PlayerAppearance, outfit: Outfit | undefined): void {
    for (const [slot, objId] of Object.entries(outfit ?? {})) {
        if (objId !== undefined) {
            appearance.equipment[Number(slot)] = objId;
        }
    }
}

// ---- Saved outfits ----

// An outfit kept under a name, to put on again in one go: its pieces and whether they go over
// gear. The body isn't in it, so changing the body needn't mean saving each outfit again.
export type SavedOutfit = { name: string; outfit?: Outfit; overGear?: boolean };

export const MAX_SAVED_OUTFITS = 10;
export const MAX_OUTFIT_NAME = 24;

export function cleanOutfitName(name: string): string {
    return name.trim().slice(0, MAX_OUTFIT_NAME);
}

// The look's outfit saved under this name: over the one of that name if there is one, else added
// while there's room. Undefined when the name's blank or there's no room, as nothing changes.
export function saveOutfit(
    outfits: readonly SavedOutfit[],
    name: string,
    look: WardrobeLook | undefined,
): SavedOutfit[] | undefined {
    const named = cleanOutfitName(name);
    if (!named) {
        return undefined;
    }
    const saved: SavedOutfit = { name: named };
    if (look?.outfit && Object.keys(look.outfit).length > 0) {
        saved.outfit = { ...look.outfit };
    }
    if (look?.overGear) {
        saved.overGear = true;
    }
    const at = outfits.findIndex((o) => o.name === named);
    if (at >= 0) {
        return outfits.map((o, i) => (i === at ? saved : o));
    }
    return outfits.length < MAX_SAVED_OUTFITS ? [...outfits, saved] : undefined;
}

// The look with a saved outfit on, its body as it was
export function wearOutfit(look: WardrobeLook | undefined, saved: SavedOutfit): WardrobeLook {
    return { ...look, outfit: saved.outfit && { ...saved.outfit }, overGear: saved.overGear };
}

// Whether the look has this saved outfit on
export function isWearingOutfit(look: WardrobeLook | undefined, saved: SavedOutfit): boolean {
    const a = look?.outfit ?? {};
    const b = saved.outfit ?? {};
    const slots = new Set([...Object.keys(a), ...Object.keys(b)].map(Number));
    return (
        (look?.overGear === true) === (saved.overGear === true) &&
        [...slots].every((slot) => a[slot] === b[slot])
    );
}

// A save's saved outfits, as they can be worn: anything odd left out, one of each name, each
// cleaned as a look is
export function cleanSavedOutfits(
    data: unknown,
    canWear: (objId: number) => boolean = () => true,
): SavedOutfit[] {
    if (!Array.isArray(data)) {
        return [];
    }
    const out: SavedOutfit[] = [];
    for (const item of data) {
        if (out.length >= MAX_SAVED_OUTFITS || typeof item !== "object" || item === null) {
            continue;
        }
        const { name, outfit, overGear } = item as Partial<SavedOutfit>;
        const named = typeof name === "string" ? cleanOutfitName(name) : "";
        if (!named || out.some((o) => o.name === named)) {
            continue;
        }
        const look = cleanLook({ outfit, overGear }, canWear);
        out.push({
            name: named,
            ...(look?.outfit && { outfit: look.outfit }),
            ...(look?.overGear && { overGear: true }),
        });
    }
    return out;
}
