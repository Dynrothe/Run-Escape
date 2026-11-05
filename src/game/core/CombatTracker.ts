import { getCharacter } from "../content/characters";
import { COMBAT_TASKS, COMBAT_TASK_BY_ID, canTrackOn, getGoalMaps } from "../content/combatTasks";
import { ENEMY_BY_ID } from "../content/enemies";
import { formatTime, joinNames } from "../content/format";
import { isDevMap, isFunMap } from "../content/maps";
import { CombatGoal, CombatStyle, CombatTaskDef } from "../content/types";
import { Sim, TICKS_PER_SECOND } from "./Sim";
import { Enemy, SimEvent } from "./entities";
import { fm } from "./fmath";
import { QuestProgress, SaveData, getCombatProgress } from "./save";

// Follows a solo run for its Combat Achievements (content/combatTasks.ts). It only watches: it
// reads the sim and the events each tick or action drains, and never writes to either, so the
// run plays and hashes exactly as it would without it. Time is the sim's ticks. Co-op runs and
// runs that don't count get none (forRun).

type Hero = Sim["heroes"][number];

type Watch = {
    task: CombatTaskDef;
    done: boolean;
    // Given up on for the rest of the run (a rule broken)
    failed: boolean;
    // Why it can't be done now: for the rest of the run (failed), or until its boss comes again
    // (an endless run's next round). Undefined while it still can be.
    reason?: string;
    // A boss's window (kill, stayInReach): open from its arrival (or last stand) to its kill
    open: boolean;
    openTick: number;
    // The damage that counts (countedDamage), and the avoided attacks', as it opened
    damageAtOpen: number;
    attacksAtOpen: number;
    // hurtCursed: the damage that counted as the curse on now began; undefined while there's none
    curseBase?: number;
    boss?: Enemy;
    // stayInReach: the tick they went out of reach, -1 while in it. A tick, not a count of looks,
    // as it's looked at between ticks too (a casket, an item, the fight's button).
    outSince: number;
    // killEachWithin: arrival ticks, the ones killed in time, and the ones that weren't (until
    // they arrive again); killTogether: kill ticks; killBeforeNext: the bosses killed
    arrived?: Map<string, number>;
    inTime?: Set<string>;
    late?: Set<string>;
    kills?: number[];
    killed?: Set<string>;
    // guardDown, abilityHits: how many times so far
    count?: number;
    // allOf: its tasks' own watches
    parts?: Watch[];
};

// Where a task the run follows has got: still to do, done this run, or out of reach (reason says
// why), with how far it's come for one that counts (kills, Smites, maps)
export type CombatTaskState = "on" | "done" | "failed";
export type CombatTaskStatus = {
    task: CombatTaskDef;
    state: CombatTaskState;
    reason?: string;
    progress?: QuestProgress;
};

const NO_TASKS: readonly CombatTaskDef[] = [];

export class CombatTracker {
    private readonly watches: Watch[];
    private readonly doneIds: string[] = [];
    // Progress this run made on tasks over more runs that the save can't see from the run's
    // summary (combatProgress keys: each style a map was beaten with)
    private readonly earnedKeys: string[] = [];
    // Tasks that went out of reach since takeFailed last looked
    private failedNow: Watch[] = [];
    private over = false;
    private readonly teleportsAtStart: number;
    // What the run started with, for noUpgrades
    private readonly upgraded: boolean;
    // The adventurer's combat style, for beatWithEach
    private readonly style: CombatStyle;

    // The tracker for a run, or none for one Combat Achievements don't follow: co-op, the fun and
    // dev maps, and the raid test (?raidtest)
    static forRun(sim: Sim, save: Readonly<SaveData>): CombatTracker | undefined {
        if (
            sim.heroes.length !== 1 ||
            sim.testing ||
            isFunMap(sim.map.id) ||
            isDevMap(sim.map.id)
        ) {
            return undefined;
        }
        return new CombatTracker(sim, save);
    }

    private constructor(
        sim: Sim,
        private readonly save: Readonly<SaveData>,
    ) {
        const hero = sim.heroes[sim.focus];
        this.teleportsAtStart = sim.raidTeleportsLeft;
        this.upgraded =
            Object.values(hero.metaStats).some((value) => value !== 0) ||
            Object.values(hero.armoury ?? {}).some((times) => times > 0);
        this.style = getCharacter(hero.characterId).style;
        this.watches = COMBAT_TASKS.filter(
            (task) =>
                !save.combatTasks.includes(task.id) &&
                canTrackOn(task, sim.map) &&
                this.canDoInRun(task.goal, sim),
        ).map((task) => startWatch(task));
        // A boss there before the first tick (nothing yet, but cheap to be sure of)
        for (const watch of this.watches) {
            for (const each of [watch, ...(watch.parts ?? [])]) {
                const goal = each.task.goal;
                if (
                    (goal.kind === "kill" && goal.from === undefined) ||
                    goal.kind === "stayInReach"
                ) {
                    const ids = goal.kind === "kill" ? goal.bossIds : [goal.bossId];
                    const boss = sim.enemies.find(
                        (e) => e.boss && !e.dead && ids.includes(e.def.id),
                    );
                    if (boss) {
                        this.openWindow(each, sim, boss);
                    }
                }
            }
        }
    }

    // The tasks this run is following
    get tasks(): readonly CombatTaskDef[] {
        return this.watches.map((w) => w.task);
    }

    // The ids of the tasks done so far this run, in order
    get done(): readonly string[] {
        return this.doneIds;
    }

    // The progress this run made that its summary doesn't show (RunSummary.combatProgress)
    get earned(): readonly string[] {
        return this.earnedKeys;
    }

    // Where each task the run follows has got, in the list's order
    statuses(sim: Sim): CombatTaskStatus[] {
        return this.watches.map((watch) => {
            const state = watch.done
                ? "done"
                : watch.failed || watch.reason !== undefined
                  ? "failed"
                  : "on";
            const progress = this.progressOf(watch, sim);
            return {
                task: watch.task,
                state,
                ...(state === "failed" && { reason: watch.reason }),
                ...(progress && { progress }),
            };
        });
    }

    // The tasks that have gone out of reach since the last call, and why
    takeFailed(): { task: CombatTaskDef; reason: string }[] {
        if (this.failedNow.length === 0) {
            return [];
        }
        const failed = this.failedNow.map((w) => ({ task: w.task, reason: w.reason ?? "" }));
        this.failedNow = [];
        return failed;
    }

    // Whether this run can do it at all, by its mode
    private canDoInRun(goal: CombatGoal, sim: Sim): boolean {
        switch (goal.kind) {
            case "beatMap":
                return (
                    !sim.endless &&
                    (!goal.hard || sim.hard) &&
                    (!goal.expert || sim.expert) &&
                    getGoalMaps(goal.maps).includes(sim.map.id)
                );
            case "win":
                return (
                    !sim.endless &&
                    (!goal.hard || sim.hard) &&
                    getGoalMaps(goal.maps).includes(sim.map.id) &&
                    (!goal.rules?.noUpgrades || !this.upgraded)
                );
            case "beatWithEach":
                return (
                    !sim.endless &&
                    getGoalMaps(goal.maps).includes(sim.map.id) &&
                    goal.styles.includes(this.style)
                );
            case "endlessRound":
                return sim.endless && (!goal.hard || sim.hard);
            case "stayInReach":
                return sim.map.fight?.strikeReach !== undefined;
            case "allOf":
                return (
                    (!goal.win || !sim.endless) &&
                    goal.taskIds.every((id) =>
                        this.canDoInRun(COMBAT_TASK_BY_ID.get(id)!.goal, sim),
                    )
                );
            default:
                return true;
        }
    }

    // After every tick (and anything else that drains the sim's events), with those events.
    // Returns the tasks done just now.
    observe(sim: Sim, events: readonly SimEvent[]): readonly CombatTaskDef[] {
        if (this.over || this.watches.length === 0) {
            return NO_TASKS;
        }
        let newly: CombatTaskDef[] | undefined;
        for (const watch of this.watches) {
            if (watch.done || watch.failed) {
                continue;
            }
            const before = watch.reason;
            if (this.check(watch, sim, events)) {
                watch.done = true;
                watch.reason = undefined;
                this.doneIds.push(watch.task.id);
                (newly ??= []).push(watch.task);
            } else if (watch.reason !== undefined && before === undefined) {
                this.failedNow.push(watch);
            }
        }
        // Nothing more counts once it's won or lost, though the sim ticks on for its animations
        if (sim.runOver) {
            this.over = true;
        }
        return newly ?? NO_TASKS;
    }

    private check(watch: Watch, sim: Sim, events: readonly SimEvent[]): boolean {
        const hero = sim.heroes[sim.focus];
        const goal = watch.task.goal;
        switch (goal.kind) {
            case "beatMap":
                if (sim.state !== "victory") {
                    return false;
                }
                if (!goal.all) {
                    return true;
                }
                // This map, and every other one beaten before
                return getGoalMaps(goal.maps).every(
                    (id) => id === sim.map.id || this.save.combatProgress[`${watch.task.id}:${id}`],
                );
            case "beatWithEach": {
                if (sim.state !== "victory") {
                    return false;
                }
                // This adventurer's style, and every other one won with before
                const key = `${watch.task.id}:${this.style}`;
                if (!this.earnedKeys.includes(key)) {
                    this.earnedKeys.push(key);
                }
                return goal.styles.every(
                    (style) =>
                        style === this.style ||
                        this.save.combatProgress[`${watch.task.id}:${style}`],
                );
            }
            case "killCount": {
                if (!events.some((e) => e.type === "kill" && goal.enemyIds.includes(e.enemyId))) {
                    return false;
                }
                const progress = getCombatProgress(this.save, watch.task, sim.enemyKills)!;
                return progress.done >= progress.of;
            }
            case "endlessRound":
                return sim.round >= goal.round;
            case "reachPhase":
                return events.some(
                    (e) =>
                        e.type === "bossStage" &&
                        e.enemyId === goal.bossId &&
                        e.phase >= goal.phase,
                );
            case "kill":
                return this.checkKill(watch, goal, sim, events);
            case "killEachWithin": {
                const arrived = (watch.arrived ??= new Map());
                const inTime = (watch.inTime ??= new Set());
                const late = (watch.late ??= new Set());
                const limit = goal.seconds * TICKS_PER_SECOND;
                for (const e of events) {
                    if (e.type === "bossSpawned" && goal.bossIds.includes(e.enemyId)) {
                        arrived.set(e.enemyId, sim.tick);
                        late.delete(e.enemyId);
                    } else if (e.type === "kill" && goal.bossIds.includes(e.enemyId)) {
                        const at = arrived.get(e.enemyId);
                        if (at !== undefined && sim.tick - at <= limit) {
                            inTime.add(e.enemyId);
                        }
                    }
                }
                // Up too long, or killed too late, and not in time before
                for (const [id, at] of arrived) {
                    if (!inTime.has(id) && sim.tick - at > limit) {
                        late.add(id);
                    }
                }
                watch.reason =
                    late.size > 0
                        ? `${joinNames([...late].map(enemyName))} took over ${formatTime(goal.seconds)}`
                        : undefined;
                return inTime.size === goal.bossIds.length;
            }
            case "killBeforeNext": {
                const bosses = getBossOrder(sim);
                const killed = (watch.killed ??= new Set());
                for (const e of events) {
                    if (e.type === "kill" && e.boss) {
                        killed.add(e.enemyId);
                    } else if (e.type === "bossSpawned") {
                        // The one before it is still up
                        const i = bosses.indexOf(e.enemyId);
                        if (i > 0 && !killed.has(bosses[i - 1])) {
                            watch.failed = true;
                            watch.reason = `${enemyName(e.enemyId)} rose before ${enemyName(bosses[i - 1])} was down`;
                            return false;
                        }
                    }
                }
                // Up to the last: there's none after it to beat
                return bosses.length > 1 && bosses.slice(0, -1).every((id) => killed.has(id));
            }
            case "killTogether": {
                const kills = (watch.kills ??= []);
                for (const e of events) {
                    if (e.type === "kill" && e.enemyId === goal.bossId) {
                        kills.push(sim.tick);
                    }
                }
                const n = kills.length;
                return (
                    n >= goal.count &&
                    kills[n - 1] - kills[n - goal.count] <= goal.seconds * TICKS_PER_SECOND
                );
            }
            case "win": {
                // Each rule only ever gets broken for good, so it's checked as it goes, for the
                // HUD, and once more as the run's won
                const broke = this.whatBroke(goal, sim, events);
                if (broke) {
                    watch.failed = true;
                    watch.reason = broke;
                    return false;
                }
                return sim.state === "victory";
            }
            case "evolve":
                return hero.evolutionsMade.length >= goal.count;
            case "clearRoom":
                return (
                    sim.raidRoom > goal.room ||
                    (sim.raidRoom === goal.room && sim.raidStage === "cleared")
                );
            case "coinsBack":
                return events.some((e) => e.type === "coinsReturned" && e.enemyId === goal.enemyId);
            case "stayInReach":
                return this.checkReach(watch, goal, sim, events);
            case "guardDown":
                for (const e of events) {
                    if (
                        e.type === "bossGuard" &&
                        e.enemyId === goal.bossId &&
                        (e.stunned || !goal.stunned) &&
                        goal.causes.includes(e.cause)
                    ) {
                        watch.count = (watch.count ?? 0) + 1;
                    }
                }
                return (watch.count ?? 0) >= goal.count;
            case "abilityHits":
                for (const e of events) {
                    if (
                        e.type === "ability" &&
                        e.abilityId === goal.abilityId &&
                        (e.opened || !goal.opened)
                    ) {
                        watch.count = (watch.count ?? 0) + 1;
                    }
                }
                return (watch.count ?? 0) >= goal.count;
            case "allOf": {
                const parts = watch.parts!;
                for (const part of parts) {
                    if (!part.done && !part.failed && this.check(part, sim, events)) {
                        part.done = true;
                        part.reason = undefined;
                    }
                }
                // One of them out of reach puts the whole out of reach, as long as it is
                const spoilt = parts.find((p) => !p.done && (p.failed || p.reason !== undefined));
                if (spoilt) {
                    watch.failed = spoilt.failed;
                    watch.reason = `${spoilt.task.name}: ${spoilt.reason}`;
                    return false;
                }
                watch.reason = undefined;
                return parts.every((p) => p.done) && (!goal.win || sim.state === "victory");
            }
        }
    }

    // What's broken a win's rules, hitpoints or time so far, if anything
    private whatBroke(
        goal: Extract<CombatGoal, { kind: "win" }>,
        sim: Sim,
        events: readonly SimEvent[],
    ): string | undefined {
        const hero = sim.heroes[sim.focus];
        const rules = goal.rules ?? {};
        if (goal.hpAbove !== undefined && hero.player.hp < hero.player.maxHp * goal.hpAbove) {
            return `fell below ${Math.round(goal.hpAbove * 100)}% hitpoints`;
        }
        if (rules.noGear && events.some((e) => e.type === "equip" && this.isMine(e, sim))) {
            return "put on casket gear";
        }
        if (
            rules.noSleepwalkers &&
            events.some((e) => e.type === "bossAbsorbBlast" && e.absorbed > 0)
        ) {
            return "a sleepwalker reached her";
        }
        if (goal.within !== undefined && sim.seconds >= goal.within) {
            return `over ${formatTime(goal.within)}`;
        }
        if (goal.damage !== undefined && countedDamage(hero, goal.except) > goal.damage) {
            return goal.damage === 0
                ? (lastHit(events, sim) ?? "took damage")
                : `took over ${goal.damage} damage`;
        }
        if (rules.oneWeapon && hero.weapons.length > 1) {
            return "took a second weapon";
        }
        if (rules.noPassives && hero.passives.length > 0) {
            return "took a passive";
        }
        if (
            rules.noTakeBacks &&
            (hero.rerollsLeft < hero.rerollsAtStart ||
                hero.skips > 0 ||
                hero.banished.size + hero.banishedItems.size + hero.banishedSets.size > 0)
        ) {
            return "rerolled, skipped or banished";
        }
        if (rules.noTeleports && sim.raidTeleportsLeft !== this.teleportsAtStart) {
            return "used a teleporter";
        }
        if (rules.noSupplies && hero.raidPoints !== hero.raidPointsEarned) {
            return "spent raid points";
        }
        return undefined;
    }

    private checkKill(
        watch: Watch,
        goal: Extract<CombatGoal, { kind: "kill" }>,
        sim: Sim,
        events: readonly SimEvent[],
    ): boolean {
        const hero = sim.heroes[sim.focus];
        for (const e of events) {
            if (!watch.open) {
                const opens =
                    goal.from === "finale"
                        ? e.type === "bossStage" &&
                          e.stage === "finale" &&
                          goal.bossIds.includes(e.enemyId)
                        : e.type === "bossSpawned" && goal.bossIds.includes(e.enemyId);
                if (opens) {
                    this.openWindow(watch, sim);
                }
                continue;
            }
            if (!this.isMine(e, sim)) {
                continue;
            }
            const broke = whatSpoils(e, goal);
            if (broke) {
                watch.open = false;
                watch.reason = broke;
                continue;
            }
            if (e.type === "kill" && goal.bossIds.includes(e.enemyId)) {
                watch.open = false;
                const why =
                    this.whatSpoilt(watch, goal, hero, sim, events) ??
                    this.lateness(watch, goal, sim);
                if (!why) {
                    return true;
                }
                watch.reason = why;
            }
        }
        // What's polled rather than evented: anything that ends it early (it opens again when the
        // boss next arrives, in an endless run's next round)
        if (watch.open) {
            const why =
                this.whatSpoilt(watch, goal, hero, sim, events) ?? this.lateness(watch, goal, sim);
            if (why) {
                watch.open = false;
                watch.reason = why;
            }
        }
        return false;
    }

    // What's spoilt the window by what it's taken so far, if anything
    private whatSpoilt(
        watch: Watch,
        goal: Extract<CombatGoal, { kind: "kill" }>,
        hero: Hero,
        sim: Sim,
        events: readonly SimEvent[],
    ): string | undefined {
        const counted = countedDamage(hero, goal.except);
        for (const avoid of goal.without ?? []) {
            if (avoid === "damage" && counted > watch.damageAtOpen) {
                return lastHit(events, sim) ?? "took damage";
            }
            // Polled: whatever hurt them between one look and the next while the curse was on
            if (avoid === "hurtCursed") {
                if (!hero.curse) {
                    watch.curseBase = undefined;
                } else if (watch.curseBase === undefined) {
                    watch.curseBase = counted;
                } else if (counted > watch.curseBase) {
                    return "hurt while cursed";
                }
            }
            if (
                typeof avoid === "object" &&
                sumAttacks(hero.damageByAttack, avoid.attacks) > watch.attacksAtOpen
            ) {
                // Its hit's in these events: only a boss's attacks are counted by name, and
                // they're evented as they land
                return (
                    lastHit(events, sim, avoid.attacks) ?? `hit by ${avoid.attacks.join(" or ")}`
                );
            }
        }
        return undefined;
    }

    private lateness(
        watch: Watch,
        goal: Extract<CombatGoal, { kind: "kill" }>,
        sim: Sim,
    ): string | undefined {
        return goal.within !== undefined &&
            sim.tick - watch.openTick > goal.within * TICKS_PER_SECOND
            ? `not down within ${formatTime(goal.within)}`
            : undefined;
    }

    private checkReach(
        watch: Watch,
        goal: Extract<CombatGoal, { kind: "stayInReach" }>,
        sim: Sim,
        events: readonly SimEvent[],
    ): boolean {
        for (const e of events) {
            if (e.type === "bossSpawned" && e.enemyId === goal.bossId && !watch.open) {
                this.openWindow(watch, sim);
            } else if (e.type === "kill" && e.enemyId === goal.bossId && watch.open) {
                watch.open = false;
                return true;
            }
        }
        const boss = watch.boss;
        if (!watch.open || !boss) {
            return false;
        }
        const state = boss.bossState;
        const phase = state?.phase;
        // His descent, a kneel at a phase's threshold, a leap, or the gaze he leaps to the middle
        // for: out of reach then is his doing
        const excused =
            sim.intro !== undefined ||
            phase?.pauseEnd !== undefined ||
            state?.leap !== undefined ||
            state?.windup?.attack.toMiddle === true;
        const player = sim.heroes[sim.focus].player;
        const reach = sim.map.fight!.strikeReach!;
        if (excused || fm.hypot(boss.x - player.x, boss.y - player.y) <= reach) {
            watch.outSince = -1;
        } else if (watch.outSince < 0) {
            watch.outSince = sim.tick;
        } else if (sim.tick - watch.outSince >= goal.seconds * TICKS_PER_SECOND) {
            watch.failed = true;
            watch.reason = `out of reach for ${goal.seconds} seconds`;
        }
        return false;
    }

    private openWindow(watch: Watch, sim: Sim, boss?: Enemy): void {
        const hero = sim.heroes[sim.focus];
        const goal = watch.task.goal;
        watch.open = true;
        watch.openTick = sim.tick;
        watch.reason = undefined;
        watch.damageAtOpen = countedDamage(hero, goal.kind === "kill" ? goal.except : undefined);
        watch.outSince = -1;
        watch.curseBase = undefined;
        if (goal.kind === "kill") {
            const attacks = goal.without?.flatMap((a) => (typeof a === "object" ? a.attacks : []));
            watch.attacksAtOpen = sumAttacks(hero.damageByAttack, attacks ?? []);
        }
        if (goal.kind === "stayInReach") {
            watch.boss =
                boss ?? sim.enemies.find((e) => e.boss && !e.dead && e.def.id === goal.bossId);
        }
    }

    // How far a task's got, for one that counts its way there
    private progressOf(watch: Watch, sim: Sim): QuestProgress | undefined {
        const goal = watch.task.goal;
        const hero = sim.heroes[sim.focus];
        const upTo = (done: number, of: number) => ({ done: Math.min(done, of), of });
        switch (goal.kind) {
            case "killCount":
                return getCombatProgress(this.save, watch.task, sim.enemyKills);
            case "beatMap":
                return goal.all ? getCombatProgress(this.save, watch.task) : undefined;
            case "beatWithEach": {
                const id = watch.task.id;
                const won = goal.styles.filter(
                    (style) =>
                        this.save.combatProgress[`${id}:${style}`] ||
                        this.earnedKeys.includes(`${id}:${style}`),
                );
                return upTo(won.length, goal.styles.length);
            }
            case "endlessRound":
                return upTo(sim.round, goal.round);
            case "evolve":
                return upTo(hero.evolutionsMade.length, goal.count);
            case "killEachWithin":
                return upTo(watch.inTime?.size ?? 0, goal.bossIds.length);
            case "guardDown":
            case "abilityHits":
                return upTo(watch.count ?? 0, goal.count);
            case "allOf":
                return upTo(watch.parts!.filter((p) => p.done).length, watch.parts!.length);
            default:
                return undefined;
        }
    }

    // A personal event that's this player's (all of them, on your own)
    private isMine(event: SimEvent, sim: Sim): boolean {
        return event.hero === undefined || event.hero === sim.focus;
    }
}

function startWatch(task: CombatTaskDef): Watch {
    const goal = task.goal;
    return {
        task,
        done: false,
        failed: false,
        open: false,
        openTick: 0,
        damageAtOpen: 0,
        attacksAtOpen: 0,
        outSince: -1,
        ...(goal.kind === "allOf" && {
            parts: goal.taskIds.map((id) => startWatch(COMBAT_TASK_BY_ID.get(id)!)),
        }),
    };
}

// What an event spoils a kill's window with, if anything: a hit from the boss, a sleepwalker
// reaching it, a healer healing it
function whatSpoils(e: SimEvent, goal: Extract<CombatGoal, { kind: "kill" }>): string | undefined {
    const without = goal.without ?? [];
    if (e.type === "playerHit" && without.includes("hits") && goal.bossIds.includes(e.enemyId)) {
        return `hit by ${e.attack ?? enemyName(e.enemyId)}`;
    }
    if (e.type === "bossAbsorbBlast" && e.absorbed > 0 && without.includes("sleepwalkers")) {
        return "a sleepwalker reached her";
    }
    if (e.type === "enemyHealed" && without.includes("heals") && goal.bossIds.includes(e.enemyId)) {
        return `${enemyName(e.enemyId)} was healed`;
    }
    return undefined;
}

// The last hit on this player in these events (only from these attacks, if given), as "hit by"
// its attack or whoever landed it
function lastHit(
    events: readonly SimEvent[],
    sim: Sim,
    attacks?: readonly string[],
): string | undefined {
    for (let i = events.length - 1; i >= 0; i--) {
        const e = events[i];
        if (
            e.type === "playerHit" &&
            (e.hero === undefined || e.hero === sim.focus) &&
            (!attacks || (e.attack !== undefined && attacks.includes(e.attack)))
        ) {
            return `hit by ${e.attack ?? enemyName(e.enemyId)}`;
        }
    }
    return undefined;
}

function enemyName(id: string): string {
    return ENEMY_BY_ID.get(id)?.name ?? id;
}

// What they've taken, less what these attacks did: what a damage goal counts
function countedDamage(hero: Hero, except: readonly string[] = []): number {
    return hero.damageTaken - sumAttacks(hero.damageByAttack, except);
}

function sumAttacks(damage: Record<string, number>, attacks: readonly string[]): number {
    let sum = 0;
    for (const name of attacks) {
        sum += damage[name] ?? 0;
    }
    return sum;
}

// The map's bosses in the order they're due, the final one last
const bossOrders = new WeakMap<object, string[]>();
function getBossOrder(sim: Sim): string[] {
    let order = bossOrders.get(sim.map);
    if (!order) {
        order = sim.map.events
            .filter((e) => e.kind === "boss" || e.kind === "finalBoss")
            .map((e) => e.enemyId);
        bossOrders.set(sim.map, order);
    }
    return order;
}
