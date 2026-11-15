// Runs one unit of slim-cache.ts's plan (slim-plan.ts) with the game's own
// loaders and gives back every group it read, in a worker thread. Each unit gets
// loaders of its own, and its reads include what making them read, so what it
// reads doesn't depend on what ran before it: a warm model cache would hide a
// group an earlier unit read, and a map would keep an earlier map's ScapeRune
// squares. That's what lets slim-cache.ts reuse a unit's reads on their own.
import { LoadedCache } from "../../src/mapviewer/Caches";
import { ActorBakeLoader } from "../../src/mapviewer/webgl/actor/ActorBakeLoader";
import { SdMapDataLoader } from "../../src/mapviewer/webgl/loader/SdMapDataLoader";
import { getSdTextureIds } from "../../src/mapviewer/webgl/loader/TextureIndex";
import { ItemIconLoader } from "../../src/mapviewer/worker/ItemIconLoader";
import { loadMinimapData } from "../../src/mapviewer/worker/MinimapData";
import { RegionDataLoader } from "../../src/mapviewer/worker/RegionDataLoader";
import { RenderDataLoader } from "../../src/mapviewer/worker/RenderDataLoader";
import { SoundLoader } from "../../src/mapviewer/worker/SoundLoader";
import { SpriteDataLoader } from "../../src/mapviewer/worker/SpriteDataLoader";
import {
    TypeLoaders,
    WorkerState,
    clearWorkerStateCaches,
    createTypeLoaders,
    createWorkerState,
} from "../../src/mapviewer/worker/WorkerState";
import { CacheSystem } from "../../src/rs/cache/CacheSystem";
import { getCacheLoaderFactory } from "../../src/rs/cache/loader/CacheLoaderFactory";
import { MemoryStore } from "../../src/rs/cache/store/MemoryStore";
import { ArchiveTypeLoader } from "../../src/rs/config/TypeLoader";
import type { SlimUnit } from "./slim-plan";
import { MAP_MARGIN, getMapSquares } from "./slim-squares";

// ScapeRune's maps, imported by address so that esbuild doesn't trace them into
// what every unit's reads depend on. A map unit with a recipe carries their
// fingerprint instead (slim-plan.ts), so changing them, or the waves and
// bosses they import, extracts only those maps again.
const SQUARES = new URL("../../src/game/scaperune/squares.ts", import.meta.url).href;

// The map loaders draw minimap images on an OffscreenCanvas, which Node
// doesn't have. Only what they read from the cache matters here.
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

// The groups the unit being extracted has read, as "index:archive"
let reading: Set<string> | undefined;

// A type loader made from an archive decodes the whole archive when it's made
// (together they take about a second) and reads nothing after, so a worker makes
// those once and every unit gets the reads that made them. One that reads its
// types as it's asked for them is made for each unit.
type SharedTypeLoaders = { loaders: Partial<TypeLoaders>; reads: string[] };
const sharedTypeLoaders = new WeakMap<LoadedCache, SharedTypeLoaders>();

function getSharedTypeLoaders(cache: LoadedCache): SharedTypeLoaders {
    let shared = sharedTypeLoaders.get(cache);
    if (!shared) {
        const unitReads = reading;
        const reads = new Set<string>();
        reading = reads;
        try {
            const cacheSystem = CacheSystem.fromFiles(cache.type, cache.files);
            const loaders = createTypeLoaders(getCacheLoaderFactory(cache.info, cacheSystem));
            shared = {
                loaders: Object.fromEntries(
                    Object.entries(loaders).filter(
                        ([, loader]) => loader instanceof ArchiveTypeLoader,
                    ),
                ) as Partial<TypeLoaders>,
                reads: [...reads],
            };
        } finally {
            reading = unitReads;
        }
        sharedTypeLoaders.set(cache, shared);
    }
    return shared;
}

// The map loader logs every square
async function quietly<T>(load: () => Promise<T>): Promise<T> {
    const { log, time, timeEnd } = console;
    console.log = console.time = console.timeEnd = () => {};
    try {
        return await load();
    } finally {
        Object.assign(console, { log, time, timeEnd });
    }
}

// Loads a unit from one cache, as the game would
class SlimLoader {
    private readonly state: WorkerState;
    private readonly bakeLoader = new ActorBakeLoader();
    private readonly mapLoader = new SdMapDataLoader();

    constructor(cache: LoadedCache, typeLoaders: Partial<TypeLoaders>) {
        this.state = createWorkerState(cache, [], [], undefined as unknown as Cache, typeLoaders);
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
                // The renderer's texture array
                for (const id of getSdTextureIds(this.state.textureLoader)) {
                    this.state.textureLoader.getPixelsArgb(id, 128, true, 1.0);
                }
                return;
            case "sounds":
                return this.load(new SoundLoader(), { ids: unit.ids });
            case "sprites":
                return this.load(new SpriteDataLoader(), { spriteIds: unit.ids });
            case "icons":
                // Stackables like coins have a model per stack size
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
        if (unit.recipe !== undefined) {
            const {
                installRecipeInSceneBuilder,
            }: typeof import("../../src/game/scaperune/squares") = await import(SQUARES);
            installRecipeInSceneBuilder(this.state.sceneBuilder, unit.id);
        }
        await this.load(new RegionDataLoader(), unit.region);

        const { plane, firstX, firstY, lastX, lastY } = getMapSquares(unit.region);
        for (let mapX = firstX - MAP_MARGIN; mapX <= lastX + MAP_MARGIN; mapX++) {
            for (let mapY = firstY - MAP_MARGIN; mapY <= lastY + MAP_MARGIN; mapY++) {
                // GameWebGLRenderer's settings: keep them the same as the renderer's
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
        // The minimap's images
        for (let mapX = firstX; mapX <= lastX; mapX++) {
            for (let mapY = firstY; mapY <= lastY; mapY++) {
                await loadMinimapData(this.state, mapX, mapY, plane, true);
            }
        }
    }
}

// Every group the unit reads, sorted. One unit at a time: the reads are counted
// for the whole thread, so two at once would each miss what the other read.
export async function extractUnit(cache: LoadedCache, unit: SlimUnit): Promise<string[]> {
    if (reading) {
        throw new Error("Already extracting a unit: extract one at a time");
    }
    const reads = new Set<string>();
    reading = reads;
    const readGroup = MemoryStore.prototype.read;
    MemoryStore.prototype.read = function (indexId, archiveId) {
        reading?.add(`${indexId}:${archiveId}`);
        return readGroup.call(this, indexId, archiveId);
    };
    try {
        const shared = getSharedTypeLoaders(cache);
        shared.reads.forEach((key) => reads.add(key));
        await new SlimLoader(cache, shared.loaders).run(unit);
        return [...reads].sort();
    } finally {
        MemoryStore.prototype.read = readGroup;
        reading = undefined;
    }
}
