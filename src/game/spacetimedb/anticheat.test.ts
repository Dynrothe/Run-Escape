import { describe, expect, test } from "vitest";

import { RunResult } from "../core/Sim";
import { createSave } from "../core/save";
import { fromPlayerSave, toSavePayload } from "./SpacetimeSync";
import { computeStandardScore, validateDisplayName, verifyRunResult } from "./anticheat";
import { PlayerSave } from "./bindings/types";

function mockRun(changes: Partial<RunResult> = {}): RunResult {
    const seconds = changes.seconds ?? 905;
    const ticks = changes.ticks ?? seconds * 50;
    return {
        mapId: "lumbridge",
        characterId: "warrior",
        seed: 12345,
        endless: false,
        round: 1,
        victory: true,
        seconds,
        ticks,
        level: 30,
        xp: 15000,
        kills: 800,
        coins: 1200,
        casketsOpened: 8,
        bossesKilled: ["count_draynor", "wise_old_man"],
        bossKillTicks: [24000, 45100],
        gearFound: ["coif"],
        ...changes,
    };
}

describe("anticheat", () => {
    describe("validateDisplayName", () => {
        test("accepts valid OSRS-style names", () => {
            expect(validateDisplayName("Zezima").valid).toBe(true);
            expect(validateDisplayName("Old_School").valid).toBe(true);
            expect(validateDisplayName("Pk-Master 99").valid).toBe(true);
            expect(validateDisplayName("A").valid).toBe(true);
            expect(validateDisplayName("123456789012").valid).toBe(true);
        });

        test("rejects invalid display names", () => {
            expect(validateDisplayName("").valid).toBe(false);
            expect(validateDisplayName("   ").valid).toBe(false);
            expect(validateDisplayName("Toolongforosrsname").valid).toBe(false);
            expect(validateDisplayName("Double  Space").valid).toBe(false);
            expect(validateDisplayName("Bad$Symbol!").valid).toBe(false);
        });
    });

    describe("verifyRunResult", () => {
        test("approves legitimate standard runs", () => {
            const run = mockRun();
            const res = verifyRunResult(run);
            expect(res.valid).toBe(true);
        });

        test("rejects unknown map", () => {
            const run = mockRun({ mapId: "nonexistent_dungeon" });
            const res = verifyRunResult(run);
            expect(res.valid).toBe(false);
            expect(res.reason).toContain("Unknown map");
        });

        test("rejects unknown character", () => {
            const run = mockRun({ characterId: "superman" });
            const res = verifyRunResult(run);
            expect(res.valid).toBe(false);
            expect(res.reason).toContain("Unknown adventurer");
        });

        test("rejects duration/tick rate discrepancies", () => {
            const run = mockRun({ seconds: 900, ticks: 1000 }); // 1000 ticks = 20s
            const res = verifyRunResult(run);
            expect(res.valid).toBe(false);
            expect(res.reason).toContain("does not match elapsed seconds");
        });

        test("rejects excessive kills per second", () => {
            const run = mockRun({
                victory: false,
                seconds: 100,
                ticks: 5000,
                kills: 10000,
                bossesKilled: [],
                bossKillTicks: [],
            });
            const res = verifyRunResult(run);
            expect(res.valid).toBe(false);
            expect(res.reason).toContain("exceeds plausible spawn limit");
        });

        test("rejects excessive coins per second", () => {
            const run = mockRun({
                victory: false,
                seconds: 100,
                ticks: 5000,
                kills: 50,
                casketsOpened: 0,
                coins: 50000,
                level: 5,
                xp: 1500,
                bossesKilled: [],
                bossKillTicks: [],
            });
            const res = verifyRunResult(run);
            expect(res.valid).toBe(false);
            expect(res.reason).toContain("exceeds plausible maximum");
        });

        test("rejects standard run exceeding length", () => {
            const run = mockRun({
                victory: false,
                endless: false,
                seconds: 1200,
                ticks: 60000,
                bossesKilled: [],
                bossKillTicks: [],
            });
            const res = verifyRunResult(run);
            expect(res.valid).toBe(false);
            expect(res.reason).toContain("Non-endless run exceeds standard duration");
        });

        test("rejects boss kill before earliest spawn tick", () => {
            // Count Draynor spawns at 450s (22,500 ticks) in Lumbridge
            const run = mockRun({
                victory: false,
                bossesKilled: ["count_draynor"],
                bossKillTicks: [2000], // 40s into the run
            });
            const res = verifyRunResult(run);
            expect(res.valid).toBe(false);
            expect(res.reason).toContain("before its earliest spawn");
        });

        test("computes standard score correctly", () => {
            const run = mockRun({ victory: true, seconds: 905, kills: 1000, coins: 500, level: 30 });
            const score = computeStandardScore(run);
            expect(score).toBeGreaterThan(100000); // 100,000 base for victory
        });
    });

    describe("Save payload conversions", () => {
        test("round-trips SaveData to SavePayload and back", () => {
            const save = createSave();
            save.coins = 2500;
            save.totalCoins = 8000;
            save.unlockedCharacters = ["warrior", "wizard", "ranger", "monk", "barbarian"];
            save.unlockedItems = ["smoke_burst"];
            save.upgrades = { strength: 3, hitpoints: 1 };
            save.upgradesSpent = 3500;
            save.mapVictories = { lumbridge: 2 };
            save.victories = 2;
            save.runs = 10;
            save.endlessBest = { lumbridge: { round: 3, seconds: 1950 } };
            save.foundGear = ["coif", "rune_boots"];
            save.armoury = { coif: 1 };

            const payload = toSavePayload(save);
            const row: PlayerSave = {
                identity: {
                    toHexString: () => "010203",
                    isEqual: () => true,
                } as unknown as PlayerSave["identity"],
                displayName: "Adventurer",
                coins: payload.coins,
                totalCoins: payload.totalCoins,
                upgrades: payload.upgrades,
                upgradesSpent: payload.upgradesSpent,
                unlockedCharacters: payload.unlockedCharacters,
                unlockedItems: payload.unlockedItems,
                runs: payload.runs,
                victories: payload.victories,
                mapVictories: payload.mapVictories,
                totalKills: payload.totalKills,
                bestSeconds: payload.bestSeconds,
                bestLevel: payload.bestLevel,
                endlessBest: payload.endlessBest,
                foundGear: payload.foundGear,
                armoury: payload.armoury,
                createdAt: BigInt(Date.now() * 1000),
                updatedAt: BigInt(Date.now() * 1000),
            };

            const restored = fromPlayerSave(row);
            expect(restored.coins).toBe(save.coins);
            expect(restored.totalCoins).toBe(save.totalCoins);
            expect(restored.upgrades).toEqual(save.upgrades);
            expect(restored.unlockedCharacters).toEqual(save.unlockedCharacters);
            expect(restored.unlockedItems).toEqual(save.unlockedItems);
            expect(restored.endlessBest).toEqual(save.endlessBest);
            expect(restored.mapVictories).toEqual(save.mapVictories);
            expect(restored.foundGear).toEqual(save.foundGear);
            expect(restored.armoury).toEqual(save.armoury);
        });
    });
});
