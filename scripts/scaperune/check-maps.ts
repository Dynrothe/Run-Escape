// Checks every generated dev map, and settings at their extremes, with the game's own
// collision: every open tile must reach the spawn. Also that a road runs straight off
// both ends of each bridge, the width of the gap in its fences, that no road goes through
// a building, that a building's road ends at its door, and that a building without one
// faces the nearest road. Fails if not.
//
//   npx tsx scripts/scaperune/check-maps.ts
import { ArenaGrid } from "../../src/game/core/world/ArenaGrid";
import { countStranded } from "../../src/game/scaperune/collision";
import { TILE_BRIDGE, TileGrid } from "../../src/game/scaperune/format";
import {
    DEFAULT_SETTINGS,
    FORD_HALF_WIDTH,
    GeneratedMap,
    GeneratorSettings,
    SETTING_PRESETS,
    generateMapDetail,
    generatedRecipe,
} from "../../src/game/scaperune/generator";
import { DEV_MAP_SETTINGS, SCAPERUNE_DEV_MAPS } from "../../src/game/scaperune/maps/devMaps";
import {
    BuildContext,
    MapRecipe,
    getRecipeArena,
    getRecipeWorldTile,
} from "../../src/game/scaperune/recipe";
import { buildRecipeSquares, createBuildContext } from "../../src/game/scaperune/squares";
import { buildRegionData } from "../../src/mapviewer/worker/RegionDataLoader";
import { addCustomMapSquares } from "../../src/rs/map/CustomMapFileLoader";
import { createSceneBuilder, createVarManager, loadGameCache } from "../cache/scene-util";

const GENERATED = /^scaperune_(?!palette|prefabs)/;

// Everywhere it can go wrong: every boundary and biome, and each setting at its worst,
// on small arenas and long thin ones
const SWEEP: Partial<GeneratorSettings>[] = [
    { biome: "meadow", island: 0, rivers: 2 },
    { biome: "desert", boundary: "forest", rivers: 1 },
    { biome: "swamp", boundary: "hills", rivers: 2, ponds: 6 },
    { biome: "snow", boundary: "fence", rivers: 1, buildings: 1 },
    { biome: "swamp", island: 0.6, ponds: 6 },
    { biome: "snow", squaresX: 1, squaresY: 1, island: 1 },
    { boundary: "forest", squaresX: 1, squaresY: 4, rivers: 2 },
    { boundary: "hills", squaresX: 5, squaresY: 1, rivers: 2, buildings: 1 },
    { boundary: "fence", boundaryDepth: 32, squaresX: 3, squaresY: 3 },
    { boundary: "forest", boundaryDepth: 32, squaresX: 1, squaresY: 1 },
    { rivers: 4, riverWidth: 20, squaresX: 3, squaresY: 3 },
    { rivers: 4, riverWidth: 4, lakes: 8, ponds: 16, squaresX: 3, squaresY: 3 },
    { waterLevel: 0.5, squaresX: 3, squaresY: 3, buildings: 1 },
    { waterLevel: 0.7, island: 0.5 },
    { buildings: 1, roads: 1, roadWidth: 6, roadStyle: "ring", squaresX: 3, squaresY: 3 },
    { buildings: 1, roads: 1, roadWidth: 6, roadStyle: "spine", squaresX: 3, squaresY: 3 },
    { buildings: 1, roads: 1, roadCurviness: 1, gardens: 1, rivers: 2 },
    { buildings: 1, roads: 0.5, towns: 8, townSize: 10, squaresX: 3, squaresY: 3 },
    { buildings: 1, roads: 0, towns: 1, townSize: 10, gardens: 1 },
    { buildings: 1, anyBuildings: true, ruins: 1, gardens: 1, roads: 1, roadStyle: "ring" },
    { buildings: 1, houses: false, shops: false },
    { trees: 1, treeClumping: 1, rocks: 1, grass: 1, flowers: 1, boundary: "forest" },
    { hills: 1, hillScale: 10, boundary: "hills", boundaryDepth: 32 },
    { secondBiome: "desert", biomeMix: 1, boundary: "forest", buildings: 1 },
    { spawnX: 0, spawnY: 1, rivers: 2, island: 0.5, buildings: 1 },
    { spawnX: 1, spawnY: 0, boundary: "forest", boundaryDepth: 32 },
];

// Tiles past the end of a deck that must be whole road, and that must have nothing
// beside them: past the fences, which end 3 or 4 tiles off the deck. Further on, another
// road can join it.
const ROAD_OFF_DECK = 7;
const ROAD_ALONE_OFF_DECK = 4;

// Problems with the roads off a grid's bridges, and how many ran each way
function checkBridgeRoads(grid: TileGrid): { problems: string[]; ways: number[] } {
    const { sizeX } = grid;
    const deck = new Set<number>();
    grid.levels[1].flags.forEach((flag, i) => {
        if (flag & TILE_BRIDGE) {
            deck.add(i);
        }
    });
    const problems: string[] = [];
    const ways = [0, 0];
    for (const start of deck) {
        // A bridge's tiles, flooding along the deck
        const tiles = [start];
        deck.delete(start);
        for (let at = 0; at < tiles.length; at++) {
            for (const i of [tiles[at] - 1, tiles[at] + 1, tiles[at] - sizeX, tiles[at] + sizeX]) {
                if (deck.delete(i)) {
                    tiles.push(i);
                }
            }
        }
        const xs = tiles.map((i) => i % sizeX);
        const ys = tiles.map((i) => Math.floor(i / sizeX));
        const [x0, x1, y0, y1] = [
            Math.min(...xs),
            Math.max(...xs),
            Math.min(...ys),
            Math.max(...ys),
        ];
        const eastWest = x1 - x0 > y1 - y0;
        ways[eastWest ? 0 : 1]++;
        const overlayAt = (along: number, across: number) => {
            const i = eastWest ? along + across * sizeX : across + along * sizeX;
            return { overlay: grid.levels[0].overlays[i], shape: grid.levels[0].shapes[i] };
        };
        const [first, last] = eastWest ? [x0, x1] : [y0, y1];
        const [low, high] = eastWest ? [y0, y1] : [x0, x1];
        for (const way of [-1, 1]) {
            const end = way < 0 ? first : last;
            for (let step = 1; step <= ROAD_OFF_DECK; step++) {
                const along = end + way * step;
                for (const across of [low, high]) {
                    const { overlay, shape } = overlayAt(along, across);
                    if (overlay === 0 || shape !== 0) {
                        problems.push(`gap at ${along},${across} off the deck isn't whole road`);
                    }
                }
                for (const across of [low - 1, high + 1]) {
                    if (step <= ROAD_ALONE_OFF_DECK && overlayAt(along, across).overlay !== 0) {
                        problems.push(`road outside the fences at ${along},${across}`);
                    }
                }
            }
        }
    }
    return { problems, ways };
}

// A road's tiles past its lead, which must be nowhere near a building's
function checkRoadsAndBuildings(map: GeneratedMap): string[] {
    const { grid, footprint, roadTiles, lines, buildings } = map;
    const { sizeX, sizeY } = grid;
    const problems: string[] = [];
    roadTiles.forEach((road, i) => {
        if (road && footprint[i]) {
            problems.push(`road painted on a building at ${i % sizeX},${Math.floor(i / sizeX)}`);
        }
    });
    for (const line of lines) {
        const reach = Math.ceil(line.halfWidth);
        for (const point of line.points.slice(line.lead)) {
            const px = Math.floor(point.x);
            const py = Math.floor(point.y);
            for (let y = py - reach; y <= py + reach; y++) {
                for (let x = px - reach; x <= px + reach; x++) {
                    const near = Math.hypot(x + 0.5 - point.x, y + 0.5 - point.y) <= line.halfWidth;
                    const onGrid = x >= 0 && y >= 0 && x < sizeX && y < sizeY;
                    if (near && onGrid && footprint[x + y * sizeX]) {
                        problems.push(`road runs through a building at ${x},${y}`);
                    }
                }
            }
        }
    }
    // Fords aren't roads
    const roadPoints = lines.filter((line) => line.halfWidth !== FORD_HALF_WIDTH);
    for (const building of buildings) {
        const { exit, name } = building;
        if (!exit) {
            problems.push(`${name} has no way out`);
            continue;
        }
        if (building.hasRoad) {
            const ends = lines.some(
                (line) =>
                    line.lead > 0 &&
                    Math.hypot(line.points[0].x - exit.x, line.points[0].y - exit.y) < 0.01,
            );
            if (!ends) {
                problems.push(`${name}'s road doesn't end at its door`);
            }
            continue;
        }
        // On its own: its door faces the nearest road, if there is one
        let toX = 0;
        let toY = 0;
        let best = Infinity;
        for (const line of roadPoints) {
            for (const point of line.points) {
                const distance = Math.hypot(point.x - exit.x, point.y - exit.y);
                if (distance < best) {
                    best = distance;
                    toX = point.x - exit.x;
                    toY = point.y - exit.y;
                }
            }
        }
        if (best !== Infinity && toX * exit.outX + toY * exit.outY <= 0) {
            problems.push(`${name} at ${building.x},${building.y} turns its door from the road`);
        }
    }
    return problems;
}

const cache = loadGameCache();

// Checks one map. Returns false if it fails.
function checkMap(
    id: string,
    mapDetail: (context: BuildContext) => GeneratedMap,
    recipe: MapRecipe,
) {
    const sceneBuilder = createSceneBuilder(cache);
    const { mapFileLoader, locTypeLoader } = sceneBuilder;
    const context = createBuildContext(mapFileLoader, locTypeLoader);
    let map: GeneratedMap;
    try {
        map = mapDetail(context);
    } catch (e) {
        // Settings can leave too little ground: that's an error to show, not a failure
        const message = e instanceof Error ? e.message : String(e);
        console.log(`${id}: refused: ${message}`);
        return message.includes("too little ground");
    }
    addCustomMapSquares(
        mapFileLoader,
        buildRecipeSquares({ ...recipe, build: () => map.grid }, context),
    );
    const region = { ...getRecipeArena(recipe), plane: 0 };
    const grid = new ArenaGrid(buildRegionData(sceneBuilder, createVarManager(cache), region));
    const spawn = getRecipeWorldTile(recipe, recipe.spawn.x, recipe.spawn.y);
    const { open, stranded } = countStranded(grid, spawn.x, spawn.y);
    const bridges = checkBridgeRoads(map.grid);
    const problems = [...bridges.problems, ...checkRoadsAndBuildings(map)];
    const [eastWest, northSouth] = bridges.ways;
    const roadless = map.buildings.filter((building) => !building.hasRoad).length;
    console.log(
        `${id}: ${open} open, ${stranded} stranded, bridges ${eastWest}+${northSouth}, ` +
            `${map.buildings.length} buildings (${roadless} without a road)`,
    );
    for (const problem of problems.slice(0, 6)) {
        console.log(`  ${problem}`);
    }
    return stranded === 0 && open >= 200 && problems.length === 0;
}

let failed = false;
for (const recipe of SCAPERUNE_DEV_MAPS.filter((map) => GENERATED.test(map.id))) {
    const settings = DEV_MAP_SETTINGS[recipe.id];
    failed =
        !checkMap(recipe.id, (context) => generateMapDetail(settings, context), recipe) || failed;
}
SWEEP.forEach((overrides, i) => {
    const settings: GeneratorSettings = { seed: 11 + i, ...DEFAULT_SETTINGS, ...overrides };
    const recipe = generatedRecipe("sweep", 70, 134, settings);
    const passed = checkMap(
        `sweep ${i} ${JSON.stringify(overrides)}`,
        (context) => generateMapDetail(settings, context),
        recipe,
    );
    failed = !passed || failed;
});
for (const [name, preset] of Object.entries(SETTING_PRESETS)) {
    const settings: GeneratorSettings = { seed: 3, ...DEFAULT_SETTINGS, ...preset };
    const recipe = generatedRecipe("preset", 70, 134, settings);
    const passed = checkMap(name, (context) => generateMapDetail(settings, context), recipe);
    failed = !passed || failed;
}
if (failed) {
    console.log("Some maps failed");
    process.exit(1);
}
console.log("All open tiles reach the spawn, and every road and door is where it should be");
