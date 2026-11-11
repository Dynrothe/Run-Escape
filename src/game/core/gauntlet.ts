import {
    BLESSING_BY_ID,
    BlessingId,
    GAUNTLET_CLIMB,
    GauntletFightOptions,
    GauntletPoints,
    getFightPoints,
    getWound,
} from "../content/gauntlet";

// A run of the Forgotten Four (content/gauntlet.ts, act-2-fallen-empire.md 7.3): which fight it's
// on, the wounds and points carried into it, the blessing bought for it, and how each fight before
// went. Plain data, changed only here, so the client and the bot run it the same way. Each fight
// is its own Sim, started with gauntletFightOptions and ended with winGauntletFight or
// loseGauntletFight.

export type GauntletPhase = "fight" | "camp" | "fallen" | "cleared";

// What a run takes into a fight, kept so Retry starts it again the same
export type GauntletEntry = { wound: number; points: number; blessing?: BlessingId };

export type GauntletFightDone = {
    fightId: string;
    // The fight's time (the winning try's), its points, and how many tries it took past the first
    seconds: number;
    points: GauntletPoints;
    retries: number;
    // The wounds it left the next adventurer
    wound: number;
};

export type GauntletRun = {
    order: string[];
    hard: boolean;
    // The fight being played, or in the camp the next one
    index: number;
    phase: GauntletPhase;
    // Into the current (or next) fight: its wounds (a share of the hitpoints missing at its
    // start), the points left to spend, and its blessing
    wound: number;
    points: number;
    blessing?: BlessingId;
    // As the current fight was started, for Retry
    entry: GauntletEntry;
    // Tries of the current fight past the first
    tries: number;
    done: GauntletFightDone[];
};

export function startGauntlet(order: readonly string[], hard: boolean): GauntletRun {
    return {
        order: [...order],
        hard,
        index: 0,
        phase: "fight",
        wound: 0,
        points: 0,
        entry: { wound: 0, points: 0 },
        tries: 0,
        done: [],
    };
}

export function gauntletFightId(run: GauntletRun): string {
    return run.order[Math.min(run.index, run.order.length - 1)];
}

// The climb of the fight at index (1 for the first)
export function gauntletClimb(index: number): number {
    return GAUNTLET_CLIMB[Math.min(Math.max(0, index), GAUNTLET_CLIMB.length - 1)];
}

// The current fight's Sim options (SimOptions.gauntlet)
export function gauntletFightOptions(run: GauntletRun): GauntletFightOptions {
    return {
        climb: gauntletClimb(run.index),
        hp: 1 - run.wound,
        ...(run.blessing && { blessing: run.blessing }),
    };
}

// How a fight ended: its time, and the adventurer's hitpoints, damage taken and the boss's guard
// drops (RunResult.gauntlet)
export type GauntletOutcome = {
    seconds: number;
    hp: number;
    maxHp: number;
    damageTaken: number;
    guardDowns: number;
};

// The current fight won: its points paid, its wounds carried, and on to the camp, or the gauntlet's
// cleared after the last
export function winGauntletFight(run: GauntletRun, outcome: GauntletOutcome): GauntletRun {
    if (run.phase !== "fight") {
        return run;
    }
    const points = getFightPoints(
        outcome.seconds,
        outcome.damageTaken,
        outcome.maxHp,
        outcome.guardDowns,
    );
    const wound = getWound(outcome.hp, outcome.maxHp);
    const done: GauntletFightDone = {
        fightId: gauntletFightId(run),
        seconds: outcome.seconds,
        points,
        retries: run.tries,
        wound,
    };
    const last = run.index >= run.order.length - 1;
    return {
        ...run,
        index: last ? run.index : run.index + 1,
        phase: last ? "cleared" : "camp",
        wound,
        points: run.points + points.total,
        blessing: undefined,
        tries: 0,
        done: [...run.done, done],
    };
}

// The current fight lost: the results' Retry this fight or Start over
export function loseGauntletFight(run: GauntletRun): GauntletRun {
    return run.phase === "fight" ? { ...run, phase: "fallen" } : run;
}

// From the fallen fight's start again, with the wounds, points and blessing it came in with
export function retryGauntletFight(run: GauntletRun): GauntletRun {
    if (run.phase !== "fallen") {
        return run;
    }
    return { ...run, ...run.entry, phase: "fight", tries: run.tries + 1 };
}

// The camp's blessing for the next fight, or none (undefined): picking one pays for it, and one
// picked before is given back first. Rest's clears the wounds the next fight would start with.
export function chooseBlessing(run: GauntletRun, id: BlessingId | undefined): GauntletRun {
    if (run.phase !== "camp") {
        return run;
    }
    const before = run.blessing && BLESSING_BY_ID.get(run.blessing);
    const refunded = run.points + (before?.price ?? 0);
    const wound = before?.id === "rest" ? (run.done[run.done.length - 1]?.wound ?? 0) : run.wound;
    if (id === undefined) {
        return { ...run, points: refunded, blessing: undefined, wound };
    }
    const blessing = BLESSING_BY_ID.get(id);
    if (!blessing || refunded < blessing.price) {
        return run;
    }
    return {
        ...run,
        points: refunded - blessing.price,
        blessing: id,
        wound: id === "rest" ? 0 : wound,
    };
}

// Out of the camp, into the next fight
export function leaveGauntletCamp(run: GauntletRun): GauntletRun {
    if (run.phase !== "camp") {
        return run;
    }
    return {
        ...run,
        phase: "fight",
        entry: {
            wound: run.wound,
            points: run.points,
            ...(run.blessing && { blessing: run.blessing }),
        },
    };
}

// The fights' time, the camps left out
export function gauntletSeconds(run: GauntletRun): number {
    return run.done.reduce((sum, fight) => sum + fight.seconds, 0);
}

// Retries over the whole run, the current fight's too
export function gauntletRetries(run: GauntletRun): number {
    return run.done.reduce((sum, fight) => sum + fight.retries, 0) + run.tries;
}

// A clean run: no fight retried
export function isGauntletClean(run: GauntletRun): boolean {
    return gauntletRetries(run) === 0;
}
