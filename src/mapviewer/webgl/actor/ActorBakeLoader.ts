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
import { FrameAdder, Frames } from "./ActorBakeFrames";
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
    frames: FrameAdder,
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
    const positionStarts = new Int32Array(frameCount).fill(-1);
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
            const added = frames.add(model, frameCount - i);
            ranges.set(added.ranges, i * 4);
            frameSegments[i] = added.segment;
            positionStarts[i] = added.positionStart;
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
            positionStarts,
            looping: seqType ? seqType.looping || seqType.frameStep !== -1 : true,
        },
        firstFrame,
        reach,
    };
}

// A seq's interleave order as groups, without the end marker it's decoded
// with (SeqType.masks)
export function getMovementGroups(masks: number[] | undefined): number[] {
    return masks?.filter((group) => group < 0x100) ?? [];
}

// One frame of an attack over the run: a frame for each of the run's, timed
// as the run, so the legs go on as they were while the upper body holds the
// pose. getModel poses run frame r. Undefined if any of them can't be put
// together (a skeletal one, or another skeleton): a frame missing would draw
// nothing, so the run shows instead.
export function bakeRunPose(
    state: Pick<WorkerState, "seqTypeLoader">,
    frames: FrameAdder,
    getModel: (runFrame: number) => Model | undefined,
    seqId: number,
    runSeqId: number,
): { anim: BakedAnim; reach: number } | undefined {
    const runType = state.seqTypeLoader.load(runSeqId);
    const count = runType.frameIds?.length ?? 0;
    if (count === 0) {
        return undefined;
    }
    const models: Model[] = [];
    for (let i = 0; i < count; i++) {
        const model = getModel(i);
        if (!model) {
            return undefined;
        }
        models.push(model);
    }
    const ranges = new Int32Array(count * 4);
    const frameSegments = new Uint16Array(count);
    const frameLengths = new Uint16Array(count);
    const positionStarts = new Int32Array(count);
    let reach = 0;
    models.forEach((model, i) => {
        reach = Math.max(reach, getModelReach(model));
        const added = frames.add(model, count - i);
        ranges.set(added.ranges, i * 4);
        frameSegments[i] = added.segment;
        positionStarts[i] = added.positionStart;
        frameLengths[i] = runType.frameLengths?.[i] || 1;
    });
    return {
        anim: {
            seqId,
            ranges,
            segments: frameSegments,
            frameLengths,
            positionStarts,
            looping: true,
            runPose: true,
        },
        reach,
    };
}

function bakeSet(
    state: WorkerState,
    frames: Frames,
    key: string,
    getModel: ModelSource,
    seqIds: number[],
): BakedSet {
    frames.beginSet();
    const anims: BakedAnim[] = [];
    let bounds = { height: 0, radius: 0 };
    let setReach = 0;
    for (const seqId of seqIds.length > 0 ? seqIds : [-1]) {
        const { anim, firstFrame, reach } = bakeAnim(state, frames, getModel, seqId);
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
        const frames = new Frames(segments, input.wholeFrames ? 0 : undefined);

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
                    const set = bakeSet(state, frames, request.key, getModel, seqIds);
                    // Found under the ids they were asked for
                    set.anims.forEach((anim, i) => (anim.seqId = request.seqIds[i] ?? anim.seqId));
                    sets.push(set);
                    break;
                }
                case "player": {
                    const appearance = request.appearance;
                    const getModel: ModelSource = (seqId, frame) =>
                        extra.playerModelLoader.getModel(appearance, seqId, frame);
                    const set = bakeSet(state, frames, request.key, getModel, request.seqIds);
                    set.layered = true;
                    const runPoses = request.runPoses;
                    // The groups the run keeps, without the order's end
                    // marker. With none, the swing would take the legs too,
                    // so no pose is baked and the run shows.
                    const movementGroups = runPoses
                        ? getMovementGroups(state.seqTypeLoader.load(runPoses.maskSeqId).masks)
                        : [];
                    if (runPoses && movementGroups.length > 0) {
                        for (const { seqId, frame } of runPoses.poses) {
                            const baked = bakeRunPose(
                                state,
                                frames,
                                (runFrame) =>
                                    extra.playerModelLoader.getInterleavedModel(
                                        appearance,
                                        seqId,
                                        frame,
                                        runPoses.runSeqId,
                                        runFrame,
                                        movementGroups,
                                    ),
                                seqId,
                                runPoses.runSeqId,
                            );
                            if (baked) {
                                set.anims.push(baked.anim);
                                set.reach = Math.max(set.reach, baked.reach);
                            }
                        }
                    }
                    sets.push(set);
                    break;
                }
                case "spotanim": {
                    const spotAnim = extra.spotAnimTypeLoader.load(request.spotAnimId);
                    const getModel: ModelSource = (_seqId, frame) =>
                        extra.spotAnimModelLoader.getModel(spotAnim, frame);
                    sets.push(bakeSet(state, frames, request.key, getModel, [spotAnim.sequenceId]));
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
                    sets.push(bakeSet(state, frames, request.key, getModel, seqIds));
                    break;
                }
                case "obj": {
                    const { objId, count } = request;
                    const getModel: ModelSource = () => state.objModelLoader.getModel(objId, count);
                    sets.push(bakeSet(state, frames, request.key, getModel, []));
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
                    sets.push(bakeSet(state, frames, request.key, getModel, seqIds));
                    break;
                }
            }
        }
        extra.playerModelLoader.clearCache();
        extra.spotAnimModelLoader.clearCache();

        const vertexBuf = sceneBuf.vertexBuf;
        const vertices = exactBytes(vertexBuf.bytes, vertexBuf.byteOffset());
        const { indices, segmentStarts } = segments.finish(sets);
        const positions = frames.finish();

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
            positions.buffer,
            ...Array.from(loadedTextures.values()).map((pixels) => pixels.buffer),
        ];
        for (const set of sets) {
            for (const anim of set.anims) {
                transferables.push(
                    anim.ranges.buffer,
                    anim.segments.buffer,
                    anim.frameLengths.buffer,
                    anim.positionStarts.buffer,
                );
            }
        }

        return {
            data: { vertices, indices, segmentStarts, positions, sets, loadedTextures },
            transferables,
        };
    }

    reset(): void {}
}
