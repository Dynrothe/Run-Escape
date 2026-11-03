import { describe, expect, it } from "vitest";

import { getOpenness } from "./geometry";

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
