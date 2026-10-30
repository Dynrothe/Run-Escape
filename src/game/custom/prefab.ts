import { MapFileLoader } from "../../rs/map/MapFileLoader";
import {
    MAP_SQUARE_SIZE,
    PlacedLoc,
    TileGrid,
    createTileGrid,
    readLocs,
    readTerrain,
} from "./mapFormat";

// A loc's tiles, unrotated
export type LocSizes = (id: number) => [number, number];

// Cuts a rectangle out of the real world, every level of it: there's no
// building entity in the cache, a building is its locs and floor tiles.
export function cutPrefab(
    maps: MapFileLoader,
    worldX: number,
    worldY: number,
    sizeX: number,
    sizeY: number,
): TileGrid {
    const grid = createTileGrid(sizeX, sizeY);
    const firstX = Math.floor(worldX / MAP_SQUARE_SIZE);
    const firstY = Math.floor(worldY / MAP_SQUARE_SIZE);
    // One past the end, for the corners on the far edge
    const lastX = Math.floor((worldX + sizeX) / MAP_SQUARE_SIZE);
    const lastY = Math.floor((worldY + sizeY) / MAP_SQUARE_SIZE);
    for (let mapX = firstX; mapX <= lastX; mapX++) {
        for (let mapY = firstY; mapY <= lastY; mapY++) {
            const offsetX = mapX * MAP_SQUARE_SIZE - worldX;
            const offsetY = mapY * MAP_SQUARE_SIZE - worldY;
            const terrain = maps.getTerrainData(mapX, mapY);
            if (terrain) {
                readTerrain(terrain, mapX, mapY, grid, offsetX, offsetY);
            }
            const locs = maps.getLocData(mapX, mapY, new Map());
            if (locs) {
                readLocs(locs, grid, offsetX, offsetY);
            }
        }
    }
    return grid;
}

// Turns a prefab clockwise, rotation quarter turns, the way the client turns
// the chunks of an instance: the overlay shapes and locs turn with it, and
// locs of more than one tile stay on the tiles they filled.
export function rotatePrefab(prefab: TileGrid, rotation: number, locSizes: LocSizes): TileGrid {
    const turns = rotation & 3;
    if (turns === 0) {
        return prefab;
    }
    const { sizeX, sizeY } = prefab;
    const out = createTileGrid(turns & 1 ? sizeY : sizeX, turns & 1 ? sizeX : sizeY);
    const turnX = (x: number, y: number, w: number, h: number) =>
        turns === 1 ? y : turns === 2 ? sizeX - x - w : sizeY - y - h;
    const turnY = (x: number, y: number, w: number, h: number) =>
        turns === 1 ? sizeX - x - w : turns === 2 ? sizeY - y - h : x;

    for (let level = 0; level < prefab.levels.length; level++) {
        const from = prefab.levels[level];
        const to = out.levels[level];
        for (let y = 0; y < sizeY; y++) {
            for (let x = 0; x < sizeX; x++) {
                const i = x + y * sizeX;
                const j = turnX(x, y, 1, 1) + turnY(x, y, 1, 1) * out.sizeX;
                to.underlays[j] = from.underlays[i];
                to.overlays[j] = from.overlays[i];
                to.shapes[j] = from.shapes[i];
                to.rotations[j] = (from.rotations[i] + turns) & 3;
                to.flags[j] = from.flags[i];
            }
        }
        for (let y = 0; y <= sizeY; y++) {
            for (let x = 0; x <= sizeX; x++) {
                const i = x + y * (sizeX + 1);
                const j = turnX(x, y, 0, 0) + turnY(x, y, 0, 0) * (out.sizeX + 1);
                to.heights[j] = from.heights[i];
            }
        }
    }
    out.locs = prefab.locs.map((loc): PlacedLoc => {
        const [locX, locY] = locSizes(loc.id);
        const w = loc.rotation & 1 ? locY : locX;
        const h = loc.rotation & 1 ? locX : locY;
        return {
            ...loc,
            rotation: (loc.rotation + turns) & 3,
            x: turnX(loc.x, loc.y, w, h),
            y: turnY(loc.x, loc.y, w, h),
        };
    });
    return out;
}
