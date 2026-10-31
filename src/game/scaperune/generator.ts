import { Ground } from "./Ground";
import { BIOMES, BiomeDef, WATERFALL } from "./biomes";
import type { Exit } from "./building";
import { TileRect, blockTile, findReachable, findStranded, getCollisionFlags } from "./collision";
import { MAP_SQUARE_SIZE, TILE_BLOCKED, TILE_BRIDGE, TileGrid } from "./format";
import {
    LandformBounds,
    Relief,
    createRelief,
    getHillBoundaryRise,
    shapeCliffs,
} from "./landforms";
import { Noise, Rng, createNoise, createRng, distanceTo, smoothField } from "./noise";
import { PathFinder, Point, addPathToField, smoothPath } from "./paths";
import { rotatePrefab } from "./prefab";
import {
    BRIDGE,
    BRIDGE_BANK_HEIGHT,
    BRIDGE_BED_HEIGHT,
    BRIDGE_DECK_EAST,
    BRIDGE_DECK_ROW,
    BRIDGE_DECK_WEST,
    PREFABS,
    PrefabKit,
    isBuildingKind,
    loadPrefab,
} from "./prefabs";
import { BuildContext, MapRecipe } from "./recipe";
import { Plot, RoadLine, gradeRoads } from "./roadGrades";
import { DEFAULT_SETTINGS, GeneratorSettings, getSettingsError } from "./settings";
import { Terrain, getTileSlope, limitNorthFaces, limitSlope, spreadNearest } from "./terrain";

export * from "./settings";

// Makes a whole map from a seed and settings. The same seed and settings give
// the same map, anywhere: everything random comes from the seed. It only uses
// what's in BIOMES, PREFABS and BRIDGE (palette.ts), so the slim cache can hold
// all that any seed could ask for. See CLAUDE.md.

// One square of scenery round the arena
const MARGIN = 1;
// The width of a river at a bridge, and a half width of 1 to 1.3 on a line of tile
// corners fills exactly the 2 rows beside it, the gap in a bridge's fences
const BRIDGE_RIVER_HALF_WIDTH = 4.5;
const BRIDGE_ROAD_HALF_WIDTH = 1.2;
// Tiles along a road from a bridge's width to its own
const ROAD_WIDEN = 6;
// How far past a road's edge its soft underlay runs. The renderer blends underlays over
// 11 tiles, so that's a stain that takes the contrast out of the overlay's edge.
const TRAIL_MARGIN = 0.8;
// Tiles past a road's edge that scatter keeps off
const ROAD_CLEAR_MARGIN = 0.3;
// Tiles a road that leads nowhere takes to narrow away
const ROAD_TAPER = 7;
// The tightest a road can turn after a straight stretch, in tiles
const ROAD_TURN_RADIUS = 8;
export const FORD_HALF_WIDTH = 2;
// How far a road runs dead straight off the end of a bridge's stamp, down the middle
// of the gap between its fences and on, before it can curve
const BRIDGE_ROAD_STRAIGHT = 6;
// Rows kept clear either side of a bridge's road
const BRIDGE_ROAD_CLEAR = 4;
// Crossings are at most this far apart, so that wherever you are one's inside
// the flow field's window (48 tiles each way)
const CROSSING_SPACING = 60;
// Tiles round the spawn kept clear of water and scenery
const SPAWN_CLEAR = 7;
// The spawn stays this far in from the arena's edge
const SPAWN_INSET = 14;
// A stranded piece of ground this big gets a ford. Smaller ones get blocked.
const MIN_STRANDED_PIECE = 150;
const MAX_FORDS = 16;
// Fewer reachable tiles than this isn't a map you can play
const MIN_PLAYABLE_TILES = 300;
const SEA_BED = 6;
// The lowest fresh water can be
const RIVER_BED = 8;
// How far under the ground round it water lies
const WATER_DROP = 18;
// Tiles a shore takes to come down to the water, at the least. Tall ground takes longer.
const MIN_BANK = 6;
const MAX_BANK = 24;
// How steep the sides of a river's valley are, from a gorge to a wide valley
const GORGE_SLOPE = 34;
const VALLEY_SLOPE = 7;
// Tiles either side of a crossing where a river runs level
const LEVEL_AT_CROSSING = 13;
// How far a river has to fall for it to come down as a waterfall, and tiles it keeps clear
// of a crossing
const WATERFALL_DROP = 16;
const WATERFALL_RUN = 6;
const WATERFALL_SPACING = 30;
const WATERFALL_WIDTH = 3;
// How much of the land's height a river's course minds, against a straight line
const VALLEY_SEEK = 1;
// The steepest a road climbs, in height units a tile, and what going over that costs
const ROAD_GRADE = 5;
const ROAD_CLIMB_COST = 6;
// How steep a road can go at a pinch, to meet something, as a share of what's walkable
const ROAD_STEEPEST = 0.75;
// What a tile of cliff costs a road, for the cutting
const ROAD_CLIFF_COST = 14;
// Tiles either side of a road that are level with it, past its own half width
const ROAD_SHOULDER = 1.2;
// Passes to even out the ground pinned to roads
const ROAD_SMOOTHING = 2;
// How steep the sides of cuttings and embankments are, in height units a tile: a share of
// what's walkable, so that you can walk up out of a road
const SETTLE_SLOPE = 0.8;
// A pass climbs a little steeper than a road, as a share of what's walkable
const PASS_GRADE = 0.6;
const PASS_CLIFF_COST = 5;
// Pieces of ground this big that cliffs cut off get a pass. Smaller ones stay out of reach.
const MIN_PASS_PIECE = 300;
// Tiles a pass runs on past the cliffs at each end
const PASS_RUN_OUT = 7;
const PASSES_A_SQUARE = 4;
// Points along a main road between places it's routed to, over rough ground, and how far
// they can move to find ground to stand on
const MAIN_ROAD_STEP = 24;
const MAIN_ROAD_SNAP = 8;
// How steep a cliff can drop away to the north, in height units a tile. The camera looks
// north from high up, at 70 degrees, which is 45 units a tile: anything steeper hides
// the ground at its foot. This leaves a margin for the top of the screen.
const NORTH_FACE_SLOPE = 30;
// Snow starts this high, with the setting at its least and its most
const SNOW_LINE_HIGH = 235;
const SNOW_LINE_LOW = 110;
// How much steeper than walkable a tile is before it gets a rock face
const FACE_SLOPE = 2;
const CAVES_A_SQUARE = 1.5;
const CAVE_WIDTH = 3;
const CAVE_DEPTH = 2;
// How much higher the ground has to rise behind a cave for there to be a cliff to go in
const CAVE_CLIFF = 24;
// The most the ground can rise over a building's plot for it to go there
const MAX_PLOT_RISE = 18;
// Tiles round a building's walls that are flat with it
const PLOT_MARGIN = 1;
// Tiles out of a door that are level with it
const DOOR_STEP = 3;
// A door step gives way to another building's plot
const DOOR_STEP_PIN = 0.005;
// Tiles between a building and anything else, and between it and water
const BUILDING_CLEAR = 3;
const WATER_CLEAR = 6;
// Spots tried for a town, and how it's judged: points round it, and how far they can be
// off its height
const TOWN_TRIES = 12;
const TOWN_SAMPLES = 8;
const TOWN_RISE = 24;
// A fenced yard stands this far off a building's walls
const YARD_GAP = 2;
const FENCE = 980;
// Chances a tile of mountain gets a heap of rubble and a stone, with the setting at 1
const RUBBLE_CHANCE = 0.006;
const STONE_CHANCE = 0.12;

const LOC_WALL = 0;
const LOC_NORMAL = 10;
const LOC_FLOOR_DECORATION = 22;

// Rotation is the side of the tile a wall stands on
const WALL_WEST = 0;
const WALL_NORTH = 1;
const WALL_EAST = 2;
const WALL_SOUTH = 3;

// What's kept while a map is built
type Build = {
    settings: GeneratorSettings;
    context: BuildContext;
    ground: Ground;
    rng: Rng;
    finder: PathFinder;
    kit: PrefabKit;
    sizeX: number;
    sizeY: number;
    corners: { x: number; y: number };
    spawn: Point;
    arena: TileRect;
    biomeAt(x: number, y: number): BiomeDef;
    // Tiles in from the arena's edge, negative outside
    toEdge(x: number, y: number): number;
    // The land's shape, and its heights as they're being worked on
    relief: Relief;
    terrain: Terrain;
    // Tiles of cliff, and of water, whose corners stay where they are
    cliffs: Uint8Array;
    heldCorners: Uint8Array;
    // Ground you can get to from the spawn, as far as cliffs go: anything else stays empty
    mainland: Uint8Array;
    // Tiles' heights, for how steep a step is
    tileHeights: Float32Array;
    // Buildings' plots, for roads to keep to
    plots: Plot[];
};

// The water as painted: repainted when a ford cuts through it
type WaterPaint = { field: Float32Array; tiles: Uint8Array };

type River = {
    // Runs north to south, or west to east
    vertical: boolean;
    // Its column or row at the crossings
    line: number;
    crossings: number[];
    wiggle: Noise;
    amount: number;
    halfWidth: number;
    // Its column or row along its length, where the land gives it a valley to run in
    valley?: Float32Array;
    // How high the water is along its length
    levels: Float32Array;
    // Where it falls, for waterfalls
    drops: { along: number; level: number }[];
};

// A lake or pond: where it is, and how high its water stands
type Pool = { x: number; y: number; radius: number; level: number };

export type { RoadLine };

// A building: its way out, if it has one, and whether a road ends there
export type PlacedBuilding = {
    name: string;
    x: number;
    y: number;
    sizeX: number;
    sizeY: number;
    exit?: Exit;
    hasRoad: boolean;
};

// A map, and what check-maps.ts needs to hold it to the rules
export type GeneratedMap = {
    grid: TileGrid;
    // Tiles of buildings, walls included
    footprint: Uint8Array;
    roadTiles: Uint8Array;
    lines: RoadLine[];
    buildings: PlacedBuilding[];
    // Passes cut through cliffs
    passes: RoadLine[];
    walkSlope: number;
    caves: Point[];
    waterfalls: Point[];
};

export function getGeneratedSize(settings: Pick<GeneratorSettings, "squaresX" | "squaresY">): {
    sizeX: number;
    sizeY: number;
} {
    return {
        sizeX: (settings.squaresX + MARGIN * 2) * MAP_SQUARE_SIZE,
        sizeY: (settings.squaresY + MARGIN * 2) * MAP_SQUARE_SIZE,
    };
}

export function getGeneratedArena(
    settings: Pick<GeneratorSettings, "squaresX" | "squaresY">,
): TileRect {
    const { sizeX, sizeY } = getGeneratedSize(settings);
    const min = MARGIN * MAP_SQUARE_SIZE;
    return { x0: min, y0: min, x1: sizeX - min - 1, y1: sizeY - min - 1 };
}

// Where the player starts: always kept open, and known without building
export function getGeneratedSpawn(
    settings: Pick<GeneratorSettings, "squaresX" | "squaresY" | "spawnX" | "spawnY">,
): Point {
    const arena = getGeneratedArena(settings);
    const place = (min: number, max: number, at: number) => {
        const inset = Math.min(SPAWN_INSET, (max - min) >> 1);
        return Math.round(min + inset + (max - min - inset * 2) * at);
    };
    return {
        x: place(arena.x0, arena.x1, settings.spawnX),
        y: place(arena.y0, arena.y1, settings.spawnY),
    };
}

function pick<T>(rng: Rng, list: T[]): T {
    return list[Math.floor(rng() * list.length)];
}

// One of a list that runs smallest to biggest: the first at 0, the last at 1, and any
// of them in between
function pickBySize<T>(rng: Rng, list: T[], size: number): T {
    if (size < 0.2) {
        return list[0];
    }
    return size > 0.8 ? list[list.length - 1] : pick(rng, list);
}

function smoothstep(t: number): number {
    const clamped = Math.min(Math.max(t, 0), 1);
    return clamped * clamped * (3 - 2 * clamped);
}

function lerp(a: number, b: number, t: number): number {
    return a + (b - a) * t;
}

function riverStraightness(river: River, along: number): number {
    let away = Infinity;
    for (const crossing of river.crossings) {
        away = Math.min(away, Math.abs(along - crossing));
    }
    return Math.min(Math.max(away - 10, 0) / 12, 1);
}

// The line a river would follow if it didn't wander
function riverLine(river: River, along: number): number {
    const { valley, line } = river;
    if (!valley) {
        return line;
    }
    return valley[Math.min(Math.max(Math.round(along), 0), valley.length - 1)];
}

function getNearestCrossing(river: River, along: number): number {
    let best = along;
    let bestDistance = Infinity;
    for (const crossing of river.crossings) {
        const distance = Math.abs(along - crossing);
        if (distance < bestDistance) {
            best = crossing;
            bestDistance = distance;
        }
    }
    return best;
}

function riverCentre(river: River, along: number): number {
    const straight = riverStraightness(river, along);
    const line = lerp(
        riverLine(river, getNearestCrossing(river, along)),
        riverLine(river, along),
        straight,
    );
    return line + (river.wiggle(along / 30, 3.5) - 0.5) * 2 * river.amount * straight;
}

// Rivers narrow to a bridge's span where one can cross them
function riverHalfWidth(river: River, along: number): number {
    return lerp(BRIDGE_RIVER_HALF_WIDTH, river.halfWidth, riverStraightness(river, along));
}

// How far in from the arena's edge the sea comes
function getCoastDepth(build: Build): number {
    const { settings, arena } = build;
    if (settings.boundary !== "sea") {
        return 0;
    }
    const half = Math.min(arena.x1 - arena.x0, arena.y1 - arena.y0) / 2;
    return 3 + settings.island * half * 0.5;
}

function createRivers(build: Build): River[] {
    const { settings, arena, rng } = build;
    const coast = getCoastDepth(build);
    const rivers: River[] = [];
    const firstVertical = rng() < 0.5;
    for (let i = 0; i < settings.rivers; i++) {
        const vertical = i % 2 === 0 ? firstVertical : !firstVertical;
        const [alongMin, alongMax, acrossMin, acrossMax] = vertical
            ? [arena.y0, arena.y1, arena.x0, arena.x1]
            : [arena.x0, arena.x1, arena.y0, arena.y1];
        // Across the land, not out in the sea
        const half = (alongMax - alongMin) / 2 - coast;
        const middle = (alongMin + alongMax) / 2;
        const count = Math.max(Math.round((half * 2) / CROSSING_SPACING), 1);
        const crossings: number[] = [];
        for (let c = 0; c < count; c++) {
            const at = middle - half + ((c + 0.5) / count) * half * 2;
            crossings.push(Math.round(at + (rng() - 0.5) * 10));
        }
        const side = rng() < 0.5 ? -1 : 1;
        const acrossHalf = (acrossMax - acrossMin) / 2 - coast;
        rivers.push({
            vertical,
            line: Math.round(
                (acrossMin + acrossMax) / 2 + side * Math.max(acrossHalf * (0.3 + rng() * 0.4), 13),
            ),
            crossings,
            wiggle: createNoise(settings.seed + 100 + i, 1),
            amount: Math.max(half * 0.2, 10),
            halfWidth: settings.riverWidth / 2,
            levels: new Float32Array((vertical ? build.corners.y : build.corners.x) + 1),
            drops: [],
        });
        const river = rivers[rivers.length - 1];
        if (hasRelief(settings)) {
            river.valley = findValley(build, river);
            river.amount *= 0.3;
        }
    }
    return rivers;
}

// Whether there's more to the land than hills
function hasRelief(settings: GeneratorSettings): boolean {
    return (
        settings.mountains > 0 ||
        settings.boundary === "mountains" ||
        settings.plateaus > 0 ||
        settings.mesas > 0 ||
        settings.canyons > 0 ||
        settings.volcanoes > 0
    );
}

// The low ground along a river: for each step along, the column that climbs least, each
// a column at most from the last (seam carving). It keeps to its side of the arena, so that
// two rivers don't end up in one valley.
function findValley(build: Build, river: River): Float32Array {
    const { arena, corners, terrain, settings } = build;
    const [alongCount, acrossCount] = river.vertical
        ? [corners.y, corners.x]
        : [corners.x, corners.y];
    const [low, high] = river.vertical ? [arena.x0, arena.x1] : [arena.y0, arena.y1];
    const width = high - low + 1;
    const span = Math.max(width * 0.3, 16);
    const heightAt = (along: number, across: number) =>
        terrain.height[river.vertical ? across + along * corners.x : along + across * corners.x];
    const totals = new Float32Array(alongCount * width);
    const from = new Int8Array(alongCount * width);
    for (let along = 0; along < alongCount; along++) {
        for (let at = 0; at < width; at++) {
            const across = low + at;
            const offset = Math.abs(across - river.line);
            const cost =
                (heightAt(along, across) * VALLEY_SEEK) / 16 + Math.max(offset - span, 0) * 2;
            let best = 0;
            let way = 0;
            if (along > 0) {
                best = Infinity;
                for (let step = -1; step <= 1; step++) {
                    const next = at + step;
                    if (next >= 0 && next < width) {
                        const total = totals[next + (along - 1) * width];
                        if (total < best) {
                            best = total;
                            way = step;
                        }
                    }
                }
            }
            totals[at + along * width] = best + cost;
            from[at + along * width] = way;
        }
    }
    let end = 0;
    for (let at = 1; at < width; at++) {
        if (totals[at + (alongCount - 1) * width] < totals[end + (alongCount - 1) * width]) {
            end = at;
        }
    }
    const valley = new Float32Array(alongCount);
    for (let along = alongCount - 1, at = end; along >= 0; along--) {
        valley[along] = low + at;
        at += from[at + along * width];
    }
    // Smooth it out, with a wider reach the more it can wander
    const reach = Math.max(Math.round(settings.ridgeScale / 4), 6);
    return smoothLine(valley, reach);
}

function smoothLine(line: Float32Array, reach: number): Float32Array {
    const out = new Float32Array(line.length);
    for (let i = 0; i < line.length; i++) {
        const span = Math.min(reach, i, line.length - 1 - i);
        let sum = 0;
        for (let j = i - span; j <= i + span; j++) {
            sum += line[j];
        }
        out[i] = sum / (span * 2 + 1);
    }
    return out;
}

// The arena's edge with its corners rounded off: tiles in from it, negative outside
function toRoundedEdge(build: Build, x: number, y: number): number {
    const { arena } = build;
    const halfX = (arena.x1 + 1 - arena.x0) / 2;
    const halfY = (arena.y1 + 1 - arena.y0) / 2;
    const radius = Math.min(halfX, halfY) * 0.6;
    const dx = Math.abs(x - (arena.x0 + halfX));
    const dy = Math.abs(y - (arena.y0 + halfY));
    const cornerX = dx - (halfX - radius);
    const cornerY = dy - (halfY - radius);
    if (cornerX > 0 && cornerY > 0) {
        return radius - Math.hypot(cornerX, cornerY);
    }
    return Math.min(halfX - dx, halfY - dy);
}

// Where the water goes, as fields per tile corner: above 0 is water. Fields rather
// than tiles so that its edges can be smooth lines.
function createWaterFields(build: Build, rivers: River[], hills: Noise) {
    const { settings, arena, rng, corners, spawn } = build;
    const pools: Pool[] = [];
    const rough = settings.shoreRoughness;
    const coast = createNoise(settings.seed + 1, rough > 0.7 ? 3 : 2);
    const shape = createNoise(settings.seed + 2, 1);
    const count = corners.x * corners.y;
    const sea = new Float32Array(count).fill(-100);
    const fresh = new Float32Array(count).fill(-100);
    // Low ground flooded, which stands at the lowest level there is
    const flood = new Uint8Array(count);

    if (settings.boundary === "sea") {
        const depth = getCoastDepth(build);
        const span = lerp(40, 14, rough);
        const amount = 4 + rough * 30;
        for (let y = 0; y < corners.y; y++) {
            for (let x = 0; x < corners.x; x++) {
                const wobble = (coast(x / span, y / span) - 0.5) * amount;
                sea[x + y * corners.x] = depth - toRoundedEdge(build, x, y) - wobble;
            }
        }
    }

    // Low ground floods
    if (settings.waterLevel > 0) {
        const line = 0.28 + settings.waterLevel * 0.42;
        for (let y = 0; y < corners.y; y++) {
            for (let x = 0; x < corners.x; x++) {
                const low = line - hills(x / settings.hillScale, y / settings.hillScale);
                fresh[x + y * corners.x] = low * 80;
                flood[x + y * corners.x] = low > -0.1 ? 1 : 0;
            }
        }
    }

    for (const river of rivers) {
        const [alongCount, acrossCount] = river.vertical
            ? [corners.y, corners.x]
            : [corners.x, corners.y];
        for (let along = 0; along < alongCount; along++) {
            const centre = riverCentre(river, along);
            const half = riverHalfWidth(river, along);
            const reach = half + 8;
            const first = Math.max(Math.floor(centre - reach), 0);
            const last = Math.min(Math.ceil(centre + reach), acrossCount - 1);
            for (let across = first; across <= last; across++) {
                const i = river.vertical ? across + along * corners.x : along + across * corners.x;
                fresh[i] = Math.max(fresh[i], half - Math.abs(across - centre));
            }
        }
    }

    const addPool = (radius: number) => {
        // Anywhere in the arena, clear of the spawn
        const x = lerp(arena.x0, arena.x1, rng());
        const y = lerp(arena.y0, arena.y1, rng());
        pools.push({ x, y, radius, level: 0 });
        const reach = radius * 1.5 + 8;
        const x0 = Math.max(Math.floor(x - reach), 0);
        const x1 = Math.min(Math.ceil(x + reach), corners.x - 1);
        const y0 = Math.max(Math.floor(y - reach), 0);
        const y1 = Math.min(Math.ceil(y + reach), corners.y - 1);
        for (let cy = y0; cy <= y1; cy++) {
            for (let cx = x0; cx <= x1; cx++) {
                const wobble = (shape(cx / 14, cy / 14) - 0.5) * radius * (0.6 + rough);
                const edge = radius + wobble - Math.hypot(cx - x, cy - y);
                const i = cx + cy * corners.x;
                fresh[i] = Math.max(fresh[i], edge);
            }
        }
    };
    for (let i = 0; i < settings.lakes; i++) {
        addPool(14 + rng() * 14);
    }
    for (let i = 0; i < settings.ponds; i++) {
        addPool(4 + rng() * 6);
    }

    const smooth = (field: Float32Array) => {
        const out = smoothField(field, corners.x, corners.y, 3);
        // Nothing round the spawn
        for (let y = 0; y < corners.y; y++) {
            for (let x = 0; x < corners.x; x++) {
                const away = Math.hypot(x - spawn.x, y - spawn.y) - SPAWN_CLEAR;
                out[x + y * corners.x] = Math.min(out[x + y * corners.x], away);
            }
        }
        return out;
    };
    return { sea: smooth(sea), fresh: smooth(fresh), flood, pools };
}

// The tiles a corner field has anything of
function getTouchedTiles(field: Float32Array, sizeX: number, sizeY: number): Uint8Array {
    const cornersX = sizeX + 1;
    const tiles = new Uint8Array(sizeX * sizeY);
    for (let y = 0; y < sizeY; y++) {
        for (let x = 0; x < sizeX; x++) {
            const at = x + y * cornersX;
            tiles[x + y * sizeX] =
                field[at] > 0 ||
                field[at + 1] > 0 ||
                field[at + cornersX] > 0 ||
                field[at + cornersX + 1] > 0
                    ? 1
                    : 0;
        }
    }
    return tiles;
}

// A corner's distance from a tile field: the least of the tiles round it
function getCornerDistance(build: Build, tiles: Float32Array, x: number, y: number): number {
    const { sizeX, sizeY } = build;
    let distance = Infinity;
    for (const [tx, ty] of [
        [x - 1, y - 1],
        [x, y - 1],
        [x - 1, y],
        [x, y],
    ]) {
        if (tx >= 0 && ty >= 0 && tx < sizeX && ty < sizeY) {
            distance = Math.min(distance, tiles[tx + ty * sizeX]);
        }
    }
    return distance;
}

// Takes the land down to the sea, over a few tiles
function sinkSea(build: Build, toSea: Float32Array): void {
    const { terrain, corners } = build;
    const { height } = terrain;
    for (let y = 0; y < corners.y; y++) {
        for (let x = 0; x < corners.x; x++) {
            const at = terrain.corner(x, y);
            const share = Math.min(getCornerDistance(build, toSea, x, y) / 8, 1);
            height[at] = SEA_BED + (height[at] - SEA_BED) * share;
        }
    }
}

// How high a river's water stands along its length: under the ground, always downhill to
// its lower end, and level at a crossing for a bridge's sake. One with the sea at both ends
// runs down to each from its highest point.
function setRiverLevels(build: Build, river: River): void {
    const { terrain, corners } = build;
    const count = river.vertical ? corners.y : corners.x;
    const { levels } = river;
    const heightAt = (along: number) => {
        const across = riverCentre(river, along);
        return river.vertical ? terrain.getHeight(across, along) : terrain.getHeight(along, across);
    };
    let high = 0;
    for (let along = 0; along < count; along++) {
        levels[along] = Math.max(heightAt(along) - WATER_DROP, RIVER_BED);
        if (levels[along] > levels[high]) {
            high = along;
        }
    }
    const first = levels[0];
    const last = levels[count - 1];
    const fall = (start: number, end: number) => {
        const way = Math.sign(end - start);
        for (let along = start + way; along !== end + way; along += way) {
            levels[along] = Math.min(levels[along], levels[along - way]);
        }
    };
    if (first < RIVER_BED + 2 && last < RIVER_BED + 2) {
        fall(high, 0);
        fall(high, count - 1);
    } else if (first > last) {
        fall(0, count - 1);
    } else {
        fall(count - 1, 0);
    }
    for (const crossing of river.crossings) {
        const level = levels[Math.min(Math.max(crossing, 0), count - 1)];
        for (
            let along = crossing - LEVEL_AT_CROSSING;
            along <= crossing + LEVEL_AT_CROSSING;
            along++
        ) {
            if (along >= 0 && along < count) {
                levels[along] = level;
            }
        }
    }
    levels.set(smoothLine(levels, 3));
    stepRiver(build, river);
}

// Gathers a river's fall into drops, for waterfalls, away from crossings
function stepRiver(build: Build, river: River): void {
    const { settings } = build;
    if (settings.waterfalls <= 0) {
        return;
    }
    const { levels } = river;
    const roll = createRng(settings.seed + 300 + river.line);
    const clear = (along: number) =>
        river.crossings.every(
            (crossing) => Math.abs(along - crossing) > LEVEL_AT_CROSSING + WATERFALL_RUN,
        );
    const way = levels[0] >= levels[levels.length - 1] ? 1 : -1;
    const first = way > 0 ? 0 : levels.length - 1;
    let held = levels[first];
    let last = -Infinity;
    for (let along = first; along >= 0 && along < levels.length; along += way) {
        const drop = held - levels[along];
        const due = Math.abs(along - last) >= WATERFALL_SPACING;
        if (drop >= WATERFALL_DROP && due && clear(along) && roll() < settings.waterfalls) {
            river.drops.push({ along, level: levels[along] });
            held = levels[along];
            last = along;
        } else if (!clear(along)) {
            held = levels[along];
        }
        levels[along] = held;
    }
}

// How high the fresh water stands at each corner, and everywhere else the height of the
// nearest water
function createWaterLevels(
    build: Build,
    rivers: River[],
    pools: Pool[],
    fresh: Float32Array,
    flood: Uint8Array,
): Float32Array {
    const { terrain, corners } = build;
    const levels = new Float32Array(fresh.length).fill(Infinity);
    for (const river of rivers) {
        setRiverLevels(build, river);
        const [alongCount, acrossCount] = river.vertical
            ? [corners.y, corners.x]
            : [corners.x, corners.y];
        for (let along = 0; along < alongCount; along++) {
            const centre = riverCentre(river, along);
            const reach = riverHalfWidth(river, along) + 8;
            const first = Math.max(Math.floor(centre - reach), 0);
            const last = Math.min(Math.ceil(centre + reach), acrossCount - 1);
            for (let across = first; across <= last; across++) {
                const i = river.vertical ? across + along * corners.x : along + across * corners.x;
                levels[i] = Math.min(levels[i], river.levels[along]);
            }
        }
    }
    // A pool's as high as its lowest shore, or as what runs into it
    for (const pool of pools) {
        pool.level = Infinity;
        const reach = pool.radius * 1.5 + 8;
        for (let a = 0; a < 24; a++) {
            const angle = (a / 24) * Math.PI * 2;
            const x = pool.x + Math.cos(angle) * reach;
            const y = pool.y + Math.sin(angle) * reach;
            pool.level = Math.min(pool.level, terrain.getHeight(x, y) - WATER_DROP);
        }
        pool.level = Math.max(pool.level, RIVER_BED);
    }
    const touches = (pool: Pool, other: Pool) =>
        Math.hypot(pool.x - other.x, pool.y - other.y) < (pool.radius + other.radius) * 1.5 + 16;
    for (const pool of pools) {
        for (const other of pools) {
            if (touches(pool, other)) {
                pool.level = Math.min(pool.level, other.level);
            }
        }
    }
    for (const pool of pools) {
        const reach = pool.radius * 1.5 + 8;
        const x0 = Math.max(Math.floor(pool.x - reach), 0);
        const x1 = Math.min(Math.ceil(pool.x + reach), corners.x - 1);
        const y0 = Math.max(Math.floor(pool.y - reach), 0);
        const y1 = Math.min(Math.ceil(pool.y + reach), corners.y - 1);
        for (let cy = y0; cy <= y1; cy++) {
            for (let cx = x0; cx <= x1; cx++) {
                const i = cx + cy * corners.x;
                if (fresh[i] > -8) {
                    levels[i] = Math.min(levels[i], pool.level);
                }
            }
        }
    }
    for (let i = 0; i < levels.length; i++) {
        if (flood[i]) {
            levels[i] = RIVER_BED;
        }
    }
    spreadNearest(levels, corners.x, corners.y);
    return levels;
}

// Takes the land down to the fresh water. Tall ground needs a wider valley to get down in,
// as wide as the setting says.
function sinkFresh(build: Build, toFresh: Float32Array, levels: Float32Array): void {
    const { terrain, corners, settings } = build;
    const { height } = terrain;
    const slope = lerp(GORGE_SLOPE, VALLEY_SLOPE, settings.riverValley);
    for (let y = 0; y < corners.y; y++) {
        for (let x = 0; x < corners.x; x++) {
            const at = terrain.corner(x, y);
            const level = levels[at];
            if (level === Infinity) {
                continue;
            }
            const bank = Math.max((height[at] - level) / slope, MIN_BANK);
            const share = Math.min(getCornerDistance(build, toFresh, x, y) / bank, 1);
            height[at] = level + (height[at] - level) * share;
        }
    }
}

// The corners of water tiles: nothing moves them from here on
function holdWater(build: Build, tiles: Uint8Array): void {
    const { sizeX, sizeY, corners, heldCorners } = build;
    for (let y = 0; y < sizeY; y++) {
        for (let x = 0; x < sizeX; x++) {
            if (tiles[x + y * sizeX]) {
                const at = x + y * corners.x;
                heldCorners[at] = 1;
                heldCorners[at + 1] = 1;
                heldCorners[at + corners.x] = 1;
                heldCorners[at + corners.x + 1] = 1;
            }
        }
    }
}

function refreshTileHeights(build: Build): void {
    const { terrain, sizeX, sizeY, corners, tileHeights } = build;
    const { height } = terrain;
    for (let y = 0; y < sizeY; y++) {
        for (let x = 0; x < sizeX; x++) {
            const at = x + y * corners.x;
            tileHeights[x + y * sizeX] =
                (height[at] +
                    height[at + 1] +
                    height[at + corners.x] +
                    height[at + corners.x + 1]) /
                4;
        }
    }
}

// Brings the ground to its pins, and whatever that's made walkable stops being cliff
function settleTerrain(build: Build): void {
    const { terrain, settings, cliffs, heldCorners, sizeX, sizeY } = build;
    const before = Float32Array.from(terrain.height);
    terrain.settle(settings.walkSlope * SETTLE_SLOPE, heldCorners);
    for (let y = 0; y < sizeY; y++) {
        for (let x = 0; x < sizeX; x++) {
            const i = x + y * sizeX;
            if (
                cliffs[i] &&
                terrain.getSlope(x, y) <= settings.walkSlope &&
                terrain.height[terrain.corner(x, y)] !== before[terrain.corner(x, y)]
            ) {
                cliffs[i] = 0;
            }
        }
    }
    refreshTileHeights(build);
}

// The ground round the spawn is level and walkable, whatever the land's doing there
function pinSpawn(build: Build): void {
    const { terrain, spawn, cliffs, sizeX, settings } = build;
    if (!hasRelief(settings)) {
        return;
    }
    const height = Math.round(terrain.getHeight(spawn.x, spawn.y));
    const reach = SPAWN_CLEAR + 1;
    for (let y = spawn.y - reach; y <= spawn.y + reach; y++) {
        for (let x = spawn.x - reach; x <= spawn.x + reach; x++) {
            if (Math.hypot(x - spawn.x, y - spawn.y) <= reach) {
                terrain.pin(x, y, height, 0);
                cliffs[x + y * sizeX] = 0;
            }
        }
    }
}

// Pieces of open ground, by tile: 0 for cliff and outside the arena
function findGroundPieces(build: Build): {
    labels: Int32Array;
    sizes: number[];
    // A tile of each, and how far it is from the spawn
    starts: number[];
} {
    const { cliffs, arena, sizeX } = build;
    const labels = new Int32Array(cliffs.length);
    const sizes = [0];
    const starts = [0];
    const stack: number[] = [];
    for (let y = arena.y0; y <= arena.y1; y++) {
        for (let x = arena.x0; x <= arena.x1; x++) {
            const start = x + y * sizeX;
            if (labels[start] || cliffs[start]) {
                continue;
            }
            const label = sizes.length;
            let size = 0;
            labels[start] = label;
            stack.push(start);
            while (stack.length > 0) {
                const i = stack.pop()!;
                size++;
                const tx = i % sizeX;
                const ty = (i - tx) / sizeX;
                for (const [nx, ny] of [
                    [tx - 1, ty],
                    [tx + 1, ty],
                    [tx, ty - 1],
                    [tx, ty + 1],
                ]) {
                    if (nx < arena.x0 || ny < arena.y0 || nx > arena.x1 || ny > arena.y1) {
                        continue;
                    }
                    const j = nx + ny * sizeX;
                    if (!labels[j] && !cliffs[j]) {
                        labels[j] = label;
                        stack.push(j);
                    }
                }
            }
            sizes.push(size);
            starts.push(start);
        }
    }
    return { labels, sizes, starts };
}

// What a step costs a road or pass, as a multiple: nothing extra up to its grade, and
// quickly more after that, so it goes round or winds up a slope rather than straight up it
function createClimb(build: Build, grade: number, cost: number) {
    const { tileHeights } = build;
    return (from: number, to: number): number => {
        const over = Math.abs(tileHeights[to] - tileHeights[from]) / grade - 1;
        return over > 0 ? 1 + over * over * cost : 1;
    };
}

// Cuts a pass to each big piece of ground the cliffs have cut off from the spawn: a graded
// way through, that roads can then use
function cutPasses(build: Build): RoadLine[] {
    const { terrain, cliffs, arena, spawn, finder, settings, sizeX } = build;
    const passes: RoadLine[] = [];
    if (!hasRelief(settings)) {
        return passes;
    }
    pinSpawn(build);
    settleTerrain(build);
    const { labels, sizes, starts } = findGroundPieces(build);
    const joined = new Uint8Array(sizes.length);
    joined[labels[spawn.x + spawn.y * sizeX]] = 1;
    const inset = 3;
    const cost = (x: number, y: number) => {
        const inside =
            x >= arena.x0 + inset &&
            y >= arena.y0 + inset &&
            x <= arena.x1 - inset &&
            y <= arena.y1 - inset;
        if (!inside) {
            return Infinity;
        }
        return cliffs[x + y * sizeX] ? PASS_CLIFF_COST : 1;
    };
    refreshTileHeights(build);
    const passGrade = settings.walkSlope * PASS_GRADE;
    const climb = createClimb(build, passGrade, 2);
    // Nearest first, so that each has something near to join
    const toSpawn = (label: number) => {
        const x = starts[label] % sizeX;
        return Math.hypot(x - spawn.x, Math.floor(starts[label] / sizeX) - spawn.y);
    };
    const order = sizes
        .map((size, label) => ({ size, label }))
        .filter(({ size, label }) => label > 0 && size >= MIN_PASS_PIECE)
        .sort((a, b) => toSpawn(a.label) - toSpawn(b.label));
    const maxPasses = settings.squaresX * settings.squaresY * PASSES_A_SQUARE;
    for (const { label } of order) {
        if (joined[label] || passes.length >= maxPasses) {
            continue;
        }
        const start = starts[label];
        const path = finder.find(
            { x: start % sizeX, y: Math.floor(start / sizeX) },
            cost,
            (i) => joined[labels[i]] !== 0,
            climb,
        );
        if (path.length === 0) {
            continue;
        }
        for (const i of path) {
            joined[labels[i]] = 1;
        }
        // Only where it needs cutting, and a little either side, to ease into the ground
        const firstCliff = path.findIndex((i) => cliffs[i]);
        const lastCliff = path.length - 1 - [...path].reverse().findIndex((i) => cliffs[i]);
        const cut = path.slice(
            Math.max(firstCliff - PASS_RUN_OUT, 0),
            lastCliff + PASS_RUN_OUT + 1,
        );
        const raw = cut.map((i) => ({ x: (i % sizeX) + 0.5, y: Math.floor(i / sizeX) + 0.5 }));
        const points = smoothPath(raw, 4, 4);
        passes.push({ points, lead: 0, halfWidth: settings.passWidth / 2, grade: passGrade });
    }
    // Cut now, so that roads find them. They're graded again with the roads at the end.
    gradeRoads(terrain, passes, [], 0, settings.walkSlope * ROAD_STEEPEST);
    settleTerrain(build);
    terrain.clearPins();
    pinSpawn(build);
    const after = findGroundPieces(build).labels;
    const home = after[spawn.x + spawn.y * sizeX];
    for (let i = 0; i < after.length; i++) {
        build.mainland[i] = after[i] === home ? 1 : 0;
    }
    return passes;
}

function paintFloors(build: Build, toSea: Float32Array): void {
    const { settings, ground, sizeX, sizeY, biomeAt, terrain, relief, cliffs } = build;
    const patches = createNoise(settings.seed + 4);
    const edges = createNoise(settings.seed + 10, 2);
    const span = settings.groundPatches;
    const snowLine = getSnowLine(settings);
    for (let y = 0; y < sizeY; y++) {
        for (let x = 0; x < sizeX; x++) {
            const biome = biomeAt(x, y);
            const i = ground.tile(x, y);
            // The noise bunches round the middle, so stretch it
            const patch = Math.min(Math.max((patches(x / span, y / span) - 0.3) / 0.4, 0), 0.999);
            let floor = biome.ground[Math.floor(patch * biome.ground.length)];
            if (getHillBoundaryRise(settings, build, x, y) > 0.08) {
                floor = biome.hillGround;
            }
            const edge = edges(x / 16, y / 16);
            const rocky = relief.mountain[terrain.corner(x, y)] > 0.25 + edge * 0.5 || cliffs[i];
            if (rocky) {
                floor = biome.rock.ground;
            }
            if (terrain.height[terrain.corner(x, y)] + edge * 40 > snowLine) {
                floor = biome.rock.snowGround;
            }
            ground.level0.underlays[i] = toSea[i] < 4 ? biome.shore : floor;
        }
    }
}

// How high snow starts, in height units: past the top of everything with no snow
function getSnowLine(settings: GeneratorSettings): number {
    return settings.snow > 0 ? lerp(SNOW_LINE_HIGH, SNOW_LINE_LOW, settings.snow) : Infinity;
}

// Lava in the craters
function paintLava(build: Build): void {
    const { ground, relief, corners, biomeAt, sizeX, sizeY } = build;
    if (relief.craters.length === 0) {
        return;
    }
    const field = new Float32Array(corners.x * corners.y).fill(-4);
    for (const { x, y, radius } of relief.craters) {
        const reach = Math.ceil(radius) + 4;
        for (let cy = Math.round(y) - reach; cy <= Math.round(y) + reach; cy++) {
            for (let cx = Math.round(x) - reach; cx <= Math.round(x) + reach; cx++) {
                const at = cx + cy * corners.x;
                field[at] = Math.max(field[at], radius - Math.hypot(cx - x, cy - y));
            }
        }
    }
    ground.paintField(field, biomeAt(sizeX >> 1, sizeY >> 1).rock.lava, true);
}

// The rock on everything too steep to walk, and rock faces over the steepest. It's painted
// after the roads, and goes round them.
function paintRock(build: Build, skip: Uint8Array): Uint8Array {
    const { ground, settings, sizeX, sizeY, corners, cliffs, biomeAt, terrain } = build;
    if (!hasRelief(settings)) {
        return new Uint8Array(sizeX * sizeY);
    }
    const { heights, flags } = ground.level0;
    const middle = biomeAt(sizeX >> 1, sizeY >> 1).rock;
    const snowLine = getSnowLine(settings);
    const rock = new Uint8Array(sizeX * sizeY);
    const snowy = new Uint8Array(sizeX * sizeY);
    for (let y = 0; y < sizeY; y++) {
        for (let x = 0; x < sizeX; x++) {
            const i = x + y * sizeX;
            if (!(flags[i] & TILE_BLOCKED) || skip[i]) {
                continue;
            }
            const steep = getTileSlope(heights, corners.x, x, y) > settings.walkSlope;
            if (steep || cliffs[i]) {
                const high = terrain.height[terrain.corner(x, y)] > snowLine;
                (high ? snowy : rock)[i] = 1;
            }
        }
    }
    ground.paintOverlay(rock, middle.overlay, false, skip);

    const roll = createRng(settings.seed + 200);
    const faced = new Uint8Array(sizeX * sizeY);
    for (let y = 1; y < sizeY - 1; y++) {
        for (let x = 1; x < sizeX - 1; x++) {
            const i = x + y * sizeX;
            const slope = getTileSlope(heights, corners.x, x, y);
            faced[i] = (rock[i] || snowy[i]) && slope >= settings.walkSlope + FACE_SLOPE ? 1 : 0;
        }
    }
    for (let y = 1; y < sizeY - 1; y++) {
        for (let x = 1; x < sizeX - 1; x++) {
            const i = x + y * sizeX;
            if (!faced[i] || roll() >= settings.rockFaces) {
                continue;
            }
            const inner = faced[i - 1] && faced[i + 1] && faced[i - sizeX] && faced[i + sizeX];
            const { faces, edgeFaces } = biomeAt(x, y).rock;
            const list = inner ? faces : edgeFaces;
            ground.grid.locs.push({
                id: list[Math.floor(roll() * list.length)],
                type: LOC_NORMAL,
                rotation: Math.floor(roll() * 4),
                level: 0,
                x,
                y,
            });
        }
    }
    return rock;
}

// Foam along the foot of a river's drops
function placeWaterfalls(build: Build, rivers: River[]): void {
    const { ground } = build;
    for (const river of rivers) {
        for (const { along } of river.drops) {
            const centre = riverCentre(river, along);
            const half = riverHalfWidth(river, along);
            for (let at = -half; at + WATERFALL_WIDTH <= half; at += WATERFALL_WIDTH) {
                const across = Math.round(centre + at);
                ground.grid.locs.push({
                    id: WATERFALL,
                    type: LOC_NORMAL,
                    rotation: river.vertical ? 0 : 1,
                    level: 0,
                    x: river.vertical ? across : along,
                    y: river.vertical ? along : across,
                });
            }
        }
    }
}

// Cave mouths, for looks: in the foot of a cliff that faces the camera
function placeCaves(build: Build, rock: Uint8Array): Point[] {
    const { settings, ground, arena, biomeAt, sizeX, corners } = build;
    const caves: Point[] = [];
    const { heights, flags } = ground.level0;
    const wanted = Math.round(
        settings.caves * settings.squaresX * settings.squaresY * CAVES_A_SQUARE,
    );
    const roll = createRng(settings.seed + 201);
    const fits = (x: number, y: number) => {
        for (let tx = x; tx < x + CAVE_WIDTH; tx++) {
            const i = tx + y * sizeX;
            if (!rock[i] || !(flags[i + sizeX] & TILE_BLOCKED) || flags[i - sizeX] & TILE_BLOCKED) {
                return false;
            }
        }
        const rise =
            heights[x + 1 + (y + CAVE_DEPTH + 1) * corners.x] - heights[x + 1 + y * corners.x];
        return rise >= CAVE_CLIFF;
    };
    let placed = 0;
    for (let attempt = 0; attempt < wanted * 300 && placed < wanted; attempt++) {
        const x = Math.floor(lerp(arena.x0, arena.x1 - CAVE_WIDTH, roll()));
        const y = Math.floor(lerp(arena.y0 + 1, arena.y1 - CAVE_DEPTH - 2, roll()));
        if (fits(x, y)) {
            caves.push({ x, y });
            ground.place(
                { id: biomeAt(x, y).rock.cave, type: LOC_NORMAL, rotation: 0, level: 0, x, y },
                CAVE_WIDTH,
                CAVE_DEPTH,
            );
            for (let ty = y; ty < y + CAVE_DEPTH; ty++) {
                rock.fill(0, x + ty * sizeX, x + CAVE_WIDTH + ty * sizeX);
            }
            placed++;
        }
    }
    return caves;
}

// The tiles a road's points are on, or near
function forTilesNear(
    build: Build,
    points: Point[],
    radius: number,
    visit: (i: number) => void,
): void {
    const { ground } = build;
    const reach = Math.ceil(radius);
    for (const point of points) {
        const px = Math.floor(point.x);
        const py = Math.floor(point.y);
        for (let y = py - reach; y <= py + reach; y++) {
            for (let x = px - reach; x <= px + reach; x++) {
                if (
                    ground.inside(x, y) &&
                    Math.hypot(x + 0.5 - point.x, y + 0.5 - point.y) <= radius
                ) {
                    visit(ground.tile(x, y));
                }
            }
        }
    }
}

// The road system. Everything joins it, so it's laid as things are placed: main roads
// and bridges, then each building's, which is why a building can face a road that's
// there. A road never goes on a building: tiles round them are out of bounds, and any
// smoothing that drifts onto one is undone.
class RoadNetwork {
    // Road, for others to join. The spawn counts, so that there's something to lead to.
    readonly tiles: Uint8Array;
    readonly halfWidth: number;
    // Keeps roads and fords off buildings: on each tile, how many buildings it's too
    // close to, because zones overlap and a spot that's given up on takes its own off
    readonly offLimits: Uint8Array;
    readonly lines: RoadLine[] = [];
    // Every point of road, to find the nearest. Not the spawn: that's no road.
    private readonly samples: Point[] = [];
    private readonly road: Float32Array;
    private readonly trail: Float32Array;
    private readonly wiggle: Noise;
    private readonly curves: number;
    private readonly climb: (from: number, to: number) => number;

    constructor(
        readonly build: Build,
        readonly water: Uint8Array,
        readonly bridgeZone: Uint8Array,
    ) {
        const { ground, corners, settings, spawn } = build;
        this.tiles = new Uint8Array(ground.sizeX * ground.sizeY);
        this.offLimits = new Uint8Array(this.tiles.length);
        this.halfWidth = settings.roadWidth / 2;
        this.road = new Float32Array(corners.x * corners.y).fill(-4);
        this.trail = new Float32Array(corners.x * corners.y).fill(-4);
        this.wiggle = createNoise(settings.seed + 5, 1);
        this.curves = settings.roadCurviness;
        this.climb = createClimb(build, ROAD_GRADE, ROAD_CLIMB_COST);
        // Everything leads to the spawn, if nothing else
        this.tiles[ground.tile(spawn.x, spawn.y)] = 1;
    }

    // How far from a building a road must keep, past its own edge
    get wallGap(): number {
        return Math.ceil(this.halfWidth) + 1;
    }

    // How far a road runs straight out of a door before it's free to turn
    get doorLead(): number {
        return this.wallGap + 2;
    }

    // The nearest road to a point, or the spawn if there's none yet
    getNearest(x: number, y: number): Point {
        let best = this.build.spawn;
        let bestDistance = Infinity;
        for (const sample of this.samples) {
            const distance = (sample.x - x) ** 2 + (sample.y - y) ** 2;
            if (distance < bestDistance) {
                best = sample;
                bestDistance = distance;
            }
        }
        return best;
    }

    private cost(x: number, y: number): number {
        const { ground } = this.build;
        const i = ground.tile(x, y);
        if (this.tiles[i]) {
            return 0.2;
        }
        if (this.water[i] || ground.reserved[i] || this.offLimits[i]) {
            return Infinity;
        }
        return (
            1 +
            (this.build.cliffs[i] ? ROAD_CLIFF_COST : 0) +
            this.wiggle(x / lerp(24, 7, this.curves), y / lerp(24, 7, this.curves)) *
                this.curves *
                9
        );
    }

    // Whether a point of road is on a building, or by a bridge's road where nothing's to go.
    // A road coming off a bridge starts out next to that, so it's let off (nearBridge).
    private touchesBuilding(point: Point, nearBridge: boolean): boolean {
        const { ground } = this.build;
        let touches = false;
        forTilesNear(this.build, [point], this.halfWidth + 0.5, (i) => {
            touches ||= ground.footprint[i] !== 0 || (!nearBridge && this.bridgeZone[i] !== 0);
        });
        return touches;
    }

    private add(line: RoadLine, width: (point: number) => number, trail: boolean): void {
        const { ground, corners } = this.build;
        const { points } = line;
        addPathToField(this.road, corners.x, corners.y, points, width);
        if (trail) {
            addPathToField(
                this.trail,
                corners.x,
                corners.y,
                points,
                (i) => width(i) + TRAIL_MARGIN,
            );
        }
        this.lines.push(line);
        const clear = this.halfWidth + ROAD_CLEAR_MARGIN;
        forTilesNear(this.build, points, clear, (i) => {
            ground.reserved[i] = 1;
        });
        // A lead's its door's or bridge's alone: others join past it, not against the wall
        forTilesNear(this.build, points.slice(line.lead), clear, (i) => {
            this.tiles[i] = 1;
        });
        this.samples.push(...points);
    }

    // A road as smooth as it'll go without drifting onto a building: each stretch that
    // does gets less smoothing, down to none
    private smoothRoad(raw: Point[], pinned: number): Point[] {
        const reach = Math.round(lerp(9, 5, this.curves));
        const clean = (points: Point[], fallback: Point[]) =>
            points.map((point, i) => {
                const touches =
                    i >= pinned && this.touchesBuilding(point, i < pinned + ROAD_TURN_RADIUS);
                return touches ? fallback[i] : point;
            });
        const light = clean(smoothPath(raw, 2, 1, pinned), raw);
        const medium = clean(smoothPath(raw, 4, 3, pinned), light);
        return clean(smoothPath(raw, reach, 7, pinned), medium);
    }

    // The way from a road's start to the rest of the roads: its tiles, or nothing
    findRoute(from: Point, lead: Point[]): number[] {
        const { finder } = this.build;
        const isRoad = (i: number) => this.tiles[i] !== 0;
        const free = (x: number, y: number) => this.cost(x, y);
        const inTurn = getTurningCircles(lead);
        const turning = (x: number, y: number) => (inTurn(x, y) ? Infinity : free(x, y));
        // Somewhere too tight for a wide turn makes do with a sharp one
        const wide = finder.find(from, turning, isRoad, this.climb);
        return wide.length > 0 ? wide : finder.find(from, free, isRoad, this.climb);
    }

    // Lays a road out of something along a route, as findRoute found it. With no route
    // it leads nowhere, and narrows away into the ground.
    lay(
        from: Point,
        lead: Point[],
        route: number[],
        leadHalfWidth: number,
        startHeight: number,
    ): void {
        const { ground, sizeX } = this.build;
        this.tiles[ground.tile(from.x, from.y)] = 1;
        // Found from the far end back
        const onward = route
            .map((i) => ({ x: (i % sizeX) + 0.5, y: Math.floor(i / sizeX) + 0.5 }))
            .reverse();

        const points = this.smoothRoad([...lead, ...onward], lead.length);

        const width = (i: number) =>
            i < lead.length
                ? leadHalfWidth
                : lerp(leadHalfWidth, this.halfWidth, Math.min((i - lead.length) / ROAD_WIDEN, 1));
        const start = startHeight;
        const line = {
            points,
            lead: lead.length,
            halfWidth: this.halfWidth,
            start,
            grade: ROAD_GRADE,
        };
        this.add(line, width, true);
        if (onward.length === 0) {
            this.taper(points, leadHalfWidth);
        }
    }

    // A long line that's to go over rough ground: its way between points along it, where
    // it can be walked and climbed. Each run's a stretch that's joined up.
    private routeThrough(line: Point[], skip: Uint8Array): Point[][] {
        const { ground, sizeX, finder, cliffs } = this.build;
        const free = (x: number, y: number) =>
            skip[ground.tile(x, y)] ? Infinity : this.cost(x, y);
        const isFree = (x: number, y: number) =>
            ground.inside(x, y) && free(x, y) !== Infinity && !cliffs[ground.tile(x, y)];
        // The nearest tile that'll do
        const snap = (point: Point): Point | undefined => {
            const x = Math.floor(point.x);
            const y = Math.floor(point.y);
            for (let reach = 0; reach <= MAIN_ROAD_SNAP; reach++) {
                for (let ny = y - reach; ny <= y + reach; ny++) {
                    for (let nx = x - reach; nx <= x + reach; nx++) {
                        if (
                            Math.max(Math.abs(nx - x), Math.abs(ny - y)) === reach &&
                            isFree(nx, ny)
                        ) {
                            return { x: nx, y: ny };
                        }
                    }
                }
            }
            return undefined;
        };
        const runs: Point[][] = [];
        let run: Point[] = [];
        let last: Point | undefined;
        const finish = () => {
            if (run.length > 3) {
                runs.push(this.smoothRoad(run, 1));
            }
            run = [];
            last = undefined;
        };
        for (let at = 0; at < line.length; at += MAIN_ROAD_STEP) {
            const next = snap(line[at]);
            if (!next) {
                finish();
                continue;
            }
            if (last) {
                const end = ground.tile(next.x, next.y);
                const route = finder.find(last, free, (i) => i === end, this.climb);
                if (route.length === 0) {
                    finish();
                } else {
                    for (let i = route.length - 1; i >= 0; i--) {
                        run.push({
                            x: (route[i] % sizeX) + 0.5,
                            y: Math.floor(route[i] / sizeX) + 0.5,
                        });
                    }
                }
            }
            last = next;
        }
        finish();
        return runs;
    }

    private addRun(run: Point[]): void {
        const { ground } = this.build;
        this.add(
            { points: run, lead: 0, halfWidth: this.halfWidth, grade: ROAD_GRADE },
            () => this.halfWidth,
            true,
        );
        for (const point of run) {
            this.tiles[ground.tile(Math.floor(point.x), Math.floor(point.y))] = 1;
        }
    }

    // Lays a road along a line, leaving out where it can't go, for others to join
    addMainRoad(line: Point[], skip: Uint8Array): void {
        const { ground, settings } = this.build;
        if (hasRelief(settings)) {
            this.routeThrough(line, skip).forEach((run) => this.addRun(run));
            return;
        }
        let run: Point[] = [];
        const finish = () => {
            if (run.length > 3) {
                this.addRun(run);
            }
            run = [];
        };
        for (const point of line) {
            const x = Math.floor(point.x);
            const y = Math.floor(point.y);
            if (ground.inside(x, y) && !skip[ground.tile(x, y)]) {
                run.push(point);
            } else {
                finish();
            }
        }
        finish();
    }

    // Runs a road that leads nowhere on past its end, narrowing away to nothing, so that
    // it fades into the ground instead of stopping square
    private taper(line: Point[], halfWidth: number): void {
        const { corners } = this.build;
        const end = line[line.length - 1];
        const before = line[line.length - 2];
        const length = Math.hypot(end.x - before.x, end.y - before.y);
        const wayX = (end.x - before.x) / length;
        const wayY = (end.y - before.y) / length;
        for (let step = 0; step < ROAD_TAPER; step++) {
            const narrow = halfWidth * (1 - (step + 1) / ROAD_TAPER);
            const from = { x: end.x + wayX * step, y: end.y + wayY * step };
            const to = { x: from.x + wayX, y: from.y + wayY };
            addPathToField(this.road, corners.x, corners.y, [from, to], narrow);
            addPathToField(this.trail, corners.x, corners.y, [from, to], narrow + TRAIL_MARGIN);
        }
    }

    paint(): Uint8Array {
        const { ground, sizeX, sizeY, corners, biomeAt } = this.build;
        const skip = new Uint8Array(this.water.length);
        for (let i = 0; i < skip.length; i++) {
            skip[i] = this.water[i] | ground.footprint[i];
        }
        const band = getTouchedTiles(this.trail, sizeX, sizeY);
        for (let y = 0; y < sizeY; y++) {
            for (let x = 0; x < sizeX; x++) {
                const i = ground.tile(x, y);
                if (band[i] && !skip[i]) {
                    ground.level0.underlays[i] = biomeAt(x, y).trail;
                }
            }
        }
        const field = smoothField(this.road, corners.x, corners.y, 1);
        return ground.paintField(field, biomeAt(sizeX >> 1, sizeY >> 1).road, false, skip);
    }
}

// The tiles a road can't use just past a straight stretch: a circle either side of its
// end, so that it can only swing away in a wide arc. Left to itself, a road whose way
// lies back past the stretch doubles back on it in a sharp point.
function getTurningCircles(lead: Point[]): (x: number, y: number) => boolean {
    const end = lead[lead.length - 1];
    const before = lead[lead.length - 2];
    const length = Math.hypot(end.x - before.x, end.y - before.y);
    const sideX = (before.y - end.y) / length;
    const sideY = (end.x - before.x) / length;
    const radius = Math.min(lead.length, ROAD_TURN_RADIUS);
    const centres = [1, -1].map((side) => ({
        x: end.x + sideX * side * radius,
        y: end.y + sideY * side * radius,
    }));
    return (x, y) =>
        centres.some((centre) => Math.hypot(x + 0.5 - centre.x, y + 0.5 - centre.y) < radius - 0.7);
}

// The tiles that only hide the ground under the bridge's ends, which is the one
// floor it needs at ground level: the rest is ours, river and road
const BRIDGE_HIDDEN_FLOOR = 61;

// How a road leaves something: dead straight along these points, in tile corners, to
// where it's free to find its way from (from, a tile)
type RoadStart = { from: Point; lead: Point[]; height: number };

// A river's line at a crossing: bridges stand on whole tiles
function getCrossingLine(river: River, crossing: number): number {
    return Math.round(riverLine(river, crossing));
}

// Bridges where rivers can take one. Returns a road start for each end of each, and
// marks where main roads must keep off them.
function placeBridges(
    build: Build,
    rivers: River[],
    water: Uint8Array,
    zone: Uint8Array,
): RoadStart[] {
    const { context, ground, arena, terrain } = build;
    const starts: RoadStart[] = [];
    const prefab = loadPrefab(context, BRIDGE);
    const turned = rotatePrefab(prefab, 1, context.locs);
    const middle = BRIDGE.sizeX >> 1;
    const straight = middle + BRIDGE_ROAD_STRAIGHT;
    for (const river of rivers) {
        for (const crossing of river.crossings) {
            // Tile corners along the bridge's middle line, by distance from the river's
            // middle. Turning a prefab mirrors it along its length.
            const line = getCrossingLine(river, crossing);
            const across = (distance: number): Point =>
                river.vertical
                    ? { x: line + distance, y: crossing }
                    : { x: crossing, y: line + distance };
            const deckNear = river.vertical ? BRIDGE_DECK_WEST - middle : middle - BRIDGE_DECK_EAST;
            const deckFar = river.vertical ? BRIDGE_DECK_EAST - middle : middle - BRIDGE_DECK_WEST;

            // The straight runs must be on land in the arena, both rows of them
            const inArena = (p: Point) =>
                p.x >= arena.x0 && p.y >= arena.y0 && p.x <= arena.x1 && p.y <= arena.y1;
            const onLand = (distance: number) => {
                const p = across(distance);
                const q = river.vertical ? { x: p.x, y: p.y - 1 } : { x: p.x - 1, y: p.y };
                const free = (t: Point) =>
                    !water[ground.tile(t.x, t.y)] && !zone[ground.tile(t.x, t.y)];
                return inArena(p) && inArena(q) && free(p) && free(q);
            };
            let fits = true;
            for (let distance = deckFar; distance <= straight + 1; distance++) {
                fits &&= onLand(distance);
            }
            for (let distance = deckNear - 1; distance >= -straight - 2; distance--) {
                fits &&= onLand(distance);
            }
            const crossesOther = rivers.some(
                (other) => other !== river && Math.abs(crossing - riverCentre(other, line)) < 26,
            );
            if (!fits || crossesOther) {
                continue;
            }
            // Its banks stand as far over the water as they do where it's from
            const height = river.levels[crossing] + BRIDGE_BANK_HEIGHT - BRIDGE_BED_HEIGHT;
            const options = {
                floor: (overlay: number) => overlay === BRIDGE_HIDDEN_FLOOR,
                feather: 0,
                flatten: false,
                height,
                anchor: BRIDGE_BANK_HEIGHT,
                keepUnderlays: true,
                keepHeights: true,
            };
            const stampAt = crossing - BRIDGE_DECK_ROW;
            const bridge = river.vertical ? prefab : turned;
            const stampX = river.vertical ? line - middle : stampAt;
            const stampY = river.vertical ? stampAt : line - middle;
            ground.stamp(bridge, stampX, stampY, options);
            const cornersOfStamp = bridge.sizeX + 1;
            for (let cy = 0; cy <= bridge.sizeY; cy++) {
                for (let cx = 0; cx <= bridge.sizeX; cx++) {
                    // The deck's stored over the ground under it, so that has to stay. Past
                    // it the bank's lumpy, and a road runs off it, so it's level.
                    const out = (river.vertical ? stampX + cx : stampY + cy) - line;
                    const own = bridge.levels[0].heights[cx + cy * cornersOfStamp];
                    const onDeck = out >= deckNear && out <= deckFar;
                    const rise = onDeck ? own - BRIDGE_BANK_HEIGHT : 0;
                    terrain.pin(stampX + cx, stampY + cy, height + rise);
                }
            }
            for (let y = stampY; y < stampY + bridge.sizeY; y++) {
                for (let x = stampX; x < stampX + bridge.sizeX; x++) {
                    zone[ground.tile(x, y)] = 1;
                }
            }
            // Nothing goes on the road's rows or close by, all the way along: no buildings
            // or trees, nor roads doubling back beside it
            for (let distance = -straight; distance <= straight; distance++) {
                const p = across(distance);
                for (let row = -BRIDGE_ROAD_CLEAR - 1; row <= BRIDGE_ROAD_CLEAR; row++) {
                    const x = river.vertical ? p.x : p.x + row;
                    const y = river.vertical ? p.y + row : p.y;
                    ground.reserved[ground.tile(x, y)] = 1;
                    zone[ground.tile(x, y)] = 1;
                }
            }
            for (const [deck, end, way] of [
                [deckNear, -straight, -1],
                [deckFar, straight, 1],
            ]) {
                const lead: Point[] = [];
                for (let distance = deck; distance !== end + way; distance += way) {
                    lead.push(across(distance));
                }
                starts.push({ from: across(end + way), lead, height });
            }
        }
    }
    return starts;
}

// The ring road or spine, for the others to join
function layMainRoads(build: Build, roads: RoadNetwork, bridgeZone: Uint8Array): void {
    const { settings, arena, spawn, sizeX, sizeY } = build;
    if (settings.roads <= 0 || settings.roadStyle === "branching") {
        return;
    }
    const wiggle = createNoise(settings.seed + 8, 1);
    const skip = new Uint8Array(roads.water.length);
    for (let i = 0; i < skip.length; i++) {
        skip[i] = roads.water[i] | bridgeZone[i];
    }
    const line: Point[] = [];
    if (settings.roadStyle === "ring") {
        const middleX = (arena.x0 + arena.x1) / 2;
        const middleY = (arena.y0 + arena.y1) / 2;
        const radiusX = (arena.x1 - arena.x0) * 0.32;
        const radiusY = (arena.y1 - arena.y0) * 0.32;
        const steps = Math.ceil((radiusX + radiusY) * 4);
        for (let step = 0; step <= steps; step++) {
            const angle = (step / steps) * Math.PI * 2;
            const out =
                1 +
                (wiggle(Math.cos(angle) * 2 + 3, Math.sin(angle) * 2 + 3) - 0.5) *
                    settings.roadCurviness *
                    0.8;
            line.push({
                x: middleX + Math.cos(angle) * radiusX * out,
                y: middleY + Math.sin(angle) * radiusY * out,
            });
        }
    } else {
        // Off both sides of the map, through the spawn, the long way
        const eastWest = sizeX >= sizeY;
        const length = eastWest ? sizeX : sizeY;
        const middle = eastWest ? spawn.y : spawn.x;
        const swing = 8 + settings.roadCurviness * 50;
        for (let along = 0; along < length; along++) {
            const across = middle + (wiggle(along / 50, 7.5) - 0.5) * 2 * swing;
            line.push(eastWest ? { x: along, y: across } : { x: across, y: along });
        }
    }
    roads.addMainRoad(line, skip);
}

type Candidate = { name: string; centreX: number; centreY: number };

// The buildings that can go somewhere, by the settings
function getBuildingNames(build: Build, x: number, y: number): string[] {
    const { settings, biomeAt } = build;
    const names = settings.anyBuildings ? Object.keys(PREFABS) : biomeAt(x, y).buildings;
    return names.filter((name) => isBuildingKind(name, settings));
}

// Middles for towns: somewhere with ground to build on, if there's anywhere
function getTownCentres(build: Build): Point[] {
    const { settings, arena, rng, cliffs, mainland, ground, terrain } = build;
    const centres: Point[] = [];
    const inset = Math.min(20, (arena.x1 - arena.x0) >> 2);
    const score = (x: number, y: number) => {
        // How much of a ring round it you could build on
        let good = 0;
        const reach = settings.townSize * 0.6;
        const middle = terrain.getHeight(x, y);
        for (let a = 0; a < TOWN_SAMPLES; a++) {
            const angle = (a / TOWN_SAMPLES) * Math.PI * 2;
            const sx = Math.floor(x + Math.cos(angle) * reach);
            const sy = Math.floor(y + Math.sin(angle) * reach);
            const i = ground.tile(sx, sy);
            const level = Math.abs(terrain.getHeight(sx, sy) - middle) < TOWN_RISE;
            good += ground.inside(sx, sy) && !cliffs[i] && mainland[i] && level ? 1 : 0;
        }
        return good;
    };
    for (let i = 0; i < settings.towns; i++) {
        let best: Point | undefined;
        let bestScore = -1;
        for (let attempt = 0; attempt < TOWN_TRIES; attempt++) {
            const spot = {
                x: lerp(arena.x0 + inset, arena.x1 - inset, rng()),
                y: lerp(arena.y0 + inset, arena.y1 - inset, rng()),
            };
            const spotScore = score(spot.x, spot.y);
            if (spotScore > bestScore) {
                best = spot;
                bestScore = spotScore;
            }
            if (!hasRelief(settings)) {
                break;
            }
        }
        centres.push(best!);
    }
    return centres;
}

function pickSpot(build: Build, towns: Point[]): Candidate | undefined {
    const { settings, arena, rng } = build;
    let x: number;
    let y: number;
    if (towns.length > 0) {
        const town = pick(rng, towns);
        const angle = rng() * Math.PI * 2;
        const distance = Math.sqrt(rng()) * settings.townSize;
        x = town.x + Math.cos(angle) * distance;
        y = town.y + Math.sin(angle) * distance;
    } else {
        x = lerp(arena.x0, arena.x1, rng());
        y = lerp(arena.y0, arena.y1, rng());
    }
    const names = getBuildingNames(build, Math.floor(x), Math.floor(y));
    return names.length > 0 ? { name: pick(rng, names), centreX: x, centreY: y } : undefined;
}

// Whether a rectangle has room for a building, with space round it
function fitsBuilding(
    build: Build,
    water: Uint8Array,
    x: number,
    y: number,
    sizeX: number,
    sizeY: number,
): boolean {
    const { settings, ground, spawn, toEdge, terrain, cliffs, mainland } = build;
    const inset = settings.boundary === "sea" ? 3 : settings.boundaryDepth + 3;
    if (Math.min(toEdge(x, y), toEdge(x + sizeX, y + sizeY)) < inset) {
        return false;
    }
    for (let ty = y - BUILDING_CLEAR; ty < y + sizeY + BUILDING_CLEAR; ty++) {
        for (let tx = x - BUILDING_CLEAR; tx < x + sizeX + BUILDING_CLEAR; tx++) {
            const i = ground.tile(tx, ty);
            if (
                !ground.inside(tx, ty) ||
                water[i] ||
                cliffs[i] ||
                !mainland[i] ||
                ground.reserved[i] ||
                Math.hypot(tx - spawn.x, ty - spawn.y) <= SPAWN_CLEAR
            ) {
                return false;
            }
        }
    }
    const { min, max } = terrain.getRange(
        x - PLOT_MARGIN,
        y - PLOT_MARGIN,
        sizeX + PLOT_MARGIN * 2,
        sizeY + PLOT_MARGIN * 2,
    );
    if (max - min > MAX_PLOT_RISE) {
        return false;
    }
    // The ground has to get from the plot down to any water, at a walkable slope. Water
    // doesn't move for it.
    const reach = WATER_CLEAR;
    for (let ty = y - reach; ty < y + sizeY + reach; ty++) {
        for (let tx = x - reach; tx < x + sizeX + reach; tx++) {
            if (ground.inside(tx, ty) && water[ground.tile(tx, ty)]) {
                return false;
            }
        }
    }
    return true;
}

// How high a building's plot goes: the middle of its ground, as near what it's joining as
// that ground will let it, and within walking distance of any plot beside it. Undefined
// if that's not near its own ground.
function getPlotHeight(
    build: Build,
    x: number,
    y: number,
    sizeX: number,
    sizeY: number,
    joining?: number,
): number | undefined {
    const { terrain, plots, settings } = build;
    const margin = PLOT_MARGIN;
    const { min, max } = terrain.getRange(
        x - margin,
        y - margin,
        sizeX + margin * 2,
        sizeY + margin * 2,
    );
    const middle = (min + max) / 2;
    let height = joining === undefined ? middle : Math.min(Math.max(joining, min), max);
    const slope = settings.walkSlope * SETTLE_SLOPE;
    for (const plot of plots) {
        const gapX = Math.max(plot.x - (x + sizeX), x - (plot.x + plot.sizeX), 0);
        const gapY = Math.max(plot.y - (y + sizeY), y - (plot.y + plot.sizeY), 0);
        const gap = Math.max(Math.hypot(gapX, gapY) - margin * 2, 1) * slope;
        height = Math.min(Math.max(height, plot.height - gap), plot.height + gap);
    }
    return height < min - MAX_PLOT_RISE || height > max + MAX_PLOT_RISE
        ? undefined
        : Math.round(height);
}

// Makes a building's plot flat at a height, and the ground out of its door
function pinPlot(
    build: Build,
    x: number,
    y: number,
    sizeX: number,
    sizeY: number,
    height: number,
    exit?: Exit,
): void {
    const { terrain, plots } = build;
    const margin = PLOT_MARGIN;
    terrain.pinRect(x - margin, y - margin, sizeX + margin * 2, sizeY + margin * 2, height);
    plots.push({ x, y, sizeX, sizeY, height });
    if (exit) {
        for (let out = 1; out <= DOOR_STEP; out++) {
            const stepX = Math.round(exit.x + exit.outX * out);
            const stepY = Math.round(exit.y + exit.outY * out);
            terrain.pinRect(stepX - 1, stepY - 1, 2, 2, height, DOOR_STEP_PIN);
        }
    }
}

// A fence round a building a little way off, with a gap at its door
function placeYard(build: Build, plot: PlacedBuilding): void {
    const { ground } = build;
    const { exit } = plot;
    const x0 = plot.x - YARD_GAP;
    const y0 = plot.y - YARD_GAP;
    const x1 = plot.x + plot.sizeX + YARD_GAP - 1;
    const y1 = plot.y + plot.sizeY + YARD_GAP - 1;
    const post = (x: number, y: number, rotation: number) => {
        // The gap at the door, on the fence's own line
        const inGap =
            exit !== undefined &&
            ((exit.outX !== 0 &&
                Math.abs(y + 0.5 - exit.y) < 2.5 &&
                (exit.outX > 0 ? x === x1 : x === x0) &&
                (rotation === WALL_EAST || rotation === WALL_WEST)) ||
                (exit.outY !== 0 &&
                    Math.abs(x + 0.5 - exit.x) < 2.5 &&
                    (exit.outY > 0 ? y === y1 : y === y0) &&
                    (rotation === WALL_NORTH || rotation === WALL_SOUTH)));
        if (!inGap) {
            ground.grid.locs.push({ id: FENCE, type: LOC_WALL, rotation, level: 0, x, y });
        }
    };
    for (let x = x0; x <= x1; x++) {
        post(x, y0, WALL_SOUTH);
        post(x, y1, WALL_NORTH);
    }
    for (let y = y0; y <= y1; y++) {
        post(x0, y, WALL_WEST);
        post(x1, y, WALL_EAST);
    }
}

// A building in a rotation at a spot, if it fits, with its way out that best faces the
// nearest road, and how squarely it does
type Placing = { turns: number; x: number; y: number; exit: Exit; facing: number };

function getPlacings(
    build: Build,
    roads: RoadNetwork,
    water: Uint8Array,
    spot: Candidate,
): Placing[] {
    const { kit, rng } = build;
    const placings: Placing[] = [];
    for (let turns = 0; turns < 4; turns++) {
        const { prefab, exits } = kit.get(spot.name, turns);
        const x = Math.round(spot.centreX - prefab.sizeX / 2);
        const y = Math.round(spot.centreY - prefab.sizeY / 2);
        if (!fitsBuilding(build, water, x, y, prefab.sizeX, prefab.sizeY)) {
            continue;
        }
        for (const local of exits) {
            const exit = { ...local, x: local.x + x, y: local.y + y };
            const road = roads.getNearest(exit.x, exit.y);
            const length = Math.hypot(road.x - exit.x, road.y - exit.y) || 1;
            const facing = (exit.outX * (road.x - exit.x) + exit.outY * (road.y - exit.y)) / length;
            // Nothing that turns its back on the road
            if (facing > 0) {
                placings.push({ turns, x, y, exit, facing: facing + rng() * 0.01 });
            }
        }
    }
    return placings.sort((a, b) => b.facing - a.facing);
}

function markOffLimits(
    build: Build,
    roads: RoadNetwork,
    x: number,
    y: number,
    sizeX: number,
    sizeY: number,
    change: 1 | -1,
): void {
    const { ground } = build;
    const gap = roads.wallGap;
    for (let ty = y - gap; ty < y + sizeY + gap; ty++) {
        for (let tx = x - gap; tx < x + sizeX + gap; tx++) {
            if (ground.inside(tx, ty)) {
                roads.offLimits[ground.tile(tx, ty)] += change;
            }
        }
    }
}

// Places a building at a spot if one fits, turned so that a way out faces the nearest
// road. One that wants a road only goes where its road can join the others, ending at
// that door. One on its own faces the nearest road anyway, or the spawn if there are none.
function placeBuilding(
    build: Build,
    roads: RoadNetwork,
    water: Uint8Array,
    spot: Candidate,
    wantsRoad: boolean,
): PlacedBuilding | undefined {
    const { settings, ground, kit, rng } = build;
    const { name } = spot;
    for (const { turns, x, y, exit } of getPlacings(build, roads, water, spot)) {
        const { prefab } = kit.get(name, turns);
        const plot: PlacedBuilding = {
            name,
            x,
            y,
            sizeX: prefab.sizeX,
            sizeY: prefab.sizeY,
            exit,
            hasRoad: wantsRoad,
        };
        // Straight out of the door, so that's how the road arrives
        const lead: Point[] = [];
        for (let step = 0; step <= roads.doorLead; step++) {
            lead.push({ x: exit.x + exit.outX * step, y: exit.y + exit.outY * step });
        }
        const end = lead[lead.length - 1];
        const from = { x: Math.floor(end.x), y: Math.floor(end.y) };
        markOffLimits(build, roads, x, y, prefab.sizeX, prefab.sizeY, 1);
        const route = wantsRoad && ground.inside(from.x, from.y) ? roads.findRoute(from, lead) : [];
        if (wantsRoad && route.length === 0) {
            markOffLimits(build, roads, x, y, prefab.sizeX, prefab.sizeY, -1);
            continue;
        }
        // Its road has to be able to get from its door to where it joins
        const joining = route.length > 0 ? build.tileHeights[route[0]] : undefined;
        const height = getPlotHeight(build, x, y, prefab.sizeX, prefab.sizeY, joining);
        const steepest = settings.walkSlope * ROAD_STEEPEST * route.length;
        const tooFar = joining !== undefined && Math.abs(joining - (height ?? 0)) > steepest;
        if (height === undefined || tooFar) {
            markOffLimits(build, roads, x, y, prefab.sizeX, prefab.sizeY, -1);
            continue;
        }
        kit.stamp(ground, name, turns, x, y, true);
        pinPlot(build, x, y, prefab.sizeX, prefab.sizeY, height, exit);
        if (rng() < settings.gardens) {
            placeYard(build, plot);
        }
        if (wantsRoad) {
            roads.lay(from, lead, route, roads.halfWidth, height);
        }
        return plot;
    }
    return undefined;
}

function placeBuildings(build: Build, roads: RoadNetwork, water: Uint8Array): PlacedBuilding[] {
    const { settings } = build;
    const wanted = Math.round(settings.buildings * settings.squaresX * settings.squaresY * 3);
    const towns = getTownCentres(build);
    const plots: PlacedBuilding[] = [];
    // Those with roads first, so that the rest can face all the roads there'll be
    const roadCount = Math.round(wanted * settings.roads);
    for (const [count, wantsRoad] of [
        [roadCount, true],
        [wanted, false],
    ] as const) {
        for (let attempt = 0; attempt < wanted * 40 && plots.length < count; attempt++) {
            const spot = pickSpot(build, towns);
            const plot = spot && placeBuilding(build, roads, water, spot, wantsRoad);
            if (plot) {
                plots.push(plot);
            }
        }
    }
    return plots;
}

// Ruined buildings: some of their walls, none of their furniture, and no road
function placeRuins(build: Build, roads: RoadNetwork, water: Uint8Array): void {
    const { settings, ground, kit, rng } = build;
    const wanted = Math.round(settings.ruins * settings.squaresX * settings.squaresY * 2);
    const names = Object.keys(PREFABS);
    let placed = 0;
    for (let attempt = 0; attempt < wanted * 30 && placed < wanted; attempt++) {
        const name = pick(rng, names);
        const x0 = lerp(build.arena.x0, build.arena.x1, rng());
        const y0 = lerp(build.arena.y0, build.arena.y1, rng());
        const turns = Math.floor(rng() * 4);
        const { prefab } = kit.get(name, turns);
        const x = Math.round(x0);
        const y = Math.round(y0);
        if (fitsBuilding(build, water, x, y, prefab.sizeX, prefab.sizeY)) {
            const height = getPlotHeight(build, x, y, prefab.sizeX, prefab.sizeY);
            if (height === undefined) {
                continue;
            }
            kit.stampRuin(ground, name, turns, x, y, rng, true);
            pinPlot(build, x, y, prefab.sizeX, prefab.sizeY, height);
            markOffLimits(build, roads, x, y, prefab.sizeX, prefab.sizeY, 1);
            placed++;
        }
    }
}

// What stops you at the arena's edge, other than the sea and the hills' ground. A fence
// runs round it; a forest and hills are in scatter.
function placeBoundary(build: Build, roadTiles: Uint8Array): void {
    const { settings, ground, arena } = build;
    if (settings.boundary !== "fence") {
        return;
    }
    const inset = settings.boundaryDepth;
    const x0 = arena.x0 + inset;
    const x1 = arena.x1 - inset;
    const y0 = arena.y0 + inset;
    const y1 = arena.y1 - inset;
    const fence = (x: number, y: number, rotation: number) => {
        // A way through for a road, as well as nothing in the water
        if (!ground.isWaterTile(x, y) && !roadTiles[ground.tile(x, y)]) {
            ground.grid.locs.push({ id: FENCE, type: LOC_WALL, rotation, level: 0, x, y });
        }
    };
    for (let x = x0; x <= x1; x++) {
        fence(x, y0, WALL_SOUTH);
        fence(x, y1, WALL_NORTH);
    }
    for (let y = y0; y <= y1; y++) {
        fence(x0, y, WALL_WEST);
        fence(x1, y, WALL_EAST);
    }
}

function scatter(build: Build, water: Uint8Array): void {
    const { settings, ground, rng, arena, spawn, biomeAt, toEdge, sizeX, sizeY, relief } = build;
    const { terrain } = build;
    const snowLine = getSnowLine(settings);
    const clumpScale = lerp(8, 28, settings.treeClumping);
    const clumps = createNoise(settings.seed + 6);
    const flowerPatches = createNoise(settings.seed + 9, 1);
    const clumpLine = lerp(0.5, 0.56, settings.treeClumping);
    const inClump = lerp(0.1, 0.4, settings.treeClumping);
    const outOfClump = lerp(0.1, 0, settings.treeClumping);
    const place = (id: number, size: number, type: number, x: number, y: number) => {
        ground.place({ id, type, rotation: Math.floor(rng() * 4), level: 0, x, y }, size, size);
    };
    // Past the arena there's only anything to see on land, and then it goes on
    const reach = settings.boundary === "sea" ? 24 : MARGIN * MAP_SQUARE_SIZE;
    const belt = settings.boundary === "forest";
    const stones = settings.boundary === "hills";
    const x0 = Math.max(arena.x0 - reach, 0);
    const y0 = Math.max(arena.y0 - reach, 0);
    const x1 = Math.min(arena.x1 + reach, sizeX - 2);
    const y1 = Math.min(arena.y1 + reach, sizeY - 2);
    for (let y = y0; y <= y1; y++) {
        for (let x = x0; x <= x1; x++) {
            const roll = rng();
            const i = ground.tile(x, y);
            if (water[i] || ground.level0.flags[i] & TILE_BLOCKED) {
                continue;
            }
            if (Math.hypot(x - spawn.x, y - spawn.y) < SPAWN_CLEAR) {
                continue;
            }
            const biome = biomeAt(x, y);
            const edge = toEdge(x, y);
            const inBelt = belt && edge < settings.boundaryDepth;
            const clump = clumps(x / clumpScale, y / clumpScale);
            const density = clump > clumpLine ? inClump : outOfClump;
            // Trees thin out up the mountains, and stones take over
            const mountain = relief.mountain[terrain.corner(x, y)];
            const rocky = Math.min(mountain * 1.6, 1);
            if (rocky > 0) {
                const chance = settings.rubble * rocky;
                const { rubble, stones } = biome.rock;
                if (roll < chance * RUBBLE_CHANCE) {
                    const [id, size] = pick(rng, rubble);
                    if (ground.isClear(x - 1, y - 1, size + 2, size + 2)) {
                        place(id, size, LOC_NORMAL, x, y);
                    }
                    continue;
                }
                if (roll < chance * STONE_CHANCE && ground.isClear(x, y, 1, 1)) {
                    ground.grid.locs.push({
                        id: pick(rng, stones),
                        type: LOC_FLOOR_DECORATION,
                        rotation: Math.floor(rng() * 4),
                        level: 0,
                        x,
                        y,
                    });
                    continue;
                }
            }
            // Nothing grows on the snow
            const bare = terrain.height[terrain.corner(x, y)] > snowLine ? 0 : 1 - rocky;
            const treeChance = (inBelt ? 0.5 : settings.trees * density) * bare;
            const rockChance = settings.rocks * (clump < 0.44 ? 0.025 : 0.006);
            if (stones && edge < 3 && edge > -3) {
                // A line of boulders along the edge, where the ground gets too steep
                const [id, size] = biome.rocks[biome.rocks.length - 1];
                if (roll < 0.7 && ground.isClear(x, y, size, size)) {
                    place(id, size, LOC_NORMAL, x, y);
                }
                continue;
            }
            if (roll < treeChance) {
                const [id, size] = inBelt
                    ? pick(rng, biome.trees)
                    : pickBySize(rng, biome.trees, settings.treeMix);
                // A tile's gap all round: this game needs room to run, and big trees
                // packed tight are a wall with dead ends. A forest's edge is one.
                const gap = inBelt ? 0 : 1;
                if (ground.isClear(x - gap, y - gap, size + gap * 2, size + gap * 2)) {
                    place(id, size, LOC_NORMAL, x, y);
                }
            } else if (roll < treeChance + rockChance) {
                const [id, size] = pickBySize(rng, biome.rocks, settings.rockMix);
                if (ground.isClear(x, y, size, size)) {
                    place(id, size, LOC_NORMAL, x, y);
                }
            } else if (roll < treeChance + rockChance + settings.grass * 0.56 * bare) {
                if (ground.isClear(x, y, 1, 1)) {
                    ground.grid.locs.push({
                        id: pick(rng, biome.decor),
                        type: LOC_FLOOR_DECORATION,
                        rotation: Math.floor(rng() * 4),
                        level: 0,
                        x,
                        y,
                    });
                }
            } else if (
                rng() < settings.flowers * 0.4 * bare &&
                flowerPatches(x / 9, y / 9) > 0.55 &&
                ground.isClear(x, y, 1, 1)
            ) {
                place(pick(rng, biome.flowers), 1, LOC_NORMAL, x, y);
            }
        }
    }
}

// Pieces of a list of tiles, joined by touching sides, biggest first
function groupTiles(tiles: number[], sizeX: number, count: number): number[][] {
    const left = new Uint8Array(count);
    for (const tile of tiles) {
        left[tile] = 1;
    }
    const pieces: number[][] = [];
    for (const start of tiles) {
        if (!left[start]) {
            continue;
        }
        left[start] = 0;
        const piece = [start];
        for (let at = 0; at < piece.length; at++) {
            const i = piece[at];
            for (const j of [i - 1, i + 1, i - sizeX, i + sizeX]) {
                if (left[j]) {
                    left[j] = 0;
                    piece.push(j);
                }
            }
        }
        pieces.push(piece);
    }
    return pieces.sort((a, b) => b.length - a.length);
}

// Dries a band along a path, taking off anything standing there
function layFord(build: Build, path: number[], water: WaterPaint): void {
    const { ground, sizeX, sizeY, corners, biomeAt } = build;
    const points = path.map((i) => ({ x: (i % sizeX) + 0.5, y: Math.floor(i / sizeX) + 0.5 }));
    const line = smoothPath(points, 3, 3);
    const band = new Float32Array(corners.x * corners.y).fill(-4);
    addPathToField(band, corners.x, corners.y, line, FORD_HALF_WIDTH);
    for (let i = 0; i < band.length; i++) {
        water.field[i] = Math.min(water.field[i], -band[i]);
    }
    const ford = getTouchedTiles(band, sizeX, sizeY);
    for (let y = 0; y < sizeY; y++) {
        for (let x = 0; x < sizeX; x++) {
            const i = ground.tile(x, y);
            if (ford[i] && !ground.footprint[i]) {
                ground.level0.underlays[i] = biomeAt(x, y).shore;
                ground.reserved[i] = 1;
            }
        }
    }
    ground.clearOverlay(water.tiles);
    water.tiles = ground.paintField(water.field, biomeAt(sizeX >> 1, sizeY >> 1).water, true);
    blockSteepGround(build);
    ground.grid.locs = ground.grid.locs.filter(
        (loc) =>
            !ford[ground.tile(loc.x, loc.y)] ||
            loc.level !== 0 ||
            ground.footprint[ground.tile(loc.x, loc.y)],
    );
}

// Every open tile left must be reachable from the spawn: big pieces get a ford,
// and whatever's still cut off is blocked. Nobody can get next to a blocked tile
// from the other side, so it's never an invisible wall.
function connectGround(build: Build, water: WaterPaint, offLimits: Uint8Array): RoadLine[] {
    const { ground, context, arena, spawn, finder, cliffs } = build;
    const { grid, sizeX, sizeY } = ground;
    const fords: RoadLine[] = [];
    let flags = getCollisionFlags(grid, context.locs);
    let reached = findReachable(flags, sizeX, sizeY, arena, spawn.x, spawn.y);
    const cost = (x: number, y: number) => {
        const inArena = x >= arena.x0 && y >= arena.y0 && x <= arena.x1 && y <= arena.y1;
        const i = ground.tile(x, y);
        return inArena && !offLimits[i] && !cliffs[i] ? 1 : Infinity;
    };
    for (let count = 0; count < MAX_FORDS; count++) {
        const stranded = findStranded(flags, sizeX, arena, reached);
        // The biggest piece a ford can get to: cliffs can be in the way
        let path: number[] = [];
        for (const piece of groupTiles(stranded, sizeX, flags.length)) {
            if (piece.length < MIN_STRANDED_PIECE) {
                break;
            }
            const at = piece[0];
            const start = { x: at % sizeX, y: Math.floor(at / sizeX) };
            path = finder.find(start, cost, (i) => reached[i] !== 0);
            if (path.length > 0) {
                break;
            }
        }
        if (path.length === 0) {
            break;
        }
        layFord(build, path, water);
        fords.push({
            points: path.map((i) => ({ x: (i % sizeX) + 0.5, y: Math.floor(i / sizeX) + 0.5 })),
            lead: 0,
            halfWidth: FORD_HALF_WIDTH,
        });
        flags = getCollisionFlags(grid, context.locs);
        reached = findReachable(flags, sizeX, sizeY, arena, spawn.x, spawn.y);
    }
    for (const i of findStranded(flags, sizeX, arena, reached)) {
        blockTile(grid, i);
    }
    if (reached.reduce((sum, tile) => sum + tile, 0) < MIN_PLAYABLE_TILES) {
        throw new Error("These settings leave too little ground to play on.");
    }
    return fords;
}

function createBuild(settings: GeneratorSettings, context: BuildContext): Build {
    const { sizeX, sizeY } = getGeneratedSize(settings);
    const arena = getGeneratedArena(settings);
    const first = BIOMES[settings.biome];
    const second = settings.secondBiome === "none" ? first : BIOMES[settings.secondBiome];
    const regions = createNoise(settings.seed + 7, 2);
    const secondLine = 0.25 + settings.biomeMix * 0.5;
    const hasSecond = settings.secondBiome !== "none" && settings.biomeMix > 0;
    const corners = { x: sizeX + 1, y: sizeY + 1 };
    const bounds: LandformBounds = {
        corners,
        arena,
        spawn: getGeneratedSpawn(settings),
        toEdge: (x, y) => Math.min(x - arena.x0, arena.x1 + 1 - x, y - arena.y0, arena.y1 + 1 - y),
    };
    const relief = createRelief(settings, bounds);
    return {
        ...bounds,
        settings,
        context,
        ground: new Ground(sizeX, sizeY),
        rng: createRng(settings.seed),
        finder: new PathFinder(sizeX, sizeY),
        kit: new PrefabKit(context),
        sizeX,
        sizeY,
        biomeAt: hasSecond
            ? (x, y) => (regions(x / 60, y / 60) < secondLine ? second : first)
            : () => first,
        relief,
        terrain: relief.terrain,
        cliffs: new Uint8Array(sizeX * sizeY),
        heldCorners: new Uint8Array(corners.x * corners.y),
        mainland: new Uint8Array(sizeX * sizeY).fill(1),
        tileHeights: new Float32Array(sizeX * sizeY),
        plots: [],
    };
}

// Ground's height and what's walkable, once everything's been placed on it
function finishHeights(build: Build): void {
    const { terrain, ground, corners, heldCorners } = build;
    settleTerrain(build);
    const fixed = Uint8Array.from(heldCorners);
    terrain.markPinned(fixed);
    limitNorthFaces(terrain.height, corners.x, corners.y, NORTH_FACE_SLOPE, fixed);
    terrain.write((x, y, height) => ground.setHeight(x, y, height));
}

// Tiles too steep to walk are blocked, going by the heights as they'll be drawn, and so is
// what's left of the cliffs. Bridges are walked on a level up.
function blockSteepGround(build: Build): void {
    const { ground, settings, cliffs, sizeX, sizeY, corners } = build;
    const { heights, flags } = ground.level0;
    const bridges = ground.grid.levels[1].flags;
    for (let y = 0; y < sizeY; y++) {
        for (let x = 0; x < sizeX; x++) {
            const i = x + y * sizeX;
            const steep = getTileSlope(heights, corners.x, x, y) > settings.walkSlope;
            if ((steep || cliffs[i]) && !(bridges[i] & TILE_BRIDGE)) {
                flags[i] |= TILE_BLOCKED;
                ground.reserved[i] = 1;
            }
        }
    }
}

export function generateMapDetail(
    settings: GeneratorSettings,
    context: BuildContext,
): GeneratedMap {
    const error = getSettingsError(settings);
    if (error) {
        throw new Error(error);
    }
    const build = createBuild(settings, context);
    const { ground, sizeX, sizeY, biomeAt, relief, terrain, corners } = build;

    const rivers = createRivers(build);
    const fields = createWaterFields(build, rivers, relief.hills);
    const seaTiles = getTouchedTiles(fields.sea, sizeX, sizeY);
    const freshTiles = getTouchedTiles(fields.fresh, sizeX, sizeY);
    const toSea = distanceTo(seaTiles, sizeX, sizeY, 8);
    const toFresh = distanceTo(freshTiles, sizeX, sizeY, MAX_BANK);
    sinkSea(build, toSea);
    const levels = createWaterLevels(build, rivers, fields.pools, fields.fresh, fields.flood);
    sinkFresh(build, toFresh, levels);

    const waterField = fields.sea.map((value, i) => Math.max(value, fields.fresh[i]));
    const waterOverlay = biomeAt(sizeX >> 1, sizeY >> 1).water;
    const waterTiles = ground.paintField(waterField, waterOverlay, true);
    const water: WaterPaint = { field: waterField, tiles: waterTiles };
    holdWater(build, seaTiles);
    holdWater(build, freshTiles);

    if (hasRelief(settings)) {
        build.cliffs.set(shapeCliffs(terrain, settings.walkSlope));
    } else {
        limitSlope(terrain.height, corners.x, corners.y, settings.walkSlope * 0.92);
    }
    const passes = cutPasses(build);
    refreshTileHeights(build);
    paintFloors(build, toSea);

    const bridgeZone = new Uint8Array(waterTiles.length);
    const roads = new RoadNetwork(build, waterTiles, bridgeZone);
    const bridgeStarts = placeBridges(build, rivers, waterTiles, bridgeZone);
    if (settings.roads > 0) {
        layMainRoads(build, roads, bridgeZone);
        const byDistance = (a: RoadStart, b: RoadStart) =>
            Math.hypot(a.from.x - build.spawn.x, a.from.y - build.spawn.y) -
            Math.hypot(b.from.x - build.spawn.x, b.from.y - build.spawn.y);
        for (const { from, lead, height } of bridgeStarts.sort(byDistance)) {
            roads.lay(from, lead, roads.findRoute(from, lead), BRIDGE_ROAD_HALF_WIDTH, height);
        }
    }
    const buildings = placeBuildings(build, roads, waterTiles);
    placeRuins(build, roads, waterTiles);
    const steepest = settings.walkSlope * ROAD_STEEPEST;
    gradeRoads(terrain, [...roads.lines, ...passes], build.plots, ROAD_SHOULDER, steepest);
    terrain.smoothPins(ROAD_SMOOTHING);
    finishHeights(build);
    blockSteepGround(build);

    const roadTiles = settings.roads > 0 ? roads.paint() : new Uint8Array(waterTiles.length);
    const rockSkip = new Uint8Array(waterTiles.length);
    for (let i = 0; i < rockSkip.length; i++) {
        rockSkip[i] = waterTiles[i] | roadTiles[i] | ground.footprint[i] | bridgeZone[i];
    }
    const caves = placeCaves(build, paintRock(build, rockSkip));
    paintLava(build);
    placeWaterfalls(build, rivers);
    placeBoundary(build, roadTiles);
    scatter(build, waterTiles);
    const fords = connectGround(build, water, roads.offLimits);
    return {
        grid: ground.grid,
        footprint: ground.footprint,
        roadTiles,
        lines: [...roads.lines, ...fords],
        buildings,
        passes,
        walkSlope: settings.walkSlope,
        caves,
        waterfalls: rivers.flatMap((river) =>
            river.drops.map(({ along }) => {
                const across = riverCentre(river, along);
                return river.vertical ? { x: across, y: along } : { x: along, y: across };
            }),
        ),
    };
}

export function generateMap(settings: GeneratorSettings, context: BuildContext): TileGrid {
    return generateMapDetail(settings, context).grid;
}

// A generated map as a recipe, at the map squares from (mapX, mapY)
export function generatedRecipe(
    id: string,
    mapX: number,
    mapY: number,
    settings: Partial<GeneratorSettings> & { seed: number },
): MapRecipe {
    const full: GeneratorSettings = { ...DEFAULT_SETTINGS, ...settings };
    return {
        id,
        mapX,
        mapY,
        squaresX: full.squaresX + MARGIN * 2,
        squaresY: full.squaresY + MARGIN * 2,
        margin: MARGIN,
        spawn: getGeneratedSpawn(full),
        build: (context) => generateMap(full, context),
        play: {
            waveSet: full.waveSet,
            enemyDensity: full.enemyDensity,
            brightness: full.brightness,
        },
    };
}
