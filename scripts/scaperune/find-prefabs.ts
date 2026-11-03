// Draws a piece of the real world as text, to pick a rectangle to stamp: walls #, things that
// block T, water or blocked floor ~, floors o, bridges B. Lists what stands on it and its floors
// (ids as the map files store them), to survey a kind of ground.
//
//   npx tsx scripts/scaperune/find-prefabs.ts 50 50                # one map square
//   npx tsx scripts/scaperune/find-prefabs.ts rect=3161,4373,19,29 plane=1 collision=1 pieces=1
//
// Options, after the square or instead of it:
//   rect=x,y,w,h  a rectangle in world tiles, across squares if it likes (cutPrefab's)
//   plane=N       the level to look at, brought down as cutPrefab's plane does (default 0)
//   collision=1   draw the game's collision instead (getCollisionFlags): . open, # blocked,
//                 + open but with a wall on one of its edges
//   pieces=1      list the biggest pieces of open ground (findPieces): tiles and the box round
//                 each, in world tiles. A cut that falls into small pieces won't hold waves.
//   doors=off     take the doors off first (isDoor), as stamps usually do
//   props=off     take the one-tile things that block off first (lamps, stools, counters), to
//                 see what clearing a town's streets would open up
import { SOLID_FLAGS } from "../../src/game/core/world/ArenaGrid";
import { findPieces, getCollisionFlags } from "../../src/game/scaperune/collision";
import { MAP_SQUARE_SIZE, TILE_BLOCKED, TILE_BRIDGE } from "../../src/game/scaperune/format";
import { cutPrefab } from "../../src/game/scaperune/prefab";
import { isDoor } from "../../src/game/scaperune/prefabs";
import { createBuildContext } from "../../src/game/scaperune/squares";
import { CacheSystem } from "../../src/rs/cache/CacheSystem";
import { getCacheLoaderFactory } from "../../src/rs/cache/loader/CacheLoaderFactory";
import { loadGameCache } from "../cache/scene-util";

// A wall on any of a tile's edges or corners
const WALL_FLAGS = 0xff;
const PIECES_LISTED = 8;

const options = new Map<string, string>();
const square: number[] = [];
for (const arg of process.argv.slice(2)) {
    const eq = arg.indexOf("=");
    if (eq > 0) {
        options.set(arg.slice(0, eq), arg.slice(eq + 1));
    } else {
        square.push(Number(arg));
    }
}
let [worldX, worldY, sizeX, sizeY] = [0, 0, MAP_SQUARE_SIZE, MAP_SQUARE_SIZE];
if (options.has("rect")) {
    [worldX, worldY, sizeX, sizeY] = options.get("rect")!.split(",").map(Number);
} else if (square.length === 2) {
    [worldX, worldY] = [square[0] * MAP_SQUARE_SIZE, square[1] * MAP_SQUARE_SIZE];
} else {
    console.log(
        "Usage: find-prefabs.ts mapX mapY | rect=x,y,w,h  [plane=N] [collision=1] [pieces=1] " +
            "[doors=off] [props=off]",
    );
    process.exit(1);
}
if (![worldX, worldY, sizeX, sizeY].every(Number.isInteger) || sizeX <= 0 || sizeY <= 0) {
    throw new Error(`Not a rectangle: ${worldX},${worldY},${sizeX},${sizeY}`);
}
const plane = Number(options.get("plane") ?? 0);

const cache = loadGameCache();
const factory = getCacheLoaderFactory(cache.info, CacheSystem.fromFiles(cache.type, cache.files));
const maps = factory.getMapFileLoader();
const locTypes = factory.getLocTypeLoader();
const context = createBuildContext(maps, locTypes);

if (square.length === 2 && !maps.getTerrainData(square[0], square[1])) {
    throw new Error(`No map square ${square[0]},${square[1]}`);
}
const grid = cutPrefab(maps, worldX, worldY, sizeX, sizeY, { plane });
const before = grid.locs.length;
if (options.get("doors") === "off") {
    grid.locs = grid.locs.filter((loc) => !isDoor(context, loc));
}
if (options.get("props") === "off") {
    // One-tile scenery and floor decoration that block by getCollisionFlags' rules
    grid.locs = grid.locs.filter((loc) => {
        const info = context.locs(loc.id);
        const blocks =
            info.drawn &&
            info.clipType > 0 &&
            (loc.type === 10 || loc.type === 11 || (loc.type === 22 && info.clipType === 1));
        return !(blocks && info.sizeX === 1 && info.sizeY === 1);
    });
}
if (grid.locs.length < before) {
    console.log(`took ${before - grid.locs.length} locs off`);
}

const flags = getCollisionFlags(grid, context.locs);
const rows: string[][] = [];
for (let y = 0; y < sizeY; y++) {
    const row: string[] = [];
    for (let x = 0; x < sizeX; x++) {
        const i = x + y * sizeX;
        let ch = ".";
        if (options.get("collision") === "1") {
            ch = flags[i] & SOLID_FLAGS ? "#" : flags[i] & WALL_FLAGS ? "+" : ".";
        } else {
            if (grid.levels[0].flags[i] & TILE_BLOCKED) {
                ch = "~";
            } else if (grid.levels[0].overlays[i]) {
                ch = "o";
            }
            if (grid.levels[1].flags[i] & TILE_BRIDGE) {
                ch = "B";
            }
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
    if (options.get("collision") !== "1") {
        if (loc.type <= 3 || loc.type === 9) {
            rows[loc.y][loc.x] = "#";
        } else if ((loc.type === 10 || loc.type === 11) && type.clipType !== 0) {
            rows[loc.y][loc.x] = "T";
        }
    }
    if (loc.type === 10 || loc.type === 22) {
        const key = `${loc.id} ${type.name} ${type.sizeX}x${type.sizeY} type ${loc.type}`;
        counts.set(key, (counts.get(key) ?? 0) + 1);
    }
}
console.log(`world ${worldX},${worldY}, ${sizeX} by ${sizeY}, plane ${plane}`);
for (let y = sizeY - 1; y >= 0; y--) {
    console.log(String(worldY + y).padStart(5), rows[y].join(""));
}
console.log(
    "      " + Array.from({ length: sizeX }, (_, i) => (worldX + i) % 10).join(""),
    `x from ${worldX}`,
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
if (options.get("pieces") === "1") {
    const pieces = findPieces(flags, sizeX, sizeY);
    const open = pieces.reduce((sum, piece) => sum + piece.size, 0);
    console.log(`pieces: ${open} open tiles in ${pieces.length} pieces`);
    for (const piece of pieces.slice(0, PIECES_LISTED)) {
        console.log(
            `  ${String(piece.size).padStart(6)} tiles, x ${worldX + piece.x0} to ${worldX + piece.x1}, ` +
                `y ${worldY + piece.y0} to ${worldY + piece.y1}`,
        );
    }
}
