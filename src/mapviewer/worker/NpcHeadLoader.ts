import { COSINE, SINE } from "../../rs/MathConstants";
import { Rasterizer2D } from "../../rs/graphics/Rasterizer2D";
import { Rasterizer3D } from "../../rs/graphics/Rasterizer3D";
import { Model } from "../../rs/model/Model";
import { ModelData } from "../../rs/model/ModelData";
import { drawModel, projectModel, screenX, screenY } from "./ItemIconLoader";
import { RenderDataLoader, RenderDataResult } from "./RenderDataLoader";
import { WorkerState } from "./RenderDataWorker";

// An NPC's chathead, as the client shows one in a dialogue: the NPC's head models, lit, seen from
// the front and fitted to the picture. An NPC with no head models of its own (most of the
// animals) is its whole body, fitted the same way. A portrait (content/portraits.json) can pick
// another model and pose, mirror it, and move the camera from that fit.

export const HEAD_SIZE = 64;

export type NpcPortrait = {
    // "head" (the default) is the chathead, or the body for an NPC without one. "body" is the
    // whole NPC, posed by `seqId`. A number is that one cache model, with the NPC's colours.
    model?: "head" | "body" | number;
    // A sequence to pose a body or a single model with, at `tick` (client ticks of 20ms)
    seqId?: number;
    tick?: number;
    // Client angle units: 2048 is a full turn
    yaw?: number;
    pitch?: number;
    // On top of the automatic fit
    zoom?: number;
    // In picture pixels (HEAD_SIZE across), after the fit: right and down
    offsetX?: number;
    offsetY?: number;
    // The model reflected left to right (its own x turned round), seen by the same camera: the
    // camera's numbers are untouched. With the camera mirrored too, it's the picture flipped.
    mirror?: boolean;
};

export type NpcHeadRequest = { npcId: number; portrait?: NpcPortrait };

export type NpcHeadInput = { heads: NpcHeadRequest[] };

export type NpcHead = {
    npcId: number;
    // ARGB, HEAD_SIZE x HEAD_SIZE; empty when the NPC has no model
    pixels: Int32Array;
};

export type PortraitFrame = {
    seqId: number;
    tick: number;
    frame: number;
    durationTicks: number;
    skeletal: boolean;
};

// How much of the picture the model fills, and how far round it's turned: the client's NPCs face
// a half turn from the camera
const FILL = 0.92;
const YAW = 0;
const PITCH = 0;

const FIT_ATTEMPTS = 3;

// Which frame of a sequence a tick lands on, wrapped round the sequence's length
export function portraitFrame(state: WorkerState, seqId: number, tick: number): PortraitFrame {
    if (seqId < 0) {
        return { seqId: -1, tick: 0, frame: -1, durationTicks: 1, skeletal: false };
    }
    const sequence = state.seqTypeLoader.load(seqId);
    const wrap = (duration: number): number =>
        ((Math.round(tick) % duration) + duration) % duration;
    if (sequence.isSkeletalSeq()) {
        const durationTicks = Math.max(sequence.getSkeletalDuration(), 1);
        const at = wrap(durationTicks);
        return { seqId, tick: at, frame: at, durationTicks, skeletal: true };
    }
    const lengths = (sequence.frameIds ?? [0]).map((_, frame) =>
        Math.max(sequence.frameLengths?.[frame] ?? 1, 1),
    );
    const durationTicks = Math.max(
        lengths.reduce((total, length) => total + length, 0),
        1,
    );
    const at = wrap(durationTicks);
    let remaining = at;
    let frame = 0;
    while (frame < lengths.length - 1 && remaining >= lengths[frame]) {
        remaining -= lengths[frame++];
    }
    return { seqId, tick: at, frame, durationTicks, skeletal: false };
}

// The screen box the model's faces cover, as projected last
function measureFaces(
    model: Model,
): { minX: number; maxX: number; minY: number; maxY: number } | undefined {
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    for (let f = 0; f < model.faceCount; f++) {
        for (const v of [model.indices1[f], model.indices2[f], model.indices3[f]]) {
            minX = Math.min(minX, screenX[v]);
            maxX = Math.max(maxX, screenX[v]);
            minY = Math.min(minY, screenY[v]);
            maxY = Math.max(maxY, screenY[v]);
        }
    }
    return maxX >= minX ? { minX, maxX, minY, maxY } : undefined;
}

function resolveNpc(state: WorkerState, npcId: number) {
    const npcType = state.npcTypeLoader.load(npcId);
    // The form the NPC is in now, as the client has it
    return (
        (npcType.transforms && npcType.transform(state.varManager, state.npcTypeLoader)) || npcType
    );
}

function lightModels(
    state: WorkerState,
    npcType: ReturnType<typeof resolveNpc>,
    ids: number[],
): Model | undefined {
    const loader = state.npcModelLoader.modelLoader;
    const models: ModelData[] = [];
    for (const id of ids) {
        const model = loader.getModel(id);
        if (model) {
            models.push(model);
        }
    }
    if (models.length === 0) {
        return undefined;
    }
    const merged = ModelData.merge(models, models.length);
    if (npcType.recolorFrom) {
        for (let i = 0; i < npcType.recolorFrom.length; i++) {
            merged.recolor(npcType.recolorFrom[i], npcType.recolorTo[i]);
        }
    }
    if (npcType.retextureFrom) {
        for (let i = 0; i < npcType.retextureFrom.length; i++) {
            merged.retexture(npcType.retextureFrom[i], npcType.retextureTo[i]);
        }
    }
    return merged.light(
        state.textureLoader,
        npcType.ambient + 64,
        npcType.contrast * 5 + 850,
        -30,
        -50,
        -30,
    );
}

function portraitModel(
    state: WorkerState,
    npcId: number,
    portrait: NpcPortrait,
): Model | undefined {
    const npcType = resolveNpc(state, npcId);
    const choice = portrait.model ?? "head";
    if (choice === "head") {
        const head = (npcType.chatheadModelIds ?? []).filter((id) => id >= 0);
        return lightModels(state, npcType, head.length > 0 ? head : (npcType.modelIds ?? []));
    }
    const pose = portraitFrame(state, portrait.seqId ?? -1, portrait.tick ?? 0);
    if (choice === "body") {
        return state.npcModelLoader.getModel(npcType, pose.seqId, pose.frame);
    }
    let model = lightModels(state, npcType, [choice]);
    if (model && pose.seqId >= 0 && pose.frame >= 0) {
        model = state.npcModelLoader.animator.animate(
            model,
            state.seqTypeLoader.load(pose.seqId),
            pose.frame,
        );
    }
    return model;
}

// A copy reflected across its own x = 0, faces wound back the right way round for drawModel's
// culling (the original can be a loader's cached model, so it's left alone)
function mirrorModel(model: Model): Model {
    const copy = Model.copyAnimated(model, true, false);
    for (let i = 0; i < copy.verticesCount; i++) {
        copy.verticesX[i] = -copy.verticesX[i];
    }
    copy.indices2 = model.indices3.slice();
    copy.indices3 = model.indices2.slice();
    // Each corner keeps its own shade; a negative third colour marks a flat or hidden face
    for (let f = 0; f < copy.faceCount; f++) {
        if (copy.faceColors3[f] >= 0) {
            const second = copy.faceColors2[f];
            copy.faceColors2[f] = copy.faceColors3[f];
            copy.faceColors3[f] = second;
        }
    }
    return copy;
}

export function renderNpcHead(
    state: WorkerState,
    npcId: number,
    portrait: NpcPortrait = {},
): Int32Array {
    const middle = HEAD_SIZE / 2;
    const pixels = new Int32Array(HEAD_SIZE * HEAD_SIZE);
    const posed = portraitModel(state, npcId, portrait);
    const model = posed && portrait.mirror ? mirrorModel(posed) : posed;
    if (!model) {
        return pixels;
    }
    const yaw = portrait.yaw ?? YAW;
    const pitch = portrait.pitch ?? PITCH;
    const sin = SINE[pitch & 2047] / 65536;
    const cos = COSINE[pitch & 2047] / 65536;

    Rasterizer2D.setRaster(pixels, HEAD_SIZE, HEAD_SIZE);
    Rasterizer2D.setClip(0, 0, HEAD_SIZE, HEAD_SIZE);
    Rasterizer3D.setClip();
    Rasterizer3D.setViewport(middle, middle);
    Rasterizer3D.rasterGouraudLowRes = false;
    Rasterizer3D.rasterAlpha = 0;

    // The camera's place in view space: across, down and how far along the view. projectModel
    // moves the model before it pitches, so it's turned back by the pitch first; that way a
    // zoom moves only along the view, and the picture stays where it was framed. Unpitched,
    // it's what it was.
    const project = (viewX: number, viewY: number, distance: number): boolean =>
        projectModel(
            model,
            yaw,
            0,
            pitch,
            viewX | 0,
            (viewY * cos + distance * sin) | 0,
            (distance * cos - viewY * sin) | 0,
        );

    // Fitted by where the faces' corners land, rather than by the model's bounds (which stray
    // points throw off): each try measures the picture it makes, then moves and zooms to fill it
    model.calculateBoundsCylinder();
    const reach = Math.max(model.height + model.bottomY, 2 * model.xzRadius) / 2;
    if (reach <= 0) {
        return pixels;
    }
    let distance = Math.ceil((reach * 512) / ((HEAD_SIZE / 2) * FILL)) + reach;
    let viewX = 0;
    let viewY = (model.height - model.bottomY) / 2;
    for (let attempt = 0; attempt < FIT_ATTEMPTS; attempt++) {
        if (!project(viewX, viewY, distance)) {
            return pixels;
        }
        const extent = measureFaces(model);
        if (!extent) {
            return pixels;
        }
        const across = Math.max(extent.maxX - extent.minX, extent.maxY - extent.minY, 1);
        // Moving sideways in view moves the picture by 512 / distance a unit
        viewX -= (((extent.minX + extent.maxX) / 2 - middle) * distance) / 512;
        viewY -= (((extent.minY + extent.maxY) / 2 - middle) * distance) / 512;
        distance = Math.max(1, Math.round((distance * across) / (HEAD_SIZE * FILL)));
    }
    distance = Math.max(1, Math.round(distance / Math.max(portrait.zoom ?? 1, 0.01)));
    viewX += ((portrait.offsetX ?? 0) * distance) / 512;
    viewY += ((portrait.offsetY ?? 0) * distance) / 512;
    if (project(viewX, viewY, distance)) {
        drawModel(model, (id) => state.textureLoader.getAverageHsl(id));
    }
    for (let i = 0; i < pixels.length; i++) {
        if (pixels[i] !== 0) {
            pixels[i] |= 0xff000000;
        }
    }
    return pixels;
}

export function drawNpcHead(state: WorkerState, request: NpcHeadRequest): Int32Array {
    try {
        return renderNpcHead(state, request.npcId, request.portrait);
    } catch (e) {
        console.error("Failed drawing NPC head", request.npcId, e);
        return new Int32Array(HEAD_SIZE * HEAD_SIZE);
    }
}

export class NpcHeadLoader implements RenderDataLoader<NpcHeadInput, NpcHead[]> {
    __type = "npcHeadLoader" as const;

    init(): void {}

    async load(state: WorkerState, input: NpcHeadInput): Promise<RenderDataResult<NpcHead[]>> {
        // In the order asked: two requests can be the same NPC in different portraits
        const heads = input.heads.map((request) => ({
            npcId: request.npcId,
            pixels: drawNpcHead(state, request),
        }));
        return { data: heads, transferables: heads.map((head) => head.pixels.buffer) };
    }

    reset(): void {}
}
