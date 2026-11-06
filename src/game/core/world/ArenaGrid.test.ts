import { CollisionFlag } from "../../../rs/pathfinder/flag/CollisionFlag";
import { ArenaGrid } from "./ArenaGrid";
import { isCircleFree, moveCircle } from "./Collision";
import { NOWHERE, TestLoc, makeGrid } from "./testGrid";

const OPEN = Array<string>(7).fill("........");
const ROCK: TestLoc = {
    x: 102,
    y: 201,
    sizeX: 4,
    sizeY: 4,
    stands: [102.6, 201.6, 105.4, 204.4],
};
const TOP: TestLoc = {
    x: 103,
    y: 202,
    sizeX: 2,
    sizeY: 2,
    stands: [103.1, 202.1, 104.9, 203.9],
};

function box(grid: ArenaGrid, x: number, y: number) {
    return grid.getSolidBox(x, y, { x0: 0, y0: 0, x1: 0, y1: 0 });
}

describe("overlapping scenery", () => {
    test("fits the exposed sides of a rock and its overlapping base", () => {
        const grid = makeGrid(OPEN, 100, 200, [ROCK, TOP]);
        expect(box(grid, 102, 202).x0).toBeCloseTo(102.6);
        expect(box(grid, 105, 202).x1).toBeCloseTo(105.4);
        expect(box(grid, 103, 201).y0).toBeCloseTo(201.6);
        expect(box(grid, 103, 204).y1).toBeCloseTo(204.4);
        const pos = { x: 107, y: 202.5 };
        moveCircle(grid, pos, -3, 0, 0.35);
        expect(pos.x).toBeCloseTo(105.75);
        expect(isCircleFree(grid, 105.76, 202.5, 0.35)).toBe(true);
        expect(isCircleFree(grid, 105.74, 202.5, 0.35)).toBe(false);
    });

    test("takes the union, not just the top or last model", () => {
        const wider: TestLoc = { ...TOP, sizeX: 3, stands: [103.1, 202.1, 105.7, 203.9] };
        const first = makeGrid(OPEN, 100, 200, [ROCK, wider]);
        const last = makeGrid(OPEN, 100, 200, [wider, ROCK]);
        expect(box(first, 105, 202).x1).toBeCloseTo(105.7);
        expect(box(first, 105, 202)).toEqual(box(last, 105, 202));
    });

    test("joins overlaps transitively", () => {
        const left: TestLoc = {
            x: 101,
            y: 202,
            sizeX: 2,
            sizeY: 2,
            stands: [101.6, 202.4, 102.5, 203.6],
        };
        const right: TestLoc = {
            x: 104,
            y: 202,
            sizeX: 2,
            sizeY: 2,
            stands: [104.5, 202.4, 105.4, 203.6],
        };
        const middle: TestLoc = {
            x: 102,
            y: 202,
            sizeX: 3,
            sizeY: 2,
            stands: [102.5, 202.4, 104.5, 203.6],
        };
        const grid = makeGrid(OPEN, 100, 200, [left, right, middle]);
        expect(box(grid, 101, 202).x0).toBeCloseTo(101.6);
        expect(box(grid, 105, 202).x1).toBeCloseTo(105.4);
        expect(box(grid, 102, 202).x1).toBe(103);
        expect(box(grid, 103, 202).x0).toBe(103);
    });

    test.each([undefined, NOWHERE])(
        "keeps a group's tiles if a model is unknown or invisible: %s",
        (stands) => {
            const grid = makeGrid(OPEN, 100, 200, [ROCK, { ...TOP, stands }]);
            expect(box(grid, 105, 202).x1).toBeCloseTo(105.8);
        },
    );

    test("leaves water and walls on an overlapping tile alone", () => {
        const grid = makeGrid(OPEN, 100, 200, [ROCK, TOP]);
        for (const flag of [
            CollisionFlag.FLOOR,
            CollisionFlag.FLOOR_DECORATION,
            CollisionFlag.WALL_EAST,
        ]) {
            const flags = grid.data.collisionFlags.slice();
            flags[5 + 2 * grid.sizeX] |= flag;
            const blocked = new ArenaGrid({ ...grid.data, collisionFlags: flags });
            const bounds = box(blocked, 105, 202);
            expect(bounds.x1).toBeCloseTo(flag === CollisionFlag.FLOOR_DECORATION ? 105.8 : 106);
        }
    });

    test("keeps shared faces and corner contacts with neighbouring blockers", () => {
        const rows = [...OPEN];
        rows[OPEN.length - 1 - 2] = "......#.";
        const grid = makeGrid(rows, 100, 200, [ROCK, TOP]);
        for (const y of [201, 202, 203]) {
            expect(box(grid, 105, y).x1).toBe(106);
        }
        expect(box(grid, 106, 202).x0).toBe(106);
        expect(box(grid, 105, 204).x1).toBeCloseTo(105.4);
    });

    test("does not open a passage through overlapping objects in a wall", () => {
        const grid = makeGrid(["........", "###..###", "........"], 100, 200, [
            { x: 103, y: 201, sizeX: 2, sizeY: 1, stands: [103.8, 201.4, 104.2, 201.6] },
            { x: 103, y: 201, sizeX: 1, sizeY: 1, stands: [103.8, 201.4, 104, 201.6] },
        ]);
        for (let x = 102.5; x <= 105.5; x += 0.1) {
            const pos = { x, y: 200.5 };
            moveCircle(grid, pos, 0, 2, 0.3);
            expect(pos.y).toBeLessThan(201.5);
        }
    });

    test("does not pull apart neighbouring groups with bases on opposite sides", () => {
        const low: TestLoc = {
            x: 102,
            y: 201,
            sizeX: 1,
            sizeY: 1,
            stands: [102.1, 201.05, 102.9, 201.2],
        };
        const high: TestLoc = {
            x: 103,
            y: 201,
            sizeX: 1,
            sizeY: 1,
            stands: [103.1, 201.8, 103.9, 201.95],
        };
        const grid = makeGrid(OPEN, 100, 200, [low, low, high, high]);
        expect(box(grid, 102, 201).y1).toBeCloseTo(201.8);
        expect(box(grid, 103, 201).y0).toBeCloseTo(201.2);
        const pos = { x: 103, y: 200.5 };
        moveCircle(grid, pos, 0, 2, 0.3);
        expect(pos.y).toBeLessThan(201);
    });

    test("GWD entrance rock no longer blocks half a tile beyond its eastern base", () => {
        const grid = makeGrid(Array<string>(9).fill("........"), 2879, 5310, [
            { x: 2881, y: 5313, sizeX: 3, sizeY: 3, stands: [2881, 5313.0625, 2883.96875, 5316] },
            {
                x: 2880,
                y: 5312,
                sizeX: 5,
                sizeY: 5,
                stands: [2880.6328125, 5312.53125, 2884.265625, 5316.3671875],
            },
            {
                x: 2880,
                y: 5316,
                sizeX: 2,
                sizeY: 2,
                stands: [2880, 5316.0078125, 2881.9921875, 5317.9921875],
            },
        ]);
        const pos = { x: 2886, y: 5314.5 };
        moveCircle(grid, pos, -3, 0, 0.35);
        expect(pos.x).toBeCloseTo(2884.265625 + 0.35);
        expect(grid.isSolid(2884, 5314)).toBe(true);
    });
});
