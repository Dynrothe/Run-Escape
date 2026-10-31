// Indexes the whole world into a file, so that looking for what a place is made of doesn't
// mean reading the cache each time: every map square's locs, floors and how often each is
// used, by square.
//
//   npx tsx scripts/scaperune/world-index.ts out.json
import fs from "node:fs";

import { createTileGrid, readLocs, readTerrain } from "../../src/game/scaperune/format";
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

type Square = {
    x: number;
    y: number;
    locs: Record<string, number>;
    underlays: Record<number, number>;
    overlays: Record<number, number>;
};
const squares: Square[] = [];
const locKinds = new Map<string, { id: number; type: number; count: number }>();
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
        const square: Square = { x: mapX, y: mapY, locs: {}, underlays: {}, overlays: {} };
        for (const id of grid.levels[0].underlays) {
            if (id) {
                add(square.underlays, id);
            }
        }
        for (const id of grid.levels[0].overlays) {
            if (id) {
                add(square.overlays, id);
            }
        }
        for (const loc of grid.locs) {
            if (loc.level === 0) {
                const key = `${loc.id}:${loc.type}`;
                add(square.locs, key);
                const kind = locKinds.get(key);
                if (kind) {
                    kind.count++;
                } else {
                    locKinds.set(key, { id: loc.id, type: loc.type, count: 1 });
                }
            }
        }
        squares.push(square);
    }
}
const locs: Record<string, object> = {};
for (const [key, { id, type, count }] of locKinds) {
    const def = locTypes.load(id);
    locs[key] = {
        id,
        type,
        count,
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
        for (const id of Object.keys(square[key])) {
            used.add(Number(id));
        }
    }
    return [...used];
};
const underlays = Object.fromEntries(
    floorsUsed("underlays").map((id) => {
        const type = underlayTypes.load(id - 1) as UnderlayFloorType;
        return [id, { rgb: type.rgbColor.toString(16) }];
    }),
);
const overlays = Object.fromEntries(
    floorsUsed("overlays").map((id) => {
        const type = overlayTypes.load(id - 1);
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
