import { LocModelLoader } from "../../rs/config/loctype/LocModelLoader";
import { LocModelType } from "../../rs/config/loctype/LocModelType";
import { LocType } from "../../rs/config/loctype/LocType";
import { VarManager } from "../../rs/config/vartype/VarManager";
import { CollisionMap } from "../../rs/scene/CollisionMap";
import { LocLoadType, SceneBuilder } from "../../rs/scene/SceneBuilder";
import {
    COLLISION_LOC_STRIDE,
    REGION_TILE_BRIDGE,
    REGION_TILE_INSIDE,
    RegionData,
    RegionDataInput,
} from "./RegionData";
import { RenderDataLoader, RenderDataResult } from "./RenderDataLoader";
import { WorkerState } from "./RenderDataWorker";

// Builds RegionData as one scene, so nothing has to be stitched across map
// square borders. The renderer streams map squares in and out around the
// camera, so anything that needs the whole area at once (game collision,
// enemies off screen) reads this instead.

// Locs from neighbouring tiles can block tiles inside the region, and the scene
// builder skips locs on its outer edge, so build a little beyond it.
const BORDER = 6;

// A loc stands on the part of its model below this height (scene units, about
// waist height): a signpost on its post, a tree on its trunk
const FOOTPRINT_HEIGHT = 128;
// Nothing stands on less than this across, in tiles
const MIN_FOOTPRINT = 0.25;

type Footprint = { x0: number; z0: number; x1: number; z1: number };

// What a loc that draws nothing stands on
const NOWHERE: Footprint = { x0: Infinity, z0: Infinity, x1: -Infinity, z1: -Infinity };

// The ground a loc's model stands on, in scene units around its middle (x
// east, z north): NOWHERE if it draws nothing, undefined when there's no model
// to go by
function getFootprint(
    locModelLoader: LocModelLoader,
    varManager: VarManager,
    locType: LocType,
    type: LocModelType,
    rotation: number,
): Footprint | undefined {
    // A multiloc draws one of its variants, picked by the vars as the renderer
    // picks it (SdMapDataLoader), or nothing
    const drawn = locType.transforms
        ? locType.transform(varManager, locModelLoader.locTypeLoader)
        : locType;
    if (!drawn || !drawn.models || drawn.models.length === 0) {
        return NOWHERE;
    }
    const diagonal = type === LocModelType.NORMAL_DIAGIONAL;
    if (type !== LocModelType.NORMAL && !diagonal) {
        return undefined;
    }
    // As LocModelLoader.getModel turns it, without the lighting
    const model = locModelLoader.getLocModelData(
        drawn,
        LocModelType.NORMAL,
        diagonal ? rotation + 4 : rotation,
    );
    if (!model) {
        return undefined;
    }
    if (diagonal) {
        model.rotate(256);
    }

    const { verticesX: xs, verticesY: ys, verticesZ: zs } = model;
    const bounds = { x0: Infinity, z0: Infinity, x1: -Infinity, z1: -Infinity };
    const add = (x: number, z: number) => {
        bounds.x0 = Math.min(bounds.x0, x);
        bounds.z0 = Math.min(bounds.z0, z);
        bounds.x1 = Math.max(bounds.x1, x);
        bounds.z1 = Math.max(bounds.z1, z);
    };
    // Up is negative y. Each edge of each face: its ends that are low enough,
    // and where it crosses the height
    const low = -FOOTPRINT_HEIGHT;
    const edge = (a: number, b: number) => {
        if (ys[a] >= low) {
            add(xs[a], zs[a]);
        }
        if (ys[a] >= low !== ys[b] >= low) {
            const t = (low - ys[a]) / (ys[b] - ys[a]);
            add(xs[a] + (xs[b] - xs[a]) * t, zs[a] + (zs[b] - zs[a]) * t);
        }
    };
    for (let i = 0; i < model.faceCount; i++) {
        const a = model.indices1[i];
        const b = model.indices2[i];
        const c = model.indices3[i];
        edge(a, b);
        edge(b, c);
        edge(c, a);
    }
    if (bounds.x0 > bounds.x1) {
        return undefined;
    }
    return bounds;
}

// varManager: the vars the renderer draws multilocs with
export function buildRegionData(
    sceneBuilder: SceneBuilder,
    varManager: VarManager,
    { baseX, baseY, sizeX, sizeY, plane = 0 }: RegionDataInput,
): RegionData {
    const sceneBaseX = baseX - BORDER;
    const sceneBaseY = baseY - BORDER;

    // The locs that block, on whichever plane (the region's are kept below)
    const collisionLocs: { map: CollisionMap; numbers: number[] }[] = [];
    const footprints = new Map<string, Footprint | undefined>();
    sceneBuilder.onCollisionLoc = (
        map,
        tileX,
        tileY,
        locSizeX,
        locSizeY,
        locType,
        type,
        rotation,
    ) => {
        const key = `${locType.id}:${type}:${rotation}`;
        if (!footprints.has(key)) {
            footprints.set(
                key,
                getFootprint(sceneBuilder.locModelLoader, varManager, locType, type, rotation),
            );
        }
        const footprint = footprints.get(key);
        const x = sceneBaseX + tileX;
        const y = sceneBaseY + tileY;
        const numbers = [x, y, locSizeX, locSizeY, NaN, NaN, NaN, NaN];
        if (footprint === NOWHERE) {
            numbers[4] = numbers[5] = Infinity;
            numbers[6] = numbers[7] = -Infinity;
        } else if (footprint) {
            // Around the middle of its tiles, and no further than them
            const midX = x + locSizeX / 2;
            const midY = y + locSizeY / 2;
            let x0 = Math.max(x, midX + footprint.x0 / 128);
            let y0 = Math.max(y, midY + footprint.z0 / 128);
            let x1 = Math.min(x + locSizeX, midX + footprint.x1 / 128);
            let y1 = Math.min(y + locSizeY, midY + footprint.z1 / 128);
            if (x1 - x0 < MIN_FOOTPRINT) {
                const mid = Math.min(
                    Math.max((x0 + x1) / 2, x + MIN_FOOTPRINT / 2),
                    x + locSizeX - MIN_FOOTPRINT / 2,
                );
                x0 = mid - MIN_FOOTPRINT / 2;
                x1 = mid + MIN_FOOTPRINT / 2;
            }
            if (y1 - y0 < MIN_FOOTPRINT) {
                const mid = Math.min(
                    Math.max((y0 + y1) / 2, y + MIN_FOOTPRINT / 2),
                    y + locSizeY - MIN_FOOTPRINT / 2,
                );
                y0 = mid - MIN_FOOTPRINT / 2;
                y1 = mid + MIN_FOOTPRINT / 2;
            }
            numbers[4] = x0;
            numbers[5] = y0;
            numbers[6] = x1;
            numbers[7] = y1;
        }
        collisionLocs.push({ map, numbers });
    };
    let scene;
    try {
        scene = sceneBuilder.buildScene(
            sceneBaseX,
            sceneBaseY,
            sizeX + BORDER * 2,
            sizeY + BORDER * 2,
            false,
            LocLoadType.NO_MODELS,
        );
    } finally {
        sceneBuilder.onCollisionLoc = undefined;
    }

    // The plane's collision has its bridges folded in already: where a bridge
    // is, what's stored a plane up is this plane (the deck), and what's
    // stored on this plane is under it
    const collisionMap = scene.collisionMaps[plane];
    const above = Math.min(plane + 1, scene.levels - 1);

    const collisionFlags = new Int32Array(sizeX * sizeY);
    const tileFlags = new Uint8Array(sizeX * sizeY);
    const overlays = new Uint16Array(sizeX * sizeY);
    for (let y = 0; y < sizeY; y++) {
        for (let x = 0; x < sizeX; x++) {
            const sceneX = x + BORDER;
            const sceneY = y + BORDER;
            const i = x + y * sizeX;
            collisionFlags[i] = collisionMap.getFlag(sceneX, sceneY);
            let flags = 0;
            const bridge = (scene.tileRenderFlags[1][sceneX][sceneY] & 0x2) !== 0;
            if (bridge) {
                flags |= REGION_TILE_BRIDGE;
            }
            const level = bridge ? above : plane;
            if ((scene.tileRenderFlags[level][sceneX][sceneY] & 0x4) !== 0) {
                flags |= REGION_TILE_INSIDE;
            }
            tileFlags[i] = flags;
            overlays[i] = scene.tileOverlays[level][sceneX][sceneY];
        }
    }

    const cornersX = sizeX + 1;
    const heights = new Int32Array(cornersX * (sizeY + 1));
    const bridgeHeights = new Int32Array(cornersX * (sizeY + 1));
    for (let y = 0; y <= sizeY; y++) {
        for (let x = 0; x <= sizeX; x++) {
            heights[x + y * cornersX] = scene.tileHeights[plane][x + BORDER][y + BORDER];
            bridgeHeights[x + y * cornersX] = scene.tileHeights[above][x + BORDER][y + BORDER];
        }
    }

    const planeLocs = collisionLocs.filter((loc) => loc.map === collisionMap);
    const locs = new Float32Array(planeLocs.length * COLLISION_LOC_STRIDE);
    planeLocs.forEach((loc, i) => locs.set(loc.numbers, i * COLLISION_LOC_STRIDE));

    return {
        baseX,
        baseY,
        sizeX,
        sizeY,
        plane,
        collisionFlags,
        heights,
        bridgeHeights,
        tileFlags,
        overlays,
        collisionLocs: locs,
    };
}

export class RegionDataLoader implements RenderDataLoader<RegionDataInput, RegionData> {
    __type = "regionDataLoader" as const;

    init(): void {}

    async load(state: WorkerState, input: RegionDataInput): Promise<RenderDataResult<RegionData>> {
        const data = buildRegionData(state.sceneBuilder, state.varManager, input);
        return {
            data,
            transferables: [
                data.collisionFlags.buffer,
                data.heights.buffer,
                data.bridgeHeights.buffer,
                data.tileFlags.buffer,
                data.overlays.buffer,
                data.collisionLocs.buffer,
            ],
        };
    }

    reset(): void {}
}
