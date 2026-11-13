import { compareStats, pairStats } from "./stats";

describe("stats", () => {
    it("compares a piece's stats before and after an upgrade", () => {
        expect(
            compareStats({ might: 0.1, armor: 4 }, { might: 0.15, armor: 4, luck: 0.05 }),
        ).toEqual([
            { key: "might", label: "Damage", from: "+10%", to: "+15%", better: true },
            { key: "armor", label: "Armour", to: "+4", better: true },
            { key: "luck", label: "Luck", from: "+0%", to: "+5%", better: true },
        ]);
    });

    it("marks a stat that goes down", () => {
        expect(compareStats({ moveSpeed: 0.05 }, { moveSpeed: -0.05 })).toEqual([
            { key: "moveSpeed", label: "Movement speed", from: "+5%", to: "-5%", better: false },
        ]);
    });

    it("leaves out what a stat was when it shows the same", () => {
        expect(compareStats({ might: 0.0498, armor: 1 }, { might: 0.05, armor: 1.26 })).toEqual([
            { key: "might", label: "Damage", to: "+5%", better: true },
            { key: "armor", label: "Armour", from: "+1", to: "+1.3", better: true },
        ]);
    });

    it("goes by the values as shown, so pieces that show the same don't differ", () => {
        expect(pairStats({ might: 0.05, armor: 1.04 }, { might: 0.0498, armor: 1.26 })).toEqual([
            { key: "might", label: "Damage", worn: "+5%", found: "+5%", better: true },
            {
                key: "armor",
                label: "Armour",
                worn: "+1",
                found: "+1.3",
                change: "+0.3",
                better: true,
            },
        ]);
    });

    it("pairs a worn piece's stats with a found one's, each that either has", () => {
        expect(
            pairStats(
                { might: 0.03, speed: 0.15, armor: 1 },
                { might: 0.05, maxHp: 0.13, armor: 1 },
            ),
        ).toEqual([
            {
                key: "might",
                label: "Damage",
                worn: "+3%",
                found: "+5%",
                change: "+2%",
                better: true,
            },
            { key: "armor", label: "Armour", worn: "+1", found: "+1", better: true },
            { key: "maxHp", label: "Max hitpoints", found: "+13%", change: "+13%", better: true },
            {
                key: "speed",
                label: "Projectile speed",
                worn: "+15%",
                change: "-15%",
                better: false,
            },
        ]);
    });
});
