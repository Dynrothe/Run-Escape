import { describe, expect, it } from "vitest";

import { CollisionFlag } from "../../rs/pathfinder/flag/CollisionFlag";
import { SceneTileModel } from "../../rs/scene/SceneTileModel";
import { Ground } from "./Ground";
import { findExits, getInsideTiles, getNearestExit } from "./building";
import { findPieces } from "./collision";
import {
    TILE_BLOCKED,
    TILE_BRIDGE,
    TILE_SHOWN,
    TileGrid,
    createTileGrid,
    readLocs,
    readTerrain,
    writeLocs,
    writeTerrain,
} from "./format";
import { Point, smoothPath } from "./paths";
import { bringDown, cutPrefab, rotatePrefab } from "./prefab";
import { OVERLAY_SHAPES, getCoveredSides, getOverlayShape } from "./shapes";

// Which half sides a shape really covers, from what the renderer builds, in the
// order shapes.ts counts them
function drawnSides(shape: number, rotation: number): number {
    const overlay = 0x1234;
    const underlay = 0x4321;
    const model = new SceneTileModel(
        shape + 1,
        rotation,
        -1,
        0,
        0,
        0,
        0,
        0,
        0,
        96,
        96,
        96,
        96,
        underlay,
        underlay,
        underlay,
        underlay,
        overlay,
        overlay,
        0,
        0,
    );
    const full = new SceneTileModel(
        1,
        0,
        -1,
        0,
        0,
        0,
        0,
        0,
        0,
        96,
        96,
        96,
        96,
        0,
        0,
        0,
        0,
        overlay,
        overlay,
        0,
        0,
    );
    const overlayColor = full.faceColorsA[0];
    const inset = 3;
    const points = [
        [inset, 32],
        [inset, 96],
        [32, 128 - inset],
        [96, 128 - inset],
        [128 - inset, 96],
        [128 - inset, 32],
        [96, inset],
        [32, inset],
    ];
    let sides = 0;
    points.forEach(([x, z], bit) => {
        for (let face = 0; face < model.facesA.length; face++) {
            const corners = [model.facesA[face], model.facesB[face], model.facesC[face]].map(
                (v) => [model.vertexX[v], model.vertexZ[v]],
            );
            const signs = corners.map(([ax, az], i) => {
                const [bx, bz] = corners[(i + 1) % 3];
                return Math.sign((bx - ax) * (z - az) - (bz - az) * (x - ax));
            });
            const inside = signs.every((s) => s >= 0) || signs.every((s) => s <= 0);
            if (inside && model.faceColorsA[face] === overlayColor) {
                sides |= 1 << bit;
            }
        }
    });
    return sides;
}

describe("overlay shapes", () => {
    it("are what the renderer draws", () => {
        for (const [sides, [shape, rotation]] of OVERLAY_SHAPES) {
            expect(drawnSides(shape, rotation), `shape ${shape}.${rotation}`).toBe(sides);
        }
    });

    it("reads half sides off a field", () => {
        // West side in, east side out: the line's down the middle of the tile
        expect(getCoveredSides(1, -1, -1, 1)).toBe(0b10000111);
        expect(getOverlayShape(getCoveredSides(1, -1, -1, 1), 0)).toEqual([6, 0]);
    });
});

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
    const sizes = () => ({ sizeX: 2, sizeY: 1 });

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

describe("planes", () => {
    // A square of the world with something on each of its levels: level 1's a room upstairs
    // with a bridge (level 2 holds its ground floor) and a tile drawn from the ground
    function upstairs(): TileGrid {
        const grid = createTileGrid(64, 64);
        for (let level = 0; level < 4; level++) {
            grid.levels[level].overlays[5 + 6 * 64] = 10 + level;
            grid.locs.push({ id: 100 + level, type: 10, rotation: 0, level, x: 5, y: 6 });
        }
        grid.levels[0].flags[1] = TILE_BLOCKED;
        grid.levels[1].flags[1] = TILE_SHOWN;
        grid.levels[2].flags[1] = TILE_BRIDGE;
        grid.levels[1].heights[0] = 40;
        return grid;
    }

    it("brings a level and those over it down", () => {
        const down = bringDown(upstairs(), 1);
        expect([0, 1, 2, 3].map((level) => down.levels[level].overlays[5 + 6 * 64])).toEqual([
            11, 12, 13, 0,
        ]);
        expect(down.locs.map((loc) => [loc.id, loc.level])).toEqual([
            [101, 0],
            [102, 1],
            [103, 2],
        ]);
        // Heights stay as they were, over the level below
        expect(down.levels[0].heights[0]).toBe(40);
        // The new top level is empty, at an upper level's height
        expect(down.levels[3].heights[0]).toBe(30);
    });

    it("brings each level's flags down with it", () => {
        const down = bringDown(upstairs(), 1);
        // Level 1's TILE_SHOWN is on the ground floor now, where it means nothing, and level 2's
        // bridge is on level 1, so the old level 3 counts as walked on
        expect(down.levels[0].flags[1]).toBe(TILE_SHOWN);
        expect(down.levels[1].flags[1]).toBe(TILE_BRIDGE);
        expect(down.levels[2].flags[1]).toBe(0);
    });

    it("leaves plane 0 alone", () => {
        const grid = upstairs();
        expect(bringDown(grid, 0)).toBe(grid);
    });

    it("cuts from a plane", () => {
        const square = upstairs();
        const maps = {
            getTerrainData: (mapX: number, mapY: number) =>
                mapX === 50 && mapY === 50 ? writeTerrain(square, 0, 0) : undefined,
            getLocData: (mapX: number, mapY: number) =>
                mapX === 50 && mapY === 50 ? writeLocs(square, 0, 0) : undefined,
        };
        const cut = cutPrefab(maps, 50 * 64 + 4, 50 * 64 + 4, 4, 4, { plane: 1 });
        expect(cut.levels[0].overlays[1 + 2 * 4]).toBe(11);
        expect(cut.locs).toContainEqual({ id: 101, type: 10, rotation: 0, level: 0, x: 1, y: 2 });
        expect(cut.locs.some((loc) => loc.id === 100)).toBe(false);
        const ground = cutPrefab(maps, 50 * 64 + 4, 50 * 64 + 4, 4, 4);
        expect(ground.levels[0].overlays[1 + 2 * 4]).toBe(10);
    });
});

describe("findPieces", () => {
    // 7 by 3 tiles, split down x = 3 by things that block
    const SIZE_X = 7;
    const SIZE_Y = 3;
    function split(): Int32Array {
        const flags = new Int32Array(SIZE_X * SIZE_Y);
        for (let y = 0; y < SIZE_Y; y++) {
            flags[3 + y * SIZE_X] = CollisionFlag.OBJECT;
        }
        return flags;
    }

    it("finds each piece, the biggest first, with the box round it", () => {
        const flags = split();
        // A post in the east half, so it's the smaller
        flags[5 + 1 * SIZE_X] = CollisionFlag.OBJECT;
        const pieces = findPieces(flags, SIZE_X, SIZE_Y);
        expect(pieces.map((piece) => piece.size)).toEqual([9, 8]);
        expect(pieces[0]).toMatchObject({ x0: 0, y0: 0, x1: 2, y1: 2 });
        expect(pieces[1]).toMatchObject({ x0: 4, y0: 0, x1: 6, y1: 2 });
        expect(pieces[1].from.x).toBeGreaterThanOrEqual(4);
    });

    it("stops at a wall on a tile's edge", () => {
        const flags = split();
        // A wall between x = 0 and x = 1, all the way up
        for (let y = 0; y < SIZE_Y; y++) {
            flags[0 + y * SIZE_X] |= CollisionFlag.WALL_EAST;
            flags[1 + y * SIZE_X] |= CollisionFlag.WALL_WEST;
        }
        const pieces = findPieces(flags, SIZE_X, SIZE_Y);
        expect(pieces.map((piece) => piece.size)).toEqual([9, 6, 3]);
    });

    it("doesn't cut a corner between two things that block", () => {
        const flags = new Int32Array(2 * 2);
        flags[1] = CollisionFlag.OBJECT;
        flags[2] = CollisionFlag.OBJECT;
        expect(findPieces(flags, 2, 2).map((piece) => piece.size)).toEqual([1, 1]);
    });

    it("keeps to the rectangle", () => {
        const pieces = findPieces(split(), SIZE_X, SIZE_Y, { x0: 1, y0: 0, x1: 4, y1: 1 });
        expect(pieces.map((piece) => [piece.size, piece.x0, piece.x1])).toEqual([
            [4, 1, 2],
            [2, 4, 4],
        ]);
    });
});

describe("buildings", () => {
    // A room from x 2 to 6 and y 2 to 5, walls on its own tiles' sides, with a gap in
    // the south side and an open door standing on the tile at the gap
    function createRoom(): TileGrid {
        const prefab = createTileGrid(9, 8);
        const wall = (x: number, y: number, rotation: number, id = 1) =>
            prefab.locs.push({ id, type: 0, rotation, level: 0, x, y });
        for (let y = 2; y <= 5; y++) {
            wall(2, y, 0);
            wall(6, y, 2);
        }
        for (let x = 2; x <= 6; x++) {
            wall(x, 5, 1);
            if (x !== 4) {
                wall(x, 2, 3);
            }
        }
        wall(4, 3, 0, 7);
        return prefab;
    }

    it("takes in the whole of a room that has a doorway", () => {
        const inside = getInsideTiles(createRoom());
        for (let y = 2; y <= 5; y++) {
            for (let x = 2; x <= 6; x++) {
                expect(inside[x + y * 9], `${x},${y}`).toBe(1);
            }
        }
        expect(inside.reduce((sum, tile) => sum + tile, 0)).toBe(20);
    });

    it("takes in the tile where the lines of two doorways cross", () => {
        const prefab = createTileGrid(7, 7);
        for (let i = 1; i <= 5; i++) {
            if (i !== 3) {
                prefab.locs.push({ id: 1, type: 0, rotation: 0, level: 0, x: 1, y: i });
                prefab.locs.push({ id: 1, type: 0, rotation: 1, level: 0, x: i, y: 5 });
            }
            prefab.locs.push({ id: 1, type: 0, rotation: 2, level: 0, x: 5, y: i });
            prefab.locs.push({ id: 1, type: 0, rotation: 3, level: 0, x: i, y: 1 });
        }
        expect(getInsideTiles(prefab)[3 + 3 * 7]).toBe(1);
    });

    it("finds the gap in the walls, whatever way an open door stands", () => {
        const exits = findExits(createRoom(), (loc) => loc.id === 7);
        expect(exits).toHaveLength(1);
        expect(exits[0]).toEqual({ x: 4.5, y: 2, outX: 0, outY: -1 });
    });

    it("counts a double door as one way out, and picks the nearest", () => {
        const prefab = createTileGrid(8, 8);
        for (let i = 2; i <= 5; i++) {
            prefab.locs.push({ id: 1, type: 0, rotation: 0, level: 0, x: 2, y: i });
            prefab.locs.push({ id: 1, type: 0, rotation: 2, level: 0, x: 5, y: i });
            prefab.locs.push({ id: 1, type: 0, rotation: 1, level: 0, x: i, y: 5 });
        }
        const exits = findExits(prefab, () => false);
        expect(exits).toHaveLength(1);
        expect(exits[0]).toEqual({ x: 4, y: 2, outX: 0, outY: -1 });
        expect(getNearestExit(exits, 0, 0)).toBe(exits[0]);
    });

    it("takes a stamp's floor only inside the walls, overlay or underlay", () => {
        const prefab = createRoom();
        // A step outside the door, and floor that's only an underlay indoors
        prefab.levels[0].overlays[4 + 1 * 9] = 5;
        prefab.levels[0].underlays[3 + 3 * 9] = 77;
        prefab.levels[0].overlays[3 + 4 * 9] = 5;
        const ground = new Ground(20, 20);
        ground.level0.underlays.fill(48);
        ground.stamp(prefab, 4, 4, {
            floor: "footprint",
            feather: 0,
            flatten: true,
            height: 10,
            keepUnderlays: true,
        });
        expect(ground.level0.overlays[ground.tile(7, 8)]).toBe(5);
        expect(ground.level0.underlays[ground.tile(7, 7)]).toBe(77);
        expect(ground.level0.overlays[ground.tile(8, 5)]).toBe(0);
        expect(ground.reserved[ground.tile(7, 7)]).toBe(1);
        expect(ground.reserved[ground.tile(8, 5)]).toBe(0);
    });
});

describe("smoothPath", () => {
    it("rounds a corner off and leaves the ends where they are", () => {
        const path: Point[] = [];
        for (let i = 0; i <= 10; i++) {
            path.push({ x: i, y: 0 });
        }
        for (let i = 1; i <= 10; i++) {
            path.push({ x: 10, y: i });
        }
        const smooth = smoothPath(path, 3, 3);
        expect(smooth[0]).toEqual(path[0]);
        expect(smooth[smooth.length - 1]).toEqual(path[path.length - 1]);
        // Pulled in from the corner
        expect(Math.hypot(smooth[10].x - 10, smooth[10].y)).toBeGreaterThan(1);
    });

    it("leaves a pinned stretch dead straight", () => {
        const path: Point[] = [];
        for (let i = 0; i <= 10; i++) {
            path.push({ x: i, y: 0 });
        }
        for (let i = 1; i <= 10; i++) {
            path.push({ x: 10, y: i });
        }
        const smooth = smoothPath(path, 3, 3, 8);
        expect(smooth.slice(0, 8)).toEqual(path.slice(0, 8));
        expect(smooth[10]).not.toEqual(path[10]);
    });
});

describe("Ground", () => {
    it("draws a straight shore as one straight line, wherever it falls in a tile", () => {
        for (const offset of [0, 0.1, 0.2, 0.25, 0.3, 0.5, 0.7, 0.75, 0.8, 0.9]) {
            const ground = new Ground(20, 20);
            const field = new Float32Array(21 * 21);
            for (let y = 0; y <= 20; y++) {
                for (let x = 0; x <= 20; x++) {
                    field[x + y * 21] = 10 + offset - y;
                }
            }
            ground.paintField(field, 6, true);
            const { overlays, shapes, rotations } = ground.level0;
            for (let y = 0; y < 20; y++) {
                const looks = new Set<string>();
                for (let x = 0; x < 20; x++) {
                    const i = ground.tile(x, y);
                    looks.add(`${overlays[i]}:${shapes[i]}:${rotations[i]}`);
                }
                expect(looks.size, `offset ${offset}, row ${y}`).toBe(1);
            }
        }
    });

    it("turns a shallow slope into a few clean steps, not teeth", () => {
        const ground = new Ground(60, 20);
        const field = new Float32Array(61 * 21);
        for (let y = 0; y <= 20; y++) {
            for (let x = 0; x <= 60; x++) {
                field[x + y * 61] = 5 + x * 0.1 - y;
            }
        }
        ground.paintField(field, 6, true);
        const { shapes, rotations } = ground.level0;
        // A rising line goes through each row's shapes once, so per row the shapes
        // make one run each, and never come back
        for (let y = 0; y < 20; y++) {
            const runs: string[] = [];
            for (let x = 0; x < 60; x++) {
                const i = ground.tile(x, y);
                const look = `${ground.level0.overlays[i]}:${shapes[i]}:${rotations[i]}`;
                if (runs[runs.length - 1] !== look) {
                    runs.push(look);
                }
            }
            expect(new Set(runs).size, `row ${y}`).toBe(runs.length);
        }
    });

    it("blocks tiles at least half covered, and leaves the rest to walk on", () => {
        const ground = new Ground(8, 8);
        const field = new Float32Array(81).fill(-1);
        // One corner, then a half tile
        field[2 + 2 * 9] = 1;
        field[6 + 2 * 9] = 1;
        field[6 + 3 * 9] = 1;
        ground.paintField(field, 6, true);
        const { flags, overlays } = ground.level0;
        expect(overlays[ground.tile(2, 2)]).toBe(6);
        expect(flags[ground.tile(2, 2)] & 1).toBe(0);
        expect(overlays[ground.tile(6, 2)]).toBe(6);
        expect(flags[ground.tile(6, 2)] & 1).toBe(1);
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
