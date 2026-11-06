import { createIdkTypeLoader } from "../../../rs/config/idktype/IdkTypeLoader";
import { LocModelType } from "../../../rs/config/loctype/LocModelType";
import { NpcModelLoader } from "../../../rs/config/npctype/NpcModelLoader";
import { NpcType } from "../../../rs/config/npctype/NpcType";
import { SpotAnimModelLoader } from "../../../rs/config/spotanimtype/SpotAnimModelLoader";
import { SpotAnimType } from "../../../rs/config/spotanimtype/SpotAnimType";
import {
    SpotAnimTypeLoader,
    createSpotAnimTypeLoader,
} from "../../../rs/config/spotanimtype/SpotAnimTypeLoader";
import { Model } from "../../../rs/model/Model";
import { ModelData } from "../../../rs/model/ModelData";
import { PlayerModelLoader } from "../../../rs/model/player/PlayerModelLoader";
import { RenderDataLoader, RenderDataResult } from "../../worker/RenderDataLoader";
import { WorkerState } from "../../worker/RenderDataWorker";
import { SceneBuffer } from "../buffer/SceneBuffer";
import { createTextureIdIndexMap, getSdTextureIds } from "../loader/TextureIndex";
import { Segments } from "./ActorBakeSegments";
import {
    ActorBakeInput,
    ActorBakeResult,
    BakedAnim,
    BakedSet,
    ModelBakeRequest,
    NPC_IDLE_SEQ,
    NPC_WALK_SEQ,
} from "./ActorBakeTypes";

type ModelSource = (seqId: number, frame: number) => Model | undefined;

// A skeletal animation has a pose for every client tick (20ms), and a fully
// posed copy of the model for each one is what made Varlamore's bosses too
// big for a phone: Sol Heredit alone was over 100MB. One pose in every three
// (60ms) is as smooth as the keyframed animations, and a third of the memory.
const SKELETAL_TICK_STEP = 3;

// A buffer's first `length` bytes, in a buffer of their own: the vertex buffer
// grows by doubling, and the rest of it shouldn't go to the main thread
function exactBytes(bytes: Uint8Array, length: number): Uint8Array {
    const buffer = bytes.buffer as ArrayBuffer & { transfer?: (length: number) => ArrayBuffer };
    if (buffer.transfer) {
        return new Uint8Array(buffer.transfer(length));
    }
    return bytes.slice(0, length);
}

function getModelBounds(model: Model): { height: number; radius: number } {
    let height = 0;
    let radius = 0;
    for (let i = 0; i < model.verticesCount; i++) {
        const y = -model.verticesY[i];
        if (y > height) {
            height = y;
        }
        const x = model.verticesX[i];
        const z = model.verticesZ[i];
        const r = Math.sqrt(x * x + z * z);
        if (r > radius) {
            radius = r;
        }
    }
    return { height, radius };
}

// A model's top alone (ModelBakeRequest.topOnly): every face but those looking up hidden, as the
// cache hides one (a third colour of -2), on a copy. Which way is up for its faces' winding is
// the way the face highest in it looks.
function topOnly(model: Model): Model {
    const { verticesX: vx, verticesY: vy, verticesZ: vz } = model;
    const normals = new Float32Array(model.faceCount);
    let highest = Infinity;
    let up = -1;
    for (let f = 0; f < model.faceCount; f++) {
        const a = model.indices1[f];
        const b = model.indices2[f];
        const c = model.indices3[f];
        const ux = vx[b] - vx[a];
        const uy = vy[b] - vy[a];
        const uz = vz[b] - vz[a];
        const wx = vx[c] - vx[a];
        const wy = vy[c] - vy[a];
        const wz = vz[c] - vz[a];
        const nx = uy * wz - uz * wy;
        const ny = uz * wx - ux * wz;
        const nz = ux * wy - uy * wx;
        const length = Math.hypot(nx, ny, nz);
        normals[f] = length > 0 ? ny / length : 0;
        // Up is negative: the highest flat face looks up
        const middle = (vy[a] + vy[b] + vy[c]) / 3;
        if (Math.abs(normals[f]) > 0.9 && middle < highest) {
            highest = middle;
            up = Math.sign(normals[f]);
        }
    }
    const colors = model.faceColors3.slice();
    for (let f = 0; f < model.faceCount; f++) {
        if (normals[f] * up < 0.5) {
            colors[f] = -2;
        }
    }
    const copy: Model = Object.assign(Object.create(Object.getPrototypeOf(model)), model);
    copy.faceColors3 = colors;
    return copy;
}

function getModelReach(model: Model): number {
    let reach = 0;
    for (let i = 0; i < model.verticesCount; i++) {
        const x = model.verticesX[i];
        const y = model.verticesY[i];
        const z = model.verticesZ[i];
        const squared = x * x + y * y + z * z;
        if (squared > reach) {
            reach = squared;
        }
    }
    return Math.sqrt(reach);
}

function bakeAnim(
    state: WorkerState,
    segments: Segments,
    getModel: ModelSource,
    seqId: number,
): { anim: BakedAnim; firstFrame: Model | undefined; reach: number } {
    const seqType = seqId !== -1 ? state.seqTypeLoader.load(seqId) : undefined;

    let frameCount = 1;
    // A skeletal animation's length in ticks; its frames are every few of them
    let skeletalTicks = 0;
    if (seqType) {
        if (seqType.isSkeletalSeq()) {
            skeletalTicks = seqType.getSkeletalDuration();
            frameCount = Math.ceil(skeletalTicks / SKELETAL_TICK_STEP);
        } else if (seqType.frameIds) {
            frameCount = seqType.frameIds.length;
        }
    }
    frameCount = Math.max(frameCount, 1);

    const ranges = new Int32Array(frameCount * 4);
    const frameSegments = new Uint16Array(frameCount);
    const frameLengths = new Uint16Array(frameCount);
    let firstFrame: Model | undefined;
    let reach = 0;

    for (let i = 0; i < frameCount; i++) {
        const tick = skeletalTicks > 0 ? i * SKELETAL_TICK_STEP : i;
        const model = seqType ? getModel(seqId, tick) : getModel(-1, -1);
        if (model) {
            if (i === 0) {
                firstFrame = model;
            }
            reach = Math.max(reach, getModelReach(model));
            ranges.set(segments.addFrame(model, frameCount - i), i * 4);
            frameSegments[i] = segments.current;
        }
        let length = 1;
        if (skeletalTicks > 0) {
            length = Math.min(SKELETAL_TICK_STEP, skeletalTicks - tick);
        } else if (seqType?.frameLengths) {
            length = seqType.frameLengths[i] || 1;
        }
        frameLengths[i] = length;
    }

    return {
        anim: {
            seqId,
            ranges,
            segments: frameSegments,
            frameLengths,
            looping: seqType ? seqType.looping || seqType.frameStep !== -1 : true,
        },
        firstFrame,
        reach,
    };
}

function bakeSet(
    state: WorkerState,
    segments: Segments,
    key: string,
    getModel: ModelSource,
    seqIds: number[],
): BakedSet {
    const anims: BakedAnim[] = [];
    let bounds = { height: 0, radius: 0 };
    let setReach = 0;
    for (const seqId of seqIds.length > 0 ? seqIds : [-1]) {
        const { anim, firstFrame, reach } = bakeAnim(state, segments, getModel, seqId);
        if (anims.length === 0 && firstFrame) {
            bounds = getModelBounds(firstFrame);
        }
        setReach = Math.max(setReach, reach);
        anims.push(anim);
    }
    return { key, height: bounds.height, radius: bounds.radius, reach: setReach, anims };
}

function npcModelSource(npcModelLoader: NpcModelLoader, npcType: NpcType): ModelSource {
    return (seqId, frame) => npcModelLoader.getModel(npcType, seqId, frame);
}

type ExtraLoaders = {
    playerModelLoader: PlayerModelLoader;
    spotAnimTypeLoader: SpotAnimTypeLoader;
    spotAnimModelLoader: SpotAnimModelLoader;
};

export class ActorBakeLoader implements RenderDataLoader<ActorBakeInput, ActorBakeResult> {
    __type = "actorBakeLoader" as const;

    // Loaders the map viewer's workers don't have, made on first use
    private extra?: ExtraLoaders;

    private getExtraLoaders(state: WorkerState): ExtraLoaders {
        if (!this.extra) {
            const { cache, cacheSystem, npcModelLoader } = state;
            const modelLoader = npcModelLoader.modelLoader;
            const animator = npcModelLoader.animator;
            const spotAnimTypeLoader = createSpotAnimTypeLoader(cache.info, cacheSystem);
            this.extra = {
                playerModelLoader: new PlayerModelLoader(
                    createIdkTypeLoader(cache.info, cacheSystem),
                    state.objTypeLoader,
                    modelLoader,
                    state.textureLoader,
                    state.seqTypeLoader,
                    animator,
                ),
                spotAnimTypeLoader,
                spotAnimModelLoader: new SpotAnimModelLoader(
                    spotAnimTypeLoader,
                    modelLoader,
                    state.textureLoader,
                    state.seqTypeLoader,
                    animator,
                ),
            };
        }
        return this.extra;
    }

    // A floor tile's model (ModelBakeRequest) as a spot animation of its own, under an id no
    // real one has (its loader keeps models by id), so the spot animation path recolours, lights
    // and scales it
    private floorSpotAnim(
        state: WorkerState,
        spotAnims: { load(id: number): SpotAnimType },
        request: ModelBakeRequest,
    ): SpotAnimType | undefined {
        const id = -1 - this.floorModels++;
        let spotAnim: SpotAnimType;
        let recolorFrom: number[] = [];
        let recolorTo: number[] = [];
        let retextureFrom: number[] = [];
        let retextureTo: number[] = [];
        if (request.spotAnimId !== undefined) {
            const base = spotAnims.load(request.spotAnimId);
            spotAnim = Object.assign(Object.create(SpotAnimType.prototype), base);
            recolorFrom = base.recolorFrom ?? [];
            recolorTo = base.recolorTo ?? [];
            retextureFrom = base.retextureFrom ?? [];
            retextureTo = base.retextureTo ?? [];
        } else {
            spotAnim = Object.assign(Object.create(SpotAnimType.prototype), {
                sequenceId: -1,
                widthScale: 128,
                heightScale: 128,
                orientation: 0,
                ambient: 0,
                contrast: 0,
            });
            if (request.locId !== undefined) {
                const loc = state.locTypeLoader.load(request.locId);
                const modelId = loc.models?.[0]?.[0];
                if (modelId === undefined) {
                    return undefined;
                }
                spotAnim.modelId = modelId;
                spotAnim.ambient = loc.ambient;
                spotAnim.contrast = loc.contrast;
                recolorFrom = loc.recolorFrom ?? [];
                recolorTo = loc.recolorTo ?? [];
                retextureFrom = loc.retextureFrom ?? [];
                retextureTo = loc.retextureTo ?? [];
            } else if (request.modelId !== undefined) {
                spotAnim.modelId = request.modelId;
            } else {
                return undefined;
            }
        }
        const scale = request.scale ?? 1;
        (spotAnim as { id: number }).id = id;
        spotAnim.recolorFrom = [...recolorFrom, ...(request.recolor ?? []).map(([from]) => from)];
        spotAnim.recolorTo = [...recolorTo, ...(request.recolor ?? []).map(([, to]) => to)];
        spotAnim.retextureFrom = [
            ...retextureFrom,
            ...(request.retexture ?? []).map(([from]) => from),
        ];
        spotAnim.retextureTo = [...retextureTo, ...(request.retexture ?? []).map(([, to]) => to)];
        spotAnim.widthScale = Math.round(spotAnim.widthScale * scale);
        spotAnim.heightScale = Math.round(spotAnim.heightScale * scale);
        if (request.still) {
            spotAnim.sequenceId = -1;
        }
        return spotAnim;
    }

    private floorModels = 0;

    init(): void {}

    async load(
        state: WorkerState,
        input: ActorBakeInput,
    ): Promise<RenderDataResult<ActorBakeResult>> {
        const textureLoader = state.textureLoader;
        const textureIdIndexMap = createTextureIdIndexMap(getSdTextureIds(textureLoader));

        const sceneBuf = new SceneBuffer(textureLoader, textureIdIndexMap, 50000);
        const segments = new Segments(sceneBuf);

        const extra = this.getExtraLoaders(state);

        const sets: BakedSet[] = [];
        for (const request of input.requests) {
            switch (request.kind) {
                case "npc": {
                    const npcType = state.npcTypeLoader.load(request.npcId);
                    const getModel = npcModelSource(state.npcModelLoader, npcType);
                    const seqIds = request.seqIds.map((id) =>
                        id === NPC_IDLE_SEQ
                            ? npcType.idleSeqId
                            : id === NPC_WALK_SEQ
                              ? npcType.walkSeqId
                              : id,
                    );
                    const set = bakeSet(state, segments, request.key, getModel, seqIds);
                    // Found under the ids they were asked for
                    set.anims.forEach((anim, i) => (anim.seqId = request.seqIds[i] ?? anim.seqId));
                    sets.push(set);
                    break;
                }
                case "player": {
                    const appearance = request.appearance;
                    const getModel: ModelSource = (seqId, frame) =>
                        extra.playerModelLoader.getModel(appearance, seqId, frame);
                    sets.push(bakeSet(state, segments, request.key, getModel, request.seqIds));
                    break;
                }
                case "spotanim": {
                    const spotAnim = extra.spotAnimTypeLoader.load(request.spotAnimId);
                    const getModel: ModelSource = (_seqId, frame) =>
                        extra.spotAnimModelLoader.getModel(spotAnim, frame);
                    sets.push(
                        bakeSet(state, segments, request.key, getModel, [spotAnim.sequenceId]),
                    );
                    break;
                }
                case "model": {
                    const spotAnim = this.floorSpotAnim(state, extra.spotAnimTypeLoader, request);
                    if (!spotAnim) {
                        break;
                    }
                    const getFull: ModelSource = (_seqId, frame) =>
                        extra.spotAnimModelLoader.getModel(spotAnim, frame);
                    const getModel: ModelSource = request.topOnly
                        ? (seqId, frame) => {
                              const model = getFull(seqId, frame);
                              return model && topOnly(model);
                          }
                        : getFull;
                    const seqIds = spotAnim.sequenceId !== -1 ? [spotAnim.sequenceId] : [];
                    sets.push(bakeSet(state, segments, request.key, getModel, seqIds));
                    break;
                }
                case "obj": {
                    const { objId, count } = request;
                    const getModel: ModelSource = () => state.objModelLoader.getModel(objId, count);
                    sets.push(bakeSet(state, segments, request.key, getModel, []));
                    break;
                }
                case "loc": {
                    const locType = state.locTypeLoader.load(request.locId);
                    // Its normal model, or its only kind (a floor decoration: Xarpus's exhumeds)
                    const types = locType.types;
                    const modelType =
                        types && !types.includes(LocModelType.NORMAL)
                            ? types[0]
                            : LocModelType.NORMAL;
                    const getModel: ModelSource = (seqId, frame) => {
                        if (seqId !== -1) {
                            return state.locModelLoader.getModelAnimated(
                                locType,
                                modelType,
                                0,
                                seqId,
                                frame,
                            );
                        }
                        const model = state.locModelLoader.getModel(locType, modelType, 0);
                        if (model instanceof ModelData) {
                            return model.light(
                                textureLoader,
                                locType.ambient + 64,
                                locType.contrast + 768,
                                -50,
                                -10,
                                -50,
                            );
                        }
                        return model;
                    };
                    const seqIds = request.seqs ?? (request.animated ? [locType.seqId] : []);
                    sets.push(bakeSet(state, segments, request.key, getModel, seqIds));
                    break;
                }
            }
        }
        extra.playerModelLoader.clearCache();
        extra.spotAnimModelLoader.clearCache();

        const vertexBuf = sceneBuf.vertexBuf;
        const vertices = exactBytes(vertexBuf.bytes, vertexBuf.byteOffset());
        const { indices, segmentStarts } = segments.finish(sets);

        const loadedTextures = new Map<number, Int32Array>();
        for (const textureId of sceneBuf.usedTextureIds) {
            if (!input.loadedTextureIds.has(textureId)) {
                try {
                    loadedTextures.set(
                        textureId,
                        textureLoader.getPixelsArgb(textureId, 128, true, 1.0),
                    );
                } catch (e) {}
            }
        }

        const transferables: Transferable[] = [
            vertices.buffer,
            indices.buffer,
            segmentStarts.buffer,
            ...Array.from(loadedTextures.values()).map((pixels) => pixels.buffer),
        ];
        for (const set of sets) {
            for (const anim of set.anims) {
                transferables.push(
                    anim.ranges.buffer,
                    anim.segments.buffer,
                    anim.frameLengths.buffer,
                );
            }
        }

        return {
            data: { vertices, indices, segmentStarts, sets, loadedTextures },
            transferables,
        };
    }

    reset(): void {}
}
