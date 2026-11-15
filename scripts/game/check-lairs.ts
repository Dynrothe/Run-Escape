// Every lair's boss (MapDef.lairs) has room on its map: it fits where it rises (LairDef.at), and
// one that moves fits all along the straight way from there to where its fight starts
// (LairDef.start). The flow field steers by single tiles, so a boss wider than a gap sticks in
// it, and one that doesn't fit at its spot rises at the nearest that does, maybe outside its lair
// (the church's pews, for K'ril; a burnt skeleton on the Exchange's counter, for Xarth). Builds
// each map's collision as the sims do (collision-snapshot.ts), so it needs the game's cache.
//
//   bun run tsx scripts/game/check-lairs.ts                     # every map with lairs
//   bun run tsx scripts/game/check-lairs.ts battle_for_varrock
import { getEnemy } from "../../src/game/content/enemies";
import { ALL_MAPS } from "../../src/game/content/maps";
import { ArenaGrid } from "../../src/game/core/world/ArenaGrid";
import { isCircleFree } from "../../src/game/core/world/Collision";
import { loadRegionData } from "./collision-snapshot";

const ids = process.argv.slice(2);
const maps = ALL_MAPS.filter(
    (map) => (map.lairs?.length ?? 0) > 0 && (ids.length === 0 || ids.includes(map.id)),
);
let failed = false;
for (const map of maps) {
    const grid = new ArenaGrid(loadRegionData(map));
    for (const lair of map.lairs!) {
        const def = getEnemy(lair.enemyId);
        const radius = def.radius;
        const { at, start } = lair;
        // One that stands where it rises only needs room there
        const moves = !def.stationary && def.speed > 0;
        const steps = moves ? Math.ceil(Math.hypot(start.x - at.x, start.y - at.y) * 4) : 0;
        const stuck: string[] = [];
        for (let i = 0; i <= steps; i++) {
            const x = at.x + (steps === 0 ? 0 : ((start.x - at.x) * i) / steps);
            const y = at.y + (steps === 0 ? 0 : ((start.y - at.y) * i) / steps);
            if (!isCircleFree(grid, x, y, radius)) {
                stuck.push(`${x.toFixed(2)},${y.toFixed(2)}`);
            }
        }
        if (stuck.length > 0) {
            failed = true;
            console.log(
                `${map.id} ${lair.id}: no room for a radius of ${radius} at ${stuck.slice(0, 6).join(" ")}` +
                    (stuck.length > 6 ? ` and ${stuck.length - 6} more` : ""),
            );
        } else {
            console.log(`${map.id} ${lair.id}: room ${moves ? "all the way" : "where it rises"}`);
        }
    }
}
if (failed) {
    process.exitCode = 1;
} else {
    console.log("Every lair's boss has room");
}
