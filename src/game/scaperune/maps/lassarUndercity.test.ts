import { beforeAll, describe, expect, it } from "vitest";

import { SOLID_FLAGS } from "../../core/world/ArenaGrid";
import { findReachable, getCollisionFlags } from "../collision";
import { TILE_BRIDGE, type TileGrid, createTileGrid, writeLocs, writeTerrain } from "../format";
import type { BuildContext } from "../recipe";
import { LASSAR_REALM_RECIPE, LASSAR_RECIPE } from "./lassarUndercity";

const square = (() => {
    const grid = createTileGrid(64, 64);
    const [ground, deck] = grid.levels;
    ground.underlays.fill(1);
    const tile = (x: number) => x + 8 * 64;
    ground.overlays[tile(36)] = 42;
    ground.underlays[tile(37)] = 0;
    ground.overlays[tile(38)] = 42;
    ground.underlays[tile(38)] = 0;
    ground.shapes[tile(38)] = 1;
    ground.overlays[tile(39)] = 42;
    ground.shapes[tile(39)] = 1;
    ground.overlays[tile(40)] = 42;
    deck.flags[tile(40)] = TILE_BRIDGE;
    deck.overlays[tile(40)] = 1;
    return { terrain: writeTerrain(grid, 0, 0), locs: writeLocs(grid, 0, 0) };
})();

const context: BuildContext = {
    maps: { getTerrainData: () => square.terrain, getLocData: () => square.locs },
    locs: () => ({
        name: "",
        sizeX: 1,
        sizeY: 1,
        clipType: 0,
        blocksProjectile: false,
        drawn: false,
    }),
};

describe.each([LASSAR_RECIPE, LASSAR_REALM_RECIPE])("$id's playable floor", (recipe) => {
    let grid: TileGrid;
    let flags: Int32Array;
    let reached: Uint8Array;
    const tile = (x: number) => x + 128 + 200 * 320;

    beforeAll(() => {
        grid = recipe.build(context);
        flags = getCollisionFlags(grid, context.locs);
        reached = findReachable(
            flags,
            grid.sizeX,
            grid.sizeY,
            { x0: 64, y0: 64, x1: 255, y1: 255 },
            recipe.spawn.x,
            recipe.spawn.y,
        );
    });

    it("blocks hidden and missing floors, even when the void joins the streets", () => {
        for (const x of [36, 37, 38]) {
            expect(flags[tile(x)] & SOLID_FLAGS, `void at ${x}`).not.toBe(0);
            expect(reached[tile(x)], `void at ${x}`).toBe(0);
        }
    });

    it("keeps visible ground and bridge decks reachable", () => {
        for (const x of [35, 39, 40]) {
            expect(flags[tile(x)] & SOLID_FLAGS, `floor at ${x}`).toBe(0);
            expect(reached[tile(x)], `floor at ${x}`).toBe(1);
        }
    });
});
