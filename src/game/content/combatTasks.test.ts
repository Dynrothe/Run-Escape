import {
    COMBAT_TASKS,
    COMBAT_TIERS,
    canTrackOn,
    getCombatPoints,
    getGoalMaps,
    getTierThresholds,
    getTiersReached,
} from "./combatTasks";
import { ENEMY_BY_ID } from "./enemies";
import { ALL_MAPS, MAP_BY_ID } from "./maps";
import { QUESTS } from "./quests";
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
            if (goal.kind === "beatMap" || goal.kind === "win") {
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

    test("count a guard dropped by its boss's own attacks, by name, or a pillar", () => {
        for (const task of COMBAT_TASKS) {
            const goal = task.goal;
            if (goal.kind !== "guardDown") {
                continue;
            }
            const boss = ENEMY_BY_ID.get(goal.bossId)!.boss!;
            expect(boss.guard, task.id).toBeDefined();
            const names = new Set(["Pillar", ...boss.attacks.map((a) => a.name)]);
            for (const cause of goal.causes) {
                expect(names.has(cause), `${task.id}: ${cause}`).toBe(true);
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
                const events = map.raid ? map.raid.rooms.map((r) => r.boss) : [];
                const due = [...map.events.map((e) => e.enemyId), ...events];
                for (const id of bosses) {
                    expect(due, `${task.id}: ${id}`).toContain(id);
                }
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
