import { Model } from "../../rs/model/Model";
import { HSL_RGB_MAP } from "../../rs/util/ColorUtil";
import { ICON_WIDTH, renderItemIcon } from "./ItemIconLoader";

const RED = (7 << 7) | 64;
const BLUE = (43 << 10) | (7 << 7) | 64;

type Quad = { z: number; hsl: number; facing: "camera" | "away"; priority?: number };

// Square quads 80 units across, two flat shaded faces each. Faces wind so that
// (b - a) x (c - a) points out of the model, which the lighting in
// ModelData.light relies on.
function makeModel(quads: Quad[]): Model {
    const model = new Model();
    const xs: number[] = [];
    const ys: number[] = [];
    const zs: number[] = [];
    const faces: number[][] = [];
    const colors: number[] = [];
    const priorities: number[] = [];
    for (const quad of quads) {
        const base = xs.length;
        for (const [x, y] of [
            [-40, -40],
            [40, -40],
            [40, 40],
            [-40, 40],
        ]) {
            xs.push(x);
            ys.push(y);
            zs.push(quad.z);
        }
        const [a, b, c, d] = [base, base + 1, base + 2, base + 3];
        const tris =
            quad.facing === "camera"
                ? [
                      [a, c, b],
                      [a, d, c],
                  ]
                : [
                      [a, b, c],
                      [a, c, d],
                  ];
        for (const tri of tris) {
            faces.push(tri);
            colors.push(quad.hsl);
            priorities.push(quad.priority ?? 0);
        }
    }
    model.verticesCount = model.usedVertexCount = xs.length;
    model.verticesX = Int32Array.from(xs);
    model.verticesY = Int32Array.from(ys);
    model.verticesZ = Int32Array.from(zs);
    model.faceCount = faces.length;
    model.indices1 = Int32Array.from(faces.map((f) => f[0]));
    model.indices2 = Int32Array.from(faces.map((f) => f[1]));
    model.indices3 = Int32Array.from(faces.map((f) => f[2]));
    model.faceColors1 = Int32Array.from(colors);
    model.faceColors2 = new Int32Array(faces.length);
    model.faceColors3 = new Int32Array(faces.length).fill(-1);
    if (quads.some((q) => q.priority !== undefined)) {
        model.faceRenderPriorities = Int8Array.from(priorities);
    }
    return model;
}

function render(model: Model): Int32Array {
    const objType = { zoom2d: 2000, xan2d: 0, yan2d: 0, zan2d: 0, offsetX2d: 0, offsetY2d: 0 };
    const state = {
        objTypeLoader: { load: () => objType },
        objModelLoader: { getModel: () => model },
        textureLoader: { getAverageHsl: () => 0 },
    } as any;
    return renderItemIcon(state, 1, 1);
}

function pixelAt(pixels: Int32Array, x: number, y: number): number {
    return pixels[x + y * ICON_WIDTH] & 0xffffff;
}

describe("item icons", () => {
    test("show the side of the model facing the camera", () => {
        // A box's front (towards the camera, -z) and back
        const pixels = render(
            makeModel([
                { z: -40, hsl: RED, facing: "camera" },
                { z: 40, hsl: BLUE, facing: "away" },
            ]),
        );
        expect(pixelAt(pixels, 16, 16)).toBe(HSL_RGB_MAP[RED]);
    });

    test("are centred at (16, 16) like the client's", () => {
        const pixels = render(makeModel([{ z: 0, hsl: RED, facing: "camera" }]));
        let minX = ICON_WIDTH;
        let maxX = 0;
        for (let x = 0; x < ICON_WIDTH; x++) {
            if (pixelAt(pixels, x, 16) === HSL_RGB_MAP[RED]) {
                minX = Math.min(minX, x);
                maxX = Math.max(maxX, x);
            }
        }
        // Not 18, the middle of the sprite
        expect(Math.abs((minX + maxX + 1) / 2 - 16)).toBeLessThanOrEqual(0.5);
    });

    test("draw higher priority faces over lower ones on the same plane", () => {
        // The decal comes first in face order but has the higher priority
        const pixels = render(
            makeModel([
                { z: 0, hsl: BLUE, facing: "camera", priority: 1 },
                { z: 0, hsl: RED, facing: "camera", priority: 0 },
            ]),
        );
        expect(pixelAt(pixels, 16, 16)).toBe(HSL_RGB_MAP[BLUE]);
    });
});
