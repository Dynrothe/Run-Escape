import { COLLISION_LOC_STRIDE, RegionData } from "../../../mapviewer/worker/RegionData";
import { CollisionFlag } from "../../../rs/pathfinder/flag/CollisionFlag";
import { ArenaGrid } from "./ArenaGrid";

// A loc blocking the tiles from (x, y) on, whose model stands on [x0, y0, x1,
// y1] of them (world tiles); leave stands out for one with no model to go by,
// or stand it NOWHERE if it draws nothing
export type TestLoc = {
    x: number;
    y: number;
    sizeX: number;
    sizeY: number;
    stands?: [number, number, number, number];
};

export const NOWHERE: [number, number, number, number] = [Infinity, Infinity, -Infinity, -Infinity];

// Builds a grid from rows of text for tests. rows[0] is the northmost row.
// '#' solid, '~' water (blocked floor), '.' open, '|' wall on the east side
// of the tile, '_' wall on the north side of the tile, 'o' a loc standing on
// just the middle of its tile (a signpost), '?' a loc that draws nothing (an
// invisible wall). locs are more, in world tiles.
export function makeGrid(
    rows: string[],
    baseX = 100,
    baseY = 200,
    locs: TestLoc[] = [],
): ArenaGrid {
    const sizeY = rows.length;
    const sizeX = rows[0].length;
    const collisionFlags = new Int32Array(sizeX * sizeY);
    locs = [...locs];
    for (let row = 0; row < sizeY; row++) {
        const y = sizeY - 1 - row;
        for (let x = 0; x < sizeX; x++) {
            const c = rows[row][x];
            let flags = 0;
            if (c === "#") {
                flags = CollisionFlag.OBJECT;
            } else if (c === "~") {
                flags = CollisionFlag.FLOOR;
            } else if (c === "|") {
                flags = CollisionFlag.WALL_EAST;
            } else if (c === "_") {
                flags = CollisionFlag.WALL_NORTH;
            } else if (c === "o") {
                const wx = baseX + x;
                const wy = baseY + y;
                locs.push({
                    x: wx,
                    y: wy,
                    sizeX: 1,
                    sizeY: 1,
                    stands: [wx + 0.4, wy + 0.4, wx + 0.6, wy + 0.6],
                });
            } else if (c === "?") {
                locs.push({ x: baseX + x, y: baseY + y, sizeX: 1, sizeY: 1, stands: NOWHERE });
            }
            collisionFlags[x + y * sizeX] = flags;
        }
    }
    for (const loc of locs) {
        for (let y = loc.y; y < loc.y + loc.sizeY; y++) {
            for (let x = loc.x; x < loc.x + loc.sizeX; x++) {
                collisionFlags[x - baseX + (y - baseY) * sizeX] |= CollisionFlag.OBJECT;
            }
        }
    }
    // Walls are flagged on both sides of the edge, like the cache does
    for (let y = 0; y < sizeY; y++) {
        for (let x = 0; x < sizeX; x++) {
            const flags = collisionFlags[x + y * sizeX];
            if (flags & CollisionFlag.WALL_EAST && x + 1 < sizeX) {
                collisionFlags[x + 1 + y * sizeX] |= CollisionFlag.WALL_WEST;
            }
            if (flags & CollisionFlag.WALL_NORTH && y + 1 < sizeY) {
                collisionFlags[x + (y + 1) * sizeX] |= CollisionFlag.WALL_SOUTH;
            }
        }
    }
    const collisionLocs = new Float32Array(locs.length * COLLISION_LOC_STRIDE);
    locs.forEach((loc, i) => {
        const stands = loc.stands ?? [NaN, NaN, NaN, NaN];
        collisionLocs.set(
            [loc.x, loc.y, loc.sizeX, loc.sizeY, ...stands],
            i * COLLISION_LOC_STRIDE,
        );
    });
    const data: RegionData = {
        baseX,
        baseY,
        sizeX,
        sizeY,
        plane: 0,
        collisionFlags,
        heights: new Int32Array((sizeX + 1) * (sizeY + 1)),
        bridgeHeights: new Int32Array((sizeX + 1) * (sizeY + 1)),
        tileFlags: new Uint8Array(sizeX * sizeY),
        overlays: new Uint16Array(sizeX * sizeY),
        collisionLocs,
    };
    return new ArenaGrid(data);
}
