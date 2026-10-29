import {
    endlessLevelForXp,
    endlessXpForLevel,
    levelForXp,
    runLevelForXp,
    runXpForLevel,
    xpForLevel,
} from "./xp";

describe("xp table", () => {
    test("matches the OSRS table", () => {
        expect(xpForLevel(1)).toBe(0);
        expect(xpForLevel(2)).toBe(83);
        expect(xpForLevel(10)).toBe(1154);
        expect(xpForLevel(50)).toBe(101333);
        expect(xpForLevel(99)).toBe(13034431);
    });

    test("levels for xp", () => {
        expect(levelForXp(0)).toBe(1);
        expect(levelForXp(82)).toBe(1);
        expect(levelForXp(83)).toBe(2);
        expect(levelForXp(13034431)).toBe(99);
    });
});

describe("run levels", () => {
    test("early levels are close to OSRS, later ones need more", () => {
        expect(runXpForLevel(2)).toBeLessThan(xpForLevel(2) * 1.05);
        expect(runXpForLevel(41)).toBe(Math.floor(xpForLevel(41) * 2));
    });

    test("run levels for xp invert the run table", () => {
        for (const level of [1, 2, 10, 25, 40]) {
            expect(runLevelForXp(runXpForLevel(level))).toBe(level);
            if (level > 1) {
                expect(runLevelForXp(runXpForLevel(level) - 1)).toBe(level - 1);
            }
        }
    });
});

describe("endless levels", () => {
    test("follow the run's table, then each level needs a little more than the last", () => {
        for (let level = 1; level <= 40; level++) {
            expect(endlessXpForLevel(level)).toBe(runXpForLevel(level));
        }
        const step = (level: number) => endlessXpForLevel(level + 1) - endlessXpForLevel(level);
        for (const level of [41, 60, 120, 300]) {
            expect(step(level) / step(level - 1)).toBeCloseTo(1.06, 2);
        }
        // Far cheaper than the run's table, which triples every ten levels
        expect(endlessXpForLevel(80)).toBeLessThan(runXpForLevel(80) / 4);
    });

    test("go on past the run's top level, counting from wherever the player is", () => {
        for (const level of [2, 39, 40, 41, 99, 126, 127, 400]) {
            const xp = endlessXpForLevel(level);
            expect(endlessLevelForXp(xp)).toBe(level);
            expect(endlessLevelForXp(xp + 1, 1)).toBe(level);
            expect(endlessLevelForXp(xp - 1, level + 5)).toBe(level - 1);
        }
    });
});
