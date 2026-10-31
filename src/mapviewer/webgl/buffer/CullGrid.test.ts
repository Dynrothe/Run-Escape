import { mat4 } from "gl-matrix";
import { describe, expect, test } from "vitest";

import { Scene } from "../../../rs/scene/Scene";
import { Frustum } from "../../Frustum";
import { CullGrid, FLOATS_PER_BOX, addModelBounds, getModelBounds, newBounds } from "./CullGrid";
import { ContourGroundType, ModelInfo } from "./SceneBuffer";

const BORDER = 6;

// A flat scene but for one tall corner (y is down, so high is negative)
function makeScene(highX: number, highZ: number, high: number): Scene {
    const size = 64 + BORDER * 2;
    const heights = Array.from({ length: size + 1 }, () => new Int32Array(size + 1));
    heights[highX + BORDER][highZ + BORDER] = high;
    return { tileHeights: [heights], levels: 1, sizeX: size, sizeY: size } as unknown as Scene;
}

function instanceAt(sceneX: number, sceneZ: number, contourGround: ContourGroundType): ModelInfo {
    return {
        sceneX,
        sceneZ,
        heightOffset: 0,
        level: 0,
        contourGround,
        priority: 1,
        interactType: 0,
        interactId: 1,
    };
}

function box(grid: CullGrid, index: number): number[] {
    const boxes = grid.toWorldBoxes(0, 0);
    return Array.from(boxes.subarray(index * FLOATS_PER_BOX, (index + 1) * FLOATS_PER_BOX));
}

const SMALL_MODEL = {
    verticesCount: 2,
    verticesX: [-64, 64],
    verticesY: [-200, 0],
    verticesZ: [-64, 64],
};

describe("CullGrid", () => {
    test("points in the same cell share a box, and the box grows to fit", () => {
        const grid = new CullGrid(8, makeScene(0, 0, 0), BORDER);
        const box0 = grid.cellBox(0, 0);
        expect(grid.cellBox(8 * 128 - 1, 8 * 128 - 1)).toBe(box0);
        expect(grid.cellBox(8 * 128, 0)).not.toBe(box0);
        grid.extend(box0, 0, -500, 0, 1000, 0, 100);
        const [minX, minY, , maxX] = box(grid, box0);
        expect(minX).toBeLessThan(0);
        expect(minY).toBeLessThanOrEqual(-500 / 128);
        // Sticks out of the 8 tile cell
        expect(maxX).toBeGreaterThanOrEqual(1000 / 128);
    });

    test("points outside the square go to the nearest cell", () => {
        const grid = new CullGrid(8, makeScene(0, 0, 0), BORDER);
        expect(grid.cellBox(-500, -500)).toBe(grid.cellBox(0, 0));
        expect(grid.cellBox(64 * 128 + 500, 0)).toBe(grid.cellBox(63 * 128, 0));
    });

    test("boxes are in world tiles", () => {
        const grid = new CullGrid(8, makeScene(0, 0, 0), BORDER);
        const index = grid.cellBox(0, 0);
        grid.extend(index, 128, 0, 256, 128, 0, 256);
        const boxes = grid.toWorldBoxes(50, 100);
        expect(boxes[index]).toBeCloseTo(50 * 64 + 1, 0);
        expect(boxes[index + 2]).toBeCloseTo(100 * 64 + 2, 0);
    });

    test("a model that follows the terrain gets the terrain's height", () => {
        const grid = new CullGrid(8, makeScene(10, 10, -800), BORDER);
        const bounds = getModelBounds(SMALL_MODEL);
        const index = grid.addInstance(
            instanceAt(10 * 128, 10 * 128, ContourGroundType.VERTEX),
            bounds,
        );
        const [, minY, , , maxY] = box(grid, index);
        expect(minY).toBeLessThanOrEqual((-800 - 200) / 128);
        expect(maxY).toBeGreaterThanOrEqual(0);
    });

    test("a model that doesn't follow the terrain doesn't", () => {
        const grid = new CullGrid(8, makeScene(10, 10, -800), BORDER);
        const bounds = getModelBounds(SMALL_MODEL);
        const index = grid.addInstance(
            instanceAt(10 * 128, 10 * 128, ContourGroundType.NONE),
            bounds,
        );
        expect(box(grid, index)[1]).toBeGreaterThan(-800 / 128);
    });

    test("something wider than a cell gets a box of its own", () => {
        const grid = new CullGrid(8, makeScene(0, 0, 0), BORDER);
        const wide = getModelBounds({ ...SMALL_MODEL, verticesX: [-600, 600] });
        const a = grid.addInstance(instanceAt(128, 128, ContourGroundType.NONE), wide);
        const b = grid.addInstance(instanceAt(256, 256, ContourGroundType.NONE), wide);
        const small = grid.addInstance(
            instanceAt(256, 256, ContourGroundType.NONE),
            getModelBounds(SMALL_MODEL),
        );
        expect(new Set([a, b, small]).size).toBe(3);
    });

    test("an animation's bounds cover all of its frames", () => {
        const bounds = newBounds();
        addModelBounds(bounds, SMALL_MODEL);
        addModelBounds(bounds, { ...SMALL_MODEL, verticesY: [-900, 40] });
        expect(bounds).toMatchObject({ minX: -64, minY: -900, maxY: 40 });
    });
});

describe("Frustum", () => {
    function makeFrustum(): Frustum {
        const projection = mat4.perspective(mat4.create(), Math.PI / 4, 16 / 9, 0.1, 4096);
        const view = mat4.lookAt(mat4.create(), [0, -20, 8], [0, 0, 0], [0, 0, -1]);
        const frustum = new Frustum();
        frustum.setPlanes(mat4.multiply(mat4.create(), projection, view));
        return frustum;
    }

    test("stored boxes get the same answer as boxes in arrays", () => {
        const frustum = makeFrustum();
        for (let x = -60; x < 60; x += 7) {
            for (let z = -60; z < 60; z += 7) {
                const min = [x, -1, z];
                const max = [x + 5, 1, z + 5];
                const stored = new Float32Array([9, 9, ...min, ...max]);
                expect(frustum.intersectsBoxAt(stored, 2)).toBe(frustum.intersectsBox([min, max]));
            }
        }
    });

    test("spheres count until they're clear of the frustum", () => {
        const frustum = makeFrustum();
        expect(frustum.intersectsSphere(0, 0, 0, 0.1)).toBe(true);
        expect(frustum.intersectsSphere(200, 0, 0, 0.1)).toBe(false);
        // Well off to the side, but big enough to reach in
        expect(frustum.intersectsSphere(200, 0, 0, 190)).toBe(true);
    });
});
