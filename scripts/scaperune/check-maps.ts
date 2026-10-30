// Checks every ScapeRune map, and a few more seeds, with the game's own collision:
// every open tile must reach the spawn. Fails if one doesn't.
//
//   npx tsx scripts/scaperune/check-maps.ts
import { ArenaGrid } from "../../src/game/core/world/ArenaGrid";
import { countStranded } from "../../src/game/scaperune/collision";
import { generatedRecipe } from "../../src/game/scaperune/generator";
import { SCAPERUNE_DEV_MAPS } from "../../src/game/scaperune/maps/devMaps";
import { getRecipeArena, getRecipeWorldTile } from "../../src/game/scaperune/recipe";
import { buildRecipeSquares, createBuildContext } from "../../src/game/scaperune/squares";
import { buildRegionData } from "../../src/mapviewer/worker/RegionDataLoader";
import { addCustomMapSquares } from "../../src/rs/map/CustomMapFileLoader";
import { createSceneBuilder, createVarManager, loadGameCache } from "../cache/scene-util";

const GENERATED = /^scaperune_(?!palette)/;

const cache = loadGameCache();
const recipes = [
    ...SCAPERUNE_DEV_MAPS.filter((recipe) => GENERATED.test(recipe.id)),
    generatedRecipe("seed_11", 90, 110, { seed: 11, biome: "meadow", island: 0, rivers: 2 }),
    generatedRecipe("seed_12", 90, 110, { seed: 12, biome: "desert", rivers: 1, buildings: 1 }),
    generatedRecipe("seed_13", 90, 110, { seed: 13, biome: "swamp", island: 0.6, ponds: 6 }),
    generatedRecipe("seed_14", 90, 110, { seed: 14, biome: "snow", squares: 1, island: 1 }),
];

let failed = false;
for (const recipe of recipes) {
    const sceneBuilder = createSceneBuilder(cache);
    const { mapFileLoader, locTypeLoader } = sceneBuilder;
    const context = createBuildContext(mapFileLoader, locTypeLoader);
    addCustomMapSquares(mapFileLoader, buildRecipeSquares(recipe, context));
    const region = { ...getRecipeArena(recipe), plane: 0 };
    const grid = new ArenaGrid(buildRegionData(sceneBuilder, createVarManager(cache), region));
    const spawn = getRecipeWorldTile(recipe, recipe.spawn.x, recipe.spawn.y);
    const { open, stranded } = countStranded(grid, spawn.x, spawn.y);
    console.log(`${recipe.id}: ${open} open, ${stranded} stranded`);
    failed ||= stranded > 0 || open < 200;
}
if (failed) {
    console.log("Some maps have open tiles that can't reach the spawn");
    process.exit(1);
}
console.log("All open tiles reach the spawn");
