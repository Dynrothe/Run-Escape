import { CacheSystem } from "../../rs/cache/CacheSystem";
import {
    CacheLoaderFactory,
    getCacheLoaderFactory,
} from "../../rs/cache/loader/CacheLoaderFactory";
import { BasTypeLoader } from "../../rs/config/bastype/BasTypeLoader";
import { FloorTypeLoader, OverlayFloorTypeLoader } from "../../rs/config/floortype/FloorTypeLoader";
import { LocModelLoader } from "../../rs/config/loctype/LocModelLoader";
import { LocTypeLoader } from "../../rs/config/loctype/LocTypeLoader";
import { NpcModelLoader } from "../../rs/config/npctype/NpcModelLoader";
import { NpcTypeLoader } from "../../rs/config/npctype/NpcTypeLoader";
import { ObjModelLoader } from "../../rs/config/objtype/ObjModelLoader";
import { ObjTypeLoader } from "../../rs/config/objtype/ObjTypeLoader";
import { SeqTypeLoader } from "../../rs/config/seqtype/SeqTypeLoader";
import { VarManager } from "../../rs/config/vartype/VarManager";
import { VarBitTypeLoader } from "../../rs/config/vartype/bit/VarBitTypeLoader";
import { MapImageRenderer } from "../../rs/map/MapImageRenderer";
import { SeqFrameLoader } from "../../rs/model/seq/SeqFrameLoader";
import { SkeletalSeqLoader } from "../../rs/model/skeletal/SkeletalSeqLoader";
import { SceneBuilder } from "../../rs/scene/SceneBuilder";
import { TextureLoader } from "../../rs/texture/TextureLoader";
import { LoadedCache } from "../Caches";
import { NpcSpawn } from "../data/npc/NpcSpawn";
import { ObjSpawn } from "../data/obj/ObjSpawn";

export type WorkerState = {
    cache: LoadedCache;
    cacheSystem: CacheSystem;
    cacheLoaderFactory: CacheLoaderFactory;

    locTypeLoader: LocTypeLoader;
    objTypeLoader: ObjTypeLoader;
    npcTypeLoader: NpcTypeLoader;

    seqTypeLoader: SeqTypeLoader;
    basTypeLoader: BasTypeLoader;

    textureLoader: TextureLoader;
    seqFrameLoader: SeqFrameLoader;
    skeletalSeqLoader: SkeletalSeqLoader | undefined;

    locModelLoader: LocModelLoader;
    objModelLoader: ObjModelLoader;
    npcModelLoader: NpcModelLoader;

    sceneBuilder: SceneBuilder;

    varManager: VarManager;

    mapImageRenderer: MapImageRenderer;
    mapImageCache: Cache;

    objSpawns: ObjSpawn[];
    npcSpawns: NpcSpawn[];
};

// The config type loaders, which can take a while to make: a script can make
// them once and share them between states (slim-load.ts)
export type TypeLoaders = {
    underlayTypeLoader: FloorTypeLoader;
    overlayTypeLoader: OverlayFloorTypeLoader;
    varBitTypeLoader: VarBitTypeLoader;
    locTypeLoader: LocTypeLoader;
    objTypeLoader: ObjTypeLoader;
    npcTypeLoader: NpcTypeLoader;
    seqTypeLoader: SeqTypeLoader;
};

export function createTypeLoaders(loaderFactory: CacheLoaderFactory): TypeLoaders {
    return {
        underlayTypeLoader: loaderFactory.getUnderlayTypeLoader(),
        overlayTypeLoader: loaderFactory.getOverlayTypeLoader(),
        varBitTypeLoader: loaderFactory.getVarBitTypeLoader(),
        locTypeLoader: loaderFactory.getLocTypeLoader(),
        objTypeLoader: loaderFactory.getObjTypeLoader(),
        npcTypeLoader: loaderFactory.getNpcTypeLoader(),
        seqTypeLoader: loaderFactory.getSeqTypeLoader(),
    };
}

// The loaders a render worker works with. Also built in Node by the slim cache
// script, to load what the game loads.
export function createWorkerState(
    cache: LoadedCache,
    objSpawns: ObjSpawn[],
    npcSpawns: NpcSpawn[],
    mapImageCache: Cache,
    typeLoaders: Partial<TypeLoaders> = {},
): WorkerState {
    const cacheSystem = CacheSystem.fromFiles(cache.type, cache.files);

    const loaderFactory = getCacheLoaderFactory(cache.info, cacheSystem);
    const underlayTypeLoader =
        typeLoaders.underlayTypeLoader ?? loaderFactory.getUnderlayTypeLoader();
    const overlayTypeLoader = typeLoaders.overlayTypeLoader ?? loaderFactory.getOverlayTypeLoader();

    const varBitTypeLoader = typeLoaders.varBitTypeLoader ?? loaderFactory.getVarBitTypeLoader();

    const locTypeLoader = typeLoaders.locTypeLoader ?? loaderFactory.getLocTypeLoader();
    const objTypeLoader = typeLoaders.objTypeLoader ?? loaderFactory.getObjTypeLoader();
    const npcTypeLoader = typeLoaders.npcTypeLoader ?? loaderFactory.getNpcTypeLoader();

    const basTypeLoader = loaderFactory.getBasTypeLoader();

    const modelLoader = loaderFactory.getModelLoader();
    const textureLoader = loaderFactory.getTextureLoader();

    const seqTypeLoader = typeLoaders.seqTypeLoader ?? loaderFactory.getSeqTypeLoader();
    const seqFrameLoader = loaderFactory.getSeqFrameLoader();
    const skeletalSeqLoader = loaderFactory.getSkeletalSeqLoader();

    const mapFileLoader = loaderFactory.getMapFileLoader();

    const varManager = new VarManager(varBitTypeLoader);
    const questTypeLoader = loaderFactory.getQuestTypeLoader();
    if (questTypeLoader) {
        varManager.setQuestsCompleted(questTypeLoader);
    }

    const locModelLoader = new LocModelLoader(
        locTypeLoader,
        modelLoader,
        textureLoader,
        seqTypeLoader,
        seqFrameLoader,
        skeletalSeqLoader,
    );

    const objModelLoader = new ObjModelLoader(objTypeLoader, modelLoader, textureLoader);

    const npcModelLoader = new NpcModelLoader(
        npcTypeLoader,
        modelLoader,
        textureLoader,
        seqTypeLoader,
        seqFrameLoader,
        skeletalSeqLoader,
        varManager,
    );

    const sceneBuilder = new SceneBuilder(
        cache.info,
        mapFileLoader,
        underlayTypeLoader,
        overlayTypeLoader,
        locTypeLoader,
        locModelLoader,
        cache.xteas,
    );

    // Only for minimap images, and its sprites are loaded with it
    let mapImageRenderer: MapImageRenderer | undefined;

    return {
        cache,
        cacheSystem,
        cacheLoaderFactory: loaderFactory,

        locTypeLoader,
        objTypeLoader,
        npcTypeLoader,

        seqTypeLoader,
        basTypeLoader,

        textureLoader,
        seqFrameLoader,
        skeletalSeqLoader,

        locModelLoader,
        objModelLoader,
        npcModelLoader,

        sceneBuilder,

        varManager,

        get mapImageRenderer(): MapImageRenderer {
            if (!mapImageRenderer) {
                mapImageRenderer = new MapImageRenderer(
                    textureLoader,
                    locTypeLoader,
                    loaderFactory.getMapScenes(),
                    loaderFactory.getMapFunctions(),
                );
            }
            return mapImageRenderer;
        },
        mapImageCache,

        objSpawns,
        npcSpawns,
    };
}

// After each load, so the model caches don't grow over a session
export function clearWorkerStateCaches(workerState: WorkerState): void {
    workerState.locModelLoader.clearCache();
    workerState.objModelLoader.clearCache();
    workerState.npcModelLoader.clearCache();
    workerState.seqFrameLoader.clearCache();
    workerState.skeletalSeqLoader?.clearCache();
}
