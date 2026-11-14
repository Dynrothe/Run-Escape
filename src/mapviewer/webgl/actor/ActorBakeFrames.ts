import type { Model } from "../../../rs/model/Model";
import type { Segments } from "./ActorBakeSegments";

// How many texels a row of a page's positions texture has: WebGL 2 promises textures this big
// both ways, so a page's positions go up to this many rows of it
export const POSITIONS_WIDTH = 2048;
export const MAX_POSITION_TEXELS = POSITIONS_WIDTH * 2048;

// Meshes a set's frames can share: most models have one, and a few more cover the odd
// animation that hides or fades some faces for a while
const MESHES_PER_SET = 4;

// A frame as baked: its draw ranges, the segment of the page they're in, and where its
// positions start in the page's positions texture (-1 for a frame baked whole)
export type AddedFrame = { ranges: number[]; segment: number; positionStart: number };

// What a bake adds frames with (bakeAnim, bakeRunPose)
export type FrameAdder = {
    add(model: Model, framesAhead: number): AddedFrame;
};

// Everything about a model's faces but where its vertices are: what decides whether two frames
// look the same but for their pose
type Faces = {
    verticesCount: number;
    faceCount: number;
    arrays: (ArrayLike<number> | undefined)[];
};

function getFaceArrays(model: Model): (ArrayLike<number> | undefined)[] {
    return [
        model.indices1,
        model.indices2,
        model.indices3,
        model.faceColors1,
        model.faceColors2,
        model.faceColors3,
        model.faceAlphas,
        model.faceTextures,
        model.faceRenderPriorities,
        model.uvs,
    ];
}

// How much of each array a model's faces use: a face's three corners' uvs, one of the rest
function getUsed(model: Model, array: number): number {
    return array === 9 ? model.faceCount * 6 : model.faceCount;
}

function getFaces(model: Model): Faces {
    return {
        verticesCount: model.verticesCount,
        faceCount: model.faceCount,
        arrays: getFaceArrays(model).map((values, i) => {
            if (!values) {
                return undefined;
            }
            const used = Math.min(values.length, getUsed(model, i));
            return Array.prototype.slice.call(values, 0, used) as number[];
        }),
    };
}

function sameFaces(faces: Faces, model: Model): boolean {
    if (faces.verticesCount !== model.verticesCount || faces.faceCount !== model.faceCount) {
        return false;
    }
    const arrays = getFaceArrays(model);
    for (let a = 0; a < arrays.length; a++) {
        const kept = faces.arrays[a];
        const values = arrays[a];
        if (!kept || !values) {
            if (kept !== values) {
                return false;
            }
            continue;
        }
        if (Math.min(values.length, getUsed(model, a)) !== kept.length) {
            return false;
        }
        for (let i = 0; i < kept.length; i++) {
            // (NaN's the same as NaN here: it's the same bits in the buffer)
            if (kept[i] !== values[i] && (kept[i] === kept[i] || values[i] === values[i])) {
                return false;
            }
        }
    }
    return true;
}

// A vertex's position as the shader decodes it from a whole frame's vertex (VertexBuffer packs
// each axis in 15 bits, clamped), so a frame drawn from its positions is drawn exactly the same
function packedAxis(value: number): number {
    return (Math.min(Math.max(value + 0x4000, 0), 0x8000) & 0x7fff) - 0x4000;
}

// A copy of the model with each vertex's index in its model where its position was: the low 15
// bits in x, the rest in z (vertex.glsl's decode, actor.vert.glsl's getPosition)
function indexModel(model: Model): Model {
    const count = model.verticesCount;
    const copy: Model = Object.assign(Object.create(Object.getPrototypeOf(model)), model);
    copy.verticesX = new Int32Array(count);
    copy.verticesY = new Int32Array(count);
    copy.verticesZ = new Int32Array(count);
    for (let i = 0; i < count; i++) {
        copy.verticesX[i] = (i & 0x7fff) - 0x4000;
        copy.verticesZ[i] = (i >> 15) - 0x4000;
    }
    return copy;
}

type SharedMesh = { faces: Faces } & Omit<AddedFrame, "positionStart">;

// The frames of a bake, each a fully posed copy of its model, or, for an animation whose frames
// differ only in their pose (most of them), its positions alone: the model's faces are baked
// once, as a mesh whose vertices say which of the model's vertices they are, and each frame
// keeps that many positions, three 16-bit numbers each, in a texture the shader reads them
// from. Posed whole, a frame is a vertex for each different corner (more than one a face), 12
// bytes each, and three indices a face, where its positions are about half a vertex a face, 6
// bytes each: a Warden's frame was 90 KB, and is 13 KB.
//
// A frame that won't share (its faces, colours, alphas or textures aren't any mesh's) is baked
// whole, as is a model's only frame, and every frame once the page's texture is full.
export class Frames implements FrameAdder {
    // The set's meshes, the last one used first
    private meshes: SharedMesh[] = [];
    private positions = new Int16Array(POSITIONS_WIDTH * 3);
    private texels = 0;

    constructor(
        readonly segments: Segments,
        // How many positions a page can have (less, in tests)
        readonly maxTexels = MAX_POSITION_TEXELS,
    ) {}

    // Frames share meshes within a set (one model's animations) only
    beginSet(): void {
        this.meshes = [];
    }

    add(model: Model, framesAhead: number): AddedFrame {
        const roomFor = this.texels + model.verticesCount <= this.maxTexels;
        let mesh = roomFor ? this.findMesh(model) : undefined;
        // A mesh for this frame alone would be its frame and its positions too
        if (!mesh && roomFor && framesAhead > 1 && this.meshes.length < MESHES_PER_SET) {
            mesh = this.addMesh(model);
        }
        if (!mesh) {
            const ranges = this.segments.addFrame(model, framesAhead);
            return { ranges, segment: this.segments.current, positionStart: -1 };
        }
        return {
            ranges: mesh.ranges,
            segment: mesh.segment,
            positionStart: this.addPositions(model),
        };
    }

    // The positions texture's texels: x, y and z of each, padded to whole rows
    finish(): Int16Array {
        const rows = Math.ceil(this.texels / POSITIONS_WIDTH);
        const positions = new Int16Array(rows * POSITIONS_WIDTH * 3);
        positions.set(this.positions.subarray(0, this.texels * 3));
        return positions;
    }

    private findMesh(model: Model): SharedMesh | undefined {
        const index = this.meshes.findIndex((mesh) => sameFaces(mesh.faces, model));
        if (index === -1) {
            return undefined;
        }
        const mesh = this.meshes[index];
        if (index > 0) {
            this.meshes.splice(index, 1);
            this.meshes.unshift(mesh);
        }
        return mesh;
    }

    private addMesh(model: Model): SharedMesh {
        const ranges = this.segments.addFrame(indexModel(model), 1);
        const mesh = { faces: getFaces(model), ranges, segment: this.segments.current };
        this.meshes.unshift(mesh);
        return mesh;
    }

    private addPositions(model: Model): number {
        const start = this.texels;
        const count = model.verticesCount;
        const needed = (start + count) * 3;
        if (needed > this.positions.length) {
            const grown = new Int16Array(Math.max(this.positions.length * 2, needed));
            grown.set(this.positions.subarray(0, start * 3));
            this.positions = grown;
        }
        const { verticesX, verticesY, verticesZ } = model;
        const positions = this.positions;
        for (let i = 0; i < count; i++) {
            const o = (start + i) * 3;
            positions[o] = packedAxis(verticesX[i]);
            // Packed upside down, and decoded the right way up again
            positions[o + 1] = -packedAxis(-verticesY[i]);
            positions[o + 2] = packedAxis(verticesZ[i]);
        }
        this.texels += count;
        return start;
    }
}
