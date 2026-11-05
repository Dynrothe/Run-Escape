import { describe, expect, it } from "vitest";

import { getMap } from "./maps";
import { getRaidBossShare } from "./raidBosses";

describe("a raid's bosses' prayers, for weapon cards", () => {
    const theatre = getMap("theatre_of_blood");

    it("has every Theatre boss take a share of ranged and magic, and all of melee", () => {
        expect(getRaidBossShare(theatre, "ranged", false)).toBe(0.15);
        expect(getRaidBossShare(theatre, "magic", false)).toBe(0.15);
        expect(getRaidBossShare(theatre, "melee", false)).toBeUndefined();
    });

    it("has nothing to warn of on expert, where the Nylocas take their own colour in full", () => {
        expect(getRaidBossShare(theatre, "ranged", true)).toBeUndefined();
    });

    it("has nothing to warn of off a raid", () => {
        expect(getRaidBossShare(getMap("lumbridge"), "magic", false)).toBeUndefined();
    });
});
