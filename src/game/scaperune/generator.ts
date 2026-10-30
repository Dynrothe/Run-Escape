import { Ground } from "./Ground";
import { BIOMES, BiomeDef, BiomeId } from "./biomes";
import { TileRect, blockTile, findReachable, findStranded, getCollisionFlags } from "./collision";
import { MAP_SQUARE_SIZE, PlacedLoc, TILE_BLOCKED, TileGrid } from "./format";
import { Noise, Rng, createNoise, createRng, distanceTo } from "./noise";
import { findPath } from "./paths";
import { rotatePrefab } from "./prefab";
import { BRIDGE, BRIDGE_BANK_HEIGHT, BRIDGE_WATER, PREFABS, loadPrefab } from "./prefabs";
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

// One square of scenery round the arena
const MARGIN = 1;
const RIVER_HALF_WIDTH = 4.5;
// Crossings are at most this far apart, so that wherever you are one's inside
// the flow field's window (48 tiles each way)
const CROSSING_SPACING = 60;
// Tiles round the spawn kept clear of water and scenery
const SPAWN_CLEAR = 7;
// A stranded piece of ground this big gets a ford. Smaller ones get blocked.
const MIN_STRANDED_PIECE = 150;
const MAX_FORDS = 16;
const SEA_BED = 6;
const RIVER_BED = 8;
const LAND_FLOOR = 34;
const BUILDING_FEATHER = 4;

const LOC_NORMAL = 10;
const LOC_FLOOR_DECORATION = 22;

const DOOR_NAME = /\b(door|gate)\b/i;

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
    return river.line + (river.wiggle(along / 24, 3.5) - 0.5) * 2 * river.amount * straight;
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
            wiggle: createNoise(settings.seed + 100 + i),
            amount: half * 0.2,
        });
    }
    return rivers;
}

function paintMasks(settings: GeneratorSettings, ground: Ground, rivers: River[], rng: Rng) {
    const size = ground.sizeX;
    const spawn = size >> 1;
    const half = (settings.squares * MAP_SQUARE_SIZE) / 2;
    const coast = createNoise(settings.seed + 1);
    const shape = createNoise(settings.seed + 2);
    const sea = new Uint8Array(size * size);
    const fresh = new Uint8Array(size * size);

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

    const depth = settings.island > 0 ? getCoastDepth(settings) : -Infinity;
    for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
            const i = ground.tile(x, y);
            if (Math.hypot(x - spawn, y - spawn) <= SPAWN_CLEAR) {
                continue;
            }
            const wobble = (coast(x / 16, y / 16) - 0.5) * 18;
            if (toRoundedEdge(x, y, spawn, half) + wobble < depth) {
                sea[i] = 1;
                continue;
            }
            for (const river of rivers) {
                const [along, across] = river.vertical ? [y, x] : [x, y];
                if (Math.abs(across - riverCentre(river, along)) <= RIVER_HALF_WIDTH) {
                    fresh[i] = 1;
                }
            }
            for (const pond of ponds) {
                const edge = pond.radius + (shape(x / 6, y / 6) - 0.5) * 5;
                if (Math.hypot(x - pond.x, y - pond.y) < edge) {
                    fresh[i] = 1;
                }
            }
        }
    }
    return { sea, fresh };
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

// Bridges where rivers can take one. Returns where roads can meet them: both
// ends of each.
function placeBridges(
    biome: BiomeDef,
    context: BuildContext,
    ground: Ground,
    rivers: River[],
    water: Uint8Array,
    arena: TileRect,
): { x: number; y: number }[] {
    const ends: { x: number; y: number }[] = [];
    const prefab = loadPrefab(context, BRIDGE);
    const turned = rotatePrefab(prefab, 1, context.locs);
    const reach = (BRIDGE.sizeX >> 1) + 1;
    for (const river of rivers) {
        for (const crossing of river.crossings) {
            const a = river.vertical
                ? { x: river.line - reach, y: crossing }
                : { x: crossing, y: river.line - reach };
            const b = river.vertical
                ? { x: river.line + reach, y: crossing }
                : { x: crossing, y: river.line + reach };
            const inArena = (p: { x: number; y: number }) =>
                p.x >= arena.x0 && p.y >= arena.y0 && p.x <= arena.x1 && p.y <= arena.y1;
            const onLand = (p: { x: number; y: number }) =>
                inArena(p) && !water[ground.tile(p.x, p.y)];
            const crossesOther = rivers.some(
                (other) =>
                    other !== river && Math.abs(crossing - riverCentre(other, river.line)) < 16,
            );
            if (!onLand(a) || !onLand(b) || crossesOther) {
                continue;
            }
            const height = Math.max(
                (ground.getHeight(a.x, a.y) + ground.getHeight(b.x, b.y)) / 2,
                BRIDGE_BANK_HEIGHT,
            );
            const options = {
                floor: "all",
                feather: 5,
                flatten: false,
                height,
                anchor: BRIDGE_BANK_HEIGHT,
                keepUnderlays: true,
                mapOverlay: (overlay: number) => (overlay === BRIDGE_WATER ? biome.water : overlay),
            } as const;
            if (river.vertical) {
                ground.stamp(prefab, river.line - (BRIDGE.sizeX >> 1), crossing - 3, options);
            } else {
                ground.stamp(turned, crossing - 3, river.line - (BRIDGE.sizeX >> 1), options);
            }
            ends.push(a, b);
        }
    }
    return ends;
}

type Plot = { x: number; y: number; sizeX: number; sizeY: number };

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
    const skipLoc = (loc: PlacedLoc) => loc.type <= 3 && DOOR_NAME.test(context.locs(loc.id).name);
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
        const prefab = rotatePrefab(loadPrefab(context, def), turns, context.locs);
        ground.stamp(prefab, x, y, {
            floor: "footprint",
            feather: BUILDING_FEATHER,
            flatten: true,
            keepUnderlays: true,
            skipLoc,
        });
        plots.push({ x, y, sizeX, sizeY });
    }
    return plots;
}

function placeRoads(
    settings: GeneratorSettings,
    biome: BiomeDef,
    ground: Ground,
    rng: Rng,
    water: Uint8Array,
    bridgeEnds: { x: number; y: number }[],
    plots: Plot[],
    spawn: number,
): void {
    if (settings.roads <= 0) {
        return;
    }
    const roads = new Uint8Array(water.length);
    const wiggle = createNoise(settings.seed + 5);
    roads[ground.tile(spawn, spawn)] = 1;
    const targets = [...bridgeEnds];
    for (const plot of plots) {
        if (rng() < settings.roads) {
            // The nearest tile of the plot's edge to the spawn
            const x = Math.min(Math.max(spawn, plot.x - 1), plot.x + plot.sizeX);
            const y = Math.min(Math.max(spawn, plot.y - 1), plot.y + plot.sizeY);
            targets.push({ x, y });
        }
    }
    targets.sort(
        (a, b) => Math.hypot(a.x - spawn, a.y - spawn) - Math.hypot(b.x - spawn, b.y - spawn),
    );
    // Roads go round water and buildings, and join up where they meet
    const cost = (x: number, y: number) => {
        const i = ground.tile(x, y);
        if (water[i] || ground.reserved[i]) {
            return Infinity;
        }
        return roads[i] ? 0.2 : 1 + wiggle(x / 7, y / 7) * 4;
    };
    const mask = new Uint8Array(water.length);
    for (const target of targets) {
        const path = findPath(ground.sizeX, ground.sizeY, target, cost, (i) => roads[i] !== 0);
        for (const i of path) {
            roads[i] = 1;
            // paintOverlay rounds it off, which makes it about two tiles wide
            if (!ground.reserved[i] && !water[i]) {
                mask[i] = 1;
            }
        }
    }
    ground.paintOverlay(mask, biome.road, false);
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

// Makes dry land 3 tiles wide along a path, taking off anything on it
function layFord(biome: BiomeDef, ground: Ground, path: number[], buildings: Uint8Array): void {
    const ford = new Set<number>();
    for (const i of path) {
        const x = i % ground.sizeX;
        const y = Math.floor(i / ground.sizeX);
        for (let dy = -1; dy <= 1; dy++) {
            for (let dx = -1; dx <= 1; dx++) {
                if (ground.inside(x + dx, y + dy) && !buildings[ground.tile(x + dx, y + dy)]) {
                    ford.add(ground.tile(x + dx, y + dy));
                }
            }
        }
    }
    const tiles = ground.level0;
    for (const i of ford) {
        tiles.overlays[i] = 0;
        tiles.shapes[i] = 0;
        tiles.rotations[i] = 0;
        tiles.flags[i] &= ~TILE_BLOCKED;
        tiles.underlays[i] = biome.shore;
        ground.reserved[i] = 1;
    }
    ground.grid.locs = ground.grid.locs.filter(
        (loc) => !ford.has(ground.tile(loc.x, loc.y)) || loc.level !== 0,
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
        layFord(biome, ground, path, buildings);
        flags = getCollisionFlags(grid, context.locs);
        reached = findReachable(flags, sizeX, sizeY, arena, spawn, spawn);
    }
    for (const i of findStranded(flags, sizeX, arena, reached)) {
        blockTile(grid, i);
    }
}

export function generateMap(settings: GeneratorSettings, context: BuildContext): TileGrid {
    const size = getGeneratedSize(settings);
    const spawn = size >> 1;
    const arena = getGeneratedArena(settings);
    const biome = BIOMES[settings.biome];
    const rng = createRng(settings.seed);
    const ground = new Ground(size, size);

    const rivers = createRivers(settings, rng, spawn);
    const { sea, fresh } = paintMasks(settings, ground, rivers, rng);
    const water = new Uint8Array(sea.length);
    for (let i = 0; i < water.length; i++) {
        water[i] = sea[i] | fresh[i];
    }
    const toSea = distanceTo(sea, size, size, 8);
    const toFresh = distanceTo(fresh, size, size, 6);
    paintHeights(settings, ground, toSea, toFresh);
    paintFloors(settings, biome, ground, toSea);
    ground.paintOverlay(water, biome.water, true);

    const bridgeEnds = placeBridges(biome, context, ground, rivers, water, arena);
    const beforeBuildings = ground.reserved.slice();
    const plots = placeBuildings(settings, biome, context, ground, rng, water, spawn);
    const buildings = ground.reserved.map((v, i) => v & ~beforeBuildings[i]);
    placeRoads(settings, biome, ground, rng, water, bridgeEnds, plots, spawn);
    scatter(settings, biome, context, ground, rng, water, arena, spawn);
    connectGround(biome, context, ground, arena, spawn, buildings);
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
