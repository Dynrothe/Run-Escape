import { describe, expect, test } from "vitest";

import { Model } from "../../../rs/model/Model";
import type { TextureLoader } from "../../../rs/texture/TextureLoader";
import { SceneBuffer } from "../buffer/SceneBuffer";
import { AddedFrame, Frames, POSITIONS_WIDTH } from "./ActorBakeFrames";
import { Segments } from "./ActorBakeSegments";

// A model of these vertices and faces, untextured, each face a colour of its own
function makeModel(vertices: number[][], faces: number[][], colors?: number[]): Model {
    const model: Model = Object.create(Model.prototype);
    Object.assign(model, {
        verticesCount: vertices.length,
        verticesX: Int32Array.from(vertices, (v) => v[0]),
        verticesY: Int32Array.from(vertices, (v) => v[1]),
        verticesZ: Int32Array.from(vertices, (v) => v[2]),
        faceCount: faces.length,
        indices1: Int32Array.from(faces, (f) => f[0]),
        indices2: Int32Array.from(faces, (f) => f[1]),
        indices3: Int32Array.from(faces, (f) => f[2]),
        faceColors1: Int32Array.from(faces, (_, i) => colors?.[i] ?? 1000 + i),
        faceColors2: Int32Array.from(faces, (_, i) => colors?.[i] ?? 1000 + i),
        faceColors3: Int32Array.from(faces, (_, i) => colors?.[i] ?? 1000 + i),
        faceRenderPriorities: new Int8Array(faces.length),
    });
    return model;
}

// The same model in another pose
function moved(model: Model, by: number): Model {
    const copy: Model = Object.assign(Object.create(Model.prototype), model);
    copy.verticesX = model.verticesX.map((x) => x + by);
    copy.verticesY = model.verticesY.map((y) => y - 2 * by);
    copy.verticesZ = model.verticesZ.map((z) => z + 3 * by);
    return copy;
}

function makeBuffer(): SceneBuffer {
    return new SceneBuffer({} as TextureLoader, new Map(), 1000);
}

// A corner as the shader sees it: its position, then the rest of its bits
function decode(view: DataView, vertex: number, positions?: Int16Array, start = -1): string {
    const v0 = view.getUint32(vertex * 12, true);
    const v1 = view.getUint32(vertex * 12 + 4, true);
    const v2 = view.getUint32(vertex * 12 + 8, true);
    let position = [
        ((v0 >>> 17) & 0x7fff) - 0x4000,
        -((v1 & 0x7fff) - 0x4000),
        ((v2 >>> 17) & 0x7fff) - 0x4000,
    ];
    if (start >= 0 && positions) {
        const texel = (start + (((v0 >>> 17) & 0x7fff) | (((v2 >>> 17) & 0x7fff) << 15))) * 3;
        position = [positions[texel], positions[texel + 1], positions[texel + 2]];
    }
    return `${position}|${v0 & 0x1ffff},${v1 >>> 15},${v2 & 0x1ffff}`;
}

// What a model draws baked whole, as it was before frames shared meshes
function drawnWhole(model: Model): string[] {
    const buffer = makeBuffer();
    buffer.addModelAnimFrame(model, false);
    const view = new DataView(buffer.vertexBuf.bytes.buffer);
    return buffer.indices.map((vertex) => decode(view, vertex));
}

// Frames added one after another, as an animation of them all, and what each draws
function bake(models: Model[], maxTexels?: number) {
    const buffer = makeBuffer();
    const segments = new Segments(buffer);
    const frames = new Frames(segments, maxTexels);
    frames.beginSet();
    const added: AddedFrame[] = models.map((model, i) => frames.add(model, models.length - i));
    const { indices, segmentStarts } = segments.finish([]);
    const positions = frames.finish();
    const view = new DataView(buffer.vertexBuf.bytes.buffer);
    const drawn = added.map((frame) => {
        const [offset, count] = frame.ranges;
        const first = segmentStarts[frame.segment];
        return Array.from(indices.subarray(offset, offset + count), (index) =>
            decode(view, first + index, positions, frame.positionStart),
        );
    });
    return { added, drawn, positions };
}

const square = makeModel(
    [
        [0, 0, 0],
        [128, 0, 0],
        [128, -64, 128],
        [0, -64, 128],
    ],
    [
        [0, 1, 2],
        [0, 2, 3],
    ],
);

describe("frames that share a mesh", () => {
    test("are only their positions, and draw just as they would baked whole", () => {
        const poses = [square, moved(square, 5), moved(square, -40)];
        const { added, drawn, positions } = bake(poses);
        expect(added.map((frame) => frame.positionStart)).toEqual([0, 4, 8]);
        expect(new Set(added.map((frame) => frame.ranges.join()))).toHaveProperty("size", 1);
        poses.forEach((pose, i) => expect(drawn[i]).toEqual(drawnWhole(pose)));
        // A whole row, though there are only 12 positions
        expect(positions).toHaveLength(POSITIONS_WIDTH * 3);
    });

    test("draw a vertex out past what a frame can hold where a whole frame would", () => {
        // Packed in 15 bits, a frame's vertices clamp and wrap: a shared mesh's do the same.
        // (Not so far up that y clamps to 0x8000: in a whole frame that spills into its
        // colour's lowest bit, which the mesh keeps as it is. No model's 128 tiles tall.)
        const far = makeModel(
            [
                [20000, 0, 0],
                [16384, 20000, 0],
                [-20000, -16383, 16383],
            ],
            [[0, 1, 2]],
        );
        const poses = [far, moved(far, -1)];
        const { added, drawn } = bake(poses);
        expect(added[1].positionStart).toBeGreaterThanOrEqual(0);
        poses.forEach((pose, i) => expect(drawn[i]).toEqual(drawnWhole(pose)));
    });

    test("find a vertex past 15 bits of index", () => {
        const vertices = Array.from({ length: 40000 }, (_, i) => [i % 500, -(i % 77), i % 300]);
        const big = makeModel(vertices, [
            [0, 39999, 32768],
            [32767, 32768, 1],
        ]);
        const poses = [big, moved(big, 7)];
        const { added, drawn } = bake(poses);
        expect(added[1].positionStart).toBe(40000);
        poses.forEach((pose, i) => expect(drawn[i]).toEqual(drawnWhole(pose)));
    });
});

describe("frames baked whole", () => {
    test("a model's only frame, which would gain nothing from a mesh", () => {
        const { added } = bake([square]);
        expect(added[0].positionStart).toBe(-1);
    });

    test("frames whose faces differ have meshes of their own, four to a set at most", () => {
        // A fade: each frame's colours are its own
        const fading = Array.from({ length: 6 }, (_, i) =>
            makeModel(
                [
                    [0, 0, 0],
                    [9, 0, 0],
                    [0, 0, 9],
                ],
                [[0, 1, 2]],
                [500 + i],
            ),
        );
        const { added, drawn } = bake(fading);
        expect(added.map((frame) => frame.positionStart >= 0)).toEqual([
            true,
            true,
            true,
            true,
            false,
            false,
        ]);
        expect(new Set(added.map((frame) => frame.ranges.join()))).toHaveProperty("size", 6);
        fading.forEach((pose, i) => expect(drawn[i]).toEqual(drawnWhole(pose)));
    });

    test("once the page's positions are full", () => {
        const poses = [square, moved(square, 1), moved(square, 2)];
        const { added, drawn } = bake(poses, 8);
        expect(added.map((frame) => frame.positionStart)).toEqual([0, 4, -1]);
        poses.forEach((pose, i) => expect(drawn[i]).toEqual(drawnWhole(pose)));
    });

    test("every one, with ?wholeFrames: no room for positions at all", () => {
        const poses = [square, moved(square, 1), moved(square, 2)];
        const { added, positions } = bake(poses, 0);
        expect(added.map((frame) => frame.positionStart)).toEqual([-1, -1, -1]);
        expect(positions).toHaveLength(0);
    });

    test("a set doesn't share another's meshes", () => {
        const segments = new Segments(makeBuffer());
        const frames = new Frames(segments);
        frames.beginSet();
        const first = frames.add(square, 2);
        frames.beginSet();
        // The same faces, but another set's: it starts a mesh of its own
        const second = frames.add(moved(square, 3), 2);
        expect(second.ranges).not.toEqual(first.ranges);
        expect(second.positionStart).toBe(4);
    });
});
