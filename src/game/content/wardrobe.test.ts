import { describe, expect, it } from "vitest";

import { EquipSlot } from "../../rs/model/player/PlayerModelLoader";
import { getBareAppearance, getCharacterAppearance } from "../client/GameAssets";
import { makeLoadout } from "../client/coop/CoopLobby";
import { buyCosmetic, canWearCosmetic, createSave, migrateSave } from "../core/save";
import { CHARACTERS, getCharacter } from "./characters";
import { getTrophyMap } from "./collectionLog";
import { getMap } from "./maps";
import { PUMPKIN_MAPS } from "./trickOrTreat";
import { TROPHIES } from "./trophies";
import {
    BODY_COLOURS,
    BODY_PARTS,
    COSMETICS,
    COSMETIC_BY_ID,
    MAX_SAVED_OUTFITS,
    THIRD_AGE_PRICE,
    WARDROBE_SLOTS,
    cleanLook,
    cleanSavedOutfits,
    getBodyKits,
    getCosmeticPrice,
    getDefaultBody,
    getPieceAdventurer,
    getPieceTrophy,
    isWearingOutfit,
    saveOutfit,
    wearOutfit,
    wearsWardrobe,
} from "./wardrobe";

const hat = COSMETICS.find(
    (c) => c.slot === EquipSlot.HEAD && !getPieceAdventurer(c.objId) && !getPieceTrophy(c.objId),
)!;
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

    it("prices every 3rd Age piece at 250k, the dearest in the store", () => {
        const thirdAge = COSMETICS.filter((c) => /^3rd age/i.test(c.name));
        expect(thirdAge.length).toBeGreaterThan(10);
        for (const piece of thirdAge) {
            expect(getCosmeticPrice(piece)).toBe(THIRD_AGE_PRICE);
        }
        const others = COSMETICS.filter((c) => !thirdAge.includes(c));
        expect(Math.max(...others.map(getCosmeticPrice))).toBeLessThan(THIRD_AGE_PRICE);
    });
});

describe("found pieces", () => {
    const found = COSMETICS.filter((c) => getPieceTrophy(c.objId));
    const named = (re: RegExp) => COSMETICS.filter((c) => re.test(c.name));

    it("are the Halloween masks, raids' armour and Thanksgiving's hats", () => {
        const masks = named(/h'ween mask|halloween mask|^jack lantern mask$|^skeleton mask$/i);
        expect(masks).toHaveLength(6);
        expect(PUMPKIN_MAPS).toEqual(["halloween"]);
        for (const mask of masks) {
            expect(getPieceTrophy(mask.objId)?.objId).toBe(mask.objId);
            expect(getPieceTrophy(mask.objId)?.from.kind).toBe("pumpkin");
        }
        const raids = named(
            /^(justiciar |masori (mask|body|chaps)|elidinis' ward|avernic defender$|ghommal's avernic)/i,
        );
        expect(raids).toHaveLength(15);
        const hats = named(/^chompy bird hat$/i);
        expect(hats).toHaveLength(18);
        for (const piece of [...masks, ...raids, ...hats]) {
            expect(found).toContain(piece);
        }
        expect(getPieceTrophy(22322)?.id).toBe("avernic_defender_hilt");
        expect(getPieceTrophy(28620)?.id).toBe("turkey_hat");
    });

    it("come from a map's Collection log, and are no adventurer's own", () => {
        for (const piece of found) {
            const trophy = getPieceTrophy(piece.objId)!;
            expect(getMap(getTrophyMap(trophy)).id).toBe(getTrophyMap(trophy));
            expect(getPieceAdventurer(piece.objId)).toBeUndefined();
        }
    });

    it("are every trophy that's worn", () => {
        for (const trophy of TROPHIES) {
            if (COSMETIC_BY_ID.has(trophy.objId)) {
                expect(getPieceTrophy(trophy.objId)?.id).toBe(trophy.id);
            }
        }
    });

    it("can't be bought, and are worn once their trophy's found", () => {
        const save = createSave();
        save.coins = 1_000_000;
        for (const piece of found) {
            expect(buyCosmetic(save, piece.objId)).toBe(false);
            const trophy = getPieceTrophy(piece.objId)!.id;
            expect(canWearCosmetic(save, piece.objId)).toBe(save.trophies.includes(trophy));
            if (!save.trophies.includes(trophy)) {
                save.trophies.push(trophy);
            }
            expect(canWearCosmetic(save, piece.objId)).toBe(true);
        }
        expect(save.coins).toBe(1_000_000);
        expect(save.cosmetics).toBeUndefined();
    });

    it("stay on a loaded look only with their trophy", () => {
        const [red, blue] = named(/^(red|blue) halloween mask$/i);
        const save = createSave();
        save.trophies = [getPieceTrophy(red.objId)!.id];
        save.cosmetics = [red.objId, blue.objId];
        save.look = { outfit: { [EquipSlot.HEAD]: blue.objId } };
        const loaded = migrateSave(JSON.parse(JSON.stringify(save)));
        expect(loaded.cosmetics).toBeUndefined();
        expect(loaded.look?.outfit).toBeUndefined();
        save.look = { outfit: { [EquipSlot.HEAD]: red.objId } };
        expect(migrateSave(JSON.parse(JSON.stringify(save))).look?.outfit).toEqual({
            [EquipSlot.HEAD]: red.objId,
        });
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
        // A bare jaw (from before every face had one) puts the body's own back
        expect(look?.body?.kits).toEqual(body.kits);
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
                // Every part is worn, the jaw too: without one the face has a hole
                expect(getBodyKits(bodyType, part)).not.toContain(-1);
                expect(body.kits[part]).not.toBe(-1);
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

describe("saved outfits", () => {
    const look = {
        body: getDefaultBody(1),
        outfit: { [EquipSlot.HEAD]: hat.objId },
        overGear: true,
    };

    it("save what's worn under a name, over one of that name", () => {
        const one = saveOutfit([], "  Party  ", look)!;
        expect(one).toEqual([
            { name: "Party", outfit: { [EquipSlot.HEAD]: hat.objId }, overGear: true },
        ]);
        const two = saveOutfit(one, "Bare", {})!;
        expect(two.map((o) => o.name)).toEqual(["Party", "Bare"]);
        expect(two[1]).toEqual({ name: "Bare" });
        const replaced = saveOutfit(two, "Party", { outfit: { [EquipSlot.CAPE]: cape.objId } })!;
        expect(replaced[0]).toEqual({ name: "Party", outfit: { [EquipSlot.CAPE]: cape.objId } });
        expect(saveOutfit(two, "   ", look)).toBeUndefined();
        let full = one;
        for (let i = 1; i < MAX_SAVED_OUTFITS; i++) {
            full = saveOutfit(full, `Set ${i}`, look)!;
        }
        expect(saveOutfit(full, "One more", look)).toBeUndefined();
        expect(saveOutfit(full, "Party", {})).toHaveLength(MAX_SAVED_OUTFITS);
    });

    it("go on over the outfit, keeping the body", () => {
        const [saved] = saveOutfit([], "Cape", { outfit: { [EquipSlot.CAPE]: cape.objId } })!;
        const worn = wearOutfit(look, saved);
        expect(worn.body).toEqual(look.body);
        expect(worn.outfit).toEqual({ [EquipSlot.CAPE]: cape.objId });
        expect(worn.overGear).toBeUndefined();
        expect(isWearingOutfit(worn, saved)).toBe(true);
        expect(isWearingOutfit(look, saved)).toBe(false);
        expect(isWearingOutfit({ ...worn, overGear: true }, saved)).toBe(false);
    });

    it("are saved with only the pieces the save can wear, one of each name", () => {
        const save = createSave();
        save.coins = 100_000;
        buyCosmetic(save, hat.objId);
        save.outfits = [
            { name: "Hat", outfit: { [EquipSlot.HEAD]: hat.objId, [EquipSlot.CAPE]: cape.objId } },
            { name: "Hat", outfit: {} },
            { name: "" },
        ];
        expect(migrateSave(JSON.parse(JSON.stringify(save))).outfits).toEqual([
            { name: "Hat", outfit: { [EquipSlot.HEAD]: hat.objId } },
        ]);
        expect(cleanSavedOutfits("nonsense")).toEqual([]);
        expect(migrateSave({ ...save, outfits: undefined }).outfits).toBeUndefined();
    });
});

describe("the body alone", () => {
    it("has the body's kits and colours and nothing worn", () => {
        const body = getDefaultBody(1);
        body.colors[0] = 3;
        const appearance = getBareAppearance({ body, outfit: { [EquipSlot.HEAD]: hat.objId } });
        expect(appearance.female).toBe(true);
        expect(appearance.colors).toEqual(body.colors);
        expect(appearance.equipment.every((objId) => objId === -1)).toBe(true);
    });
});
