import { Rasterizer2D } from "../../rs/graphics/Rasterizer2D";
import { Rasterizer3D } from "../../rs/graphics/Rasterizer3D";
import { Model } from "../../rs/model/Model";
import { ModelData } from "../../rs/model/ModelData";
import { drawModel, projectModel, screenX, screenY } from "./ItemIconLoader";
import { RenderDataLoader, RenderDataResult } from "./RenderDataLoader";
import { WorkerState } from "./RenderDataWorker";

// An NPC's chathead, as the client shows one in a dialogue: the NPC's head models, lit, seen from
// the front and fitted to the picture. An NPC with no head models of its own (most of the
// animals) is its whole body, fitted the same way.

export const HEAD_SIZE = 64;

export type NpcHeadInput = { npcIds: number[] };

export type NpcHead = {
    npcId: number;
    // ARGB, HEAD_SIZE x HEAD_SIZE; empty when the NPC has no model
    pixels: Int32Array;
};

// How much of the picture the model fills, and how far round it's turned: the client's NPCs face
// a half turn from the camera
const FILL = 0.92;
const YAW = 0;
const PITCH = 0;

const FIT_ATTEMPTS = 3;

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

export function renderNpcHead(state: WorkerState, npcId: number): Int32Array {
    const pixels = new Int32Array(HEAD_SIZE * HEAD_SIZE);
    let npcType = state.npcTypeLoader.load(npcId);
    if (npcType.transforms) {
        // The form the NPC is in now, as the client has it
        const transformed = npcType.transform(state.varManager, state.npcTypeLoader);
        if (transformed) {
            npcType = transformed;
        }
    }
    const head = (npcType.chatheadModelIds ?? []).filter((id) => id >= 0);
    const ids = head.length > 0 ? head : (npcType.modelIds ?? []);
    const loader = state.npcModelLoader.modelLoader;
    const models: ModelData[] = [];
    for (const id of ids) {
        const model = loader.getModel(id);
        if (model) {
            models.push(model);
        }
    }
    if (models.length === 0) {
        return pixels;
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
    const model = merged.light(
        state.textureLoader,
        npcType.ambient + 64,
        npcType.contrast * 5 + 850,
        -30,
        -50,
        -30,
    );

    Rasterizer2D.setRaster(pixels, HEAD_SIZE, HEAD_SIZE);
    Rasterizer2D.setClip(0, 0, HEAD_SIZE, HEAD_SIZE);
    Rasterizer3D.setClip();
    Rasterizer3D.setViewport(HEAD_SIZE / 2, HEAD_SIZE / 2);
    Rasterizer3D.rasterGouraudLowRes = false;
    Rasterizer3D.rasterAlpha = 0;

    // Fitted by where the faces' corners land, rather than by the model's bounds (which stray
    // points throw off): each try measures the picture it makes, then moves and zooms to fill it
    model.calculateBoundsCylinder();
    const reach = Math.max(model.height + model.bottomY, 2 * model.xzRadius) / 2;
    if (reach <= 0) {
        return pixels;
    }
    let distance = Math.ceil((reach * 512) / ((HEAD_SIZE / 2) * FILL)) + reach;
    let offsetX = 0;
    let offsetY = (model.height - model.bottomY) / 2;
    for (let attempt = 0; attempt < FIT_ATTEMPTS; attempt++) {
        if (!projectModel(model, YAW, 0, PITCH, offsetX | 0, offsetY | 0, distance)) {
            return pixels;
        }
        const extent = measureFaces(model);
        if (!extent) {
            return pixels;
        }
        const middle = HEAD_SIZE / 2;
        const size = Math.max(extent.maxX - extent.minX, extent.maxY - extent.minY, 1);
        // Moving sideways in the model moves the picture by 512 / distance a unit
        offsetX -= (((extent.minX + extent.maxX) / 2 - middle) * distance) / 512;
        offsetY -= (((extent.minY + extent.maxY) / 2 - middle) * distance) / 512;
        distance = Math.max(1, Math.round((distance * size) / (HEAD_SIZE * FILL)));
    }
    if (projectModel(model, YAW, 0, PITCH, offsetX | 0, offsetY | 0, distance)) {
        drawModel(model, (id) => state.textureLoader.getAverageHsl(id));
    }
    for (let i = 0; i < pixels.length; i++) {
        if (pixels[i] !== 0) {
            pixels[i] |= 0xff000000;
        }
    }
    return pixels;
}

export class NpcHeadLoader implements RenderDataLoader<NpcHeadInput, NpcHead[]> {
    __type = "npcHeadLoader" as const;

    init(): void {}

    async load(state: WorkerState, input: NpcHeadInput): Promise<RenderDataResult<NpcHead[]>> {
        const heads = input.npcIds.map((npcId) => {
            let pixels: Int32Array;
            try {
                pixels = renderNpcHead(state, npcId);
            } catch (e) {
                console.error("Failed drawing NPC head", npcId, e);
                pixels = new Int32Array(HEAD_SIZE * HEAD_SIZE);
            }
            return { npcId, pixels };
        });
        return { data: heads, transferables: heads.map((head) => head.pixels.buffer) };
    }

    reset(): void {}
}
