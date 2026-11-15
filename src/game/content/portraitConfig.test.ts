import { describe, expect, it } from "vitest";

import { cleanPortrait, compactPortrait, fullPortrait, portraitRequest } from "./portraitConfig";
import saved from "./portraits.json";

const goblin = { npcId: 3029 };

describe("portrait framing", () => {
    it("keeps only what differs from the game's own fit", () => {
        const full = { ...fullPortrait(goblin), zoom: 1.25, offsetY: 3.5 };
        expect(compactPortrait(goblin, full)).toEqual({ zoom: 1.25, offsetY: 3.5 });
        expect(compactPortrait(goblin, fullPortrait(goblin))).toEqual({});
    });

    it("only poses a body or a model, never the chathead", () => {
        const head = { ...fullPortrait(goblin), seqId: 6182, tick: 10 };
        expect(compactPortrait(goblin, head)).toEqual({});
        const body = { ...head, model: "body" as const };
        expect(compactPortrait(goblin, body)).toEqual({ model: "body", seqId: 6182, tick: 10 });
    });

    it("keeps a mirror apart from the camera", () => {
        const full = { ...fullPortrait(goblin), mirror: true, yaw: 210 };
        expect(compactPortrait(goblin, full)).toEqual({ mirror: true, yaw: 210 });
        expect(cleanPortrait({ mirror: true })).toEqual({ mirror: true });
        expect(cleanPortrait({ mirror: "yes" })).toBeUndefined();
        expect(fullPortrait(goblin).mirror).toBe(false);
    });

    it("draws the enemy's own NPC unless the portrait names another", () => {
        expect(portraitRequest(goblin)).toEqual({ npcId: 3029 });
        expect(portraitRequest(goblin, {})).toEqual({ npcId: 3029 });
        expect(portraitRequest(goblin, { npcId: 3030, zoom: 2 })).toEqual({
            npcId: 3030,
            portrait: { zoom: 2 },
        });
    });

    it("refuses what isn't a portrait", () => {
        expect(cleanPortrait({ zoom: 0 })).toBeUndefined();
        expect(cleanPortrait({ model: "legs" })).toBeUndefined();
        expect(cleanPortrait({ offsetX: "3" })).toBeUndefined();
        expect(cleanPortrait([])).toBeUndefined();
        expect(cleanPortrait({ yaw: 64, extra: true })).toEqual({ yaw: 64 });
    });

    it("has a valid portrait for every saved monster", () => {
        for (const [enemyId, portrait] of Object.entries(saved as Record<string, unknown>)) {
            expect(cleanPortrait(portrait), enemyId).toBeDefined();
        }
    });
});
