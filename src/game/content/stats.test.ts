import { overrideMessages } from "../i18n/catalog";
import { compareStats, statChanges } from "./stats";

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

    it("goes by the values as shown, so stats that show the same don't change", () => {
        expect(statChanges({ might: 0.05, armor: 1.04 }, { might: 0.0498, armor: 1.26 })).toEqual([
            { key: "armor", text: "+0.3 armour", better: true },
        ]);
    });

    it("gives each stat a found piece changes against a worn one, as a stat line", () => {
        expect(
            statChanges(
                { might: 0.03, speed: 0.15, armor: 1 },
                { might: 0.05, maxHp: 0.13, armor: 1 },
            ),
        ).toEqual([
            { key: "might", text: "+2% damage", better: true },
            { key: "maxHp", text: "+13% max hitpoints", better: true },
            { key: "speed", text: "-15% projectile speed", better: false },
        ]);
    });

    it("words a change the way the language words a stat line", () => {
        const restore = overrideMessages({
            en: { "statline.percent": "{label} {sign}{value}%" },
        });
        try {
            expect(statChanges({ might: 0.08 }, { might: 0.05 })).toEqual([
                { key: "might", text: "damage -3%", better: false },
            ]);
        } finally {
            restore();
        }
    });

    it("finds nothing to change between pieces that read the same", () => {
        expect(statChanges({ might: 0.1, armor: 2 }, { might: 0.1, armor: 2 })).toEqual([]);
    });
});
