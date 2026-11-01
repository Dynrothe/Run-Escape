import { ARMOURY_COSTS } from "../content/armoury";
import { CHARACTERS } from "../content/characters";
import { getEnemy } from "../content/enemies";
import { CAMPAIGN_MAPS, MAPS, getMap } from "../content/maps";
import { QUESTS, QUEST_BY_ID, describeQuest } from "../content/quests";
import { LOCKABLE_ITEMS } from "../content/unlocks";
import { RUN_LENGTH } from "../content/waves";
import {
    RunSummary,
    buyArmouryUpgrade,
    buyUpgrade,
    createSave,
    exportSave,
    getArmouryStep,
    getEarnedUnlocks,
    getFinishedQuests,
    getMetaStats,
    getNextUpgradeCost,
    getQuestProgress,
    importSave,
    isEndlessRecord,
    isEndlessUnlocked,
    isMapUnlocked,
    mergeSaves,
    migrateSave,
    recordRun,
    refundUpgrades,
} from "./save";

function run(mapId: string, changes: Partial<RunSummary> = {}): RunSummary {
    return {
        mapId,
        victory: false,
        seconds: 300,
        level: 20,
        kills: 900,
        coins: 0,
        bossesKilled: [],
        ...changes,
    };
}

describe("save", () => {
    test("new saves have the free characters", () => {
        const save = createSave();
        expect(save.unlockedCharacters).toEqual(["warrior", "wizard", "ranger"]);
        expect(save.coins).toBe(0);
    });

    test("migrates partial and broken saves", () => {
        const save = migrateSave({
            coins: 120,
            upgrades: { strength: 9, unknown: 3 },
            unlockedCharacters: ["dwarf", "nobody"],
            runs: "lots",
        });
        expect(save.coins).toBe(120);
        expect(save.upgrades).toEqual({ strength: 5 });
        expect(save.unlockedCharacters).toContain("dwarf");
        expect(save.unlockedCharacters).not.toContain("nobody");
        expect(save.runs).toBe(0);
        expect(migrateSave(null)).toEqual(createSave());
        expect(migrateSave("garbage")).toEqual(createSave());
    });

    test("Crystal armour comes in with beating Prifddinas, on old saves too", () => {
        const pieces = ["crystal_helm", "crystal_body", "crystal_legs"];
        expect(createSave().unlockedItems).not.toEqual(expect.arrayContaining(pieces));
        const beaten = migrateSave({ ...createSave(), mapVictories: { prifddinas: 1 } });
        expect(beaten.unlockedItems).toEqual(expect.arrayContaining(pieces));
    });

    test("buying upgrades costs coins and raises later prices", () => {
        const save = createSave();
        save.coins = 10000;
        const first = getNextUpgradeCost(save, "strength")!;
        expect(buyUpgrade(save, "strength")).toBe(true);
        expect(save.coins).toBe(10000 - first);
        expect(getNextUpgradeCost(save, "strength")!).toBeGreaterThan(first);
        expect(getMetaStats(save).might).toBeCloseTo(0.05);
    });

    test("cannot buy past max rank or without coins", () => {
        const save = createSave();
        save.coins = 100;
        expect(buyUpgrade(save, "strength")).toBe(false);
        save.coins = 1e9;
        for (let i = 0; i < 5; i++) {
            expect(buyUpgrade(save, "strength")).toBe(true);
        }
        expect(buyUpgrade(save, "strength")).toBe(false);
        expect(getNextUpgradeCost(save, "strength")).toBeUndefined();
    });

    test("refunds give back everything spent", () => {
        const save = createSave();
        save.coins = 50000;
        buyUpgrade(save, "strength");
        buyUpgrade(save, "hitpoints");
        buyUpgrade(save, "strength");
        refundUpgrades(save);
        expect(save.coins).toBe(50000);
        expect(save.upgrades).toEqual({});
    });

    test("recording runs", () => {
        const save = createSave();
        recordRun(save, run("lumbridge", { coins: 3000 }));
        expect(save.coins).toBe(3000);
        expect(save.bestLevel).toBe(20);
        expect(save.runs).toBe(1);
        expect(save.unlockedCharacters).toEqual(["warrior", "wizard", "ranger"]);
    });

    test("beating a map unlocks the next", () => {
        const save = createSave();
        const won = (mapId: string) =>
            recordRun(save, run(mapId, { victory: true, seconds: 900, level: 40 }));
        expect(isMapUnlocked(save, CAMPAIGN_MAPS[0].id)).toBe(true);
        for (let i = 1; i < CAMPAIGN_MAPS.length; i++) {
            // Each opens when the one before it is beaten, and not before
            for (const later of CAMPAIGN_MAPS.slice(i)) {
                expect(isMapUnlocked(save, later.id)).toBe(false);
            }
            won(CAMPAIGN_MAPS[i - 1].id);
            expect(isMapUnlocked(save, CAMPAIGN_MAPS[i].id)).toBe(true);
        }
        expect(Object.keys(save.mapVictories)).toEqual(CAMPAIGN_MAPS.slice(0, -1).map((m) => m.id));
        expect(save.victories).toBe(CAMPAIGN_MAPS.length - 1);
        expect(isMapUnlocked(save, "nowhere")).toBe(false);
    });

    test("a seasonal map is open from the start and opens nothing", () => {
        const save = createSave();
        expect(isMapUnlocked(save, "halloween")).toBe(true);
        expect(MAPS[MAPS.length - 1].seasonal).toBe(true);
        recordRun(save, run("halloween", { victory: true, seconds: 900, level: 40 }));
        expect(save.mapVictories.halloween).toBe(1);
        expect(isMapUnlocked(save, CAMPAIGN_MAPS[1].id)).toBe(false);
    });

    test("wins from before maps count as Lumbridge wins", () => {
        expect(migrateSave({ version: 1, victories: 2 }).mapVictories).toEqual({ lumbridge: 2 });
        expect(migrateSave({ version: 1, victories: 0 }).mapVictories).toEqual({});
        const save = migrateSave({ victories: 3, mapVictories: { barrows: 1, nowhere: 4 } });
        expect(save.mapVictories).toEqual({ barrows: 1 });
    });

    test("beating a map brings in its adventurer", () => {
        const save = createSave();
        recordRun(save, run("lumbridge", { seconds: 900, bossesKilled: ["wise_old_man"] }));
        // Killing the final boss is what wins, but the run says so
        expect(save.unlockedCharacters).not.toContain("barbarian");
        recordRun(save, run("lumbridge", { victory: true, seconds: 900 }));
        expect(save.unlockedCharacters).toContain("barbarian");
        expect(save.unlockedCharacters).not.toContain("hunter");
        expect(save.unlockedCharacters).not.toContain("dragon_slayer");
    });

    test("tasks count on their own map, in one run", () => {
        const save = createSave();
        recordRun(save, run("barrows", { bossesKilled: ["count_draynor"] }));
        expect(save.unlockedCharacters).not.toContain("monk");
        recordRun(save, run("lumbridge", { bossesKilled: ["count_draynor"] }));
        expect(save.unlockedCharacters).toContain("monk");

        recordRun(save, run("barrows", { bossesKilled: ["torag", "karil", "guthan", "ahrim"] }));
        expect(save.unlockedCharacters).toContain("ancient_mage");

        // Two runs of five minutes aren't ten
        recordRun(save, run("wilderness", { seconds: 300 }));
        recordRun(save, run("wilderness", { seconds: 300 }));
        expect(save.unlockedCharacters).not.toContain("rogue");
        recordRun(save, run("lumbridge", { seconds: 600 }));
        expect(save.unlockedCharacters).not.toContain("rogue");
        recordRun(save, run("wilderness", { seconds: 600 }));
        expect(save.unlockedCharacters).toContain("rogue");
    });

    test("a run's task can be seen before it's recorded", () => {
        const save = createSave();
        const earned = getEarnedUnlocks(
            save,
            run("lumbridge", { bossesKilled: ["count_draynor"] }),
        );
        expect(earned.characters.map((c) => c.id)).toEqual(["monk"]);
        expect(save.unlockedCharacters).not.toContain("monk");
    });

    test("map tasks bring in items, which new saves don't have", () => {
        const save = createSave();
        expect(save.unlockedItems).toEqual([]);
        // Only on its own map
        recordRun(save, run("lumbridge", { bossesKilled: ["ket_zek"] }));
        expect(save.unlockedItems).toEqual([]);
        recordRun(save, run("karamja", { seconds: 460, bossesKilled: ["ket_zek"] }));
        expect([...save.unlockedItems].sort()).toEqual(["obsidian_armour", "toktz_xil_ul"]);
        // The Ancient spells take beating the Desert, not its bosses
        recordRun(save, run("desert", { seconds: 460, bossesKilled: ["fareed", "dessous"] }));
        expect(save.unlockedItems).not.toContain("smoke_burst");
        recordRun(save, run("desert", { victory: true, seconds: 900 }));
        expect(save.unlockedItems).toEqual(
            expect.arrayContaining([
                "osmumtens_fang",
                "smoke_burst",
                "shadow_burst",
                "blood_burst",
            ]),
        );
        expect(save.unlockedCharacters).toContain("nomad");
    });

    test("a run's item tasks can be seen before it's recorded", () => {
        const save = createSave();
        const earned = getEarnedUnlocks(save, run("karamja", { bossesKilled: ["ket_zek"] }));
        expect(earned.items.map((i) => i.id).sort()).toEqual(["obsidian_armour", "toktz_xil_ul"]);
        expect(save.unlockedItems).toEqual([]);
    });

    test("saves keep their items, and get the ones for maps already beaten", () => {
        const save = migrateSave({
            unlockedItems: ["smoke_burst", "nothing", "smoke_burst"],
            mapVictories: { desert: 1 },
        });
        expect([...save.unlockedItems].sort()).toEqual([
            "blood_burst",
            "osmumtens_fang",
            "shadow_burst",
            "smoke_burst",
        ]);
        expect(migrateSave({ version: 2 }).unlockedItems).toEqual([]);
        const old = migrateSave({ version: 2, mapVictories: { varlamore: 1 } });
        expect(old.unlockedItems).toEqual(
            expect.arrayContaining(["dizanas_quiver", "colossal_blade"]),
        );
    });

    test("saves with maps beaten get their adventurers", () => {
        const save = migrateSave({ unlockedCharacters: ["warrior"], mapVictories: { barrows: 1 } });
        expect(save.unlockedCharacters).toContain("hunter");
        expect(save.unlockedCharacters).not.toContain("barbarian");
        expect(migrateSave({ version: 1, victories: 1 }).unlockedCharacters).toContain("barbarian");
    });

    test("exported saves import as they were", () => {
        const save = createSave();
        recordRun(save, run("lumbridge", { victory: true, seconds: 900, coins: 10000 }));
        recordRun(save, run("karamja", { bossesKilled: ["ket_zek"] }));
        expect(buyUpgrade(save, "strength")).toBe(true);
        expect(importSave(exportSave(save))).toEqual(save);
        expect([...importSave(exportSave(save)).unlockedItems].sort()).toEqual([
            "obsidian_armour",
            "toktz_xil_ul",
        ]);
        // Older exports come in migrated
        expect(importSave(JSON.stringify({ version: 1, victories: 1 })).mapVictories).toEqual({
            lumbridge: 1,
        });
    });

    test("importing something that isn't a save throws", () => {
        expect(() => importSave("not json")).toThrow();
        expect(() => importSave("null")).toThrow();
        expect(() => importSave("[]")).toThrow();
        expect(() => importSave(JSON.stringify({ coins: 1e9 }))).toThrow();
    });

    test("every adventurer's and item's task can be done", () => {
        // The bosses that come to a map (on its schedule, or a fun map's at
        // random from its pool), and the forms they get back up as
        const bossesOn = (mapId: string) => {
            const map = getMap(mapId);
            const ids = [
                ...map.events
                    .filter((e) => e.kind === "boss" || e.kind === "finalBoss")
                    .map((e) => e.enemyId),
                ...(map.fun?.bosses.pool ?? []),
            ];
            for (const id of ids) {
                const into = getEnemy(id).boss?.rises?.into;
                if (into) {
                    ids.push(into);
                }
            }
            return ids;
        };
        const tasks = [
            ...CHARACTERS.flatMap((c) => c.unlock ?? []),
            ...LOCKABLE_ITEMS.map((i) => i.unlock),
        ];
        for (const task of tasks) {
            if (task.kind === "killBoss") {
                expect(bossesOn(task.mapId)).toContain(task.enemyId);
            } else if (task.kind === "survive") {
                expect(task.seconds).toBeLessThan(RUN_LENGTH);
            } else {
                expect(getMap(task.mapId)).toBeDefined();
            }
        }
    });
});

describe("endless", () => {
    test("opens on a map once it's been beaten", () => {
        const save = createSave();
        expect(isEndlessUnlocked(save, "lumbridge")).toBe(false);
        recordRun(save, run("lumbridge", { victory: true, seconds: 900 }));
        expect(isEndlessUnlocked(save, "lumbridge")).toBe(true);
        expect(isEndlessUnlocked(save, "barrows")).toBe(false);
    });

    test("keeps each map's furthest run: the later round, or as far for longer", () => {
        const save = createSave();
        const endless = (round: number, seconds: number) =>
            run("lumbridge", { endless: true, round, seconds });
        recordRun(save, endless(2, 1500));
        expect(save.endlessBest.lumbridge).toEqual({ round: 2, seconds: 1500 });
        // Longer but a round short isn't further
        expect(isEndlessRecord(save, endless(1, 2000))).toBe(false);
        recordRun(save, endless(1, 2000));
        expect(save.endlessBest.lumbridge).toEqual({ round: 2, seconds: 1500 });
        recordRun(save, endless(2, 1600));
        expect(save.endlessBest.lumbridge).toEqual({ round: 2, seconds: 1600 });
        recordRun(save, endless(4, 2600));
        expect(save.endlessBest.lumbridge).toEqual({ round: 4, seconds: 2600 });
        // A normal run is never an endless record, and never wins a map from endless
        recordRun(save, run("barrows", { seconds: 5000 }));
        expect(save.endlessBest.barrows).toBeUndefined();
        expect(save.mapVictories.lumbridge).toBeUndefined();
    });

    test("records survive a round trip and broken ones are dropped", () => {
        const save = createSave();
        recordRun(save, run("lumbridge", { endless: true, round: 3, seconds: 2100 }));
        expect(importSave(exportSave(save)).endlessBest).toEqual({
            lumbridge: { round: 3, seconds: 2100 },
        });
        const migrated = migrateSave({
            endlessBest: {
                lumbridge: { round: 2, seconds: 1300 },
                nowhere: { round: 9, seconds: 9000 },
                barrows: { round: "lots" },
                wilderness: null,
            },
        });
        expect(migrated.endlessBest).toEqual({ lumbridge: { round: 2, seconds: 1300 } });
        expect(migrateSave({}).endlessBest).toEqual({});
    });
});

describe("the Armoury", () => {
    test("upgrades gear that's been found, a step at a time", () => {
        const save = createSave();
        save.coins = 100000;
        // Not found yet
        expect(buyArmouryUpgrade(save, "amulet_of_strength")).toBe(false);
        recordRun(
            save,
            run("lumbridge", { gearFound: ["amulet_of_strength", "masori_mask_f", "shark", "x"] }),
        );
        // Only gear that comes out of caskets counts
        expect(save.foundGear).toEqual(["amulet_of_strength"]);
        expect(getArmouryStep(save, "amulet_of_strength")).toEqual({
            into: "amulet_of_power",
            cost: ARMOURY_COSTS.uncommon,
            locked: undefined,
        });
        expect(buyArmouryUpgrade(save, "amulet_of_strength")).toBe(true);
        expect(save.coins).toBe(100000 - ARMOURY_COSTS.uncommon);
        expect(save.armoury).toEqual({ amulet_of_strength: 1 });
        expect(getArmouryStep(save, "amulet_of_strength")?.into).toBe("amulet_of_torture");
        expect(buyArmouryUpgrade(save, "amulet_of_strength")).toBe(true);
        expect(buyArmouryUpgrade(save, "amulet_of_strength")).toBe(true);
        // Fully upgraded: an Amulet of torture (or)
        expect(getArmouryStep(save, "amulet_of_strength")).toBeUndefined();
        expect(buyArmouryUpgrade(save, "amulet_of_strength")).toBe(false);
        expect(save.armoury).toEqual({ amulet_of_strength: 3 });
        // Finding it again changes nothing
        recordRun(save, run("lumbridge", { gearFound: ["amulet_of_strength"] }));
        expect(save.foundGear).toEqual(["amulet_of_strength"]);
    });

    test("needs the coins", () => {
        const save = createSave();
        recordRun(save, run("lumbridge", { gearFound: ["coif"] }));
        save.coins = ARMOURY_COSTS.rare - 1;
        expect(buyArmouryUpgrade(save, "coif")).toBe(false);
        save.coins++;
        expect(buyArmouryUpgrade(save, "coif")).toBe(true);
        expect(save.coins).toBe(0);
    });

    test("an upgrade into a piece still locked waits for its task", () => {
        const save = createSave();
        save.coins = 100000;
        recordRun(save, run("lumbridge", { gearFound: ["antidragon_shield"] }));
        expect(getArmouryStep(save, "antidragon_shield")).toEqual({
            into: "dragonfire_shield",
            cost: ARMOURY_COSTS.veryRare,
            locked: { kind: "killBoss", mapId: "karamja", enemyId: "elvarg" },
        });
        expect(buyArmouryUpgrade(save, "antidragon_shield")).toBe(false);
        recordRun(save, run("karamja", { bossesKilled: ["elvarg"] }));
        expect(getArmouryStep(save, "antidragon_shield")?.locked).toBeUndefined();
        expect(buyArmouryUpgrade(save, "antidragon_shield")).toBe(true);
    });

    test("saves keep their gear and upgrades, and broken ones are dropped", () => {
        const save = createSave();
        save.coins = 100000;
        recordRun(save, run("lumbridge", { gearFound: ["coif", "rune_boots"] }));
        buyArmouryUpgrade(save, "coif");
        const imported = importSave(exportSave(save));
        expect(imported.foundGear).toEqual(["coif", "rune_boots"]);
        expect(imported.armoury).toEqual({ coif: 1 });
        const migrated = migrateSave({
            foundGear: ["coif", "coif", "masori_mask_f", "shark", 5],
            armoury: { coif: 9, masori_mask_f: 1, nobody: 2, rune_boots: -1, amulet_of_avarice: 1 },
        });
        expect(migrated.foundGear).toEqual(["coif"]);
        // The Coif's line is two upgrades long
        expect(migrated.armoury).toEqual({ coif: 2 });
        expect(migrateSave({ version: 4, coins: 5 }).foundGear).toEqual([]);
    });

    test("mergeSaves merges local and remote progress safely", () => {
        const local = createSave();
        local.coins = 500;
        local.totalCoins = 2000;
        local.unlockedCharacters = ["warrior", "wizard", "ranger", "monk"];
        local.unlockedItems = ["smoke_burst"];
        local.foundGear = ["coif"];
        local.armoury = { coif: 1 };
        local.upgrades = { strength: 2 };
        local.upgradesSpent = 1000;
        local.endlessBest = { lumbridge: { round: 2, seconds: 1200 } };
        local.mapVictories = { lumbridge: 1 };
        local.victories = 1;
        local.runs = 5;

        const remote = createSave();
        remote.coins = 1200;
        remote.totalCoins = 4000;
        remote.unlockedCharacters = ["warrior", "wizard", "ranger", "rogue"];
        remote.unlockedItems = ["blood_burst"];
        remote.foundGear = ["rune_boots"];
        remote.armoury = { rune_boots: 1 };
        remote.upgrades = { strength: 3, hitpoints: 1 };
        remote.upgradesSpent = 2500;
        remote.endlessBest = { lumbridge: { round: 3, seconds: 1800 }, barrows: { round: 1, seconds: 600 } };
        remote.mapVictories = { lumbridge: 2, barrows: 1 };
        remote.victories = 3;
        remote.runs = 8;

        const merged = mergeSaves(local, remote);
        expect(merged.unlockedCharacters).toEqual(
            expect.arrayContaining(["warrior", "wizard", "ranger", "monk", "rogue"]),
        );
        expect(merged.unlockedItems).toEqual(
            expect.arrayContaining(["smoke_burst", "blood_burst"]),
        );
        expect(merged.foundGear).toEqual(
            expect.arrayContaining(["coif", "rune_boots"]),
        );
        expect(merged.armoury).toEqual({ coif: 1, rune_boots: 1 });
        expect(merged.upgrades).toEqual({ strength: 3, hitpoints: 1 });
        expect(merged.endlessBest.lumbridge).toEqual({ round: 3, seconds: 1800 });
        expect(merged.endlessBest.barrows).toEqual({ round: 1, seconds: 600 });
        expect(merged.mapVictories).toEqual({ lumbridge: 2, barrows: 1 });
        expect(merged.victories).toBe(3);
        expect(merged.runs).toBe(8);
        expect(merged.coins).toBeGreaterThanOrEqual(1200);
    });
});

describe("evolutions made", () => {
    test("runs add to them once each, and they survive a save", () => {
        const save = createSave();
        const run = {
            mapId: "lumbridge",
            victory: false,
            seconds: 60,
            level: 2,
            kills: 1,
            coins: 0,
            bossesKilled: [],
            evolutionsMade: ["abyssal_whip"],
        };
        recordRun(save, run);
        recordRun(save, run);
        expect(save.evolutionsMade).toEqual(["abyssal_whip"]);
        expect(migrateSave(JSON.parse(JSON.stringify(save))).evolutionsMade).toEqual([
            "abyssal_whip",
        ]);
    });

    test("older saves start with none, and unknown ids are dropped", () => {
        const { evolutionsMade: _, ...old } = createSave();
        expect(migrateSave({ ...old, version: 6 }).evolutionsMade).toEqual([]);
        expect(
            migrateSave({ ...old, evolutionsMade: ["abyssal_whip", "no_such_weapon"] })
                .evolutionsMade,
        ).toEqual(["abyssal_whip"]);
    });
});

describe("quests", () => {
    test("count kills over runs, and pay out once when finished", () => {
        const save = createSave();
        const quest = QUEST_BY_ID.get("goblin_diplomacy")!;
        const { count } = quest.objective as { count: number };
        expect(
            recordRun(save, run("lumbridge", { coins: 10, enemyKills: { goblin: count - 1 } })),
        ).toEqual([]);
        expect(getQuestProgress(save, quest)).toEqual({ done: count - 1, of: count });
        expect(save.coins).toBe(10);
        // Seen before the run that finishes it is recorded (mid-run)
        const finishing = run("lumbridge", { enemyKills: { goblin: 5 } });
        expect(getFinishedQuests(save, finishing)).toEqual([quest]);
        expect(recordRun(save, finishing)).toEqual([quest]);
        expect(save.questsDone).toEqual([quest.id]);
        expect(save.coins).toBe(10 + quest.coins);
        expect(save.totalCoins).toBe(10 + quest.coins);
        expect(getQuestProgress(save, quest)).toEqual({ done: count, of: count });
        // Never twice
        expect(recordRun(save, run("lumbridge", { enemyKills: { goblin: count } }))).toEqual([]);
        expect(save.coins).toBe(10 + quest.coins);
    });

    test("kills of any of a quest's enemies count, wherever they are", () => {
        const save = createSave();
        const quest = QUEST_BY_ID.get("ratcatchers")!;
        const { count } = quest.objective as { count: number };
        recordRun(save, run("lumbridge", { enemyKills: { rat: count / 2, goblin: 50 } }));
        recordRun(save, run("barrows", { enemyKills: { crypt_rat: count / 2 - 1 } }));
        expect(getQuestProgress(save, quest)).toEqual({ done: count - 1, of: count });
        expect(recordRun(save, run("barrows", { enemyKills: { giant_crypt_rat: 1 } }))).toEqual([
            quest,
        ]);
    });

    test("some need each of their bosses killed", () => {
        const save = createSave();
        const quest = QUEST_BY_ID.get("desert_treasure")!;
        recordRun(save, run("desert", { enemyKills: { fareed: 1, dessous: 1 } }));
        // Damis's first form doesn't count; he rises again
        recordRun(save, run("desert", { enemyKills: { fareed: 1, damis: 1 } }));
        expect(getQuestProgress(save, quest)).toEqual({ done: 2, of: 3 });
        expect(recordRun(save, run("desert", { enemyKills: { damis_risen: 1 } }))).toEqual([quest]);
    });

    test("nothing on the fun maps counts towards quests", () => {
        const save = createSave();
        const quest = QUEST_BY_ID.get("ratcatchers")!;
        const { count } = quest.objective as { count: number };
        const fun = run("grand_exchange", { enemyKills: { rat: count }, caskets: 50 });
        expect(getQuestProgress(save, quest, fun)).toEqual({ done: 0, of: count });
        expect(getFinishedQuests(save, fun)).toEqual([]);
        expect(recordRun(save, fun)).toEqual([]);
        expect(save.enemyKills).toEqual({});
        expect(save.casketsOpened).toBe(0);
    });

    test("some need their map beaten, not just played", () => {
        const save = createSave();
        const quest = QUEST_BY_ID.get("the_inferno")!;
        expect(describeQuest(quest.objective)).toBe("Beat The Inferno");
        expect(recordRun(save, run("inferno", { seconds: 600 }))).toEqual([]);
        expect(getQuestProgress(save, quest)).toEqual({ done: 0, of: 1 });
        expect(recordRun(save, run("inferno", { victory: true }))).toEqual([quest]);
    });

    test("caskets opened count", () => {
        const save = createSave();
        const quest = QUEST_BY_ID.get("pirates_treasure")!;
        const { count } = quest.objective as { count: number };
        recordRun(save, run("lumbridge", { caskets: count - 2 }));
        expect(getQuestProgress(save, quest)).toEqual({ done: count - 2, of: count });
        expect(recordRun(save, run("barrows", { caskets: 2 }))).toEqual([quest]);
    });

    test("every quest can be done, and says what it wants", () => {
        expect(new Set(QUESTS.map((q) => q.id)).size).toBe(QUESTS.length);
        for (const quest of QUESTS) {
            expect(quest.coins).toBeGreaterThan(0);
            if (quest.mapId) {
                getMap(quest.mapId);
            }
            const objective = quest.objective;
            if (objective.kind === "beatMap") {
                getMap(objective.mapId);
            } else if (objective.kind !== "caskets") {
                for (const id of objective.enemyIds) {
                    getEnemy(id);
                }
                // More than one needs a name for them ("chickens")
                if (objective.kind === "kill" && objective.count > 1) {
                    expect(objective.what).toBeDefined();
                }
            }
            expect(describeQuest(objective)).not.toMatch(/undefined/);
        }
        expect(describeQuest(QUEST_BY_ID.get("vampyre_slayer")!.objective)).toBe(
            "Kill Count Draynor",
        );
        expect(describeQuest(QUEST_BY_ID.get("desert_treasure")!.objective)).toBe(
            "Kill Fareed, Dessous and Damis",
        );
    });

    test("saves keep their tallies and quests, and broken ones are dropped", () => {
        const save = createSave();
        recordRun(
            save,
            run("lumbridge", { enemyKills: { count_draynor: 1, goblin: 7 }, caskets: 3 }),
        );
        const imported = importSave(exportSave(save));
        expect(imported.enemyKills).toEqual({ count_draynor: 1, goblin: 7 });
        expect(imported.casketsOpened).toBe(3);
        expect(imported.questsDone).toEqual(["vampyre_slayer"]);
        const migrated = migrateSave({
            enemyKills: { goblin: 4.5, nobody: 3, rat: -2, imp: "lots" },
            casketsOpened: -4,
            questsDone: ["imp_catcher", "imp_catcher", "nothing", 3],
        });
        expect(migrated.enemyKills).toEqual({ goblin: 4 });
        expect(migrated.casketsOpened).toBe(0);
        expect(migrated.questsDone).toEqual(["imp_catcher"]);
        expect(migrateSave({ version: 5, coins: 5 }).questsDone).toEqual([]);
    });
});
