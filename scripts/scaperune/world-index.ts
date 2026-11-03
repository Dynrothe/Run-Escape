// Indexes the whole world into a file, so that looking for what a place is made of doesn't
// mean reading the cache each time: every map square's locs, floors and how often each is
// used, by square, the ground floor's and (in upper) each level's over it. find-place.ts
// searches it.
//
//   npx tsx scripts/scaperune/world-index.ts out.json
import fs from "node:fs";

import {
    cacheFloorId,
    createTileGrid,
    readLocs,
    readTerrain,
} from "../../src/game/scaperune/format";
import { CacheSystem } from "../../src/rs/cache/CacheSystem";
import { getCacheLoaderFactory } from "../../src/rs/cache/loader/CacheLoaderFactory";
import { UnderlayFloorType } from "../../src/rs/config/floortype/UnderlayFloorType";
import { loadGameCache } from "../cache/scene-util";

const out = process.argv[2];
const cache = loadGameCache();
const factory = getCacheLoaderFactory(cache.info, CacheSystem.fromFiles(cache.type, cache.files));
const maps = factory.getMapFileLoader();
const locTypes = factory.getLocTypeLoader();
const underlayTypes = factory.getUnderlayTypeLoader();
const overlayTypes = factory.getOverlayTypeLoader();

// What's on one level of a square, by id: locs as id:type
type Level = {
    locs: Record<string, number>;
    underlays: Record<number, number>;
    overlays: Record<number, number>;
};
// The ground floor's at the top, as it always was; the levels over it, where they have anything,
// in upper (by level)
type Square = Level & { x: number; y: number; upper?: Record<number, Level> };
const squares: Square[] = [];
// count is how often a loc's on the ground floor, upper how often on the levels over it
const locKinds = new Map<string, { id: number; type: number; count: number; upper: number }>();
const add = (counts: Record<string | number, number>, key: string | number) => {
    counts[key] = (counts[key] ?? 0) + 1;
};
for (let mapX = 0; mapX < 100; mapX++) {
    for (let mapY = 0; mapY < 200; mapY++) {
        const terrain = maps.getTerrainData(mapX, mapY);
        const locData = maps.getLocData(mapX, mapY, new Map());
        if (!terrain || !locData) {
            continue;
        }
        const grid = createTileGrid(64, 64);
        readTerrain(terrain, mapX, mapY, grid, 0, 0);
        readLocs(locData, grid, 0, 0);
        const levels: Level[] = grid.levels.map(() => ({ locs: {}, underlays: {}, overlays: {} }));
        grid.levels.forEach((tiles, level) => {
            for (const id of tiles.underlays) {
                if (id) {
                    add(levels[level].underlays, id);
                }
            }
            for (const id of tiles.overlays) {
                if (id) {
                    add(levels[level].overlays, id);
                }
            }
        });
        for (const loc of grid.locs) {
            const key = `${loc.id}:${loc.type}`;
            add(levels[loc.level].locs, key);
            let kind = locKinds.get(key);
            if (!kind) {
                kind = { id: loc.id, type: loc.type, count: 0, upper: 0 };
                locKinds.set(key, kind);
            }
            if (loc.level === 0) {
                kind.count++;
            } else {
                kind.upper++;
            }
        }
        const square: Square = { x: mapX, y: mapY, ...levels[0] };
        for (let level = 1; level < levels.length; level++) {
            const { locs, underlays, overlays } = levels[level];
            if (
                Object.keys(locs).length +
                Object.keys(underlays).length +
                Object.keys(overlays).length
            ) {
                square.upper ??= {};
                square.upper[level] = levels[level];
            }
        }
        squares.push(square);
    }
}
const locs: Record<string, object> = {};
for (const [key, { id, type, count, upper }] of locKinds) {
    const def = locTypes.load(id);
    locs[key] = {
        id,
        type,
        count,
        upper,
        name: def.name,
        sizeX: def.sizeX,
        sizeY: def.sizeY,
        clip: def.clipType,
        contour: def.contouredGround,
        models: def.models?.length ?? 0,
    };
}
const floorsUsed = (key: "underlays" | "overlays") => {
    const used = new Set<number>();
    for (const square of squares) {
        for (const level of [square, ...Object.values(square.upper ?? {})]) {
            for (const id of Object.keys(level[key])) {
                used.add(Number(id));
            }
        }
    }
    return [...used];
};
const underlays = Object.fromEntries(
    floorsUsed("underlays").map((id) => {
        const type = underlayTypes.load(cacheFloorId(id)) as UnderlayFloorType;
        return [id, { rgb: type.rgbColor.toString(16) }];
    }),
);
const overlays = Object.fromEntries(
    floorsUsed("overlays").map((id) => {
        const type = overlayTypes.load(cacheFloorId(id));
        return [
            id,
            {
                rgb: type.primaryRgb?.toString(16),
                second: type.secondaryRgb?.toString(16),
                texture: type.textureId,
                hide: type.hideUnderlay,
            },
        ];
    }),
);
fs.writeFileSync(out, JSON.stringify({ squares, locs, underlays, overlays }));
console.log(`${squares.length} squares, ${locKinds.size} kinds of loc`);
