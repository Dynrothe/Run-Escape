import { describe, expect, it } from "vitest";

import { ModelData } from "./ModelData";

// A tile's top, a plane 184 up cut into n by n squares of two faces, each face its own colour
function plane(n: number): ModelData {
    const model = new ModelData();
    const step = 128 / n;
    const xs: number[] = [];
    const zs: number[] = [];
    for (let j = 0; j <= n; j++) {
        for (let i = 0; i <= n; i++) {
            xs.push(-64 + i * step);
            zs.push(-64 + j * step);
        }
    }
    model.verticesCount = xs.length;
    model.verticesX = Int32Array.from(xs);
    model.verticesY = new Int32Array(xs.length).fill(-184);
    model.verticesZ = Int32Array.from(zs);
    const a: number[] = [];
    const b: number[] = [];
    const c: number[] = [];
    for (let j = 0; j < n; j++) {
        for (let i = 0; i < n; i++) {
            const v = i + j * (n + 1);
            a.push(v, v + 1);
            b.push(v + n + 1, v + n + 1);
            c.push(v + 1, v + n + 2);
        }
    }
    model.faceCount = a.length;
    model.indices1 = Int32Array.from(a);
    model.indices2 = Int32Array.from(b);
    model.indices3 = Int32Array.from(c);
    model.faceColors = Uint16Array.from(a.map((_, f) => f));
    model.textureFaceCount = 0;
    return model;
}

const normalY = (m: ModelData, f: number) => {
    const [p, q, r] = [m.indices1[f], m.indices2[f], m.indices3[f]];
    const ux = m.verticesX[q] - m.verticesX[p];
    const uz = m.verticesZ[q] - m.verticesZ[p];
    const wx = m.verticesX[r] - m.verticesX[p];
    const wz = m.verticesZ[r] - m.verticesZ[p];
    return uz * wx - ux * wz;
};

describe("ModelData.simplify", () => {
    it("keeps about the share asked for, no face turned over, the tile's edges where they were", () => {
        const model = plane(8);
        const before = Array.from({ length: model.faceCount }, (_, f) =>
            Math.sign(normalY(model, f)),
        );
        const edge = new Set<string>();
        for (let v = 0; v < model.verticesCount; v++) {
            if (Math.abs(model.verticesX[v]) === 64 || Math.abs(model.verticesZ[v]) === 64) {
                edge.add(`${model.verticesX[v]},${model.verticesZ[v]}`);
            }
        }
        model.simplify(0.25);
        expect(model.faceCount).toBeLessThanOrEqual(32);
        expect(model.faceCount).toBeGreaterThan(8);
        for (let f = 0; f < model.faceCount; f++) {
            expect(Math.sign(normalY(model, f))).toBe(before[0]);
        }
        // Every vertex on the tile's edge still is, so a neighbour's edge meets it
        const used = new Set<number>();
        for (let f = 0; f < model.faceCount; f++) {
            used.add(model.indices1[f]).add(model.indices2[f]).add(model.indices3[f]);
        }
        const left = new Set(
            [...used]
                .map((v) => `${model.verticesX[v]},${model.verticesZ[v]}`)
                .filter((k) => edge.has(k)),
        );
        expect(left).toEqual(edge);
    });

    it("leaves a textured model alone", () => {
        const model = plane(4);
        model.faceTextures = new Int16Array(model.faceCount).fill(1);
        model.simplify(0.25);
        expect(model.faceCount).toBe(32);
    });
});
