// Flat faces of two locs in one plane, which z-fight: the floor flickers as the camera moves (see
// src/game/scaperune/coplanar.ts). Builds each map's scene as the renderer does and prints every
// pair of locs that meet in one plane, with where. Pairs cut whole from a real place (both locs
// stamped) are the real world's own, and only printed. check-maps.ts runs the same check.
//
//   npx tsx scripts/scaperune/check-coplanar.ts                  # every shipped map
//   npx tsx scripts/scaperune/check-coplanar.ts zachariah scaperune_town
//   CHECK=1 npx tsx scripts/scaperune/check-coplanar.ts          # fails on any pair we placed
import { describeCoplanar, findMapCoplanar } from "../../src/game/scaperune/coplanar";
import { SCAPERUNE_MAPS } from "../../src/game/scaperune/maps/shippedMaps";
import {
    buildRecipeSquares,
    createBuildContext,
    getRecipe,
} from "../../src/game/scaperune/squares";
import { addCustomMapSquares } from "../../src/rs/map/CustomMapFileLoader";
import { createSceneBuilder, loadGameCache } from "../cache/scene-util";

const ids = process.argv.slice(2);
if (ids.length === 0) {
    ids.push(...SCAPERUNE_MAPS.map((recipe) => recipe.id));
}
const cache = loadGameCache();
let failed = false;
for (const id of ids) {
    const recipe = getRecipe(id);
    if (!recipe) {
        throw new Error(`No recipe called ${id}`);
    }
    const sceneBuilder = createSceneBuilder(cache);
    const { mapFileLoader, locTypeLoader } = sceneBuilder;
    const context = createBuildContext(mapFileLoader, locTypeLoader);
    const grid = recipe.detail ? recipe.detail(context).grid : recipe.build(context);
    addCustomMapSquares(
        mapFileLoader,
        buildRecipeSquares({ ...recipe, build: () => grid }, context),
    );
    const { models, found } = findMapCoplanar(sceneBuilder, recipe, grid);
    const ours = found.filter((pair) => !pair.stamped);
    console.log(
        `${id}: ${models} models, ${found.length} pairs in one plane` +
            (found.length > ours.length ? ` (${found.length - ours.length} as cut)` : ""),
    );
    for (const line of describeCoplanar(found).slice(0, Number(process.env.SHOW ?? 16))) {
        console.log(`  ${line}`);
    }
    failed ||= ours.length > 0;
}
if (process.env.CHECK === "1" && failed) {
    console.log("Locs we placed z-fight");
    process.exit(1);
}
