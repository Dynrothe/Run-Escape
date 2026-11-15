import { describe, expect, it } from "vitest";

import { ModelData } from "../ModelData";
import { liftDecals } from "./liftDecals";

type Square = { x: number; y: number; z: number; size: number; priority: number };

// Squares facing +z, two faces each, every square with corners of its own unless `share` puts a
// square's first corner on another's
function model(squares: Square[], share?: [number, number]): ModelData {
    const xs: number[] = [];
    const ys: number[] = [];
    const zs: number[] = [];
    const a: number[] = [];
    const b: number[] = [];
    const c: number[] = [];
    const priorities: number[] = [];
    squares.forEach(({ x, y, z, size, priority }, i) => {
        const base = xs.length;
        xs.push(x, x + size, x + size, x);
        ys.push(y, y, y + size, y + size);
        zs.push(z, z, z, z);
        const first = share && share[0] === i ? share[1] * 4 : base;
        a.push(first, first);
        b.push(base + 1, base + 2);
        c.push(base + 2, base + 3);
        priorities.push(priority, priority);
    });
    const data = new ModelData();
    data.verticesCount = xs.length;
    data.verticesX = Int32Array.from(xs);
    data.verticesY = Int32Array.from(ys);
    data.verticesZ = Int32Array.from(zs);
    data.faceCount = a.length;
    data.indices1 = Int32Array.from(a);
    data.indices2 = Int32Array.from(b);
    data.indices3 = Int32Array.from(c);
    data.faceRenderPriorities = Int8Array.from(priorities);
    data.faceColors = new Uint16Array(a.length);
    data.textureFaceCount = 0;
    return data;
}

// A cape's cloth, 40 across, at z 15 facing +z
const CLOTH: Square = { x: -20, y: -20, z: 15, size: 40, priority: 5 };

describe("liftDecals", () => {
    it("brings an emblem drawn over its cloth by priority out in front of it", () => {
        // A skill cape's: two units behind the cloth
        const cape = model([CLOTH, { x: -5, y: -5, z: 13, size: 10, priority: 6 }]);
        expect(liftDecals(cape)).toBe(2);
        for (let v = 4; v < 8; v++) {
            expect(cape.verticesZ[v]).toBeGreaterThan(15);
            expect(cape.verticesZ[v]).toBeLessThanOrEqual(15 + 2);
        }
        // Where it was across, and the cloth where it was
        expect(Array.from(cape.verticesX.slice(4))).toEqual([-5, 5, 5, -5]);
        expect(Array.from(cape.verticesZ.slice(0, 4))).toEqual([15, 15, 15, 15]);
    });

    it("leaves one already in front, one set deep and one joined to its cloth", () => {
        const front = model([CLOTH, { x: -5, y: -5, z: 16, size: 10, priority: 6 }]);
        expect(liftDecals(front)).toBe(0);
        // Ten units behind: not a decal on it (an eye in a mask)
        const deep = model([CLOTH, { x: -5, y: -5, z: 5, size: 10, priority: 6 }]);
        expect(liftDecals(deep)).toBe(0);
        expect(Array.from(deep.verticesZ.slice(4))).toEqual([5, 5, 5, 5]);
        // Its corner on the cloth's: moving it would pull the cloth
        const joined = model([CLOTH, { x: -5, y: -5, z: 13, size: 10, priority: 6 }], [1, 0]);
        const before = Array.from(joined.verticesZ);
        expect(liftDecals(joined)).toBe(0);
        expect(Array.from(joined.verticesZ)).toEqual(before);
    });

    it("leaves a model with one priority, and the late priorities, as they are", () => {
        const late = model([CLOTH, { x: -5, y: -5, z: 13, size: 10, priority: 10 }]);
        expect(liftDecals(late)).toBe(0);
        const single = model([CLOTH, { x: -5, y: -5, z: 13, size: 10, priority: 6 }]);
        single.faceRenderPriorities = undefined as unknown as Int8Array;
        expect(liftDecals(single)).toBe(0);
    });
});
