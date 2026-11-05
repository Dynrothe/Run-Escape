import type { Scene } from "../../rs/scene/Scene";
import type { SceneBuilder } from "../../rs/scene/SceneBuilder";
import { getIdFromTag } from "../../rs/scene/entity/EntityTag";
import type { LocEntity } from "../../rs/scene/entity/LocEntity";
import { isStamped } from "./Ground";
import { MAP_SQUARE_SIZE, TileGrid } from "./format";

// Flat faces of two locs in one plane, which the renderer can't tell apart: they z-fight, and
// the floor flickers as the camera moves. The Owl's Court had two (Justiciar Zachariah, PR #104):
// the cap on its hanging wall (38924) at the floor's height, and a wizard statue's plate (38417)
// lying on the floor tile under it. The renderer's depth bias by priority (main.vert.glsl: 0.0007
// of a tile a step) didn't keep them apart, whatever their priorities, so any two up-facing faces
// at the same height that overlap count. A loc lifted 2 to 4 units (LocOverrides.ts `height`) is
// clear of the floor; a cap a level down is hidden by its edge.
//
// Only what the camera can see: up-facing, horizontal, drawn faces. Coplanar faces on slopes
// aren't flat, so this is for flat ground, which is where arenas are.

// What's read of a model: Model and ModelData both have it
export type FaceModel = {
    faceCount: number;
    verticesX: ArrayLike<number>;
    verticesY: ArrayLike<number>;
    verticesZ: ArrayLike<number>;
    contourVerticesY?: ArrayLike<number>;
    indices1: ArrayLike<number>;
    indices2: ArrayLike<number>;
    indices3: ArrayLike<number>;
    // -2 is a face that isn't drawn (Model's)
    faceColors3?: ArrayLike<number>;
};

// A model as it's drawn: where it stands in scene units (128 a tile, x east, z north) and at what
// height (down is positive, as the cache has it), and what it is
export type DrawnModel = {
    // The loc it's part of: faces of one loc never count against each other
    piece: number;
    // "38924 wall", for the report
    label: string;
    level: number;
    x: number;
    z: number;
    height: number;
    model: FaceModel;
    // Cut from a real place as built (Ground's isStamped): the real world has it so
    stamped?: boolean;
};

const TILE = 128;
// Triangles that overlap by less than this, in scene units, only touch
const TOUCH = 1;

type Flat = {
    piece: number;
    y: number;
    // The triangle, x then z, three times
    points: number[];
    x0: number;
    z0: number;
    x1: number;
    z1: number;
};

// The flat faces looking up, in scene units
function getFlatFaces(drawn: DrawnModel): Flat[] {
    const { model } = drawn;
    const ys = model.contourVerticesY ?? model.verticesY;
    const flats: Flat[] = [];
    for (let f = 0; f < model.faceCount; f++) {
        if (model.faceColors3 && model.faceColors3[f] === -2) {
            continue;
        }
        const a = model.indices1[f];
        const b = model.indices2[f];
        const c = model.indices3[f];
        if (ys[a] !== ys[b] || ys[a] !== ys[c]) {
            continue;
        }
        const points = [a, b, c].flatMap((v) => [
            drawn.x + model.verticesX[v],
            drawn.z + model.verticesZ[v],
        ]);
        const [ax, az, bx, bz, cx, cz] = points;
        // Looking up, as the cache winds a floor tile; a face looking down is the underside
        const cross = (bx - ax) * (cz - az) - (cx - ax) * (bz - az);
        if (cross <= 0) {
            continue;
        }
        flats.push({
            piece: drawn.piece,
            y: drawn.height + ys[a],
            points,
            x0: Math.min(ax, bx, cx),
            z0: Math.min(az, bz, cz),
            x1: Math.max(ax, bx, cx),
            z1: Math.max(az, bz, cz),
        });
    }
    return flats;
}

// Whether two triangles overlap by more than touching: separated on no axis of either's edges
function overlaps(a: number[], b: number[]): boolean {
    for (const tri of [a, b]) {
        for (let i = 0; i < 3; i++) {
            const j = (i + 1) % 3;
            const nx = tri[j * 2 + 1] - tri[i * 2 + 1];
            const nz = tri[i * 2] - tri[j * 2];
            const length = Math.hypot(nx, nz);
            if (length === 0) {
                continue;
            }
            let minA = Infinity;
            let maxA = -Infinity;
            let minB = Infinity;
            let maxB = -Infinity;
            for (let k = 0; k < 3; k++) {
                const pa = (a[k * 2] * nx + a[k * 2 + 1] * nz) / length;
                const pb = (b[k * 2] * nx + b[k * 2 + 1] * nz) / length;
                minA = Math.min(minA, pa);
                maxA = Math.max(maxA, pa);
                minB = Math.min(minB, pb);
                maxB = Math.max(maxB, pb);
            }
            if (Math.min(maxA, maxB) - Math.max(minA, minB) < TOUCH) {
                return false;
            }
        }
    }
    return true;
}

// Two kinds of loc with faces in one plane, and the tiles where they meet (tile x, tile y and
// level, each once)
export type Coplanar = {
    a: string;
    b: string;
    tiles: { x: number; y: number; level: number }[];
    // Both cut from a real place as built
    stamped: boolean;
};

export function findCoplanar(models: Iterable<DrawnModel>): Coplanar[] {
    // Flat faces by every tile they cover, and what each piece is
    const byTile = new Map<string, Flat[]>();
    const pieces = new Map<number, DrawnModel>();
    for (const drawn of models) {
        pieces.set(drawn.piece, drawn);
        for (const flat of getFlatFaces(drawn)) {
            for (let tx = Math.floor(flat.x0 / TILE); tx < Math.ceil(flat.x1 / TILE); tx++) {
                for (let tz = Math.floor(flat.z0 / TILE); tz < Math.ceil(flat.z1 / TILE); tz++) {
                    const key = `${drawn.level},${tx},${tz}`;
                    const list = byTile.get(key);
                    if (list) {
                        list.push(flat);
                    } else {
                        byTile.set(key, [flat]);
                    }
                }
            }
        }
    }
    const found = new Map<string, Coplanar & { seen: Set<string> }>();
    for (const [key, flats] of byTile) {
        const [level, tileX, tileZ] = key.split(",").map(Number);
        for (let i = 0; i < flats.length; i++) {
            for (let j = i + 1; j < flats.length; j++) {
                const a = flats[i];
                const b = flats[j];
                // Where both lie, which must be on this tile, so a pair is counted where it meets
                const x0 = Math.max(a.x0, b.x0, tileX * TILE);
                const z0 = Math.max(a.z0, b.z0, tileZ * TILE);
                const x1 = Math.min(a.x1, b.x1, (tileX + 1) * TILE);
                const z1 = Math.min(a.z1, b.z1, (tileZ + 1) * TILE);
                if (
                    a.piece === b.piece ||
                    a.y !== b.y ||
                    x1 - x0 < TOUCH ||
                    z1 - z0 < TOUCH ||
                    !overlaps(a.points, b.points)
                ) {
                    continue;
                }
                const pieceA = pieces.get(a.piece)!;
                const pieceB = pieces.get(b.piece)!;
                const [first, second] = [pieceA.label, pieceB.label].sort();
                const pair = `${first} + ${second}`;
                let entry = found.get(pair);
                if (!entry) {
                    entry = { a: first, b: second, tiles: [], stamped: true, seen: new Set() };
                    found.set(pair, entry);
                }
                entry.stamped &&= !!pieceA.stamped && !!pieceB.stamped;
                if (!entry.seen.has(key)) {
                    entry.seen.add(key);
                    entry.tiles.push({ x: tileX, y: tileZ, level });
                }
            }
        }
    }
    return [...found.values()]
        .map(({ seen: _, ...entry }) => entry)
        .sort((a, b) => b.tiles.length - a.tiles.length || a.a.localeCompare(b.a));
}

// Lines for a check: each pair, how many tiles and the first few
export function describeCoplanar(found: Coplanar[]): string[] {
    return found.map(({ a, b, tiles, stamped }) => {
        const at = tiles
            .slice(0, 3)
            .map(({ x, y }) => `${x},${y}`)
            .join(" ");
        return (
            `${a} and ${b} have faces in one plane, which z-fight, on ${tiles.length} ` +
            `tile${tiles.length === 1 ? "" : "s"} (${at})${stamped ? ", as cut from the real place" : ""}`
        );
    });
}

const SLOTS: Record<number, string> = { 22: "floor decoration" };
const label = (id: number, type: number) =>
    `${id} ${SLOTS[type] ?? (type <= 3 || type === 9 ? "wall" : type <= 8 ? "wall decoration" : "loc")}`;

// Everything a built scene draws, as DrawnModels: floor decoration, walls, wall decoration and
// locs, level by level. An animated loc is its still model, from model. Scene tiles are a map's
// grid tiles when it's built from the grid's corner. stamped says which (tile x, tile y, loc id,
// type) came from a real place as built.
export function getSceneModels(
    scene: Scene,
    model: (entity: LocEntity) => FaceModel | undefined,
    stamped?: (x: number, y: number, id: number, type: number) => boolean,
): DrawnModel[] {
    const drawn: DrawnModel[] = [];
    let piece = 0;
    const add = (
        entity: unknown,
        tag: bigint,
        flags: number,
        level: number,
        tileX: number,
        tileY: number,
        x: number,
        z: number,
        height: number,
    ) => {
        const shape =
            entity && (entity as FaceModel).verticesX
                ? (entity as FaceModel)
                : entity && (entity as LocEntity).seqId !== undefined
                  ? model(entity as LocEntity)
                  : undefined;
        if (!shape) {
            return;
        }
        const id = getIdFromTag(tag);
        const type = flags & 0x3f;
        drawn.push({
            piece,
            label: label(id, type),
            level,
            x,
            z,
            height,
            model: shape,
            stamped: stamped?.(tileX, tileY, id, type),
        });
    };
    for (let level = 0; level < scene.levels; level++) {
        for (let x = 0; x < scene.sizeX; x++) {
            for (let y = 0; y < scene.sizeY; y++) {
                const tile = scene.tiles[level][x][y];
                if (!tile) {
                    continue;
                }
                const { floorDecoration: floor, wall, wallDecoration: deco } = tile;
                if (floor) {
                    piece++;
                    add(
                        floor.entity,
                        floor.tag,
                        floor.flags,
                        level,
                        x,
                        y,
                        floor.x,
                        floor.y,
                        floor.height,
                    );
                }
                if (wall) {
                    piece++;
                    for (const entity of [wall.entity0, wall.entity1]) {
                        add(entity, wall.tag, wall.flags, level, x, y, wall.x, wall.y, wall.height);
                    }
                }
                if (deco) {
                    piece++;
                    const { tag, flags, height } = deco;
                    add(
                        deco.entity0,
                        tag,
                        flags,
                        level,
                        x,
                        y,
                        deco.x + deco.offsetX,
                        deco.y + deco.offsetY,
                        height,
                    );
                    add(deco.entity1, tag, flags, level, x, y, deco.x, deco.y, height);
                }
                for (const loc of tile.locs) {
                    if (loc.startX !== x || loc.startY !== y) {
                        continue;
                    }
                    piece++;
                    add(loc.entity, loc.tag, loc.flags, level, x, y, loc.x, loc.y, loc.height);
                }
            }
        }
    }
    return drawn;
}

// A built map's pairs, with its squares already in the scene builder's map files (as check-maps
// and check-coplanar.ts put them): its scene from the grid's corner, locs from a stamp as cut
export function findMapCoplanar(
    sceneBuilder: SceneBuilder,
    at: { mapX: number; mapY: number },
    grid: TileGrid,
): { models: number; found: Coplanar[] } {
    const { locTypeLoader, locModelLoader } = sceneBuilder;
    const stamped = new Set(
        grid.locs.filter(isStamped).map((loc) => `${loc.x},${loc.y},${loc.id},${loc.type}`),
    );
    const scene = sceneBuilder.buildScene(
        at.mapX * MAP_SQUARE_SIZE,
        at.mapY * MAP_SQUARE_SIZE,
        grid.sizeX,
        grid.sizeY,
    );
    const models = getSceneModels(
        scene,
        (entity) =>
            locModelLoader.getModel(locTypeLoader.load(entity.id), entity.type, entity.rotation),
        (x, y, id, type) => stamped.has(`${x},${y},${id},${type}`),
    );
    return { models: models.length, found: findCoplanar(models) };
}
