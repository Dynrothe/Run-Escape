import {
    COMBAT_TASKS,
    COMBAT_TASK_BY_ID,
    COMBAT_TIERS,
    canTrackOn,
    getCombatPoints,
    getGoalMaps,
    getTierThresholds,
    getTiersReached,
} from "./combatTasks";
import { ENEMY_BY_ID } from "./enemies";
import { RUN_SET, TOMBS_SET, getInvocationPoints, getRaidLevel } from "./invocations";
import { ALL_MAPS, MAP_BY_ID } from "./maps";
import { QUESTS } from "./quests";
import { REMIX_IDS } from "./remixes";
import { TROPHIES } from "./trophies";
import { CombatGoal } from "./types";

// The bosses and enemies a goal names
function goalEnemies(goal: CombatGoal): string[] {
    switch (goal.kind) {
        case "killCount":
            return goal.enemyIds;
        case "reachPhase":
        case "stayInReach":
        case "guardDown":
        case "killTogether":
            return [goal.bossId];
        case "kill":
        case "killEachWithin":
            return goal.bossIds;
        case "coinsBack":
            return [goal.enemyId];
        default:
            return [];
    }
}

describe("Combat Achievements' tasks", () => {
    test("have ids and names of their own, none a quest's", () => {
        const ids = COMBAT_TASKS.map((t) => t.id);
        const names = COMBAT_TASKS.map((t) => t.name);
        expect(new Set(ids).size).toBe(ids.length);
        expect(new Set(names).size).toBe(names.length);
        const questNames = new Set(QUESTS.map((q) => q.name.toLowerCase()));
        for (const name of names) {
            expect(questNames.has(name.toLowerCase()), name).toBe(false);
        }
    });

    test("name enemies and maps that exist", () => {
        for (const task of COMBAT_TASKS) {
            if (task.mapId) {
                expect(MAP_BY_ID.has(task.mapId), task.id).toBe(true);
            }
            for (const id of goalEnemies(task.goal)) {
                expect(ENEMY_BY_ID.has(id), `${task.id}: ${id}`).toBe(true);
            }
            const goal = task.goal;
            if (goal.kind === "beatMap" || goal.kind === "win" || goal.kind === "beatWithEach") {
                const maps = getGoalMaps(goal.maps);
                expect(maps.length, task.id).toBeGreaterThan(0);
                for (const id of maps) {
                    expect(MAP_BY_ID.has(id), `${task.id}: ${id}`).toBe(true);
                }
            }
        }
    });

    // A renamed attack would make its task impossible without a word
    test("avoid attacks their bosses have, by name", () => {
        for (const task of COMBAT_TASKS) {
            const goal = task.goal;
            if (goal.kind !== "kill") {
                continue;
            }
            const names = new Set(
                goal.bossIds.flatMap((id) => ENEMY_BY_ID.get(id)!.boss!.attacks.map((a) => a.name)),
            );
            for (const avoid of goal.without ?? []) {
                if (typeof avoid === "object") {
                    for (const attack of avoid.attacks) {
                        expect(names.has(attack), `${task.id}: ${attack}`).toBe(true);
                    }
                }
            }
        }
    });

    // What a damage rule lets through, as no one can dodge it, has to be its bosses' by name too
    test("let through only attacks their bosses have, by name", () => {
        for (const task of COMBAT_TASKS) {
            const goal = task.goal;
            if ((goal.kind !== "kill" && goal.kind !== "win") || !goal.except) {
                continue;
            }
            const bossIds =
                goal.kind === "kill"
                    ? goal.bossIds
                    : getGoalMaps(goal.maps).flatMap((id) =>
                          MAP_BY_ID.get(id)!.events.map((e) => e.enemyId),
                      );
            const names = new Set(
                bossIds.flatMap(
                    (id) => ENEMY_BY_ID.get(id)!.boss?.attacks.map((a) => a.name) ?? [],
                ),
            );
            for (const name of goal.except) {
                expect(names.has(name), `${task.id}: ${name}`).toBe(true);
            }
        }
    });

    // Her last stand opens with sleepwalkers, whose blast lands whatever's done: the rest of it is
    // what Wide Awake asks to dodge, all of it
    test("Wide Awake watches all of Phosani's last stand but its opener", () => {
        const finale = ENEMY_BY_ID.get("phosanis_nightmare")!.boss!.phases!.finale!;
        const goal = COMBAT_TASKS.find((t) => t.id === "wide_awake")!.goal;
        const watched =
            goal.kind === "kill"
                ? (goal.without ?? []).flatMap((a) => (typeof a === "object" ? a.attacks : []))
                : [];
        expect(new Set(watched)).toEqual(new Set([...finale.attacks, finale.ambient!.attack]));
    });

    test("count a guard dropped by its boss's own attacks, by name, a pillar or a siphon", () => {
        for (const task of COMBAT_TASKS) {
            const goal = task.goal;
            if (goal.kind !== "guardDown") {
                continue;
            }
            const boss = ENEMY_BY_ID.get(goal.bossId)!.boss!;
            expect(boss.guard, task.id).toBeDefined();
            // The sim's own causes (Sim.dropGuard): a pillar run into, the Whisperer's siphon caught
            const names = new Set(["Pillar", "Soul Siphon", ...boss.attacks.map((a) => a.name)]);
            for (const cause of goal.causes) {
                expect(names.has(cause), `${task.id}: ${cause}`).toBe(true);
            }
        }
    });

    test("count landings of a button the map's fight has", () => {
        for (const task of COMBAT_TASKS) {
            const goal = task.goal;
            if (goal.kind === "abilityHits") {
                expect(MAP_BY_ID.get(task.mapId!)?.fight?.ability?.id, task.id).toBe(
                    goal.abilityId,
                );
            }
        }
    });

    test("can each be followed on some map, and the bosses they name are on it", () => {
        for (const task of COMBAT_TASKS) {
            const maps = ALL_MAPS.filter((map) => canTrackOn(task, map));
            expect(maps.length, task.id).toBeGreaterThan(0);
            if (task.mapId) {
                const map = MAP_BY_ID.get(task.mapId)!;
                const goal = task.goal;
                // A boss with forms arrives as its first
                const bosses =
                    goal.kind === "killCount"
                        ? []
                        : goal.kind === "kill"
                          ? goal.bossIds.slice(0, 1)
                          : goalEnemies(goal);
                // A raid's rooms', a fight in parts' (MapDef.stages) and the Tombs' paths'
                const due = [
                    ...map.events.map((e) => e.enemyId),
                    ...(map.raid?.rooms.map((r) => r.boss) ?? []),
                    ...(map.stages ?? []).flatMap((s) => s.events.map((e) => e.enemyId)),
                    ...(map.tombs?.paths.flatMap((p) => p.room?.boss?.enemyId ?? []) ?? []),
                ];
                for (const id of bosses) {
                    expect(due, `${task.id}: ${id}`).toContain(id);
                }
            }
        }
    });

    // One made of others counts them all in one run, so they're on its map, and none is made of
    // others itself (the tracker watches each one's goal for it)
    test("made of others name tasks on the same map, none of them made of others", () => {
        for (const task of COMBAT_TASKS) {
            const goal = task.goal;
            if (goal.kind !== "allOf") {
                continue;
            }
            expect(task.mapId, task.id).toBeDefined();
            expect(goal.taskIds.length, task.id).toBeGreaterThan(1);
            for (const id of goal.taskIds) {
                const part = COMBAT_TASK_BY_ID.get(id);
                expect(part, `${task.id}: ${id}`).toBeDefined();
                expect(part!.mapId, `${task.id}: ${id}`).toBe(task.mapId);
                expect(part!.goal.kind, `${task.id}: ${id}`).not.toBe("allOf");
            }
        }
    });

    test("count styles each a style there is, once", () => {
        for (const task of COMBAT_TASKS) {
            const goal = task.goal;
            if (goal.kind === "beatWithEach") {
                expect(new Set(goal.styles).size, task.id).toBe(goal.styles.length);
                for (const style of goal.styles) {
                    expect(["melee", "ranged", "magic"], task.id).toContain(style);
                }
            }
        }
    });

    test("name the Tombs' paths that have a puzzle room", () => {
        const paths = MAP_BY_ID.get("tombs_of_amascut")!.tombs!.paths;
        for (const task of COMBAT_TASKS) {
            const goal = task.goal;
            if (goal.kind !== "clearPath" && goal.kind !== "perfectRoom") {
                continue;
            }
            expect(task.mapId, task.id).toBe("tombs_of_amascut");
            if (goal.path !== undefined) {
                const path = paths.find((p) => p.id === goal.path);
                expect(path, task.id).toBeDefined();
                if (goal.kind === "perfectRoom") {
                    expect(path!.room?.puzzle, task.id).toBeDefined();
                }
            }
        }
    });

    test("count one of each of the enemies they name, each of them once", () => {
        for (const task of COMBAT_TASKS) {
            const goal = task.goal;
            if (goal.kind === "killCount" && goal.each) {
                expect(new Set(goal.enemyIds).size, task.id).toBe(goal.enemyIds.length);
                expect(goal.count, task.id).toBe(goal.enemyIds.length);
            }
        }
    });

    // Set up as the run starts: what a map can't have would leave the task out of every run
    test("ask for what a run can be set up with", () => {
        const runPoints = getInvocationPoints(RUN_SET.invocations.map((i) => i.id));
        const raidLevel = getRaidLevel(TOMBS_SET.invocations.map((i) => i.id));
        for (const task of COMBAT_TASKS) {
            const goal = task.goal;
            if (goal.kind !== "win") {
                continue;
            }
            expect(goal.points ?? 0, task.id).toBeLessThanOrEqual(runPoints);
            expect(goal.remixes ?? 0, task.id).toBeLessThanOrEqual(REMIX_IDS.length);
            const maps = getGoalMaps(goal.maps).map((id) => MAP_BY_ID.get(id)!);
            if (goal.raidLevel !== undefined) {
                expect(goal.raidLevel, task.id).toBeLessThanOrEqual(raidLevel);
                expect(
                    maps.every((map) => map.tombs),
                    task.id,
                ).toBe(true);
            }
            if (goal.rules?.noFreezing) {
                expect(
                    maps.every((map) => map.rule?.kind === "cold"),
                    task.id,
                ).toBe(true);
            }
            if (goal.rules?.noDeaths) {
                expect(
                    maps.every((map) => map.tombs),
                    task.id,
                ).toBe(true);
            }
        }
    });

    test("are never followed on the fun maps", () => {
        for (const map of ALL_MAPS.filter((m) => m.fun)) {
            expect(COMBAT_TASKS.filter((t) => canTrackOn(t, map))).toEqual([]);
        }
    });

    test("have a hilt for each tier, and thresholds that climb to every point", () => {
        const thresholds = getTierThresholds();
        const total = getCombatPoints(COMBAT_TASKS.map((t) => t.id));
        expect(thresholds.grandmaster).toBe(total);
        let last = 0;
        for (const tier of COMBAT_TIERS) {
            expect(thresholds[tier.id]).toBeGreaterThan(last);
            last = thresholds[tier.id];
            const hilts = TROPHIES.filter(
                (t) => t.from.kind === "combatTier" && t.from.tier === tier.id,
            );
            expect(hilts).toHaveLength(1);
            expect(COMBAT_TASKS.some((t) => t.tier === tier.id)).toBe(true);
        }
        expect(getTiersReached(0)).toEqual([]);
        expect(getTiersReached(total)).toEqual(COMBAT_TIERS.map((t) => t.id));
        expect(getTiersReached(thresholds.hard)).toEqual(["easy", "medium", "hard"]);
    });
});
