import { CLIFF_FALL } from "./biomes";
import { Build, LOC_NORMAL, WaterPaint, lerp } from "./mapBuild";
import { Point } from "./paths";

// Waterfalls off cliffs that face the camera, each into a pool of its own. The water's a
// real model that follows the ground, so it reaches the top of any cliff. Rivers can't have
// them: they look for the low ground, and only fall a tile or two at a time.

// A fall's model: tiles across, and how much higher the cliff must be than its foot
const FALL_WIDTH = 3;

const FALL_RISE = 28;

const TILES_BEHIND = 4;

const FALLS_A_SQUARE = 1.2;

// How far a pool reaches from the middle of the fall's foot, across and out from the cliff
const POOL_ACROSS = 4;

const POOL_OUT = 3;

// Tiles of cliff round a fall that have to stay as they are, so that the pool doesn't cut it back
const HELD_BEHIND = 7;

function fits(build: Build, water: Uint8Array, x: number, y: number): boolean {
    const { ground, cliffs, mainland, terrain, toEdge, spawn, biomeAt } = build;
    if (biomeAt(x, y).molten || toEdge(x, y) < POOL_ACROSS + 3) {
        return false;
    }
    if (Math.hypot(x - spawn.x, y - spawn.y) < POOL_ACROSS * 3) {
        return false;
    }
    for (let tx = x; tx < x + FALL_WIDTH; tx++) {
        if (!cliffs[ground.tile(tx, y + 1)] || !cliffs[ground.tile(tx, y + 2)]) {
            return false;
        }
    }
    const middle = x + (FALL_WIDTH >> 1);
    for (let ty = y - POOL_OUT - 2; ty < y; ty++) {
        for (let tx = middle - POOL_ACROSS - 1; tx <= middle + POOL_ACROSS + 1; tx++) {
            const i = ground.tile(tx, ty);
            if (!ground.inside(tx, ty) || cliffs[i] || !mainland[i] || water[i]) {
                return false;
            }
            if (ground.reserved[i]) {
                return false;
            }
        }
    }
    const rise = terrain.getHeight(middle, y + TILES_BEHIND) - terrain.getHeight(middle, y);
    return rise >= FALL_RISE;
}

// Picks where falls go and makes their pools, while the ground can still move for them
export function placeFallPools(build: Build, water: WaterPaint): Point[] {
    const { settings, ground, arena, terrain, heldCorners, corners, rng, biomeAt } = build;
    const falls: Point[] = [];
    const pools = new Float32Array(corners.x * corners.y).fill(-4);
    const wanted = Math.round(
        settings.cliffFalls * settings.squaresX * settings.squaresY * FALLS_A_SQUARE,
    );
    for (let attempt = 0; attempt < wanted * 600 && falls.length < wanted; attempt++) {
        const x = Math.floor(lerp(arena.x0, arena.x1 - FALL_WIDTH, rng()));
        const y = Math.floor(lerp(arena.y0 + POOL_OUT + 2, arena.y1 - TILES_BEHIND - 1, rng()));
        const clear = falls.every(
            (other) => Math.hypot(other.x - x, other.y - y) > POOL_ACROSS * 4,
        );
        if (!clear || !fits(build, water.tiles, x, y)) {
            continue;
        }
        const middleX = x + FALL_WIDTH / 2;
        const middleY = y - 0.5;
        const level = terrain.getRange(
            x - POOL_ACROSS,
            y - POOL_OUT,
            FALL_WIDTH + POOL_ACROSS * 2,
            POOL_OUT + 1,
        ).min;
        for (let cy = y - POOL_OUT - 1; cy <= y + 1; cy++) {
            for (let cx = x - POOL_ACROSS; cx <= x + POOL_ACROSS + FALL_WIDTH; cx++) {
                const across = (cx - middleX) / POOL_ACROSS;
                const out = (cy - middleY) / POOL_OUT;
                const reach = (1 - Math.hypot(across, out)) * POOL_OUT;
                const at = cx + cy * corners.x;
                pools[at] = Math.max(pools[at], reach);
                water.field[at] = Math.max(water.field[at], reach);
                if (reach > -2) {
                    terrain.pin(cx, cy, level);
                }
            }
        }
        // What's behind stays a cliff
        for (let cy = y + 2; cy <= y + HELD_BEHIND; cy++) {
            for (let cx = x - 2; cx <= x + FALL_WIDTH + 2; cx++) {
                if (!heldCorners[cx + cy * corners.x]) {
                    heldCorners[cx + cy * corners.x] = 1;
                    build.heldForNow.push(cx + cy * corners.x);
                }
            }
        }
        for (let ty = y - POOL_OUT - 1; ty <= y + 1; ty++) {
            for (let tx = x - POOL_ACROSS; tx < x + POOL_ACROSS + FALL_WIDTH; tx++) {
                ground.reserved[ground.tile(tx, ty)] = 1;
            }
        }
        falls.push({ x, y });
    }
    if (falls.length > 0) {
        const painted = ground.paintField(pools, (x, y) => biomeAt(x, y).water, true);
        painted.forEach((tile, i) => {
            water.tiles[i] |= tile;
        });
    }
    return falls;
}

// The falls themselves, once the heights are settled and the pools are painted
export function placeFalls(build: Build, falls: Point[]): void {
    for (const { x, y } of falls) {
        build.ground.grid.locs.push({
            id: CLIFF_FALL,
            type: LOC_NORMAL,
            rotation: 0,
            level: 0,
            x,
            y,
        });
    }
}
