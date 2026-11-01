import { describe, expect, test } from "vitest";

import { getEnemy } from "./enemies";
import { getMapEnemies, getMapEnemyIds } from "./mapEnemies";
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
});

describe("canDoQuestOn", () => {
    const names = (mapId: string) =>
        QUESTS.filter((quest) => canDoQuestOn(quest, getMap(mapId))).map((quest) => quest.id);

    test("a map has its own quests, and none of another's", () => {
        expect(names("inferno")).toContain("the_inferno");
        expect(names("lumbridge")).not.toContain("the_inferno");
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
