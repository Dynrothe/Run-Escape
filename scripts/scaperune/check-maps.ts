// Checks every ScapeRune map, and a few more seeds, with the game's own collision:
// every open tile must reach the spawn. Also that a road runs straight off both ends of
// each bridge, the width of the gap in its fences. Fails if not.
//
//   npx tsx scripts/scaperune/check-maps.ts
import { ArenaGrid } from "../../src/game/core/world/ArenaGrid";
import { countStranded } from "../../src/game/scaperune/collision";
import { TILE_BRIDGE, TileGrid } from "../../src/game/scaperune/format";
import { generatedRecipe } from "../../src/game/scaperune/generator";
import { SCAPERUNE_DEV_MAPS } from "../../src/game/scaperune/maps/devMaps";
import { getRecipeArena, getRecipeWorldTile } from "../../src/game/scaperune/recipe";
import { buildRecipeSquares, createBuildContext } from "../../src/game/scaperune/squares";
import { buildRegionData } from "../../src/mapviewer/worker/RegionDataLoader";
import { addCustomMapSquares } from "../../src/rs/map/CustomMapFileLoader";
import { createSceneBuilder, createVarManager, loadGameCache } from "../cache/scene-util";

const GENERATED = /^scaperune_(?!palette|prefabs)/;

const cache = loadGameCache();
const recipes = [
    ...SCAPERUNE_DEV_MAPS.filter((recipe) => GENERATED.test(recipe.id)),
    generatedRecipe("seed_11", 90, 110, { seed: 11, biome: "meadow", island: 0, rivers: 2 }),
    generatedRecipe("seed_12", 90, 110, { seed: 12, biome: "desert", rivers: 1, buildings: 1 }),
    generatedRecipe("seed_13", 90, 110, { seed: 13, biome: "swamp", island: 0.6, ponds: 6 }),
    generatedRecipe("seed_14", 90, 110, { seed: 14, biome: "snow", squares: 1, island: 1 }),
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

let failed = false;
for (const recipe of recipes) {
    const sceneBuilder = createSceneBuilder(cache);
    const { mapFileLoader, locTypeLoader } = sceneBuilder;
    const context = createBuildContext(mapFileLoader, locTypeLoader);
    addCustomMapSquares(mapFileLoader, buildRecipeSquares(recipe, context));
    const bridges = checkBridgeRoads(recipe.build(context));
    const region = { ...getRecipeArena(recipe), plane: 0 };
    const grid = new ArenaGrid(buildRegionData(sceneBuilder, createVarManager(cache), region));
    const spawn = getRecipeWorldTile(recipe, recipe.spawn.x, recipe.spawn.y);
    const { open, stranded } = countStranded(grid, spawn.x, spawn.y);
    const [eastWest, northSouth] = bridges.ways;
    console.log(
        `${recipe.id}: ${open} open, ${stranded} stranded, ` +
            `bridges ${eastWest} east-west and ${northSouth} north-south`,
    );
    for (const problem of bridges.problems.slice(0, 6)) {
        console.log(`  ${problem}`);
    }
    failed ||= stranded > 0 || open < 200 || bridges.problems.length > 0;
}
if (failed) {
    console.log("Some maps failed");
    process.exit(1);
}
console.log("All open tiles reach the spawn");
