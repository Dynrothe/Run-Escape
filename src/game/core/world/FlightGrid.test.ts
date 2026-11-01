import { describe, expect, test } from "vitest";

import { FlightGrid } from "./FlightGrid";
import { makeGrid } from "./testGrid";

// makeGrid's base, and rows from the north
const BASE_X = 100;
const BASE_Y = 200;

function isWall(rows: string[], column: number, row: number): boolean {
    const grid = makeGrid(rows, BASE_X, BASE_Y);
    return new FlightGrid(grid).isSolid(BASE_X + column, BASE_Y + rows.length - 1 - row);
}

const open = ".".repeat(12);

describe("FlightGrid", () => {
    test("rock is terrain", () => {
        const rows = [
            open,
            open,
            "...^^^^^....",
            "...^^^^^....",
            "...^^^^^....",
            "...^^^^^....",
            open,
        ];
        expect(isWall(rows, 4, 3)).toBe(true);
        expect(isWall(rows, 1, 3)).toBe(false);
    });

    test("so is a thin rim of blocked floor joined to it", () => {
        const rows = [
            open,
            "...^^^^^^^^^",
            "...^^^^.....",
            "...^^^^.....",
            "...^^^^.....",
            "...^^^^.....",
            open,
        ];
        expect(isWall(rows, 10, 1)).toBe(true);
    });

    test("a clump of objects is too, if it's big enough", () => {
        const rows = [open, "...####.....", "...####.....", "...####.....", "...####.....", open];
        expect(isWall(rows, 3, 1)).toBe(true);
    });

    test("fences, a tree, water and a river bank aren't", () => {
        const fence = [open, open, "..||||||....", open];
        expect(isWall(fence, 3, 2)).toBe(false);
        const tree = [open, "...###......", "...###......", "...###......", open];
        expect(isWall(tree, 4, 2)).toBe(false);
        const lake = [open, "..~~~~~~....", "..~~~~~~....", "..~~~~~~....", "..~~~~~~....", open];
        expect(isWall(lake, 4, 2)).toBe(false);
        const bank = [open, "^^^^^^^^^^^^", "~~~~~~~~~~~~", "~~~~~~~~~~~~", "^^^^^^^^^^^^", open];
        expect(isWall(bank, 4, 1)).toBe(false);
    });

    test("terrain holds up against the arena's edge, and beyond it is out of bounds", () => {
        const rows = ["^^^.........", "^^^.........", "^^^.........", "^^^.........", open];
        expect(isWall(rows, 1, 1)).toBe(true);
        const grid = new FlightGrid(makeGrid([open, open], BASE_X, BASE_Y));
        expect(grid.isSolid(BASE_X - 1, BASE_Y)).toBe(true);
        expect(grid.isSolid(BASE_X, BASE_Y)).toBe(false);
    });
});
