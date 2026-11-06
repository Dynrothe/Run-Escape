import { Ground } from "../Ground";
import { SealRegion, assertReachable, sealFrom } from "../collision";
import { MAP_SQUARE_SIZE, TILE_BLOCKED } from "../format";
import type { GeneratedMap } from "../generator";
import { Rng, createRng } from "../noise";
import { BuildContext, MapPoint, MapRecipe } from "../recipe";

// The Sunken Quarry: where the Quarry Colossus fights, on three shelves cut down a quarry's face
// over a chasm (docs/design/quarry-colossus.md). The fight's floor (content/quarryColossus.ts)
// is the game's own, drawn and moved by it (MapDef.floor, client/FloorView.ts), so here every
// shelf's fight floor is the hidden floor that draws nothing, at its height; everything else is
// scenery only, every tile of it blocked:
// - North, the cut face rises off the top shelf to the top of the screen (the map-depth doc's
//   "cliff wall north"), with the colossus's unfinished twin carved into it and scaffolds at its
//   foot ("towering temple north").
// - The shelves step down to the south, a Sepulchre level (65, 4 tiles) each, with a sheer face
//   between them that looks at the camera, so from one shelf the next is in sight below ("south
//   drop"); the lowest looks over the chasm, lava glowing at its bottom.
// - East, the quarry's spoil steps away in terraces of 32 every 4 tiles, rubble and boulders
//   on them; west, its wall stands a few tiles over the shelves.
//
// Arena tiles below are the arena square's own, 0 to 63 from its south-west corner, which is what
// QUARRY exports. The grid has a square of void round it.

const MAP_X = 73;
const MAP_Y = 80;
const SQUARES = 3;
const MARGIN = 1;
const SIZE = SQUARES * MAP_SQUARE_SIZE;
// The grid tile of arena tile 0,0
const A = MARGIN * MAP_SQUARE_SIZE;

type Rect = { x0: number; y0: number; x1: number; y1: number };
type Tile = { x: number; y: number };

// The shelves, top (north) to bottom, each smaller and a level lower; between each and the next a
// face a tile deep. Heights in height units, 16 a tile.
const SHELVES: { rect: Rect; height: number }[] = [
    { rect: { x0: 17, y0: 37, x1: 46, y1: 51 }, height: 225 },
    { rect: { x0: 19, y0: 23, x1: 44, y1: 35 }, height: 160 },
    { rect: { x0: 21, y0: 10, x1: 42, y1: 21 }, height: 95 },
];
// The rock either side of a shelf, at its height, out to these columns
const ROCK_X0 = 11;
const ROCK_X1 = 50;
// The cut face north of the top shelf: it climbs from the shelf to the byte's top over this many
// rows, starting this many rows north of the shelf
const CLIFF_FROM = 53;
const CLIFF_ROWS = 2;
const TOP = 255;
// The chasm's floor, lava, south of the lowest shelf
const CHASM = 0;

// The fight's floor box, in arena tiles: every shelf and the faces between
const FLOOR: Rect = { x0: 17, y0: 10, x1: 46, y1: 51 };

// Where things are on each shelf, in arena tiles. He rises in the top shelf's middle; the player
// starts by its south edge, so the next shelf's in sight below them from the first.
const RISES: Tile[] = [
    { x: 31, y: 45 },
    { x: 31, y: 30 },
    { x: 31, y: 17 },
];
const STARTS: Tile[] = [
    { x: 31, y: 40 },
    { x: 31, y: 25 },
    { x: 31, y: 12 },
];

// Pillars of uncut rock the quarrymen left (floor pillars, 2 by 2 from x, y): cover from his
// boulders, until they break
const PILLARS: Tile[][] = [
    [
        { x: 21, y: 44 },
        { x: 41, y: 44 },
        { x: 26, y: 48 },
        { x: 36, y: 48 },
    ],
    [
        { x: 22, y: 30 },
        { x: 40, y: 30 },
        { x: 31, y: 34 },
    ],
    [
        { x: 25, y: 15 },
        { x: 37, y: 15 },
    ],
];

// The fault lines on each shelf (fragile tiles he cracks, and which fall when cracked twice):
// short seams, none from edge to edge, so a fallen one never cuts a shelf in two
const seam = (x: number, y: number, dx: number, dy: number, length: number): Tile[] =>
    Array.from({ length }, (_, i) => ({ x: x + dx * i, y: y + dy * i }));
const FAULTS: Tile[][][] = [
    [seam(19, 38, 1, 1, 6), seam(44, 38, -1, 1, 6), seam(28, 43, 1, 0, 8)],
    [seam(21, 24, 1, 1, 5), seam(42, 24, -1, 1, 5), seam(27, 30, 1, 0, 9)],
    [seam(23, 11, 1, 1, 4), seam(40, 11, -1, 1, 4), seam(28, 18, 1, 0, 7)],
];

// The crane plates: a plate on a shelf's edge, its crane standing off the edge beside it
const PLATES: Tile[][] = [
    [
        { x: 18, y: 45 },
        { x: 45, y: 45 },
    ],
    [{ x: 43, y: 30 }],
    [{ x: 22, y: 19 }],
];

// What the fight reads: where everything is, in arena tiles (add origin for world tiles)
export const QUARRY = {
    // World tile of arena tile 0,0
    origin: { x: (MAP_X + MARGIN) * MAP_SQUARE_SIZE, y: (MAP_Y + MARGIN) * MAP_SQUARE_SIZE },
    floor: FLOOR,
    shelves: SHELVES.map(({ rect, height }) => ({ ...rect, height })),
    rises: RISES,
    starts: STARTS,
    pillars: PILLARS,
    faults: FAULTS,
    plates: PLATES,
    // The top shelf's square, for the intro (its middle's where he rises)
    bossArena: { x: 17, y: 37, size: 15 },
};

// MapDef.bossArena, in world tiles: a square on the top shelf round where he rises
export const QUARRY_BOSS_ARENA = {
    baseX: QUARRY.origin.x + RISES[0].x - 7,
    baseY: QUARRY.origin.y + RISES[0].y - 7,
    size: 15,
};

// The kit, as the cache's ids. Overlays are the map files' numbers, one over the cache's.
// Walked on, drawing nothing (the fight draws its floor)
const HIDDEN_OVERLAY = 359;
// Bare rock (grey), dark rock for the faces, and lava
const ROCK_OVERLAY = 10;
const FACE_OVERLAY = 10;
const LAVA_OVERLAY = 19;
const CHASM_OVERLAY = 32;
// How the lava's seam winds along the chasm's floor, a column at a time
const SEAM_WIND = [0, 0, 1, 1, 2, 2, 1, 0, 0, -1, -2, -2, -1, -1, 0];
// Grey earth under the rock
const UNDERLAY = 63;

// Scenery, all on blocked tiles. [id, tiles across, tiles deep]
const LOC_NORMAL = 10;
const WHITE_ROCK = 50964; // a pale rock face, 6 by 3, 9.7 tiles tall
const STATUE = 37818; // a giant statue, 6 by 4, 8.8 tiles tall: his unfinished twin
const SCAFFOLDS = [17635, 744]; // wooden scaffolding, 3 by 1 and 2 by 1
const CRANE = 18501; // a crane, 2 by 4
const BOULDERS = [10790, 40897, 5842]; // 2 by 2: a grey boulder, rubble, rubble
const ROCKSLIDES = [11434, 12582]; // 2 by 2 heaps of rubble
const MINE_CART = 17966; // 1 by 1
const FACE_RUBBLE = [6703, 3753]; // boulders, 1 by 1
// Their sizes unturned, for a build without the cache (the map's test)
export const QUARRY_LOC_SIZES: [id: number, sizeX: number, sizeY: number][] = [
    [WHITE_ROCK, 6, 3],
    [STATUE, 6, 4],
    [SCAFFOLDS[0], 3, 1],
    [SCAFFOLDS[1], 2, 1],
    [CRANE, 2, 4],
    ...BOULDERS.map((id): [number, number, number] => [id, 2, 2]),
    ...ROCKSLIDES.map((id): [number, number, number] => [id, 2, 2]),
    [MINE_CART, 1, 1],
    ...FACE_RUBBLE.map((id): [number, number, number] => [id, 1, 1]),
];

const pick = <T>(rng: Rng, from: T[]): T => from[Math.floor(rng() * from.length)];
const inRect = (r: Rect, x: number, y: number) => x >= r.x0 && x <= r.x1 && y >= r.y0 && y <= r.y1;

// Which shelf's band a row of corners is in (0 top, 2 bottom), or -1 for the chasm, or 3 for the
// cut face north of the top shelf. A band runs from its shelf's south edge up to the next's.
function band(cy: number): number {
    if (cy >= CLIFF_FROM) {
        return 3;
    }
    for (let i = 0; i < SHELVES.length; i++) {
        if (cy >= SHELVES[i].rect.y0) {
            return i;
        }
    }
    return -1;
}

// A corner's height (arena corners)
function cornerHeight(cx: number, cy: number): number {
    const b = band(cy);
    if (b === 3) {
        return Math.min(
            TOP,
            SHELVES[0].height +
                Math.round(((cy - CLIFF_FROM + 1) * (TOP - SHELVES[0].height)) / CLIFF_ROWS),
        );
    }
    if (b === -1) {
        return CHASM;
    }
    const shelf = SHELVES[b].height;
    // West, the quarry's wall stands over the shelves; east, its spoil steps away
    if (cx < ROCK_X0) {
        return Math.min(TOP, shelf + Math.min(4, ROCK_X0 - cx) * 16);
    }
    if (cx > ROCK_X1) {
        return Math.max(CHASM, shelf - Math.ceil((cx - ROCK_X1) / 4) * 32);
    }
    return shelf;
}

class Quarry {
    readonly ground = new Ground(SIZE, SIZE);
    readonly rng = createRng(7301);
    // Tiles something's already standing on (arena tiles, x + y * 64)
    private readonly taken = new Set<number>();

    // A loc at an arena tile, unless something's already on its footprint
    put(id: number, x: number, y: number, rotation = 0): void {
        const size = QUARRY_LOC_SIZES.find(([k]) => k === id);
        const [w, h] = size ? (rotation & 1 ? [size[2], size[1]] : [size[1], size[2]]) : [1, 1];
        const tiles: number[] = [];
        for (let dy = 0; dy < h; dy++) {
            for (let dx = 0; dx < w; dx++) {
                tiles.push(x + dx + (y + dy) * MAP_SQUARE_SIZE);
            }
        }
        if (tiles.some((t) => this.taken.has(t))) {
            return;
        }
        tiles.forEach((t) => this.taken.add(t));
        this.ground.grid.locs.push({
            id,
            type: LOC_NORMAL,
            rotation,
            level: 0,
            x: A + x,
            y: A + y,
        });
    }
}

// The heights, and what every tile is: a shelf's fight floor, rock, a face, or lava
function shapeGround(quarry: Quarry): void {
    const { ground } = quarry;
    for (let y = 0; y <= SIZE; y++) {
        for (let x = 0; x <= SIZE; x++) {
            ground.setHeight(x, y, cornerHeight(x - A, y - A));
        }
    }
    const { overlays, underlays, flags } = ground.level0;
    for (let y = 0; y < SIZE; y++) {
        for (let x = 0; x < SIZE; x++) {
            const i = ground.tile(x, y);
            const ax = x - A;
            const ay = y - A;
            const shelf = SHELVES.some(({ rect }) => inRect(rect, ax, ay));
            const h = [
                ground.getHeight(x, y),
                ground.getHeight(x + 1, y),
                ground.getHeight(x, y + 1),
                ground.getHeight(x + 1, y + 1),
            ];
            const rise = Math.max(...h) - Math.min(...h);
            underlays[i] = UNDERLAY;
            if (shelf) {
                overlays[i] = HIDDEN_OVERLAY;
                continue;
            }
            flags[i] |= TILE_BLOCKED;
            if (h.every((v) => v === CHASM)) {
                // The chasm's floor, far down: dark rock with lava running through it in a
                // winding seam, nothing past it
                const seam = Math.abs(ay - 5 - SEAM_WIND[ax % SEAM_WIND.length]) <= 1;
                const floor = ay >= 2 && ay <= 8 && ax >= 12 && ax <= 51;
                overlays[i] = !floor ? 0 : seam ? LAVA_OVERLAY : CHASM_OVERLAY;
                if (overlays[i] === 0) {
                    underlays[i] = 0;
                }
            } else {
                overlays[i] = rise > 12 ? FACE_OVERLAY : ROCK_OVERLAY;
            }
        }
    }
}

// The cut face north: the unfinished statue carved into it over the top shelf's middle, pale rock
// faces either side, scaffolds at its foot
function placeCliff(quarry: Quarry): void {
    quarry.put(STATUE, 29, CLIFF_FROM + CLIFF_ROWS, 0);
    for (const x of [12, 19, 39, 46]) {
        quarry.put(WHITE_ROCK, x, CLIFF_FROM + CLIFF_ROWS + 1, 0);
    }
    [20, 26, 36, 42].forEach((x, i) => quarry.put(SCAFFOLDS[i % 2], x, SHELVES[0].rect.y1 + 1, 0));
}

// The rock beside each shelf, and the spoil heaps stepping away east: boulders, rubble and a cart
function placeRock(quarry: Quarry): void {
    const { rng } = quarry;
    for (let b = 0; b < SHELVES.length; b++) {
        const { rect } = SHELVES[b];
        // Along the shelf's sides, on the rock beside it
        for (let y = rect.y0 + 1; y < rect.y1 - 1; y += 4) {
            quarry.put(pick(rng, ROCKSLIDES), rect.x0 - 3, y, Math.floor(rng() * 4));
            quarry.put(pick(rng, ROCKSLIDES), rect.x1 + 2, y + 2, Math.floor(rng() * 4));
        }
        // The spoil terraces east
        for (let y = rect.y0; y < rect.y1; y += 5) {
            for (let x = ROCK_X1 + 2; x < 62; x += 5) {
                if (rng() < 0.6) {
                    quarry.put(pick(rng, BOULDERS), x, y + (x % 3), Math.floor(rng() * 4));
                }
            }
        }
        quarry.put(MINE_CART, rect.x1 + 2, rect.y0 + 1, 1);
    }
    // Rubble at the foot of each face between the shelves, fallen off the shelf above
    for (let b = 1; b < SHELVES.length; b++) {
        const face = SHELVES[b].rect.y1 + 1;
        for (let x = ROCK_X0 + 1; x < ROCK_X1; x += 5) {
            quarry.put(
                pick(rng, FACE_RUBBLE),
                x + Math.floor(rng() * 3),
                face,
                Math.floor(rng() * 4),
            );
        }
    }
    // The wall west: pale rock faces along it
    for (let y = 12; y < 50; y += 7) {
        quarry.put(WHITE_ROCK, 2, y, 1);
    }
}

// A crane beside each plate, off the shelf's edge, its boom over the shelf
function placeCranes(quarry: Quarry): void {
    PLATES.forEach((plates, b) => {
        for (const plate of plates) {
            const west = plate.x < SHELVES[b].rect.x0 + 4;
            // Turned a quarter, it's 4 across and 2 deep: clear of the shelf either side
            quarry.put(CRANE, west ? plate.x - 5 : plate.x + 2, plate.y - 1, west ? 1 : 3);
        }
    });
}

const grid = (tile: Tile): Tile => ({ x: A + tile.x, y: A + tile.y });

// Each shelf's its own region: a separate piece of floor
const REGIONS: SealRegion[] = SHELVES.map(({ rect }, i) => ({
    name: `shelf ${i + 1}`,
    rect: { x0: A + rect.x0, y0: A + rect.y0, x1: A + rect.x1, y1: A + rect.y1 },
    from: grid(STARTS[i]),
    min: (rect.x1 - rect.x0 + 1) * (rect.y1 - rect.y0 + 1),
    maxSealed: 0,
}));

// Where the game puts the player and him on each shelf, and every plate
const POINTS: MapPoint[] = SHELVES.flatMap((_, i) => [
    { name: `his rise on shelf ${i + 1}`, ...grid(RISES[i]), region: REGIONS[i].name },
    { name: `the start on shelf ${i + 1}`, ...grid(STARTS[i]), region: REGIONS[i].name },
    ...PLATES[i].map((plate, k) => ({
        name: `plate ${k + 1} on shelf ${i + 1}`,
        ...grid(plate),
        region: REGIONS[i].name,
    })),
]);

export function buildQuarry(context: BuildContext): GeneratedMap {
    const quarry = new Quarry();
    shapeGround(quarry);
    placeCliff(quarry);
    placeCranes(quarry);
    placeRock(quarry);
    const { ground } = quarry;
    const sealed = sealFrom(ground.grid, context.locs, REGIONS, {
        outside: "block",
        label: "Sunken Quarry",
    });
    assertReachable(sealed, POINTS, "Sunken Quarry");
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

export const QUARRY_RECIPE: MapRecipe = {
    id: "quarry_colossus",
    // Clear of Hallowed Night (72 to 76, 72 to 76) and Kalua's Wake (72 to 77, 88 on)
    mapX: MAP_X,
    mapY: MAP_Y,
    squaresX: SQUARES,
    squaresY: SQUARES,
    margin: MARGIN,
    spawn: grid(STARTS[0]),
    build: (context) => buildQuarry(context).grid,
    detail: buildQuarry,
    regions: REGIONS,
    points: POINTS,
};
