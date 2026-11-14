import { describe, expect, it } from "vitest";

import { ModelData } from "../../rs/model/ModelData";
import {
    EquipSlot,
    createAppearance,
    getAppearanceKey,
    recolorAtOnce,
} from "../../rs/model/player/PlayerModelLoader";
import { getCharacterAppearance } from "../client/GameAssets";
import { buyCosmetic, canWearCosmetic, createSave, migrateSave } from "../core/save";
import { COSMETIC_ROWS } from "./cosmeticItems";
import {
    CAPE_PARTS,
    CAPE_PRESETS,
    CUSTOM_MAX_CAPE,
    CUSTOM_MAX_CAPE_PRICE,
    DEFAULT_CAPE_COLOURS,
    applyCapeColours,
    cleanCapeColours,
    getCapeRecolors,
    packHsl,
    sameCapeColours,
    unpackHsl,
} from "./maxCape";
import {
    COSMETICS,
    COSMETIC_BY_ID,
    cleanLook,
    cleanSavedOutfits,
    getCosmeticPrice,
    isWearingOutfit,
    saveOutfit,
    wearOutfit,
} from "./wardrobe";

const custom = COSMETIC_BY_ID.get(CUSTOM_MAX_CAPE)!;
const otherCape = COSMETICS.find((c) => c.slot === EquipSlot.CAPE && c !== custom)!;
// Green sides, the rest the max cape's own
const SIDES = CAPE_PARTS.findIndex((part) => part.id === "sides");
const TRIM = CAPE_PARTS.findIndex((part) => part.id === "trim");
const green = DEFAULT_CAPE_COLOURS.map((c, i) => (i === SIDES ? packHsl(21, 7, 30) : c));
const wearing = { [EquipSlot.CAPE]: CUSTOM_MAX_CAPE };

describe("the customisable max cape", () => {
    it("is sold among the capes for 25,000 coins", () => {
        expect(custom.slot).toBe(EquipSlot.CAPE);
        expect(custom.name).toBe("Customisable max cape");
        expect(getCosmeticPrice(custom)).toBe(25_000);
        expect(CUSTOM_MAX_CAPE_PRICE).toBe(25_000);
        // Not one of the cache's looks: the generated list keeps the first Max cape (13280)
        expect(COSMETIC_ROWS.flatMap(([, rows]) => rows.map(([id]) => id))).not.toContain(
            CUSTOM_MAX_CAPE,
        );
        expect(COSMETIC_BY_ID.has(13280)).toBe(true);
        const capes = COSMETICS.filter((c) => c.slot === EquipSlot.CAPE).map((c) => c.name);
        expect(capes).toEqual([...capes].sort((a, b) => a.localeCompare(b)));
        const save = createSave();
        save.coins = 24_999;
        expect(buyCosmetic(save, CUSTOM_MAX_CAPE)).toBe(false);
        save.coins = 25_000;
        expect(buyCosmetic(save, CUSTOM_MAX_CAPE)).toBe(true);
        expect(save.coins).toBe(0);
        expect(canWearCosmetic(save, CUSTOM_MAX_CAPE)).toBe(true);
        // Buying it doesn't bring the plain one
        expect(canWearCosmetic(save, 13280)).toBe(false);
    });

    it("has a colour for each part, and the cache's max capes to start from", () => {
        expect(DEFAULT_CAPE_COLOURS).toHaveLength(CAPE_PARTS.length);
        expect(CAPE_PRESETS[0]).toEqual({ objId: 13280, colours: DEFAULT_CAPE_COLOURS });
        for (const preset of CAPE_PRESETS) {
            expect(preset.colours).toHaveLength(CAPE_PARTS.length);
            expect(COSMETIC_BY_ID.get(preset.objId)?.slot).toBe(EquipSlot.CAPE);
        }
        const colours = CAPE_PARTS.flatMap((part) => part.colours);
        expect(new Set(colours).size).toBe(colours.length);
    });

    it("keeps colours a look can have, and none that are the cape's own", () => {
        expect(cleanCapeColours(green)).toEqual(green);
        expect(cleanCapeColours(DEFAULT_CAPE_COLOURS)).toBeUndefined();
        expect(cleanCapeColours(green.slice(1))).toBeUndefined();
        expect(cleanCapeColours([...green.slice(1), 65536])).toBeUndefined();
        expect(cleanCapeColours([...green.slice(1), -1])).toBeUndefined();
        expect(cleanCapeColours([...green.slice(1), 1.5])).toBeUndefined();
        expect(cleanCapeColours("red")).toBeUndefined();
        expect(cleanLook({ capeColours: green })?.capeColours).toEqual(green);
        expect(cleanLook({ capeColours: DEFAULT_CAPE_COLOURS })).toBeUndefined();
        expect(sameCapeColours(undefined, DEFAULT_CAPE_COLOURS)).toBe(true);
        expect(sameCapeColours(green, undefined)).toBe(false);
    });

    it("paints only the parts that aren't the cape's own, each shade against the picked", () => {
        expect(getCapeRecolors(DEFAULT_CAPE_COLOURS)).toEqual([]);
        const pairs = getCapeRecolors(green);
        // The sides' two shades: the main one as picked, the lighter 7 lighter still
        expect(pairs).toEqual([668, packHsl(21, 7, 30), 675, packHsl(21, 7, 37)]);
        // Shades stay within the lightness there is
        const white = DEFAULT_CAPE_COLOURS.map((c, i) => (i === TRIM ? packHsl(10, 3, 120) : c));
        const gold = getCapeRecolors(white);
        expect(gold.filter((_, i) => i % 2 === 0)).toEqual(CAPE_PARTS[TRIM].colours);
        expect(gold.filter((_, i) => i % 2 === 1).map((c) => unpackHsl(c).lightness)).toEqual([
            120, 127, 127, 127, 127,
        ]);
        expect(unpackHsl(packHsl(63, 7, 127))).toEqual({ hue: 63, saturation: 7, lightness: 127 });
    });

    it("is worn in its colours, and only on itself", () => {
        const look = { outfit: wearing, capeColours: green };
        const wizard = getCharacterAppearance("wizard", look);
        expect(wizard.equipment[EquipSlot.CAPE]).toBe(CUSTOM_MAX_CAPE);
        expect(wizard.recolors).toEqual({ [EquipSlot.CAPE]: getCapeRecolors(green) });
        // In its own colours, or another cape, nothing's repainted and the look bakes as before
        const own = getCharacterAppearance("wizard", { outfit: wearing });
        expect(own.recolors).toBeUndefined();
        const other = { outfit: { [EquipSlot.CAPE]: otherCape.objId }, capeColours: green };
        const plain = getCharacterAppearance("wizard", other);
        expect(plain.recolors).toBeUndefined();
        expect(getAppearanceKey(plain)).toBe(
            getAppearanceKey(getCharacterAppearance("wizard", { outfit: other.outfit })),
        );
        expect(getAppearanceKey(wizard)).not.toBe(getAppearanceKey(own));
        // Gear over it takes the colours off with it
        const covered = getCharacterAppearance("wizard", look);
        covered.equipment[EquipSlot.CAPE] = otherCape.objId;
        applyCapeColours(covered, green);
        expect(covered.recolors).toBeUndefined();
    });

    it("is saved with its colours, and they go with a saved outfit that has it", () => {
        const save = createSave();
        save.coins = 25_000;
        buyCosmetic(save, CUSTOM_MAX_CAPE);
        save.look = { outfit: wearing, capeColours: green };
        const loaded = migrateSave(JSON.parse(JSON.stringify(save)));
        expect(loaded.cosmetics).toEqual([CUSTOM_MAX_CAPE]);
        expect(loaded.look).toEqual({ outfit: wearing, capeColours: green });

        const [saved] = saveOutfit([], "Green", save.look)!;
        expect(saved).toEqual({ name: "Green", outfit: wearing, capeColours: green });
        expect(isWearingOutfit(save.look, saved)).toBe(true);
        expect(isWearingOutfit({ outfit: wearing }, saved)).toBe(false);
        // Put on over other colours, it brings its own
        expect(
            wearOutfit({ capeColours: DEFAULT_CAPE_COLOURS.slice() }, saved).capeColours,
        ).toEqual(green);
        // An outfit without the cape keeps no colours, and wearing it leaves the look's be
        const [bare] = saveOutfit([], "Bare", { outfit: {}, capeColours: green })!;
        expect(bare).toEqual({ name: "Bare" });
        expect(wearOutfit({ capeColours: green }, bare).capeColours).toEqual(green);
        expect(isWearingOutfit({ capeColours: green }, bare)).toBe(true);
        // One in the cape's own colours puts those back on
        const [plain] = saveOutfit([], "Plain", { outfit: wearing })!;
        expect(wearOutfit({ outfit: wearing, capeColours: green }, plain).capeColours).toBe(
            undefined,
        );
        expect(
            cleanSavedOutfits(
                [saved, { ...bare, capeColours: green }],
                (objId) => objId === CUSTOM_MAX_CAPE,
            ),
        ).toEqual([saved, bare]);
    });
});

describe("repainting a worn item", () => {
    function model(colors: number[]): ModelData {
        return { faceCount: colors.length, faceColors: Uint16Array.from(colors) } as ModelData;
    }

    it("paints every pair at once", () => {
        const m = model([668, 815, 945, 668]);
        // 668 becomes 815, and 815 becomes 0: the cloth doesn't go on to 0 with the trim
        recolorAtOnce(m, [668, 815, 815, 0]);
        expect([...m.faceColors]).toEqual([815, 0, 945, 815]);
    });

    it("keeps clear of the colours the body colours repaint", () => {
        // The hair's (6798) and the skin's (4550) would come out in the player's own colours
        const m = model([668, 675]);
        recolorAtOnce(m, [668, 6798, 675, 4550]);
        expect([...m.faceColors]).toEqual([6799, 4551]);
    });

    it("changes the look's key only when there's something to repaint", () => {
        const plain = createAppearance({ [EquipSlot.CAPE]: CUSTOM_MAX_CAPE });
        const key = getAppearanceKey(plain);
        expect(getAppearanceKey({ ...plain, recolors: {} })).toBe(key);
        expect(getAppearanceKey({ ...plain, recolors: { [EquipSlot.CAPE]: [] } })).toBe(key);
        expect(getAppearanceKey({ ...plain, recolors: { [EquipSlot.CAPE]: [668, 0] } })).not.toBe(
            key,
        );
    });
});
