import { compareStats } from "./stats";

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
});
