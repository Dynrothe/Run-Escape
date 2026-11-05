import { describe, expect, it } from "vitest";

import { createViewTest, getOpenness, pickPeaks } from "./geometry";

// A model of quads, each split in two triangles, from corners given as [x, y, z]
function model(quads: [number, number, number][][]) {
    const vertices = quads.flat();
    const faces: [number, number, number][] = quads.flatMap((_, q) => [
        [q * 4, q * 4 + 1, q * 4 + 2],
        [q * 4, q * 4 + 2, q * 4 + 3],
    ]);
    return {
        faceCount: faces.length,
        verticesX: vertices.map((v) => v[0]),
        verticesY: vertices.map((v) => v[1]),
        verticesZ: vertices.map((v) => v[2]),
        indices1: faces.map((f) => f[0]),
        indices2: faces.map((f) => f[1]),
        indices3: faces.map((f) => f[2]),
    };
}

// A cube's sides, each wound the same way seen from outside
const FRONT: [number, number, number][] = [
    [0, 0, 0],
    [1, 0, 0],
    [1, 1, 0],
    [0, 1, 0],
];
const BACK: [number, number, number][] = [
    [0, 0, 1],
    [0, 1, 1],
    [1, 1, 1],
    [1, 0, 1],
];
const LEFT: [number, number, number][] = [
    [0, 0, 0],
    [0, 1, 0],
    [0, 1, 1],
    [0, 0, 1],
];
const RIGHT: [number, number, number][] = [
    [1, 0, 0],
    [1, 0, 1],
    [1, 1, 1],
    [1, 1, 0],
];

describe("getOpenness", () => {
    it("is nothing for a closed box", () => {
        expect(getOpenness(model([FRONT, BACK, LEFT, RIGHT]))).toBeCloseTo(0);
    });

    it("is all for a single face standing up", () => {
        expect(getOpenness(model([FRONT]))).toBeCloseTo(1);
    });

    it("is a third for a box with no back", () => {
        expect(getOpenness(model([FRONT, LEFT, RIGHT]))).toBeCloseTo(1 / 3);
    });

    it("leaves out what faces up or down", () => {
        const floor: [number, number, number][] = [
            [0, 0, 0],
            [0, 0, 1],
            [1, 0, 1],
            [1, 0, 0],
        ];
        expect(getOpenness(model([floor]))).toBeCloseTo(0);
    });
});

describe("the play camera's view", () => {
    const inView = createViewTest({ pitch: -400, distance: 18, fov: 45, aspect: 16 / 9 });

    it("sees about 27 by 16 tiles of flat ground, more of it north", () => {
        // A tile, flat, at so many tiles east and north of the player
        const tile = (x: number, y: number) => inView(x, y, x + 1, y + 1, 0);
        expect(tile(0, 0)).toBe(true);
        expect(tile(12, 0)).toBe(true);
        expect(tile(-13, 0)).toBe(true);
        expect(tile(15, 0)).toBe(false);
        expect(tile(-16, 0)).toBe(false);
        expect(tile(0, 8)).toBe(true);
        expect(tile(0, 11)).toBe(false);
        expect(tile(0, -7)).toBe(true);
        expect(tile(0, -9)).toBe(false);
    });

    it("sees what's tall by the player, and not what's tall past the edge", () => {
        // Looking down this steeply, a thing's top is nearer the camera, so it leans out of view
        expect(inView(0, 0, 1, 1, 10)).toBe(true);
        expect(inView(0, 11, 1, 12, 0)).toBe(false);
        expect(inView(0, 11, 1, 12, 6)).toBe(false);
        expect(inView(0, -10, 1, -9, 6)).toBe(false);
    });

    it("sees a box that spans the view though no corner's in it", () => {
        expect(inView(-30, -1, 30, 1, 0)).toBe(true);
    });
});

describe("pickPeaks", () => {
    // 6 by 4 tiles
    const sums = new Float64Array(24);
    sums[4 + 2 * 6] = 10;
    sums[3 + 2 * 6] = 9;
    sums[0] = 1;

    it("picks the heaviest, apart from each other, where allowed", () => {
        expect(pickPeaks(sums, 6, 2, 3, 3)).toEqual([
            { x: 4, y: 2, sum: 10 },
            { x: 0, y: 0, sum: 1 },
        ]);
        expect(pickPeaks(sums, 6, 2, 1, 1).map((p) => p.sum)).toEqual([10, 9]);
        expect(pickPeaks(sums, 6, 1, 3, 3, (x) => x < 2)[0].sum).toBe(1);
    });
});
