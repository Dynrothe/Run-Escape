import { Ground } from "../Ground";
import { assertReachable, sealFrom } from "../collision";
import { MAP_SQUARE_SIZE, type PlacedLoc, TILE_BLOCKED } from "../format";
import type { GeneratedMap } from "../generator";
import { LOC_NORMAL, LOC_WALL, WALL_EAST, WALL_SOUTH, WALL_WEST } from "../mapBuild";
import { createNoise, createRng } from "../noise";
import type { BuildContext, MapPoint, MapRecipe } from "../recipe";

// Ghorrock, Act II's third map (content/maps.ts, docs/design/act-2-fallen-empire.md section 5): the
// frozen yard outside Ghorrock Prison. The prison itself is in the cache, but it's cells and
// corridors, too cramped for a crowd, so the yard is built here by hand on snow, with the prison's
// own kit in it: its Heavy Door in the cliff it's cut into, north, its flags, cages, iron maidens,
// racks, tables and its dead. The Duke sits in the prison's mouth.
//
// What the cold reads off the map (content/ghorrock.ts) is exported here in grid tiles: the
// braziers (drawn by the game, which lights them and puts them out), the gas vents (their jets are
// the map's, their gas the game's), the ice pools (painted with the ice overlay here, and the
// rule's effect mask from the same ellipses), the statues that hide you from his gaze, and
// his own square.

const MAP_X = 62;
const MAP_Y = 112;
const SQUARES = 5;
const MARGIN = 1;
const SIZE = SQUARES * MAP_SQUARE_SIZE;
const ARENA_0 = MARGIN * MAP_SQUARE_SIZE;
const ARENA_1 = (SQUARES - MARGIN) * MAP_SQUARE_SIZE - 1;
const MIDDLE = SIZE / 2;

type Tile = { x: number; y: number };

// The cliff the prison's cut into: the yard ends at its foot, and it climbs in faces of 64 over
// two tiles with two-tile ledges between (map-depth.md, "cliff wall north")
const CLIFF_Y = 229;
const CLIFF_STEPS = [64, 128, 160];
const GROUND_HEIGHT = 40;
const GROUND_ROLL = 3;

// Floors, as the map files store them: snow, rock, and blue-grey ice
const SNOW = [58, 216];
const ROCK_GROUND = 16;
const ROCK = 3;
const ICE = 151;

// The prison's kit, and the yard's
const HEAVY_DOOR = 49093;
const DOOR_PILLAR = 46628;
const FLAG = 48950;
const CAGE = 46634;
const SMALL_CAGE = 49452;
const IRON_MAIDEN = 48959;
const RACK = 48947;
const TABLE = 46675;
const CHAIR = 49087;
const SKELETONS = [6297, 6298, 6299];
const MUSHROOMS = [47534, 47532];
// The prison's statue: what hides you from his gaze
const STATUE = 49090;
// A vent's jet: a steam vent, hissing
const GAS_JET = 15214;
const BOULDER = 5039;
const TREES = [1330, 1331, 1332];
const ROCKS = 19686;
const FENCE = 4246;
// Snow and the ice showing through it, walked over
const SNOW_DECOR = [46528, 46529, 46530, 46531];
const ICE_PATCH = [60397, 60399, 60398, 60400];
const ICE_MOUNDS = [60404, 60405];

// Where the run starts: the yard's middle, south of its big pool
const START: Tile = { x: 160, y: 130 };

// The Duke: his 7 by 7 square in the prison's mouth, and where he's drawn from (its middle)
export const GHORROCK_DUKE = { x: 157, y: 216, size: 7 };
// His fight's square, the yard in front of the prison: the party's held in it while he's up
export const GHORROCK_BOSS_ARENA = { x: 144, y: 194, size: 32 };

// Braziers, 2 by 2 from their south-west tiles: four round the yard, two in front of him
export const GHORROCK_BRAZIERS: Tile[] = [
    { x: 90, y: 90 },
    { x: 228, y: 90 },
    { x: 100, y: 166 },
    { x: 218, y: 166 },
    { x: 145, y: 205 },
    { x: 173, y: 205 },
];

// Gas vents, the middles of their 3 by 3 clouds
export const GHORROCK_VENTS: Tile[] = [
    { x: 120, y: 110 },
    { x: 200, y: 110 },
    { x: 160, y: 88 },
    { x: 160, y: 146 },
    { x: 128, y: 184 },
    { x: 192, y: 184 },
    { x: 150, y: 214 },
    { x: 171, y: 214 },
];

// The prison's statues in front of him, 2 by 2: his gaze can't see through them. From anywhere
// in his square one's no more than about 9 tiles off.
export const GHORROCK_PILLARS: Tile[] = [
    { x: 159, y: 207 },
    { x: 149, y: 210 },
    { x: 170, y: 210 },
    { x: 155, y: 201 },
    { x: 164, y: 201 },
    { x: 147, y: 196 },
    { x: 172, y: 196 },
];

// The frozen pools, rx by ry tiles about their middles: about a seventh of the yard
export const GHORROCK_POOLS = [
    { x: 110, y: 140, rx: 14, ry: 10 },
    { x: 210, y: 140, rx: 14, ry: 10 },
    { x: 160, y: 115, rx: 18, ry: 9 },
    { x: 90, y: 200, rx: 12, ry: 12 },
    { x: 230, y: 200, rx: 12, ry: 12 },
    { x: 80, y: 112, rx: 10, ry: 14 },
    { x: 240, y: 112, rx: 10, ry: 14 },
    { x: 125, y: 75, rx: 16, ry: 8 },
    { x: 195, y: 75, rx: 16, ry: 8 },
    { x: 160, y: 170, rx: 12, ry: 8 },
];

const POINTS: MapPoint[] = [
    { name: "start", ...START },
    { name: "the Duke's fight", x: 160, y: 211 },
    ...GHORROCK_BRAZIERS.map((b, i) => ({ name: `brazier ${i}'s side`, x: b.x - 1, y: b.y })),
];

function inArena(x: number, y: number): boolean {
    return x >= ARENA_0 && x <= ARENA_1 && y >= ARENA_0 && y <= ARENA_1;
}

function inPool(x: number, y: number): boolean {
    return GHORROCK_POOLS.some((pool) => {
        const dx = (x + 0.5 - pool.x) / pool.rx;
        const dy = (y + 0.5 - pool.y) / pool.ry;
        return dx * dx + dy * dy <= 1;
    });
}

class Yard {
    readonly ground = new Ground(SIZE, SIZE);
    readonly rng = createRng(9135);
    // Tiles kept clear of scenery: the cold's own pieces, the start, his fight
    readonly keep = new Uint8Array(SIZE * SIZE);
    readonly standIns: PlacedLoc[] = [];

    constructor(readonly context: BuildContext) {}

    keepClear(x: number, y: number, sizeX: number, sizeY: number, gap: number): void {
        for (let ty = y - gap; ty < y + sizeY + gap; ty++) {
            for (let tx = x - gap; tx < x + sizeX + gap; tx++) {
                if (this.ground.inside(tx, ty)) {
                    this.keep[this.ground.tile(tx, ty)] = 1;
                }
            }
        }
    }

    isFree(x: number, y: number, sizeX: number, sizeY: number): boolean {
        if (!this.ground.isClear(x, y, sizeX, sizeY)) {
            return false;
        }
        for (let ty = y; ty < y + sizeY; ty++) {
            for (let tx = x; tx < x + sizeX; tx++) {
                if (this.keep[this.ground.tile(tx, ty)] || inPool(tx, ty)) {
                    return false;
                }
            }
        }
        return true;
    }

    // Something solid, its size the cache's, turned; with gap tiles clear round it
    solid(id: number, x: number, y: number, rotation = 0, check = true, gap = 0): boolean {
        const info = this.context.locs(id);
        const turned = rotation % 2 === 1;
        const sizeX = turned ? info.sizeY : info.sizeX;
        const sizeY = turned ? info.sizeX : info.sizeY;
        if (check && !this.isFree(x - gap, y - gap, sizeX + gap * 2, sizeY + gap * 2)) {
            return false;
        }
        this.ground.place({ id, type: LOC_NORMAL, rotation, level: 0, x, y }, sizeX, sizeY);
        return true;
    }

    // Walked over: one to a tile, never on what's kept clear
    dress(id: number, x: number, y: number): void {
        const i = this.ground.tile(x, y);
        if (this.keep[i] || this.ground.reserved[i] || this.ground.occupied[i]) {
            return;
        }
        this.ground.reserved[i] = 1;
        this.ground.grid.locs.push({
            id,
            type: LOC_NORMAL,
            rotation: Math.floor(this.rng() * 4),
            level: 0,
            x,
            y,
        });
    }

    // What the game draws in the map's place: its tiles blocked as though it stood there
    standIn(id: number, x: number, y: number, size: number): void {
        const level = this.ground.grid.levels[0];
        for (let ty = y; ty < y + size; ty++) {
            for (let tx = x; tx < x + size; tx++) {
                level.flags[this.ground.tile(tx, ty)] |= TILE_BLOCKED;
                this.ground.occupied[this.ground.tile(tx, ty)] = 1;
            }
        }
        this.standIns.push({ id, type: LOC_NORMAL, rotation: 0, level: 0, x, y });
    }
}

function cliffRise(y: number): number {
    if (y < CLIFF_Y) {
        return 0;
    }
    // A face over two tiles, then a ledge of two
    const into = y - CLIFF_Y;
    const step = Math.floor(into / 4);
    const face = Math.min(1, (into % 4) / 2);
    const below = step === 0 ? 0 : CLIFF_STEPS[Math.min(step, CLIFF_STEPS.length) - 1];
    const above = CLIFF_STEPS[Math.min(step, CLIFF_STEPS.length - 1)];
    return below + (above - below) * face;
}

function paintGround(yard: Yard): void {
    const { ground } = yard;
    const roll = createNoise(9136, 2);
    const shade = createNoise(9137, 2);
    for (let y = 0; y <= SIZE; y++) {
        for (let x = 0; x <= SIZE; x++) {
            ground.setHeight(
                x,
                y,
                GROUND_HEIGHT + roll(x / 24, y / 24) * GROUND_ROLL + cliffRise(y),
            );
        }
    }
    const { underlays } = ground.level0;
    const rock = new Uint8Array(SIZE * SIZE);
    const ice = new Uint8Array(SIZE * SIZE);
    for (let y = 0; y < SIZE; y++) {
        for (let x = 0; x < SIZE; x++) {
            const i = ground.tile(x, y);
            const band = shade(x / 30, y / 30) > 0.5 ? 1 : 0;
            const onCliff = y >= CLIFF_Y && y < CLIFF_Y + CLIFF_STEPS.length * 4;
            underlays[i] = onCliff ? ROCK_GROUND : SNOW[band];
            rock[i] = onCliff && (y - CLIFF_Y) % 4 < 2 ? 1 : 0;
            ice[i] = inArena(x, y) && inPool(x, y) ? 1 : 0;
        }
    }
    ground.paintOverlay(rock, ROCK, true);
    ground.paintOverlay(ice, ICE, false);
}

// The prison's front at the cliff's foot: the Heavy Door behind him, pillars either side, flags
// along the rock, and the kit of a yard its guards left in a hurry
function placePrison(yard: Yard): void {
    const doorX = MIDDLE - 1;
    const footY = CLIFF_Y - 1;
    yard.solid(HEAVY_DOOR, doorX - 1, footY, 0, false);
    yard.solid(DOOR_PILLAR, doorX - 3, footY, 0, false);
    yard.solid(DOOR_PILLAR, doorX + 3, footY, 0, false);
    for (const dx of [-30, -18, 16, 28]) {
        yard.solid(FLAG, MIDDLE + dx, footY - 1, 0, false);
    }
    for (const [x, rotation] of [
        [MIDDLE - 44, 1],
        [MIDDLE + 40, 1],
    ]) {
        yard.solid(CAGE, x, footY - 1, rotation);
    }
    for (let x = MIDDLE - 62; x <= MIDDLE + 62; x += 9) {
        if (Math.abs(x - MIDDLE) < 24) {
            continue;
        }
        yard.solid(yard.rng() < 0.5 ? IRON_MAIDEN : SMALL_CAGE, x, footY);
    }
    yard.solid(RACK, MIDDLE - 56, footY - 4, 1);
    yard.solid(RACK, MIDDLE + 52, footY - 4, 1);
    // His mushrooms, from his room
    for (const [dx, dy] of [
        [-6, -3],
        [6, -2],
        [-7, 2],
        [7, 3],
    ]) {
        yard.solid(MUSHROOMS[(dx + 10) % 2], MIDDLE + dx, GHORROCK_DUKE.y + 3 + dy);
    }
}

// The cold's own: braziers (the game's), vents' jets, the statues in front of him
function placeCold(yard: Yard): void {
    for (const brazier of GHORROCK_BRAZIERS) {
        yard.standIn(48122, brazier.x, brazier.y, 2);
    }
    for (const vent of GHORROCK_VENTS) {
        yard.solid(GAS_JET, vent.x, vent.y, 0, false);
    }
    for (const pillar of GHORROCK_PILLARS) {
        yard.solid(STATUE, pillar.x, pillar.y, 0, false);
    }
}

// Camps of the prison's dead round the yard: a table and chairs, a skeleton or two, a column
function placeYard(yard: Yard): void {
    const { rng } = yard;
    const pick = <T>(list: T[]) => list[Math.floor(rng() * list.length)];
    const turn = () => Math.floor(rng() * 4);
    for (let y = ARENA_0 + 3; y < CLIFF_Y - 4; y++) {
        for (let x = ARENA_0 + 3; x <= ARENA_1 - 3; x++) {
            const roll = rng();
            if (inPool(x, y)) {
                if (roll < 0.03) {
                    yard.dress(pick(ICE_PATCH), x, y);
                }
            } else if (roll < 0.012) {
                yard.dress(pick(SNOW_DECOR), x, y);
            } else if (roll < 0.02) {
                yard.solid(ROCKS, x, y, turn(), true, 1);
            } else if (roll < 0.0245) {
                yard.solid(BOULDER, x, y, turn(), true, 1);
            } else if (roll < 0.0265) {
                yard.solid(pick(SKELETONS), x, y, turn(), true, 1);
            } else if (roll < 0.0275) {
                // A table the guards left, its chairs knocked over
                if (yard.solid(TABLE, x, y, Math.floor(rng() * 2), true, 2)) {
                    yard.solid(CHAIR, x - 1, y, turn());
                    yard.solid(CHAIR, x + 2, y + 1, turn());
                }
            } else if (roll < 0.0305) {
                yard.solid(pick(TREES), x, y, turn(), true, 2);
            } else if (roll < 0.031) {
                yard.solid(rng() < 0.5 ? IRON_MAIDEN : SMALL_CAGE, x, y, turn(), true, 1);
            } else if (roll < 0.034) {
                // Ice showing through the snow, in mounds
                yard.solid(pick(ICE_MOUNDS), x, y, turn(), true, 1);
            }
        }
    }
}

// The yard's fence on its other three sides, and a snowy wood past it
function placeBoundary(yard: Yard): void {
    const { ground, rng } = yard;
    const fence = (x: number, y: number, rotation: number) => {
        ground.grid.locs.push({ id: FENCE, type: LOC_WALL, rotation, level: 0, x, y });
    };
    for (let along = ARENA_0; along <= ARENA_1; along++) {
        if (along < CLIFF_Y) {
            fence(ARENA_0, along, WALL_WEST);
            fence(ARENA_1, along, WALL_EAST);
        }
        fence(along, ARENA_0, WALL_SOUTH);
    }
    for (let y = 2; y < CLIFF_Y; y++) {
        for (let x = 2; x < SIZE - 4; x++) {
            if (inArena(x, y) || rng() > 0.06) {
                continue;
            }
            const near = Math.min(
                Math.abs(x - ARENA_0),
                Math.abs(x - ARENA_1),
                Math.abs(y - ARENA_0),
            );
            const id = rng() < 0.85 ? TREES[Math.floor(rng() * TREES.length)] : ROCKS;
            const size = id === ROCKS ? 2 : 3;
            const clear =
                !inArena(x, y) &&
                !inArena(x + size - 1, y) &&
                !inArena(x, y + size - 1) &&
                !inArena(x + size - 1, y + size - 1);
            // Thinner far out, where the camera only glimpses it
            if (clear && (near < 20 || rng() < 0.4) && ground.isClear(x, y, size, size)) {
                ground.place(
                    { id, type: LOC_NORMAL, rotation: Math.floor(rng() * 4), level: 0, x, y },
                    size,
                    size,
                );
            }
        }
    }
}

function buildDetail(context: BuildContext): GeneratedMap {
    const yard = new Yard(context);
    const { ground } = yard;
    yard.keepClear(START.x - 3, START.y - 3, 7, 7, 0);
    const box = GHORROCK_BOSS_ARENA;
    yard.keepClear(box.x, box.y, box.size, box.size, 0);
    for (const brazier of GHORROCK_BRAZIERS) {
        yard.keepClear(brazier.x, brazier.y, 2, 2, 3);
    }
    for (const vent of GHORROCK_VENTS) {
        yard.keepClear(vent.x - 1, vent.y - 1, 3, 3, 1);
    }
    paintGround(yard);
    placeCold(yard);
    placePrison(yard);
    placeYard(yard);
    placeBoundary(yard);
    // Nothing outside the yard is walked on, nor the cliff
    const level = ground.grid.levels[0];
    for (let y = 0; y < SIZE; y++) {
        for (let x = 0; x < SIZE; x++) {
            if (!inArena(x, y) || y >= CLIFF_Y) {
                level.flags[x + y * SIZE] |= TILE_BLOCKED;
            }
        }
    }
    const rect = { x0: ARENA_0, y0: ARENA_0, x1: ARENA_1, y1: CLIFF_Y - 1 };
    const sealed = sealFrom(ground.grid, context.locs, [
        { name: "the yard", rect, from: START, maxSealed: 400 },
    ]);
    assertReachable(sealed, POINTS, "Ghorrock");
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
        standIns: yard.standIns,
        // The cliff and the prison's front are built as the real ones are, not to the generator's
        // rules for ground
        designed: [{ x0: 0, y0: CLIFF_Y - 3, x1: SIZE - 1, y1: SIZE - 1 }],
    };
}

export const GHORROCK_RECIPE: MapRecipe = {
    id: "ghorrock",
    mapX: MAP_X,
    mapY: MAP_Y,
    squaresX: SQUARES,
    squaresY: SQUARES,
    margin: MARGIN,
    spawn: START,
    build: (context) => buildDetail(context).grid,
    detail: buildDetail,
    points: POINTS,
};

// Grid tiles to world tiles: a tile's south-west corner, or (middle) its middle
export function ghorrockWorld(tile: Tile, middle = false): Tile {
    const at = middle ? 0.5 : 0;
    return {
        x: MAP_X * MAP_SQUARE_SIZE + tile.x + at,
        y: MAP_Y * MAP_SQUARE_SIZE + tile.y + at,
    };
}
