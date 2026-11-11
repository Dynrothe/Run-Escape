import { describe, expect, it } from "vitest";

import { EquipSlot } from "../../rs/model/player/PlayerModelLoader";
import { getCharacterAppearance } from "../client/GameAssets";
import { makeLoadout } from "../client/coop/CoopLobby";
import { buyCosmetic, canWearCosmetic, createSave, migrateSave } from "../core/save";
import { CHARACTERS, getCharacter } from "./characters";
import {
    BODY_COLOURS,
    BODY_PARTS,
    COSMETICS,
    COSMETIC_BY_ID,
    WARDROBE_SLOTS,
    cleanLook,
    getBodyKits,
    getCosmeticPrice,
    getDefaultBody,
    getPieceAdventurer,
    wearsWardrobe,
} from "./wardrobe";

const hat = COSMETICS.find((c) => c.slot === EquipSlot.HEAD && !getPieceAdventurer(c.objId))!;
const cape = COSMETICS.find((c) => c.slot === EquipSlot.CAPE && !getPieceAdventurer(c.objId))!;

describe("the Wardrobe's store", () => {
    it("has a piece for every slot, each once", () => {
        for (const slot of WARDROBE_SLOTS) {
            expect(COSMETICS.some((c) => c.slot === slot.equipSlot)).toBe(true);
        }
        expect(COSMETIC_BY_ID.size).toBe(COSMETICS.length);
        expect(COSMETICS.some((c) => c.slot === EquipSlot.WEAPON)).toBe(false);
    });

    it("has every adventurer's own pieces, free once they're unlocked", () => {
        const save = createSave();
        const wizard = getCharacter("wizard");
        const hatId = wizard.equipment[EquipSlot.HEAD]!;
        expect(getPieceAdventurer(hatId)).toBeDefined();
        expect(canWearCosmetic(save, hatId)).toBe(true);
        const locked = CHARACTERS.find((c) => c.unlock && !c.only && wearsWardrobe(c))!;
        const piece = Object.values(locked.equipment).find(
            (objId) => objId !== undefined && getPieceAdventurer(objId) === locked.id,
        );
        if (piece !== undefined) {
            expect(canWearCosmetic(save, piece)).toBe(false);
        }
    });

    it("sells a piece for coins, once", () => {
        const save = createSave();
        const price = getCosmeticPrice(hat);
        save.coins = price - 1;
        expect(buyCosmetic(save, hat.objId)).toBe(false);
        save.coins = price + 10;
        expect(buyCosmetic(save, hat.objId)).toBe(true);
        expect(save.coins).toBe(10);
        expect(canWearCosmetic(save, hat.objId)).toBe(true);
        save.coins = price;
        expect(buyCosmetic(save, hat.objId)).toBe(false);
        expect(buyCosmetic(save, -5)).toBe(false);
    });
});

describe("a look", () => {
    it("keeps only kits, colours and pieces this game has", () => {
        const look = cleanLook({
            body: { bodyType: 1, kits: [9999, -1, "x"], colors: [3, 999, -1, 2.5, 4] },
            outfit: { [EquipSlot.HEAD]: hat.objId, [EquipSlot.CAPE]: hat.objId, 3: -1, 99: 1 },
            overGear: "yes",
        });
        const body = getDefaultBody(1);
        expect(look?.body?.bodyType).toBe(1);
        expect(look?.body?.kits).toEqual([body.kits[0], -1, ...body.kits.slice(2)]);
        expect(look?.body?.colors).toEqual([3, 0, 0, 0, 4]);
        // A hat isn't a cape, and the weapon slot isn't the Wardrobe's
        expect(look?.outfit).toEqual({ [EquipSlot.HEAD]: hat.objId });
        expect(look?.overGear).toBeUndefined();
        expect(cleanLook("nonsense")).toBeUndefined();
        expect(cleanLook({})).toBeUndefined();
    });

    it("offers every body part and colour a choice", () => {
        for (const bodyType of [0, 1] as const) {
            const body = getDefaultBody(bodyType);
            BODY_PARTS.forEach((_, part) => {
                expect(getBodyKits(bodyType, part)).toContain(body.kits[part]);
            });
        }
        for (const colour of BODY_COLOURS) {
            expect(colour.count).toBeGreaterThan(1);
        }
    });

    it("is saved with only the pieces the save can wear", () => {
        const save = createSave();
        save.coins = 100_000;
        buyCosmetic(save, hat.objId);
        save.look = {
            body: getDefaultBody(1),
            outfit: { [EquipSlot.HEAD]: hat.objId, [EquipSlot.CAPE]: cape.objId },
        };
        const loaded = migrateSave(JSON.parse(JSON.stringify(save)));
        expect(loaded.cosmetics).toEqual([hat.objId]);
        expect(loaded.look).toEqual({
            body: getDefaultBody(1),
            outfit: { [EquipSlot.HEAD]: hat.objId },
        });
        expect(migrateSave({ ...save, cosmetics: [hat.objId, 123456789] }).cosmetics).toEqual([
            hat.objId,
        ]);
    });

    it("dresses every adventurer but those who look like someone", () => {
        const look = cleanLook({
            body: { ...getDefaultBody(1), colors: [1, 2, 3, 4, 5] },
            outfit: { [EquipSlot.HEAD]: hat.objId, [EquipSlot.TORSO]: -1 },
        });
        const wizard = getCharacterAppearance("wizard", look);
        expect(wizard.female).toBe(true);
        expect(wizard.colors).toEqual([1, 2, 3, 4, 5]);
        expect(wizard.equipment[EquipSlot.HEAD]).toBe(hat.objId);
        expect(wizard.equipment[EquipSlot.TORSO]).toBe(-1);
        // The wizard's own legs and cape, where the outfit doesn't say
        expect(wizard.equipment[EquipSlot.LEGS]).toBe(getCharacter("wizard").equipment[7]);
        expect(getCharacterAppearance("wizard")).toEqual(getCharacterAppearance("wizard", {}));
        for (const character of CHARACTERS.filter((c) => !wearsWardrobe(c))) {
            expect(getCharacterAppearance(character.id, look)).toEqual(
                getCharacterAppearance(character.id),
            );
        }
    });

    it("goes to co-op's other players with the loadout", () => {
        const look = { outfit: { [EquipSlot.HEAD]: hat.objId } };
        expect(makeLoadout({}, [], {}, undefined, undefined, undefined, look).look).toEqual(look);
        expect(makeLoadout({}, [], {}).look).toBeUndefined();
    });
});
