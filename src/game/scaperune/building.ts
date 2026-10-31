import type { PlacedLoc, TileGrid } from "./format";

// What's inside a building, and how you get out of it, from where its walls stand.

// LocModelType: a wall on one side of its tile, an L of two sides, and a diagonal
const WALL = 0;
const WALL_CORNER = 2;
const WALL_DIAGONAL = 9;

// Rotation's the side: west, north, east, south
const SIDE_X = [-1, 0, 1, 0];
const SIDE_Y = [0, 1, 0, -1];

// Rays must meet a wall on this many sides for a tile to be indoors: a doorway leaves
// one side open, and the floor of a building has walls all round otherwise
const INDOOR_SIDES = 3;

// A way out of a building: the middle of the gap, on the line of the wall, in tile
// corners, and which way is out
export type Exit = { x: number; y: number; outX: number; outY: number };

// The walls, as the edges between tiles. Edges past the grid's sides are included.
class WallEdges {
    // Between tiles x - 1 and x, x + y * (sizeX + 1)
    readonly upright: Uint8Array;
    // Between tiles y - 1 and y, x + y * sizeX
    readonly level: Uint8Array;

    constructor(
        readonly sizeX: number,
        readonly sizeY: number,
    ) {
        this.upright = new Uint8Array((sizeX + 1) * sizeY);
        this.level = new Uint8Array(sizeX * (sizeY + 1));
    }

    addSide(x: number, y: number, side: number): void {
        if (side === 0 || side === 2) {
            this.upright[x + (side === 2 ? 1 : 0) + y * (this.sizeX + 1)] = 1;
        } else {
            this.level[x + (y + (side === 1 ? 1 : 0)) * this.sizeX] = 1;
        }
    }

    // Whether there's a wall on a side of a tile
    hasSide(x: number, y: number, side: number): boolean {
        if (side === 0 || side === 2) {
            return this.upright[x + (side === 2 ? 1 : 0) + y * (this.sizeX + 1)] !== 0;
        }
        return this.level[x + (y + (side === 1 ? 1 : 0)) * this.sizeX] !== 0;
    }
}

function getWallEdges(prefab: TileGrid, skip?: (loc: PlacedLoc) => boolean): WallEdges {
    const edges = new WallEdges(prefab.sizeX, prefab.sizeY);
    for (const loc of prefab.locs) {
        if (loc.level !== 0 || skip?.(loc)) {
            continue;
        }
        if (loc.type === WALL) {
            edges.addSide(loc.x, loc.y, loc.rotation);
        } else if (loc.type === WALL_CORNER) {
            edges.addSide(loc.x, loc.y, loc.rotation);
            edges.addSide(loc.x, loc.y, (loc.rotation + 1) & 3);
        } else if (loc.type === WALL_DIAGONAL) {
            for (let side = 0; side < 4; side++) {
                edges.addSide(loc.x, loc.y, side);
            }
        }
    }
    return edges;
}

// Whether a straight line from a tile, out past the grid, meets a wall
function meetsWall(edges: WallEdges, x: number, y: number, side: number): boolean {
    for (let at = 0; ; at++) {
        const tileX = x + SIDE_X[side] * at;
        const tileY = y + SIDE_Y[side] * at;
        if (tileX < 0 || tileY < 0 || tileX >= edges.sizeX || tileY >= edges.sizeY) {
            return false;
        }
        if (edges.hasSide(tileX, tileY, side)) {
            return true;
        }
    }
}

// A building's tiles: the ones with walls on all sides, or all but one, for a doorway.
// A prefab must hold its whole building: a wall that's cut off isn't there to meet
// (scripts/scaperune/check-prefabs.ts checks them). All of it if it has no walls.
export function getInsideTiles(prefab: TileGrid): Uint8Array {
    const { sizeX, sizeY } = prefab;
    const edges = getWallEdges(prefab);
    const inside = new Uint8Array(sizeX * sizeY);
    let walled = false;
    for (let y = 0; y < sizeY; y++) {
        for (let x = 0; x < sizeX; x++) {
            let sides = 0;
            for (let side = 0; side < 4; side++) {
                sides += meetsWall(edges, x, y, side) ? 1 : 0;
            }
            inside[x + y * sizeX] = sides >= INDOOR_SIDES ? 1 : 0;
            walled ||= sides > 0;
        }
    }
    if (!walled) {
        return inside.fill(1);
    }
    // Where the lines of two doorways cross, a tile has two open sides, but its
    // neighbours are indoors
    for (let changed = true; changed; ) {
        changed = false;
        for (let y = 0; y < sizeY; y++) {
            for (let x = 0; x < sizeX; x++) {
                if (inside[x + y * sizeX]) {
                    continue;
                }
                let neighbours = 0;
                for (let side = 0; side < 4; side++) {
                    const nx = x + SIDE_X[side];
                    const ny = y + SIDE_Y[side];
                    if (nx >= 0 && ny >= 0 && nx < sizeX && ny < sizeY) {
                        neighbours += inside[nx + ny * sizeX];
                    }
                }
                if (neighbours >= 3) {
                    inside[x + y * sizeX] = 1;
                    changed = true;
                }
            }
        }
    }
    return inside;
}

// Every way out of a building once its doors are gone (skip says which they are):
// gaps in the walls between its tiles and the rest, a double door as one. This goes by
// the gaps rather than the doors, because an open door stands turned, off the wall.
export function findExits(prefab: TileGrid, skip: (loc: PlacedLoc) => boolean): Exit[] {
    const { sizeX, sizeY } = prefab;
    const inside = getInsideTiles(prefab);
    const edges = getWallEdges(prefab, skip);
    const open: { x: number; y: number; side: number }[] = [];
    for (let y = 0; y < sizeY; y++) {
        for (let x = 0; x < sizeX; x++) {
            if (!inside[x + y * sizeX]) {
                continue;
            }
            for (let side = 0; side < 4; side++) {
                const nx = x + SIDE_X[side];
                const ny = y + SIDE_Y[side];
                const onGrid = nx >= 0 && ny >= 0 && nx < sizeX && ny < sizeY;
                if (!edges.hasSide(x, y, side) && !(onGrid && inside[nx + ny * sizeX])) {
                    open.push({ x, y, side });
                }
            }
        }
    }
    const exits: Exit[] = [];
    const used = new Set<number>();
    open.forEach((gap, i) => {
        if (used.has(i)) {
            return;
        }
        // Along the wall, tiles side by side
        const run = [gap];
        used.add(i);
        for (let at = 0; at < run.length; at++) {
            open.forEach((other, j) => {
                const across = Math.abs(run[at].x - other.x) + Math.abs(run[at].y - other.y);
                if (!used.has(j) && other.side === gap.side && across === 1) {
                    run.push(other);
                    used.add(j);
                }
            });
        }
        const outX = SIDE_X[gap.side];
        const outY = SIDE_Y[gap.side];
        const meanX = run.reduce((sum, tile) => sum + tile.x, 0) / run.length;
        const meanY = run.reduce((sum, tile) => sum + tile.y, 0) / run.length;
        exits.push({ x: meanX + 0.5 + outX / 2, y: meanY + 0.5 + outY / 2, outX, outY });
    });
    return exits;
}

// The exit nearest a point
export function getNearestExit(exits: Exit[], x: number, y: number): Exit | undefined {
    return [...exits].sort(
        (a, b) => Math.hypot(a.x - x, a.y - y) - Math.hypot(b.x - x, b.y - y),
    )[0];
}
