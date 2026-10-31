// What a map costs to draw, without a browser: bakes a map's squares with the
// game's loader and counts triangles, draw ranges and bytes, then works out what
// each spot's camera has in view.
//
//   npx tsx scripts/dev/render-stats.ts prifddinas falador lumbridge
//   npx tsx scripts/dev/render-stats.ts --bake        # memory for the baked actors
//
// Run it through a memory cap on a small machine: a big map is a few hundred MB.
import { mat4, vec3 } from "gl-matrix";

import { GameAssets } from "../../src/game/client/GameAssets";
import { ALL_MAPS, getArenaRegion } from "../../src/game/content/maps";
import { Frustum } from "../../src/mapviewer/Frustum";
import { ActorBakeLoader } from "../../src/mapviewer/webgl/actor/ActorBakeLoader";
import { SdMapData } from "../../src/mapviewer/webgl/loader/SdMapData";
import { SdMapDataLoader } from "../../src/mapviewer/webgl/loader/SdMapDataLoader";
import { clearWorkerStateCaches, createWorkerState } from "../../src/mapviewer/worker/WorkerState";
import { DEGREES_TO_RADIANS, RS_TO_RADIANS } from "../../src/rs/MathConstants";
import { Scene } from "../../src/rs/scene/Scene";
import { loadCache, loadCacheInfos } from "../cache/load-util";

// As in slim-cache.ts: the map loaders draw minimap images on an
// OffscreenCanvas, which Node doesn't have
class NodeImageData {
    readonly data: Uint8ClampedArray;

    constructor(width: number, height: number) {
        this.data = new Uint8ClampedArray(width * height * 4);
    }
}
class NodeOffscreenCanvas {
    getContext() {
        return { putImageData() {} };
    }

    convertToBlob(): Promise<Blob> {
        return Promise.resolve(new Blob());
    }
}
Object.assign(globalThis, { ImageData: NodeImageData, OffscreenCanvas: NodeOffscreenCanvas });

const FOV = 45;
const RUN_PITCH = -400;
const ASPECT = 16 / 9;
const ZOOMS = [18, 44];
const CHUNK_SIZES = [64, 32, 16, 8];
// Up is negative, in tiles
const MODEL_HEIGHT_BOX = [-18.75, 5.625];

const quietly = async <T>(load: () => Promise<T>): Promise<T> => {
    const { log, time, timeEnd } = console;
    console.log = console.time = console.timeEnd = () => {};
    try {
        return await load();
    } finally {
        Object.assign(console, { log, time, timeEnd });
    }
};

function mb(bytes: number): string {
    return (bytes / 1024 / 1024).toFixed(1) + " MB";
}

function count(n: number): string {
    return Math.round(n).toLocaleString("en-US");
}

function percent(part: number, whole: number): string {
    return whole === 0 ? "0%" : ((part / whole) * 100).toFixed(1) + "%";
}

type SquareTriangles = {
    mapX: number;
    mapY: number;
    // Per triangle: bounds of its three corners in world tiles (6 floats)
    bounds: Float32Array;
    triangleCount: number;
    alphaTriangles: number;
    terrainTriangles: number;
    instancedDraws: number;
    downward: number;
    downward30: number;
    underTerrain: number;
    uniqueTriangles: number;
    bytes: Record<string, number>;
    drawRanges: number;
};

function decodeY(v1: number): number {
    return -((v1 & 0x7fff) - 0x4000);
}

function decodeX(v0: number): number {
    return ((v0 >>> 17) & 0x7fff) - 0x4000;
}

function decodeZ(v2: number): number {
    return ((v2 >>> 17) & 0x7fff) - 0x4000;
}

function getTerrainHeight(data: SdMapData, x: number, z: number, plane: number): number {
    const size = 64 + data.borderSize * 2;
    const heights = data.heightMapTextureData;
    const tileX = x >> 7;
    const tileZ = z >> 7;
    const offsetX = x & 127;
    const offsetZ = z & 127;
    const at = (tx: number, tz: number): number => {
        const cx = Math.min(Math.max(tx + data.borderSize, 0), size - 1);
        const cz = Math.min(Math.max(tz + data.borderSize, 0), size - 1);
        return heights[plane * size * size + cz * size + cx] * 8;
    };
    const d0 = ((at(tileX, tileZ) * (128 - offsetX) + at(tileX + 1, tileZ) * offsetX) >> 7) | 0;
    const d1 =
        ((at(tileX, tileZ + 1) * (128 - offsetX) + at(tileX + 1, tileZ + 1) * offsetX) >> 7) | 0;
    return ((d0 * (128 - offsetZ) + d1 * offsetZ) >> 7) | 0;
}

function collectTriangles(data: SdMapData): SquareTriangles {
    const vertices = new Uint32Array(
        data.vertices.buffer,
        data.vertices.byteOffset,
        data.vertices.byteLength / 4,
    );
    const indices = data.indices;
    const baseX = data.mapX * 64;
    const baseZ = data.mapY * 64;

    const lists: [typeof data.drawRanges, Uint16Array, boolean][] = [
        [data.drawRanges, data.modelTextureData, false],
        [data.drawRangesAlpha, data.modelTextureDataAlpha, true],
    ];

    let total = 0;
    for (const [ranges] of lists) {
        for (const [, elements, instances] of ranges) {
            total += (elements / 3) * instances;
        }
    }
    const bounds = new Float32Array(total * 6);
    const result: SquareTriangles = {
        mapX: data.mapX,
        mapY: data.mapY,
        bounds,
        triangleCount: 0,
        alphaTriangles: 0,
        terrainTriangles: 0,
        instancedDraws: 0,
        downward: 0,
        downward30: 0,
        underTerrain: 0,
        uniqueTriangles: 0,
        drawRanges: data.drawRanges.length + data.drawRangesAlpha.length,
        bytes: {
            vertices: data.vertices.byteLength,
            indices: data.indices.byteLength,
            modelInfo: data.modelTextureData.byteLength + data.modelTextureDataAlpha.byteLength,
            modelInfoLod:
                data.modelTextureDataLod.byteLength + data.modelTextureDataLodAlpha.byteLength,
            modelInfoInteract:
                data.modelTextureDataInteract.byteLength +
                data.modelTextureDataInteractAlpha.byteLength +
                data.modelTextureDataInteractLod.byteLength +
                data.modelTextureDataInteractLodAlpha.byteLength,
            heightMap: data.heightMapTextureData.byteLength,
        },
    };

    const p = [0, 0, 0, 0, 0, 0, 0, 0, 0];
    for (const [ranges, info, alpha] of lists) {
        ranges.forEach(([offset, elements, instances], drawId) => {
            const instanceBase = info[drawId * 4];
            const first = offset / 4;
            const isTerrain =
                !alpha && drawId === 0 && instances === 1 && info[instanceBase * 4 + 3] === 0xffff;
            if (instances > 1) {
                result.instancedDraws++;
            }
            result.uniqueTriangles += elements / 3;
            for (let instance = 0; instance < instances; instance++) {
                const o = (instanceBase + instance) * 4;
                const sceneX = info[o] & 0x3fff;
                const sceneZ = info[o + 1] & 0x3fff;
                const plane = info[o] >> 14;
                const contour = info[o + 1] >> 14;
                const height = (info[o + 2] >> 6) * 8;
                for (let e = 0; e < elements; e += 3) {
                    for (let corner = 0; corner < 3; corner++) {
                        const v = indices[first + e + corner] * 3;
                        const x = decodeX(vertices[v]) + sceneX;
                        const z = decodeZ(vertices[v + 2]) + sceneZ;
                        let y = decodeY(vertices[v + 1]) - height;
                        if (contour === 0) {
                            y -= getTerrainHeight(data, sceneX, sceneZ, plane);
                        } else if (contour === 1) {
                            y -= getTerrainHeight(data, x, z, plane);
                        }
                        p[corner * 3] = x;
                        p[corner * 3 + 1] = y;
                        p[corner * 3 + 2] = z;
                    }
                    const i = result.triangleCount++ * 6;
                    bounds[i] = Math.min(p[0], p[3], p[6]) / 128 + baseX;
                    bounds[i + 1] = Math.min(p[1], p[4], p[7]) / 128;
                    bounds[i + 2] = Math.min(p[2], p[5], p[8]) / 128 + baseZ;
                    bounds[i + 3] = Math.max(p[0], p[3], p[6]) / 128 + baseX;
                    bounds[i + 4] = Math.max(p[1], p[4], p[7]) / 128;
                    bounds[i + 5] = Math.max(p[2], p[5], p[8]) / 128 + baseZ;

                    if (alpha) {
                        result.alphaTriangles++;
                    }
                    if (isTerrain) {
                        result.terrainTriangles++;
                        continue;
                    }
                    // cross of the edges; terrain (seen from above) comes out
                    // with ny < 0 in the shader's space, y down
                    const ux = p[3] - p[0];
                    const uy = p[4] - p[1];
                    const uz = p[5] - p[2];
                    const vx = p[6] - p[0];
                    const vy = p[7] - p[1];
                    const vz = p[8] - p[2];
                    const nx = uy * vz - uz * vy;
                    const ny = uz * vx - ux * vz;
                    const nz = ux * vy - uy * vx;
                    const length = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1;
                    const cos = ny / length;
                    if (cos > Math.cos(25 * DEGREES_TO_RADIANS)) {
                        result.downward++;
                    }
                    if (cos > Math.cos(30 * DEGREES_TO_RADIANS)) {
                        result.downward30++;
                    }
                    let under = true;
                    for (let corner = 0; corner < 3; corner++) {
                        const plane0 = Math.min(plane, 3);
                        const terrain = -getTerrainHeight(
                            data,
                            Math.max(p[corner * 3], 0),
                            Math.max(p[corner * 3 + 2], 0),
                            plane0,
                        );
                        if (p[corner * 3 + 1] < terrain + 4) {
                            under = false;
                            break;
                        }
                    }
                    if (under) {
                        result.underTerrain++;
                    }
                }
            }
        });
    }
    return result;
}

function makeFrustum(targetX: number, targetZ: number, zoom: number): Frustum {
    const pitch = RUN_PITCH * RS_TO_RADIANS;
    const yaw = -1024 * RS_TO_RADIANS;
    const forwardX = -Math.cos(pitch) * Math.sin(yaw);
    const forwardY = -Math.sin(pitch);
    const forwardZ = -Math.cos(pitch) * Math.cos(yaw);
    const pos = vec3.fromValues(
        targetX - forwardX * zoom,
        -forwardY * zoom,
        targetZ - forwardZ * zoom,
    );
    const projection = mat4.create();
    mat4.perspective(projection, FOV * DEGREES_TO_RADIANS, ASPECT, 0.1, 4096);
    const cameraMatrix = mat4.create();
    mat4.translate(cameraMatrix, cameraMatrix, pos);
    mat4.rotateY(cameraMatrix, cameraMatrix, yaw);
    mat4.rotateZ(cameraMatrix, cameraMatrix, 180 * DEGREES_TO_RADIANS);
    mat4.rotateX(cameraMatrix, cameraMatrix, pitch);
    const view = mat4.create();
    mat4.invert(view, cameraMatrix);
    const viewProj = mat4.create();
    mat4.multiply(viewProj, projection, view);
    const frustum = new Frustum();
    frustum.setPlanes(viewProj);
    return frustum;
}

// Triangles drawn if each square were cut into chunks of chunkSize tiles, each
// drawn or not by its triangles' real bounds
function drawnWithChunks(
    squares: SquareTriangles[],
    frustum: Frustum,
    groundY: number,
    chunkSize: number,
): { triangles: number; chunks: number; total: number } {
    const box = [
        [0, 0, 0],
        [0, 0, 0],
    ];
    let triangles = 0;
    let chunks = 0;
    let total = 0;
    for (const square of squares) {
        // The same test as MapManager, before anything finer
        const sx = square.mapX * 64;
        const sz = square.mapY * 64;
        box[0] = [sx, MODEL_HEIGHT_BOX[0] + groundY, sz];
        box[1] = [sx + 64, MODEL_HEIGHT_BOX[1] + groundY, sz + 64];
        const perSide = 64 / chunkSize;
        const n = perSide * perSide;
        total += n;
        const mins = new Float32Array(n * 3).fill(1e9);
        const maxs = new Float32Array(n * 3).fill(-1e9);
        const counts = new Int32Array(n);
        const b = square.bounds;
        for (let t = 0; t < square.triangleCount; t++) {
            const i = t * 6;
            const cx = Math.min(
                Math.max(Math.floor(((b[i] + b[i + 3]) / 2 - sx) / chunkSize), 0),
                perSide - 1,
            );
            const cz = Math.min(
                Math.max(Math.floor(((b[i + 2] + b[i + 5]) / 2 - sz) / chunkSize), 0),
                perSide - 1,
            );
            const c = cz * perSide + cx;
            counts[c]++;
            for (let a = 0; a < 3; a++) {
                mins[c * 3 + a] = Math.min(mins[c * 3 + a], b[i + a]);
                maxs[c * 3 + a] = Math.max(maxs[c * 3 + a], b[i + 3 + a]);
            }
        }
        for (let c = 0; c < n; c++) {
            if (counts[c] === 0) {
                continue;
            }
            const hit = frustum.intersectsBox([
                [mins[c * 3], mins[c * 3 + 1], mins[c * 3 + 2]],
                [maxs[c * 3], maxs[c * 3 + 1], maxs[c * 3 + 2]],
            ]);
            if (hit) {
                triangles += counts[c];
                chunks++;
            }
        }
    }
    return { triangles, chunks, total };
}

async function reportMap(mapId: string, state: ReturnType<typeof createWorkerState>) {
    const map = ALL_MAPS.find((m) => m.id === mapId);
    if (!map) {
        throw new Error("No map " + mapId);
    }
    const region = getArenaRegion(map);
    const { baseX, baseY, sizeX, sizeY, plane } = region;
    const firstX = Math.floor(baseX / Scene.MAP_SQUARE_SIZE);
    const firstY = Math.floor(baseY / Scene.MAP_SQUARE_SIZE);
    const lastX = Math.ceil((baseX + sizeX) / Scene.MAP_SQUARE_SIZE) - 1;
    const lastY = Math.ceil((baseY + sizeY) / Scene.MAP_SQUARE_SIZE) - 1;

    const loader = new SdMapDataLoader();
    loader.init();
    const squares: SquareTriangles[] = [];
    for (let mapX = firstX - 1; mapX <= lastX + 1; mapX++) {
        for (let mapY = firstY - 1; mapY <= lastY + 1; mapY++) {
            const result = await quietly(() =>
                loader.load(state, {
                    mapX,
                    mapY,
                    minLevel: plane,
                    maxLevel: plane,
                    loadObjs: false,
                    loadNpcs: false,
                    smoothTerrain: false,
                    minimizeDrawCalls: false,
                    loadedTextureIds: new Set<number>(),
                }),
            );
            clearWorkerStateCaches(state);
            if (result.data) {
                squares.push(collectTriangles(result.data));
            }
        }
    }

    const sum = (key: keyof SquareTriangles) => squares.reduce((n, s) => n + (s[key] as number), 0);
    const bytes: Record<string, number> = {};
    for (const square of squares) {
        for (const [key, value] of Object.entries(square.bytes)) {
            bytes[key] = (bytes[key] ?? 0) + value;
        }
    }
    const totalBytes = Object.values(bytes).reduce((a, b) => a + b, 0);
    const triangles = sum("triangleCount");

    console.log(`\n== ${map.name} (${squares.length} squares, plane ${plane})`);
    console.log(
        `triangles ${count(triangles)} (${count(sum("uniqueTriangles"))} in buffers), ` +
            `terrain ${percent(sum("terrainTriangles"), triangles)}, ` +
            `alpha ${percent(sum("alphaTriangles"), triangles)}, ` +
            `draw ranges ${count(sum("drawRanges"))}, instanced ${count(sum("instancedDraws"))}`,
    );
    console.log(
        `  worst square ${count(Math.max(...squares.map((s) => s.triangleCount)))} triangles, ` +
            `${count(Math.max(...squares.map((s) => s.drawRanges)))} draw ranges`,
    );
    console.log(
        `hidden: down <25deg ${percent(sum("downward"), triangles)}, ` +
            `down <30deg ${percent(sum("downward30"), triangles)}, ` +
            `under terrain ${percent(sum("underTerrain"), triangles)}`,
    );
    console.log(
        `bytes ${mb(totalBytes)}: ` +
            Object.entries(bytes)
                .map(([key, value]) => `${key} ${mb(value)}`)
                .join(", "),
    );

    const spots = [
        { name: "spawn", x: map.spawn.x, z: map.spawn.y },
        { name: "middle", x: baseX + sizeX / 2 + 0.5, z: baseY + sizeY / 2 + 0.5 },
        { name: "seam", x: (firstX + 1) * 64 + 0.5, z: (firstY + 1) * 64 + 0.5 },
    ];
    for (const spot of spots) {
        for (const zoom of ZOOMS) {
            const frustum = makeFrustum(spot.x, spot.z, zoom);
            const parts = CHUNK_SIZES.map((size) => {
                const r = drawnWithChunks(squares, frustum, 0, size);
                return `${size}: ${count(r.triangles)} (${r.chunks})`;
            });
            console.log(`${spot.name} zoom ${zoom}: ${parts.join("  ")}`);
        }
    }
}

async function reportBake(state: ReturnType<typeof createWorkerState>): Promise<void> {
    const loader = new ActorBakeLoader();
    const rows: { key: string; bytes: number; kind: string }[] = [];
    for (const request of GameAssets.getBaseRequests()) {
        const result = await loader.load(state, {
            requests: [request],
            loadedTextureIds: new Set<number>(),
        });
        clearWorkerStateCaches(state);
        rows.push({
            key: request.key,
            kind: request.kind,
            bytes: result.data.vertices.byteLength + result.data.indices.byteLength,
        });
    }
    rows.sort((a, b) => b.bytes - a.bytes);
    const total = rows.reduce((n, r) => n + r.bytes, 0);
    console.log(`\nbase bake: ${rows.length} requests, ${mb(total)}`);
    const kinds = new Map<string, number>();
    for (const row of rows) {
        kinds.set(row.kind, (kinds.get(row.kind) ?? 0) + row.bytes);
    }
    console.log([...kinds].map(([kind, bytes]) => `${kind} ${mb(bytes)}`).join(", "));
    for (const row of rows.slice(0, 15)) {
        console.log(`  ${mb(row.bytes).padStart(10)}  ${row.key}`);
    }
}

async function main(): Promise<void> {
    const args = process.argv.slice(2);
    const infos = loadCacheInfos();
    const info = infos.find((c) => c.name.startsWith("osrs-241"));
    if (!info) {
        throw new Error("No game cache in caches/");
    }
    const state = createWorkerState(loadCache(info), [], [], undefined as unknown as Cache);
    if (args.includes("--bake")) {
        await reportBake(state);
    }
    for (const mapId of args.filter((a) => !a.startsWith("--"))) {
        await reportMap(mapId, state);
    }
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
