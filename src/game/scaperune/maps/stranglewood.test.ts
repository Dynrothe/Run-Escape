import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { promisify } from "node:util";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { GAME_CACHE_NAME } from "../../cache";
import { SOLID_FLAGS } from "../../core/world/ArenaGrid";
import { findReachable, getCollisionFlags, getStepGrid } from "../collision";
import { TILE_BLOCKED, createTileGrid } from "../format";
import { cutPrefab } from "../prefab";
import type { BuildContext } from "../recipe";
import { STRANGLEWOOD_RECIPE } from "./stranglewood";

vi.mock("../prefab", () => ({ cutPrefab: vi.fn() }));

const SIZE = 256;
const context: BuildContext = {
    maps: {
        getTerrainData: () => undefined,
        getLocData: () => undefined,
    },
    locs: () => {
        throw new Error("The terrain fixture has no scenery");
    },
};

describe("Stranglewood mountain collision", () => {
    let wood: ReturnType<typeof createTileGrid>;

    beforeEach(() => {
        wood = createTileGrid(SIZE, SIZE);
        wood.levels[0].heights.fill(40);
        vi.mocked(cutPrefab).mockReturnValue(wood);
    });

    it("blocks steep faces even if the cache leaves them open, including near the clearing", () => {
        const { spawn } = STRANGLEWOOD_RECIPE;
        const faces = [
            { x: 160, y: 150 },
            { x: spawn.x + 8, y: spawn.y + 6 },
        ];
        for (const { x, y } of faces) {
            wood.levels[0].heights[x + y * (SIZE + 1)] += 17;
        }
        // A gentle ramp and a flat, originally blocked patch in the clearing still open.
        wood.levels[0].heights[spawn.x - 8 + (spawn.y + 6) * (SIZE + 1)] += 16;
        wood.levels[0].flags[spawn.x + (spawn.y + 2) * SIZE] |= TILE_BLOCKED;

        const grid = STRANGLEWOOD_RECIPE.build(context);
        const flags = getCollisionFlags(grid, context.locs);
        const steps = getStepGrid(flags, SIZE, { x0: 64, y0: 64, x1: 191, y1: 191 });
        for (const { x, y } of faces) {
            expect(steps.isSolid(x, y)).toBe(true);
        }
        expect(steps.isSolid(spawn.x - 8, spawn.y + 6)).toBe(false);
        expect(steps.isSolid(spawn.x, spawn.y + 2)).toBe(false);
        expect(steps.isSolid(spawn.x, spawn.y)).toBe(false);
    });

    it("keeps flat mountain tops blocked and seals ground cut off by a mountain ridge", () => {
        for (let y = 64; y < 192; y++) {
            wood.levels[0].overlays[160 + y * SIZE] = 83;
        }
        const grid = STRANGLEWOOD_RECIPE.build(context);
        const flags = getCollisionFlags(grid, context.locs);
        const { spawn } = STRANGLEWOOD_RECIPE;
        const reached = findReachable(
            flags,
            SIZE,
            SIZE,
            { x0: 64, y0: 64, x1: 191, y1: 191 },
            spawn.x,
            spawn.y,
        );
        expect(flags[160 + 150 * SIZE] & SOLID_FLAGS).not.toBe(0);
        expect(flags[170 + 150 * SIZE] & SOLID_FLAGS).not.toBe(0);
        expect(reached[150 + 150 * SIZE]).toBe(1);
        expect(reached[170 + 150 * SIZE]).toBe(0);
    });

    it.runIf(existsSync(`caches/${GAME_CACHE_NAME}`))(
        "blocks the real mountains without closing the bridges or the boss clearing",
        async () => {
            const script = `
            import assert from "node:assert/strict";
            import { createSceneBuilder, loadGameCache } from "./scripts/cache/scene-util.ts";
            import { createBuildContext } from "./src/game/scaperune/squares.ts";
            import { STRANGLEWOOD_RECIPE } from "./src/game/scaperune/maps/stranglewood.ts";
            import { getCollisionFlags, getStepGrid } from "./src/game/scaperune/collision.ts";
            import { TILE_BRIDGE } from "./src/game/scaperune/format.ts";
            import { getTileSlope } from "./src/game/scaperune/terrain.ts";
            const SIZE = 256;
            const { mapFileLoader, locTypeLoader } = createSceneBuilder(loadGameCache());
            const realContext = createBuildContext(mapFileLoader, locTypeLoader);
            const grid = STRANGLEWOOD_RECIPE.build(realContext);
            const flags = getCollisionFlags(grid, realContext.locs);
            const steps = getStepGrid(flags, SIZE, { x0: 64, y0: 64, x1: 191, y1: 191 });
            let mountains = 0;
            let bridges = 0;
            for (let y = 64; y < 192; y++) {
                for (let x = 64; x < 192; x++) {
                    const i = x + y * SIZE;
                    if (grid.levels[1].flags[i] & TILE_BRIDGE) {
                        bridges += +!steps.isSolid(x, y);
                        continue;
                    }
                    if (
                        grid.levels[0].overlays[i] === 83 ||
                        getTileSlope(grid.levels[0].heights, SIZE + 1, x, y) > 16
                    ) {
                        mountains++;
                        assert(steps.isSolid(x, y), "mountain at " + x + "," + y);
                    }
                }
            }
            assert(mountains > 0);
            assert(bridges > 0);
            const { spawn } = STRANGLEWOOD_RECIPE;
            assert(!steps.isSolid(spawn.x, spawn.y));
            assert(!steps.isSolid(spawn.x, spawn.y + 6));
            console.log("Mountains blocked; bridges and clearing open");
            `;
            const { stdout } = await promisify(execFile)(
                process.execPath,
                ["--import", "tsx", "--input-type=module", "--eval", script],
                { encoding: "utf8", timeout: 60000 },
            );
            expect(stdout).toContain("Mountains blocked; bridges and clearing open");
        },
        70000,
    );
});
