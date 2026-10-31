import { describe, expect, test } from "vitest";

import { getEnemy } from "./enemies";
import { getMapEnemies } from "./mapEnemies";
import { ALL_MAPS, getMap } from "./maps";
import { EnemyDef } from "./types";

// What the sim can call on from an enemy, field by field (Sim.ts's getEnemy calls)
function getBroughtOn(def: EnemyDef): string[] {
    return [
        ...(def.spawns?.enemies.map((e) => e.id) ?? []),
        ...(def.splits ? [def.splits.into] : []),
        ...(def.boss?.rises?.into ? [def.boss.rises.into] : []),
        ...(def.boss?.summonsAt?.map((s) => s.enemyId) ?? []),
        ...(def.boss?.attacks.flatMap((a) => (a.summon ? [a.summon.enemyId] : [])) ?? []),
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

    test("a map doesn't bring in everything", () => {
        const ids = getMapEnemies(getMap("lumbridge")).map((def) => def.id);
        expect(ids).toContain("goblin");
        expect(ids).not.toContain("sol_heredit");
    });
});
