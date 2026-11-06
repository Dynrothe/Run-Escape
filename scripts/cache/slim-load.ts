// Execute resolved extraction inputs with fresh loader state for each unit.
import { installRecipeInSceneBuilder } from "../../src/game/scaperune/squares";
import { LoadedCache } from "../../src/mapviewer/Caches";
import { ActorBakeLoader } from "../../src/mapviewer/webgl/actor/ActorBakeLoader";
import { SdMapDataLoader } from "../../src/mapviewer/webgl/loader/SdMapDataLoader";
import { getSdTextureIds } from "../../src/mapviewer/webgl/loader/TextureIndex";
import { ItemIconLoader } from "../../src/mapviewer/worker/ItemIconLoader";
import { loadMinimapData } from "../../src/mapviewer/worker/MinimapData";
import { RegionDataInput } from "../../src/mapviewer/worker/RegionData";
import { RegionDataLoader } from "../../src/mapviewer/worker/RegionDataLoader";
import { RenderDataLoader } from "../../src/mapviewer/worker/RenderDataLoader";
import { SoundLoader } from "../../src/mapviewer/worker/SoundLoader";
import { SpriteDataLoader } from "../../src/mapviewer/worker/SpriteDataLoader";
import {
    WorkerState,
    clearWorkerStateCaches,
    createWorkerState,
} from "../../src/mapviewer/worker/WorkerState";
import { MemoryStore } from "../../src/rs/cache/store/MemoryStore";
import { Scene } from "../../src/rs/scene/Scene";
import type { SlimUnit } from "./slim-plan";

// The camera can be ~15 tiles outside the arena and sees 72 tiles.
export const MAP_MARGIN = 2;

// Only the cache reads matter; Node doesn't need to draw the minimap.
class NodeImageData {
    readonly data: Uint8ClampedArray;

    constructor(width: number, height: number) {
        this.data = new Uint8ClampedArray(width * height * 4);
    }
}
class NodeOffscreenCanvas {
    getContext() {
        return { putImageData() {} };
    }

    convertToBlob(): Promise<Blob> {
        return Promise.resolve(new Blob());
    }
}
Object.assign(globalThis, { ImageData: NodeImageData, OffscreenCanvas: NodeOffscreenCanvas });

export function getMapSquares({ baseX, baseY, sizeX, sizeY, plane = 0 }: RegionDataInput) {
    return {
        plane,
        firstX: Math.floor(baseX / Scene.MAP_SQUARE_SIZE),
        firstY: Math.floor(baseY / Scene.MAP_SQUARE_SIZE),
        lastX: Math.ceil((baseX + sizeX) / Scene.MAP_SQUARE_SIZE) - 1,
        lastY: Math.ceil((baseY + sizeY) / Scene.MAP_SQUARE_SIZE) - 1,
    };
}

async function quietly<T>(load: () => Promise<T>): Promise<T> {
    const { log, time, timeEnd } = console;
    console.log = console.time = console.timeEnd = () => {};
    try {
        return await load();
    } finally {
        Object.assign(console, { log, time, timeEnd });
    }
}

class SlimLoader {
    private readonly state: WorkerState;
    private readonly bakeLoader = new ActorBakeLoader();
    private readonly mapLoader = new SdMapDataLoader();

    constructor(cache: LoadedCache) {
        this.state = createWorkerState(cache, [], [], undefined as unknown as Cache);
    }

    private async load<I, D>(loader: RenderDataLoader<I, D>, input: I): Promise<void> {
        loader.init();
        await loader.load(this.state, input);
        clearWorkerStateCaches(this.state);
    }

    async run(unit: SlimUnit): Promise<void> {
        switch (unit.kind) {
            case "map":
                return this.loadMap(unit);
            case "bake":
                return this.load(this.bakeLoader, {
                    requests: unit.requests,
                    loadedTextureIds: new Set<number>(),
                });
            case "textures":
                for (const id of getSdTextureIds(this.state.textureLoader)) {
                    this.state.textureLoader.getPixelsArgb(id, 128, true, 1.0);
                }
                return;
            case "sounds":
                return this.load(new SoundLoader(), { ids: unit.ids });
            case "sprites":
                return this.load(new SpriteDataLoader(), { spriteIds: unit.ids });
            case "icons":
                return this.load(new ItemIconLoader(), {
                    requests: unit.objIds.flatMap((objId) => {
                        const counts = this.state.objTypeLoader.load(objId).countCo ?? [];
                        return [1, ...counts.filter((count) => count > 1)].map((count) => ({
                            objId,
                            count,
                        }));
                    }),
                });
        }
    }

    private async loadMap(unit: Extract<SlimUnit, { kind: "map" }>): Promise<void> {
        installRecipeInSceneBuilder(this.state.sceneBuilder, unit.id);
        await this.load(new RegionDataLoader(), unit.region);

        const { plane, firstX, firstY, lastX, lastY } = getMapSquares(unit.region);
        for (let mapX = firstX - MAP_MARGIN; mapX <= lastX + MAP_MARGIN; mapX++) {
            for (let mapY = firstY - MAP_MARGIN; mapY <= lastY + MAP_MARGIN; mapY++) {
                await quietly(() =>
                    this.load(this.mapLoader, {
                        mapX,
                        mapY,
                        minLevel: plane,
                        maxLevel: plane,
                        loadObjs: false,
                        loadNpcs: false,
                        smoothTerrain: false,
                        minimizeDrawCalls: false,
                        loadedTextureIds: new Set<number>(),
                    }),
                );
            }
        }
        for (let mapX = firstX; mapX <= lastX; mapX++) {
            for (let mapY = firstY; mapY <= lastY; mapY++) {
                await loadMinimapData(this.state, mapX, mapY, plane, true);
            }
        }
    }
}

// A warm type/model cache would hide reads satisfied by an earlier unit.
// Include initialization reads in every result so it also works on its own.
export async function extractUnit(cache: LoadedCache, unit: SlimUnit): Promise<string[]> {
    const reads = new Set<string>();
    const readGroup = MemoryStore.prototype.read;
    MemoryStore.prototype.read = function (indexId, archiveId) {
        reads.add(`${indexId}:${archiveId}`);
        return readGroup.call(this, indexId, archiveId);
    };
    try {
        await new SlimLoader(cache).run(unit);
        return [...reads].sort();
    } finally {
        MemoryStore.prototype.read = readGroup;
    }
}
