import { describe, expect, test } from "vitest";

import { EquipSlot, createAppearance } from "../../rs/model/player/PlayerModelLoader";
import { POWER_UPS, getPowerUp } from "../content/powerups";
import { getWeapon } from "../content/weapons";
import { GameAssets, getPowerUpLookRequests } from "./GameAssets";
import { getGameSoundIds } from "./GameSounds";

describe("power-ups in the cache", () => {
    test("a look puts its item in hand, takes the shield off and leaves the rest", () => {
        const appearance = createAppearance({
            [EquipSlot.WEAPON]: 1277,
            [EquipSlot.SHIELD]: 1171,
            [EquipSlot.HEAD]: 1153,
        });
        const [request] = getPowerUpLookRequests(appearance);
        const { look } = getPowerUp("sled");
        expect(request).toMatchObject({
            kind: "player",
            key: "player:sled",
            seqIds: [look!.idleSeq, look!.moveSeq],
        });
        const worn = request.kind === "player" ? request.appearance.equipment : [];
        expect(worn[EquipSlot.WEAPON]).toBe(look!.objId);
        expect(worn[EquipSlot.SHIELD]).toBe(-1);
        expect(worn[EquipSlot.HEAD]).toBe(1153);
        // The player's own look is left as it was
        expect(appearance.equipment[EquipSlot.WEAPON]).toBe(1277);
    });

    test("what their effects draw is baked, so the slim cache gets it", () => {
        const keys = new Set(GameAssets.getBaseRequests().map((r) => r.key));
        for (const { id, effect, objId, locId } of POWER_UPS) {
            expect(keys).toContain(locId !== undefined ? "loc:" + locId : "obj:" + objId);
            if ("locId" in effect) {
                expect(keys).toContain("loc:" + effect.locId);
            }
            if ("spotAnim" in effect) {
                expect(keys).toContain("spot:" + effect.spotAnim);
            }
            if (effect.kind === "rampage") {
                expect(keys).toContain("rampage:" + id);
            }
        }
    });

    test("Toktz-mej-tal's fire is baked with its animation", () => {
        const { burns } = getWeapon("toktz_mej_tal");
        const request = GameAssets.getBaseRequests().find((r) => r.key === "loc:" + burns!.locId);
        expect(request).toEqual({
            kind: "loc",
            key: "loc:" + burns!.locId,
            locId: burns!.locId,
            animated: true,
        });
    });

    test("their sounds are all loaded", () => {
        const sounds = getGameSoundIds();
        for (const { sound, endSound, hitSound } of POWER_UPS) {
            for (const id of [sound, endSound, hitSound]) {
                if (id !== undefined && id !== -1) {
                    expect(sounds).toContain(id);
                }
            }
        }
    });
});
