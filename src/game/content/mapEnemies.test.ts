import { describe, expect, test } from "vitest";

import { getEnemy } from "./enemies";
import { getMapEnemies, getMapEnemyIds, getTombsRooms, getTombsStageEnemies } from "./mapEnemies";
import { ALL_MAPS, CAMPAIGN_MAPS, MAPS, getMap } from "./maps";
import { QUESTS, canDoQuestOn } from "./quests";
import { EnemyDef } from "./types";

// What the sim can call on from an enemy, field by field (Sim.ts's getEnemy calls)
function getBroughtOn(def: EnemyDef): string[] {
    return [
        ...(def.spawns?.enemies.map((e) => e.id) ?? []),
        ...(def.splits ? [def.splits.into] : []),
        ...(def.boss?.rises?.into ? [def.boss.rises.into] : []),
        ...(def.boss?.summonsAt?.map((s) => s.enemyId) ?? []),
        ...(def.boss?.attacks.flatMap((a) => (a.summon ? [a.summon.enemyId] : [])) ?? []),
        ...(def.boss?.attacks.flatMap((a) => a.candies ?? []) ?? []),
        ...(def.boss?.glyph ? [def.boss.glyph.lookId] : []),
    ];
}

describe("getMapEnemies", () => {
    test.each(ALL_MAPS.map((map) => [map.id, map] as const))("%s has all it needs", (_id, map) => {
        const ids = new Set(getMapEnemies(map).map((def) => def.id));
        for (const wave of map.waves) {
            for (const { id } of wave.enemies) {
                expect(ids).toContain(id);
            }
        }
        for (const event of map.events) {
            expect(ids).toContain(event.enemyId);
        }
        for (const id of map.fun?.bosses.pool ?? []) {
            expect(ids).toContain(id);
        }
        for (const id of ids) {
            for (const other of getBroughtOn(getEnemy(id))) {
                expect(ids).toContain(other);
            }
        }
    });

    test("a map with pumpkins brings in what their tricks do", () => {
        const ids = getMapEnemies({
            ...getMap("lumbridge"),
            id: "halloween",
            waves: [],
            events: [],
        });
        expect(ids.map((def) => def.id)).toContain("ghost");
    });

    test("a map doesn't bring in everything", () => {
        const ids = getMapEnemies(getMap("lumbridge")).map((def) => def.id);
        expect(ids).toContain("goblin");
        expect(ids).not.toContain("sol_heredit");
    });

    test("Thanksgiving waves use farmers, bandits and foxes instead of rats and goblins", () => {
        const map = getMap("thanksgiving");
        const ids = new Set(map.waves.flatMap((wave) => wave.enemies.map((enemy) => enemy.id)));
        for (const id of ["farmer", "bandit", "fox"]) {
            expect(ids.has(id)).toBe(true);
            expect(getMapEnemyIds(map).has(id)).toBe(true);
        }
        for (const id of ["rat", "giant_rat", "goblin"]) {
            expect(ids.has(id)).toBe(false);
        }
    });
});

describe("the Tombs, baked a room at a time", () => {
    const map = getMap("tombs_of_amascut");
    const paths = map.tombs!.paths.filter((path) => path.room).map((path) => path.id);
    const ids = (pathsDone: string[], wardens: boolean) =>
        new Set(getTombsStageEnemies(map, pathsDone, wardens).map((def) => def.id));

    test("each room has enemies of its own, and the Wardens too", () => {
        const rooms = getTombsRooms(map);
        expect([...rooms.keys()].sort()).toEqual([...paths, "wardens"].sort());
        for (const room of rooms.values()) {
            expect(room.size).toBeGreaterThan(0);
        }
        expect(rooms.get("wardens")).toContain("tumeken_warden_magic");
        // In every room, so in none of them
        expect([...rooms.values()].some((room) => room.has("scarab_swarm"))).toBe(false);
    });

    test("a room's own enemies are its own, and nothing the rest of the map brings on", () => {
        const all = new Set(getMapEnemies(map).map((def) => def.id));
        const seen = new Set<string>();
        for (const room of getTombsRooms(map).values()) {
            for (const id of room) {
                expect(all).toContain(id);
                expect(seen).not.toContain(id);
                seen.add(id);
            }
        }
    });

    test("the raid starts with every path's room baked, but not the Wardens'", () => {
        const start = ids([], false);
        const rooms = getTombsRooms(map);
        for (const path of paths) {
            for (const id of rooms.get(path)!) {
                expect(start).toContain(id);
            }
        }
        for (const id of rooms.get("wardens")!) {
            expect(start).not.toContain(id);
        }
        // What's no room's own is there all along
        expect(start).toContain("scarab_swarm");
    });

    test("a path's room goes once it's done, and the Wardens come with the last path", () => {
        const rooms = getTombsRooms(map);
        const [first, ...rest] = paths;
        const afterFirst = ids([first], false);
        for (const id of rooms.get(first)!) {
            expect(afterFirst).not.toContain(id);
        }
        expect(afterFirst).not.toContain("tumeken_warden_magic");
        const lastLeft = ids([first, ...rest.slice(0, -1)], false);
        expect(lastLeft).toContain("tumeken_warden_magic");
        for (const id of rooms.get(rest[rest.length - 1])!) {
            expect(lastLeft).toContain(id);
        }
        const allDone = ids(paths, false);
        expect(allDone).toContain("tumeken_warden_magic");
        for (const path of paths) {
            for (const id of rooms.get(path)!) {
                expect(allDone).not.toContain(id);
            }
        }
    });

    test("straight to the Wardens (the devtools' way), they're baked", () => {
        expect(ids([], true)).toContain("tumeken_warden_magic");
    });

    test("every stage together is the whole map's", () => {
        const all = getMapEnemies(map).map((def) => def.id);
        const stages = new Set([...ids([], false), ...ids(paths, true)]);
        expect([...stages].sort()).toEqual([...all].sort());
    });

    test("another map is the same as before", () => {
        const lumbridge = getMap("lumbridge");
        expect(getTombsRooms(lumbridge).size).toBe(0);
        expect(getTombsStageEnemies(lumbridge, [], false)).toEqual(getMapEnemies(lumbridge));
    });
});

describe("canDoQuestOn", () => {
    const names = (mapId: string) =>
        QUESTS.filter((quest) => canDoQuestOn(quest, getMap(mapId))).map((quest) => quest.id);

    test("a map has its own quests, and none of another's", () => {
        expect(names("inferno")).toContain("the_inferno");
        expect(names("lumbridge")).not.toContain("the_inferno");
    });

    test("Thanksgiving has its boss and Chompy bird quests with their coin rewards", () => {
        const quests = QUESTS.filter((quest) => quest.mapId === "thanksgiving");
        expect(quests.map((quest) => quest.id)).toEqual([
            "thanksgiving_professor_oddenstein",
            "thanksgiving_evil_chickens",
            "thanksgiving_freaky_forester",
            "thanksgiving_chompy_hunt",
        ]);
        expect(quests.map((quest) => quest.coins)).toEqual([1000, 1500, 2500, 4000]);
        expect(quests[1].objective).toMatchObject({ kind: "kill", count: 10 });
        expect(quests[2].objective).toMatchObject({
            kind: "kill",
            enemyIds: ["freaky_forester_final"],
        });
        expect(quests[3].objective).toMatchObject({
            kind: "kill",
            enemyIds: ["chompy_bird"],
            count: 10000,
        });
        expect(quests[3].name).toBe("Chompy Slayer");
        expect(names("lumbridge")).not.toContain("thanksgiving_chompy_hunt");
    });

    test("the ones done all over only show where what they're after turns up", () => {
        expect(names("lumbridge")).toContain("ratcatchers");
        expect(names("lumbridge")).not.toContain("demon_slayer");
        expect(names("wilderness")).toContain("demon_slayer");
        expect(names("wilderness")).not.toContain("ratcatchers");
        expect(names("inferno")).not.toContain("ratcatchers");
        expect(names("inferno")).not.toContain("demon_slayer");
    });

    test("caskets come everywhere", () => {
        for (const map of CAMPAIGN_MAPS) {
            expect(names(map.id)).toContain("pirates_treasure");
            // Which is why they count everywhere: every map has something that drops one
            expect(map.events.some((e) => e.kind === "elite" || e.kind === "boss")).toBe(true);
        }
    });

    test("every quest can be done somewhere, and a map's own can be done on it", () => {
        for (const quest of QUESTS) {
            expect(MAPS.filter((map) => canDoQuestOn(quest, map)).length).toBeGreaterThan(0);
            const objective = quest.objective;
            if (quest.mapId && (objective.kind === "kill" || objective.kind === "killEach")) {
                const here = getMapEnemyIds(getMap(quest.mapId));
                expect(objective.enemyIds.some((id) => here.has(id))).toBe(true);
            }
        }
    });
});
