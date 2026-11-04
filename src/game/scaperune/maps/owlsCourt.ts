import { Ground, markWhole } from "../Ground";
import { SealRegion, assertReachable, sealFrom } from "../collision";
import { MAP_SQUARE_SIZE, TILE_BLOCKED } from "../format";
import type { GeneratedMap } from "../generator";
import {
    LOC_FLOOR_DECORATION,
    LOC_NORMAL,
    LOC_WALL,
    WALL_EAST,
    WALL_SOUTH,
    WALL_WEST,
} from "../mapBuild";
import { Rng, createRng } from "../noise";
import { Placer } from "../placer";
import { BuildContext, MapPoint, MapRecipe } from "../recipe";

// The Owl's Court: where Justiciar Zachariah, the Justiciar of the Owl, puts the player on trial.
// A floating stone court hung in the Hallowed Sepulchre's black void, built from the Sepulchre's
// own kit as its floors are built (the deep dive is plans/zachariah/sepulchre.md on the team's VM):
// - Every walkway is the cache's hidden floor with a type 22 stone tile on each tile, and nothing
//   at all beside it, so the void is the renderer's black.
// - Each walkway has the Sepulchre's edge lip on the void side of every edge, and its tall stone
//   wall hanging under every edge the camera can see (LocOverrides.ts lowers 38924, the wall the
//   Sepulchre stands under its walkways a level down, so here it hangs from the edge).
// - A lower walkway runs round it all 4 tiles down, as the Sepulchre's floors stack.
// The court is Floors 3 and 4's blue-grey stone and gold (the Owl's floor), with Floor 5's orange
// lilies, which Zachariah grew. Its floor is plain stone with one gold and blue runner up the
// middle to the dais. The fight's lightning reads a checker of 3 by 3 cells off it, but the floor
// doesn't paint one: the strike's glow marks its cells.
//
// Arena tiles below are the arena square's own, 0 to 63 from its south-west corner, which is what
// OWLS_COURT exports. The grid has a square of void round it.

const MAP_X = 82;
const MAP_Y = 76;
const SQUARES = 3;
const MARGIN = 1;
const SIZE = SQUARES * MAP_SQUARE_SIZE;
// The grid tile of arena tile 0,0
const A = MARGIN * MAP_SQUARE_SIZE;

// Heights: the walkways, and the lower walkway a Sepulchre level (65) below them
const UP = 130;
const LOW = 65;
// How far apart in tiles the two levels' walkways must be, so that the void round each is flat
// at its own height and its lips stand level
const LEVEL_GAP = 4;

const LOC_WALL_CORNER = 2;
const LOC_WALL_POST = 3;

type Rect = { x0: number; y0: number; x1: number; y1: number };
type Tile = { x: number; y: number };

// The layout, in arena tiles. The court's middle is x 31; north is the dais, south the bridge and
// the terrace where the player starts.
const COURT: Rect = { x0: 18, y0: 20, x1: 44, y1: 46 };
// Crossbowmen stand on the rims' inner column, the knights at their south ends
const WEST_RIM: Rect = { x0: 15, y0: 20, x1: 17, y1: 46 };
const EAST_RIM: Rect = { x0: 45, y0: 20, x1: 47, y1: 46 };
const DAIS: Rect = { x0: 24, y0: 47, x1: 38, y1: 53 };
// The bridge's lane is its middle three, its wizard statues the two columns either side
const BRIDGE: Rect = { x0: 28, y0: 16, x1: 34, y1: 19 };
const LANE = { x0: 30, x1: 32 };
const TERRACE: Rect = { x0: 26, y0: 9, x1: 36, y1: 15 };
const UPPER = [COURT, WEST_RIM, EAST_RIM, DAIS, BRIDGE, TERRACE];
// The lower walkway: a ring round it all, open towards the terrace
const LOWER: Rect[] = [
    { x0: 8, y0: 12, x1: 10, y1: 59 },
    { x0: 52, y0: 12, x1: 54, y1: 59 },
    { x0: 11, y0: 57, x1: 51, y1: 59 },
    { x0: 11, y0: 12, x1: 22, y1: 14 },
    { x0: 40, y0: 12, x1: 51, y1: 14 },
];

// He comes down in the court's middle; the player starts by its south edge, clear of the lanes
const START: Tile = { x: 31, y: 22 };
const RISE: Tile = { x: 31, y: 33 };
const CELL = 3;
const CELLS = (COURT.x1 - COURT.x0 + 1) / CELL;
// The four pillars, 2 by 2, each in a stone cell, mirrored about the court's middle
const PILLAR_TILES: Tile[] = [
    { x: 25, y: 24 },
    { x: 36, y: 24 },
    { x: 25, y: 41 },
    { x: 36, y: 41 },
];
// Rows of cells whose crossbowmen fire east from the west rim, and west from the east rim,
// interleaved. Row 0 is the knights' and where he rises, and rows 7 and 8 are nearest the dais.
// Three lanes a side keeps the phone's heaviest view under budget: each statue is 1,434 triangles.
const WEST_FIRES = [1, 3, 5];
const EAST_FIRES = [2, 4, 6];
const WEST_STATUES_X = WEST_RIM.x1;
const EAST_STATUES_X = EAST_RIM.x0;

const cellY0 = (row: number) => COURT.y0 + row * CELL;

// What the fight reads: where everything is, in arena tiles (add origin for world tiles). The
// fight never hard-codes a tile.
export const OWLS_COURT = {
    // World tile of arena tile 0,0
    origin: { x: (MAP_X + MARGIN) * MAP_SQUARE_SIZE, y: (MAP_Y + MARGIN) * MAP_SQUARE_SIZE },
    // The court's square, its south-west tile and side: the boss's arena
    bossArena: { x: COURT.x0, y: COURT.y0, size: COURT.x1 - COURT.x0 + 1 },
    // Where he descends: the court's middle
    rise: RISE,
    // Where the player starts: by the court's south edge, 11 south of him
    start: START,
    // The floor's 3 by 3 cells: a cell's parity is (cx + cy) % 2. 0 is the Sepulchre's runner as a
    // rug, which reads as blue edged in gold; 1 is the plain dark blue-grey stone.
    checker: { x0: COURT.x0, y0: COURT.y0, cell: CELL, cols: CELLS, rows: CELLS },
    // Freestanding pillars, 2 by 2 from x, y: they block walking, bolts and his gaze
    pillars: PILLAR_TILES.map(({ x, y }) => ({ x, y, size: 2 })),
    // Each crossbow lane: three statues side by side on a rim, each firing along its own row.
    // y is the lane's middle row and y0 to y1 its rows; bolts fly from fromX (the court's edge
    // beside the statues) to toX (its far edge), dir 1 east or -1 west.
    bolts: [
        ...WEST_FIRES.map((row) => ({ row, x: WEST_STATUES_X, dir: 1 as const })),
        ...EAST_FIRES.map((row) => ({ row, x: EAST_STATUES_X, dir: -1 as const })),
    ]
        .sort((a, b) => a.row - b.row)
        .map(({ row, x, dir }) => ({
            y: cellY0(row) + 1,
            y0: cellY0(row),
            y1: cellY0(row) + 2,
            fromX: dir === 1 ? COURT.x0 : COURT.x1,
            toX: dir === 1 ? COURT.x1 : COURT.x0,
            dir,
            // Turned to face across the court: 3 faces east, 1 west
            statues: [0, 1, 2].map((i) => ({ x, y: cellY0(row) + i, rotation: dir === 1 ? 3 : 1 })),
        })),
    // The knight statues, 3 by 3 from x, y at the court's south corners: a sword's thrown from
    // the middle (x + 1, y + 1)
    knights: [
        { x: WEST_RIM.x0, y: COURT.y0, size: 3, rotation: 3 },
        { x: EAST_RIM.x0, y: COURT.y0, size: 3, rotation: 1 },
    ],
    // The bridge's fire rows, south to north: one jet a row across the lane, from x0 to x1, laid
    // across it one way and the next the other
    fires: [16, 17, 18, 19].map((y) => ({ y, x0: LANE.x0, x1: LANE.x1, rotation: y & 1 ? 3 : 1 })),
    // The dais behind the court's north edge: the Owl Justiciar, the star and their dressing
    dais: { x: DAIS.x0, y: DAIS.y0, w: DAIS.x1 - DAIS.x0 + 1, h: DAIS.y1 - DAIS.y0 + 1 },
};

// MapDef.bossArena, in world tiles
export const OWLS_COURT_BOSS_ARENA = {
    baseX: OWLS_COURT.origin.x + OWLS_COURT.bossArena.x,
    baseY: OWLS_COURT.origin.y + OWLS_COURT.bossArena.y,
    size: OWLS_COURT.bossArena.size,
};

// The kit, as the cache's ids. The floor: Floors 3 and 4's upper stone, mostly the plain tiles
// (2 to 12 triangles) with a few detailed ones (80 to 178)
const STONE_PLAIN = [38185, 38185, 38197, 38198, 38199];
const STONE_DETAIL = [38201, 38202, 38194, 38187, 38196, 38189, 38191, 38395, 38396, 38397];
// The gilded dropped swords, now and then
const STONE_SWORDS = [38205, 38206];
// The lower walkway's, a shade lighter, as the Sepulchre's lower levels are
const LOWER_PLAIN = [38209, 38221, 38221, 38222, 38223];
const LOWER_DETAIL = [38225, 38226, 38217, 38211, 38392, 38393, 38394];
// The gold and blue runner, 3 wide: [id, rotation] by row from the south, west to east. Its
// south end, its middle (repeated up the aisle) and its north end
const RUG: [number, number][][] = [
    [
        [38245, 3],
        [38247, 2],
        [38244, 2],
    ],
    [
        [38246, 3],
        [38251, 0],
        [38246, 1],
    ],
    [
        [38244, 0],
        [38247, 0],
        [38245, 1],
    ],
];
// Edge lips, on the void's side of a walkway's edge: the straight one mostly
const LIPS = [38262, 38262, 38262, 38262, 38263, 38263, 38264];
const LIPS_CORNER = [38262, 38262, 38263];
const LOWER_LIPS = [38255, 38255, 38255, 38256, 38257];
const LOWER_LIPS_CORNER = [38255, 38256];
// The gold-pointed parapet where a lane meets the drop, a pair a tile apart
const PARAPETS = [38279, 38280];
// The tall wall under the walkways (see LocOverrides.ts)
const HANGING_WALL = 38924;

// What blocks, [loc id, tiles across, tiles deep] unturned: the build's sizes without the cache
type Solid = [id: number, sizeX: number, sizeY: number];
const WIZARD_STATUES: Solid[] = [
    [38416, 2, 2],
    [38417, 2, 2],
    [38418, 2, 2],
];
const KNIGHT: Solid = [38432, 3, 3];
const CROSSBOWMAN: Solid = [38445, 1, 1];
const OWL_JUSTICIAR: Solid = [38546, 3, 3];
const STAR: Solid = [38770, 5, 2];
const PILLAR: Solid = [38502, 2, 2];
// Every statue here looks south unturned, west at a quarter turn and east at three
const OWL_SOUTH = 0;
const OWL: Solid = [38541, 1, 1];
const GREAT_OWL: Solid = [38542, 2, 2];
const LILIES: Solid[] = [
    [38781, 1, 2],
    [38782, 1, 2],
];
const BLUE_MOTE: Solid = [38774, 1, 1];
const GOLD_MOTE: Solid = [38775, 1, 1];
const TORCH: Solid = [38513, 1, 1];
const URNS: Solid[] = [
    [38485, 1, 1],
    [38489, 1, 1],
];
const BOOKS: Solid[] = [
    [38515, 1, 1],
    [38516, 1, 1],
    [38517, 1, 1],
    [38518, 1, 1],
];
export const SOLID_LOCS: Solid[] = [
    ...WIZARD_STATUES,
    KNIGHT,
    CROSSBOWMAN,
    OWL_JUSTICIAR,
    STAR,
    PILLAR,
    OWL,
    GREAT_OWL,
    ...LILIES,
    BLUE_MOTE,
    GOLD_MOTE,
    TORCH,
    ...URNS,
    ...BOOKS,
];
// What's walked through: the fire jets (1 by 3, laid across the lane) and candles
const FIRE: Solid = [38427, 1, 3];
const CANDLES = [12301, 12302];
export const WALK_THROUGH = [FIRE[0], ...CANDLES];

const pick = <T>(rng: Rng, from: T[]): T => from[Math.floor(rng() * from.length)];

const inRect = ({ x0, y0, x1, y1 }: Rect, x: number, y: number) =>
    x >= x0 && x <= x1 && y >= y0 && y <= y1;

// Walkway kinds, by grid tile
const VOID = 0;
const WALKWAY = 1;
const LOWER_WALKWAY = 2;

class Court {
    readonly ground = new Ground(SIZE, SIZE);
    readonly kind = new Uint8Array(SIZE * SIZE);
    readonly placer: Placer;

    constructor(readonly context: BuildContext) {
        this.placer = new Placer(this.ground, {
            rng: createRng(3850),
            locs: context.locs,
            sizes: [...SOLID_LOCS, FIRE, ...CANDLES.map((id): Solid => [id, 1, 1])],
        });
    }

    // Arena tile to grid tile
    at(x: number, y: number): number {
        return this.ground.tile(A + x, A + y);
    }

    kindAt(x: number, y: number): number {
        return this.ground.inside(A + x, A + y) ? this.kind[this.at(x, y)] : VOID;
    }

    // A loc at an arena tile, as it is: walls and floor tiles
    push(id: number, type: number, rotation: number, x: number, y: number): void {
        this.ground.grid.locs.push({ id, type, rotation, level: 0, x: A + x, y: A + y });
    }

    solid([id]: Solid, x: number, y: number, rotation: number, kind?: string): boolean {
        return this.placer.solid(id, A + x, A + y, { rotation, kind });
    }

    dress(id: number, x: number, y: number, kind?: string): boolean {
        return this.placer.dress(id, A + x, A + y, { type: LOC_NORMAL, kind });
    }

    // Something the fight draws and animates in its place (BossAttackDef.statues): its tiles are
    // taken and blocked as though it stood there, but its model's left out of the map, so the
    // fight's is the only one. It must be on open walkway.
    forFight([id, sizeX, sizeY]: Solid, x: number, y: number, rotation: number): void {
        const [across, deep] = rotation & 1 ? [sizeY, sizeX] : [sizeX, sizeY];
        const { ground } = this;
        for (let ty = y; ty < y + deep; ty++) {
            for (let tx = x; tx < x + across; tx++) {
                const tile = this.at(tx, ty);
                if (this.kindAt(tx, ty) !== WALKWAY || ground.reserved[tile]) {
                    throw new Error(`Owl's Court: no room for the fight's ${id} at ${tx},${ty}`);
                }
                ground.reserved[tile] = 1;
                ground.occupied[tile] = 1;
                if (!WALK_THROUGH.includes(id)) {
                    ground.level0.flags[tile] |= TILE_BLOCKED;
                }
            }
        }
        this.drawn.push({ id, x, y, rotation });
    }

    // What forFight left out
    readonly drawn: FightDrawn[] = [];
}

// A loc the fight draws in the map's place (Court.forFight), in arena tiles
export type FightDrawn = { id: number; x: number; y: number; rotation: number };

// Which tiles are walkways, and the heights: each level dead flat, with the void a tile round
// each walkway flat at its height too, so its lips stand level, and the drop between them in the
// void, which draws nothing
function shapeGround(court: Court): void {
    const { ground, kind } = court;
    const mark = (rect: Rect, value: number) => {
        for (let y = rect.y0; y <= rect.y1; y++) {
            for (let x = rect.x0; x <= rect.x1; x++) {
                kind[court.at(x, y)] = value;
            }
        }
    };
    UPPER.forEach((rect) => mark(rect, WALKWAY));
    LOWER.forEach((rect) => mark(rect, LOWER_WALKWAY));
    // The upper walkways' tiles and the void within a tile of them stand at UP
    const high = new Uint8Array(SIZE * SIZE);
    for (let y = 1; y < SIZE - 1; y++) {
        for (let x = 1; x < SIZE - 1; x++) {
            if (kind[ground.tile(x, y)] !== WALKWAY) {
                continue;
            }
            for (let dy = -1; dy <= 1; dy++) {
                for (let dx = -1; dx <= 1; dx++) {
                    high[ground.tile(x + dx, y + dy)] = 1;
                }
            }
        }
    }
    for (let y = 0; y <= SIZE; y++) {
        for (let x = 0; x <= SIZE; x++) {
            let up = false;
            for (let ty = y - 1; ty <= y && !up; ty++) {
                for (let tx = x - 1; tx <= x && !up; tx++) {
                    up = ground.inside(tx, ty) && high[ground.tile(tx, ty)] === 1;
                }
            }
            ground.setHeight(x, y, up ? UP : LOW);
        }
    }
    // The lower walkway keeps its distance, so none of its corners were lifted
    for (const rect of LOWER) {
        for (let y = rect.y0 - LEVEL_GAP + 1; y <= rect.y1 + LEVEL_GAP - 1; y++) {
            for (let x = rect.x0 - LEVEL_GAP + 1; x <= rect.x1 + LEVEL_GAP - 1; x++) {
                if (court.kindAt(x, y) === WALKWAY) {
                    throw new Error(
                        `Owl's Court: the lower walkway's too near the upper at ${x},${y}`,
                    );
                }
            }
        }
    }
    // Every walkway is the hidden floor (the Sepulchre's, 0xFF00FF, which draws nothing and shows
    // on the minimap) under its stone tiles. The void has no floor at all. Both it and the lower
    // walkway, which is only to look at, are blocked.
    const { overlays, flags } = ground.level0;
    for (let i = 0; i < SIZE * SIZE; i++) {
        if (kind[i] !== VOID) {
            overlays[i] = 359;
        }
        if (kind[i] !== WALKWAY) {
            flags[i] |= TILE_BLOCKED;
        }
    }
}

// The edges: on the void tile beside each walkway edge, a lip facing the walkway (a corner piece
// where it turns, and a post where only a corner touches), as the Sepulchre has them; and under
// each walkway's south, west and east edges the tall wall, its face out. North edges face away from
// the camera, so their walls are left out.
function placeEdges(court: Court): void {
    const rng = createRng(3851);
    // From the arena square's edge, so lips round anything near it fit
    for (let y = -A + 1; y < SIZE - A - 1; y++) {
        for (let x = -A + 1; x < SIZE - A - 1; x++) {
            const here = court.kindAt(x, y);
            if (here === VOID) {
                placeLip(court, rng, x, y);
                continue;
            }
            // The camera's always over the court's width, so it never sees a west face west of
            // the court or an east face east of it: those are left out too
            const south = court.kindAt(x, y - 1) === VOID;
            const west = court.kindAt(x - 1, y) === VOID && x > COURT.x0;
            const east = court.kindAt(x + 1, y) === VOID && x < COURT.x1;
            if (west && east) {
                throw new Error(`Owl's Court: a walkway one tile wide at ${x},${y}`);
            }
            if (south && (west || east)) {
                court.push(HANGING_WALL, LOC_WALL_CORNER, west ? 3 : 2, x, y);
            } else if (south || west || east) {
                const side = south ? WALL_SOUTH : west ? WALL_WEST : WALL_EAST;
                court.push(HANGING_WALL, LOC_WALL, side, x, y);
            }
        }
    }
}

function placeLip(court: Court, rng: Rng, x: number, y: number): void {
    const near = (dx: number, dy: number) => court.kindAt(x + dx, y + dy);
    // Edges touching a walkway: west, north, east, south, as wall rotations count them
    const edges = [near(-1, 0), near(0, 1), near(1, 0), near(0, -1)];
    const level =
        edges.find((k) => k !== VOID) ??
        [near(-1, 1), near(1, 1), near(1, -1), near(-1, -1)].find((k) => k !== VOID);
    if (level === undefined) {
        return;
    }
    const lower = level === LOWER_WALKWAY;
    const touching = edges.map((k) => k !== VOID);
    const count = touching.filter(Boolean).length;
    if (count === 1) {
        const side = touching.indexOf(true);
        // The bridge's sides are lanes meeting the drop: the gold-pointed parapet
        const onBridge =
            !lower &&
            (x === BRIDGE.x0 - 1 || x === BRIDGE.x1 + 1) &&
            y >= BRIDGE.y0 &&
            y <= BRIDGE.y1;
        const id = onBridge ? PARAPETS[y & 1] : pick(rng, lower ? LOWER_LIPS : LIPS);
        court.push(id, LOC_WALL, side, x, y);
        return;
    }
    if (count === 2) {
        // Two edges that meet: the corner piece, turned to the corner between them
        for (let side = 0; side < 4; side++) {
            if (touching[side] && touching[(side + 1) % 4]) {
                court.push(
                    pick(rng, lower ? LOWER_LIPS_CORNER : LIPS_CORNER),
                    LOC_WALL_CORNER,
                    side,
                    x,
                    y,
                );
                return;
            }
        }
        throw new Error(`Owl's Court: a void tile between two walkways at ${x},${y}`);
    }
    if (count > 2) {
        throw new Error(`Owl's Court: a void tile with walkway on ${count} sides at ${x},${y}`);
    }
    // Only a corner touches: a post on it, north-west, north-east, south-east or south-west
    const corners = [near(-1, 1), near(1, 1), near(1, -1), near(-1, -1)];
    const corner = corners.findIndex((k) => k !== VOID);
    court.push(lower ? LOWER_LIPS_CORNER[0] : LIPS_CORNER[0], LOC_WALL_POST, corner, x, y);
}

// The court's own pieces: the pillars, the crossbowmen on the rims with owls between their lanes,
// and the knights at the south corners
function placeCourt(court: Court): void {
    for (const { x, y } of PILLAR_TILES) {
        court.solid(PILLAR, x, y, 0, "pillars");
    }
    for (const bolt of OWLS_COURT.bolts) {
        for (const statue of bolt.statues) {
            // Facing across the court: rotation 3 faces east, 1 west. The fight draws them, as
            // they aim and fire.
            court.forFight(CROSSBOWMAN, statue.x, statue.y, statue.rotation);
        }
        // A torch behind each lane's middle statue, on the rim's outer side
        court.solid(TORCH, bolt.dir === 1 ? WEST_RIM.x0 : EAST_RIM.x1, bolt.y, 0, "rim torches");
    }
    // Between the lanes, candles on the statues' line (an owl there is 574 triangles)
    for (let row = 1; row < CELLS - 1; row++) {
        if (!WEST_FIRES.includes(row)) {
            court.dress(CANDLES[row & 1], WEST_STATUES_X, cellY0(row) + 1, "rim candles");
        }
        if (!EAST_FIRES.includes(row)) {
            court.dress(CANDLES[row & 1], EAST_STATUES_X, cellY0(row) + 1, "rim candles");
        }
    }
    // The great owls at the rims' north ends, under the dais
    court.solid(GREAT_OWL, WEST_RIM.x0 + 1, COURT.y1 - 1, OWL_SOUTH, "great owls");
    court.solid(GREAT_OWL, EAST_RIM.x0, COURT.y1 - 1, OWL_SOUTH, "great owls");
    // The fight draws them too, as they throw their swords
    for (const knight of OWLS_COURT.knights) {
        court.forFight(KNIGHT, knight.x, knight.y, knight.rotation);
    }
}

// The bridge: a gilded wizard statue pair, two deep, either side of the lane, and a fire jet laid
// across each row of it, as the Sepulchre's fire corridors are
function placeBridge(court: Court): void {
    const rng = createRng(3852);
    for (let y = BRIDGE.y0; y <= BRIDGE.y1; y += 2) {
        court.solid(pick(rng, WIZARD_STATUES), BRIDGE.x0, y, 3, "wizard statues");
        court.solid(pick(rng, WIZARD_STATUES), LANE.x1 + 1, y, 1, "wizard statues");
    }
    // Their fire's the fight's to draw, on its rhythm: the statues have their set when it's played
    for (const loc of court.ground.grid.locs) {
        if (WIZARD_STATUES.some(([id]) => id === loc.id)) {
            markWhole(loc);
        }
    }
    for (const fire of OWLS_COURT.fires) {
        court.forFight(FIRE, fire.x0, fire.y, fire.rotation);
    }
}

// The dais: the Owl Justiciar facing the court, the Saradomin star behind him, great owls either
// side, and the lilies he grew
function placeDais(court: Court): void {
    const middle = (DAIS.x0 + DAIS.x1) / 2;
    court.solid(OWL_JUSTICIAR, middle - 1, DAIS.y0, 0, "the Owl Justiciar");
    // Right behind him, so it shows over the top of the screen from the court
    court.solid(STAR, middle - 2, DAIS.y0 + 3, 0, "the star");
    court.solid(GREAT_OWL, middle - 5, DAIS.y0 + 2, OWL_SOUTH, "great owls");
    court.solid(GREAT_OWL, middle + 4, DAIS.y0 + 2, OWL_SOUTH, "great owls");
    for (const dx of [-7, -3, 3, 7]) {
        court.solid(LILIES[Math.abs(dx) === 7 ? 0 : 1], middle + dx, DAIS.y0, 0, "dais lilies");
    }
    for (const dx of [-6, 6]) {
        court.solid(TORCH, middle + dx, DAIS.y0 + 4, 0, "dais torches");
        court.solid(URNS[0], middle + dx, DAIS.y0 + 6, 0, "dais urns");
    }
    for (const [dx, dy] of [
        [-5, 0],
        [5, 0],
        [-2, 5],
        [2, 5],
        [-4, 5],
        [4, 5],
        [-7, 3],
        [7, 3],
    ]) {
        court.dress(CANDLES[(dx + dy) & 1], middle + dx, DAIS.y0 + dy, "dais candles");
    }
}

// The terrace: lilies down both sides, owls at its corners, and the way to the bridge clear
function placeTerrace(court: Court): void {
    const rng = createRng(3853);
    for (let y = TERRACE.y0 + 1; y < TERRACE.y1 - 1; y += 3) {
        court.solid(pick(rng, LILIES), TERRACE.x0, y, 0, "terrace lilies");
        court.solid(pick(rng, LILIES), TERRACE.x1, y, 0, "terrace lilies");
    }
    court.solid(OWL, TERRACE.x0, TERRACE.y0, OWL_SOUTH, "terrace owls");
    court.solid(OWL, TERRACE.x1, TERRACE.y0, OWL_SOUTH, "terrace owls");
    court.solid(OWL, TERRACE.x0, TERRACE.y1, OWL_SOUTH, "terrace owls");
    court.solid(OWL, TERRACE.x1, TERRACE.y1, OWL_SOUTH, "terrace owls");
    court.solid(URNS[1], TERRACE.x0 + 2, TERRACE.y0, 0, "terrace urns");
    court.solid(URNS[1], TERRACE.x1 - 2, TERRACE.y0, 0, "terrace urns");
    court.solid(pick(rng, BOOKS), TERRACE.x0 + 1, TERRACE.y0, 0, "terrace books");
    court.solid(pick(rng, BOOKS), TERRACE.x1 - 1, TERRACE.y0, 0, "terrace books");
    for (const [x, y] of [
        [TERRACE.x0 + 1, TERRACE.y1],
        [TERRACE.x1 - 1, TERRACE.y1],
        [TERRACE.x0 + 1, TERRACE.y0 + 3],
        [TERRACE.x1 - 1, TERRACE.y0 + 3],
    ]) {
        court.dress(pick(rng, CANDLES), x, y, "terrace candles");
    }
}

// The lower walkway: torches along it, now and then an owl or a stone chest of books
function placeLower(court: Court): void {
    const rng = createRng(3854);
    for (const rect of LOWER) {
        const along = rect.x1 - rect.x0 > rect.y1 - rect.y0;
        const length = along ? rect.x1 - rect.x0 + 1 : rect.y1 - rect.y0 + 1;
        for (let i = 2; i < length - 1; i += 6) {
            const x = along ? rect.x0 + i : rect.x0 + Math.floor(rng() * 3);
            const y = along ? rect.y0 + Math.floor(rng() * 3) : rect.y0 + i;
            const roll = rng();
            if (roll < 0.5) {
                court.solid(TORCH, x, y, 0, "lower torches");
            } else if (roll < 0.75) {
                court.solid(OWL, x, y, Math.floor(rng() * 4), "lower owls");
            } else {
                court.dress(pick(rng, CANDLES), x, y, "lower candles");
            }
        }
    }
}

// Light motes in the void: gold near the dais and the bridge, blue elsewhere, a tile or two out
// from the walkways' edges
function placeMotes(court: Court): void {
    const rng = createRng(3855);
    const { ground } = court;
    for (let y = -A + 2; y < SIZE - A - 2; y++) {
        for (let x = -A + 2; x < SIZE - A - 2; x++) {
            if (court.kindAt(x, y) !== VOID || ground.occupied[court.at(x, y)]) {
                continue;
            }
            let nearest = 3;
            let upper = false;
            for (let dy = -2; dy <= 2; dy++) {
                for (let dx = -2; dx <= 2; dx++) {
                    const k = court.kindAt(x + dx, y + dy);
                    if (k !== VOID) {
                        const d = Math.max(Math.abs(dx), Math.abs(dy));
                        if (d < nearest) {
                            nearest = d;
                            upper = k === WALKWAY;
                        }
                    }
                }
            }
            if (nearest > 2 || rng() > (upper ? 0.05 : 0.025)) {
                continue;
            }
            const warm = y >= DAIS.y0 - 2 || (y < COURT.y0 && y > TERRACE.y0);
            const mote = warm
                ? rng() < 0.8
                    ? GOLD_MOTE
                    : BLUE_MOTE
                : rng() < 0.8
                  ? BLUE_MOTE
                  : GOLD_MOTE;
            court.solid(mote, x, y, 0, "motes");
        }
    }
}

// The runner up the court's middle, from the bridge to the dais: its three middle columns
export const AISLE: Rect = { x0: 30, y0: COURT.y0, x1: 32, y1: COURT.y1 };

// The stone underfoot, last, so what's under something solid is the plainest: the runner up the
// aisle, and stone everywhere else
function placeFloor(court: Court): void {
    const rng = createRng(3856);
    const { ground } = court;
    for (let y = -A; y < SIZE - A; y++) {
        for (let x = -A; x < SIZE - A; x++) {
            const kind = court.kindAt(x, y);
            if (kind === VOID) {
                continue;
            }
            const covered = ground.occupied[court.at(x, y)] === 1;
            const turn = Math.floor(rng() * 4);
            const roll = rng();
            if (kind === LOWER_WALKWAY) {
                const id =
                    !covered && roll < 0.12 ? pick(rng, LOWER_DETAIL) : pick(rng, LOWER_PLAIN);
                court.push(id, LOC_FLOOR_DECORATION, turn, x, y);
                continue;
            }
            if (inRect(AISLE, x, y)) {
                const row = y === AISLE.y0 ? 0 : y === AISLE.y1 ? 2 : 1;
                const [id, rotation] = RUG[row][x - AISLE.x0];
                court.push(id, LOC_FLOOR_DECORATION, rotation, x, y);
                continue;
            }
            const detail = inRect(COURT, x, y) ? 0.12 : 0.2;
            let id = pick(rng, STONE_PLAIN);
            if (!covered && roll < detail) {
                id = roll < 0.01 ? pick(rng, STONE_SWORDS) : pick(rng, STONE_DETAIL);
            }
            court.push(id, LOC_FLOOR_DECORATION, turn, x, y);
        }
    }
}

const grid = (tile: Tile): Tile => ({ x: A + tile.x, y: A + tile.y });

// The arena, one region: the court, the bridge's lane and the terrace. Everything else, the rims
// and the dais included, is sealed.
const ARENA_REGION: SealRegion = {
    name: "the Owl's Court",
    rect: { x0: A + COURT.x0, y0: A + TERRACE.y0, x1: A + COURT.x1, y1: A + COURT.y1 },
    from: grid(RISE),
    // The whole court but its pillars, the lane, and most of the terrace
    min: (COURT.x1 - COURT.x0 + 1) ** 2 - PILLAR_TILES.length * 4 + 3 * 4 + 50,
    maxSealed: 0,
};

// Where the game puts the player and him, and the tiles each of the fight's pieces is read from,
// all of which must be open and reachable
const POINTS: MapPoint[] = [
    { name: "his rise", ...grid(RISE) },
    { name: "the start", ...grid(START) },
    ...OWLS_COURT.bolts.flatMap((bolt, i) => [
        { name: `bolt lane ${i}'s near end`, ...grid({ x: bolt.fromX, y: bolt.y }) },
        { name: `bolt lane ${i}'s far end`, ...grid({ x: bolt.toX, y: bolt.y }) },
    ]),
    ...PILLAR_TILES.flatMap(({ x, y }, i) => [
        { name: `south of pillar ${i}`, ...grid({ x, y: y - 1 }) },
        { name: `north of pillar ${i}`, ...grid({ x, y: y + 2 }) },
    ]),
    ...OWLS_COURT.knights.map(({ x, y }, i) => ({
        name: `in front of knight ${i}`,
        ...grid({ x: i === 0 ? x + 3 : x - 1, y: y + 1 }),
    })),
    ...OWLS_COURT.fires.map(({ y, x0 }) => ({
        name: `the fire row at ${y}`,
        ...grid({ x: x0 + 1, y }),
    })),
    { name: "in front of the dais", ...grid({ x: 31, y: COURT.y1 }) },
].map((point) => ({ ...point, region: ARENA_REGION.name }));

function finish(court: Court): void {
    const { context, ground } = court;
    const sealed = sealFrom(ground.grid, context.locs, [ARENA_REGION], {
        outside: "block",
        label: "Owl's Court",
    });
    assertReachable(sealed, POINTS, "Owl's Court");
}

// The Placer's count of what went down, for the test
export function buildOwlsCourt(context: BuildContext): {
    map: GeneratedMap;
    placer: Placer;
    drawn: FightDrawn[];
} {
    const court = new Court(context);
    shapeGround(court);
    placeEdges(court);
    placeCourt(court);
    placeBridge(court);
    placeDais(court);
    placeTerrace(court);
    placeLower(court);
    placeMotes(court);
    placeFloor(court);
    finish(court);
    const { ground } = court;
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
    };
    return { map, placer: court.placer, drawn: court.drawn };
}

export const OWLS_COURT_RECIPE: MapRecipe = {
    id: "zachariah",
    // Clear of the Sanctuary (78 to 80, 72 to 74), the Theatre (78 to 85, 66 to 72) and the
    // Shattered Realm (88 on): see CLAUDE.md's traps
    mapX: MAP_X,
    mapY: MAP_Y,
    squaresX: SQUARES,
    squaresY: SQUARES,
    margin: MARGIN,
    // The player's start on the terrace; he rises 6 north of it
    spawn: grid(START),
    build: (context) => buildOwlsCourt(context).map.grid,
    detail: (context) => buildOwlsCourt(context).map,
    regions: [ARENA_REGION],
    points: POINTS,
};
