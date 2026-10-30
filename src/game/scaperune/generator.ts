import { Ground } from "./Ground";
import { BIOMES, BiomeDef, BiomeId } from "./biomes";
import type { Exit } from "./building";
import { TileRect, blockTile, findReachable, findStranded, getCollisionFlags } from "./collision";
import { MAP_SQUARE_SIZE, TILE_BLOCKED, TileGrid } from "./format";
import { Noise, Rng, createNoise, createRng, distanceTo, smoothField } from "./noise";
import { Point, addPathToField, findPath, smoothPath } from "./paths";
import { rotatePrefab } from "./prefab";
import {
    BRIDGE,
    BRIDGE_BANK_HEIGHT,
    BRIDGE_DECK_EAST,
    BRIDGE_DECK_ROW,
    BRIDGE_DECK_WEST,
    PREFABS,
    loadPrefab,
    stampBuilding,
} from "./prefabs";
import { BuildContext, MapRecipe } from "./recipe";

// Makes a whole map from a seed and settings. The same seed and settings give
// the same map, anywhere: everything random comes from the seed. It only uses
// what's in BIOMES, PREFABS and BRIDGE (palette.ts), so the slim cache can hold
// all that any seed could ask for. See CLAUDE.md.

export type GeneratorSettings = {
    seed: number;
    // Arena size, in map squares a side: 1, 2 or 3
    squares: number;
    biome: BiomeId;
    // 0 is land past the arena's edge; up to 1, a small island in a sea
    island: number;
    // Across the arena: 0, 1 or 2. Bridges cross them, fords where those won't fit.
    rivers: number;
    // How many, up to about 6
    ponds: number;
    // 0 is flat; 1 is big rolling hills
    hills: number;
    // 0 is none; 1 is a road to every building and bridge
    roads: number;
    // These are 0 to 1, from none to crowded
    buildings: number;
    trees: number;
    rocks: number;
};

export const DEFAULT_SETTINGS: Omit<GeneratorSettings, "seed"> = {
    squares: 2,
    biome: "meadow",
    island: 0.3,
    rivers: 0,
    ponds: 1,
    hills: 0.5,
    roads: 0.8,
    buildings: 0.5,
    trees: 0.5,
    rocks: 0.4,
};

type NumberSetting = Exclude<keyof GeneratorSettings, "biome" | "seed">;

// What each number can be, and what to call it: the map generator's screen is
// built from this
export const SETTING_LIMITS: Record<
    NumberSetting,
    { label: string; min: number; max: number; step: number }
> = {
    squares: { label: "Arena size (map squares)", min: 1, max: 3, step: 1 },
    island: { label: "Island", min: 0, max: 1, step: 0.05 },
    rivers: { label: "Rivers", min: 0, max: 2, step: 1 },
    ponds: { label: "Ponds", min: 0, max: 12, step: 1 },
    hills: { label: "Hills", min: 0, max: 1, step: 0.05 },
    roads: { label: "Roads", min: 0, max: 1, step: 0.05 },
    buildings: { label: "Buildings", min: 0, max: 1, step: 0.05 },
    trees: { label: "Trees", min: 0, max: 1, step: 0.05 },
    rocks: { label: "Rocks", min: 0, max: 1, step: 0.05 },
};

// What's wrong with some settings, or undefined
export function getSettingsError(settings: GeneratorSettings): string | undefined {
    if (!Number.isInteger(settings.seed) || settings.seed < 0) {
        return "The seed must be a whole number, 0 or more.";
    }
    if (!(settings.biome in BIOMES)) {
        return `There's no biome called ${settings.biome}.`;
    }
    for (const [name, limits] of Object.entries(SETTING_LIMITS)) {
        const value = settings[name as NumberSetting];
        if (!Number.isFinite(value) || value < limits.min || value > limits.max) {
            return `${limits.label} must be from ${limits.min} to ${limits.max}.`;
        }
        if (limits.step === 1 && !Number.isInteger(value)) {
            return `${limits.label} must be a whole number.`;
        }
    }
    return undefined;
}

// One square of scenery round the arena
const MARGIN = 1;
const RIVER_HALF_WIDTH = 4.5;
// A road's overlay, down its middle, and the underlay under it. The renderer blends
// underlays over 11 tiles, so that's a soft stain that takes the contrast out of the
// overlay's edge. On its own it's too wide and faint to read as a road.
// A half width of 1 to 1.3 on a line of tile corners fills exactly the 2 rows beside
// it (the gap in a bridge's fences), with its edges along the tiles
const ROAD_HALF_WIDTH = 1.2;
const TRAIL_HALF_WIDTH = 2;
// Tiles either side of a road that scatter keeps off
const ROAD_CLEAR_HALF_WIDTH = 1.5;
// Roads keep off walls by this many tiles, but for the door they're going to
const WALL_CLEARANCE = 3;
const ROAD_START_FROM_DOOR = 3;
// Tiles a road that leads nowhere takes to narrow away
const ROAD_TAPER = 7;
// The tightest a road can turn after a straight stretch, in tiles
const ROAD_TURN_RADIUS = 8;
const FORD_HALF_WIDTH = 2;
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
// A stranded piece of ground this big gets a ford. Smaller ones get blocked.
const MIN_STRANDED_PIECE = 150;
const MAX_FORDS = 16;
// Fewer reachable tiles than this isn't a map you can play
const MIN_PLAYABLE_TILES = 300;
const SEA_BED = 6;
const RIVER_BED = 8;
const LAND_FLOOR = 34;

const LOC_NORMAL = 10;
const LOC_FLOOR_DECORATION = 22;

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
};

export function getGeneratedSize(settings: Pick<GeneratorSettings, "squares">): number {
    return (settings.squares + MARGIN * 2) * MAP_SQUARE_SIZE;
}

// The middle of the arena: always kept open, and known without building
export function getGeneratedSpawn(settings: Pick<GeneratorSettings, "squares">): {
    x: number;
    y: number;
} {
    const middle = getGeneratedSize(settings) >> 1;
    return { x: middle, y: middle };
}

export function getGeneratedArena(settings: Pick<GeneratorSettings, "squares">): TileRect {
    const size = getGeneratedSize(settings);
    const min = MARGIN * MAP_SQUARE_SIZE;
    return { x0: min, y0: min, x1: size - min - 1, y1: size - min - 1 };
}

function pick<T>(rng: Rng, list: T[]): T {
    return list[Math.floor(rng() * list.length)];
}

function riverCentre(river: River, along: number): number {
    let away = Infinity;
    for (const crossing of river.crossings) {
        away = Math.min(away, Math.abs(along - crossing));
    }
    const straight = Math.min(Math.max(away - 10, 0) / 12, 1);
    return river.line + (river.wiggle(along / 30, 3.5) - 0.5) * 2 * river.amount * straight;
}

// The arena's edge, rounded off: tiles in from it, negative outside
function toRoundedEdge(x: number, y: number, middle: number, half: number): number {
    const radius = half * 0.6;
    const dx = Math.abs(x - middle);
    const dy = Math.abs(y - middle);
    const cornerX = dx - (half - radius);
    const cornerY = dy - (half - radius);
    if (cornerX > 0 && cornerY > 0) {
        return radius - Math.hypot(cornerX, cornerY);
    }
    return half - Math.max(dx, dy);
}

// How far in from the arena's edge the sea comes
function getCoastDepth(settings: GeneratorSettings): number {
    const half = (settings.squares * MAP_SQUARE_SIZE) / 2;
    return settings.island > 0 ? 3 + settings.island * half * 0.5 : 0;
}

function createRivers(settings: GeneratorSettings, rng: Rng, spawn: number): River[] {
    // Across the land, not out in the sea
    const half = (settings.squares * MAP_SQUARE_SIZE) / 2 - getCoastDepth(settings);
    const rivers: River[] = [];
    const firstVertical = rng() < 0.5;
    for (let i = 0; i < settings.rivers; i++) {
        const side = rng() < 0.5 ? -1 : 1;
        const count = Math.max(Math.round((half * 2) / CROSSING_SPACING), 1);
        const crossings: number[] = [];
        for (let c = 0; c < count; c++) {
            const at = spawn - half + ((c + 0.5) / count) * half * 2;
            crossings.push(Math.round(at + (rng() - 0.5) * 10));
        }
        rivers.push({
            vertical: i % 2 === 0 ? firstVertical : !firstVertical,
            line: Math.round(spawn + side * Math.max(half * (0.35 + rng() * 0.25), 13)),
            crossings,
            wiggle: createNoise(settings.seed + 100 + i, 1),
            amount: half * 0.2,
        });
    }
    return rivers;
}

// Where the water goes, as fields per tile corner: above 0 is water. Fields rather
// than tiles so that its edges can be smooth lines.
function createWaterFields(settings: GeneratorSettings, ground: Ground, rivers: River[], rng: Rng) {
    const size = ground.sizeX;
    const corners = size + 1;
    const spawn = size >> 1;
    const half = (settings.squares * MAP_SQUARE_SIZE) / 2;
    const coast = createNoise(settings.seed + 1, 2);
    const shape = createNoise(settings.seed + 2, 1);
    const sea = new Float32Array(corners * corners);
    const fresh = new Float32Array(corners * corners);

    const ponds: { x: number; y: number; radius: number }[] = [];
    for (let i = 0; i < settings.ponds; i++) {
        const angle = rng() * Math.PI * 2;
        const distance = SPAWN_CLEAR * 2 + rng() * (half * 0.8 - SPAWN_CLEAR * 2);
        ponds.push({
            x: spawn + Math.cos(angle) * distance,
            y: spawn + Math.sin(angle) * distance,
            radius: 4 + rng() * 6,
        });
    }

    const depth = getCoastDepth(settings);
    for (let y = 0; y < corners; y++) {
        for (let x = 0; x < corners; x++) {
            const i = x + y * corners;
            const wobble = (coast(x / 24, y / 24) - 0.5) * 22;
            sea[i] = settings.island > 0 ? depth - toRoundedEdge(x, y, spawn, half) - wobble : -100;
            let water = -100;
            for (const river of rivers) {
                const [along, across] = river.vertical ? [y, x] : [x, y];
                const distance = Math.abs(across - riverCentre(river, along));
                water = Math.max(water, RIVER_HALF_WIDTH - distance);
            }
            for (const pond of ponds) {
                const edge = pond.radius + (shape(x / 12, y / 12) - 0.5) * 6;
                water = Math.max(water, edge - Math.hypot(x - pond.x, y - pond.y));
            }
            fresh[i] = water;
        }
    }
    const smooth = (field: Float32Array) => {
        const out = smoothField(field, corners, corners, 3);
        // Nothing round the spawn
        for (let y = 0; y < corners; y++) {
            for (let x = 0; x < corners; x++) {
                const away = Math.hypot(x - spawn, y - spawn) - SPAWN_CLEAR;
                out[x + y * corners] = Math.min(out[x + y * corners], away);
            }
        }
        return out;
    };
    return { sea: smooth(sea), fresh: smooth(fresh) };
}

// The tiles a corner field has anything of
function getTouchedTiles(field: Float32Array, size: number): Uint8Array {
    const corners = size + 1;
    const tiles = new Uint8Array(size * size);
    for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
            const at = x + y * corners;
            tiles[x + y * size] =
                field[at] > 0 ||
                field[at + 1] > 0 ||
                field[at + corners] > 0 ||
                field[at + corners + 1] > 0
                    ? 1
                    : 0;
        }
    }
    return tiles;
}

function paintHeights(
    settings: GeneratorSettings,
    ground: Ground,
    toSea: Float32Array,
    toFresh: Float32Array,
): void {
    const size = ground.sizeX;
    const hills = createNoise(settings.seed + 3);
    const amount = 8 + settings.hills * 90;
    const span = 20 + settings.hills * 16;
    for (let y = 0; y <= size; y++) {
        for (let x = 0; x <= size; x++) {
            const i = ground.tile(Math.min(x, size - 1), Math.min(y, size - 1));
            let height = Math.max(50 + (hills(x / span, y / span) - 0.5) * amount, LAND_FLOOR);
            height = RIVER_BED + (height - RIVER_BED) * Math.min(toFresh[i] / 6, 1);
            height = SEA_BED + (height - SEA_BED) * Math.min(toSea[i] / 8, 1);
            ground.setHeight(x, y, height);
        }
    }
}

function paintFloors(
    settings: GeneratorSettings,
    biome: BiomeDef,
    ground: Ground,
    toSea: Float32Array,
): void {
    const patches = createNoise(settings.seed + 4);
    const count = biome.ground.length;
    for (let y = 0; y < ground.sizeY; y++) {
        for (let x = 0; x < ground.sizeX; x++) {
            const i = ground.tile(x, y);
            // The noise bunches round the middle, so stretch it
            const patch = Math.min(Math.max((patches(x / 14, y / 14) - 0.3) / 0.4, 0), 0.999);
            ground.level0.underlays[i] =
                toSea[i] < 4 ? biome.shore : biome.ground[Math.floor(patch * count)];
        }
    }
}

// The tiles that only hide the ground under the bridge's ends, which is the one
// floor it needs at ground level: the rest is ours, river and road
const BRIDGE_HIDDEN_FLOOR = 61;

// How a road leaves something: dead straight along these points, in tile corners, to
// where it's free to find its way from (from, a tile)
type RoadStart = { from: Point; lead: Point[] };

// Bridges where rivers can take one. Returns a road start for each end of each.
function placeBridges(
    context: BuildContext,
    ground: Ground,
    rivers: River[],
    water: Uint8Array,
    arena: TileRect,
): RoadStart[] {
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
                return (
                    inArena(p) &&
                    inArena(q) &&
                    !water[ground.tile(p.x, p.y)] &&
                    !water[ground.tile(q.x, q.y)]
                );
            };
            let fits = true;
            for (let distance = deckFar + 1; distance <= straight + 1; distance++) {
                fits &&= onLand(distance);
            }
            for (let distance = deckNear - 2; distance >= -straight - 2; distance--) {
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
            if (river.vertical) {
                ground.stamp(prefab, river.line - middle, stampAt, options);
            } else {
                ground.stamp(turned, stampAt, river.line - middle, options);
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
                    }
                }
                starts.push({ from: across(end + way), lead });
            }
        }
    }
    return starts;
}

type Plot = { x: number; y: number; sizeX: number; sizeY: number; exit?: Exit };

function placeBuildings(
    settings: GeneratorSettings,
    biome: BiomeDef,
    context: BuildContext,
    ground: Ground,
    rng: Rng,
    water: Uint8Array,
    spawn: number,
): Plot[] {
    const half = (settings.squares * MAP_SQUARE_SIZE) / 2;
    const wanted = Math.round(settings.buildings * settings.squares * settings.squares * 3);
    const plots: Plot[] = [];
    for (let attempt = 0; attempt < wanted * 40 && plots.length < wanted; attempt++) {
        const def = PREFABS[pick(rng, biome.buildings)];
        const turns = Math.floor(rng() * 4);
        const sizeX = turns & 1 ? def.sizeY : def.sizeX;
        const sizeY = turns & 1 ? def.sizeX : def.sizeY;
        const angle = rng() * Math.PI * 2;
        const distance = SPAWN_CLEAR + 8 + rng() * (half - SPAWN_CLEAR - 8);
        const x = Math.round(spawn + Math.cos(angle) * distance - sizeX / 2);
        const y = Math.round(spawn + Math.sin(angle) * distance - sizeY / 2);
        const clear = 3;
        let fits = true;
        for (let ty = y - clear; ty < y + sizeY + clear && fits; ty++) {
            for (let tx = x - clear; tx < x + sizeX + clear && fits; tx++) {
                const i = ground.tile(tx, ty);
                fits =
                    ground.inside(tx, ty) &&
                    !water[i] &&
                    !ground.reserved[i] &&
                    Math.hypot(tx - spawn, ty - spawn) > SPAWN_CLEAR;
            }
        }
        if (!fits) {
            continue;
        }
        const exit = stampBuilding(ground, context, def, turns, x, y, spawn, spawn);
        plots.push({ x, y, sizeX, sizeY, exit });
    }
    return plots;
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

// Runs a road that leads nowhere on past its end, narrowing away to nothing, so that it
// fades into the ground instead of stopping square
function taperRoad(trail: Float32Array, corners: number, line: Point[]): void {
    const end = line[line.length - 1];
    const before = line[line.length - 2];
    const length = Math.hypot(end.x - before.x, end.y - before.y);
    const wayX = (end.x - before.x) / length;
    const wayY = (end.y - before.y) / length;
    // The trail's half width where the road's overlay has narrowed to nothing
    const tip = TRAIL_HALF_WIDTH - ROAD_HALF_WIDTH;
    for (let step = 0; step < ROAD_TAPER; step++) {
        const halfWidth = TRAIL_HALF_WIDTH + ((tip - TRAIL_HALF_WIDTH) * (step + 1)) / ROAD_TAPER;
        const from = { x: end.x + wayX * step, y: end.y + wayY * step };
        const to = { x: from.x + wayX, y: from.y + wayY };
        addPathToField(trail, corners, corners, [from, to], halfWidth);
    }
}

function placeRoads(
    settings: GeneratorSettings,
    biome: BiomeDef,
    ground: Ground,
    rng: Rng,
    water: Uint8Array,
    buildings: Uint8Array,
    bridgeStarts: RoadStart[],
    plots: Plot[],
    spawn: number,
): void {
    if (settings.roads <= 0) {
        return;
    }
    const size = ground.sizeX;
    const corners = size + 1;
    const roads = new Uint8Array(water.length);
    const wiggle = createNoise(settings.seed + 5, 1);
    const toWalls = distanceTo(buildings, size, size, WALL_CLEARANCE + 1);
    roads[ground.tile(spawn, spawn)] = 1;
    // Nearest first, bridges before doors, so doors over a river can join the road
    // at the bridge
    const byDistance = (a: RoadStart, b: RoadStart) =>
        Math.hypot(a.from.x - spawn, a.from.y - spawn) -
        Math.hypot(b.from.x - spawn, b.from.y - spawn);
    const doors: RoadStart[] = [];
    for (const { exit } of plots) {
        if (exit && rng() < settings.roads) {
            // Straight out of the door, so that's how the road arrives
            const lead: Point[] = [];
            for (let step = 0; step <= ROAD_START_FROM_DOOR; step++) {
                lead.push({ x: exit.x + exit.outX * step, y: exit.y + exit.outY * step });
            }
            const end = lead[lead.length - 1];
            doors.push({ from: { x: Math.floor(end.x), y: Math.floor(end.y) }, lead });
        }
    }
    const starts = [...[...bridgeStarts].sort(byDistance), ...doors.sort(byDistance)];
    // Roads go round water and buildings, keep off walls, and join up where they meet
    const cost = (x: number, y: number) => {
        const i = ground.tile(x, y);
        if (water[i] || ground.reserved[i]) {
            return Infinity;
        }
        const nearWall = Math.max(WALL_CLEARANCE - toWalls[i], 0) * 3;
        return (roads[i] ? 0.2 : 1 + wiggle(x / 14, y / 14) * 2) + nearWall;
    };
    const trail = new Float32Array(corners * corners).fill(-4);
    for (const { from, lead } of starts) {
        const isRoad = (i: number) => roads[i] !== 0;
        const inTurn = getTurningCircles(lead);
        const turning = (x: number, y: number) => (inTurn(x, y) ? Infinity : cost(x, y));
        // Somewhere too tight for a wide turn makes do with a sharp one
        let tiles = findPath(size, size, from, turning, isRoad);
        if (tiles.length === 0) {
            tiles = findPath(size, size, from, cost, isRoad);
        }
        for (const i of tiles) {
            roads[i] = 1;
        }
        // Found from the far end back. With nothing to join, as on a bridge's far bank,
        // it's a stub for others to join.
        roads[ground.tile(from.x, from.y)] = 1;
        const onward = tiles
            .map((i) => ({ x: (i % size) + 0.5, y: Math.floor(i / size) + 0.5 }))
            .reverse();
        const line = smoothPath([...lead, ...onward], 7, 7, lead.length);
        addPathToField(trail, corners, corners, line, TRAIL_HALF_WIDTH);
        if (onward.length === 0) {
            taperRoad(trail, corners, line);
        }
    }
    const road = trail.map((value) => value - TRAIL_HALF_WIDTH + ROAD_HALF_WIDTH);
    const clearing = trail.map((value) => value - TRAIL_HALF_WIDTH + ROAD_CLEAR_HALF_WIDTH);
    const skip = new Uint8Array(water.length);
    for (let i = 0; i < skip.length; i++) {
        skip[i] = water[i] | buildings[i];
    }
    const band = getTouchedTiles(trail, size);
    const clear = getTouchedTiles(clearing, size);
    for (let i = 0; i < band.length; i++) {
        if (band[i] && !skip[i]) {
            ground.level0.underlays[i] = biome.trail;
        }
        if (clear[i]) {
            ground.reserved[i] = 1;
        }
    }
    ground.paintField(smoothField(road, corners, corners, 1), biome.road, false, skip);
}

function scatter(
    settings: GeneratorSettings,
    biome: BiomeDef,
    context: BuildContext,
    ground: Ground,
    rng: Rng,
    water: Uint8Array,
    arena: TileRect,
    spawn: number,
): void {
    const clumps = createNoise(settings.seed + 6);
    const place = (id: number, size: number, type: number, x: number, y: number) => {
        ground.place({ id, type, rotation: Math.floor(rng() * 4), level: 0, x, y }, size, size);
    };
    const reach = 24;
    for (let y = arena.y0 - reach; y <= arena.y1 + reach; y++) {
        for (let x = arena.x0 - reach; x <= arena.x1 + reach; x++) {
            const roll = rng();
            const i = ground.tile(x, y);
            if (water[i] || ground.level0.flags[i] & TILE_BLOCKED) {
                continue;
            }
            if (Math.hypot(x - spawn, y - spawn) < SPAWN_CLEAR) {
                continue;
            }
            const clump = clumps(x / 14, y / 14);
            const treeChance = settings.trees * (clump > 0.56 ? 0.28 : 0.03);
            const rockChance = settings.rocks * (clump < 0.44 ? 0.025 : 0.006);
            if (roll < treeChance) {
                const [id, size] = pick(rng, biome.trees);
                // A tile's gap all round: this game needs room to run, and big
                // trees packed tight are a wall with dead ends
                if (ground.isClear(x - 1, y - 1, size + 2, size + 2)) {
                    place(id, size, LOC_NORMAL, x, y);
                }
            } else if (roll < treeChance + rockChance) {
                const [id, size] = pick(rng, biome.rocks);
                if (ground.isClear(x, y, size, size)) {
                    place(id, size, LOC_NORMAL, x, y);
                }
            } else if (roll > 0.72 && ground.isClear(x, y, 1, 1)) {
                ground.grid.locs.push({
                    id: pick(rng, biome.decor),
                    type: LOC_FLOOR_DECORATION,
                    rotation: Math.floor(rng() * 4),
                    level: 0,
                    x,
                    y,
                });
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
function layFord(
    biome: BiomeDef,
    ground: Ground,
    path: number[],
    water: WaterPaint,
    buildings: Uint8Array,
): void {
    const size = ground.sizeX;
    const points = path.map((i) => ({ x: (i % size) + 0.5, y: Math.floor(i / size) + 0.5 }));
    const line = smoothPath(points, 3, 3);
    const band = new Float32Array((size + 1) * (size + 1)).fill(-4);
    addPathToField(band, size + 1, size + 1, line, FORD_HALF_WIDTH);
    for (let i = 0; i < band.length; i++) {
        water.field[i] = Math.min(water.field[i], -band[i]);
    }
    const ford = getTouchedTiles(band, size);
    for (let i = 0; i < ford.length; i++) {
        if (ford[i] && !buildings[i]) {
            ground.level0.underlays[i] = biome.shore;
            ground.reserved[i] = 1;
        }
    }
    ground.clearOverlay(water.tiles);
    water.tiles = ground.paintField(water.field, biome.water, true);
    ground.grid.locs = ground.grid.locs.filter(
        (loc) =>
            !ford[ground.tile(loc.x, loc.y)] ||
            loc.level !== 0 ||
            buildings[ground.tile(loc.x, loc.y)],
    );
}

// Every open tile left must be reachable from the spawn: big pieces get a ford,
// and whatever's still cut off is blocked. Nobody can get next to a blocked tile
// from the other side, so it's never an invisible wall.
function connectGround(
    biome: BiomeDef,
    context: BuildContext,
    ground: Ground,
    arena: TileRect,
    spawn: number,
    water: WaterPaint,
    buildings: Uint8Array,
): void {
    const { grid, sizeX, sizeY } = ground;
    let flags = getCollisionFlags(grid, context.locs);
    let reached = findReachable(flags, sizeX, sizeY, arena, spawn, spawn);
    for (let fords = 0; fords < MAX_FORDS; fords++) {
        const stranded = findStranded(flags, sizeX, arena, reached);
        const piece = groupTiles(stranded, sizeX)[0];
        if (!piece || piece.length < MIN_STRANDED_PIECE) {
            break;
        }
        const at = piece[0];
        const start = { x: at % sizeX, y: Math.floor(at / sizeX) };
        const cost = (x: number, y: number) => {
            const inArena = x >= arena.x0 && y >= arena.y0 && x <= arena.x1 && y <= arena.y1;
            return inArena && !buildings[ground.tile(x, y)] ? 1 : Infinity;
        };
        const path = findPath(sizeX, sizeY, start, cost, (i) => reached[i] !== 0);
        if (path.length === 0) {
            break;
        }
        layFord(biome, ground, path, water, buildings);
        flags = getCollisionFlags(grid, context.locs);
        reached = findReachable(flags, sizeX, sizeY, arena, spawn, spawn);
    }
    for (const i of findStranded(flags, sizeX, arena, reached)) {
        blockTile(grid, i);
    }
    if (reached.reduce((sum, tile) => sum + tile, 0) < MIN_PLAYABLE_TILES) {
        throw new Error("These settings leave too little ground to play on.");
    }
}

export function generateMap(settings: GeneratorSettings, context: BuildContext): TileGrid {
    const error = getSettingsError(settings);
    if (error) {
        throw new Error(error);
    }
    const size = getGeneratedSize(settings);
    const spawn = size >> 1;
    const arena = getGeneratedArena(settings);
    const biome = BIOMES[settings.biome];
    const rng = createRng(settings.seed);
    const ground = new Ground(size, size);

    const rivers = createRivers(settings, rng, spawn);
    const fields = createWaterFields(settings, ground, rivers, rng);
    const seaTiles = getTouchedTiles(fields.sea, size);
    const freshTiles = getTouchedTiles(fields.fresh, size);
    const toSea = distanceTo(seaTiles, size, size, 8);
    const toFresh = distanceTo(freshTiles, size, size, 6);
    paintHeights(settings, ground, toSea, toFresh);
    paintFloors(settings, biome, ground, toSea);

    const waterField = fields.sea.map((value, i) => Math.max(value, fields.fresh[i]));
    const waterTiles = ground.paintField(waterField, biome.water, true);
    const water: WaterPaint = { field: waterField, tiles: waterTiles };

    const bridgeStarts = placeBridges(context, ground, rivers, waterTiles, arena);
    const beforeBuildings = ground.reserved.slice();
    const plots = placeBuildings(settings, biome, context, ground, rng, waterTiles, spawn);
    const buildings = ground.reserved.map((v, i) => v & ~beforeBuildings[i]);
    placeRoads(settings, biome, ground, rng, waterTiles, buildings, bridgeStarts, plots, spawn);
    scatter(settings, biome, context, ground, rng, waterTiles, arena, spawn);
    connectGround(biome, context, ground, arena, spawn, water, buildings);
    return ground.grid;
}

// A generated map as a recipe, at the map squares from (mapX, mapY)
export function generatedRecipe(
    id: string,
    mapX: number,
    mapY: number,
    settings: Partial<GeneratorSettings> & { seed: number },
): MapRecipe {
    const full: GeneratorSettings = { ...DEFAULT_SETTINGS, ...settings };
    const squares = full.squares + MARGIN * 2;
    return {
        id,
        mapX,
        mapY,
        squaresX: squares,
        squaresY: squares,
        margin: MARGIN,
        spawn: getGeneratedSpawn(full),
        build: (context) => generateMap(full, context),
    };
}
