import { describe, expect, it } from "vitest";

import { Ground } from "./Ground";
import { getCollisionFlags, getLocBlocking, getLocSize } from "./collision";
import {
    PlacedLoc,
    TILE_BRIDGE,
    TILE_SHOWN,
    TileGrid,
    createTileGrid,
    writeLocs,
    writeTerrain,
} from "./format";
import { Placer, findSolidOverlaps } from "./placer";
import { skipBlocking } from "./prefabs";
import type { BuildContext, LocInfo } from "./recipe";
import { cutRug } from "./rug";

// Made-up locs, by id: what the cache would say about each
const LOCS: Record<number, Partial<LocInfo>> = {
    1: { name: "Crate" },
    2: { name: "Statue", sizeX: 2, sizeY: 2 },
    3: { name: "Table", sizeX: 2, sizeY: 1 },
    4: { name: "Door" },
    5: { name: "Wall" },
    6: { name: "Patterned floor", clipType: 2 },
    7: { name: "Spikes", clipType: 1 },
    8: { name: "Candle", clipType: 0 },
    9: { name: "Nothing", drawn: false },
    10: { name: "Big tree", sizeX: 3, sizeY: 3 },
};
const getLoc = (id: number): LocInfo => ({
    name: String(id),
    sizeX: 1,
    sizeY: 1,
    clipType: 2,
    blocksProjectile: true,
    drawn: true,
    ...LOCS[id],
});
const context: Pick<BuildContext, "locs"> = { locs: getLoc };
const loc = (id: number, type: number, x: number, y: number, rest: Partial<PlacedLoc> = {}) => ({
    id,
    type,
    rotation: 0,
    level: 0,
    x,
    y,
    ...rest,
});

describe("getLocBlocking", () => {
    it("says what blocks by getCollisionFlags' own rules", () => {
        // Every type, at every clip, drawn or not, on a grid of its own
        for (let type = 0; type <= 22; type++) {
            for (const clipType of [0, 1, 2]) {
                for (const drawn of [true, false]) {
                    const grid = createTileGrid(4, 4);
                    grid.locs.push(loc(1, type, 1, 1));
                    const info = { ...getLoc(1), clipType, drawn };
                    const flags = getCollisionFlags(grid, () => info);
                    const blocking = getLocBlocking(type, info);
                    const label = `type ${type}, clip ${clipType}, drawn ${drawn}`;
                    // OBJECT or FLOOR_DECORATION on the tile itself
                    expect((flags[1 + 4] & 0x40100) !== 0, label).toBe(blocking === "tiles");
                    // Anything at all, walls' edges included
                    expect(
                        flags.some((f) => f !== 0),
                        label,
                    ).toBe(blocking !== undefined);
                }
            }
        }
    });

    it("turns a loc's size with it, but not floor decoration's", () => {
        expect(getLocSize({ type: 10, rotation: 1 }, { sizeX: 2, sizeY: 1 })).toEqual([1, 2]);
        expect(getLocSize({ type: 10, rotation: 2 }, { sizeX: 2, sizeY: 1 })).toEqual([2, 1]);
        expect(getLocSize({ type: 22, rotation: 1 }, { sizeX: 2, sizeY: 3 })).toEqual([1, 1]);
    });
});

describe("Placer", () => {
    const create = (size = 12) => {
        const ground = new Ground(size, size);
        return { ground, placer: new Placer(ground, { rng: () => 0.5, locs: getLoc }) };
    };

    it("keeps solid things off each other, but stands them on painted floor", () => {
        const { ground, placer } = create();
        const painted = new Uint8Array(12 * 12).fill(1);
        ground.paintOverlay(painted, 6, false);
        expect(ground.reserved[ground.tile(4, 4)]).toBe(1);
        expect(ground.occupied[ground.tile(4, 4)]).toBe(0);
        expect(placer.solid(2, 4, 4)).toBe(true);
        expect(ground.occupied[ground.tile(5, 5)]).toBe(1);
        // A tile of the statue, from each side
        expect(placer.solid(1, 5, 5)).toBe(false);
        expect(placer.solid(10, 2, 2)).toBe(false);
        expect(placer.solid(1, 6, 6)).toBe(true);
        expect(findSolidOverlaps(ground.grid, getLoc)).toEqual([]);
    });

    it("turns a loc's size with it", () => {
        const { ground, placer } = create();
        // A table two tiles across, turned to run north to south over 3,3 and 3,4
        expect(placer.getSize(3, 1)).toEqual([1, 2]);
        expect(placer.solid(3, 3, 3, { rotation: 1 })).toBe(true);
        expect(ground.occupied[ground.tile(3, 4)]).toBe(1);
        expect(ground.occupied[ground.tile(4, 3)]).toBe(0);
        expect(placer.solid(1, 4, 3)).toBe(true);
        expect(placer.solid(1, 3, 4)).toBe(false);
        expect(ground.grid.locs[0]).toMatchObject({ id: 3, type: 10, rotation: 1, x: 3, y: 3 });
    });

    it("takes sizes from a table over the cache's, and wants one or the other", () => {
        const ground = new Ground(12, 12);
        const placer = new Placer(ground, { rng: () => 0, sizes: [[3, 3, 1]] });
        expect(placer.getSize(3)).toEqual([3, 1]);
        expect(placer.getSize(3, 3)).toEqual([1, 3]);
        expect(() => placer.getSize(1)).toThrow(/no size for loc 1/);
        const both = new Placer(ground, { rng: () => 0, locs: getLoc, sizes: [[3, 3, 1]] });
        expect(both.getSize(3)).toEqual([3, 1]);
        expect(both.getSize(2)).toEqual([2, 2]);
    });

    it("refuses zones, unless a placement's allowed on one", () => {
        const { placer } = create();
        placer.refuse("arena", (x) => x >= 6).refuse("gateway", (x, y) => y === 0);
        // Its east tile's on the arena
        expect(placer.solid(2, 5, 3)).toBe(false);
        expect(placer.solid(2, 4, 3)).toBe(true);
        expect(placer.solid(1, 2, 0)).toBe(false);
        expect(placer.solid(1, 2, 0, { allow: ["gateway"] })).toBe(true);
        expect(placer.solid(1, 8, 0, { allow: ["gateway"] })).toBe(false);
        expect(placer.dress(8, 3, 0, { type: 10 })).toBe(false);
        expect(placer.dress(8, 3, 0, { type: 10, allow: ["gateway"] })).toBe(true);
        expect(placer.report().get("1")!.refused).toEqual({ gateway: 1, arena: 1 });
    });

    it("keeps a gap round something that asks for one", () => {
        const { placer } = create();
        expect(placer.solid(1, 5, 5)).toBe(true);
        expect(placer.solid(1, 6, 6, { gap: 1 })).toBe(false);
        expect(placer.solid(1, 7, 7, { gap: 1 })).toBe(true);
        // The gap's own tiles mustn't leave the grid either
        expect(placer.solid(1, 0, 3, { gap: 1 })).toBe(false);
    });

    it("dresses one to a tile, never under or over something solid", () => {
        const { ground, placer } = create();
        expect(placer.solid(2, 2, 2)).toBe(true);
        expect(placer.dress(8, 3, 3, { type: 10 })).toBe(false);
        expect(placer.dress(8, 5, 5, { type: 22 })).toBe(true);
        expect(placer.dress(6, 5, 5, { type: 22 })).toBe(false);
        expect(placer.solid(1, 5, 5)).toBe(false);
        // Dressing leaves the tile free of anything solid, and turns at random when not told
        expect(ground.occupied[ground.tile(5, 5)]).toBe(0);
        expect(ground.grid.locs[1]).toMatchObject({ id: 8, type: 22, rotation: 2 });
    });

    it("keeps off buildings and what a stamp brought that blocks", () => {
        const ground = new Ground(16, 16);
        const placer = new Placer(ground, { rng: () => 0, locs: getLoc });
        const prefab = createTileGrid(6, 6);
        prefab.locs.push(
            loc(2, 10, 1, 1),
            loc(6, 22, 4, 4),
            loc(8, 10, 4, 1),
            loc(1, 10, 1, 4, { level: 1 }),
        );
        ground.stamp(prefab, 0, 0, { floor: "all", feather: 0, flatten: true, locs: getLoc });
        // The statue blocks; the patterned floor, the candle and what's upstairs don't
        expect(placer.solid(1, 2, 2)).toBe(false);
        expect(placer.solid(1, 4, 4)).toBe(true);
        expect(placer.solid(1, 4, 1)).toBe(true);
        expect(placer.solid(1, 1, 4)).toBe(true);
        ground.footprint[ground.tile(10, 10)] = 1;
        expect(placer.solid(1, 10, 10)).toBe(false);
        expect(placer.report().get("1")!.refused).toEqual({ occupied: 1, building: 1 });
        // And a stamp without locs leaves occupied as it was
        const plain = new Ground(16, 16);
        plain.stamp(prefab, 0, 0, { floor: "all", feather: 0, flatten: true });
        expect(plain.occupied.every((v) => v === 0)).toBe(true);
    });

    it("counts what was asked for against what was placed", () => {
        const { placer } = create();
        placer.refuse("arena", (x) => x >= 6);
        placer.solid(2, 1, 1, { kind: "statue" });
        placer.solid(2, 2, 2, { kind: "statue" });
        placer.solid(2, 8, 8, { kind: "statue" });
        let next = 0;
        const spots: [number, number][] = [
            [0, 6],
            [0, 6],
            [1, 6],
            [9, 9],
            [2, 6],
        ];
        const placed = placer.scatter(
            "crates",
            3,
            () => spots[next++ % spots.length],
            (x, y) => placer.solid(1, x, y),
            5,
        );
        expect(placed).toBe(3);
        placer.scatter(
            "more crates",
            2,
            () => [9, 9],
            (x, y) => placer.solid(1, x, y),
            4,
        );
        const report = placer.report();
        expect(report.get("statue")).toEqual({
            requested: 3,
            placed: 1,
            refused: { occupied: 1, arena: 1 },
        });
        expect(report.get("crates")).toMatchObject({ requested: 3, placed: 3 });
        expect(report.get("more crates")).toEqual({
            requested: 2,
            placed: 0,
            refused: { "gave up": 2 },
        });
        // The crates' own tries, each counted under the loc
        expect(report.get("1")).toEqual({
            requested: 9,
            placed: 3,
            refused: { occupied: 1, arena: 5 },
        });
        expect(placer.describeShortfalls()).toEqual([
            "statue: 1 of 3 (1 occupied, 1 arena)",
            "1: 3 of 9 (1 occupied, 5 arena)",
            "more crates: 0 of 2 (2 gave up)",
        ]);
    });

    it("throws for a loc off a whole tile", () => {
        const { ground, placer } = create();
        expect(() => placer.solid(1, 2.5, 3)).toThrow(/whole tile/);
        expect(() => placer.dress(8, 2, 3.5, { type: 10 })).toThrow(/whole tile/);
        expect(() => ground.place(loc(1, 10, 1, 0.5), 1, 1)).toThrow(/whole tile/);
        expect(() => placer.standIn(1, 2, 0.5)).toThrow(/whole tile/);
    });

    // The Owl's Court's crossbowmen and fire jets, which the fight draws and animates
    it("takes a stand-in's tiles and blocks them, but leaves it out of the map", () => {
        const { ground, placer } = create();
        const blocked = (x: number, y: number) => ground.level0.flags[ground.tile(x, y)] & 1;
        // A table turned a quarter: 1 across, 2 deep
        expect(placer.standIn(3, 4, 4, { rotation: 1, kind: "statues" })).toBe(true);
        expect(ground.grid.locs).toEqual([]);
        expect(placer.standIns).toEqual([loc(3, 10, 4, 4, { rotation: 1 })]);
        expect([blocked(4, 4), blocked(4, 5), blocked(5, 4)]).toEqual([1, 1, 0]);
        expect(ground.occupied[ground.tile(4, 5)]).toBe(1);
        // Nothing solid goes on it after, and walked through it's taken but open
        expect(placer.solid(1, 4, 5)).toBe(false);
        expect(placer.standIn(8, 6, 6, { walkThrough: true, kind: "fire" })).toBe(true);
        expect(blocked(6, 6)).toBe(0);
        expect(placer.dress(8, 6, 6, { type: 10 })).toBe(false);
        // Not on something solid, nor ground that's already blocked
        placer.solid(1, 8, 8);
        expect(placer.standIn(1, 8, 8, { kind: "statues" })).toBe(false);
        ground.level0.flags[ground.tile(9, 9)] |= 1;
        expect(placer.standIn(1, 9, 9, { kind: "statues" })).toBe(false);
        expect(placer.describeShortfalls()).toEqual([
            "statues: 1 of 3 (1 occupied, 1 blocked)",
            "1: 1 of 2 (1 occupied)",
            "8: 0 of 1 (1 occupied)",
        ]);
    });
});

describe("findSolidOverlaps", () => {
    it("finds tiles two solid locs stand on, each once", () => {
        const grid = createTileGrid(8, 8);
        grid.locs.push(
            // A table across 1,1 and 2,1, and a statue over 2,1 2,2 3,1 3,2
            loc(3, 10, 1, 1),
            loc(2, 10, 2, 1),
            // A crate on the statue too, so 3,2 has three
            loc(1, 10, 3, 2),
            loc(1, 11, 3, 2),
        );
        expect(findSolidOverlaps(grid, getLoc).sort((a, b) => a - b)).toEqual([2 + 8, 3 + 2 * 8]);
    });

    it("turns sizes, and leaves out what doesn't block or isn't on the ground", () => {
        const grid = createTileGrid(8, 8);
        grid.locs.push(
            // The table turned runs north to south, so the crate east of it is clear
            loc(3, 10, 1, 1, { rotation: 1 }),
            loc(1, 10, 2, 1),
            // Under a crate: a patterned floor, a candle, an empty loc, a wall, one upstairs
            loc(1, 10, 5, 5),
            loc(6, 22, 5, 5),
            loc(8, 10, 5, 5),
            loc(9, 10, 5, 5),
            loc(5, 0, 5, 5),
            loc(1, 10, 5, 5, { level: 1 }),
        );
        expect(findSolidOverlaps(grid, getLoc)).toEqual([]);
        // Spikes block, as does a level-1 crate where level 1's the ground (a bridge)
        grid.locs.push(loc(7, 22, 5, 5));
        expect(findSolidOverlaps(grid, getLoc)).toEqual([5 + 5 * 8]);
        grid.levels[1].flags[6 + 1 * 8] |= TILE_BRIDGE;
        grid.locs.push(loc(1, 10, 6, 1), loc(1, 10, 6, 1, { level: 1 }));
        expect(findSolidOverlaps(grid, getLoc)).toEqual([5 + 5 * 8]);
        grid.locs.push(loc(1, 10, 6, 1, { level: 1 }));
        expect(findSolidOverlaps(grid, getLoc)).toEqual([5 + 5 * 8, 6 + 1 * 8]);
    });
});

describe("skipBlocking", () => {
    const at = (id: number, type: number, rest: Partial<PlacedLoc> = {}) =>
        loc(id, type, 1, 1, rest);

    it("takes doors off, and one-tile props that block, by the collision's rules", () => {
        const skip = skipBlocking(context, { doors: true, props: "one-tile" });
        expect(skip(at(4, 0))).toBe(true);
        expect(skip(at(5, 0))).toBe(false);
        // A crate goes, a statue (2 by 2) stays
        expect(skip(at(1, 10))).toBe(true);
        expect(skip(at(1, 11))).toBe(true);
        expect(skip(at(2, 10))).toBe(false);
        // Floor decoration only blocks at clip 1: a patterned floor stays
        expect(skip(at(6, 22))).toBe(false);
        expect(skip(at(7, 22))).toBe(true);
        // What doesn't block stays: clip 0, or no model
        expect(skip(at(8, 10))).toBe(false);
        expect(skip(at(9, 10))).toBe(false);
        // A diagonal wall's a wall, and wall decoration and roofs never block
        expect(skip(at(1, 9))).toBe(false);
        expect(skip(at(1, 4))).toBe(false);
        expect(skip(at(1, 12))).toBe(false);
        // Upstairs doesn't block the ground
        expect(skip(at(1, 10, { level: 1 }))).toBe(false);
    });

    it("leaves doors alone unless asked, and takes every size of prop if asked", () => {
        const all = skipBlocking(context, { props: "all" });
        expect(all(at(4, 0))).toBe(false);
        expect(all(at(2, 10))).toBe(true);
        expect(all(at(10, 10))).toBe(true);
        const doors = skipBlocking(context, { doors: true });
        expect(doors(at(4, 0))).toBe(true);
        expect(doors(at(1, 10))).toBe(false);
    });

    it("counts a loc on a bridge's level as on the ground, given the cut", () => {
        const prefab = createTileGrid(4, 4);
        prefab.levels[1].flags[1 + 4] |= TILE_BRIDGE;
        const skip = skipBlocking(context, { props: "one-tile", prefab });
        expect(skip(at(1, 10, { level: 1 }))).toBe(true);
        // Under the bridge's the river, not the ground
        expect(skip(at(1, 10))).toBe(false);
    });
});

describe("cutRug", () => {
    // A map square of floor 7 at height 20, with a raised pad and a bridge on it
    const square = createTileGrid(64, 64);
    const floor = square.levels[0];
    floor.heights.fill(20);
    floor.overlays.fill(7);
    floor.underlays.fill(3);
    floor.flags[4 + 4 * 64] = 1;
    for (const [x, y] of [
        [6, 6],
        [7, 6],
        [6, 7],
        [7, 7],
    ]) {
        floor.heights[x + y * 65] = 60;
    }
    // Something drawn from upstairs at 3,8; a bridge over 8,3; level 1's own floor at 2,2
    square.levels[1].flags[3 + 8 * 64] = TILE_SHOWN;
    square.levels[1].flags[8 + 3 * 64] = TILE_BRIDGE;
    square.levels[1].overlays[2 + 2 * 64] = 9;
    square.locs.push(
        loc(6, 22, 3, 3),
        loc(7, 22, 3, 4),
        loc(1, 10, 3, 5),
        loc(5, 0, 3, 6),
        loc(6, 22, 6, 6),
        loc(6, 22, 2, 2, { level: 1 }),
    );
    const data = { terrain: writeTerrain(square, 0, 0), locs: writeLocs(square, 0, 0) };
    const rugContext: Pick<BuildContext, "maps" | "locs"> = {
        maps: { getTerrainData: () => data.terrain, getLocData: () => data.locs },
        locs: getLoc,
    };
    const tile = (rug: TileGrid, x: number, y: number) => x - 1 + (y - 1) * rug.sizeX;

    it("keeps only floor and floor decoration that's walked on, on flat tiles of its level", () => {
        const rug = cutRug(
            rugContext,
            { worldX: 1, worldY: 1, sizeX: 10, sizeY: 10 },
            { maxStep: 4 },
        );
        const { overlays, underlays, flags } = rug.levels[0];
        expect(overlays[tile(rug, 2, 2)]).toBe(7);
        expect(underlays[tile(rug, 2, 2)]).toBe(3);
        // Nothing blocks on a rug
        expect(overlays[tile(rug, 4, 4)]).toBe(7);
        expect(flags.every((f) => f === 0)).toBe(true);
        // The pad and every tile touching its corners are left out
        for (const [x, y] of [
            [5, 5],
            [6, 6],
            [7, 7],
            [7, 5],
        ]) {
            expect(overlays[tile(rug, x, y)], `${x},${y}`).toBe(0);
        }
        expect(overlays[tile(rug, 8, 8)]).toBe(7);
        // As is what's another level's: under the bridge, and under what's drawn from upstairs
        expect(overlays[tile(rug, 8, 3)]).toBe(0);
        expect(overlays[tile(rug, 3, 8)]).toBe(0);
        // The patterned floor stays; the spikes, the crate, the wall, and the floor on the
        // pad don't
        expect(rug.locs).toEqual([loc(6, 22, 2, 2)]);
    });

    it("lets more through with a bigger step, and comes down from another plane", () => {
        const loose = cutRug(
            rugContext,
            { worldX: 1, worldY: 1, sizeX: 10, sizeY: 10 },
            {
                maxStep: 40,
            },
        );
        expect(loose.levels[0].overlays[tile(loose, 6, 6)]).toBe(7);
        const upstairs = cutRug(
            rugContext,
            { worldX: 1, worldY: 1, sizeX: 10, sizeY: 10 },
            { plane: 1, maxStep: 4 },
        );
        expect(upstairs.levels[0].overlays[tile(upstairs, 2, 2)]).toBe(9);
        expect(upstairs.levels[0].overlays[tile(upstairs, 4, 4)]).toBe(0);
        expect(upstairs.levels[1].overlays.every((v) => v === 0)).toBe(true);
        expect(upstairs.locs).toEqual([loc(6, 22, 1, 1)]);
    });
});

describe("whole tiles", () => {
    it("won't write a loc off a whole tile", () => {
        const grid = createTileGrid(64, 64);
        grid.locs.push(loc(1, 10, 3, 4));
        expect(() => writeLocs(grid, 0, 0)).not.toThrow();
        grid.locs.push(loc(1, 10, 3.5, 4));
        expect(() => writeLocs(grid, 0, 0)).toThrow(/whole tile/);
        // Only what's on the square being written counts
        expect(() => writeLocs(grid, 64, 0)).not.toThrow();
    });
});
