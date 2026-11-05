// Holds the hand-written loc tables of the maps that build without the cache to the cache: the
// Sisterhood Sanctuary's and the Owl's Court's. Their tests build them from SOLID_LOCS (each one's
// size) and WALK_THROUGH (what doesn't block), so a cache update that changes a size or a clip
// would leave the tests passing on a map that's wrong. Builds each map with the cache, then checks
// by getCollisionFlags' own rules that every SOLID_LOCS size is the cache's, and that each one
// blocks as it's placed and each WALK_THROUGH one doesn't. Fails if any is out.
//
//   npx tsx scripts/scaperune/check-solid-locs.ts
import { getLocBlocking } from "../../src/game/scaperune/collision";
import { LOC_NORMAL } from "../../src/game/scaperune/mapBuild";
import * as owlsCourt from "../../src/game/scaperune/maps/owlsCourt";
import * as sanctuary from "../../src/game/scaperune/maps/sisterhoodSanctuary";
import type { MapRecipe } from "../../src/game/scaperune/recipe";
import { createBuildContext } from "../../src/game/scaperune/squares";
import { createSceneBuilder, loadGameCache } from "../cache/scene-util";

type Table = {
    name: string;
    recipe: MapRecipe;
    solid: [id: number, sizeX: number, sizeY: number][];
    walkThrough: number[];
};
const TABLES: Table[] = [
    {
        name: "The Sanctuary's",
        recipe: sanctuary.SISTERHOOD_SANCTUARY,
        solid: sanctuary.SOLID_LOCS,
        walkThrough: sanctuary.WALK_THROUGH,
    },
    {
        name: "The Owl's Court's",
        recipe: owlsCourt.OWLS_COURT_RECIPE,
        solid: owlsCourt.SOLID_LOCS,
        walkThrough: owlsCourt.WALK_THROUGH,
    },
];

const { mapFileLoader, locTypeLoader } = createSceneBuilder(loadGameCache());
const context = createBuildContext(mapFileLoader, locTypeLoader);
let failed = false;

for (const table of TABLES) {
    const problems: string[] = [];
    for (const [id, sizeX, sizeY] of table.solid) {
        const info = context.locs(id);
        if (info.sizeX !== sizeX || info.sizeY !== sizeY) {
            problems.push(
                `${id} ${info.name}: ${sizeX}x${sizeY} here, ${info.sizeX}x${info.sizeY} in the cache`,
            );
        }
        // Solid things are all put down as normal locs
        if (getLocBlocking(LOC_NORMAL, info) !== "tiles") {
            problems.push(
                `${id} ${info.name} is in SOLID_LOCS but doesn't block (clip ${info.clipType})`,
            );
        }
    }

    // As placed: the same id can be a normal loc in one place and floor decoration in another
    const solid = new Set(table.solid.map(([id]) => id));
    const walkThrough = new Set(table.walkThrough);
    const seen = new Set<string>();
    const map = table.recipe.detail!(context);
    for (const loc of map.grid.locs) {
        const key = `${loc.id}:${loc.type}`;
        if (seen.has(key) || !(solid.has(loc.id) || walkThrough.has(loc.id))) {
            continue;
        }
        seen.add(key);
        const info = context.locs(loc.id);
        const blocks = getLocBlocking(loc.type, info) === "tiles";
        if (solid.has(loc.id) && !blocks) {
            problems.push(
                `${loc.id} ${info.name} is in SOLID_LOCS but doesn't block as type ${loc.type}`,
            );
        }
        if (walkThrough.has(loc.id) && blocks) {
            problems.push(
                `${loc.id} ${info.name} is in WALK_THROUGH but blocks as type ${loc.type}`,
            );
        }
    }
    const unplaced = [...solid, ...walkThrough].filter(
        (id) => ![...seen].some((key) => key.startsWith(`${id}:`)),
    );

    for (const problem of problems) {
        console.log(`  ${problem}`);
    }
    console.log(
        `${table.name}: ${table.solid.length} solid, ${table.walkThrough.length} walk-through, ` +
            `${seen.size} placed as (id, type), ${unplaced.length} never placed` +
            (unplaced.length ? ` (${unplaced.join(", ")})` : ""),
    );
    if (problems.length > 0) {
        console.log(`${table.name} loc table: ${problems.length} out of step with the cache`);
        failed = true;
    } else {
        console.log(`${table.name} loc table matches the cache`);
    }
}
if (failed) {
    process.exit(1);
}
