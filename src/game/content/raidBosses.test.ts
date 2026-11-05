import { describe, expect, it } from "vitest";

import { getEnemy } from "./enemies";
import { getMap } from "./maps";
import { getBossPrayerStyles, getRaidBossShare, raidHasColours } from "./raidBosses";

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

describe("a boss's overhead prayer", () => {
    it("shows what a colour of Nylocas Vasilias holds back: the two styles that aren't hers", () => {
        const styles = (id: string) => [...getBossPrayerStyles(getEnemy(id))].sort();
        expect(styles("nylocas_vasilias")).toEqual(["magic", "ranged"]);
        expect(styles("nylocas_vasilias_ranged")).toEqual(["magic", "melee"]);
        expect(styles("nylocas_vasilias_magic")).toEqual(["melee", "ranged"]);
    });

    it("rests on her colour's own style getting through best, the other two least", () => {
        // What Sim.offColour and prayedAgainst make of a hit on a colour: its own style through
        // ownStyle, another through offStyle and then the prayer, which is less
        const vasilias = getEnemy("nylocas_vasilias_ranged");
        const colours = vasilias.boss!.colours!;
        const own = colours.ownStyle ?? 1;
        const other = colours.offStyle! * vasilias.protects!.damage;
        expect(own).toBeGreaterThan(colours.offStyle!);
        expect(own).toBeGreaterThan(other);
    });

    it("shows what any other boss prays against", () => {
        expect([...getBossPrayerStyles(getEnemy("maiden_of_sugadinti"))].sort()).toEqual([
            "magic",
            "ranged",
        ]);
    });
});

describe("the cards' warning on a raid with a coloured boss", () => {
    it("is for most of the Theatre's bosses, as Nylocas Vasilias takes her colour better", () => {
        expect(raidHasColours(getMap("theatre_of_blood"))).toBe(true);
        expect(raidHasColours(getMap("lumbridge"))).toBe(false);
    });
});
