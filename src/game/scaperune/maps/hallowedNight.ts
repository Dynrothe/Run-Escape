import { Ground } from "../Ground";
import { blockTile, findReachable, findStranded, getCollisionFlags } from "../collision";
import { MAP_SQUARE_SIZE, TILE_BLOCKED } from "../format";
import { GeneratedMap } from "../generator";
import {
    LOC_FLOOR_DECORATION,
    LOC_NORMAL,
    LOC_WALL,
    WALL_EAST,
    WALL_NORTH,
    WALL_SOUTH,
    WALL_WEST,
} from "../mapBuild";
import { Rng, createNoise, createRng, smoothField } from "../noise";
import { PrefabKit } from "../prefabs";
import { BuildContext, MapRecipe } from "../recipe";

// Hallowed Night: a graveyard hamlet in a pumpkin patch, the night its dead won't lie still.
// A simple map on purpose: flat dark ground, all of its looks in what stands on it.
//
// The Nightmare's fight needs the whole arena, so anything solid stays out of what isLane
// says: the open middle, a lane round the edge, the four corners, and two lanes across the
// map through the middle. That leaves four places, one in each quarter: the hamlet (north
// west), the graveyard (north east), the farm (south west) and the witch's hollow (south
// east). Everywhere else only what you can walk through: pumpkins, bones, lanterns, candles.
// build throws if anything solid gets into a lane.

const SQUARES = 5;
const MARGIN = 1;
const SIZE = SQUARES * MAP_SQUARE_SIZE;
const ARENA_MIN = MARGIN * MAP_SQUARE_SIZE;
const ARENA_MAX = SIZE - ARENA_MIN - 1;
const MIDDLE = (ARENA_MIN + ARENA_MAX + 1) / 2;

// Nothing solid within these, in tiles
const OPEN_MIDDLE = 56;
const EDGE_LANE = 12;
const CORNER = 22;
const CROSS_LANE = 10;

const GROUND_HEIGHT = 40;
const GROUND_ROLL = 3;

// The ritual circle, with a star in it, where she rises
const CIRCLE = 12;
const CIRCLE_POINTS = 5;

// The most tiles that can be shut in, as a closed room is: the rest must reach the spawn
const MAX_SEALED = 200;

// Underlays, as the map files store them
// Moonlit: greys and blues that orange stands out on
const GROUND = [45, 104, 225];
const DARK_GROUND = 24;
const SOIL = 11;
// Overlays
const PATH = 278;
const RITUAL = 194;
const RIDGE = 14;
const FURROW = 427;

// Plain pumpkins, and now and then a carved one. Both are made big in LocOverrides.ts, and both
// are ordinary locs (type 10) that block nothing.
const FIELD_PUMPKINS = [46272, 46272, 46272, 46272, 46272, 46272, 46272, 46267];
const FIELD_VINE = 55617;
const FIELD_FENCE = 5153;
const PLOUGH = 296;
// Small ones you can walk through. Solid and two tiles across, for where nobody needs to go
const LANTERNS = [46265, 46269, 46265, 46269, 46274];
const BIG_LANTERNS = [55455, 55457, 55459, 55461, 55463];
const PALE_LANTERNS = [55466, 55467];
const BONES = [3665, 6893, 24706, 24707, 15549, 15551, 25090];
const LONG_BONES = [24708];
const CANDLES = [11472, 11473];
const SCRUB = [3549, 3548, 3547, 12931, 5335];

const GRAVES: [id: number, sizeX: number, sizeY: number][] = [
    [404, 1, 1],
    [405, 1, 1],
    [9359, 1, 1],
    [9360, 1, 1],
    [9361, 1, 1],
    [5168, 1, 1],
    [9364, 1, 2],
    [10050, 1, 2],
    [402, 2, 1],
    [14769, 2, 1],
];
const COFFINS: [id: number, sizeX: number, sizeY: number][] = [
    [398, 2, 2],
    [2145, 2, 2],
    [2615, 2, 2],
    [3577, 2, 2],
    [15052, 2, 2],
];
const MAUSOLEUM = 10055;
const CAULDRON = 34866;
const BREW = 14360;
const GIBBETS = [29410, 30260];
const GALLOWS = 649;
const HAY = 300;
const HAY_BALES = 8714;
// A combat dummy: its post and straw read as a scarecrow, and the real ones are barely there
const SCARECROW = 29336;
const WEB = 25443;
const FENCE = 39202;
const WELL_BONES = 14032;
const TREES: [id: number, size: number][] = [
    [1282, 2],
    [1283, 2],
    [14513, 2],
    [4538, 2],
    [1286, 1],
    [1287, 1],
    [14514, 1],
    [1289, 1],
];

const pick = <T>(rng: Rng, from: T[]): T => from[Math.floor(rng() * from.length)];

function toEdge(x: number, y: number): [x: number, y: number] {
    return [Math.min(x - ARENA_MIN, ARENA_MAX - x), Math.min(y - ARENA_MIN, ARENA_MAX - y)];
}

function inArena(x: number, y: number): boolean {
    const [edgeX, edgeY] = toEdge(x, y);
    return edgeX >= 0 && edgeY >= 0;
}

// Whether a tile must stay free of anything solid
function isLane(x: number, y: number): boolean {
    if (!inArena(x, y)) {
        return false;
    }
    const [edgeX, edgeY] = toEdge(x, y);
    const fromX = x + 0.5 - MIDDLE;
    const fromY = y + 0.5 - MIDDLE;
    return (
        Math.min(edgeX, edgeY) < EDGE_LANE ||
        (edgeX < CORNER && edgeY < CORNER) ||
        Math.abs(fromX) <= CROSS_LANE ||
        Math.abs(fromY) <= CROSS_LANE ||
        Math.hypot(fromX, fromY) <= OPEN_MIDDLE
    );
}

function segmentDistance(
    x: number,
    y: number,
    x0: number,
    y0: number,
    x1: number,
    y1: number,
): number {
    const dx = x1 - x0;
    const dy = y1 - y0;
    const t = Math.min(Math.max(((x - x0) * dx + (y - y0) * dy) / (dx * dx + dy * dy), 0), 1);
    return Math.hypot(x - x0 - dx * t, y - y0 - dy * t);
}

type Place = { x: number; y: number };

// Where the paths run: from the circle out to each of the four places, and along the north
const PATHS: Place[][] = [
    [
        { x: 146, y: 174 },
        { x: 128, y: 192 },
        { x: 100, y: 218 },
    ],
    [
        { x: 174, y: 174 },
        { x: 192, y: 192 },
        { x: 220, y: 218 },
    ],
    [
        { x: 146, y: 146 },
        { x: 124, y: 126 },
        { x: 100, y: 112 },
    ],
    [
        { x: 174, y: 146 },
        { x: 196, y: 126 },
        { x: 220, y: 106 },
    ],
    [
        { x: 100, y: 218 },
        { x: 160, y: 226 },
        { x: 220, y: 218 },
    ],
];

type Field = { x0: number; y0: number; x1: number; y1: number };

// Tiles of track round a field, tiles from one row to the next, from one pumpkin to the next
// along a row, and half a gate in the fence
const TRACK = 2;
const ROW = 3;
const SPOT = 3;
const GATE = 3;
// How high a ridge stands. Twelve a tile can't be walked, so this is nowhere near it.
const RIDGE_HEIGHT = 3;

const FIELDS: Field[] = [
    // By the barn
    { x0: 94, y0: 79, x1: 145, y1: 108 },
    { x0: 152, y0: 79, x1: 196, y1: 108 },
    { x0: 80, y0: 139, x1: 124, y1: 183 },
    { x0: 197, y0: 139, x1: 241, y1: 183 },
];

const HAMLET = { x: 100, y: 220 };
const GRAVEYARD = { x: 220, y: 220 };
const FARM = { x: 100, y: 100 };
const HOLLOW = { x: 220, y: 100 };

class Night {
    readonly rng = createRng(1031);
    readonly ground = new Ground(SIZE, SIZE);
    readonly kit: PrefabKit;
    // Tiles something's already standing on that you can walk through
    private readonly dressed = new Uint8Array(SIZE * SIZE);

    constructor(readonly context: BuildContext) {
        this.kit = new PrefabKit(context);
    }

    // Something solid: nothing that fits a lane goes in. Keeps a tile clear round it if asked,
    // so nothing's jammed against it.
    solid(id: number, sizeX: number, sizeY: number, x: number, y: number, rotation = 0, gap = 0) {
        for (let ty = y; ty < y + sizeY; ty++) {
            for (let tx = x; tx < x + sizeX; tx++) {
                if (isLane(tx, ty)) {
                    return false;
                }
            }
        }
        if (!this.ground.isClear(x - gap, y - gap, sizeX + gap * 2, sizeY + gap * 2)) {
            return false;
        }
        this.ground.place({ id, type: LOC_NORMAL, rotation, level: 0, x, y }, sizeX, sizeY);
        return true;
    }

    // Something you can walk through: one to a tile, and never on what's painted or built
    dress(id: number, type: number, x: number, y: number, rotation?: number): void {
        const i = this.ground.tile(x, y);
        if (this.dressed[i] || this.ground.reserved[i]) {
            return;
        }
        this.dressed[i] = 1;
        this.ground.grid.locs.push({
            id,
            type,
            rotation: rotation ?? Math.floor(this.rng() * 4),
            level: 0,
            x,
            y,
        });
    }

    // Turned so that a way out comes nearest what it's asked to face
    stampFacing(name: string, x: number, y: number, to: Place): void {
        let best = 0;
        let bestDistance = Infinity;
        for (let turns = 0; turns < 4; turns++) {
            for (const exit of this.kit.get(name, turns).exits) {
                const distance = Math.hypot(x + exit.outX - to.x, y + exit.outY - to.y);
                if (distance < bestDistance) {
                    bestDistance = distance;
                    best = turns;
                }
            }
        }
        this.kit.stamp(this.ground, name, best, x, y);
    }
}

function paintGround(night: Night): void {
    const { ground } = night;
    const colour = createNoise(1032, 2);
    const roll = createNoise(1033, 2);
    const { underlays } = ground.level0;
    for (let y = 0; y <= SIZE; y++) {
        for (let x = 0; x <= SIZE; x++) {
            ground.setHeight(x, y, GROUND_HEIGHT + roll(x / 24, y / 24) * GROUND_ROLL);
        }
    }
    for (let y = 0; y < SIZE; y++) {
        for (let x = 0; x < SIZE; x++) {
            const shade = colour(x / 28, y / 28);
            const band = Math.min(Math.floor(shade * GROUND.length * 1.5), GROUND.length - 1);
            underlays[ground.tile(x, y)] = inArena(x, y) ? GROUND[band] : DARK_GROUND;
        }
    }
}

// The circle, its star and the paths, as one field: a tile holds one overlay
function paintLines(night: Night): void {
    const { ground } = night;
    const cornersX = SIZE + 1;
    const wander = createNoise(1034, 2);
    const star: Place[] = [];
    for (let i = 0; i < CIRCLE_POINTS; i++) {
        const angle = Math.PI / 2 + (i * 2 * Math.PI * 2) / CIRCLE_POINTS;
        star.push({
            x: MIDDLE + Math.cos(angle) * CIRCLE,
            y: MIDDLE + Math.sin(angle) * CIRCLE,
        });
    }
    const paths = new Float32Array(cornersX * (SIZE + 1)).fill(-9);
    for (let y = 0; y <= SIZE; y++) {
        for (let x = 0; x <= SIZE; x++) {
            const wide = 1.6 + (wander(x / 14, y / 14) - 0.5) * 1.4;
            for (const path of PATHS) {
                for (let i = 1; i < path.length; i++) {
                    const a = path[i - 1];
                    const b = path[i];
                    const distance = segmentDistance(x, y, a.x, a.y, b.x, b.y);
                    paths[x + y * cornersX] = Math.max(paths[x + y * cornersX], wide - distance);
                }
            }
        }
    }
    // The star's lines are too thin to smooth: they'd go
    const field = smoothField(paths, cornersX, SIZE + 1, 1);
    for (let y = 0; y <= SIZE; y++) {
        for (let x = 0; x <= SIZE; x++) {
            const fromMiddle = Math.hypot(x - MIDDLE, y - MIDDLE);
            if (fromMiddle > CIRCLE + 3) {
                continue;
            }
            let value = 1 - Math.abs(fromMiddle - CIRCLE);
            for (let i = 0; i < CIRCLE_POINTS; i++) {
                const from = star[i];
                const to = star[(i + 1) % CIRCLE_POINTS];
                value = Math.max(value, 1 - segmentDistance(x, y, from.x, from.y, to.x, to.y));
            }
            field[x + y * cornersX] = Math.max(field[x + y * cornersX], value);
        }
    }
    ground.paintField(
        field,
        (x, y) => (Math.hypot(x - MIDDLE, y - MIDDLE) < CIRCLE + 3 ? RITUAL : PATH),
        false,
    );
}

function placeCircle(night: Night): void {
    const { rng } = night;
    for (let i = 0; i < 48; i++) {
        const angle = (i * 2 * Math.PI) / 48;
        const x = Math.floor(MIDDLE + Math.cos(angle) * (CIRCLE + 3));
        const y = Math.floor(MIDDLE + Math.sin(angle) * (CIRCLE + 3));
        night.dress(i % 6 === 0 ? pick(rng, LANTERNS) : pick(rng, CANDLES), LOC_NORMAL, x, y);
    }
    // Big lanterns mark how far the open middle runs
    const ring = 20;
    for (let i = 0; i < ring; i++) {
        const angle = ((i + 0.5) * 2 * Math.PI) / ring;
        const x = Math.round(MIDDLE + Math.cos(angle) * (OPEN_MIDDLE + 2));
        const y = Math.round(MIDDLE + Math.sin(angle) * (OPEN_MIDDLE + 2));
        night.solid(pick(rng, BIG_LANTERNS), 2, 2, x, y, Math.floor(rng() * 4));
    }
}

function placeHamlet(night: Night): void {
    const { rng, ground } = night;
    const { x, y } = HAMLET;
    night.stampFacing("burgh_inn", x - 21, y + 5, HAMLET);
    night.stampFacing("canifis_house", x + 5, y + 7, HAMLET);
    night.stampFacing("darkmeyer_house", x - 22, y - 16, HAMLET);
    night.stampFacing("burgh_house", x + 13, y - 11, HAMLET);
    night.stampFacing("burgh_house", x - 7, y + 12, HAMLET);
    // The green, with a heap of bones where the well was
    night.solid(WELL_BONES, 3, 3, x - 2, y - 2);
    for (let i = 0; i < 12; i++) {
        const angle = (i * 2 * Math.PI) / 12;
        const tileX = Math.round(x + Math.cos(angle) * 6);
        const tileY = Math.round(y + Math.sin(angle) * 6);
        if (i % 3 === 0) {
            night.solid(pick(rng, BIG_LANTERNS), 2, 2, tileX, tileY, Math.floor(rng() * 4));
        } else {
            night.dress(pick(rng, CANDLES), LOC_NORMAL, tileX, tileY);
        }
    }
    // Webs on the hamlet's corners
    for (let i = 0; i < 14; i++) {
        const tileX = x - 24 + Math.floor(rng() * 48);
        const tileY = y - 20 + Math.floor(rng() * 40);
        if (!ground.footprint[ground.tile(tileX, tileY)]) {
            night.solid(WEB, 1, 1, tileX, tileY, Math.floor(rng() * 4), 1);
        }
    }
}

function placeGraveyard(night: Night): void {
    const { rng, ground } = night;
    const low = 22;
    const { x, y } = GRAVEYARD;
    // Fence round it, with a way through in the middle of each side and at each corner
    const open = (along: number) => Math.abs(along) < 4 || Math.abs(along) > low - 3;
    const fence = (tileX: number, tileY: number, rotation: number) => {
        ground.grid.locs.push({
            id: FENCE,
            type: LOC_WALL,
            rotation,
            level: 0,
            x: tileX,
            y: tileY,
        });
    };
    for (let along = -low; along <= low; along++) {
        if (!open(along)) {
            fence(x + along, y - low, WALL_SOUTH);
            fence(x + along, y + low, WALL_NORTH);
            fence(x - low, y + along, WALL_WEST);
            fence(x + low, y + along, WALL_EAST);
        }
    }
    // The mausoleums look down the cross of paths
    night.solid(MAUSOLEUM, 3, 3, x - 1, y + 14, 0, 1);
    night.solid(MAUSOLEUM, 3, 3, x - 15, y + 14, 0, 1);
    night.solid(MAUSOLEUM, 3, 3, x + 13, y + 14, 0, 1);
    for (let row = y - 19; row <= y + 10; row += 4) {
        for (let column = x - 19; column <= x + 18; column += 3) {
            if (Math.abs(column - x) < 4 || Math.abs(row - y) < 5 || rng() < 0.15) {
                continue;
            }
            const roll = rng();
            const [id, sizeX, sizeY] = pick(rng, roll < 0.14 ? COFFINS : GRAVES);
            night.solid(id, sizeX, sizeY, column, row);
            if (rng() < 0.3) {
                night.dress(pick(rng, CANDLES), LOC_NORMAL, column, row - 1);
            }
        }
    }
}

function placeFarm(night: Night): void {
    const { rng } = night;
    const { x, y } = FARM;
    night.stampFacing("hosidius_barn", x - 22, y - 10, FARM);
    for (const [hayX, hayY] of [
        [-20, 6],
        [-16, 11],
        [-12, 15],
        [-20, -16],
    ]) {
        night.solid(HAY, 2, 2, x + hayX, y + hayY, Math.floor(rng() * 4), 1);
    }
    night.solid(HAY_BALES, 1, 2, x - 21, y + 12);
    night.solid(HAY_BALES, 1, 2, x - 11, y + 8);
    night.solid(PLOUGH, 3, 2, x - 16, y - 16);
}

function placeHollow(night: Night): void {
    const { rng } = night;
    const { x, y } = HOLLOW;
    night.stampFacing("burgh_house", x + 8, y + 6, HOLLOW);
    night.solid(CAULDRON, 2, 2, x - 1, y - 1);
    for (const [potX, potY] of [
        [-6, 3],
        [5, -5],
        [-4, -7],
    ]) {
        night.solid(BREW, 1, 1, x + potX, y + potY);
    }
    for (let i = 0; i < 6; i++) {
        const angle = (i * 2 * Math.PI) / 6 + 0.4;
        const tileX = Math.round(x + Math.cos(angle) * 14);
        const tileY = Math.round(y + Math.sin(angle) * 14);
        const id = i % 3 === 2 ? GALLOWS : pick(rng, GIBBETS);
        night.solid(id, 2, 2, tileX, tileY, Math.floor(rng() * 4), 1);
    }
    for (let i = 0; i < 10; i++) {
        const tileX = x - 20 + Math.floor(rng() * 40);
        const tileY = y - 20 + Math.floor(rng() * 40);
        night.solid(WEB, 1, 1, tileX, tileY, Math.floor(rng() * 4), 2);
    }
    night.solid(PALE_LANTERNS[0], 2, 2, x + 2, y + 3, 1);
    night.solid(PALE_LANTERNS[1], 2, 2, x - 4, y + 1, 2);
}

// A planted field: rows run east to west, each a ridge of tilled soil two tiles wide with a
// pumpkin every few tiles, and a furrow between them. Everything's walked through, so a field
// can lie across a lane; its fence can't, and stops short of one.
function placeField(night: Night, { x0, y0, x1, y1 }: Field): void {
    const { rng, ground } = night;
    const { underlays, overlays, shapes, rotations } = ground.level0;
    const paint = (x: number, y: number, overlay: number) => {
        const i = ground.tile(x, y);
        underlays[i] = SOIL;
        overlays[i] = overlay;
        shapes[i] = 0;
        rotations[i] = 0;
        ground.reserved[i] = 1;
    };
    for (let y = y0 - TRACK; y <= y1 + TRACK; y++) {
        for (let x = x0 - TRACK; x <= x1 + TRACK; x++) {
            const row = y - y0;
            const inField = x >= x0 && x <= x1 && y >= y0 && y <= y1;
            paint(x, y, !inField ? PATH : row % ROW === ROW - 1 ? FURROW : RIDGE);
        }
    }
    // The ridges stand a little proud, which is what catches the light
    for (let y = y0; y <= y1; y++) {
        if ((y - y0) % ROW === 1) {
            for (let x = x0; x <= x1 + 1; x++) {
                ground.setHeight(x, y, ground.getHeight(x, y) + RIDGE_HEIGHT);
            }
        }
    }
    const midX = (x0 + x1) >> 1;
    const midY = (y0 + y1) >> 1;
    const scarecrows = [
        [(x0 + midX) >> 1, midY],
        [(midX + x1) >> 1, midY],
    ];
    for (let y = y0; y <= y1; y += ROW) {
        for (let x = x0 + 1; x <= x1; x += SPOT) {
            const standing = scarecrows.some(
                ([sx, sy]) => Math.abs(sx - x) < 2 && sy - y >= 0 && sy - y < ROW,
            );
            if (!standing) {
                ground.grid.locs.push({
                    id: pick(rng, FIELD_PUMPKINS),
                    type: LOC_NORMAL,
                    rotation: Math.floor(rng() * 4),
                    level: 0,
                    x,
                    y,
                });
            }
            // Vines between them
            if (x + 1 <= x1 && rng() < 0.7) {
                ground.grid.locs.push({
                    id: FIELD_VINE,
                    type: LOC_FLOOR_DECORATION,
                    rotation: Math.floor(rng() * 4),
                    level: 0,
                    x: x + 1,
                    y,
                });
            }
        }
    }
    for (const [sx, sy] of scarecrows) {
        if (!isLane(sx, sy)) {
            ground.place(
                { id: SCARECROW, type: LOC_NORMAL, rotation: 0, level: 0, x: sx, y: sy },
                1,
                1,
            );
        }
    }
    // Fence round the track, with a gate's width left in the middle of each side
    const fence = (x: number, y: number, rotation: number, along: number, mid: number) => {
        if (!isLane(x, y) && Math.abs(along - mid) > GATE) {
            ground.grid.locs.push({ id: FIELD_FENCE, type: LOC_WALL, rotation, level: 0, x, y });
        }
    };
    for (let x = x0 - TRACK; x <= x1 + TRACK; x++) {
        fence(x, y0 - TRACK, WALL_SOUTH, x, midX);
        fence(x, y1 + TRACK, WALL_NORTH, x, midX);
    }
    for (let y = y0 - TRACK; y <= y1 + TRACK; y++) {
        fence(x0 - TRACK, y, WALL_WEST, y, midY);
        fence(x1 + TRACK, y, WALL_EAST, y, midY);
    }
}

// What's left of the arena: bones, lanterns, candles and scrub underfoot, and dead trees
// wherever they're out of the way
function dressArena(night: Night): void {
    const { rng } = night;
    for (let y = ARENA_MIN; y <= ARENA_MAX; y++) {
        for (let x = ARENA_MIN; x <= ARENA_MAX; x++) {
            const roll = rng();
            if (roll < 0.05) {
                night.dress(pick(rng, SCRUB), LOC_FLOOR_DECORATION, x, y);
            } else if (roll < 0.062) {
                night.dress(pick(rng, BONES), LOC_NORMAL, x, y);
            } else if (roll < 0.07) {
                night.dress(pick(rng, LANTERNS), LOC_NORMAL, x, y);
            } else if (roll < 0.073) {
                night.dress(pick(rng, CANDLES), LOC_NORMAL, x, y);
            } else if (roll < 0.074) {
                night.dress(pick(rng, LONG_BONES), LOC_NORMAL, x, y);
            } else if (roll < 0.09) {
                const [id, size] = pick(rng, TREES);
                night.solid(id, size, size, x, y, Math.floor(rng() * 4), 4);
            }
        }
    }
}

// Past the arena's edge: a fence, then a dead wood that goes on until the dark takes it
function placeBoundary(night: Night): void {
    const { rng, ground } = night;
    const fence = (x: number, y: number, rotation: number) => {
        ground.grid.locs.push({ id: FENCE, type: LOC_WALL, rotation, level: 0, x, y });
    };
    for (let along = ARENA_MIN; along <= ARENA_MAX; along++) {
        fence(along, ARENA_MIN, WALL_SOUTH);
        fence(along, ARENA_MAX, WALL_NORTH);
        fence(ARENA_MIN, along, WALL_WEST);
        fence(ARENA_MAX, along, WALL_EAST);
    }
    for (let y = 1; y < SIZE - 2; y++) {
        for (let x = 1; x < SIZE - 2; x++) {
            if (inArena(x, y)) {
                continue;
            }
            const [edgeX, edgeY] = toEdge(x, y);
            const out = -Math.min(edgeX, edgeY);
            const chance = out < 14 ? 0.1 : 0.035;
            const roll = rng();
            if (roll < chance) {
                const [id, size] = pick(rng, TREES);
                const clear = !inArena(x + size - 1, y) && !inArena(x, y + size - 1);
                if (
                    clear &&
                    !inArena(x + size - 1, y + size - 1) &&
                    ground.isClear(x, y, size, size)
                ) {
                    ground.place(
                        { id, type: LOC_NORMAL, rotation: Math.floor(rng() * 4), level: 0, x, y },
                        size,
                        size,
                    );
                }
            } else if (roll < chance + 0.02) {
                night.dress(pick(rng, LANTERNS), LOC_NORMAL, x, y);
            }
        }
    }
}

// Blocks what's shut in, and holds the map to its lanes
function finish(night: Night): void {
    const { context, ground } = night;
    const rect = { x0: ARENA_MIN, y0: ARENA_MIN, x1: ARENA_MAX, y1: ARENA_MAX };
    const collision = getCollisionFlags(ground.grid, context.locs);
    const { spawn } = HALLOWED_NIGHT;
    const reached = findReachable(collision, SIZE, SIZE, rect, spawn.x, spawn.y);
    const stranded = findStranded(collision, SIZE, rect, reached);
    if (stranded.length > MAX_SEALED) {
        throw new Error(`Hallowed Night: ${stranded.length} tiles cut off`);
    }
    for (const i of stranded) {
        blockTile(ground.grid, i);
    }
    const open = reached.reduce((sum, tile) => sum + tile, 0);
    for (let y = ARENA_MIN; y <= ARENA_MAX; y++) {
        for (let x = ARENA_MIN; x <= ARENA_MAX; x++) {
            const i = ground.tile(x, y);
            if (isLane(x, y) && (!reached[i] || ground.level0.flags[i] & TILE_BLOCKED)) {
                throw new Error(`Hallowed Night: something solid in a lane at ${x},${y}`);
            }
        }
    }
    if (open < 0.9 * (ARENA_MAX - ARENA_MIN + 1) ** 2) {
        throw new Error(`Hallowed Night: only ${open} open tiles`);
    }
}

function buildDetail(context: BuildContext): GeneratedMap {
    const night = new Night(context);
    paintGround(night);
    paintLines(night);
    FIELDS.forEach((field) => placeField(night, field));
    placeHamlet(night);
    placeGraveyard(night);
    placeFarm(night);
    placeHollow(night);
    placeCircle(night);
    placeBoundary(night);
    dressArena(night);
    finish(night);
    const { ground } = night;
    return {
        grid: ground.grid,
        footprint: ground.footprint,
        roadTiles: new Uint8Array(SIZE * SIZE),
        lines: [],
        buildings: [],
        landmarks: [],
        passes: [],
        walkSlope: 12,
        caves: [],
        falls: [],
        waterfalls: [],
    };
}

export const HALLOWED_NIGHT: MapRecipe = {
    id: "halloween",
    mapX: 72,
    mapY: 72,
    squaresX: SQUARES,
    squaresY: SQUARES,
    margin: MARGIN,
    // Just south of the ritual circle
    spawn: { x: 160, y: 136 },
    build: (context) => buildDetail(context).grid,
    detail: buildDetail,
};
