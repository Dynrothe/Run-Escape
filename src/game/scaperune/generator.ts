import { Ground } from "./Ground";
import { BIOMES, BiomeDef } from "./biomes";
import type { Exit } from "./building";
import { TileRect, blockTile, findReachable, findStranded, getCollisionFlags } from "./collision";
import { MAP_SQUARE_SIZE, TILE_BLOCKED, TileGrid } from "./format";
import { Noise, Rng, createNoise, createRng, distanceTo, smoothField } from "./noise";
import { PathFinder, Point, addPathToField, smoothPath } from "./paths";
import { rotatePrefab } from "./prefab";
import {
    BRIDGE,
    BRIDGE_BANK_HEIGHT,
    BRIDGE_DECK_EAST,
    BRIDGE_DECK_ROW,
    BRIDGE_DECK_WEST,
    PREFABS,
    PrefabKit,
    isBuildingKind,
    loadPrefab,
} from "./prefabs";
import { BuildContext, MapRecipe } from "./recipe";
import { DEFAULT_SETTINGS, GeneratorSettings, getSettingsError } from "./settings";

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
const BRIDGE_ROAD_CLEAR = 3;
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
const RIVER_BED = 8;
const LAND_FLOOR = 34;
// Tiles between a building and anything else
const BUILDING_CLEAR = 3;
// A fenced yard stands this far off a building's walls
const YARD_GAP = 2;
const FENCE = 980;

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
};

// A road, as laid, for checking. lead is how many of its first points run straight out
// of something and can be next to it.
export type RoadLine = { points: Point[]; lead: number; halfWidth: number };

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

function riverCentre(river: River, along: number): number {
    const straight = riverStraightness(river, along);
    return river.line + (river.wiggle(along / 30, 3.5) - 0.5) * 2 * river.amount * straight;
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
        });
    }
    return rivers;
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
    const rough = settings.shoreRoughness;
    const coast = createNoise(settings.seed + 1, rough > 0.7 ? 3 : 2);
    const shape = createNoise(settings.seed + 2, 1);
    const count = corners.x * corners.y;
    const sea = new Float32Array(count).fill(-100);
    const fresh = new Float32Array(count).fill(-100);

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
    return { sea: smooth(sea), fresh: smooth(fresh) };
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

// How high the ground rises into a boundary of hills, 0 to 1
function getHillBoundaryRise(build: Build, x: number, y: number): number {
    const { settings, toEdge } = build;
    if (settings.boundary !== "hills") {
        return 0;
    }
    return smoothstep((settings.boundaryDepth - toEdge(x, y)) / (settings.boundaryDepth + 24));
}

function paintHeights(
    build: Build,
    hills: Noise,
    toSea: Float32Array,
    toFresh: Float32Array,
): void {
    const { settings, ground, sizeX, sizeY, corners } = build;
    const amount = 8 + settings.hills * 260;
    const base = 56 + settings.hills * 30;
    for (let y = 0; y < corners.y; y++) {
        for (let x = 0; x < corners.x; x++) {
            const i = ground.tile(Math.min(x, sizeX - 1), Math.min(y, sizeY - 1));
            const noise = hills(x / settings.hillScale, y / settings.hillScale) - 0.5;
            let height = Math.max(base + noise * amount, LAND_FLOOR);
            height += getHillBoundaryRise(build, x, y) * 150;
            height = RIVER_BED + (height - RIVER_BED) * Math.min(toFresh[i] / 6, 1);
            height = SEA_BED + (height - SEA_BED) * Math.min(toSea[i] / 8, 1);
            ground.setHeight(x, y, height);
        }
    }
}

function paintFloors(build: Build, toSea: Float32Array): void {
    const { settings, ground, sizeX, sizeY, biomeAt } = build;
    const patches = createNoise(settings.seed + 4);
    const span = settings.groundPatches;
    for (let y = 0; y < sizeY; y++) {
        for (let x = 0; x < sizeX; x++) {
            const biome = biomeAt(x, y);
            const i = ground.tile(x, y);
            // The noise bunches round the middle, so stretch it
            const patch = Math.min(Math.max((patches(x / span, y / span) - 0.3) / 0.4, 0), 0.999);
            let floor = biome.ground[Math.floor(patch * biome.ground.length)];
            if (getHillBoundaryRise(build, x, y) > 0.08) {
                floor = biome.hillGround;
            }
            ground.level0.underlays[i] = toSea[i] < 4 ? biome.shore : floor;
        }
    }
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
    // Every few tiles of road, to find the nearest. Not the spawn: that's no road.
    private readonly samples: Point[] = [];
    private readonly road: Float32Array;
    private readonly trail: Float32Array;
    private readonly wiggle: Noise;
    private readonly curves: number;

    constructor(
        readonly build: Build,
        readonly water: Uint8Array,
    ) {
        const { ground, corners, settings, spawn } = build;
        this.tiles = new Uint8Array(ground.sizeX * ground.sizeY);
        this.offLimits = new Uint8Array(this.tiles.length);
        this.halfWidth = settings.roadWidth / 2;
        this.road = new Float32Array(corners.x * corners.y).fill(-4);
        this.trail = new Float32Array(corners.x * corners.y).fill(-4);
        this.wiggle = createNoise(settings.seed + 5, 1);
        this.curves = settings.roadCurviness;
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
            this.wiggle(x / lerp(24, 7, this.curves), y / lerp(24, 7, this.curves)) *
                this.curves *
                9
        );
    }

    private touchesBuilding(points: Point[], from: number): boolean {
        const { ground } = this.build;
        let touches = false;
        forTilesNear(this.build, points.slice(from), this.halfWidth + 0.5, (i) => {
            touches ||= ground.footprint[i] !== 0;
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
        points.forEach((point, i) => {
            if (i % 3 === 0) {
                this.samples.push(point);
            }
        });
    }

    // The way from a road's start to the rest of the roads: its tiles, or nothing
    findRoute(from: Point, lead: Point[]): number[] {
        const { finder } = this.build;
        const isRoad = (i: number) => this.tiles[i] !== 0;
        const free = (x: number, y: number) => this.cost(x, y);
        const inTurn = getTurningCircles(lead);
        const turning = (x: number, y: number) => (inTurn(x, y) ? Infinity : free(x, y));
        // Somewhere too tight for a wide turn makes do with a sharp one
        const wide = finder.find(from, turning, isRoad);
        return wide.length > 0 ? wide : finder.find(from, free, isRoad);
    }

    // Lays a road out of something along a route, as findRoute found it. With no route
    // it leads nowhere, and narrows away into the ground.
    lay(from: Point, lead: Point[], route: number[], leadHalfWidth: number): void {
        const { ground, sizeX } = this.build;
        this.tiles[ground.tile(from.x, from.y)] = 1;
        // Found from the far end back
        const onward = route
            .map((i) => ({ x: (i % sizeX) + 0.5, y: Math.floor(i / sizeX) + 0.5 }))
            .reverse();

        // As smooth as it'll go without drifting onto a building
        const raw = [...lead, ...onward];
        const reach = Math.round(lerp(9, 5, this.curves));
        let points = smoothPath(raw, reach, 7, lead.length);
        for (const [tryReach, passes] of [
            [4, 3],
            [2, 1],
        ]) {
            if (this.touchesBuilding(points, lead.length)) {
                points = smoothPath(raw, tryReach, passes, lead.length);
            }
        }
        if (this.touchesBuilding(points, lead.length)) {
            points = raw;
        }

        const width = (i: number) =>
            i < lead.length
                ? leadHalfWidth
                : lerp(leadHalfWidth, this.halfWidth, Math.min((i - lead.length) / ROAD_WIDEN, 1));
        this.add({ points, lead: lead.length, halfWidth: this.halfWidth }, width, true);
        if (onward.length === 0) {
            this.taper(points, leadHalfWidth);
        }
    }

    // Lays a road along a line, leaving out where it can't go, for others to join
    addMainRoad(line: Point[], skip: Uint8Array): void {
        const { ground } = this.build;
        const width = () => this.halfWidth;
        let run: Point[] = [];
        const finish = () => {
            if (run.length > 3) {
                this.add({ points: run, lead: 0, halfWidth: this.halfWidth }, width, true);
                for (const point of run) {
                    this.tiles[ground.tile(Math.floor(point.x), Math.floor(point.y))] = 1;
                }
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
type RoadStart = { from: Point; lead: Point[] };

// Bridges where rivers can take one. Returns a road start for each end of each, and
// marks where main roads must keep off them.
function placeBridges(
    build: Build,
    rivers: River[],
    water: Uint8Array,
    zone: Uint8Array,
): RoadStart[] {
    const { context, ground, arena } = build;
    const starts: RoadStart[] = [];
    const prefab = loadPrefab(context, BRIDGE);
    const turned = rotatePrefab(prefab, 1, context.locs);
    const middle = BRIDGE.sizeX >> 1;
    const straight = middle + BRIDGE_ROAD_STRAIGHT;
    for (const river of rivers) {
        for (const crossing of river.crossings) {
            // Tile corners along the bridge's middle line, by distance from the river's
            // middle. Turning a prefab mirrors it along its length.
            const across = (distance: number): Point =>
                river.vertical
                    ? { x: river.line + distance, y: crossing }
                    : { x: crossing, y: river.line + distance };
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
                (other) =>
                    other !== river && Math.abs(crossing - riverCentre(other, river.line)) < 26,
            );
            if (!fits || crossesOther) {
                continue;
            }
            const near = across(deckNear - 3);
            const far = across(deckFar + 3);
            const height = Math.max(
                (ground.getHeight(near.x, near.y) + ground.getHeight(far.x, far.y)) / 2,
                BRIDGE_BANK_HEIGHT,
            );
            const options = {
                floor: (overlay: number) => overlay === BRIDGE_HIDDEN_FLOOR,
                feather: 5,
                flatten: false,
                height,
                anchor: BRIDGE_BANK_HEIGHT,
                keepUnderlays: true,
            };
            const stampAt = crossing - BRIDGE_DECK_ROW;
            const bridge = river.vertical ? prefab : turned;
            const stampX = river.vertical ? river.line - middle : stampAt;
            const stampY = river.vertical ? stampAt : river.line - middle;
            ground.stamp(bridge, stampX, stampY, options);
            for (let y = stampY; y < stampY + bridge.sizeY; y++) {
                for (let x = stampX; x < stampX + bridge.sizeX; x++) {
                    zone[ground.tile(x, y)] = 1;
                }
            }
            for (const [deck, end, way] of [
                [deckNear, -straight, -1],
                [deckFar, straight, 1],
            ]) {
                const lead: Point[] = [];
                for (let distance = deck; distance !== end + way; distance += way) {
                    const p = across(distance);
                    lead.push(p);
                    // Nothing goes on the road's rows or close by: no buildings or
                    // trees, nor roads doubling back beside it
                    for (let row = -BRIDGE_ROAD_CLEAR - 1; row <= BRIDGE_ROAD_CLEAR; row++) {
                        const x = river.vertical ? p.x : p.x + row;
                        const y = river.vertical ? p.y + row : p.y;
                        ground.reserved[ground.tile(x, y)] = 1;
                        zone[ground.tile(x, y)] = 1;
                    }
                }
                starts.push({ from: across(end + way), lead });
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

function getTownCentres(build: Build): Point[] {
    const { settings, arena, rng } = build;
    const centres: Point[] = [];
    const inset = Math.min(20, (arena.x1 - arena.x0) >> 2);
    for (let i = 0; i < settings.towns; i++) {
        centres.push({
            x: lerp(arena.x0 + inset, arena.x1 - inset, rng()),
            y: lerp(arena.y0 + inset, arena.y1 - inset, rng()),
        });
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
    const { settings, ground, spawn, toEdge } = build;
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
                ground.reserved[i] ||
                Math.hypot(tx - spawn.x, ty - spawn.y) <= SPAWN_CLEAR
            ) {
                return false;
            }
        }
    }
    return true;
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
        kit.stamp(ground, name, turns, x, y);
        if (rng() < settings.gardens) {
            placeYard(build, plot);
        }
        if (wantsRoad) {
            roads.lay(from, lead, route, roads.halfWidth);
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
            kit.stampRuin(ground, name, turns, x, y, rng);
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
    const { settings, ground, rng, arena, spawn, biomeAt, toEdge, sizeX, sizeY } = build;
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
            const treeChance = inBelt ? 0.5 : settings.trees * density;
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
            } else if (roll < treeChance + rockChance + settings.grass * 0.56) {
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
                rng() < settings.flowers * 0.4 &&
                flowerPatches(x / 9, y / 9) > 0.55 &&
                ground.isClear(x, y, 1, 1)
            ) {
                place(pick(rng, biome.flowers), 1, LOC_NORMAL, x, y);
            }
        }
    }
}

// Pieces of a list of tiles, joined by touching sides
function groupTiles(tiles: number[], sizeX: number): number[][] {
    const left = new Set(tiles);
    const pieces: number[][] = [];
    for (const start of tiles) {
        if (!left.delete(start)) {
            continue;
        }
        const piece = [start];
        for (let at = 0; at < piece.length; at++) {
            const i = piece[at];
            for (const j of [i - 1, i + 1, i - sizeX, i + sizeX]) {
                if (left.delete(j)) {
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
    const { ground, context, arena, spawn, finder } = build;
    const { grid, sizeX, sizeY } = ground;
    const fords: RoadLine[] = [];
    let flags = getCollisionFlags(grid, context.locs);
    let reached = findReachable(flags, sizeX, sizeY, arena, spawn.x, spawn.y);
    for (let count = 0; count < MAX_FORDS; count++) {
        const stranded = findStranded(flags, sizeX, arena, reached);
        const piece = groupTiles(stranded, sizeX)[0];
        if (!piece || piece.length < MIN_STRANDED_PIECE) {
            break;
        }
        const at = piece[0];
        const start = { x: at % sizeX, y: Math.floor(at / sizeX) };
        const cost = (x: number, y: number) => {
            const inArena = x >= arena.x0 && y >= arena.y0 && x <= arena.x1 && y <= arena.y1;
            return inArena && !offLimits[ground.tile(x, y)] ? 1 : Infinity;
        };
        const path = finder.find(start, cost, (i) => reached[i] !== 0);
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
    return {
        settings,
        context,
        ground: new Ground(sizeX, sizeY),
        rng: createRng(settings.seed),
        finder: new PathFinder(sizeX, sizeY),
        kit: new PrefabKit(context),
        sizeX,
        sizeY,
        corners: { x: sizeX + 1, y: sizeY + 1 },
        spawn: getGeneratedSpawn(settings),
        arena,
        biomeAt: hasSecond
            ? (x, y) => (regions(x / 60, y / 60) < secondLine ? second : first)
            : () => first,
        toEdge: (x, y) => Math.min(x - arena.x0, arena.x1 + 1 - x, y - arena.y0, arena.y1 + 1 - y),
    };
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
    const { ground, sizeX, sizeY, biomeAt } = build;
    const hills = createNoise(settings.seed + 3);

    const rivers = createRivers(build);
    const fields = createWaterFields(build, rivers, hills);
    const seaTiles = getTouchedTiles(fields.sea, sizeX, sizeY);
    const freshTiles = getTouchedTiles(fields.fresh, sizeX, sizeY);
    const toSea = distanceTo(seaTiles, sizeX, sizeY, 8);
    const toFresh = distanceTo(freshTiles, sizeX, sizeY, 6);
    paintHeights(build, hills, toSea, toFresh);
    paintFloors(build, toSea);

    const waterField = fields.sea.map((value, i) => Math.max(value, fields.fresh[i]));
    const waterOverlay = biomeAt(sizeX >> 1, sizeY >> 1).water;
    const waterTiles = ground.paintField(waterField, waterOverlay, true);
    const water: WaterPaint = { field: waterField, tiles: waterTiles };

    const roads = new RoadNetwork(build, waterTiles);
    const bridgeZone = new Uint8Array(waterTiles.length);
    const bridgeStarts = placeBridges(build, rivers, waterTiles, bridgeZone);
    if (settings.roads > 0) {
        layMainRoads(build, roads, bridgeZone);
        const byDistance = (a: RoadStart, b: RoadStart) =>
            Math.hypot(a.from.x - build.spawn.x, a.from.y - build.spawn.y) -
            Math.hypot(b.from.x - build.spawn.x, b.from.y - build.spawn.y);
        for (const { from, lead } of bridgeStarts.sort(byDistance)) {
            roads.lay(from, lead, roads.findRoute(from, lead), BRIDGE_ROAD_HALF_WIDTH);
        }
    }
    const buildings = placeBuildings(build, roads, waterTiles);
    placeRuins(build, roads, waterTiles);
    const roadTiles = settings.roads > 0 ? roads.paint() : new Uint8Array(waterTiles.length);
    placeBoundary(build, roadTiles);
    scatter(build, waterTiles);
    const fords = connectGround(build, water, roads.offLimits);
    return {
        grid: ground.grid,
        footprint: ground.footprint,
        roadTiles,
        lines: [...roads.lines, ...fords],
        buildings,
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
