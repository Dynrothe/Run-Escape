// Finds whole buildings in a block of map squares: places with walls all the way round,
// doors included, each with the rectangle to cut, for PREFABS. Those that have a way
// out once the doors are gone, and no stray walls round them, are printed as rectangles
// that loc-sheet.ts can draw.
//
//   npx tsx scripts/scaperune/find-buildings.ts 50 50 51 50      # squares from, to
import { findExits } from "../../src/game/scaperune/building";
import { TileGrid } from "../../src/game/scaperune/format";
import { cutPrefab } from "../../src/game/scaperune/prefab";
import { isDoor } from "../../src/game/scaperune/prefabs";
import { createBuildContext } from "../../src/game/scaperune/squares";
import { createSceneBuilder, loadGameCache } from "../cache/scene-util";

const MIN_TILES = 10;
const MAX_TILES = Number(process.env.MAX_TILES ?? 220);
const MAX_SIDE = Number(process.env.MAX_SIDE ?? 24);
const SIDE_X = [-1, 0, 1, 0];
const SIDE_Y = [0, 1, 0, -1];

const [x0, y0, x1, y1] = process.argv.slice(2).map(Number);
const cache = loadGameCache();
const sceneBuilder = createSceneBuilder(cache);
const context = createBuildContext(sceneBuilder.mapFileLoader, sceneBuilder.locTypeLoader);
const worldX = x0 * 64;
const worldY = y0 * 64;
const sizeX = (x1 - x0 + 1) * 64;
const sizeY = (y1 - y0 + 1) * 64;
const grid = cutPrefab(context.maps, worldX, worldY, sizeX, sizeY);

// Which sides of each tile are shut
function getStops(prefab: TileGrid): Uint8Array {
    const stops = new Uint8Array((prefab.sizeX + 2) * (prefab.sizeY + 2));
    const at = (x: number, y: number) => x + 1 + (y + 1) * (prefab.sizeX + 2);
    const stop = (x: number, y: number, side: number) => {
        stops[at(x, y)] |= 1 << side;
        stops[at(x + SIDE_X[side], y + SIDE_Y[side])] |= 1 << ((side + 2) & 3);
    };
    for (const loc of prefab.locs) {
        if (loc.level !== 0 || loc.x < 0 || loc.y < 0) {
            continue;
        }
        if (loc.type === 0) {
            stop(loc.x, loc.y, loc.rotation);
        } else if (loc.type === 2) {
            stop(loc.x, loc.y, loc.rotation);
            stop(loc.x, loc.y, (loc.rotation + 1) & 3);
        } else if (loc.type === 9) {
            for (let side = 0; side < 4; side++) {
                stop(loc.x, loc.y, side);
            }
        }
        // An open door stands turned, off its gap, so the whole of its tile shuts
        if (isDoor(context, loc)) {
            for (let side = 0; side < 4; side++) {
                stop(loc.x, loc.y, side);
            }
        }
    }
    return stops;
}

const stops = getStops(grid);
const key = (x: number, y: number) => x + 1 + (y + 1) * (sizeX + 2);
const seen = new Uint8Array((sizeX + 2) * (sizeY + 2));
const queue: [number, number][] = [];
for (let y = -1; y <= sizeY; y++) {
    for (let x = -1; x <= sizeX; x++) {
        if (x < 0 || y < 0 || x >= sizeX || y >= sizeY) {
            seen[key(x, y)] = 1;
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
        if (onGrid && !seen[key(nx, ny)] && !(stops[key(x, y)] & (1 << side))) {
            seen[key(nx, ny)] = 1;
            queue.push([nx, ny]);
        }
    }
}

// Pieces of what's enclosed, as rectangles, joined if they touch: rooms of a building
type Rect = { x0: number; y0: number; x1: number; y1: number; tiles: number };
const rects: Rect[] = [];
const taken = new Uint8Array(seen.length);
for (let y = 0; y < sizeY; y++) {
    for (let x = 0; x < sizeX; x++) {
        if (seen[key(x, y)] || taken[key(x, y)]) {
            continue;
        }
        const rect = { x0: x, y0: y, x1: x, y1: y, tiles: 0 };
        const stack: [number, number][] = [[x, y]];
        taken[key(x, y)] = 1;
        while (stack.length > 0) {
            const [tx, ty] = stack.pop()!;
            rect.tiles++;
            rect.x0 = Math.min(rect.x0, tx);
            rect.y0 = Math.min(rect.y0, ty);
            rect.x1 = Math.max(rect.x1, tx);
            rect.y1 = Math.max(rect.y1, ty);
            for (let side = 0; side < 4; side++) {
                const nx = tx + SIDE_X[side];
                const ny = ty + SIDE_Y[side];
                const inside = nx >= 0 && ny >= 0 && nx < sizeX && ny < sizeY;
                if (inside && !seen[key(nx, ny)] && !taken[key(nx, ny)]) {
                    taken[key(nx, ny)] = 1;
                    stack.push([nx, ny]);
                }
            }
        }
        rects.push(rect);
    }
}
for (let merged = true; merged; ) {
    merged = false;
    for (let a = 0; a < rects.length; a++) {
        for (let b = rects.length - 1; b > a; b--) {
            const [p, q] = [rects[a], rects[b]];
            if (p.x0 <= q.x1 + 2 && q.x0 <= p.x1 + 2 && p.y0 <= q.y1 + 2 && q.y0 <= p.y1 + 2) {
                p.x0 = Math.min(p.x0, q.x0);
                p.y0 = Math.min(p.y0, q.y0);
                p.x1 = Math.max(p.x1, q.x1);
                p.y1 = Math.max(p.y1, q.y1);
                p.tiles += q.tiles;
                rects.splice(b, 1);
                merged = true;
            }
        }
    }
}
const found: string[] = [];
for (const rect of rects) {
    const cutX = rect.x0 - 1;
    const cutY = rect.y0 - 1;
    const cutW = rect.x1 - rect.x0 + 3;
    const cutH = rect.y1 - rect.y0 + 3;
    if (rect.tiles < MIN_TILES || rect.tiles > MAX_TILES || Math.max(cutW, cutH) > MAX_SIDE) {
        continue;
    }
    const prefab = cutPrefab(context.maps, worldX + cutX, worldY + cutY, cutW, cutH);
    const exits = findExits(prefab, (loc) => isDoor(context, loc));
    // Walls in the outer ring, that aren't on the building's own edge, are something else's
    const stray = prefab.locs.filter(
        (loc) =>
            loc.level === 0 &&
            loc.type <= 3 &&
            ((loc.x === 0 && loc.rotation !== 2) ||
                (loc.y === 0 && loc.rotation !== 1) ||
                (loc.x === cutW - 1 && loc.rotation !== 0) ||
                (loc.y === cutH - 1 && loc.rotation !== 3)),
    ).length;
    if (exits.length > 0) {
        found.push(`${worldX + cutX},${worldY + cutY},${cutW},${cutH}`);
        console.log(
            `${worldX + cutX},${worldY + cutY},${cutW},${cutH} tiles ${rect.tiles} exits ${exits.length} stray ${stray}`,
        );
    }
}
console.log(`RECTS ${found.join(" ")}`);
