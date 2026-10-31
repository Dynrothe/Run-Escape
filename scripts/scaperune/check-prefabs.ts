// Checks every prefab in every rotation, stamped the way the generator stamps them:
// the whole of its floor comes with it, and it has a way out. Walks the walls itself,
// flooding in from outside, rather than trusting what getInsideTiles decided. A
// rectangle that cuts a wall off leaks and fails here. Fails if any does.
//
//   npx tsx scripts/scaperune/check-prefabs.ts
import { Ground } from "../../src/game/scaperune/Ground";
import { Exit, findExits } from "../../src/game/scaperune/building";
import { TileGrid } from "../../src/game/scaperune/format";
import { PREFABS, PrefabKit, isDoor } from "../../src/game/scaperune/prefabs";
import { BuildContext } from "../../src/game/scaperune/recipe";
import { createBuildContext } from "../../src/game/scaperune/squares";
import { createSceneBuilder, loadGameCache } from "../cache/scene-util";

const GROUND = 999;
const MARGIN = 6;
const SIDE_X = [-1, 0, 1, 0];
const SIDE_Y = [0, 1, 0, -1];
// Of the floor a stamp takes, the most that can be outside its walls (steps and paths).
// A town's paving round a building isn't taken, so it doesn't count.
const MAX_FLOOR_OUTSIDE = 0.25;

// The tiles no flood from outside the grid reaches, with walls, doors and the gaps
// doors leave all stopping it
function findEnclosed(prefab: TileGrid, exits: Exit[]): Set<number> {
    const { sizeX, sizeY } = prefab;
    const stops = new Set<string>();
    const stop = (x: number, y: number, side: number) => {
        stops.add(`${x},${y},${side}`);
        stops.add(`${x + SIDE_X[side]},${y + SIDE_Y[side]},${(side + 2) & 3}`);
    };
    for (const loc of prefab.locs) {
        if (loc.level === 0 && loc.type === 0) {
            stop(loc.x, loc.y, loc.rotation);
        } else if (loc.level === 0 && loc.type === 2) {
            stop(loc.x, loc.y, loc.rotation);
            stop(loc.x, loc.y, (loc.rotation + 1) & 3);
        } else if (loc.level === 0 && loc.type === 9) {
            for (let side = 0; side < 4; side++) {
                stop(loc.x, loc.y, side);
            }
        }
    }
    for (const exit of exits) {
        // Everything along the gap: it can be two tiles across
        const side = SIDE_X.findIndex((x, i) => x === exit.outX && SIDE_Y[i] === exit.outY);
        for (const offset of [-0.5, 0.5]) {
            const x = Math.floor(exit.x - exit.outX / 2 + (exit.outY !== 0 ? offset : 0));
            const y = Math.floor(exit.y - exit.outY / 2 + (exit.outX !== 0 ? offset : 0));
            stop(x, y, side);
        }
    }
    // A ring past the grid is all outside
    const key = (x: number, y: number) => x + 1 + (y + 1) * (sizeX + 2);
    const seen = new Set<number>();
    const queue: [number, number][] = [];
    for (let y = -1; y <= sizeY; y++) {
        for (let x = -1; x <= sizeX; x++) {
            if (x < 0 || y < 0 || x >= sizeX || y >= sizeY) {
                seen.add(key(x, y));
                queue.push([x, y]);
            }
        }
    }
    while (queue.length > 0) {
        const [x, y] = queue.pop()!;
        for (let side = 0; side < 4; side++) {
            const nx = x + SIDE_X[side];
            const ny = y + SIDE_Y[side];
            const onGrid = nx >= 0 && ny >= 0 && nx < sizeX && ny < sizeY;
            if (onGrid && !seen.has(key(nx, ny)) && !stops.has(`${x},${y},${side}`)) {
                seen.add(key(nx, ny));
                queue.push([nx, ny]);
            }
        }
    }
    const enclosed = new Set<number>();
    for (let y = 0; y < sizeY; y++) {
        for (let x = 0; x < sizeX; x++) {
            if (!seen.has(key(x, y))) {
                enclosed.add(x + y * sizeX);
            }
        }
    }
    return enclosed;
}

function checkPrefab(name: string, context: BuildContext, turns: number): string[] {
    const problems: string[] = [];
    const kit = new PrefabKit(context);
    const { prefab } = kit.get(name, turns);
    const exits = findExits(prefab, (loc) => isDoor(context, loc));
    if (exits.length === 0) {
        problems.push("no way out");
    }
    const enclosed = findEnclosed(prefab, exits);

    const ground = new Ground(prefab.sizeX + MARGIN * 2, prefab.sizeY + MARGIN * 2);
    ground.level0.underlays.fill(GROUND);
    kit.stamp(ground, name, turns, MARGIN, MARGIN);

    const from = prefab.levels[0];
    const to = ground.level0;
    let outside = 0;
    let kept = 0;
    for (let y = 0; y < prefab.sizeY; y++) {
        for (let x = 0; x < prefab.sizeX; x++) {
            const i = x + y * prefab.sizeX;
            const j = ground.tile(x + MARGIN, y + MARGIN);
            const own = from.overlays[i] !== 0 || from.underlays[i] !== 0;
            if (from.overlays[i] !== 0 && to.overlays[j] !== 0) {
                kept++;
                outside += enclosed.has(i) ? 0 : 1;
            }
            if (!enclosed.has(i)) {
                continue;
            }
            if (to.overlays[j] !== from.overlays[i]) {
                problems.push(`tile ${x},${y} indoors lost its overlay`);
            } else if (from.overlays[i] === 0 && own && to.underlays[j] === GROUND) {
                problems.push(`tile ${x},${y} indoors lost its underlay`);
            }
        }
    }
    if (enclosed.size < kept * 0.75) {
        problems.push(`walls aren't closed: ${enclosed.size} tiles enclosed, ${kept} kept`);
    }
    if (outside > kept * MAX_FLOOR_OUTSIDE) {
        problems.push(`${outside} of ${kept} floor tiles taken are outside the walls`);
    }
    return problems;
}

const cache = loadGameCache();
const sceneBuilder = createSceneBuilder(cache);
const context = createBuildContext(sceneBuilder.mapFileLoader, sceneBuilder.locTypeLoader);
let failed = false;
for (const name of Object.keys(PREFABS)) {
    for (let turns = 0; turns < 4; turns++) {
        const problems = checkPrefab(name, context, turns);
        if (problems.length > 0) {
            failed = true;
            console.log(`${name}, ${turns} turns: ${problems.slice(0, 4).join("; ")}`);
        }
    }
}
if (failed) {
    console.log("Some prefabs are broken");
    process.exit(1);
}
console.log(`All ${Object.keys(PREFABS).length} prefabs check out in all 4 rotations`);
