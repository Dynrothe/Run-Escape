import { Rng } from "../core/Rng";
import { fmtNum, t, tp } from "../i18n";
import { isoWeek, weekKey, weekStart } from "./vault";

// Daily and weekly quests: three new ones a day and two a week, the same for every player. The
// day (in UTC, like the Vault's week, so it turns at the same moment everywhere) or the week is
// the seed, and the seed picks which of the pools' quests it is. Each pays its coins once, when
// the run that finishes it ends, and what's left over is gone when the period turns. Progress is
// kept in SaveData.periodic, only for the period it belongs to.

// What a quest counts. "total" goals add up over the period's runs, "single" goals are the best
// of any one run.
export type PeriodicGoal =
    // Monsters killed
    | "kills"
    // Bosses killed (each one's kill, as a run's bossesKilled lists them)
    | "bosses"
    // Reward caskets opened
    | "caskets"
    // Runs played to at least MIN_RUN_SECONDS
    | "runs"
    // Maps beaten
    | "wins"
    // The most minutes lasted in one run
    | "minutes"
    // The highest level reached in one run
    | "level";

export type PeriodicDef = {
    // Its goal and count, so one is the same quest on any day it comes up
    id: string;
    goal: PeriodicGoal;
    count: number;
    coins: number;
};

export type PeriodKind = "daily" | "weekly";

// A period's progress in the save: its key ("2026-11-23", "2026-W47"), the numbers by quest id, and
// the quests done and paid
export type PeriodRecord = {
    key: string;
    progress: Record<string, number>;
    done: string[];
};

// How many of each a period has
export const DAILY_COUNT = 3;
export const WEEKLY_COUNT = 2;

// A run shorter than this isn't played (for "runs": walking out at once doesn't count)
export const MIN_RUN_SECONDS = 60;

export const SINGLE_GOALS: readonly PeriodicGoal[] = ["minutes", "level"];

function def(goal: PeriodicGoal, count: number, coins: number): PeriodicDef {
    return { id: `${goal}_${count}`, goal, count, coins };
}

// A day's quests come from here, at most one of each goal: things any run gets done
export const DAILY_POOL: PeriodicDef[] = [
    def("kills", 200, 150),
    def("kills", 400, 250),
    def("bosses", 1, 200),
    def("caskets", 2, 150),
    def("caskets", 4, 250),
    def("runs", 2, 150),
    def("runs", 3, 200),
    def("wins", 1, 300),
    def("minutes", 6, 150),
    def("minutes", 10, 250),
    def("level", 10, 150),
    def("level", 15, 250),
];

// A week's: harder, and worth more
export const WEEKLY_POOL: PeriodicDef[] = [
    def("bosses", 3, 1000),
    def("bosses", 6, 1500),
    def("wins", 3, 1000),
    def("wins", 5, 1500),
    def("kills", 1500, 1000),
    def("caskets", 12, 1000),
    def("runs", 8, 800),
    def("minutes", 15, 1000),
];

const POOLS: Record<PeriodKind, { pool: PeriodicDef[]; count: number }> = {
    daily: { pool: DAILY_POOL, count: DAILY_COUNT },
    weekly: { pool: WEEKLY_POOL, count: WEEKLY_COUNT },
};

const DAY = 24 * 60 * 60 * 1000;

// Its seed's own, so these never line up with the Vault's or any other seed
const PERIODIC_SEED = 0x5e1f0a37;

// The day a moment (ms since 1970, UTC) is in: "2026-11-23"
export function dayKey(time: number): string {
    return new Date(time).toISOString().slice(0, 10);
}

// The key of the period a moment is in
export function periodKey(kind: PeriodKind, time: number): string {
    return kind === "daily" ? dayKey(time) : weekKey(isoWeek(time));
}

// When the period a moment is in ends (the next one starts), ms since 1970
export function periodEnd(kind: PeriodKind, time: number): number {
    if (kind === "daily") {
        return Math.floor(time / DAY) * DAY + DAY;
    }
    return weekStart(isoWeek(time)) + 7 * DAY;
}

// A key's seed: its FNV-1a hash
function periodSeed(kind: PeriodKind, key: string): number {
    let hash = 0x811c9dc5;
    for (const char of `${kind}:${key}`) {
        hash = Math.imul(hash ^ char.charCodeAt(0), 16777619) >>> 0;
    }
    return ((hash ^ PERIODIC_SEED) >>> 0) & 0x7fffffff;
}

// A period's quests: the pool shuffled by its seed, then the first that aren't a goal already taken
export function getPeriodQuests(kind: PeriodKind, time: number): PeriodicDef[] {
    const { pool, count } = POOLS[kind];
    const rng = new Rng(periodSeed(kind, periodKey(kind, time)));
    const shuffled = [...pool];
    for (let i = shuffled.length - 1; i > 0; i--) {
        const j = rng.int(i + 1);
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    const picked: PeriodicDef[] = [];
    for (const quest of shuffled) {
        if (picked.length < count && !picked.some((p) => p.goal === quest.goal)) {
            picked.push(quest);
        }
    }
    return picked;
}

// Whether an id is one of a kind's pool (a save's done list may only name those)
export function isPeriodicId(kind: PeriodKind, id: unknown): id is string {
    return POOLS[kind].pool.some((quest) => quest.id === id);
}

// "Kill 200 monsters", "Defeat 3 bosses", "Last 10 minutes in a single run"
export function describePeriodic(quest: PeriodicDef): string {
    const n = quest.count;
    switch (quest.goal) {
        case "kills":
            return t("quest.periodic.kills", { count: fmtNum(n) });
        case "bosses":
            return tp("quest.periodic.bosses", n);
        case "caskets":
            return tp("quest.caskets", n);
        case "runs":
            return tp("quest.periodic.runs", n);
        case "wins":
            return tp("quest.periodic.wins", n);
        case "minutes":
            return t("quest.periodic.minutes", { count: fmtNum(n) });
        case "level":
            return t("quest.periodic.level", { count: fmtNum(n) });
    }
}
