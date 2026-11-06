import { LOOSE_RUBBLE, getCharredLoc } from "../../../rs/config/loctype/LocOverrides";
import { Ground } from "../Ground";
import { assertReachable, sealFrom } from "../collision";
import { MAP_SQUARE_SIZE, type PlacedLoc, TILE_BLOCKED, type TileGrid } from "../format";
import type { GeneratedMap } from "../generator";
import { createNoise } from "../noise";
import { cutPrefab } from "../prefab";
import type { BuildContext, LocInfo, MapPoint, MapRecipe } from "../recipe";
import { type RuinReport, ruinGrid, tileHash } from "../ruins";

// The Battle for Varrock (content/explore.ts): Varrock as it is in OSRS, tile for tile, burnt to
// ruins. The whole city is cut from the cache with the country round it (map squares 48 to 52 by
// 51 to 55, the middle three by three the arena), and put through ruins.ts: its houses, shops,
// churches and palace stand where they stood with their walls charred, some fallen and some
// broken down (the Wilderness's ruined walls), roofs, doors and upstairs gone; its trees burnt,
// its gardens burnt off, its streets and squares gone to soot and its grass to ash. The city wall
// stands, burnt, breached and its stone piled in the gaps. Where the square's fountain stood
// there's a crater, still burning at its heart. Over that: fires, burnt skeletons, rubble, and the
// dead adventurers of Phosani's Sanctuary and the Theatre of Blood (the Theatre's raiders). The
// palace's floor is gone, and the game lays its own in its place (MapDef.floor, the floor system's
// tiles in an ashen skin) from the top of its front steps, with Yama on his throne at its north
// end. The run starts just outside the south gate.

const MAP_X = 72;
const MAP_Y = 164;
const SQUARES = 5;
const MARGIN = 1;
const SIZE = SQUARES * MAP_SQUARE_SIZE;

// The real world under the grid's south-west corner: map square 48, 51
const REAL_X = 48 * MAP_SQUARE_SIZE;
const REAL_Y = 51 * MAP_SQUARE_SIZE;

const toGrid = (realX: number, realY: number) => ({ x: realX - REAL_X, y: realY - REAL_Y });

// Just outside the south gate, on the road in (the gate's the gap in the wall at 3210 to 3212,
// 3381)
const START = toGrid(3211, 3377);
// Varrock Square, south of its crater, and the palace's front court
const SQUARE = toGrid(3212, 3422);
const PALACE_COURT = toGrid(3212, 3460);

// The palace's floor, which the game draws (MapDef.floor): a row a string, the north row
// first, from PALACE_FLOOR_RECT's south-west corner. "#" is floor, "." isn't (the outside
// round the palace's corners, which the floor's box blocks). Its stone in the cache (overlay
// 171), its east stair hall and its middle garden, from the top of its front steps (3467) to
// 3226, 3497. The floor's tiles are flat, each at the ground's height at its middle, so it stops
// at the steps: across them its rows stood at three heights with the slope showing between.
// The court and the steps up from it are the ground's, burnt like the rest.
export const PALACE_FLOOR_RECT_REAL = { x0: 3200, y0: 3467, x1: 3226, y1: 3497 };
export const PALACE_FLOOR_ASCII: string[] = [
    "#########################..",
    "#########################..",
    "#########################..",
    ".########################..",
    ".########################..",
    ".########################..",
    ".########################..",
    ".##########################",
    ".##########################",
    ".##########################",
    ".##########################",
    ".##########################",
    ".##########################",
    ".##########################",
    ".##########################",
    ".##########################",
    ".##########################",
    ".##########################",
    ".##########################",
    ".##########################",
    ".##########################",
    ".##########################",
    ".##########################",
    "###########################",
    "##########################.",
    "###########################",
    "##########################.",
    "##########################.",
    ".########################..",
    ".########################..",
    ".########################..",
];

// Yama on his throne, at the north end of the palace's floor, facing south down it: the cache's
// npc 15645 (his throne 9832 and him 9434, sitting with 12153), made small. The game draws him
// (MapDef.props: his sitting is skeletal, which a loc can't play); the map blocks where he sits,
// YAMA_SIZE tiles from YAMA.
const YAMA = toGrid(3211, 3494);
const YAMA_SIZE = { x: 5, y: 3 };
// His npc is 7 tiles across; at 0.6 he's about 4
export const YAMA_SCALE = 0.6;

// What the conversion leaves standing, by name: the square's fountain, the churches' altars,
// the market's stalls and the like are what make it Varrock
const LANDMARK = /fountain|statue|stall|anvil|altar|well|bank booth|staircase|ladder|sign/i;

// Fires: burning timber (Burning driftwood, 2 by 2) and a fire on its logs; burning bones; and
// a wall of flame (a wall loc) where a wall burnt down
const FIRE = [4266, 5499];
const BURNING_TIMBER = 31722;
const BURNING_BONES = 3862;
export const WALL_OF_FLAME = 4765;
// Beside Yama's throne
export const BRAZIER = 28818;

// Loc types
const LOC_NORMAL = 10;
const LOC_FLOOR_DECORATION = 22;
const WALL_TYPES = new Set([0, 1, 2, 3, 9]);
// The cache's "inside" tile flag (a roof over it)
const TILE_INSIDE = 0x4;

// Broken walls: the Wilderness's ruins' own (the ruin west of the Dark Warriors' Fortress is
// 14622 to 14627), dark stone broken off at its top (14623, a corner too), a stub (14624, a
// corner post and a diagonal too) and a stub with a corner (14632's, which the Wilderness also
// places). Varrock's walls are its grey stone, which burnt comes out as dark as these.
const CRUMBLED = {
    high: { 0: 14623, 1: 14632, 2: 14623, 3: 14624, 9: 14624 },
    low: { 0: 14624, 1: 14632, 2: 14632, 3: 14624, 9: 14624 },
};
// The same ruins' stones on the ground along a wall's foot (blocking nothing), and their pile of
// stone
const FALLEN_STONES = [14628, 14629];
const STONE_PILE = 14631;

// Plants with no name, which the plant rule can't find: blue flowers (2732, 2781), potted
// plants (4496, 4498, 4499) and the palace's roses (23617 to 23620)
const NAMELESS_PLANTS = [2732, 2781, 4496, 4498, 4499, 23617, 23618, 23619, 23620];
// The palace's front steps, which the ground under them climbs
const PALACE_STEPS = 23884;
// The decks over the city's and the palace's gateways (23784 to 23793) and lintels over doors,
// which rest on the walls round them
const WALL_TOPS = [
    23784, 23785, 23786, 23787, 23788, 23789, 23790, 23791, 23792, 23793, 3189, 9585, 23752, 23909,
];

const RULES = {
    seed: 3482,
    wallScale: 7,
    fallen: 0.62,
    broken: 0.47,
    crumbled: CRUMBLED,
    fallenStones: { ids: FALLEN_STONES, share: 0.5 },
    breaches: 0.5,
    breachRubble: {
        ends: [STONE_PILE],
        share: 0.6,
        loose: [
            ...LOOSE_RUBBLE.map((id): [number, number] => [id, LOC_NORMAL]),
            ...FALLEN_STONES.map((id): [number, number] => [id, LOC_FLOOR_DECORATION]),
        ],
        looseShare: 0.35,
    },
    steps: [PALACE_STEPS],
    tops: WALL_TOPS,
    wallTopsKept: 0.5,
    furnitureKept: 0.3,
    // Grass, earth and the rest to ash and scorched ground, mottled
    underlays: (() => {
        const ash = createNoise(77, 3);
        // Pale ash, grey ash and scorched brown earth
        const ASH = [130, 175, 94, 197, 55, 197];
        return (underlay: number, x: number, y: number) => {
            const n = Math.min(0.999, Math.max(0, ash(x / 9, y / 9)));
            return ASH[Math.floor(n * ASH.length)];
        };
    })(),
    // Varrock's paving (171) and paths (173) to soot, wooden floors (81) charred, and nothing
    // left hidden
    overlays: {
        171: 82,
        173: 83,
        172: 83,
        81: 90,
        89: 90,
        22: 90,
        80: 90,
        60: 90,
        14: 90,
        108: 90,
        163: 50,
        56: 2,
        4: 10,
        3: 2,
        8: 2,
        // The hidden floor (it draws nothing), under walls that may have fallen
        42: 0,
        61: 0,
    } as Record<number, number>,
    // A burnt tree for each: the cache's Burnt trees (Morytania's), a third of them burnt to
    // nothing (each is hundreds of triangles, and the country round the city's thick with them)
    burntTrees: { 1: [30854], 2: [30852, 30853] },
    treesKept: 0.65,
    // Trees but their stumps, and every plant (a farming patch is its weeds)
    tree: /tree(?! stump)|^oak$|^willow$|^yew$|^maple$|^magic tree$/i,
    plant: /bush|plant|flower|fern|hedge|shrub|daisies|roses|tulip|weeds|cabbage|potato|wheat|grass|thistle|nettle|bullrush|onion|cactus|heather|lily|ivy|vine|patch|hops|barley|snowdrop|delphinium|belladonna|carrot/i,
    plants: NAMELESS_PLANTS,
    gone: /door|gate|curtain|banner|torch|candle|lamp|lantern|window|washing|cloth|rug/i,
    // Walls of flame where a tenth of the fallen straight walls stood
    burning: { wall: WALL_OF_FLAME, share: 0.12 },
};

// The dressing. Fires that burn on (the cache's fire on its logs, animated), burnt skeletons (the cache's
// skeletons, charred), Phosani's Sanctuary's and the Theatre's dead raiders (a skeleton in
// armour, the mercenaries' bodies), rubble and burnt rock underfoot.
const BURNT_SKELETONS = [getCharredLoc(5358), getCharredLoc(5359), getCharredLoc(5360)];
const CHARRED_BONES = 659;
// [id, tiles across, tiles deep]
const DEAD_ADVENTURERS: [number, number, number][] = [
    [32735, 2, 1],
    [32742, 2, 1],
    [32741, 2, 1],
    [32754, 1, 1],
];
const EXHUMED = 32743;
const RUBBLE = [12812, 12813, 12814, 12815].map(getCharredLoc);
const ASH_UNDERFOOT = [26844, 26850, 26856];

// The crater where the square's fountain stood (3210 to 3215, 3426 to 3431): a bowl in the
// ground round the fountain's middle (a corner), CRATER_RADIUS tiles across to its lip,
// CRATER_DEPTH height units deep (8 to a byte, 128 to a tile) under a raised lip, ash and soot
// in it, burning at its heart (the cache's crater, 26838, molten in its middle: lit, MapDef
// lighting), with the square's dead and the fountain's stone round it. All of it walkable but
// its heart.
const CRATER = toGrid(3213, 3429);
const CRATER_RADIUS = 5.5;
const CRATER_DEPTH = 24;
const CRATER_LIP = 4;
export const CRATER_HEART = 26838;
// Its ground, underlays so they blend into each other: embers at its heart, scorched dark red
// round it, charcoal in the bowl
const CRATER_EMBERS = 238;
const CRATER_SCORCH = 167;
const CRATER_SOOT = [35, 212];
// Round it, from its middle in tiles: [id, dx, dy, type]. Its heart is 2 by 2, on the middle.
const CRATER_DRESSING: [number, number, number, number][] = [
    [CRATER_HEART, -1, -1, 10],
    // The fountain's stone, on the lip
    [STONE_PILE, -5, 1, 10],
    [STONE_PILE, 4, -4, 10],
    [getCharredLoc(12812), 1, 4, 10],
    [getCharredLoc(12813), -4, -4, 10],
    [getCharredLoc(12814), 4, 2, 10],
    [STONE_PILE, -1, 5, 10],
    [getCharredLoc(12815), 5, -1, 10],
    // Those caught in it, in the bowl
    [BURNT_SKELETONS[0], -3, -1, 10],
    [BURNT_SKELETONS[1], 2, 2, 10],
    [BURNT_SKELETONS[2], -2, 3, 10],
    [getCharredLoc(CHARRED_BONES), 2, -3, 10],
    [getCharredLoc(CHARRED_BONES), -3, 2, 10],
    [BURNING_BONES, 0, -3, 10],
    // Fires on its lip
    [FIRE[1], -5, -2, 10],
    [FIRE[1], 5, 0, 10],
];

// Whether a tile's middle is within the crater's lip, or this much past it
function inCrater(x: number, y: number, past = 0): boolean {
    return Math.hypot(x + 0.5 - CRATER.x, y + 0.5 - CRATER.y) < CRATER_RADIUS + past;
}

// The crater: the fountain and all that stood there gone (the water's plane, upstairs, too),
// the ground dug out and scorched, and its own dressing
function makeCrater(grid: TileGrid, locs: (id: number) => LocInfo, report: VarrockDressing): void {
    const reach = CRATER_RADIUS + 1.5;
    grid.locs = grid.locs.filter((loc) => {
        const info = locs(loc.id);
        const turned = (loc.rotation & 1) === 1;
        const sx = WALL_TYPES.has(loc.type) ? 1 : turned ? info.sizeY : info.sizeX;
        const sy = WALL_TYPES.has(loc.type) ? 1 : turned ? info.sizeX : info.sizeY;
        for (let y = loc.y; y < loc.y + sy; y++) {
            for (let x = loc.x; x < loc.x + sx; x++) {
                if (inCrater(x, y, reach - CRATER_RADIUS)) {
                    return false;
                }
            }
        }
        return true;
    });
    const level0 = grid.levels[0];
    const corners = SIZE + 1;
    const r0 = Math.ceil(CRATER_RADIUS + 4);
    for (let y = CRATER.y - r0; y <= CRATER.y + r0; y++) {
        for (let x = CRATER.x - r0; x <= CRATER.x + r0; x++) {
            // The ground, at the corners: a bowl, and a lip round it that falls back to the square
            const d = Math.hypot(x - CRATER.x, y - CRATER.y) / CRATER_RADIUS;
            const bowl = d < 1 ? CRATER_DEPTH * (1 - d * d) : 0;
            const out = ((d - 1) * CRATER_RADIUS) / 1.4;
            const lip = CRATER_LIP * Math.exp(-out * out);
            const c = x + y * corners;
            level0.heights[c] = Math.max(0, Math.round(level0.heights[c] - bowl + lip));
            // The square's paving blown off round it, raggedly, out to 3 tiles past the lip
            const i = x + y * SIZE;
            if (!inCrater(x, y, 1)) {
                if (inCrater(x, y, 3) && !inCrater(x, y, 0.5 + tileHash(x, y, 54) * 2.5)) {
                    continue;
                }
                if (inCrater(x, y, 3) && level0.overlays[i] !== 0) {
                    level0.overlays[i] = level0.shapes[i] = 0;
                    level0.underlays[i] = RULES.underlays(1, x, y);
                }
                continue;
            }
            // The tiles: open, nothing over them, soot in the bowl and scorched round its heart
            level0.flags[i] &= ~TILE_BLOCKED;
            for (let level = 1; level < grid.levels.length; level++) {
                const tiles = grid.levels[level];
                tiles.flags[i] = 0;
                tiles.overlays[i] = tiles.underlays[i] = 0;
            }
            // Ragged, not in rings: each tile's a little nearer or further from the middle
            const middle =
                Math.hypot(x + 0.5 - CRATER.x, y + 0.5 - CRATER.y) + tileHash(x, y, 52) * 1.4 - 0.7;
            level0.overlays[i] = level0.shapes[i] = 0;
            level0.underlays[i] =
                middle < 1.8
                    ? CRATER_EMBERS
                    : middle < 3
                      ? CRATER_SCORCH
                      : middle < CRATER_RADIUS - 0.3
                        ? CRATER_SOOT[Math.floor(tileHash(x, y, 53) * CRATER_SOOT.length)]
                        : RULES.underlays(1, x, y);
        }
    }
    for (const [id, dx, dy, type] of CRATER_DRESSING) {
        const rotation = type === LOC_NORMAL ? Math.floor(tileHash(dx, dy, 51) * 4) : 0;
        grid.locs.push({ id, type, rotation, level: 0, x: CRATER.x + dx, y: CRATER.y + dy });
        report.crater++;
    }
}

const POINTS: MapPoint[] = [
    { name: "the south gate", ...START },
    { name: "Varrock Square", ...SQUARE },
    { name: "the palace's court", ...PALACE_COURT },
    { name: "before Yama's throne", x: YAMA.x + 1, y: YAMA.y - 3 },
];

const DECKS_BLOCKED = [
    { ...toGrid(3163, 3488), x1: 3166 - REAL_X, y1: 3491 - REAL_Y },
    { ...toGrid(3161, 3479), x1: 3161 - REAL_X, y1: 3479 - REAL_Y },
    { ...toGrid(3285, 3468), x1: 3285 - REAL_X, y1: 3469 - REAL_Y },
].map(({ x, y, x1, y1 }) => ({ x0: x, y0: y, x1, y1 }));

const ARENA = {
    x0: MARGIN * MAP_SQUARE_SIZE,
    y0: MARGIN * MAP_SQUARE_SIZE,
    x1: (SQUARES - MARGIN) * MAP_SQUARE_SIZE - 1,
    y1: (SQUARES - MARGIN) * MAP_SQUARE_SIZE - 1,
};

const PALACE = {
    x0: PALACE_FLOOR_RECT_REAL.x0 - REAL_X,
    y0: PALACE_FLOOR_RECT_REAL.y0 - REAL_Y,
    x1: PALACE_FLOOR_RECT_REAL.x1 - REAL_X,
    y1: PALACE_FLOOR_RECT_REAL.y1 - REAL_Y,
};

// Whether a grid tile is the palace's floor (PALACE_FLOOR_ASCII)
export function isPalaceFloor(x: number, y: number): boolean {
    if (x < PALACE.x0 || x > PALACE.x1 || y < PALACE.y0 || y > PALACE.y1) {
        return false;
    }
    const row = PALACE_FLOOR_ASCII[PALACE.y1 - y];
    return row !== undefined && row[x - PALACE.x0] === "#";
}

// Whether a wall stands between two of the palace's floor tiles (one of its rooms' walls,
// which fell with the floor) rather than round its edge
function isPalaceInside(loc: PlacedLoc): boolean {
    for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
            if (!isPalaceFloor(loc.x + dx, loc.y + dy)) {
                return false;
            }
        }
    }
    return true;
}

// The palace before the conversion: everything on its floor goes (its rooms' walls, furniture
// and floor decoration), the floor's laid by the game. Its outer walls stay for the ruin rules.
function clearPalace(grid: TileGrid): void {
    grid.locs = grid.locs.filter((loc) => {
        if (loc.level !== 0) {
            return true;
        }
        if (WALL_TYPES.has(loc.type)) {
            return !isPalaceInside(loc);
        }
        return !isPalaceFloor(loc.x, loc.y);
    });
}

// Tiles taken by a loc that blocks, or by a wall, for the dressing to keep off
function getTaken(
    grid: TileGrid,
    locs: (id: number) => LocInfo,
): {
    taken: Uint8Array;
    walled: Uint8Array;
} {
    const taken = new Uint8Array(SIZE * SIZE);
    const walled = new Uint8Array(SIZE * SIZE);
    for (const loc of grid.locs) {
        if (loc.level !== 0) {
            continue;
        }
        if (WALL_TYPES.has(loc.type)) {
            walled[loc.x + loc.y * SIZE] = 1;
            continue;
        }
        const info = locs(loc.id);
        const turned = (loc.rotation & 1) === 1;
        const sx = turned ? info.sizeY : info.sizeX;
        const sy = turned ? info.sizeX : info.sizeY;
        for (let y = loc.y; y < loc.y + sy && y < SIZE; y++) {
            for (let x = loc.x; x < loc.x + sx && x < SIZE; x++) {
                taken[x + y * SIZE] = 1;
            }
        }
    }
    return { taken, walled };
}

export type VarrockDressing = {
    fires: number;
    skeletons: number;
    adventurers: number;
    rubble: number;
    crater: number;
    ruins: RuinReport;
};

function dress(grid: TileGrid, locs: (id: number) => LocInfo, report: VarrockDressing): void {
    const { taken, walled } = getTaken(grid, locs);
    const level0 = grid.levels[0];
    const open = (x: number, y: number) => {
        if (x < ARENA.x0 || y < ARENA.y0 || x > ARENA.x1 || y > ARENA.y1) {
            return false;
        }
        const i = x + y * SIZE;
        return !taken[i] && (level0.flags[i] & TILE_BLOCKED) === 0 && level0.overlays[i] !== 6;
    };
    // Clear of walls and anything solid all round, so nothing solid closes a way through
    const clearAround = (x: number, y: number, sx: number, sy: number) => {
        for (let ty = y - 1; ty <= y + sy; ty++) {
            for (let tx = x - 1; tx <= x + sx; tx++) {
                const i = tx + ty * SIZE;
                if (!open(tx, ty) || walled[i]) {
                    return false;
                }
            }
        }
        return true;
    };
    // The streets' own paving stays clear of anything solid
    const street = (x: number, y: number) => {
        const o = level0.overlays[x + y * SIZE];
        return o === 82 || o === 83;
    };
    const put = (id: number, x: number, y: number, sx: number, sy: number, type = LOC_NORMAL) => {
        grid.locs.push({ id, type, rotation: Math.floor(tileHash(x, y, 9) * 4), level: 0, x, y });
        if (type !== LOC_FLOOR_DECORATION) {
            for (let ty = y; ty < y + sy; ty++) {
                for (let tx = x; tx < x + sx; tx++) {
                    taken[tx + ty * SIZE] = 1;
                }
            }
        }
    };
    const pick = <T>(list: T[], x: number, y: number, salt: number): T =>
        list[Math.floor(tileHash(x, y, salt) * list.length)];
    for (let y = ARENA.y0; y <= ARENA.y1; y++) {
        for (let x = ARENA.x0; x <= ARENA.x1; x++) {
            // The gate's clear for the start, and the palace is dressed on its own
            const nearStart = Math.abs(x - START.x) < 5 && Math.abs(y - START.y) < 5;
            if (!open(x, y) || isPalaceFloor(x, y) || nearStart) {
                continue;
            }
            const inside = (level0.flags[x + y * SIZE] & TILE_INSIDE) !== 0;
            const roll = tileHash(x, y, 21);
            // Fires burn on in what's left of the houses, and now and then in the street
            if (roll < (inside ? 0.03 : 0.004)) {
                const timber = tileHash(x, y, 6) < 0.5;
                if (timber && clearAround(x, y, 2, 2)) {
                    put(BURNING_TIMBER, x, y, 2, 2);
                    report.fires++;
                } else if (clearAround(x, y, 1, 1)) {
                    put(pick(FIRE, x, y, 1), x, y, 1, 1);
                    report.fires++;
                }
                continue;
            }
            // Bones still burning, here and there
            if (roll > 0.3 && roll < 0.3 + (inside ? 0.006 : 0.0015)) {
                put(BURNING_BONES, x, y, 1, 1);
                report.skeletons++;
                continue;
            }
            if (street(x, y)) {
                // The fallen, where they fell in the street
                if (roll > 0.9965 && clearAround(x, y, 1, 1)) {
                    put(pick(BURNT_SKELETONS, x, y, 2), x, y, 1, 1);
                    report.skeletons++;
                } else if (roll > 0.993 && roll <= 0.9965) {
                    put(CHARRED_BONES, x, y, 1, 1);
                    report.skeletons++;
                } else if (roll > 0.9915 && roll <= 0.993) {
                    put(EXHUMED, x, y, 1, 1, LOC_FLOOR_DECORATION);
                    report.adventurers++;
                }
                continue;
            }
            if (inside) {
                if (roll > 0.955 && clearAround(x, y, 1, 1)) {
                    put(pick(RUBBLE, x, y, 3), x, y, 1, 1);
                    report.rubble++;
                } else if (roll > 0.94 && roll <= 0.955 && clearAround(x, y, 1, 1)) {
                    put(pick(BURNT_SKELETONS, x, y, 2), x, y, 1, 1);
                    report.skeletons++;
                }
                continue;
            }
            // Out on the ash: the raiders' dead, burnt skeletons, burnt rock underfoot
            if (roll > 0.9965) {
                const [id, sx, sy] = pick(DEAD_ADVENTURERS, x, y, 4);
                if (clearAround(x, y, sx, sy)) {
                    grid.locs.push({ id, type: LOC_NORMAL, rotation: 0, level: 0, x, y });
                    for (let ty = y; ty < y + sy; ty++) {
                        for (let tx = x; tx < x + sx; tx++) {
                            taken[tx + ty * SIZE] = 1;
                        }
                    }
                    report.adventurers++;
                }
            } else if (roll > 0.993 && clearAround(x, y, 1, 1)) {
                put(pick(BURNT_SKELETONS, x, y, 2), x, y, 1, 1);
                report.skeletons++;
            } else if (roll > 0.95) {
                put(pick(ASH_UNDERFOOT, x, y, 5), x, y, 1, 1, LOC_FLOOR_DECORATION);
            }
        }
    }
}

// The palace's floor: its own fires and dead along the walls, rubble where its rooms stood, and
// Yama on his throne at the north end
function dressPalace(grid: TileGrid, report: VarrockDressing): void {
    // Where he sits is blocked ground, as he blocks nothing himself
    for (let y = YAMA.y; y < YAMA.y + YAMA_SIZE.y; y++) {
        for (let x = YAMA.x; x < YAMA.x + YAMA_SIZE.x; x++) {
            grid.levels[0].flags[x + y * SIZE] |= TILE_BLOCKED;
        }
    }
    // A burning brazier either side of him, so he's lit
    for (const dx of [-2, 6]) {
        grid.locs.push({
            id: BRAZIER,
            type: LOC_NORMAL,
            rotation: 0,
            level: 0,
            x: YAMA.x + dx,
            y: YAMA.y,
        });
    }
    for (let y = PALACE.y0; y <= PALACE.y1; y++) {
        for (let x = PALACE.x0; x <= PALACE.x1; x++) {
            // Kept off his throne, and off the way up to it
            // Out in the floor, clear of its edges and doorways
            const inFloor = isPalaceInside({ id: 0, type: 0, rotation: 0, level: 0, x, y });
            if (!inFloor || (Math.abs(x - YAMA.x - 2) < 5 && y > YAMA.y - 6)) {
                continue;
            }
            const roll = tileHash(x, y, 31);
            if (roll < 0.012) {
                grid.locs.push({ id: FIRE[0], type: LOC_NORMAL, rotation: 0, level: 0, x, y });
                report.fires++;
            } else if (roll > 0.988) {
                const id = BURNT_SKELETONS[Math.floor(tileHash(x, y, 2) * 2)];
                grid.locs.push({
                    id,
                    type: LOC_NORMAL,
                    rotation: Math.floor(roll * 400) & 3,
                    level: 0,
                    x,
                    y,
                });
                report.skeletons++;
            } else if (roll > 0.982) {
                grid.locs.push({
                    id: EXHUMED,
                    type: LOC_FLOOR_DECORATION,
                    rotation: 0,
                    level: 0,
                    x,
                    y,
                });
                report.adventurers++;
            }
        }
    }
}

export function buildVarrockDetail(context: BuildContext): GeneratedMap & {
    dressing: VarrockDressing;
} {
    const ground = new Ground(SIZE, SIZE);
    const city = cutPrefab(context.maps, REAL_X, REAL_Y, SIZE, SIZE);
    clearPalace(city);
    const ruins = ruinGrid(city, context.locs, {
        ...RULES,
        landmark: LANDMARK,
    });
    const dressing: VarrockDressing = {
        fires: 0,
        skeletons: 0,
        adventurers: 0,
        rubble: 0,
        crater: 0,
        ruins,
    };
    dress(city, context.locs, dressing);
    dressPalace(city, dressing);
    makeCrater(city, context.locs, dressing);
    ground.stamp(city, 0, 0, { floor: "all", feather: 0, flatten: false, height: 0, anchor: 0 });
    // What can't be walked to from the gate is blocked, so nothing turns up stranded
    const sealed = sealFrom(ground.grid, context.locs, [
        { name: "Varrock", rect: ARENA, from: START },
    ]);
    assertReachable(sealed, POINTS, "Battle for Varrock");
    return {
        grid: ground.grid,
        footprint: ground.footprint,
        roadTiles: new Uint8Array(SIZE * SIZE),
        lines: [],
        buildings: [],
        landmarks: [],
        passes: [],
        walkSlope: 48,
        caves: [],
        falls: [],
        waterfalls: [],
        // All of it is the real world's
        designed: [{ x0: 0, y0: 0, x1: SIZE - 1, y1: SIZE - 1 }],
        // Decks blocked in OSRS too, which check-maps.ts would hold to being walked like a
        // bridge's: the Grand Exchange's counter in its middle, and a tile of it and of the
        // bridge east of the palace
        squares: DECKS_BLOCKED,
        dressing,
    };
}

export const BATTLE_FOR_VARROCK_RECIPE: MapRecipe = {
    id: "battle_for_varrock",
    mapX: MAP_X,
    mapY: MAP_Y,
    squaresX: SQUARES,
    squaresY: SQUARES,
    margin: MARGIN,
    spawn: START,
    build: (context) => buildVarrockDetail(context).grid,
    detail: buildVarrockDetail,
    points: POINTS,
    // The Theatre of Blood's dead raiders, as Phosani's Sanctuary has them
    allowLocs: [
        [32735, 32735],
        [32741, 32743],
        [32754, 32754],
    ],
};

// In world tiles: where the run starts, the palace's floor's box and Yama's throne
const WORLD_X = MAP_X * MAP_SQUARE_SIZE - REAL_X;
const WORLD_Y = MAP_Y * MAP_SQUARE_SIZE - REAL_Y;
export const BATTLE_FOR_VARROCK = {
    arena: {
        baseX: (MAP_X + MARGIN) * MAP_SQUARE_SIZE,
        baseY: (MAP_Y + MARGIN) * MAP_SQUARE_SIZE,
        sizeX: (SQUARES - MARGIN * 2) * MAP_SQUARE_SIZE,
        sizeY: (SQUARES - MARGIN * 2) * MAP_SQUARE_SIZE,
    },
    spawn: {
        x: MAP_X * MAP_SQUARE_SIZE + START.x + 0.5,
        y: MAP_Y * MAP_SQUARE_SIZE + START.y + 0.5,
    },
    palaceFloor: {
        x0: PALACE_FLOOR_RECT_REAL.x0 + WORLD_X,
        y0: PALACE_FLOOR_RECT_REAL.y0 + WORLD_Y,
        x1: PALACE_FLOOR_RECT_REAL.x1 + WORLD_X,
        y1: PALACE_FLOOR_RECT_REAL.y1 + WORLD_Y,
    },
    // Yama's middle, where the game draws him
    yama: {
        x: MAP_X * MAP_SQUARE_SIZE + YAMA.x + YAMA_SIZE.x / 2,
        y: MAP_Y * MAP_SQUARE_SIZE + YAMA.y + YAMA_SIZE.y / 2,
    },
};
