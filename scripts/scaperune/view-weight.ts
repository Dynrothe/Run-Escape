// How heavy each camera view of a built map is: the triangles of the locs the play camera draws
// from every tile of the arena the player could stand on. Prints the heaviest views, with what's
// heaviest in each, and a heat map of the arena. A phone chokes on the heaviest view, not on
// the map's total, so this is where to look before tuning for one.
//
// The view is the game's (GameClient, CameraRig): pitch -400, 18 tiles away on a desktop and 15
// on a phone held sideways (PHONE=1), a 45 degree field of view, 16 by 9. On flat ground that's
// about 27 by 16 tiles, a little more of it north of the player than south. The renderer culls
// in cells of 8 tiles (CullGrid, docs/DEVELOPMENT.md "What gets drawn"), each a box round what's
// in it, as high as its tallest loc, and draws a cell whole if any of it is in view, so a cell
// just past the screen's edge counts, as it does in the game. A loc wider than a cell gets a
// box of its own.
// Only drawn locs count: the ground floor, and upper levels where their tiles are shown
// (TILE_SHOWN) or a bridge's. The floor's own triangles, two a tile, are left out. What the game
// draws in the map's place (GeneratedMap.standIns: the Owl's Court's statues, which the fight
// animates) counts as though it stood there.
//
//   npx tsx scripts/scaperune/view-weight.ts phosani [theatre_of_blood ...]
//   PHONE=1 TOP=10 STEP=2 WIDTH=96 npx tsx scripts/scaperune/view-weight.ts phosani
import { TILE_BRIDGE, TILE_SHOWN, TileGrid } from "../../src/game/scaperune/format";
import { getRecipeWorldTile } from "../../src/game/scaperune/recipe";
import { createBuildContext, getRecipe } from "../../src/game/scaperune/squares";
import { createViewTest, pickPeaks } from "./research/geometry";
import { createShapes, locLabel, openWorld, round } from "./research/lib";

const PHONE = process.env.PHONE === "1";
const CAMERA = { pitch: -400, distance: PHONE ? 15 : 18, fov: 45, aspect: 16 / 9 };
const CELL = 8;
// Tiles between the player's positions tried: 2 is four times quicker on a big map
const STEP = Number(process.env.STEP ?? 1);
const TOP = Number(process.env.TOP ?? 10);
// Columns of the heat map
const WIDTH = Number(process.env.WIDTH ?? 96);
const SHADES = " .:-=+*#%@";
// Views this far apart, both ways, count as different places
const APART_X = 27;
const APART_Y = 16;

const ids = process.argv.slice(2);
if (ids.length === 0) {
    ids.push("phosani");
}
const w = openWorld();
const shapeOf = createShapes(w);
const context = createBuildContext(w.maps, w.locTypes);
const inView = createViewTest(CAMERA);

// Whether the game draws a loc on this level of its tile, seen from the ground floor
function isDrawn(grid: TileGrid, level: number, x: number, y: number): boolean {
    const i = x + y * grid.sizeX;
    const bridge = (grid.levels[1].flags[i] & TILE_BRIDGE) !== 0;
    if (level === 0) {
        return !bridge;
    }
    return (grid.levels[level].flags[i] & TILE_SHOWN) !== 0 || (level === 1 && bridge);
}

// What the renderer culls by: a box of tiles, as high as its tallest, and what's in it
type Box = {
    x0: number;
    y0: number;
    x1: number;
    y1: number;
    top: number;
    tris: number;
    locs: Map<number, number>;
};

for (const id of ids) {
    const recipe = getRecipe(id);
    if (!recipe) {
        throw new Error(`No recipe called ${id}`);
    }
    // The detail says what the game draws in the map's place
    const detail = recipe.detail?.(context);
    const grid = detail?.grid ?? recipe.build(context);
    const standIns = detail?.standIns ?? [];
    const { sizeX, sizeY } = grid;
    const cellsX = Math.ceil(sizeX / CELL);
    const cellsY = Math.ceil(sizeY / CELL);
    // Boxes by the cell they're filed under: a cell's own, and big locs' in the cell of their middle
    const boxes: Box[][] = Array.from({ length: cellsX * cellsY }, () => []);
    const cells: (Box | undefined)[] = [];
    let drawn = 0;
    let total = 0;
    for (const loc of [...grid.locs, ...standIns]) {
        if (!isDrawn(grid, loc.level, loc.x, loc.y)) {
            continue;
        }
        const meta = w.loc(loc.id);
        const shape = shapeOf(loc.id, loc.type);
        const across = loc.rotation & 1 ? meta.sizeY : meta.sizeX;
        const deep = loc.rotation & 1 ? meta.sizeX : meta.sizeY;
        const reach = Math.max(0, shape.reach);
        const x0 = loc.x - reach;
        const y0 = loc.y - reach;
        const x1 = loc.x + across + reach;
        const y1 = loc.y + deep + reach;
        const cellX = Math.min(cellsX - 1, Math.floor((loc.x + across / 2) / CELL));
        const cellY = Math.min(cellsY - 1, Math.floor((loc.y + deep / 2) / CELL));
        const cell = cellX + cellY * cellsX;
        let box: Box;
        if (Math.max(across, deep) > CELL) {
            box = { x0, y0, x1, y1, top: 0, tris: 0, locs: new Map() };
            boxes[cell].push(box);
        } else {
            box = cells[cell] ?? {
                x0: cellX * CELL,
                y0: cellY * CELL,
                x1: (cellX + 1) * CELL,
                y1: (cellY + 1) * CELL,
                top: 0,
                tris: 0,
                locs: new Map(),
            };
            if (!cells[cell]) {
                cells[cell] = box;
                boxes[cell].push(box);
            }
            box.x0 = Math.min(box.x0, x0);
            box.y0 = Math.min(box.y0, y0);
            box.x1 = Math.max(box.x1, x1);
            box.y1 = Math.max(box.y1, y1);
        }
        box.top = Math.max(box.top, shape.top);
        box.tris += shape.tris;
        box.locs.set(loc.id, (box.locs.get(loc.id) ?? 0) + shape.tris);
        drawn++;
        total += shape.tris;
    }

    // Each player's tile in the arena: the boxes in view from there. The view reaches about a
    // screen either way, more north for tall things; boxes further than that are never in it.
    const m = recipe.margin * 64;
    const sums = new Float64Array(sizeX * sizeY);
    const seen = (x: number, y: number): Box[] => {
        const found: Box[] = [];
        const cellX = Math.floor(x / CELL);
        const cellY = Math.floor(y / CELL);
        for (let cy = Math.max(0, cellY - 4); cy <= Math.min(cellsY - 1, cellY + 8); cy++) {
            for (let cx = Math.max(0, cellX - 5); cx <= Math.min(cellsX - 1, cellX + 5); cx++) {
                for (const box of boxes[cx + cy * cellsX]) {
                    const px = x + 0.5;
                    const py = y + 0.5;
                    if (inView(box.x0 - px, box.y0 - py, box.x1 - px, box.y1 - py, box.top)) {
                        found.push(box);
                    }
                }
            }
        }
        return found;
    };
    const arena: number[] = [];
    for (let y = m; y < sizeY - m; y += STEP) {
        for (let x = m; x < sizeX - m; x += STEP) {
            const sum = seen(x, y).reduce((n, box) => n + box.tris, 0);
            for (let dy = 0; dy < STEP && y + dy < sizeY - m; dy++) {
                for (let dx = 0; dx < STEP && x + dx < sizeX - m; dx++) {
                    sums[x + dx + (y + dy) * sizeX] = sum;
                }
            }
            arena.push(sum);
        }
    }
    arena.sort((a, b) => a - b);
    const median = arena[Math.floor(arena.length / 2)];
    const max = arena[arena.length - 1] || 1;
    const inArena = (x: number, y: number) => x >= m && y >= m && x < sizeX - m && y < sizeY - m;
    const peaks = pickPeaks(sums, sizeX, TOP, APART_X, APART_Y, inArena);
    console.log(
        `${id}${PHONE ? " (phone)" : ""}: ${drawn} locs drawn of ${grid.locs.length}` +
            (standIns.length ? ` and ${standIns.length} the game draws in their place` : "") +
            ", " +
            `${round(total / 1000, 1)}k triangles; a view from the arena: median ` +
            `${round(median / 1000, 1)}k, heaviest ${round(max / 1000, 1)}k ` +
            `(${round(max / Math.max(1, median), 1)} times the median)`,
    );
    console.log(
        `  heaviest views, ${APART_X}x${APART_Y} tiles apart at least (grid tile, world tile):`,
    );
    peaks.forEach((peak, n) => {
        // What's heaviest in it, by id
        const heavy = new Map<number, number>();
        for (const box of seen(peak.x, peak.y)) {
            for (const [loc, count] of box.locs) {
                heavy.set(loc, (heavy.get(loc) ?? 0) + count);
            }
        }
        const world = getRecipeWorldTile(recipe, peak.x, peak.y);
        const top = [...heavy]
            .sort((a, b) => b[1] - a[1])
            .slice(0, 4)
            .map(([loc, count]) => `${loc} ${locLabel(w.loc(loc))} ${round(count / 1000, 1)}k`);
        console.log(
            `  ${n + 1}. ${peak.x},${peak.y} (${Math.floor(world.x)},${Math.floor(world.y)}): ` +
                `${round(peak.sum / 1000, 1)}k: ${top.join(", ")}`,
        );
    });
    // The heat map, north up: each character the heaviest view from the tiles it stands for,
    // against the heaviest of all. The numbers are the views above.
    const arenaX = sizeX - 2 * m;
    const arenaY = sizeY - 2 * m;
    const scale = Math.max(1, Math.ceil(arenaX / WIDTH));
    console.log(
        `  heat map, a character for ${scale}x${scale * 2} tiles, north up ("${SHADES}" from light to heavy):`,
    );
    for (let row = Math.ceil(arenaY / (scale * 2)) - 1; row >= 0; row--) {
        let line = "";
        for (let column = 0; column < Math.ceil(arenaX / scale); column++) {
            let heaviest = 0;
            let mark = "";
            for (let y = row * scale * 2; y < Math.min(arenaY, (row + 1) * scale * 2); y++) {
                for (let x = column * scale; x < Math.min(arenaX, (column + 1) * scale); x++) {
                    heaviest = Math.max(heaviest, sums[m + x + (m + y) * sizeX]);
                    const at = peaks.findIndex((p) => p.x === m + x && p.y === m + y);
                    if (at >= 0 && at < 9) {
                        mark = String(at + 1);
                    }
                }
            }
            const shade = Math.min(SHADES.length - 1, Math.floor((heaviest / max) * SHADES.length));
            line += mark || SHADES[shade];
        }
        console.log(`  |${line}|`);
    }
}
