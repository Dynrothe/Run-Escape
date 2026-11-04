import { COMBAT_TASKS, canTrackOn, getGoalMaps } from "../content/combatTasks";
import { isDevMap, isFunMap } from "../content/maps";
import { CombatAvoid, CombatGoal, CombatTaskDef } from "../content/types";
import { Sim, TICKS_PER_SECOND } from "./Sim";
import { Enemy, SimEvent } from "./entities";
import { fm } from "./fmath";
import { SaveData, getCombatProgress } from "./save";

// Follows a solo run for its Combat Achievements (content/combatTasks.ts). It only watches: it
// reads the sim and the events each tick drains, and never writes to either, so the run plays
// and hashes exactly as it would without it. Time is the sim's ticks. Co-op runs and runs that
// don't count get none (forRun).

type Watch = {
    task: CombatTaskDef;
    done: boolean;
    // Given up on for the rest of the run (a rule broken)
    failed: boolean;
    // A boss's window (kill, stayInReach): open from its arrival (or last stand) to its kill
    open: boolean;
    openTick: number;
    damageAtOpen: number;
    attacksAtOpen: number;
    boss?: Enemy;
    // stayInReach: ticks out of reach in a row
    outTicks: number;
    // killEachWithin: arrival ticks, and the ones killed in time; killTogether: kill ticks;
    // killBeforeNext: the bosses killed
    arrived?: Map<string, number>;
    inTime?: Set<string>;
    kills?: number[];
    killed?: Set<string>;
    // guardDown: how many times so far
    count?: number;
};

const NO_TASKS: readonly CombatTaskDef[] = [];

export class CombatTracker {
    private readonly watches: Watch[];
    private readonly doneIds: string[] = [];
    private over = false;
    private readonly teleportsAtStart: number;
    // What the run started with, for noUpgrades
    private readonly upgraded: boolean;

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
        this.watches = COMBAT_TASKS.filter(
            (task) =>
                !save.combatTasks.includes(task.id) &&
                canTrackOn(task, sim.map) &&
                this.canDoInRun(task.goal, sim),
        ).map((task) => ({
            task,
            done: false,
            failed: false,
            open: false,
            openTick: 0,
            damageAtOpen: 0,
            attacksAtOpen: 0,
            outTicks: 0,
        }));
        // A boss there before the first tick (nothing yet, but cheap to be sure of)
        for (const watch of this.watches) {
            const goal = watch.task.goal;
            if ((goal.kind === "kill" && goal.from === undefined) || goal.kind === "stayInReach") {
                const ids = goal.kind === "kill" ? goal.bossIds : [goal.bossId];
                const boss = sim.enemies.find((e) => e.boss && !e.dead && ids.includes(e.def.id));
                if (boss) {
                    this.openWindow(watch, sim, boss);
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
            case "endlessRound":
                return sim.endless && (!goal.hard || sim.hard);
            case "stayInReach":
                return sim.map.fight?.strikeReach !== undefined;
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
            if (this.check(watch, sim, events)) {
                watch.done = true;
                this.doneIds.push(watch.task.id);
                (newly ??= []).push(watch.task);
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
                for (const e of events) {
                    if (e.type === "bossSpawned" && goal.bossIds.includes(e.enemyId)) {
                        arrived.set(e.enemyId, sim.tick);
                    } else if (e.type === "kill" && goal.bossIds.includes(e.enemyId)) {
                        const at = arrived.get(e.enemyId);
                        if (at !== undefined && sim.tick - at <= goal.seconds * TICKS_PER_SECOND) {
                            inTime.add(e.enemyId);
                        }
                    }
                }
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
                if (
                    goal.hpAbove !== undefined &&
                    hero.player.hp < hero.player.maxHp * goal.hpAbove
                ) {
                    watch.failed = true;
                    return false;
                }
                if (
                    goal.rules?.noGear &&
                    events.some((e) => e.type === "equip" && this.isMine(e, sim))
                ) {
                    watch.failed = true;
                    return false;
                }
                return sim.state === "victory" && this.keptTo(goal, sim);
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
        }
    }

    // A won run's end: what it kept to
    private keptTo(goal: Extract<CombatGoal, { kind: "win" }>, sim: Sim): boolean {
        const hero = sim.heroes[sim.focus];
        const rules = goal.rules ?? {};
        if (goal.within !== undefined && sim.seconds >= goal.within) {
            return false;
        }
        if (goal.damage !== undefined && hero.damageTaken > goal.damage) {
            return false;
        }
        if (rules.oneWeapon && hero.weapons.length > 1) {
            return false;
        }
        if (rules.noPassives && hero.passives.length > 0) {
            return false;
        }
        if (rules.noTakeBacks) {
            const stats = sim.getRunStats();
            const banished = hero.banished.size + hero.banishedItems.size + hero.banishedSets.size;
            if (stats.rerollsUsed > 0 || stats.skips > 0 || banished > 0) {
                return false;
            }
        }
        if (rules.noTeleports && sim.raidTeleportsLeft !== this.teleportsAtStart) {
            return false;
        }
        if (rules.noSupplies && hero.raidPoints !== hero.raidPointsEarned) {
            return false;
        }
        return true;
    }

    private checkKill(
        watch: Watch,
        goal: Extract<CombatGoal, { kind: "kill" }>,
        sim: Sim,
        events: readonly SimEvent[],
    ): boolean {
        const hero = sim.heroes[sim.focus];
        const without = goal.without ?? [];
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
            const broke =
                (e.type === "playerHit" &&
                    without.includes("hits") &&
                    goal.bossIds.includes(e.enemyId)) ||
                (e.type === "bossAbsorbBlast" &&
                    e.absorbed > 0 &&
                    without.includes("sleepwalkers")) ||
                (e.type === "playerCursed" && e.cursed && without.includes("curse"));
            if (broke) {
                watch.open = false;
                continue;
            }
            if (e.type === "kill" && goal.bossIds.includes(e.enemyId)) {
                watch.open = false;
                if (this.windowClean(watch, without, hero) && this.inTime(watch, goal, sim)) {
                    return true;
                }
            }
        }
        // What's polled rather than evented: anything that ends it early (it opens again when the
        // boss next arrives, in an endless run's next round)
        if (
            watch.open &&
            (!this.windowClean(watch, without, hero) || !this.inTime(watch, goal, sim))
        ) {
            watch.open = false;
        }
        return false;
    }

    private windowClean(
        watch: Watch,
        without: readonly CombatAvoid[],
        hero: Sim["heroes"][number],
    ): boolean {
        for (const avoid of without) {
            if (avoid === "damage" && hero.damageTaken > watch.damageAtOpen) {
                return false;
            }
            if (avoid === "curse" && hero.curse) {
                return false;
            }
            if (avoid === "parasite" && hero.parasite) {
                return false;
            }
            if (
                typeof avoid === "object" &&
                sumAttacks(hero.damageByAttack, avoid.attacks) > watch.attacksAtOpen
            ) {
                return false;
            }
        }
        return true;
    }

    private inTime(watch: Watch, goal: Extract<CombatGoal, { kind: "kill" }>, sim: Sim): boolean {
        return (
            goal.within === undefined || sim.tick - watch.openTick <= goal.within * TICKS_PER_SECOND
        );
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
            watch.outTicks = 0;
        } else if (++watch.outTicks > goal.seconds * TICKS_PER_SECOND) {
            watch.failed = true;
        }
        return false;
    }

    private openWindow(watch: Watch, sim: Sim, boss?: Enemy): void {
        const hero = sim.heroes[sim.focus];
        const goal = watch.task.goal;
        watch.open = true;
        watch.openTick = sim.tick;
        watch.damageAtOpen = hero.damageTaken;
        watch.outTicks = 0;
        if (goal.kind === "kill") {
            const attacks = goal.without?.flatMap((a) => (typeof a === "object" ? a.attacks : []));
            watch.attacksAtOpen = sumAttacks(hero.damageByAttack, attacks ?? []);
        }
        if (goal.kind === "stayInReach") {
            watch.boss =
                boss ?? sim.enemies.find((e) => e.boss && !e.dead && e.def.id === goal.bossId);
        }
    }

    // A personal event that's this player's (all of them, on your own)
    private isMine(event: SimEvent, sim: Sim): boolean {
        return event.hero === undefined || event.hero === sim.focus;
    }
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
