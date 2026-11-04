// Prints a SHA-256 of what a recipe writes, square by square and for the whole map, so that a
// change meant to leave a map alone can prove it did. Shipped maps mustn't move: CHECK=1 holds
// each one to its hash below, and generator.test.ts runs that when the cache is there.
//
//   npx tsx scripts/scaperune/grid-hash.ts halloween [scaperune_ysmar ...]
//   VERBOSE=1 npx tsx scripts/scaperune/grid-hash.ts halloween    # each square's too
//   CHECK=1 npx tsx scripts/scaperune/grid-hash.ts                # every shipped map, against SHIPPED_HASHES
import crypto from "node:crypto";

import { SCAPERUNE_MAPS } from "../../src/game/scaperune/maps/shippedMaps";
import {
    buildRecipeSquares,
    createBuildContext,
    getRecipe,
} from "../../src/game/scaperune/squares";
import { createSceneBuilder, loadGameCache } from "../cache/scene-util";

// What each shipped map writes today. A change that's meant to change a shipped map updates its
// hash here on purpose, in the same pull request, and says why. Anything else must leave these be.
const SHIPPED_HASHES: Record<string, string> = {
    halloween: "f7f79aaf1942a939f48e72ce69335a9a12bd5e671043f00684f9098d56f2f023",
    phosani: "4f6fcdf2dee1830db95a1c3e1cac27549d1bcaac9ccc1242fce3c148479625c1",
    theatre_of_blood: "e846bfdc8dc8abf583ebe7de484d248c1cd31ba35393ada5b24893517c510973",
    zachariah: "d05c530aae4a0a66171eba28a4d3a867abf55634226b874b812724612549e9b8",
};

const check = !!process.env.CHECK;
const ids = process.argv.slice(2);
if (ids.length === 0) {
    ids.push(...(check ? SCAPERUNE_MAPS.map((recipe) => recipe.id) : ["halloween"]));
}
const { mapFileLoader, locTypeLoader } = createSceneBuilder(loadGameCache());
const context = createBuildContext(mapFileLoader, locTypeLoader);
const wrong: string[] = [];
for (const id of ids) {
    const recipe = getRecipe(id);
    if (!recipe) {
        throw new Error(`No recipe called ${id}`);
    }
    const squares = buildRecipeSquares(recipe, context);
    const whole = crypto.createHash("sha256");
    for (const [square, { terrain, locs }] of [...squares].sort((a, b) => a[0] - b[0])) {
        const one = crypto.createHash("sha256").update(terrain).update(locs).digest("hex");
        whole.update(one);
        if (process.env.VERBOSE) {
            console.log(`  ${square}: ${one}`);
        }
    }
    const hash = whole.digest("hex");
    if (!check) {
        console.log(`${id}: ${hash}`);
        continue;
    }
    const pinned = SHIPPED_HASHES[id];
    if (pinned === hash) {
        console.log(`${id}: ${hash} (as pinned)`);
    } else {
        console.log(`${id}: ${hash}, but ${pinned ? `${pinned} is pinned` : "nothing is pinned"}`);
        wrong.push(id);
    }
}
if (check) {
    // A shipped map with no hash isn't held to anything
    for (const recipe of SCAPERUNE_MAPS) {
        if (!SHIPPED_HASHES[recipe.id] && !wrong.includes(recipe.id)) {
            console.log(`${recipe.id} ships, but has no pinned hash`);
            wrong.push(recipe.id);
        }
    }
    if (wrong.length > 0) {
        console.log(
            `Changed or unpinned: ${wrong.join(", ")}. Update SHIPPED_HASHES only on purpose.`,
        );
        process.exitCode = 1;
    } else {
        console.log("Every shipped map matches its pinned hash");
    }
}
