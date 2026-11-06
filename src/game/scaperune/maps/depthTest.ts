import { Ground } from "../Ground";
import { TILE_BLOCKED, TileGrid } from "../format";
import { MapRecipe } from "../recipe";

// How much height the play camera can take (plans/map-depth/findings.md on the team's VM): slopes,
// cliffs, platforms and pits side by side on plain ground, all bare terrain, to look at from the
// play camera on a desktop and a phone. Heights are in height units (8 scene units, 16 a tile).
// An OSRS storey is 30 (240 scene units), a Hallowed Sepulchre level 65 (the Owl's Court's drop).
//
// Row A, south: slopes rising north. Gentle (2 a tile), moderate (8), a sheer cliff and a 3 tile
// face (65), and the tallest sheer cliff (125).
// Row B: platforms with a ramp down their south side: +30, +60, +125.
// Row C, north: pits with a ramp down into them from the south: -30, -65, -128.
// Anything steeper than WALK_SLOPE a tile is blocked and rock; ramps are road. The faces are plain
// grey in row A but the tallest cliff, which is grey stone as the platforms' are, and the pits'
// are dark rock.

const SQUARES = 4;
const SIZE = SQUARES * 64;
// The ground everything's cut into or raised from, so a pit can go 8 tiles down
const BASE = 128;
// The generator's default steepest walkable slope (settings.ts)
const WALK_SLOPE = 12;

const GRASS = 48;
// Faces: plain grey (no texture) on row A's slopes and first cliff, then the cache's textured
// grey stone and dark rock, to see how a texture stretches down a face
const OVERLAY_ROCK = 10;
const OVERLAY_STONE = 20;
const OVERLAY_DARK_ROCK = 32;
const OVERLAY_ROAD = 22;
const OVERLAY_COBBLES = 12;

type Rect = { x0: number; y0: number; x1: number; y1: number };

// The tops and floors, tile rectangles in the grid
export const DEPTH_TEST = {
    gentle: { x0: 68, y0: 74, x1: 95, y1: 106 } as Rect,
    moderate: { x0: 100, y0: 82, x1: 127, y1: 106 } as Rect,
    cliff: { x0: 132, y0: 82, x1: 159, y1: 106 } as Rect,
    tallCliff: { x0: 164, y0: 82, x1: 189, y1: 106 } as Rect,
    platforms: [
        { rise: 30, top: { x0: 72, y0: 128, x1: 83, y1: 137 } as Rect },
        { rise: 60, top: { x0: 112, y0: 128, x1: 123, y1: 137 } as Rect },
        { rise: 125, top: { x0: 152, y0: 130, x1: 163, y1: 139 } as Rect },
    ],
    pits: [
        { depth: 30, floor: { x0: 72, y0: 168, x1: 83, y1: 177 } as Rect },
        { depth: 65, floor: { x0: 112, y0: 168, x1: 123, y1: 177 } as Rect },
        { depth: 128, floor: { x0: 152, y0: 168, x1: 163, y1: 177 } as Rect },
    ],
};

// Corner heights relative to BASE, worked out cell by cell
function relief(x: number, y: number): number {
    const t = DEPTH_TEST;
    const within = (r: Rect, cx: number, cy: number) =>
        cx >= r.x0 && cx <= r.x1 + 1 && cy >= r.y0 && cy <= r.y1 + 1;
    // A slope rising north from a cell's south edge, flat once it's up, as far as the cell's top
    const slope = (r: Rect, from: number, perTile: number, rise: number) =>
        within(r, x, y) ? Math.min(Math.max(y - from, 0) * perTile, rise) : 0;
    if (within(t.gentle, x, y)) {
        return slope(t.gentle, t.gentle.y0 + 1, 2, 60);
    }
    if (within(t.moderate, x, y)) {
        return slope(t.moderate, t.moderate.y0 + 4, 8, 64);
    }
    if (within(t.cliff, x, y)) {
        // West half sheer (one tile), east half a 3 tile face
        const mid = (t.cliff.x0 + t.cliff.x1) >> 1;
        const foot = t.cliff.y0 + 6;
        return x <= mid ? (y > foot ? 65 : 0) : Math.min(Math.max(y - foot, 0) * 22, 65);
    }
    if (within(t.tallCliff, x, y)) {
        return y > t.tallCliff.y0 + 6 ? 125 : 0;
    }
    for (const { rise, top } of t.platforms) {
        if (within(top, x, y)) {
            return rise;
        }
        // The ramp: 3 tiles wide up the west of the south side, WALK_SLOPE a tile
        const run = Math.ceil(rise / WALK_SLOPE);
        if (x >= top.x0 && x <= top.x0 + 3 && y <= top.y0 && y >= top.y0 - run) {
            return Math.max(rise - (top.y0 - y) * WALK_SLOPE, 0);
        }
    }
    for (const { depth, floor } of t.pits) {
        if (within(floor, x, y)) {
            return -depth;
        }
        // The ramp down from the south, a trench into the ground
        const run = Math.ceil(depth / WALK_SLOPE);
        if (x >= floor.x0 && x <= floor.x0 + 3 && y <= floor.y0 && y >= floor.y0 - run) {
            return -Math.max(depth - (floor.y0 - y) * WALK_SLOPE, 0);
        }
    }
    return 0;
}

function build(): TileGrid {
    const ground = new Ground(SIZE, SIZE);
    const level = ground.level0;
    level.underlays.fill(GRASS);
    for (let y = 0; y <= SIZE; y++) {
        for (let x = 0; x <= SIZE; x++) {
            ground.setHeight(x, y, BASE + relief(x, y));
        }
    }
    const isTop = (x: number, y: number) =>
        [...DEPTH_TEST.platforms.map((p) => p.top), ...DEPTH_TEST.pits.map((p) => p.floor)].some(
            (r) => x >= r.x0 && x <= r.x1 && y >= r.y0 && y <= r.y1,
        );
    for (let y = 0; y < SIZE; y++) {
        for (let x = 0; x < SIZE; x++) {
            const corners = [
                ground.getHeight(x, y),
                ground.getHeight(x + 1, y),
                ground.getHeight(x, y + 1),
                ground.getHeight(x + 1, y + 1),
            ];
            const rise = Math.max(...corners) - Math.min(...corners);
            const i = ground.tile(x, y);
            if (rise > WALK_SLOPE) {
                const t = DEPTH_TEST;
                level.overlays[i] =
                    y >= t.pits[0].floor.y0 - 12
                        ? OVERLAY_DARK_ROCK
                        : y >= t.platforms[0].top.y0 - 12 || x >= t.tallCliff.x0 - 1
                          ? OVERLAY_STONE
                          : OVERLAY_ROCK;
                level.flags[i] |= TILE_BLOCKED;
            } else if (rise === WALK_SLOPE) {
                level.overlays[i] = OVERLAY_ROAD;
            } else if (isTop(x, y)) {
                level.overlays[i] = OVERLAY_COBBLES;
            }
        }
    }
    return ground.grid;
}

export const DEPTH_TEST_RECIPE: MapRecipe = {
    id: "scaperune_depth",
    mapX: 85,
    mapY: 92,
    squaresX: SQUARES,
    squaresY: SQUARES,
    margin: 1,
    spawn: { x: 80, y: 70 },
    build,
};
