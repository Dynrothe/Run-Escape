import { LocModelType } from "../../rs/config/loctype/LocModelType";
import { CollisionFlag } from "../../rs/pathfinder/flag/CollisionFlag";
import { CollisionMap } from "../../rs/scene/CollisionMap";
import { type ArenaGrid, SOLID_FLAGS } from "../core/world/ArenaGrid";
import { FlowField, type StepGrid, canStep } from "../core/world/FlowField";
import { TILE_BLOCKED, TILE_BRIDGE, type TileGrid } from "./format";
import type { LocInfo, MapPoint, MapRegion } from "./recipe";

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

// A region for sealFrom, and what it must come to
export type SealRegion = MapRegion & {
    // Throws if the flood reaches fewer tiles than this
    min?: number;
    // Throws if more open tiles of the rectangle than this can't be walked to, and so are sealed
    maxSealed?: number;
};

export type SealResult = {
    // For each region in order: the tiles its flood reached, and the open ones it sealed
    regions: { name: string; open: number; sealed: number }[];
    // Open tiles outside every region that were blocked, with outside: "block"
    outside: number;
    // What each region's flood reached, by tile index
    reached: Uint8Array[];
    sizeX: number;
};

// Floods each region from its start, without leaving its rectangle, then blocks every tile of the
// rectangle that no region's flood reached, walls and all, so nothing's left open that can't be
// walked to. With outside: "block", every tile outside every region is blocked too, for a map
// that's only its rooms. Throws first, having blocked nothing, if a region comes to fewer than its
// `min` tiles or seals more than its `maxSealed`. The rooms of a raid, or an arena with nothing
// walkable round it, are this.
export function sealFrom(
    grid: TileGrid,
    locs: (id: number) => LocInfo,
    regions: SealRegion[],
    options: { outside?: "block" | "keep"; label?: string } = {},
): SealResult {
    const { sizeX, sizeY } = grid;
    const label = options.label ?? "sealFrom";
    const flags = getCollisionFlags(grid, locs);
    const reached = regions.map(({ rect, from }) =>
        findReachable(flags, sizeX, sizeY, rect, from.x, from.y),
    );
    const open = new Uint8Array(sizeX * sizeY);
    const inRegion = new Uint8Array(sizeX * sizeY);
    for (let r = 0; r < regions.length; r++) {
        const { x0, y0, x1, y1 } = regions[r].rect;
        for (let y = y0; y <= y1; y++) {
            for (let x = x0; x <= x1; x++) {
                const i = x + y * sizeX;
                inRegion[i] = 1;
                open[i] |= reached[r][i];
            }
        }
    }
    const isSolid = (i: number) => (flags[i] & SOLID_FLAGS) !== 0;
    const counts = regions.map(({ name, rect, from, min, maxSealed }, r) => {
        let count = 0;
        let sealed = 0;
        let missed: string | undefined;
        for (let y = rect.y0; y <= rect.y1; y++) {
            for (let x = rect.x0; x <= rect.x1; x++) {
                const i = x + y * sizeX;
                count += reached[r][i];
                if (!open[i] && !isSolid(i)) {
                    sealed++;
                }
                if (!reached[r][i] && missed === undefined) {
                    missed = `${x},${y}`;
                }
            }
        }
        if (min !== undefined && count < min) {
            throw new Error(
                `${label}: ${name} has ${count} open tiles from ${from.x},${from.y}, under ${min}` +
                    ` (the first tile it doesn't reach is ${missed})`,
            );
        }
        if (maxSealed !== undefined && sealed > maxSealed) {
            throw new Error(`${label}: ${name} would seal ${sealed} open tiles, over ${maxSealed}`);
        }
        return { name, open: count, sealed };
    });
    let outside = 0;
    for (let i = 0; i < sizeX * sizeY; i++) {
        if (open[i] || (!inRegion[i] && options.outside !== "block")) {
            continue;
        }
        if (!inRegion[i] && !isSolid(i)) {
            outside++;
        }
        blockTile(grid, i);
    }
    return { regions: counts, outside, reached, sizeX };
}

// Throws unless each point is on a tile sealFrom left open: one its own region's flood reached, if
// it names a region, or any region's if not
export function assertReachable(
    sealed: SealResult,
    points: MapPoint[],
    label = "assertReachable",
): void {
    for (const point of points) {
        const i = Math.floor(point.x) + Math.floor(point.y) * sealed.sizeX;
        let masks = sealed.reached;
        if (point.region !== undefined) {
            const r = sealed.regions.findIndex((region) => region.name === point.region);
            if (r < 0) {
                throw new Error(
                    `${label}: ${point.name} is in ${point.region}, which isn't a region`,
                );
            }
            masks = [sealed.reached[r]];
        }
        if (!masks.some((reached) => reached[i])) {
            const where = point.region ? ` from ${point.region}'s start` : "";
            throw new Error(
                `${label}: ${point.name} at ${point.x},${point.y} can't be reached${where}`,
            );
        }
    }
}

// The open tiles of a real arena, or of a rectangle of it in world tiles, and how many of them
// can't reach a tile. Leaked is how many open tiles outside the rectangle can: a room's way out.
// Pass a field to use one again.
export function countStranded(
    grid: ArenaGrid,
    fromX: number,
    fromY: number,
    rect?: TileRect,
    field = new FlowField(Math.max(grid.sizeX, grid.sizeY) * 2 + 2),
): { open: number; stranded: number; leaked: number } {
    field.update(grid, Math.floor(fromX), Math.floor(fromY));
    let open = 0;
    let stranded = 0;
    let leaked = 0;
    for (let y = grid.baseY; y < grid.baseY + grid.sizeY; y++) {
        for (let x = grid.baseX; x < grid.baseX + grid.sizeX; x++) {
            if (grid.isSolid(x, y)) {
                continue;
            }
            if (!rect || (x >= rect.x0 && y >= rect.y0 && x <= rect.x1 && y <= rect.y1)) {
                open++;
                stranded += field.isReachable(x, y) ? 0 : 1;
            } else {
                leaked += field.isReachable(x, y) ? 1 : 0;
            }
        }
    }
    return { open, stranded, leaked };
}
