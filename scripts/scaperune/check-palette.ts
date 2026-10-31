// Checks that the palette map reads everything generated maps read, so that a
// slim cache with the palette in it can serve any seed. Loads each map the way
// the slim cache does and compares the cache groups they touch.
//
//   npx tsx scripts/scaperune/check-palette.ts
import { BIOMES, BiomeId } from "../../src/game/scaperune/biomes";
import { GeneratorSettings, generatedRecipe } from "../../src/game/scaperune/generator";
import { PALETTE_RECIPE } from "../../src/game/scaperune/palette";
import { MapRecipe } from "../../src/game/scaperune/recipe";
import { buildRecipeSquares, createBuildContext } from "../../src/game/scaperune/squares";
import { LoadedCache } from "../../src/mapviewer/Caches";
import { SdMapDataLoader } from "../../src/mapviewer/webgl/loader/SdMapDataLoader";
import { clearWorkerStateCaches, createWorkerState } from "../../src/mapviewer/worker/WorkerState";
import { MemoryStore } from "../../src/rs/cache/store/MemoryStore";
import { Bzip2 } from "../../src/rs/compression/Bzip2";
import { Gzip } from "../../src/rs/compression/Gzip";
import { addCustomMapSquares } from "../../src/rs/map/CustomMapFileLoader";
import { Hasher } from "../../src/util/Hasher";
import { loadGameCache } from "../cache/scene-util";

// As in slim-cache.ts: the map loaders draw on a canvas Node doesn't have
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

const reads = new Set<string>();
const readGroup = MemoryStore.prototype.read;
MemoryStore.prototype.read = function (indexId: number, archiveId: number): Int8Array {
    reads.add(indexId + ":" + archiveId);
    return readGroup.call(this, indexId, archiveId);
};

async function readsOf(cache: LoadedCache, recipe: MapRecipe): Promise<Set<string>> {
    const state = createWorkerState(cache, [], [], undefined as unknown as Cache);
    const { sceneBuilder, locTypeLoader } = state;
    const squares = buildRecipeSquares(
        recipe,
        createBuildContext(sceneBuilder.mapFileLoader, locTypeLoader),
    );
    addCustomMapSquares(sceneBuilder.mapFileLoader, squares);
    reads.clear();
    const mapLoader = new SdMapDataLoader();
    mapLoader.init();
    const { log, time, timeEnd } = console;
    console.log = console.time = console.timeEnd = () => {};
    try {
        for (const id of squares.keys()) {
            await mapLoader.load(state, {
                mapX: id >> 8,
                mapY: id & 0xff,
                minLevel: 0,
                maxLevel: 0,
                loadObjs: false,
                loadNpcs: false,
                smoothTerrain: false,
                minimizeDrawCalls: false,
                loadedTextureIds: new Set<number>(),
            });
            clearWorkerStateCaches(state);
        }
    } finally {
        Object.assign(console, { log, time, timeEnd });
    }
    return new Set(reads);
}

async function main(): Promise<void> {
    await Hasher.init();
    await Promise.all([Bzip2.initWasm(), Gzip.initWasm()]);
    const cache = loadGameCache();
    const palette = await readsOf(cache, PALETTE_RECIPE);
    console.log(`Palette reads ${palette.size} groups`);
    const maps: Partial<GeneratorSettings>[] = [
        { biome: "meadow", rivers: 2, buildings: 1 },
        { biome: "desert", island: 0, buildings: 1, trees: 1, rocks: 1 },
        { biome: "swamp", rivers: 1, ponds: 5, buildings: 1 },
        { biome: "snow", rivers: 1, buildings: 1, trees: 1, rocks: 1 },
        { biome: "meadow", mountains: 0.8, snow: 0.8, rubble: 1, caves: 1, buildings: 1 },
        { biome: "desert", mesas: 8, canyons: 2, rubble: 1, caves: 1, boundary: "mountains" },
        {
            biome: "swamp",
            volcanoes: 1,
            mountains: 0.6,
            rubble: 1,
            caves: 1,
            squaresX: 3,
            squaresY: 3,
        },
        { biome: "snow", mountains: 0.8, snow: 1, rubble: 1, caves: 1 },
        // Each of the others, with everything of theirs turned up
        ...(Object.keys(BIOMES) as BiomeId[]).slice(4).map(
            (biome): Partial<GeneratorSettings> => ({
                biome,
                // A chasm cuts more off than a sea does
                island: BIOMES[biome].chasm ? 0.1 : 0.3,
                mountains: BIOMES[biome].chasm ? 0.2 : 0.5,
                rubble: 1,
                caves: 1,
                ponds: BIOMES[biome].chasm ? 0 : 6,
                lakes: BIOMES[biome].chasm ? 0 : 2,
                rivers: BIOMES[biome].chasm ? 0 : 1,
                buildings: 1,
                trees: 1,
                rocks: 1,
                grass: 1,
                flowers: 1,
                props: 1,
                landmarks: 1,
                ruins: 1,
                gardens: 1,
                waymarkers: 1,
                towns: 1,
                townWalls: 1,
                squaresX: 3,
                squaresY: 3,
            }),
        ),
    ];
    let missing = 0;
    for (let i = 0; i < maps.length; i++) {
        const recipe = generatedRecipe("check", 90, 110, { seed: 100 + i, ...maps[i] });
        const groups = await readsOf(cache, recipe);
        const extra = [...groups].filter((key) => !palette.has(key));
        console.log(`${maps[i].biome}: ${groups.size} groups, ${extra.length} not in the palette`);
        if (extra.length > 0) {
            console.log(`  ${extra.slice(0, 20).join(" ")}`);
        }
        missing += extra.length;
    }
    if (missing > 0) {
        process.exit(1);
    }
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
