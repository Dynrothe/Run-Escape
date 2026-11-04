// Holds the Sisterhood Sanctuary's hand-written loc table to the cache. Its test builds the map
// without the cache from SOLID_LOCS (each one's size) and WALK_THROUGH (what doesn't block), so a
// cache update that changes a size or a clip would leave the test passing on a map that's wrong.
// Builds the map with the cache, then checks by getCollisionFlags' own rules that every SOLID_LOCS
// size is the cache's, and that each one blocks as it's placed and each WALK_THROUGH one doesn't.
// Fails if any is out.
//
//   npx tsx scripts/scaperune/check-solid-locs.ts
import { getLocBlocking } from "../../src/game/scaperune/collision";
import { LOC_NORMAL } from "../../src/game/scaperune/mapBuild";
import {
    SISTERHOOD_SANCTUARY,
    SOLID_LOCS,
    WALK_THROUGH,
} from "../../src/game/scaperune/maps/sisterhoodSanctuary";
import { createBuildContext } from "../../src/game/scaperune/squares";
import { createSceneBuilder, loadGameCache } from "../cache/scene-util";

const { mapFileLoader, locTypeLoader } = createSceneBuilder(loadGameCache());
const context = createBuildContext(mapFileLoader, locTypeLoader);
const problems: string[] = [];

for (const [id, sizeX, sizeY] of SOLID_LOCS) {
    const info = context.locs(id);
    if (info.sizeX !== sizeX || info.sizeY !== sizeY) {
        problems.push(
            `${id} ${info.name}: ${sizeX}x${sizeY} here, ${info.sizeX}x${info.sizeY} in the cache`,
        );
    }
    // The Sanctuary's solid() puts everything down as a normal loc
    if (getLocBlocking(LOC_NORMAL, info) !== "tiles") {
        problems.push(
            `${id} ${info.name} is in SOLID_LOCS but doesn't block (clip ${info.clipType})`,
        );
    }
}

// As placed: the same id can be a normal loc in one place and floor decoration in another
const solid = new Set(SOLID_LOCS.map(([id]) => id));
const walkThrough = new Set(WALK_THROUGH);
const seen = new Set<string>();
const map = SISTERHOOD_SANCTUARY.detail!(context);
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
        problems.push(`${loc.id} ${info.name} is in WALK_THROUGH but blocks as type ${loc.type}`);
    }
}
const unplaced = [...solid, ...walkThrough].filter(
    (id) => ![...seen].some((key) => key.startsWith(`${id}:`)),
);

for (const problem of problems) {
    console.log(`  ${problem}`);
}
console.log(
    `${SOLID_LOCS.length} solid, ${WALK_THROUGH.length} walk-through, ${seen.size} placed as ` +
        `(id, type), ${unplaced.length} never placed${unplaced.length ? ` (${unplaced.join(", ")})` : ""}`,
);
if (problems.length > 0) {
    console.log(`${problems.length} out of step with the cache`);
    process.exit(1);
}
console.log("The Sanctuary's loc table matches the cache");
