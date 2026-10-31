import {
    Build,
    LOC_NORMAL,
    LOC_WALL,
    WALL_EAST,
    WALL_NORTH,
    WALL_SOUTH,
    WALL_WEST,
    lerp,
    pick,
} from "./mapBuild";
import { distanceTo } from "./noise";
import { Point } from "./paths";
import { RoadNetwork } from "./roads";
import { PlacedBuilding, fitsBuilding, getPlotHeight, markOffLimits, pinPlot } from "./settlements";

// What a place is known for: one big thing, or a few that belong together, standing on a plot
// as a building does, because a big loc on a slope shows its underside. Then what only makes
// sense on a map that's otherwise done: wrecks and drowned towns in the water, town walls and
// stones along the roads. Biomes say which pieces they have (biomes.ts).

// [loc id, tiles across, tiles deep]
export type PieceLoc = [number, number, number];

export type SetPiece =
    // One big thing, picked from a list
    | { kind: "single"; locs: PieceLoc[] }
    // Stones in a ring, with something in the middle if there's anything
    | { kind: "ring"; stones: PieceLoc[]; count: number; radius: number; middle?: PieceLoc }
    // A loose crowd in a circle
    | { kind: "grove"; locs: PieceLoc[]; count: number; radius: number }
    // Rows, as graves are
    | { kind: "rows"; locs: PieceLoc[]; across: number; deep: number; gap: number }
    // In the water, close in to the shore
    | { kind: "wreck"; locs: PieceLoc[] }
    // Out in the water: the top of something tall, and what's left of a town round it
    | { kind: "sunken"; middle: PieceLoc[]; stones: PieceLoc[]; count: number; radius: number }
    // A hedge maze, cells a side, with something to find in the middle
    | { kind: "maze"; hedges: number[]; cells: number; middle: PieceLoc }
    // The biome's wall round a yard, tiles a side, with a gate each way and things inside
    | { kind: "fort"; size: number; inside: PieceLoc[]; count: number };

function single(...locs: PieceLoc[]): SetPiece {
    return { kind: "single", locs };
}

const STANDING_STONES: PieceLoc[] = [
    [34780, 1, 1],
    [34781, 1, 1],
    [7016, 1, 1],
];
const SANDSTONE_PILLARS: PieceLoc[] = [
    [10019, 1, 1],
    [10020, 1, 1],
];
const GRAVES: PieceLoc[] = [
    [404, 1, 1],
    [405, 1, 1],
    [401, 1, 1],
    [400, 1, 1],
];
const MUSHROOM_TREES: PieceLoc[] = [
    [43129, 4, 4],
    [43130, 6, 6],
];
const RUINED_PILLARS: PieceLoc[] = [
    [34795, 1, 1],
    [34796, 1, 1],
    [34780, 1, 1],
];

export const SET_PIECES: Record<string, SetPiece> = {
    hedge_maze: { kind: "maze", hedges: [1116, 1117], cells: 5, middle: [879, 2, 2] },
    fort: {
        kind: "fort",
        size: 17,
        inside: [
            [724, 1, 1],
            [60438, 1, 1],
            [13435, 1, 1],
            [404, 1, 1],
        ],
        count: 7,
    },
    stone_circle: { kind: "ring", stones: STANDING_STONES, count: 9, radius: 6 },
    desert_circle: {
        kind: "ring",
        stones: SANDSTONE_PILLARS,
        count: 8,
        radius: 5,
        middle: [11100, 2, 2],
    },
    great_skeleton: single([59324, 7, 3]),
    great_boulder: single([60444, 6, 4]),
    giant_mushroom: single([43131, 9, 9]),
    mushroom_grove: { kind: "grove", locs: MUSHROOM_TREES, count: 4, radius: 7 },
    toadstools: {
        kind: "grove",
        locs: [
            [4057, 1, 1],
            [12005, 1, 1],
            [12006, 1, 1],
        ],
        count: 14,
        radius: 6,
    },
    crystal: single([27878, 5, 5], [27882, 3, 3]),
    crystal_field: {
        kind: "grove",
        locs: [
            [27882, 3, 3],
            [27878, 5, 5],
            [36530, 3, 2],
        ],
        count: 4,
        radius: 7,
    },
    dark_crystal: single([27879, 5, 5], [27883, 3, 3]),
    black_crystal: single([30666, 3, 3]),
    crater: single([43204, 5, 5], [43203, 4, 4], [43202, 3, 3]),
    crater_field: {
        kind: "grove",
        locs: [
            [43202, 3, 3],
            [43203, 4, 4],
        ],
        count: 4,
        radius: 7,
    },
    graveyard: { kind: "rows", locs: GRAVES, across: 6, deep: 4, gap: 2 },
    blisterwood: single([37989, 6, 4]),
    redwoods: {
        kind: "grove",
        locs: [
            [47372, 4, 4],
            [47374, 4, 4],
        ],
        count: 3,
        radius: 6,
    },
    great_tree: single([40791, 5, 4]),
    black_trees: {
        kind: "grove",
        locs: [
            [40812, 2, 2],
            [40818, 2, 2],
            [40819, 2, 2],
            [40820, 2, 2],
        ],
        count: 6,
        radius: 6,
    },
    great_stump: {
        kind: "grove",
        locs: [
            [57511, 3, 3],
            [57513, 3, 3],
            [50935, 3, 3],
        ],
        count: 4,
        radius: 6,
    },
    idol: single([21, 4, 4]),
    shipwreck: {
        kind: "wreck",
        locs: [
            [60471, 4, 4],
            [60479, 4, 4],
            [60475, 4, 4],
            [60467, 3, 2],
            [60469, 3, 2],
        ],
    },
    longship: {
        kind: "wreck",
        locs: [
            [59372, 6, 3],
            [60477, 5, 3],
        ],
    },
    drowned_town: {
        kind: "sunken",
        middle: [
            [48327, 9, 9],
            [48311, 9, 9],
        ],
        stones: RUINED_PILLARS,
        count: 12,
        radius: 11,
    },
};

export type PlacedPiece = {
    name: string;
    x: number;
    y: number;
    sizeX: number;
    sizeY: number;
    // Stands on a plot of its own, rather than in water
    onLand: boolean;
};

// Set pieces to a map square, with the setting at 1
const PIECES_A_SQUARE = 1.5;

const TRIES_A_PIECE = 40;

// A wreck's this near the shore, in tiles from its edge
const WRECK_REACH = 4;

// Of a town's walls, tiles either side of a gate where there's no road through
const GATE_HALF = 2;

// The same for a fort's
const FORT_GATE = 2;

// Tiles from a town's outermost building to its wall
const TOWN_WALL_GAP = 4;

// A town needs this many buildings to have a wall
const MIN_WALLED_BUILDINGS = 2;

// Half the width of a town's square, how far off its middle to look for one, in steps of 2 tiles,
// and how much the ground can rise over it
const TOWN_SQUARE = 4;

const TOWN_SQUARE_SEARCH = 6;

const TOWN_SQUARE_RISE = 14;

// In a town's square, and the cobbles on its streets
export const FOUNTAIN = 879;

export const PAVING = 12;

// Tiles along a road between stones, and off its edge
const MARKER_SPACING = 16;

const MARKER_OFFSET = 2;

// Tiles across a maze's corridors, with a tile of hedge between them. Crowds have to fit.
const MAZE_CELL = 3;

// Of a maze's hedges between cells, the share knocked through, so that it isn't a trap
const MAZE_LOOPS = 0.2;

// All the locs a piece can use, for the palette
export function getPieceLocs(piece: SetPiece): PieceLoc[] {
    switch (piece.kind) {
        case "ring":
            return [...piece.stones, ...(piece.middle ? [piece.middle] : [])];
        case "sunken":
            return [...piece.middle, ...piece.stones];
        case "maze":
            return [piece.middle, ...piece.hedges.map((id): PieceLoc => [id, 1, 1])];
        case "fort":
            return piece.inside;
        default:
            return piece.locs;
    }
}

// The rectangle a piece needs
function getPieceSize(piece: SetPiece): { sizeX: number; sizeY: number } {
    if (piece.kind === "single" || piece.kind === "wreck") {
        return {
            sizeX: Math.max(...piece.locs.map((loc) => loc[1])),
            sizeY: Math.max(...piece.locs.map((loc) => loc[2])),
        };
    }
    if (piece.kind === "rows") {
        return { sizeX: piece.across * piece.gap, sizeY: piece.deep * piece.gap };
    }
    if (piece.kind === "maze") {
        const size = piece.cells * (MAZE_CELL + 1) + 1;
        return { sizeX: size, sizeY: size };
    }
    if (piece.kind === "fort") {
        return { sizeX: piece.size, sizeY: piece.size };
    }
    const size = piece.radius * 2 + 3;
    return { sizeX: size, sizeY: size };
}

function putLoc(
    build: Build,
    [id, across, deep]: PieceLoc,
    x: number,
    y: number,
    rotation: number,
): void {
    const sizeX = rotation & 1 ? deep : across;
    const sizeY = rotation & 1 ? across : deep;
    build.ground.place({ id, type: LOC_NORMAL, rotation, level: 0, x, y }, sizeX, sizeY);
}

function putRing(
    build: Build,
    stones: PieceLoc[],
    count: number,
    radius: number,
    x: number,
    y: number,
): void {
    const { rng } = build;
    const turn = rng() * Math.PI;
    for (let i = 0; i < count; i++) {
        const angle = turn + (i / count) * Math.PI * 2;
        const stoneX = Math.round(x + Math.cos(angle) * radius);
        const stoneY = Math.round(y + Math.sin(angle) * radius);
        putLoc(build, pick(rng, stones), stoneX, stoneY, Math.floor(rng() * 4));
    }
}

// A maze's hedges, a tile to a tile: every cell can be got to, by a tree of corridors with a
// few of its walls knocked through, and there's a way in on each side
function placeMaze(
    build: Build,
    piece: Extract<SetPiece, { kind: "maze" }>,
    x: number,
    y: number,
): void {
    const { ground, rng } = build;
    const { cells } = piece;
    const step = MAZE_CELL + 1;
    const size = cells * step + 1;
    const hedge = new Uint8Array(size * size);
    for (let ty = 0; ty < size; ty++) {
        for (let tx = 0; tx < size; tx++) {
            hedge[tx + ty * size] = tx % step === 0 || ty % step === 0 ? 1 : 0;
        }
    }
    const open = (cellX: number, cellY: number, wayX: number, wayY: number) => {
        // The hedge between a cell and the next, all but its posts
        for (let at = 1; at <= MAZE_CELL; at++) {
            const tx = wayX !== 0 ? cellX * step + (wayX > 0 ? step : 0) : cellX * step + at;
            const ty = wayY !== 0 ? cellY * step + (wayY > 0 ? step : 0) : cellY * step + at;
            hedge[tx + ty * size] = 0;
        }
    };
    const WAYS = [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
    ];
    const seen = new Uint8Array(cells * cells);
    const trail = [[rng() * cells, rng() * cells].map(Math.floor)];
    seen[trail[0][0] + trail[0][1] * cells] = 1;
    while (trail.length > 0) {
        const [cellX, cellY] = trail[trail.length - 1];
        const ways = WAYS.filter(([wayX, wayY]) => {
            const nextX = cellX + wayX;
            const nextY = cellY + wayY;
            const inside = nextX >= 0 && nextY >= 0 && nextX < cells && nextY < cells;
            return inside && !seen[nextX + nextY * cells];
        });
        if (ways.length === 0) {
            trail.pop();
            continue;
        }
        const [wayX, wayY] = pick(rng, ways);
        open(cellX, cellY, wayX, wayY);
        seen[cellX + wayX + (cellY + wayY) * cells] = 1;
        trail.push([cellX + wayX, cellY + wayY]);
    }
    for (let cellY = 0; cellY < cells; cellY++) {
        for (let cellX = 0; cellX + 1 < cells; cellX++) {
            if (rng() < MAZE_LOOPS) {
                open(cellX, cellY, 1, 0);
            }
            if (rng() < MAZE_LOOPS) {
                open(cellY, cellX, 0, 1);
            }
        }
    }
    const door = () => Math.floor(rng() * cells);
    open(door(), 0, 0, -1);
    open(door(), cells - 1, 0, 1);
    open(0, door(), -1, 0);
    open(cells - 1, door(), 1, 0);
    for (let ty = 0; ty < size; ty++) {
        for (let tx = 0; tx < size; tx++) {
            if (hedge[tx + ty * size]) {
                const id = pick(rng, piece.hedges);
                ground.place(
                    { id, type: LOC_NORMAL, rotation: 0, level: 0, x: x + tx, y: y + ty },
                    1,
                    1,
                );
            }
        }
    }
    const middle = (cells >> 1) * step + 1;
    putLoc(build, piece.middle, x + middle, y + middle, 0);
}

// A walled yard, the biome's wall all round it with a gate in the middle of each side
function placeFort(
    build: Build,
    piece: Extract<SetPiece, { kind: "fort" }>,
    x: number,
    y: number,
): void {
    const { ground, rng, biomeAt } = build;
    const last = piece.size - 1;
    const id = biomeAt(x, y).wall;
    const gate = (at: number) => Math.abs(at - (last >> 1)) <= FORT_GATE;
    const wall = (tx: number, ty: number, rotation: number) => {
        ground.grid.locs.push({ id, type: LOC_WALL, rotation, level: 0, x: tx, y: ty });
        ground.reserved[ground.tile(tx, ty)] = 1;
    };
    for (let at = 0; at <= last; at++) {
        if (!gate(at)) {
            wall(x + at, y, WALL_SOUTH);
            wall(x + at, y + last, WALL_NORTH);
            wall(x, y + at, WALL_WEST);
            wall(x + last, y + at, WALL_EAST);
        }
    }
    const room = piece.size - 6;
    for (let i = 0; i < piece.count; i++) {
        const loc = pick(rng, piece.inside);
        const tx = x + 3 + Math.floor(rng() * room);
        const ty = y + 3 + Math.floor(rng() * room);
        if (ground.isClear(tx - 1, ty - 1, loc[1] + 2, loc[2] + 2)) {
            putLoc(build, loc, tx, ty, 0);
        }
    }
}

function placeOnPlot(build: Build, piece: SetPiece, x: number, y: number): void {
    const { ground, rng } = build;
    const { sizeX, sizeY } = getPieceSize(piece);
    const middleX = x + (sizeX >> 1);
    const middleY = y + (sizeY >> 1);
    if (piece.kind === "single") {
        const loc = pick(rng, piece.locs);
        putLoc(build, loc, x + ((sizeX - loc[1]) >> 1), y + ((sizeY - loc[2]) >> 1), 0);
    } else if (piece.kind === "ring") {
        putRing(build, piece.stones, piece.count, piece.radius, middleX, middleY);
        if (piece.middle) {
            const [, across, deep] = piece.middle;
            putLoc(build, piece.middle, middleX - (across >> 1), middleY - (deep >> 1), 0);
        }
    } else if (piece.kind === "grove") {
        let placed = 0;
        for (let attempt = 0; attempt < piece.count * 12 && placed < piece.count; attempt++) {
            const angle = rng() * Math.PI * 2;
            const reach = Math.sqrt(rng()) * piece.radius;
            const loc = pick(rng, piece.locs);
            const tx = Math.round(middleX + Math.cos(angle) * reach - loc[1] / 2);
            const ty = Math.round(middleY + Math.sin(angle) * reach - loc[2] / 2);
            if (
                tx >= x &&
                ty >= y &&
                tx + loc[1] <= x + sizeX &&
                ty + loc[2] <= y + sizeY &&
                ground.isClear(tx - 1, ty - 1, loc[1] + 2, loc[2] + 2)
            ) {
                putLoc(build, loc, tx, ty, 0);
                placed++;
            }
        }
    } else if (piece.kind === "rows") {
        for (let row = 0; row < piece.deep; row++) {
            for (let column = 0; column < piece.across; column++) {
                const loc = pick(rng, piece.locs);
                if (rng() < 0.85) {
                    putLoc(build, loc, x + column * piece.gap, y + row * piece.gap, 3);
                }
            }
        }
    } else if (piece.kind === "maze") {
        placeMaze(build, piece, x, y);
    } else if (piece.kind === "fort") {
        placeFort(build, piece, x, y);
    }
}

// Places the pieces that stand on land, where their biome has them, spread out over the map.
// What goes in water comes later: see placeWaterPieces.
export function placeSetPieces(build: Build, roads: RoadNetwork, water: Uint8Array): PlacedPiece[] {
    const { settings, rng, biomeAt, arena } = build;
    const wanted = Math.round(
        settings.landmarks * settings.squaresX * settings.squaresY * PIECES_A_SQUARE,
    );
    const placed: PlacedPiece[] = [];
    const used = new Map<string, number>();
    for (let attempt = 0; attempt < wanted * TRIES_A_PIECE && placed.length < wanted; attempt++) {
        const middleX = Math.round(lerp(arena.x0, arena.x1, rng()));
        const middleY = Math.round(lerp(arena.y0, arena.y1, rng()));
        const names = biomeAt(middleX, middleY).landmarks.filter(
            (name) => !["wreck", "sunken"].includes(SET_PIECES[name].kind),
        );
        if (names.length === 0) {
            continue;
        }
        // Least used first, so that it isn't all the one thing
        const fewest = Math.min(...names.map((name) => used.get(name) ?? 0));
        const name = pick(
            rng,
            names.filter((other) => (used.get(other) ?? 0) === fewest),
        );
        const piece = SET_PIECES[name];
        const { sizeX, sizeY } = getPieceSize(piece);
        const x = middleX - (sizeX >> 1);
        const y = middleY - (sizeY >> 1);
        if (!fitsBuilding(build, water, x, y, sizeX, sizeY)) {
            continue;
        }
        const height = getPlotHeight(build, x, y, sizeX, sizeY);
        if (height === undefined) {
            continue;
        }
        pinPlot(build, x, y, sizeX, sizeY, height);
        markOffLimits(build, roads, x, y, sizeX, sizeY, 1);
        placeOnPlot(build, piece, x, y);
        used.set(name, (used.get(name) ?? 0) + 1);
        placed.push({ name, x, y, sizeX, sizeY, onLand: true });
    }
    return placed;
}

// Whether a rectangle's all water
function isAllWater(
    build: Build,
    water: Uint8Array,
    x: number,
    y: number,
    sizeX: number,
    sizeY: number,
) {
    const { ground } = build;
    for (let ty = y; ty < y + sizeY; ty++) {
        for (let tx = x; tx < x + sizeX; tx++) {
            if (!ground.inside(tx, ty) || !water[ground.tile(tx, ty)]) {
                return false;
            }
        }
    }
    return true;
}

// Wrecks close in to the shore, and drowned towns further out, wherever there's water
// for them: on heights that won't move, so there are no plots
export function placeWaterPieces(build: Build, water: Uint8Array): PlacedPiece[] {
    const { settings, rng, arena, biomeAt, sizeX, sizeY } = build;
    const placed: PlacedPiece[] = [];
    const wanted = Math.round(settings.landmarks * settings.squaresX * settings.squaresY);
    if (wanted === 0) {
        return placed;
    }
    const tiles = [...water.keys()].filter((i) => water[i]);
    if (tiles.length === 0) {
        return placed;
    }
    const land = water.map((tile) => 1 - tile);
    const toLand = distanceTo(land, sizeX, sizeY, WRECK_REACH + 12);
    for (let attempt = 0; attempt < wanted * TRIES_A_PIECE && placed.length < wanted; attempt++) {
        const i = pick(rng, tiles);
        const tx = i % sizeX;
        const ty = Math.floor(i / sizeX);
        const inArena = tx >= arena.x0 && ty >= arena.y0 && tx <= arena.x1 && ty <= arena.y1;
        const names = biomeAt(tx, ty).landmarks.filter((name) =>
            ["wreck", "sunken"].includes(SET_PIECES[name].kind),
        );
        if (names.length === 0 || !inArena) {
            continue;
        }
        const name = pick(rng, names);
        const piece = SET_PIECES[name];
        const size = getPieceSize(piece);
        const x = tx - (size.sizeX >> 1);
        const y = ty - (size.sizeY >> 1);
        const clear = placed.every(
            (other) => Math.hypot(other.x - x, other.y - y) > other.sizeX + size.sizeX,
        );
        if (!clear || !isAllWater(build, water, x, y, size.sizeX, size.sizeY)) {
            continue;
        }
        if (piece.kind === "wreck") {
            if (toLand[i] > WRECK_REACH + size.sizeX / 2) {
                continue;
            }
            const loc = pick(rng, piece.locs);
            putLoc(build, loc, x, y, 0);
        } else if (piece.kind === "sunken") {
            const loc = pick(rng, piece.middle);
            putLoc(build, loc, tx - (loc[1] >> 1), ty - (loc[2] >> 1), 0);
            putRing(build, piece.stones, piece.count, piece.radius, tx, ty);
        }
        placed.push({ name, x, y, ...size, onLand: false });
    }
    return placed;
}

// A town with a wall round it, by the rectangle the wall stands on
export type WalledTown = { x0: number; y0: number; x1: number; y1: number };

// Which towns have walls, a little way out from their buildings, each with a square and a
// fountain at its middle if there's room
export function chooseWalledTowns(
    build: Build,
    buildings: PlacedBuilding[],
    roads: RoadNetwork,
): WalledTown[] {
    const { settings, ground, arena, rng, terrain, spawn } = build;
    const walled: WalledTown[] = [];
    if (settings.townWalls <= 0) {
        return walled;
    }
    const towns = new Map<number, PlacedBuilding[]>();
    for (const building of buildings) {
        if (building.town !== undefined) {
            towns.set(building.town, [...(towns.get(building.town) ?? []), building]);
        }
    }
    for (const members of towns.values()) {
        if (rng() >= settings.townWalls || members.length < MIN_WALLED_BUILDINGS) {
            continue;
        }
        const x0 = Math.max(Math.min(...members.map((b) => b.x)) - TOWN_WALL_GAP, arena.x0 + 2);
        const y0 = Math.max(Math.min(...members.map((b) => b.y)) - TOWN_WALL_GAP, arena.y0 + 2);
        const x1 = Math.min(
            Math.max(...members.map((b) => b.x + b.sizeX)) + TOWN_WALL_GAP,
            arena.x1 - 2,
        );
        const y1 = Math.min(
            Math.max(...members.map((b) => b.y + b.sizeY)) + TOWN_WALL_GAP,
            arena.y1 - 2,
        );
        walled.push({ x0, y0, x1, y1 });
        // Round the middle till there's a spot for the square
        const middleX = (x0 + x1) >> 1;
        const middleY = (y0 + y1) >> 1;
        let done = false;
        for (let reach = 0; reach < TOWN_SQUARE_SEARCH && !done; reach++) {
            for (let tries = 0; tries < 8 && !done; tries++) {
                const angle = (tries / 8) * Math.PI * 2;
                const x = Math.round(middleX + Math.cos(angle) * reach * 2) - TOWN_SQUARE;
                const y = Math.round(middleY + Math.sin(angle) * reach * 2) - TOWN_SQUARE;
                const size = TOWN_SQUARE * 2;
                const clearOfSpawn = Math.hypot(x - spawn.x, y - spawn.y) > TOWN_SQUARE * 3;
                const { min, max } = terrain.getRange(x, y, size, size);
                if (
                    clearOfSpawn &&
                    max - min < TOWN_SQUARE_RISE &&
                    ground.isClear(x, y, size, size)
                ) {
                    pinPlot(build, x, y, size, size, Math.round((min + max) / 2));
                    roads.addSquare(x + TOWN_SQUARE, y + TOWN_SQUARE, TOWN_SQUARE);
                    ground.place(
                        {
                            id: FOUNTAIN,
                            type: LOC_NORMAL,
                            rotation: 0,
                            level: 0,
                            x: x + TOWN_SQUARE - 1,
                            y: y + TOWN_SQUARE - 1,
                        },
                        2,
                        2,
                    );
                    done = true;
                }
            }
        }
    }
    return walled;
}

// Inside a wall a road's paved
export function getPaving(walled: WalledTown[], x: number, y: number): number | undefined {
    return walled.some((town) => x > town.x0 && x < town.x1 && y > town.y0 && y < town.y1)
        ? PAVING
        : undefined;
}

// The walls round towns, open where roads go through them, and with a gate each way
export function placeTownWalls(build: Build, walled: WalledTown[], roadTiles: Uint8Array): void {
    const { ground, biomeAt, spawn } = build;
    for (const { x0, y0, x1, y1 } of walled) {
        const id = biomeAt((x0 + x1) >> 1, (y0 + y1) >> 1).wall;
        // A gate on each side, on the line to the spawn if it's that side
        const gateX = Math.min(Math.max(spawn.x, x0 + GATE_HALF + 1), x1 - GATE_HALF - 1);
        const gateY = Math.min(Math.max(spawn.y, y0 + GATE_HALF + 1), y1 - GATE_HALF - 1);
        const put = (x: number, y: number, rotation: number) => {
            const i = ground.tile(x, y);
            const wall = !ground.isWaterTile(x, y) && !ground.footprint[i] && !roadTiles[i];
            const gate =
                rotation === WALL_NORTH || rotation === WALL_SOUTH
                    ? Math.abs(x - gateX) <= GATE_HALF
                    : Math.abs(y - gateY) <= GATE_HALF;
            if (wall && !gate) {
                ground.grid.locs.push({ id, type: LOC_WALL, rotation, level: 0, x, y });
                ground.reserved[i] = 1;
            }
        };
        for (let x = x0; x <= x1; x++) {
            put(x, y0, WALL_SOUTH);
            put(x, y1, WALL_NORTH);
        }
        for (let y = y0; y <= y1; y++) {
            put(x0, y, WALL_WEST);
            put(x1, y, WALL_EAST);
        }
    }
}

// Old stones along the roads, the same way apart on either side of them in turn
export function placeWaymarkers(build: Build, roads: RoadNetwork): Point[] {
    const { settings, ground, biomeAt, rng, toEdge } = build;
    const markers: Point[] = [];
    if (settings.waymarkers <= 0) {
        return markers;
    }
    for (const line of roads.lines) {
        const { points, lead, halfWidth } = line;
        let side = rng() < 0.5 ? 1 : -1;
        const spacing = Math.round(MARKER_SPACING / settings.waymarkers);
        for (let at = lead + spacing; at + 1 < points.length; at += spacing) {
            const from = points[at];
            const to = points[at + 1];
            const length = Math.hypot(to.x - from.x, to.y - from.y) || 1;
            const reach = halfWidth + MARKER_OFFSET;
            const x = Math.floor(from.x - ((to.y - from.y) / length) * reach * side);
            const y = Math.floor(from.y + ((to.x - from.x) / length) * reach * side);
            side = -side;
            if (
                ground.inside(x, y) &&
                toEdge(x, y) > 2 &&
                ground.isClear(x - 1, y - 1, 3, 3) &&
                !ground.isWaterTile(x, y)
            ) {
                const id = biomeAt(x, y).marker;
                ground.place({ id, type: LOC_NORMAL, rotation: 0, level: 0, x, y }, 1, 1);
                markers.push({ x, y });
            }
        }
    }
    return markers;
}
