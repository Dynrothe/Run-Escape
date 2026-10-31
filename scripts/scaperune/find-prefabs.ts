// Draws a map square as text, to pick a rectangle to stamp: walls #, things that
// block T, water or blocked floor ~, floors o, bridges B. Lists what stands on it
// and its floors (ids as the map files store them), to survey a kind of ground.
//
//   npx tsx scripts/scaperune/find-prefabs.ts 50 50
import {
    TILE_BLOCKED,
    TILE_BRIDGE,
    createTileGrid,
    readLocs,
    readTerrain,
} from "../../src/game/scaperune/format";
import { CacheSystem } from "../../src/rs/cache/CacheSystem";
import { getCacheLoaderFactory } from "../../src/rs/cache/loader/CacheLoaderFactory";
import { loadGameCache } from "../cache/scene-util";

const mapX = Number(process.argv[2]);
const mapY = Number(process.argv[3]);

const cache = loadGameCache();
const factory = getCacheLoaderFactory(cache.info, CacheSystem.fromFiles(cache.type, cache.files));
const maps = factory.getMapFileLoader();
const locTypes = factory.getLocTypeLoader();

const terrain = maps.getTerrainData(mapX, mapY);
const locData = maps.getLocData(mapX, mapY, new Map());
if (!terrain || !locData) {
    throw new Error(`No map square ${mapX},${mapY}`);
}
const grid = createTileGrid(64, 64);
readTerrain(terrain, mapX, mapY, grid, 0, 0);
readLocs(locData, grid, 0, 0);

const rows: string[][] = [];
for (let y = 0; y < 64; y++) {
    const row: string[] = [];
    for (let x = 0; x < 64; x++) {
        const i = x + y * 64;
        let ch = ".";
        if (grid.levels[0].flags[i] & TILE_BLOCKED) {
            ch = "~";
        } else if (grid.levels[0].overlays[i]) {
            ch = "o";
        }
        if (grid.levels[1].flags[i] & TILE_BRIDGE) {
            ch = "B";
        }
        row.push(ch);
    }
    rows.push(row);
}
const counts = new Map<string, number>();
for (const loc of grid.locs) {
    if (loc.level !== 0) {
        continue;
    }
    const type = locTypes.load(loc.id);
    if (loc.type <= 3 || loc.type === 9) {
        rows[loc.y][loc.x] = "#";
    } else if ((loc.type === 10 || loc.type === 11) && type.clipType !== 0) {
        rows[loc.y][loc.x] = "T";
    }
    if (loc.type === 10 || loc.type === 22) {
        const key = `${loc.id} ${type.name} ${type.sizeX}x${type.sizeY} type ${loc.type}`;
        counts.set(key, (counts.get(key) ?? 0) + 1);
    }
}
for (let y = 63; y >= 0; y--) {
    console.log(String(mapY * 64 + y).padStart(5), rows[y].join(""));
}
console.log(
    "      " + Array.from({ length: 64 }, (_, i) => i % 10).join(""),
    `x from ${mapX * 64}`,
);
const countFloors = (ids: Uint16Array) => {
    const floors = new Map<number, number>();
    for (const id of ids) {
        if (id !== 0) {
            floors.set(id, (floors.get(id) ?? 0) + 1);
        }
    }
    return [...floors]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 8)
        .map(([id, count]) => `${id} (${count})`)
        .join(", ");
};
console.log("underlays:", countFloors(grid.levels[0].underlays));
console.log("overlays:", countFloors(grid.levels[0].overlays));
console.log(
    [...counts]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 24)
        .map(([key, count]) => `${count} x ${key}`)
        .join("\n"),
);
