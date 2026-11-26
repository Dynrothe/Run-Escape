import { describe, expect, it } from "vitest";

import { ALL_MAPS } from "../content/maps";
import {
    DAILY_COUNT,
    DAILY_POOL,
    WEEKLY_COUNT,
    WEEKLY_POOL,
    describePeriodic,
    getPeriodQuests,
    periodEnd,
    periodKey,
} from "../content/periodicQuests";
import { PeriodicRun, getPeriodViews, migratePeriodRecord, recordPeriodic } from "./periodicQuests";
import { createSave, migrateSave } from "./save";

const DAY = 24 * 60 * 60 * 1000;
// Monday 2026-11-23 10:00 UTC, in ISO week 48
const MONDAY = Date.UTC(2026, 10, 23, 10);

function run(over: Partial<PeriodicRun> = {}): PeriodicRun {
    return {
        mapId: "lumbridge",
        victory: false,
        seconds: 300,
        level: 8,
        kills: 100,
        bossesKilled: [],
        caskets: 0,
        beatsMap: false,
        ...over,
    };
}

// A save with the given day's or week's quests all about to be finished by one run
function questOf(kind: "daily" | "weekly", time: number, goal: string) {
    return getPeriodQuests(kind, time).find((q) => q.goal === goal);
}

describe("picking the quests", () => {
    it("gives three a day and two a week, each of a different goal", () => {
        for (let d = 0; d < 60; d++) {
            const daily = getPeriodQuests("daily", MONDAY + d * DAY);
            const weekly = getPeriodQuests("weekly", MONDAY + d * 7 * DAY);
            expect(daily).toHaveLength(DAILY_COUNT);
            expect(weekly).toHaveLength(WEEKLY_COUNT);
            expect(new Set(daily.map((q) => q.goal)).size).toBe(DAILY_COUNT);
            expect(new Set(weekly.map((q) => q.goal)).size).toBe(WEEKLY_COUNT);
        }
    });

    it("is the same all day and all week, and changes between them", () => {
        const ids = (kind: "daily" | "weekly", time: number) =>
            getPeriodQuests(kind, time).map((q) => q.id);
        expect(ids("daily", MONDAY)).toEqual(ids("daily", MONDAY + 13 * 60 * 60 * 1000));
        // Sunday night is still the week of Monday
        expect(ids("weekly", MONDAY)).toEqual(ids("weekly", MONDAY + 6 * DAY + 13 * 3600e3));
        const days = new Set<string>();
        const weeks = new Set<string>();
        for (let i = 0; i < 30; i++) {
            days.add(ids("daily", MONDAY + i * DAY).join());
            weeks.add(ids("weekly", MONDAY + i * 7 * DAY).join());
        }
        expect(days.size).toBeGreaterThan(5);
        expect(weeks.size).toBeGreaterThan(3);
    });

    it("turns at midnight UTC, and the week on Monday", () => {
        expect(periodKey("daily", MONDAY)).toBe("2026-11-23");
        expect(periodEnd("daily", MONDAY)).toBe(Date.UTC(2026, 10, 24));
        expect(periodKey("weekly", MONDAY)).toBe("2026-W48");
        expect(periodEnd("weekly", MONDAY)).toBe(Date.UTC(2026, 10, 30));
        expect(periodKey("weekly", periodEnd("weekly", MONDAY) - 1)).toBe("2026-W48");
        expect(periodKey("weekly", periodEnd("weekly", MONDAY))).toBe("2026-W49");
    });

    it("keeps the week's harder than the day's", () => {
        const cheapestWeek = Math.min(...WEEKLY_POOL.map((q) => q.coins));
        const dearestDay = Math.max(...DAILY_POOL.map((q) => q.coins));
        expect(cheapestWeek).toBeGreaterThan(dearestDay);
        const bosses = WEEKLY_POOL.find((q) => q.goal === "bosses");
        expect(bosses?.count).toBeGreaterThanOrEqual(3);
    });

    it("describes each goal in words", () => {
        for (const quest of [...DAILY_POOL, ...WEEKLY_POOL]) {
            expect(describePeriodic(quest)).not.toMatch(/quest\.|undefined|NaN|\{/);
        }
    });
});

describe("recording runs", () => {
    it("adds up a run's numbers on the day and week, and pays a quest once it's done", () => {
        const save = createSave();
        // Find a day with a kills quest, and play it out over two runs
        let time = MONDAY;
        while (!questOf("daily", time, "kills")) {
            time += DAY;
        }
        const kills = questOf("daily", time, "kills")!;
        const first = recordPeriodic(save, run({ kills: kills.count - 1 }), time);
        expect(first.filter((f) => f.quest.id === kills.id)).toEqual([]);
        const before = save.coins;
        const second = recordPeriodic(save, run({ kills: 5 }), time);
        const paid = second.find((f) => f.quest.id === kills.id);
        expect(paid?.kind).toBe("daily");
        expect(save.coins - before).toBeGreaterThanOrEqual(kills.coins);
        expect(save.totalCoins).toBe(save.coins);
        // Done is done: another run pays it no more
        const coins = save.coins;
        const third = recordPeriodic(save, run({ kills: 999 }), time);
        expect(third.find((f) => f.quest.id === kills.id)).toBeUndefined();
        expect(save.coins - coins).toBe(third.reduce((sum, f) => sum + f.quest.coins, 0));
    });

    it("counts a boss kill for each boss killed, and a weekly needs all three", () => {
        const save = createSave();
        let time = MONDAY;
        while (!questOf("weekly", time, "bosses")) {
            time += 7 * DAY;
        }
        const bosses = questOf("weekly", time, "bosses")!;
        expect(bosses.count).toBeGreaterThanOrEqual(3);
        recordPeriodic(save, run({ bossesKilled: ["a", "b"] }), time);
        expect(getPeriodViews(save, "weekly", time).find((v) => v.quest.id === bosses.id)).toEqual(
            expect.objectContaining({ done: false, progress: 2 }),
        );
        // A day later in the same week, it carries on
        const done = recordPeriodic(
            save,
            run({ bossesKilled: Array(bosses.count).fill("a") }),
            time + DAY,
        );
        expect(done.some((f) => f.kind === "weekly" && f.quest.id === bosses.id)).toBe(true);
    });

    it("takes the best of one run for the single-run goals, not the sum", () => {
        const save = createSave();
        let time = MONDAY;
        while (!questOf("daily", time, "minutes")) {
            time += DAY;
        }
        const quest = questOf("daily", time, "minutes")!;
        const half = Math.ceil(quest.count / 2) * 60;
        recordPeriodic(save, run({ seconds: half }), time);
        const done = recordPeriodic(save, run({ seconds: half }), time);
        expect(done.some((f) => f.quest.id === quest.id)).toBe(false);
        expect(
            getPeriodViews(save, "daily", time).find((v) => v.quest.id === quest.id)?.progress,
        ).toBe(Math.floor(half / 60));
    });

    it("starts over when the day turns, and keeps the week", () => {
        const save = createSave();
        recordPeriodic(save, run({ kills: 50, seconds: 900, bossesKilled: ["a"] }), MONDAY);
        expect(save.periodic?.daily?.key).toBe("2026-11-23");
        recordPeriodic(save, run({ kills: 1 }), MONDAY + DAY);
        expect(save.periodic?.daily?.key).toBe("2026-11-24");
        expect(save.periodic?.weekly?.key).toBe("2026-W48");
        // The old day's numbers are gone, the week's are still there
        const day = getPeriodViews(save, "daily", MONDAY + DAY);
        expect(day.every((v) => v.progress <= 1)).toBe(true);
        // A moment before the record's period reads as nothing too
        expect(getPeriodViews(save, "daily", MONDAY + 5 * DAY).every((v) => v.progress === 0)).toBe(
            true,
        );
    });

    it("counts only a run played for a minute as a run, and a win that beats the map", () => {
        const save = createSave();
        let time = MONDAY;
        while (!questOf("daily", time, "runs") || !questOf("daily", time, "wins")) {
            time += DAY;
        }
        const runs = questOf("daily", time, "runs")!;
        recordPeriodic(save, run({ seconds: 5 }), time);
        // A win in a part of a fight in parts that leaves more to play isn't a map beaten
        recordPeriodic(save, run({ victory: true, beatsMap: false }), time);
        const views = getPeriodViews(save, "daily", time);
        expect(views.find((v) => v.quest.id === runs.id)?.progress).toBe(1);
        expect(views.find((v) => v.quest.goal === "wins")?.progress).toBe(0);
        recordPeriodic(save, run({ victory: true, beatsMap: true }), time);
        expect(
            getPeriodViews(save, "daily", time).find((v) => v.quest.goal === "wins")?.progress,
        ).toBe(1);
    });

    it("counts nothing from a fun map or a development map", () => {
        const save = createSave();
        const coins = save.coins;
        const fun = ALL_MAPS.find((m) => m.fun !== undefined)!;
        const dev = ALL_MAPS.find((m) => m.dev === true);
        for (const map of [fun, dev]) {
            if (map) {
                const done = recordPeriodic(save, run({ mapId: map.id, kills: 99999 }), MONDAY);
                expect(done).toEqual([]);
            }
        }
        expect(save.periodic).toBeUndefined();
        expect(save.coins).toBe(coins);
    });
});

describe("loading a save", () => {
    it("keeps a record that survives a reload", () => {
        const save = createSave();
        recordPeriodic(save, run({ kills: 150, seconds: 400 }), MONDAY);
        const loaded = migrateSave(JSON.parse(JSON.stringify(save)));
        expect(loaded?.periodic).toEqual(save.periodic);
    });

    it("drops what a crafted save gets wrong: keys, ids, numbers", () => {
        const num = (value: unknown, fallback: number) =>
            typeof value === "number" && Number.isFinite(value) ? value : fallback;
        expect(migratePeriodRecord("daily", { key: "tomorrow" }, num)).toBeUndefined();
        expect(migratePeriodRecord("weekly", { key: "2026-11-23" }, num)).toBeUndefined();
        expect(migratePeriodRecord("daily", "x", num)).toBeUndefined();
        const quest = DAILY_POOL[0];
        const record = migratePeriodRecord(
            "daily",
            {
                key: "2026-11-23",
                progress: { [quest.id]: 1e12, fake: 5, kills_400: "many" },
                done: [quest.id, quest.id, "fake", 7, "kills_1500"],
            },
            num,
        );
        expect(record?.progress[quest.id]).toBe(quest.count);
        expect(record?.progress.fake).toBeUndefined();
        // Once, and only the daily pool's: a weekly's id isn't a daily's
        expect(record?.done).toEqual([quest.id]);
    });
});
