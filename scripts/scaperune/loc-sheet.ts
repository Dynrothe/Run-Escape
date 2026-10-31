// Draws locs on a sheet from about where the play camera sees them, with their ids, without a
// browser: the quick way to look through a place's scenery. Colours are near enough (textures
// are their average), and a loc too big for its cell is drawn smaller.
//
//   npx tsx scripts/scaperune/loc-sheet.ts out.png 1276 1278:22 10820
//
// An id can have a loc type after it (10 if not). A prefab's rectangle, world x,y,sizeX,sizeY,
// is drawn from above, floor and all, as the generator would have it:
//
//   npx tsx scripts/scaperune/loc-sheet.ts out.png 3243,3244,6,5 3238,3204,11,13
import fs from "node:fs";

import { PlacedLoc } from "../../src/game/scaperune/format";
import { cutPrefab } from "../../src/game/scaperune/prefab";
import { CacheSystem } from "../../src/rs/cache/CacheSystem";
import { getCacheLoaderFactory } from "../../src/rs/cache/loader/CacheLoaderFactory";
import { UnderlayFloorType } from "../../src/rs/config/floortype/UnderlayFloorType";
import { LocModelLoader } from "../../src/rs/config/loctype/LocModelLoader";
import { LocModelType } from "../../src/rs/config/loctype/LocModelType";
import { HSL_RGB_MAP, blendLight } from "../../src/rs/util/ColorUtil";
import { loadGameCache } from "../cache/scene-util";
import { encodePng } from "./png";

const CELL = Number(process.env.CELL ?? 120);
const LABEL = 8;
const COLUMNS = Math.floor(960 / CELL);
const TILE_PIXELS = 26;
const TILE = 128;
const PITCH = (70 * Math.PI) / 180;
const SIN = Math.sin(PITCH);
const COS = Math.cos(PITCH);
const DIGITS = [
    "111101101101111",
    "010110010010111",
    "111001111100111",
    "111001111001111",
    "101101111001001",
    "111100111001111",
    "111100111101111",
    "111001001001001",
    "111101111101111",
    "111101111001111",
];

const [out, ...specs] = process.argv.slice(2);
const cache = loadGameCache();
const factory = getCacheLoaderFactory(cache.info, CacheSystem.fromFiles(cache.type, cache.files));
const maps = factory.getMapFileLoader();
const locTypes = factory.getLocTypeLoader();
const underlayTypes = factory.getUnderlayTypeLoader();
const overlayTypes = factory.getOverlayTypeLoader();
const textures = factory.getTextureLoader();
const loader = new LocModelLoader(
    locTypes,
    factory.getModelLoader(),
    textures,
    factory.getSeqTypeLoader(),
    factory.getSeqFrameLoader(),
    factory.getSkeletalSeqLoader(),
);

const rows = Math.ceil(specs.length / COLUMNS);
const width = CELL * COLUMNS;
const height = CELL * rows;
const rgb = new Uint8Array(width * height * 3);
const depths = new Float32Array(width * height).fill(-Infinity);
for (let i = 0; i < width * height; i++) {
    rgb[i * 3] = 62;
    rgb[i * 3 + 1] = 74;
    rgb[i * 3 + 2] = 52;
}

function put(x: number, y: number, color: number): void {
    if (x >= 0 && y >= 0 && x < width && y < height) {
        const i = (x + y * width) * 3;
        rgb[i] = color >> 16;
        rgb[i + 1] = (color >> 8) & 255;
        rgb[i + 2] = color & 255;
    }
}

function label(text: string, x: number, y: number): void {
    [...text].forEach((char, at) => {
        const digit = char === "x" ? "000101010101000" : (DIGITS[Number(char)] ?? "");
        [...digit].forEach((bit, i) => {
            if (bit === "1") {
                put(x + at * 4 + (i % 3), y + Math.floor(i / 3), 0xffffff);
            }
        });
    });
}

function drawTriangle(
    points: [number, number, number][],
    color: number,
    x0: number,
    y0: number,
): void {
    const xs = points.map((p) => p[0]);
    const ys = points.map((p) => p[1]);
    const left = Math.max(Math.floor(Math.min(...xs)), x0);
    const right = Math.min(Math.ceil(Math.max(...xs)), x0 + CELL - 1);
    const top = Math.max(Math.floor(Math.min(...ys)), y0 + LABEL);
    const bottom = Math.min(Math.ceil(Math.max(...ys)), y0 + CELL - 1);
    const [a, b, c] = points;
    const area = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
    if (Math.abs(area) < 0.01) {
        return;
    }
    for (let y = top; y <= bottom; y++) {
        for (let x = left; x <= right; x++) {
            const u = ((x - a[0]) * (c[1] - a[1]) - (y - a[1]) * (c[0] - a[0])) / area;
            const v = ((y - a[1]) * (b[0] - a[0]) - (x - a[0]) * (b[1] - a[1])) / area;
            if (u < 0 || v < 0 || u + v > 1) {
                continue;
            }
            const depth = a[2] + (b[2] - a[2]) * u + (c[2] - a[2]) * v;
            const i = x + y * width;
            if (depth > depths[i]) {
                depths[i] = depth;
                put(x, y, color);
            }
        }
    }
}

// Draws a loc's model with its middle at a point
function drawLoc(
    loc: Pick<PlacedLoc, "id" | "type" | "rotation">,
    fit: number,
    middleX: number,
    middleY: number,
    x0: number,
    y0: number,
): void {
    const def = locTypes.load(loc.id);
    let data;
    try {
        data = loader.getLocModelData(def, loc.type as LocModelType, loc.rotation);
    } catch {
        return;
    }
    if (!data) {
        return;
    }
    const model = data.light(textures, def.ambient + 64, def.contrast + 768, -50, -10, -50);
    const screen = (v: number): [number, number, number] => {
        const x = model.verticesX[v];
        const h = -model.verticesY[v];
        const z = model.verticesZ[v];
        return [middleX + x * fit, middleY - (z * SIN + h * COS) * fit, h * SIN - z * COS];
    };
    for (let face = 0; face < model.faceCount; face++) {
        if (model.faceColors3[face] === -2 || (model.faceAlphas?.[face] ?? 0) < 0) {
            continue;
        }
        const texture = model.faceTextures?.[face] ?? -1;
        const light = model.faceColors1[face];
        const hsl =
            texture !== -1 ? blendLight(textures.getAverageHsl(texture), light & 127) : light;
        drawTriangle(
            [
                screen(model.indices1[face]),
                screen(model.indices2[face]),
                screen(model.indices3[face]),
            ],
            HSL_RGB_MAP[hsl & 0xffff] ?? 0xff00ff,
            x0,
            y0,
        );
    }
}

function drawOneLoc(spec: string, x0: number, y0: number): void {
    const [id, type] = spec.split(":").map(Number);
    const def = locTypes.load(id);
    label(`${id}`, x0 + 2, y0 + 1);
    label(`${def.sizeX}x${def.sizeY}`, x0 + CELL - 26, y0 + 1);
    let reach = 1;
    try {
        const data = loader.getLocModelData(def, (type ?? 10) as LocModelType, 0);
        for (let v = 0; v < (data?.verticesCount ?? 0); v++) {
            const x = data!.verticesX[v];
            const h = -data!.verticesY[v];
            const z = data!.verticesZ[v];
            reach = Math.max(reach, Math.abs(x), Math.abs(z * SIN + h * COS));
        }
    } catch {
        return;
    }
    const fit = Math.min(TILE_PIXELS / TILE, (CELL / 2 - LABEL) / reach);
    drawLoc({ id, type: type ?? 10, rotation: 0 }, fit, x0 + CELL / 2, y0 + CELL * 0.62, x0, y0);
}

function drawPrefab(spec: string, x0: number, y0: number): void {
    const [worldX, worldY, sizeX, sizeY] = spec.split(",").map(Number);
    const prefab = cutPrefab(maps, worldX, worldY, sizeX, sizeY);
    label(`${worldX}x${worldY}`, x0 + 2, y0 + 1);
    label(`${sizeX}x${sizeY}`, x0 + CELL - 26, y0 + 1);
    const tile = (CELL - LABEL - 4) / Math.max(sizeX, sizeY);
    const fit = tile / TILE;
    const left = x0 + 2;
    const bottom = y0 + CELL - 2;
    const { underlays, overlays } = prefab.levels[0];
    for (let y = 0; y < sizeY; y++) {
        for (let x = 0; x < sizeX; x++) {
            const i = x + y * sizeX;
            let color = 0x3e4a34;
            if (overlays[i]) {
                const type = overlayTypes.load(overlays[i] - 1);
                color = type.textureId === -1 ? type.primaryRgb : 0x6688aa;
            } else if (underlays[i]) {
                color = (underlayTypes.load(underlays[i] - 1) as UnderlayFloorType).rgbColor;
            }
            for (let py = 0; py < Math.ceil(tile * SIN); py++) {
                for (let px = 0; px < Math.ceil(tile); px++) {
                    put(
                        Math.floor(left + x * tile) + px,
                        Math.floor(bottom - (y + 1) * tile * SIN) + py,
                        color,
                    );
                }
            }
        }
    }
    const order = [...prefab.locs]
        .filter((loc) => loc.level <= 1 && (loc.type <= 3 || loc.type >= 9))
        .sort((a, b) => b.y - a.y);
    for (const loc of order) {
        const def = locTypes.load(loc.id);
        const w = loc.rotation & 1 ? def.sizeY : def.sizeX;
        const h = loc.rotation & 1 ? def.sizeX : def.sizeY;
        drawLoc(
            loc,
            fit,
            left + (loc.x + w / 2) * tile,
            bottom - (loc.y + h / 2) * tile * SIN,
            x0,
            y0,
        );
    }
}

specs.forEach((spec, index) => {
    const x0 = (index % COLUMNS) * CELL;
    const y0 = Math.floor(index / COLUMNS) * CELL;
    if (spec.includes(",")) {
        drawPrefab(spec, x0, y0);
    } else {
        drawOneLoc(spec, x0, y0);
    }
});
fs.writeFileSync(out, encodePng(width, height, rgb));
console.log(`${specs.length} locs on ${out}`);
