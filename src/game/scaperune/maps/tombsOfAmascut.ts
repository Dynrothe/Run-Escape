import { APMEKEN_BARRIER_LOC } from "../../content/tombs";
import { Ground } from "../Ground";
import { blockTile, findReachable, getCollisionFlags } from "../collision";
import { MAP_SQUARE_SIZE, TILE_BLOCKED, TileGrid } from "../format";
import { cutPrefab, rotatePrefab } from "../prefab";
import { BuildContext, MapRecipe } from "../recipe";

// The Tombs of Amascut, as a raid: its real rooms cut from the cache, each in a cell of its own,
// walled off in the dark. The Nexus is the hub, with a door to each of the four paths. In
// development: a dev map only (maps/devMaps.ts) until the whole raid's built
// (docs/design/tombs-of-amascut.md). It uses the raid's own floor and pillars, which the catalogue
// keeps off made maps, so its id doesn't start with scaperune_ and check-maps leaves it alone.
//
// Cells are one map square each, COLUMNS by ROWS, for the Nexus, the four puzzle rooms, the four
// boss rooms, the Wardens' two rooms and the tomb.

const MAP_X = 86;
const MAP_Y = 66;
const MARGIN = 1;
const COLUMNS = 6;
const ROWS = 2;
const CELL = MAP_SQUARE_SIZE;
const SQUARES_X = COLUMNS + MARGIN * 2;
const SQUARES_Y = ROWS + MARGIN * 2;
const SIZE_X = SQUARES_X * MAP_SQUARE_SIZE;
const SIZE_Y = SQUARES_Y * MAP_SQUARE_SIZE;
const ARENA_MIN = MARGIN * MAP_SQUARE_SIZE;

const FLOOR_HEIGHT = 24;

export type ToaPathId = "apmeken" | "het" | "scabaras" | "crondis";

// A room: a rectangle of the real world in world tiles, its plane, its cell, and where the party
// stands when it's brought in, in tiles from the cut's south-west corner
type RoomCut = {
    x: number;
    y: number;
    sizeX: number;
    sizeY: number;
    plane: number;
    cell: [column: number, row: number];
    // Where the party comes in, in tiles from the corner as it lies once turned
    arrive: [x: number, y: number];
    // Quarter turns clockwise, as it's cut (rotatePrefab)
    turns?: number;
};

// A cut's size as it lies, turned
function turnedSize(cut: RoomCut): [x: number, y: number] {
    return (cut.turns ?? 0) & 1 ? [cut.sizeY, cut.sizeX] : [cut.sizeX, cut.sizeY];
}

// The Nexus, in square 55,80: the entry at the south, a path door at each corner. The doors'
// south-west tiles, from the cut's corner (scripts/cache/dump-square.ts 55,80, locs 46155 to
// 46167), with their sizes
const NEXUS: RoomCut = {
    x: 3536,
    y: 5130,
    sizeX: 32,
    sizeY: 36,
    plane: 0,
    cell: [0, 0],
    arrive: [15, 8],
};

const NEXUS_DOORS: Record<ToaPathId, [x: number, y: number, sizeX: number, sizeY: number]> = {
    // Path of Apmeken, 3x2 turned a quarter
    apmeken: [26, 16, 2, 3],
    // Path of Het, 3x2 turned three quarters
    het: [3, 16, 2, 3],
    // Path of Scabaras, 3x3
    scabaras: [23, 25, 3, 3],
    // Path of Crondis, 3x3
    crondis: [5, 25, 3, 3],
};

// The Apmeken room, in square 59,82: the entry on the east, the exit on the west, each behind a
// barrier (45135). The party's brought in to the safe corridor behind the east one, which comes out
// of the map: the sim holds that line instead (closed once the room's started, open while it
// waits), as the map's collision can't change in a run.
const APMEKEN: RoomCut = {
    x: 3790,
    y: 5267,
    sizeX: 37,
    sizeY: 28,
    plane: 0,
    cell: [1, 0],
    arrive: [33, 13],
};

// Ba-Ba's arena, in square 59,84: the entrance room on the west, with the teleport crystal
// (local 18,32), the safe area as in OSRS, through a passage (its barrier, wall loc 45860 at x 20
// and 21, comes out of the map: the sim holds the line instead) to the arena, her throne on the
// east (46,31), debris for cover all over it. She rises once the party's through the passage.
const BA_BA_ARENA: RoomCut = {
    x: 3786,
    y: 5396,
    sizeX: 40,
    sizeY: 25,
    plane: 0,
    cell: [2, 0],
    // Turned three quarters clockwise: her throne's to the north and the entrance south, so her
    // boulders roll down the screen at you, as in OSRS. In the cut's own tiles (west to east)
    // the entrance room is x 3 to 8 and the passage 9 to 12 at y 11 to 13; turned, a tile (x, y)
    // lies at (24 - y, x).
    arrive: [12, 6],
    turns: 3,
};
// The entrance's barrier, which comes out of the map, and its passage's tiles (from the cut's corner)
const BA_BA_BARRIER = 45860;
// What edges the barrier on both sides of the passage (ground decoration that blocks)
const BA_BA_BARRIER_EDGE = [45861, 45862, 45863, 45864, 45865];
// (the cut's own tiles, before it's turned)
const BA_BA_PASSAGE = [9, 10, 11].flatMap((x) => [11, 12, 13].map((y) => [x, y]));

// Where she rises (turned), and the row past which (north) the fight's on: the passage's far end
const BA_BA_AT = [12, 31];
const FIGHT_LINE = 12;
// Her rolling stones (turned): her altar before her throne, and where the party's put, the foot
// of the arena on its west side. Mind the Gap's gap is the arena's own, where its barrier stood:
// the floor that isn't drawn (overlay 42) at x 10 to 14 (y 10 to 14 in the cut's own tiles),
// rubble either side, out to the first row past the line the fight holds (FIGHT_LINE), so the
// middle of the foot is a drop and her boulders' knockback can put you in it.
const BA_BA_ALTAR = [12, 33];
const BA_BA_FOOT = [7, 14];
const BA_BA_PIT = { x0: 10, x1: 15, y0: 9, y1: FIGHT_LINE + 1.9 };

// The east barrier: its loc, and its tiles in square 59,82 (one tile across, three long)
const APMEKEN_BARRIER = APMEKEN_BARRIER_LOC;
const APMEKEN_GATE = { x: 44, y: [31, 32, 33] };

function cellCorner(cut: RoomCut): { x: number; y: number } {
    const [column, row] = cut.cell;
    return {
        x: ARENA_MIN + column * CELL + Math.floor((CELL - turnedSize(cut)[0]) / 2),
        y: ARENA_MIN + row * CELL + Math.floor((CELL - turnedSize(cut)[1]) / 2),
    };
}

const NEXUS_AT = cellCorner(NEXUS);
const NEXUS_ARRIVE = { x: NEXUS_AT.x + NEXUS.arrive[0], y: NEXUS_AT.y + NEXUS.arrive[1] };

// Every room on the map, where it's stamped and where the party's brought in
const ROOMS = [NEXUS, APMEKEN, BA_BA_ARENA].map((cut) => {
    const at = cellCorner(cut);
    return {
        cut,
        at,
        rect: {
            x0: at.x,
            y0: at.y,
            x1: at.x + turnedSize(cut)[0] - 1,
            y1: at.y + turnedSize(cut)[1] - 1,
        },
        arrive: { x: at.x + cut.arrive[0], y: at.y + cut.arrive[1] },
    };
});
const APMEKEN_ROOM = ROOMS[1];
const BA_BA_ROOM = ROOMS[2];

const worldTile = (x: number, y: number) => ({
    x: MAP_X * MAP_SQUARE_SIZE + x + 0.5,
    y: MAP_Y * MAP_SQUARE_SIZE + y + 0.5,
});

// Where things are in world tiles, for the raid's MapDef (content/tombs.ts)
export const TOA_PLACES = {
    nexus: {
        arrive: worldTile(NEXUS_ARRIVE.x, NEXUS_ARRIVE.y),
        // Each door's middle
        doors: Object.fromEntries(
            Object.entries(NEXUS_DOORS).map(([id, [x, y, sizeX, sizeY]]) => [
                id,
                {
                    x: MAP_X * MAP_SQUARE_SIZE + NEXUS_AT.x + x + sizeX / 2,
                    y: MAP_Y * MAP_SQUARE_SIZE + NEXUS_AT.y + y + sizeY / 2,
                },
            ]),
        ) as Record<ToaPathId, { x: number; y: number }>,
    },
    // Ba-Ba's arena: where the party comes in, where she rises, and the line past which she does
    baba: {
        arrive: worldTile(BA_BA_ROOM.arrive.x, BA_BA_ROOM.arrive.y),
        at: worldTile(BA_BA_ROOM.at.x + BA_BA_AT[0], BA_BA_ROOM.at.y + BA_BA_AT[1]),
        line: { y: MAP_Y * MAP_SQUARE_SIZE + BA_BA_ROOM.at.y + FIGHT_LINE + 1 },
        boulders: {
            altar: worldTile(BA_BA_ROOM.at.x + BA_BA_ALTAR[0], BA_BA_ROOM.at.y + BA_BA_ALTAR[1]),
            start: worldTile(BA_BA_ROOM.at.x + BA_BA_FOOT[0], BA_BA_ROOM.at.y + BA_BA_FOOT[1]),
            pit: {
                x0: MAP_X * MAP_SQUARE_SIZE + BA_BA_ROOM.at.x + BA_BA_PIT.x0,
                x1: MAP_X * MAP_SQUARE_SIZE + BA_BA_ROOM.at.x + BA_BA_PIT.x1,
                y0: MAP_Y * MAP_SQUARE_SIZE + BA_BA_ROOM.at.y + BA_BA_PIT.y0,
                y1: MAP_Y * MAP_SQUARE_SIZE + BA_BA_ROOM.at.y + BA_BA_PIT.y1,
            },
        },
    },
    apmeken: {
        arrive: worldTile(APMEKEN_ROOM.arrive.x, APMEKEN_ROOM.arrive.y),
        // The six holes in the walls the baboons crawl in by (45024, wall locs in square 59,82, at
        // 24,23 32,23 40,23 on the south wall and 24,41 32,41 40,41 on the north): the tile inside each
        entrances: [
            [24, 24],
            [32, 24],
            [40, 24],
            [24, 40],
            [32, 40],
            [40, 40],
        ].map(([x, y]) => {
            const at = apmekenSpot("vent", x + 0.5, y + 0.5, 0);
            return { x: at.x, y: at.y };
        }),
        // The east barrier's line (its tiles' west edge), and its tiles' middles, to draw it by
        gate: {
            x: apmekenSpot("vent", APMEKEN_GATE.x, 0, 0).x,
            locId: APMEKEN_BARRIER,
            tiles: APMEKEN_GATE.y.map((y) => {
                const at = apmekenSpot("vent", APMEKEN_GATE.x + 0.5, y + 0.5, 0);
                return { x: at.x, y: at.y };
            }),
        },
        spots: [
            // The four roof supports (45494, 3 by 3, in the alcoves), in square 59,82's tiles: their
            // middles, and how close counts as at one
            ...[
                [27, 21],
                [35, 21],
                [27, 41],
                [35, 41],
            ].map(([x, y]) => apmekenSpot("pillar", x + 1.5, y + 1.5, 2.7)),
            // The four vents: the grates in the main floor's corners (ground decoration 5982 at
            // 24,37 25,28 39,36 40,37 40,27 41,28, a few pieces each), by their middles
            ...[
                [24.5, 37.5],
                [25.5, 28.5],
                [40, 37],
                [41, 28],
            ].map(([x, y]) => apmekenSpot("vent", x, y, 2.2)),
        ],
    },
};

// A spot in the Apmeken room from its tile in square 59,82, in world tiles
function apmekenSpot(kind: "pillar" | "vent", x: number, y: number, reach: number) {
    const local = {
        x: 59 * MAP_SQUARE_SIZE - APMEKEN.x + x,
        y: 82 * MAP_SQUARE_SIZE - APMEKEN.y + y,
    };
    return {
        kind,
        x: MAP_X * MAP_SQUARE_SIZE + APMEKEN_ROOM.at.x + local.x,
        y: MAP_Y * MAP_SQUARE_SIZE + APMEKEN_ROOM.at.y + local.y,
        reach,
    };
}

function build(context: BuildContext): TileGrid {
    const ground = new Ground(SIZE_X, SIZE_Y);
    for (let y = 0; y <= SIZE_Y; y++) {
        for (let x = 0; x <= SIZE_X; x++) {
            ground.setHeight(x, y, FLOOR_HEIGHT);
        }
    }
    for (const room of ROOMS) {
        const { cut } = room;
        // The Apmeken room's east barrier is the sim's (APMEKEN, above)
        const gateX = 59 * MAP_SQUARE_SIZE - APMEKEN.x + APMEKEN_GATE.x;
        const prefab = cutPrefab(context.maps, cut.x, cut.y, cut.sizeX, cut.sizeY);
        // Left out, in the cut's own tiles, before it's turned
        prefab.locs = prefab.locs.filter(
            (loc) =>
                !(cut === APMEKEN && loc.id === APMEKEN_BARRIER && loc.x === gateX) &&
                !(
                    cut === BA_BA_ARENA &&
                    (loc.id === BA_BA_BARRIER ||
                        BA_BA_BARRIER_EDGE.includes(loc.id) ||
                        // The invisible wall (85) sealing the arena's west side, across the
                        // passage only
                        (loc.id === 85 && loc.x === 12 && loc.y >= 11 && loc.y <= 13))
                ),
        );
        // The passage's floor, blocked where its barrier stood: open, as the sim holds the line
        if (cut === BA_BA_ARENA) {
            for (const [x, y] of BA_BA_PASSAGE) {
                prefab.levels[0].flags[x + y * cut.sizeX] &= ~TILE_BLOCKED;
            }
        }
        ground.stamp(
            cut.turns ? rotatePrefab(prefab, cut.turns, context.locs) : prefab,
            room.at.x,
            room.at.y,
            {
                floor: "all",
                feather: 0,
                flatten: true,
                height: FLOOR_HEIGHT,
            },
        );
    }

    // Only what can be walked to in each room from where the party's brought in is open: the rest
    // is blocked, and outside the rooms it has no floor, so it draws as the dark
    const collision = getCollisionFlags(ground.grid, context.locs);
    const open = new Uint8Array(SIZE_X * SIZE_Y);
    for (const room of ROOMS) {
        const reached = findReachable(
            collision,
            SIZE_X,
            SIZE_Y,
            room.rect,
            room.arrive.x,
            room.arrive.y,
        );
        let count = 0;
        for (let i = 0; i < reached.length; i++) {
            if (reached[i]) {
                open[i] = 1;
                count++;
            }
        }
        if (count < 200) {
            throw new Error(
                `Tombs of Amascut: the room at ${room.cut.x},${room.cut.y} has ${count} open tiles`,
            );
        }
    }
    const inRoom = (x: number, y: number) =>
        ROOMS.some(({ rect }) => x >= rect.x0 && y >= rect.y0 && x <= rect.x1 && y <= rect.y1);
    for (let y = 0; y < SIZE_Y; y++) {
        for (let x = 0; x < SIZE_X; x++) {
            const i = ground.tile(x, y);
            if (open[i]) {
                continue;
            }
            blockTile(ground.grid, i);
            if (!inRoom(x, y)) {
                ground.level0.underlays[i] = 0;
                ground.level0.overlays[i] = 0;
            }
        }
    }
    return ground.grid;
}

const PATH_NAMES: Record<ToaPathId, string> = {
    apmeken: "Path of Apmeken",
    het: "Path of Het",
    scabaras: "Path of Scabaras",
    crondis: "Path of Crondis",
};

export const TOMBS_OF_AMASCUT: MapRecipe = {
    id: "tombs_of_amascut",
    mapX: MAP_X,
    mapY: MAP_Y,
    squaresX: SQUARES_X,
    squaresY: SQUARES_Y,
    margin: MARGIN,
    spawn: NEXUS_ARRIVE,
    build,
    mapDef: {
        name: "Tombs of Amascut",
        description:
            "In development. The Nexus, with a door to each of the four paths, and the " +
            "invocations' raid level in place of hard mode.",
        // Osmumten's fang
        iconObjId: 26219,
        // As the Theatre of Blood's, before the raid level's on top
        difficulty: { hp: 3.75, damage: 2.7 },
        waves: [],
        events: [],
        finalBossWarning: "",
        victoryText: "",
        // A raid, not a fun map: not endless
        fun: undefined,
        tombs: {
            nexus: TOA_PLACES.nexus.arrive,
            paths: (Object.keys(PATH_NAMES) as ToaPathId[]).map((id) => ({
                id,
                name: PATH_NAMES[id],
                door: TOA_PLACES.nexus.doors[id],
                ...(id === "apmeken" && {
                    room: {
                        arrive: TOA_PLACES.apmeken.arrive,
                        puzzle: "apmeken" as const,
                        spots: TOA_PLACES.apmeken.spots,
                        gate: TOA_PLACES.apmeken.gate,
                        entrances: TOA_PLACES.apmeken.entrances,
                        boss: {
                            enemyId: "ba_ba",
                            arrive: TOA_PLACES.baba.arrive,
                            at: TOA_PLACES.baba.at,
                            line: TOA_PLACES.baba.line,
                            boulders: TOA_PLACES.baba.boulders,
                        },
                    },
                }),
            })),
        },
    },
};
