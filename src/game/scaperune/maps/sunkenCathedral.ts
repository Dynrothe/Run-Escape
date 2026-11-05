import { Ground } from "../Ground";
import { SealRegion, assertReachable, sealFrom } from "../collision";
import { MAP_SQUARE_SIZE, TILE_BLOCKED } from "../format";
import type { GeneratedMap } from "../generator";
import { LOC_NORMAL } from "../mapBuild";
import { createRng } from "../noise";
import { cutPrefab } from "../prefab";
import { BuildContext, MapPoint, MapRecipe } from "../recipe";

// The sunken cathedral, under Ice Mountain in the Lassar Undercity, where the Whisperer leads the
// Silent Choir: the Bell Choir's arena (docs/design/the-bell-choir.md). The real cathedral is cut
// whole from map square 41,99 (world 2624,6336): a broken octagon of gothic walls standing in the
// undercity's lake, its nave the dark water inside them. What the fight needs is laid in it:
// - the tenor bell (the Cloister Bell, 4 by 4) in the north doorway, which keeps the beat;
// - four great bells in the octagon's corners, struck and rung back;
// - three rows of sunken pews across the nave's south half, a five-wide aisle up the middle and
//   one down each side, so where a player waits for the Psalm's surge matters;
// - and a second Sunken Steeple out in the lake to the north, the drowned bell tower behind the
//   tenor. The choir (six Lost Souls) stand in the water by the side walls; the fight draws them.
// The bells are drawn by the fight too, as they lift and strike: their tiles are blocked here and
// their models left out (SUNKEN_CATHEDRAL.drawn). Everything outside the nave is sealed: the lake
// is water no one can walk.
//
// Arena tiles below are the cut's own, 0 to 63 from world 2624,6336 (the arena square), which is
// what SUNKEN_CATHEDRAL exports. The grid has a square of the lake round it.

const MAP_X = 78;
const MAP_Y = 80;
const SQUARES = 3;
const MARGIN = 1;
const SIZE = SQUARES * MAP_SQUARE_SIZE;
// The grid tile of arena tile 0,0
const A = MARGIN * MAP_SQUARE_SIZE;
// The real square, and its height
const CUT_X = 41 * MAP_SQUARE_SIZE;
const CUT_Y = 99 * MAP_SQUARE_SIZE;
const HEIGHT = 26;

// The undercity's lake, as the map files number it (one above the cache's 291), and the floor
// under it
const LAKE = 292;
const LAKE_UNDERLAY = 45;
// The cathedral's water rings (animated, 3 by 3): one blocks, the other doesn't
const SOLID_RING = 48324;
const RING = 48323;
const RINGS = 14;

type Rect = { x0: number; y0: number; x1: number; y1: number };
type Tile = { x: number; y: number };
export type Solid = [id: number, sizeX: number, sizeY: number];

// The Cloister Bell (Grotesque Guardians' bell, its 4 by 4 version), the sunken pews, the
// Sunken Steeple and the cathedral's candle stands
export const CLOISTER_BELL: Solid = [55814, 4, 4];
const PEW_LONG: Solid = [50136, 3, 1];
const PEW_SHORT: Solid = [62250, 2, 1];
const STEEPLE: Solid = [48327, 9, 9];
const CANDLE: Solid = [49146, 1, 1];
// What the arena's own pieces are, for the tests that build its layout without the cache
export const SOLID_LOCS: Solid[] = [CLOISTER_BELL, PEW_LONG, PEW_SHORT, STEEPLE, CANDLE];

// The real nave's middle (its axis is the middle of tile 32), how far its walls are moved out
// from it, and the octagon of dark water inside them (tile middles within half of the middle,
// and within corner of it, across and up added)
const MIDDLE = { x: 32.5, y: 33.5 };
const WIDEN = 1.3;
const OCTAGON = { half: { x: 16.5, y: 17.5 }, corner: 27 };
// The nave: the octagon's box, from the south doorway to the north. North is +y.
const NAVE: Rect = { x0: 16, y0: 16, x1: 48, y1: 50 };
const AXIS = MIDDLE.x;
// The aisle up the middle, five wide, and the pews' rows either side of it
const AISLE = { x0: 30, x1: 34 };
const PEW_ROWS = [22, 26, 30];
// The tenor, in the north doorway; the great bells, tuned treble to tenor: NE, NW, SE, SW
const TENOR: Tile = { x: 30, y: 48 };
const BELLS: Tile[] = [
    { x: 41, y: 39 },
    { x: 20, y: 39 },
    { x: 41, y: 21 },
    { x: 20, y: 21 },
];
// The choir: three a side, standing in the water by the walls, facing in
const CHOIR_ROWS = [31, 34, 37];
const CHOIR_X = { west: 18, east: 46 };
// She rises in the crossing; the player comes in by the south doorway
const RISE: Tile = { x: 32, y: 37 };
const START: Tile = { x: 32, y: 26 };
// The steeple out in the lake behind the tenor, and candles in the corners
const STEEPLE_AT: Tile = { x: 28, y: 54 };
const CANDLES: Tile[] = [
    { x: 18, y: 44 },
    { x: 46, y: 44 },
    { x: 22, y: 17 },
    { x: 42, y: 17 },
];

// The Psalm's bands: the nave's rows north to south in nine, as even as they go
const BAND_COUNT = 9;
const bands = (() => {
    const rows = NAVE.y1 - NAVE.y0 + 1;
    const list: { y0: number; y1: number }[] = [];
    for (let i = 0; i < BAND_COUNT; i++) {
        const top = NAVE.y1 - Math.floor((i * rows) / BAND_COUNT);
        const bottom = NAVE.y1 - Math.floor(((i + 1) * rows) / BAND_COUNT) + 1;
        list.push({ y0: bottom, y1: top });
    }
    return list;
})();

// What the fight reads, in arena tiles (add origin for world tiles). The fight never hard-codes a
// tile.
export const SUNKEN_CATHEDRAL = {
    // World tile of arena tile 0,0
    origin: { x: (MAP_X + MARGIN) * MAP_SQUARE_SIZE, y: (MAP_Y + MARGIN) * MAP_SQUARE_SIZE },
    nave: NAVE,
    // The boss's arena: the square round the nave (the nave's 27 by 31 in it)
    bossArena: { x: NAVE.x0, y: NAVE.y0, size: NAVE.y1 - NAVE.y0 + 1 },
    rise: RISE,
    start: START,
    tenor: { ...TENOR, size: CLOISTER_BELL[1] },
    bells: BELLS.map((bell) => ({ ...bell, size: CLOISTER_BELL[1] })),
    choir: [
        ...CHOIR_ROWS.map((y) => ({ x: CHOIR_X.west, y, side: -1 as const })),
        ...CHOIR_ROWS.map((y) => ({ x: CHOIR_X.east, y, side: 1 as const })),
    ],
    pews: PEW_ROWS.map((y) => ({ y, x0: AISLE.x0 - 5, x1: AISLE.x1 + 5 })),
    bands,
    axis: AXIS,
    aisle: AISLE,
};

const grid = (tile: Tile): Tile => ({ x: A + tile.x, y: A + tile.y });

// The nave, one region: the open water inside the walls, with nothing walkable outside it
const NAVE_REGION: SealRegion = {
    name: "the nave",
    rect: { x0: A + NAVE.x0, y0: A + NAVE.y0, x1: A + NAVE.x1, y1: A + NAVE.y1 },
    from: grid(RISE),
    min: 900,
};

// Where the game puts her and the player, and what each attack reads, all open and reachable:
// the rise, the start, beside every bell, every one of the choir, and each pew row's aisles
const POINTS: MapPoint[] = [
    { name: "her rise", ...grid(RISE) },
    { name: "the start", ...grid(START) },
    ...BELLS.map((bell, i) => ({
        name: `south of bell ${i}`,
        ...grid({ x: bell.x + 1, y: bell.y - 1 }),
    })),
    ...SUNKEN_CATHEDRAL.choir.map((soul, i) => ({ name: `soul ${i}`, ...grid(soul) })),
    ...PEW_ROWS.flatMap((y) => [
        { name: `the aisle at ${y}`, ...grid({ x: 32, y }) },
        { name: `the west aisle at ${y}`, ...grid({ x: NAVE.x0 + 1, y }) },
        { name: `the east aisle at ${y}`, ...grid({ x: NAVE.x1 - 1, y }) },
    ]),
].map((point) => ({ ...point, region: NAVE_REGION.name }));

// A loc the fight draws in the map's place, in arena tiles
export type FightDrawn = { id: number; x: number; y: number; rotation: number };

class Cathedral {
    readonly ground = new Ground(SIZE, SIZE);
    readonly drawn: FightDrawn[] = [];

    constructor(readonly context: BuildContext) {}

    at(x: number, y: number): number {
        return this.ground.tile(A + x, A + y);
    }

    place([id, sizeX, sizeY]: Solid, x: number, y: number, rotation = 0): void {
        const { ground } = this;
        const [across, deep] = rotation & 1 ? [sizeY, sizeX] : [sizeX, sizeY];
        for (let ty = y; ty < y + deep; ty++) {
            for (let tx = x; tx < x + across; tx++) {
                ground.occupied[this.at(tx, ty)] = 1;
            }
        }
        ground.grid.locs.push({ id, type: LOC_NORMAL, rotation, level: 0, x: A + x, y: A + y });
    }

    // Something the fight draws and animates in its place: its tiles blocked as though it stood
    // there, and its model left out of the map, so the fight's is the only one
    forFight([id, sizeX, sizeY]: Solid, x: number, y: number): void {
        for (let ty = y; ty < y + sizeY; ty++) {
            for (let tx = x; tx < x + sizeX; tx++) {
                const tile = this.at(tx, ty);
                this.ground.occupied[tile] = 1;
                this.ground.level0.flags[tile] |= TILE_BLOCKED;
            }
        }
        this.drawn.push({ id, x, y, rotation: 0 });
    }
}

// The lake everywhere, flat, then the real cathedral over the arena square: its walls moved out
// from its middle by WIDEN (the real nave's too small for four great bells and the pews), and its
// nave's dark water laid over the octagon inside them. The lake and the walls can't be walked.
function shapeGround(cathedral: Cathedral): void {
    const { ground, context } = cathedral;
    for (let y = 0; y <= SIZE; y++) {
        for (let x = 0; x <= SIZE; x++) {
            ground.setHeight(x, y, HEIGHT);
        }
    }
    const level = ground.level0;
    for (let i = 0; i < SIZE * SIZE; i++) {
        level.underlays[i] = LAKE_UNDERLAY;
        level.overlays[i] = LAKE;
        level.flags[i] |= TILE_BLOCKED;
    }
    const cut = cutPrefab(context.maps, CUT_X, CUT_Y, MAP_SQUARE_SIZE, MAP_SQUARE_SIZE);
    const floor = cut.levels[0].underlays[32 + 33 * MAP_SQUARE_SIZE];
    const walls = cut.locs.filter((loc) => isWall(loc.id, loc.type, loc.x, loc.y, context));
    ground.stamp(cut, A, A, {
        floor: "all",
        feather: 0,
        flatten: true,
        height: HEIGHT,
        skipLoc: (loc) =>
            walls.includes(loc) || (loc.id === SOLID_RING && inOctagon(loc.x + 1, loc.y + 1)),
    });
    // The water's rings in the nave are the ones that can be walked through, and more of them
    for (const loc of cut.locs) {
        if (loc.id === SOLID_RING && inOctagon(loc.x + 1, loc.y + 1)) {
            ground.grid.locs.push({ ...loc, id: RING, x: A + loc.x, y: A + loc.y });
        }
    }
    const rng = createRng(4176);
    for (let i = 0; i < RINGS; i++) {
        const x = NAVE.x0 + Math.floor(rng() * (NAVE.x1 - NAVE.x0 - 2));
        const y = NAVE.y0 + Math.floor(rng() * (NAVE.y1 - NAVE.y0 - 2));
        if (inOctagon(x, y) && inOctagon(x + 2, y + 2)) {
            const rotation = Math.floor(rng() * 4);
            ground.grid.locs.push({
                id: RING,
                type: LOC_NORMAL,
                rotation,
                level: 0,
                x: A + x,
                y: A + y,
            });
        }
    }
    for (const wall of walls) {
        const info = context.locs(wall.id);
        const [across, deep] =
            wall.rotation & 1 ? [info.sizeY, info.sizeX] : [info.sizeX, info.sizeY];
        const middleX = wall.x + across / 2;
        const middleY = wall.y + deep / 2;
        const x = Math.round(MIDDLE.x + (middleX - MIDDLE.x) * WIDEN - across / 2);
        const y = Math.round(MIDDLE.y + (middleY - MIDDLE.y) * WIDEN - deep / 2);
        ground.grid.locs.push({ ...wall, x: A + x, y: A + y });
    }
    // The nave's dark water inside the octagon, and the lake round it
    for (let y = 0; y < MAP_SQUARE_SIZE; y++) {
        for (let x = 0; x < MAP_SQUARE_SIZE; x++) {
            const tile = cathedral.at(x, y);
            if (inOctagon(x, y)) {
                // Shallow: the lake's own water, walked through
                level.overlays[tile] = LAKE;
                level.underlays[tile] = floor || LAKE_UNDERLAY;
                level.flags[tile] &= ~TILE_BLOCKED;
            } else {
                level.overlays[tile] = LAKE;
                level.flags[tile] |= TILE_BLOCKED;
            }
        }
    }
}

// The cathedral's own wall pieces (the broken gothic walls and pillars), near enough its middle to
// be the octagon's
function isWall(id: number, type: number, x: number, y: number, context: BuildContext): boolean {
    if (type !== 10 && type !== 11) {
        return false;
    }
    if (!((id >= 48312 && id <= 48321) || (id >= 47643 && id <= 47645))) {
        return false;
    }
    const info = context.locs(id);
    const dx = x + info.sizeX / 2 - MIDDLE.x;
    const dy = y + info.sizeY / 2 - MIDDLE.y;
    return dx * dx + dy * dy < 24 * 24;
}

// Whether a tile's in the nave's octagon
function inOctagon(x: number, y: number): boolean {
    const dx = Math.abs(x + 0.5 - MIDDLE.x);
    const dy = Math.abs(y + 0.5 - MIDDLE.y);
    return dx <= OCTAGON.half.x && dy <= OCTAGON.half.y && dx + dy <= OCTAGON.corner;
}

// The bells (the fight's), the pews, the steeple and the candles
function placeFurnishings(cathedral: Cathedral): void {
    cathedral.forFight(CLOISTER_BELL, TENOR.x, TENOR.y);
    for (const bell of BELLS) {
        cathedral.forFight(CLOISTER_BELL, bell.x, bell.y);
    }
    // Each row's west block a long pew and a short one out from the aisle, and the east the same
    // mirrored: five either side of the aisle
    for (const y of PEW_ROWS) {
        cathedral.place(PEW_SHORT, AISLE.x0 - 2, y);
        cathedral.place(PEW_LONG, AISLE.x0 - 5, y);
        cathedral.place(PEW_SHORT, AISLE.x1 + 1, y);
        cathedral.place(PEW_LONG, AISLE.x1 + 3, y);
    }
    cathedral.place(STEEPLE, STEEPLE_AT.x, STEEPLE_AT.y);
    const rng = createRng(4152);
    for (const candle of CANDLES) {
        cathedral.place(CANDLE, candle.x, candle.y, Math.floor(rng() * 4));
    }
}

function finish(cathedral: Cathedral): void {
    const { context, ground } = cathedral;
    const sealed = sealFrom(ground.grid, context.locs, [NAVE_REGION], {
        outside: "block",
        label: "Sunken cathedral",
    });
    assertReachable(sealed, POINTS, "Sunken cathedral");
}

// noSeal: as it's built, before the nave's sealed and checked (for looking at it while it's laid out)
export function buildSunkenCathedral(
    context: BuildContext,
    options: { noSeal?: boolean; bare?: boolean } = {},
): {
    map: GeneratedMap;
    drawn: FightDrawn[];
} {
    const cathedral = new Cathedral(context);
    shapeGround(cathedral);
    if (!options.bare) {
        placeFurnishings(cathedral);
    }
    if (!options.noSeal) {
        finish(cathedral);
    }
    const { ground } = cathedral;
    const map: GeneratedMap = {
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
        // The whole cut is the real place's, ground and all
        designed: [{ x0: A, y0: A, x1: A + MAP_SQUARE_SIZE - 1, y1: A + MAP_SQUARE_SIZE - 1 }],
    };
    return { map, drawn: cathedral.drawn };
}

export const SUNKEN_CATHEDRAL_RECIPE: MapRecipe = {
    id: "bellchoir",
    // Clear of the Sanctuary (78 to 80, 72 to 74), the Owl's Court (82 to 84, 76 to 78), the
    // Theatre (78 to 85, 66 to 72) and Vardhelm (84 on, 80 on): see CLAUDE.md's traps
    mapX: MAP_X,
    mapY: MAP_Y,
    squaresX: SQUARES,
    squaresY: SQUARES,
    margin: MARGIN,
    spawn: grid(START),
    build: (context) => buildSunkenCathedral(context).map.grid,
    detail: (context) => buildSunkenCathedral(context).map,
    regions: [NAVE_REGION],
    points: POINTS,
};
