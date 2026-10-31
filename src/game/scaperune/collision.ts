import { LocModelType } from "../../rs/config/loctype/LocModelType";
import { CollisionFlag } from "../../rs/pathfinder/flag/CollisionFlag";
import { CollisionMap } from "../../rs/scene/CollisionMap";
import { type ArenaGrid, SOLID_FLAGS } from "../core/world/ArenaGrid";
import { FlowField, type StepGrid, canStep } from "../core/world/FlowField";
import { TILE_BLOCKED, TILE_BRIDGE, type TileGrid } from "./format";
import type { LocInfo } from "./recipe";

// Collision worked out from a grid alone, without building a scene, by the same
// rules as SceneBuilder (decodeTerrain and addLoc) and ArenaGrid. The check in
// scaperune.test.ts holds it to the real thing.

export type TileRect = { x0: number; y0: number; x1: number; y1: number };

const DIR_X = [0, 1, 0, -1, 1, 1, -1, -1];
const DIR_Y = [1, 0, -1, 0, 1, -1, -1, 1];

export function getCollisionFlags(grid: TileGrid, locs: (id: number) => LocInfo): Int32Array {
    const map = new CollisionMap(grid.sizeX, grid.sizeY);
    const bridges = grid.levels[1].flags;
    for (let y = 0; y < grid.sizeY; y++) {
        for (let x = 0; x < grid.sizeX; x++) {
            const i = x + y * grid.sizeX;
            // On a bridge, what's stored a level up is the ground floor
            const bridge = (bridges[i] & TILE_BRIDGE) !== 0;
            if (grid.levels[bridge ? 1 : 0].flags[i] & TILE_BLOCKED) {
                map.setBlockedByFloor(x, y);
            }
        }
    }
    for (const loc of grid.locs) {
        const bridge = (bridges[loc.x + loc.y * grid.sizeX] & TILE_BRIDGE) !== 0;
        if (loc.level !== (bridge ? 1 : 0)) {
            continue;
        }
        const info = locs(loc.id);
        if (info.clipType === 0 || !info.drawn) {
            continue;
        }
        const sizeX = loc.rotation & 1 ? info.sizeY : info.sizeX;
        const sizeY = loc.rotation & 1 ? info.sizeX : info.sizeY;
        switch (loc.type) {
            case LocModelType.WALL:
            case LocModelType.WALL_TRI_CORNER:
            case LocModelType.WALL_CORNER:
            case LocModelType.WALL_RECT_CORNER:
                map.addWall(loc.x, loc.y, loc.type, loc.rotation, info.blocksProjectile);
                break;
            case LocModelType.WALL_DIAGONAL:
            case LocModelType.NORMAL:
            case LocModelType.NORMAL_DIAGIONAL:
                map.addLoc(loc.x, loc.y, sizeX, sizeY, info.blocksProjectile);
                break;
            case LocModelType.FLOOR_DECORATION:
                if (info.clipType === 1) {
                    map.setBlockedByFloorDec(loc.x, loc.y);
                }
                break;
        }
    }
    return map.flags;
}

// The tiles of a rectangle that can be walked between, as canStep walks
export function getStepGrid(flags: Int32Array, sizeX: number, rect: TileRect): StepGrid {
    const inside = (x: number, y: number) =>
        x >= rect.x0 && y >= rect.y0 && x <= rect.x1 && y <= rect.y1;
    const getFlags = (x: number, y: number) =>
        inside(x, y) ? flags[x + y * sizeX] : CollisionFlag.OBJECT;
    return { getFlags, isSolid: (x, y) => (getFlags(x, y) & SOLID_FLAGS) !== 0 };
}

// Which tiles can be reached from a tile, by tile index
export function findReachable(
    flags: Int32Array,
    sizeX: number,
    sizeY: number,
    rect: TileRect,
    fromX: number,
    fromY: number,
): Uint8Array {
    const grid = getStepGrid(flags, sizeX, rect);
    const reached = new Uint8Array(sizeX * sizeY);
    if (grid.isSolid(fromX, fromY)) {
        return reached;
    }
    const queue = [fromX + fromY * sizeX];
    reached[queue[0]] = 1;
    while (queue.length > 0) {
        const i = queue.pop()!;
        const x = i % sizeX;
        const y = (i / sizeX) | 0;
        for (let d = 0; d < 8; d++) {
            const j = x + DIR_X[d] + (y + DIR_Y[d]) * sizeX;
            if (
                !grid.isSolid(x + DIR_X[d], y + DIR_Y[d]) &&
                !reached[j] &&
                canStep(grid, x, y, DIR_X[d], DIR_Y[d])
            ) {
                reached[j] = 1;
                queue.push(j);
            }
        }
    }
    return reached;
}

// Open tiles of the rectangle that can't be reached, by tile index
export function findStranded(
    flags: Int32Array,
    sizeX: number,
    rect: TileRect,
    reached: Uint8Array,
): number[] {
    const grid = getStepGrid(flags, sizeX, rect);
    const stranded: number[] = [];
    for (let y = rect.y0; y <= rect.y1; y++) {
        for (let x = rect.x0; x <= rect.x1; x++) {
            if (!grid.isSolid(x, y) && !reached[x + y * sizeX]) {
                stranded.push(x + y * sizeX);
            }
        }
    }
    return stranded;
}

// Blocks a tile: on a bridge that's the level that's the ground floor
export function blockTile(grid: TileGrid, i: number): void {
    const bridge = (grid.levels[1].flags[i] & TILE_BRIDGE) !== 0;
    grid.levels[bridge ? 1 : 0].flags[i] |= TILE_BLOCKED;
}

// The open tiles of a real arena, and how many of them can't reach a tile
export function countStranded(
    grid: ArenaGrid,
    fromX: number,
    fromY: number,
): { open: number; stranded: number } {
    const field = new FlowField(Math.max(grid.sizeX, grid.sizeY) * 2 + 2);
    field.update(grid, Math.floor(fromX), Math.floor(fromY));
    let open = 0;
    let stranded = 0;
    for (let y = grid.baseY; y < grid.baseY + grid.sizeY; y++) {
        for (let x = grid.baseX; x < grid.baseX + grid.sizeX; x++) {
            if (!grid.isSolid(x, y)) {
                open++;
                stranded += field.isReachable(x, y) ? 0 : 1;
            }
        }
    }
    return { open, stranded };
}
