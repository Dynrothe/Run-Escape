import { Ground } from "../Ground";
import { blockTile, findReachable, getCollisionFlags } from "../collision";
import { MAP_SQUARE_SIZE, TileGrid } from "../format";
import { cutPrefab } from "../prefab";
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
    arrive: [x: number, y: number];
};

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
// barrier (45135) that holds until the room's done, so the party's brought in between them
const APMEKEN: RoomCut = {
    x: 3790,
    y: 5267,
    sizeX: 37,
    sizeY: 28,
    plane: 0,
    cell: [1, 0],
    arrive: [26, 13],
};

function cellCorner(cut: RoomCut): { x: number; y: number } {
    const [column, row] = cut.cell;
    return {
        x: ARENA_MIN + column * CELL + Math.floor((CELL - cut.sizeX) / 2),
        y: ARENA_MIN + row * CELL + Math.floor((CELL - cut.sizeY) / 2),
    };
}

const NEXUS_AT = cellCorner(NEXUS);
const NEXUS_ARRIVE = { x: NEXUS_AT.x + NEXUS.arrive[0], y: NEXUS_AT.y + NEXUS.arrive[1] };

// Every room on the map, where it's stamped and where the party's brought in
const ROOMS = [NEXUS, APMEKEN].map((cut) => {
    const at = cellCorner(cut);
    return {
        cut,
        at,
        rect: { x0: at.x, y0: at.y, x1: at.x + cut.sizeX - 1, y1: at.y + cut.sizeY - 1 },
        arrive: { x: at.x + cut.arrive[0], y: at.y + cut.arrive[1] },
    };
});
const APMEKEN_ROOM = ROOMS[1];

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
    apmeken: {
        arrive: worldTile(APMEKEN_ROOM.arrive.x, APMEKEN_ROOM.arrive.y),
    },
};

function build(context: BuildContext): TileGrid {
    const ground = new Ground(SIZE_X, SIZE_Y);
    for (let y = 0; y <= SIZE_Y; y++) {
        for (let x = 0; x <= SIZE_X; x++) {
            ground.setHeight(x, y, FLOOR_HEIGHT);
        }
    }
    for (const room of ROOMS) {
        const { cut } = room;
        ground.stamp(
            cutPrefab(context.maps, cut.x, cut.y, cut.sizeX, cut.sizeY),
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
                ...(id === "apmeken" && { room: { arrive: TOA_PLACES.apmeken.arrive } }),
            })),
        },
    },
};
