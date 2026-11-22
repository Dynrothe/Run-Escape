import { isDevMap, isFunMap } from "../content/maps";
import {
    DAILY_POOL,
    MIN_RUN_SECONDS,
    PeriodKind,
    PeriodRecord,
    PeriodicDef,
    SINGLE_GOALS,
    WEEKLY_POOL,
    getPeriodQuests,
    isPeriodicId,
    periodKey,
} from "../content/periodicQuests";
import { SaveData } from "./save";

// Daily and weekly quests' bookkeeping (content/periodicQuests.ts has what they are): a run's
// numbers added to the period's progress, and the quests it finishes paid. Nothing here reads the
// clock: the moment comes in, so the tests and a run's banking agree on which day it is.

// What a run adds to its period: the fields of RunSummary these goals read
export type PeriodicRun = {
    mapId: string;
    victory: boolean;
    seconds: number;
    level: number;
    kills: number;
    bossesKilled: string[];
    caskets?: number;
    // A win that beats the map (not a part of a fight in parts that leaves more to play)
    beatsMap: boolean;
};

export type PeriodicView = {
    quest: PeriodicDef;
    done: boolean;
    // How far it's got, held at the count
    progress: number;
};

export function emptyPeriod(key: string): PeriodRecord {
    return { key, progress: {}, done: [] };
}

// A kind's record as it stands at a moment: the saved one if it's this period's, and none if it
// belongs to a period gone
export function getPeriodRecord(save: SaveData, kind: PeriodKind, time: number): PeriodRecord {
    const record = save.periodic?.[kind];
    const key = periodKey(kind, time);
    return record?.key === key ? record : emptyPeriod(key);
}

// What a period's quests have come to, for the screen
export function getPeriodViews(save: SaveData, kind: PeriodKind, time: number): PeriodicView[] {
    const record = getPeriodRecord(save, kind, time);
    return getPeriodQuests(kind, time).map((quest) => ({
        quest,
        done: record.done.includes(quest.id),
        progress: Math.min(record.progress[quest.id] ?? 0, quest.count),
    }));
}

// What a run is worth towards a goal: added up, or the best of one run
function runValue(quest: PeriodicDef, run: PeriodicRun): number {
    switch (quest.goal) {
        case "kills":
            return run.kills;
        case "bosses":
            return run.bossesKilled.length;
        case "caskets":
            return run.caskets ?? 0;
        case "runs":
            return run.seconds >= MIN_RUN_SECONDS ? 1 : 0;
        case "wins":
            return run.victory && run.beatsMap ? 1 : 0;
        case "minutes":
            return Math.floor(run.seconds / 60);
        case "level":
            return run.level;
    }
}

// Banks a run on the save's daily and weekly quests, and pays those it finishes. Returns them, with
// the kind. Not a development map's or a fun map's run, as quests don't count those either.
export function recordPeriodic(
    save: SaveData,
    run: PeriodicRun,
    time: number,
): { kind: PeriodKind; quest: PeriodicDef }[] {
    if (isDevMap(run.mapId) || isFunMap(run.mapId)) {
        return [];
    }
    const finished: { kind: PeriodKind; quest: PeriodicDef }[] = [];
    for (const kind of ["daily", "weekly"] as const) {
        const record = getPeriodRecord(save, kind, time);
        const progress = { ...record.progress };
        const done = [...record.done];
        for (const quest of getPeriodQuests(kind, time)) {
            if (done.includes(quest.id)) {
                continue;
            }
            const value = runValue(quest, run);
            const before = progress[quest.id] ?? 0;
            if (value === 0) {
                continue;
            }
            progress[quest.id] = SINGLE_GOALS.includes(quest.goal)
                ? Math.max(before, value)
                : before + value;
            if (progress[quest.id] >= quest.count) {
                done.push(quest.id);
                save.coins += quest.coins;
                save.totalCoins += quest.coins;
                finished.push({ kind, quest });
            }
        }
        save.periodic = { ...save.periodic, [kind]: { key: record.key, progress, done } };
    }
    return finished;
}

// A loaded save's record: its key must be a period's own, and its ids and numbers real. A key
// that's no day or week is dropped (and so is one from a period gone, when the next run is banked).
export function migratePeriodRecord(
    kind: PeriodKind,
    raw: unknown,
    num: (value: unknown, fallback: number) => number,
): PeriodRecord | undefined {
    if (!raw || typeof raw !== "object") {
        return undefined;
    }
    const data = raw as Partial<PeriodRecord>;
    const valid = kind === "daily" ? /^\d{4}-\d{2}-\d{2}$/ : /^\d{4}-W\d{2}$/;
    if (typeof data.key !== "string" || !valid.test(data.key)) {
        return undefined;
    }
    const pool = kind === "daily" ? DAILY_POOL : WEEKLY_POOL;
    const progress: Record<string, number> = {};
    for (const quest of pool) {
        const value = Math.floor(num(data.progress?.[quest.id], 0));
        if (value > 0) {
            progress[quest.id] = Math.min(value, quest.count);
        }
    }
    const done = Array.isArray(data.done)
        ? [...new Set(data.done.filter((id) => isPeriodicId(kind, id)))]
        : [];
    return { key: data.key, progress, done };
}
