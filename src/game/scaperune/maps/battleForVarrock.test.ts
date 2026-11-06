import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";

import { GAME_CACHE_NAME } from "../../cache";
import { getMap, getMapCharacter } from "../../content/maps";
import { PHONE_TRIANGLES, lintFloor } from "../../core/floorLint";
import { MAP_SQUARE_SIZE } from "../format";
import { getRecipeArena } from "../recipe";
import {
    BATTLE_FOR_VARROCK,
    BATTLE_FOR_VARROCK_RECIPE,
    PALACE_FLOOR_ASCII,
    PALACE_FLOOR_RECT_REAL,
} from "./battleForVarrock";

// The Battle for Varrock: the map's def against its recipe, its palace floor (the floor
// system's), and, with the game's cache, the map itself: walked from the gate, and nothing
// placed z-fighting. grid-hash.ts pins what it writes.

const MAP = getMap("battle_for_varrock");
const hasCache = existsSync(`caches/${GAME_CACHE_NAME}`);

describe("the Battle for Varrock", () => {
    it("plays on its recipe's squares, from just outside the south gate", () => {
        expect(MAP.arena).toEqual(getRecipeArena(BATTLE_FOR_VARROCK_RECIPE));
        const { mapX, mapY, spawn } = BATTLE_FOR_VARROCK_RECIPE;
        expect(MAP.spawn).toEqual({
            x: mapX * MAP_SQUARE_SIZE + spawn.x + 0.5,
            y: mapY * MAP_SQUARE_SIZE + spawn.y + 0.5,
        });
        // The real world's 3211, 3377: the road in, south of the gap in the wall
        expect(spawn).toEqual({ x: 3211 - 48 * 64, y: 3377 - 51 * 64 });
    });

    it("is a map to walk round: nothing comes, and everyone's Justiciar Zachariah", () => {
        expect(MAP.waves).toEqual([]);
        expect(MAP.events).toEqual([]);
        expect(MAP.fun?.explore).toBe(true);
        expect(MAP.fun?.bosses.pool).toEqual([]);
        expect(getMapCharacter(MAP)).toBe("justiciar_zachariah");
        expect(MAP.scaperune).toBe(true);
    });

    it("lays the palace's floor over its rooms, in one piece, solid, in a phone's budget", () => {
        const floor = MAP.floor!;
        const { x0, y0, x1, y1 } = PALACE_FLOOR_RECT_REAL;
        expect(PALACE_FLOOR_ASCII).toHaveLength(y1 - y0 + 1);
        for (const row of PALACE_FLOOR_ASCII) {
            expect(row).toHaveLength(x1 - x0 + 1);
        }
        expect(floor.rect).toEqual(BATTLE_FOR_VARROCK.palaceFloor);
        expect(floor.script).toEqual([]);
        expect(floor.tiles?.[0]).toMatchObject({ type: "solid" });
        // From the palace's front gate
        const lint = lintFloor(floor, { x: 12, y: 1 });
        expect(lint.warnings).toEqual([]);
        expect(lint.triangles.busy).toBeLessThanOrEqual(PHONE_TRIANGLES);
    });
});

describe.skipIf(!hasCache)("the Battle for Varrock, built", () => {
    // check-maps.ts builds it (the recipe throws if the gate, the square, the palace's court or
    // the throne can't be walked to) and holds it to every rule a map cut from the real world is
    it("passes check-maps: everything open reaches the gate", async () => {
        const { stdout } = await promisify(execFile)(
            process.execPath,
            ["--import", "tsx", "scripts/scaperune/check-maps.ts"],
            {
                encoding: "utf8",
                timeout: 240000,
                env: { ...process.env, ONLY: "battle_for_varrock$" },
            },
        );
        expect(stdout).toMatch(/battle_for_varrock: \d+ open, 0 stranded/);
        expect(stdout).toContain("All open tiles reach the spawn");
    }, 250000);

    it("places nothing that z-fights", async () => {
        const { stdout } = await promisify(execFile)(
            process.execPath,
            ["--import", "tsx", "scripts/scaperune/check-coplanar.ts", "battle_for_varrock"],
            { encoding: "utf8", timeout: 240000, env: { ...process.env, CHECK: "1" } },
        );
        expect(stdout).toMatch(
            /battle_for_varrock: \d+ models, \d+ pairs in one plane \((\d+) as cut\)/,
        );
        const [, pairs, cut] = /(\d+) pairs in one plane \((\d+) as cut\)/.exec(stdout)!;
        expect(pairs).toBe(cut);
    }, 250000);
});
