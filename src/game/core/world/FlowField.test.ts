import { FlowField, canStep } from "./FlowField";
import { makeGrid } from "./testGrid";

describe("canStep", () => {
    const grid = makeGrid([".....", ".|...", "....."]);

    test("walls block both ways", () => {
        expect(canStep(grid, 101, 201, 1, 0)).toBe(false);
        expect(canStep(grid, 102, 201, -1, 0)).toBe(false);
        expect(canStep(grid, 101, 201, 0, 1)).toBe(true);
    });

    test("diagonals need both corners open", () => {
        expect(canStep(grid, 101, 200, 1, 1)).toBe(false);
        expect(canStep(grid, 101, 202, 1, -1)).toBe(false);
        expect(canStep(grid, 102, 202, 1, -1)).toBe(true);
    });
});

describe("FlowField", () => {
    test("routes around a wall", () => {
        // Target on the right; a wall with a gap at the top
        const grid = makeGrid([
            "...........",
            "....#......",
            "....#......",
            "....#......",
            "....#......",
        ]);
        const field = new FlowField(16);
        field.update(grid, 108, 202);
        expect(field.getCost(108, 202)).toBe(0);
        // Straight right is walled off, so the route goes up through the gap
        const step = { x: 0, y: 0 };
        expect(field.getStep(grid, 103, 202, step)).toBe(true);
        expect(step.y).toBe(1);
        expect(field.getCost(103, 202)).toBeGreaterThan(field.getCost(105, 202) + 20);
    });

    test("water is unreachable", () => {
        const grid = makeGrid(["..~..", "..~..", "..~.."]);
        const field = new FlowField(16);
        field.update(grid, 104, 201);
        expect(field.isReachable(103, 201)).toBe(true);
        expect(field.isReachable(100, 201)).toBe(false);
        const step = { x: 0, y: 0 };
        expect(field.getStep(grid, 100, 201, step)).toBe(false);
    });

    test("steps always lead downhill to the target", () => {
        const grid = makeGrid([
            "..........",
            ".###.####.",
            ".#......#.",
            ".#.####.#.",
            ".#......#.",
            ".####.###.",
            "..........",
        ]);
        const field = new FlowField(32);
        field.update(grid, 104, 202);
        const step = { x: 0, y: 0 };
        let x = 100;
        let y = 200;
        for (let i = 0; i < 64 && !(x === 104 && y === 202); i++) {
            expect(field.getStep(grid, x, y, step)).toBe(true);
            const before = field.getCost(x, y);
            x += step.x;
            y += step.y;
            expect(field.getCost(x, y)).toBeLessThan(before);
        }
        expect([x, y]).toEqual([104, 202]);
    });

    test("jumps a ditch straight across, both ways", () => {
        // A ditch two rows deep, its south row at y 202, all the way across
        const grid = makeGrid([".....", ".....", "#####", "#####", ".....", "....."]);
        const field = new FlowField(16);
        field.ditchY = 202;
        field.update(grid, 102, 205);
        const step = { x: 0, y: 0 };
        expect(field.isReachable(102, 200)).toBe(true);
        expect(field.getStep(grid, 102, 201, step)).toBe(true);
        expect(step).toEqual({ x: 0, y: 3 });
        // Coming back the other way
        field.update(grid, 102, 200);
        expect(field.getStep(grid, 102, 204, step)).toBe(true);
        expect(step).toEqual({ x: 0, y: -3 });
        // Away from the edge it walks up to it first
        expect(field.getStep(grid, 102, 205, step)).toBe(true);
        expect(step.y).toBe(-1);
    });

    test("walks round a ditch's end when that's quicker than jumping", () => {
        // A gap at the east end of the ditch
        const grid = makeGrid([
            "..........",
            "..........",
            "########..",
            "########..",
            "..........",
            "..........",
        ]);
        const field = new FlowField(32);
        field.ditchY = 202;
        field.update(grid, 100, 205);
        const step = { x: 0, y: 0 };
        // Right below the target: over
        expect(field.getStep(grid, 100, 201, step)).toBe(true);
        expect(step).toEqual({ x: 0, y: 3 });
        // At the gap: through it
        expect(field.getStep(grid, 109, 201, step)).toBe(true);
        expect(Math.abs(step.y)).toBe(1);
    });

    test("nothing jumps without a ditch", () => {
        const grid = makeGrid([".....", "#####", "#####", "....."]);
        const field = new FlowField(16);
        field.update(grid, 102, 203);
        expect(field.isReachable(102, 200)).toBe(false);
    });
});
