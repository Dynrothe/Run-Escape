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

// What a piece costs in the store, by its rarity (from its value in the cache)
export const COSMETIC_PRICES: Record<Rarity, number> = {
    common: 150,
    uncommon: 500,
    rare: 1500,
    veryRare: 5000,
};

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
    return COSMETIC_PRICES[cosmetic.rarity];
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
// (its own first), and a jaw can be bare.
export function getBodyKits(bodyType: 0 | 1, part: number): number[] {
    const own = BODY_KIT_IDS[bodyType]?.[part] ?? [];
    if (part > JAW) {
        return own;
    }
    const other = BODY_KIT_IDS[1 - bodyType]?.[part] ?? [];
    return part === JAW ? [-1, ...own, ...other] : [...own, ...other];
}

export function getDefaultBody(bodyType: 0 | 1 = 0): BodyLook {
    return {
        bodyType,
        kits: (bodyType === 1 ? DEFAULT_FEMALE_KITS : DEFAULT_MALE_KITS).slice(),
        colors: [0, 0, 0, 0, 0],
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

// Whether a piece can be worn: bought, or an unlocked adventurer's
export function ownsCosmetic(
    owned: readonly number[],
    unlockedCharacters: readonly string[],
    objId: number,
): boolean {
    if (owned.includes(objId)) {
        return true;
    }
    const adventurer = ADVENTURER_PIECES.get(objId);
    return adventurer !== undefined && unlockedCharacters.includes(adventurer);
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
