import { describe, expect, it } from "vitest";

import { Ground } from "./Ground";
import { createTileGrid, readLocs, readTerrain, writeLocs, writeTerrain } from "./mapFormat";
import { rotatePrefab } from "./prefab";

describe("map file formats", () => {
    it("reads back what it writes", () => {
        const grid = createTileGrid(64, 64);
        const tiles = grid.levels[0];
        tiles.heights[3 + 4 * 65] = 77;
        tiles.underlays[3 + 4 * 64] = 48;
        tiles.overlays[3 + 4 * 64] = 442;
        tiles.shapes[3 + 4 * 64] = 6;
        tiles.rotations[3 + 4 * 64] = 2;
        tiles.flags[3 + 4 * 64] = 1;
        grid.locs.push(
            { id: 40000, type: 10, rotation: 3, level: 0, x: 3, y: 4 },
            { id: 40000, type: 22, rotation: 1, level: 1, x: 63, y: 0 },
            { id: 12, type: 0, rotation: 0, level: 0, x: 0, y: 63 },
        );

        const back = createTileGrid(64, 64);
        readTerrain(writeTerrain(grid, 0, 0), 80, 120, back, 0, 0);
        readLocs(writeLocs(grid, 0, 0), back, 0, 0);

        expect(back.levels[0].heights[3 + 4 * 65]).toBe(77);
        expect(back.levels[0].underlays[3 + 4 * 64]).toBe(48);
        expect(back.levels[0].overlays[3 + 4 * 64]).toBe(442);
        expect(back.levels[0].shapes[3 + 4 * 64]).toBe(6);
        expect(back.levels[0].rotations[3 + 4 * 64]).toBe(2);
        expect(back.levels[0].flags[3 + 4 * 64]).toBe(1);
        expect(back.locs).toHaveLength(3);
        expect(back.locs).toContainEqual({
            id: 40000,
            type: 22,
            rotation: 1,
            level: 1,
            x: 63,
            y: 0,
        });
    });
});

describe("rotatePrefab", () => {
    // 3 tiles east-west by 2 tiles north-south, with a 2 by 1 loc in the corner
    const prefab = createTileGrid(3, 2);
    prefab.levels[0].overlays[0] = 7;
    prefab.levels[0].rotations[0] = 1;
    prefab.locs.push({ id: 1, type: 10, rotation: 0, level: 0, x: 0, y: 0 });
    const sizes = () => [2, 1] as [number, number];

    it("turns tiles clockwise", () => {
        const turned = rotatePrefab(prefab, 1, sizes);
        expect([turned.sizeX, turned.sizeY]).toEqual([2, 3]);
        // The south-west corner ends up in the north-west
        expect(turned.levels[0].overlays[0 + 2 * 2]).toBe(7);
        expect(turned.levels[0].rotations[0 + 2 * 2]).toBe(2);
    });

    it("keeps a loc on the tiles it filled", () => {
        const turned = rotatePrefab(prefab, 1, sizes);
        // It filled the west two tiles of the south row: now the top two of
        // the west column, a 1 by 2 loc from y = 1
        expect(turned.locs[0]).toMatchObject({ x: 0, y: 1, rotation: 1 });
    });

    it("comes back after four turns", () => {
        let turned = prefab;
        for (let i = 0; i < 4; i++) {
            turned = rotatePrefab(turned, 1, sizes);
        }
        expect(turned.levels[0].overlays).toEqual(prefab.levels[0].overlays);
        expect(turned.levels[0].rotations).toEqual(prefab.levels[0].rotations);
        expect(turned.locs[0]).toMatchObject({ x: 0, y: 0, rotation: 0 });
    });
});

describe("Ground", () => {
    it("rounds an overlay's corners off with the shapes shores use", () => {
        const ground = new Ground(8, 8);
        const mask = new Uint8Array(64);
        for (let y = 0; y < 4; y++) {
            for (let x = 0; x < 4; x++) {
                mask[ground.tile(x, y)] = 1;
            }
        }
        ground.paintOverlay(mask, 6, true);
        const { overlays, shapes, rotations, flags } = ground.level0;
        // Water to the south-west of the corner tile's neighbours only: a sliver
        expect(shapes[ground.tile(4, 2)]).toBe(6);
        expect(rotations[ground.tile(4, 2)]).toBe(0);
        expect(flags[ground.tile(4, 2)] & 1).toBe(1);
        expect(overlays[ground.tile(6, 6)]).toBe(0);
    });

    it("eases the ground into a flattened stamp", () => {
        const ground = new Ground(16, 16);
        ground.level0.heights.fill(40);
        const prefab = createTileGrid(4, 4);
        prefab.levels[0].heights.fill(200);
        ground.stamp(prefab, 6, 6, { floor: "footprint", feather: 3, flatten: true, height: 20 });
        expect(ground.getHeight(8, 8)).toBe(20);
        expect(ground.getHeight(2, 8)).toBe(40);
        expect(ground.getHeight(5, 8)).toBeGreaterThan(20);
        expect(ground.getHeight(5, 8)).toBeLessThan(40);
    });
});
