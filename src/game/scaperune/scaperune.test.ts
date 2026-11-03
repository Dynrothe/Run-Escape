import { describe, expect, it } from "vitest";

import { SceneTileModel } from "../../rs/scene/SceneTileModel";
import { Ground } from "./Ground";
import { findExits, getInsideTiles, getNearestExit } from "./building";
import {
    SealRegion,
    assertReachable,
    findReachable,
    getCollisionFlags,
    sealFrom,
} from "./collision";
import {
    TILE_BLOCKED,
    TileGrid,
    createTileGrid,
    readLocs,
    readTerrain,
    writeLocs,
    writeTerrain,
} from "./format";
import { Point, smoothPath } from "./paths";
import { rotatePrefab } from "./prefab";
import type { LocInfo } from "./recipe";
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

describe("sealFrom", () => {
    // Two rooms, x 1-4 and x 6-10 by y 1-5, either side of a wall at x 5 with a doorway at
    // 5,3, and an open border round them that's in neither
    const WEST = { x0: 1, y0: 1, x1: 4, y1: 5 };
    const EAST = { x0: 6, y0: 1, x1: 10, y1: 5 };
    const locs = (): LocInfo => ({
        name: "",
        sizeX: 1,
        sizeY: 1,
        clipType: 1,
        blocksProjectile: true,
        drawn: true,
    });
    const tile = (x: number, y: number) => x + y * 12;
    function rooms(...blocked: [number, number][]): TileGrid {
        const grid = createTileGrid(12, 7);
        for (let y = 1; y <= 5; y++) {
            if (y !== 3) {
                grid.levels[0].flags[tile(5, y)] |= TILE_BLOCKED;
            }
        }
        for (const [x, y] of blocked) {
            grid.levels[0].flags[tile(x, y)] |= TILE_BLOCKED;
        }
        return grid;
    }
    const isBlocked = (grid: TileGrid, x: number, y: number) =>
        (grid.levels[0].flags[tile(x, y)] & TILE_BLOCKED) !== 0;
    const regions = (): SealRegion[] => [
        { name: "west", rect: WEST, from: { x: 2, y: 3 } },
        { name: "east", rect: EAST, from: { x: 8, y: 3 } },
    ];

    it("floods each room without leaving its rectangle", () => {
        const grid = rooms();
        const sealed = sealFrom(grid, locs, regions());
        expect(sealed.regions).toEqual([
            { name: "west", open: 20, sealed: 0 },
            { name: "east", open: 25, sealed: 0 },
        ]);
        // What's in neither is left alone, the doorway too
        expect(sealed.outside).toBe(0);
        expect(isBlocked(grid, 5, 3)).toBe(false);
        expect(isBlocked(grid, 0, 0)).toBe(false);
    });

    it("blocks everything outside every room, doorways and all", () => {
        const grid = rooms();
        const sealed = sealFrom(grid, locs, regions(), { outside: "block" });
        // The border's 34 tiles and the doorway
        expect(sealed.outside).toBe(35);
        expect(isBlocked(grid, 5, 3)).toBe(true);
        expect(isBlocked(grid, 0, 0)).toBe(true);
        expect(isBlocked(grid, 2, 3)).toBe(false);
        // So the west room no longer reaches the east one
        const all = { x0: 0, y0: 0, x1: 11, y1: 6 };
        const reached = findReachable(getCollisionFlags(grid, locs), 12, 7, all, 2, 3);
        expect(reached[tile(8, 3)]).toBe(0);
    });

    it("walks through a doorway inside one region", () => {
        const both = { x0: 1, y0: 1, x1: 10, y1: 5 };
        const sealed = sealFrom(rooms(), locs, [
            { name: "both", rect: both, from: { x: 2, y: 3 } },
        ]);
        expect(sealed.regions[0].open).toBe(46);
    });

    it("blocks what its start can't reach, and counts it", () => {
        // 4,5 in the west room's corner, shut in by three blocked tiles
        const grid = rooms([3, 5], [3, 4], [4, 4]);
        const sealed = sealFrom(grid, locs, regions());
        expect(sealed.regions[0]).toEqual({ name: "west", open: 16, sealed: 1 });
        expect(isBlocked(grid, 4, 5)).toBe(true);
        expect(isBlocked(grid, 4, 3)).toBe(false);
    });

    it("throws over maxSealed or under min, having blocked nothing", () => {
        const grid = rooms([3, 5], [3, 4], [4, 4]);
        const before = grid.levels[0].flags.slice();
        const strict = regions();
        strict[0].maxSealed = 0;
        expect(() => sealFrom(grid, locs, strict, { label: "Test" })).toThrow(
            "Test: west would seal 1 open tiles, over 0",
        );
        const small = regions();
        small[1].min = 26;
        expect(() => sealFrom(grid, locs, small, { outside: "block" })).toThrow(
            "east has 25 open tiles from 8,3, under 26",
        );
        expect(grid.levels[0].flags).toEqual(before);
    });

    it("says whether a point can be reached, and from which room", () => {
        const sealed = sealFrom(rooms(), locs, regions(), { outside: "block" });
        expect(() =>
            assertReachable(sealed, [
                { name: "spawn", x: 2, y: 3 },
                { name: "boss", x: 9.5, y: 4.5, region: "east" },
            ]),
        ).not.toThrow();
        expect(() =>
            assertReachable(sealed, [{ name: "boss", x: 9, y: 4, region: "west" }], "Test"),
        ).toThrow("Test: boss at 9,4 can't be reached from west's start");
        expect(() => assertReachable(sealed, [{ name: "door", x: 5, y: 3 }])).toThrow(
            "door at 5,3 can't be reached",
        );
        expect(() =>
            assertReachable(sealed, [{ name: "boss", x: 9, y: 4, region: "north" }]),
        ).toThrow("north, which isn't a region");
    });
});
