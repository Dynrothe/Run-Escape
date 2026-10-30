import { OBJECT_INSET } from "./ArenaGrid";
import { findFreeSpot, isCircleFree, moveCircle } from "./Collision";
import { makeGrid } from "./testGrid";

const R = 0.35;
// The smallest enemies'
const SMALL_R = 0.3;

describe("moveCircle", () => {
    test("moves freely in the open", () => {
        const grid = makeGrid([".....", ".....", "....."]);
        const pos = { x: 101.5, y: 201.5 };
        moveCircle(grid, pos, 1, 0, R);
        expect(pos.x).toBeCloseTo(102.5);
        expect(pos.y).toBeCloseTo(201.5);
    });

    test("stops at blocked floor", () => {
        const grid = makeGrid([".....", "...~.", "....."]);
        const pos = { x: 101.5, y: 201.5 };
        moveCircle(grid, pos, 3, 0, R);
        expect(pos.x).toBeCloseTo(103 - R);
    });

    test("stops a little short of an object's tile", () => {
        const grid = makeGrid([".....", "...#.", "....."]);
        const pos = { x: 101.5, y: 201.5 };
        moveCircle(grid, pos, 3, 0, R);
        expect(pos.x).toBeCloseTo(103 + OBJECT_INSET - R);
    });

    test("stops at a lone signpost's post, not its tile", () => {
        // Standing on 102.4 to 102.6
        const grid = makeGrid([".....", "..o..", "....."]);
        const pos = { x: 100.5, y: 201.5 };
        moveCircle(grid, pos, 3, 0, R);
        expect(pos.x).toBeCloseTo(102.4 - R);
    });

    test("walks past a big signpost, round its post", () => {
        // On four tiles, its post where they meet
        const grid = makeGrid([".......", ".......", ".......", "......."], 100, 200, [
            { x: 102, y: 201, sizeX: 2, sizeY: 2, stands: [102.9, 201.9, 103.1, 202.1] },
        ]);
        const pos = { x: 100.5, y: 201.3 };
        moveCircle(grid, pos, 4, 0, R);
        expect(pos.x).toBeCloseTo(104.5);
        expect(pos.y).toBeCloseTo(201.3);
    });

    test("objects next to each other keep their tiles", () => {
        const grid = makeGrid([".....", ".oo..", "....."]);
        const pos = { x: 100.5, y: 201.5 };
        moveCircle(grid, pos, 3, 0, R);
        expect(pos.x).toBeCloseTo(101 + OBJECT_INSET - R);
    });

    test("an object filling a gap in a wall keeps its tiles", () => {
        // Its post leaves room either side, but that would be a new way
        // through the wall
        const grid = makeGrid(["........", "###..###", "........"], 100, 200, [
            { x: 103, y: 201, sizeX: 2, sizeY: 1, stands: [103.9, 201.4, 104.1, 201.6] },
        ]);
        const pos = { x: 103.5, y: 200.5 };
        moveCircle(grid, pos, 0, 2, R);
        expect(pos.y).toBeCloseTo(201 + OBJECT_INSET - R);
    });

    test("walks through an invisible wall standing on its own", () => {
        const grid = makeGrid(["......", "..??..", "..?...", "......"]);
        expect(grid.isSolid(102, 202)).toBe(false);
        const pos = { x: 100.5, y: 202.5 };
        moveCircle(grid, pos, 4, 0, R);
        expect(pos.x).toBeCloseTo(104.5);
    });

    test("an invisible wall that shuts a way through stays", () => {
        // Walking through would be a new way from the south side to the north
        const grid = makeGrid([".......", "##???##", "......."]);
        expect(grid.isSolid(103, 201)).toBe(true);
        const pos = { x: 103.5, y: 200.5 };
        moveCircle(grid, pos, 0, 2, R);
        expect(pos.y).toBeCloseTo(201 + OBJECT_INSET - R);
    });

    test("scenery next to an invisible wall keeps its tile", () => {
        const grid = makeGrid([".....", ".?o..", "....."]);
        expect(grid.isSolid(101, 201)).toBe(false);
        const pos = { x: 100.5, y: 201.5 };
        moveCircle(grid, pos, 3, 0, R);
        expect(pos.x).toBeCloseTo(102 + OBJECT_INSET - R);
    });

    test("can't slip between objects touching at a corner", () => {
        // Objects on (101, 201) and (102, 202), touching at (102, 202)
        const grid = makeGrid([".....", "..#..", ".#...", "....."]);
        const pos = { x: 101.5, y: 202.5 };
        moveCircle(grid, pos, 1, -1, SMALL_R);
        expect(pos.x).toBeLessThan(102);
        expect(pos.y).toBeGreaterThan(202);
    });

    test("never ends up with its centre in an object's tile", () => {
        // Heading for the object's corner, on (102, 201)
        const grid = makeGrid([".....", "..#..", "....."]);
        const pos = { x: 101.5, y: 200.5 };
        for (let i = 0; i < 20; i++) {
            moveCircle(grid, pos, 0.05, 0.05, SMALL_R);
            expect(grid.isSolid(Math.floor(pos.x), Math.floor(pos.y))).toBe(false);
        }
    });

    test("stops at a wall on the tile edge", () => {
        const grid = makeGrid([".....", ".|...", "....."]);
        const pos = { x: 101.2, y: 201.5 };
        moveCircle(grid, pos, 2, 0, R);
        expect(pos.x).toBeCloseTo(102 - R);
    });

    test("slides along a wall when moving diagonally", () => {
        // The wall runs along the north edge of row y=201, the line y=202
        const grid = makeGrid([".....", ".....", "_____", "....."]);
        const pos = { x: 101.5, y: 201.2 };
        moveCircle(grid, pos, 1, 1, R);
        expect(pos.y).toBeCloseTo(202 - R);
        expect(pos.x).toBeCloseTo(102.5);
    });

    test("fits through a one tile gap", () => {
        const grid = makeGrid(["#.#", "#.#", "#.#"]);
        const pos = { x: 101.5, y: 200.5 };
        moveCircle(grid, pos, 0, 2, R);
        expect(pos.y).toBeCloseTo(202.5);
        expect(pos.x).toBeCloseTo(101.5);
    });

    test("does not tunnel through a wall on a fast move", () => {
        const grid = makeGrid([".....", ".|...", "....."]);
        const pos = { x: 101.5, y: 201.5 };
        moveCircle(grid, pos, 3, 0, R);
        expect(pos.x).toBeLessThan(102);
    });

    test("treats outside the grid as solid", () => {
        const grid = makeGrid(["...", "...", "..."]);
        const pos = { x: 100.5, y: 201.5 };
        moveCircle(grid, pos, -2, 0, R);
        expect(pos.x).toBeCloseTo(100 + R);
    });
});

describe("isCircleFree", () => {
    test("detects overlap", () => {
        const grid = makeGrid(["...", ".#.", "..."]);
        expect(isCircleFree(grid, 100.5, 200.5, R)).toBe(true);
        expect(isCircleFree(grid, 101.5, 201.5, R)).toBe(false);
        expect(isCircleFree(grid, 100.9, 201.5, R)).toBe(false);
        // Clear of the object, though inside a tile's width of it
        expect(isCircleFree(grid, 100.8, 201.5, R)).toBe(true);
    });

    test("objects side by side block the whole way along", () => {
        // Objects on (101, 201) and (102, 201): no gap where they meet
        const grid = makeGrid(["....", ".##.", "...."]);
        expect(isCircleFree(grid, 102, 201 + OBJECT_INSET - R + 0.05, R)).toBe(false);
    });
});

describe("findFreeSpot", () => {
    test("leaves a free spot alone", () => {
        const grid = makeGrid(["...", ".#.", "..."]);
        expect(findFreeSpot(grid, 100.6, 200.5, R)).toEqual({ x: 100.6, y: 200.5 });
    });

    test("out of something solid to the nearest tile centre", () => {
        const grid = makeGrid(["...", ".#.", "..."]);
        expect(findFreeSpot(grid, 101.9, 201.5, R)).toEqual({ x: 102.5, y: 201.5 });
    });

    test("stays on its own side of a wall", () => {
        // Too close to the wall between the tiles, on the east side of it
        const grid = makeGrid(["|.."]);
        expect(findFreeSpot(grid, 101.1, 200.5, R)).toEqual({ x: 101.5, y: 200.5 });
    });

    test("skips tiles it's told to", () => {
        const grid = makeGrid(["...", ".#.", "..."]);
        const spot = findFreeSpot(grid, 101.9, 201.5, R, (tileX) => tileX !== 102);
        expect(spot).toEqual({ x: 101.5, y: 200.5 });
    });

    test("stays put if there's nowhere to go", () => {
        const grid = makeGrid(["###"]);
        expect(findFreeSpot(grid, 101.5, 200.5, R)).toEqual({ x: 101.5, y: 200.5 });
    });
});
