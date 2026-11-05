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

    it("still warns on expert, where Nylocas Vasilias keeps praying through her colours", () => {
        expect(getRaidBossShare(theatre, "ranged", true)).toBe(0.15);
        expect(getRaidBossShare(theatre, "magic", true)).toBe(0.15);
    });

    it("has nothing to warn of off a raid", () => {
        expect(getRaidBossShare(getMap("lumbridge"), "magic", false)).toBeUndefined();
    });
});
