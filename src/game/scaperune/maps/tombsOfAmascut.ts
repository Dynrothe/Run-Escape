import { APMEKEN_BARRIER_LOC } from "../../content/tombs";
import {
    WARDENS_CRATER_WARDEN,
    createWardensFloor,
    wardensCrater,
} from "../../content/wardensFloor";
import { Ground } from "../Ground";
import { blockTile, findReachable, getCollisionFlags } from "../collision";
import { MAP_SQUARE_SIZE, TILE_BLOCKED, TileGrid } from "../format";
import { LOC_FLOOR_DECORATION } from "../mapBuild";
import { bringDown, cutPrefab, rotatePrefab } from "../prefab";
import { BuildContext, MapRecipe } from "../recipe";
import { digFloorPit } from "./wardensFloor";

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

// The Nexus, in square 55,80: a path door at each corner (locs 46155 to 46167), the way in by the
// corridor on the north and the Wardens' doorway (Entry, 46167) on the south. Turned half round, so
// you come in at the bottom of the screen as in OSRS, with Crondis's door on your right and
// Apmeken's across from it: a tile (x, y) of the cut lies at (31 - x, 35 - y). The doors' south-west
// tiles below are the cut's own (scripts/cache/dump-square.ts 55,80), with their sizes.
const NEXUS: RoomCut = {
    x: 3536,
    y: 5130,
    sizeX: 32,
    sizeY: 36,
    plane: 0,
    cell: [0, 0],
    // The north corridor's end, turned
    arrive: [16, 5],
    turns: 2,
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

// The Het room, in square 57,82: Apmeken's room's twin, the entry on the west (local 11,30) and the
// exit on the east (51,30), each behind a barrier (45135 at x 21 and 43, y 31 to 33). Turned three
// quarters clockwise, so it's walked up the screen as the rest of the raid is: in from the south
// behind the entry's barrier (the sim's line), out at the north. In the cut's own tiles a tile
// (x, y) lies at (27 - y, x) once turned.
const HET: RoomCut = {
    x: 3662,
    y: 5267,
    sizeX: 37,
    sizeY: 28,
    plane: 0,
    cell: [3, 0],
    arrive: [14, 4],
    turns: 3,
};
// Its entry barrier, in the cut's own tiles (local x 21 in square 57,82)
const HET_GATE = { x: 7, y: [12, 13, 14] };
// Its puzzle, in tiles from the turned cut's corner (OSRS places these as the room starts, so
// they're not in the map). The room's a round floor about 21 across, its middle a 3 by 3 mound
// where Het's Seal stands. The Caster statue (45486) stands in the east alcove and fires west;
// the Shielded statue (45485) in the west one, the beam's target (each a 3 by 3, its south-west
// tile here, turned to face the other). Straight across, the seal's in the way: mirrors take it
// round.
const HET_CASTER = [22, 17];
const HET_TARGET = [4, 17];
const HET_STATUE_ROTATION = { caster: 1, target: 3 };
const HET_SEAL = [14.5, 18.5];
// Where mirrors can go and Orbs of Darkness cross, and where its enemies come in
const HET_FLOOR = { x0: 5, y0: 9, x1: 23, y1: 27 };
const HET_ENTRANCES = [
    [14, 26],
    [20, 24],
    [8, 24],
    [20, 12],
    [8, 12],
];
const HET_SOURCE_LOC = 45486;
const HET_TARGET_LOC = 45485;

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
// (row 33 and up is her throne's, solid: the floor's top row is 32)
const BA_BA_ALTAR = [12, 31];
const BA_BA_FOOT = [7, 14];
// Her sarcophagi (45752, in square 59,84 at 27/32/37/42 by 24 and 40), turned: four down each
// side of the floor, the west ones at rotation 0 and the east ones at 2 once turned
const BA_BA_SARCOPHAGI = [17, 22, 27, 32].flatMap((y) => [
    { x: 4, y, rotation: 0 },
    { x: 20, y, rotation: 2 },
]);
const BA_BA_PIT = { x0: 10, x1: 15, y0: 9, y1: FIGHT_LINE + 1.9 };

// Akkha's arena, in square 57,84 on plane 1 (brought down, as only one plane is drawn): the
// entrance room on the west (local 17 to 19, y 30 to 33) behind its barrier (45335 at x 19), a gap
// with no floor (x 20 to 22) the game takes you over, and the octagon of floor (x 23 to 42, y 22
// to 41), the teleport crystal's room past it on the east. Turned three quarters clockwise, as
// Ba-Ba's, so you walk in from the south: a tile (x, y) of the cut lies at (25 - y, x).
const AKKHA_ARENA: RoomCut = {
    x: 3661,
    y: 5395,
    sizeX: 40,
    sizeY: 26,
    plane: 1,
    cell: [4, 0],
    arrive: [12, 5],
    turns: 3,
};
// The entrance's barrier and the invisible wall across the gap (the cut's own tiles), and the
// gap's tiles, given a floor: the sim holds the line instead
const AKKHA_BARRIER = 45335;
// His floor's pieces, on the plane under it: the platform (45872 on) and its outer ring
const AKKHA_FLOOR = [45872, 46037];
const AKKHA_GAP = [7, 8, 9].flatMap((x) => [11, 12, 13, 14].map((y) => [x, y]));
// (turned) The floor's middle and half its width, and the line past which (north) the fight's on
const AKKHA_MIDDLE = [13, 20];
const AKKHA_HALF = 10;
const AKKHA_LINE = 10;

// The Scabaras room, square 55,82 whole: the entry on the east (45337, local 62,31), the exit on
// the west (45128, 1,30). Two long halls, north and south, of three rooms each, joined at both ends
// and parted by walls and a chasm. Turned a quarter clockwise, so it's walked up the screen as
// the rest of the raid is: in from the south, out to Kephri at the north, the halls east and west.
// The constants below are in the cut's own tiles (y from 5268), unturned (scabarasTile turns them):
// the party's put in the entry's nook, behind a barrier at x 59 the sim holds.
const SCABARAS: RoomCut = {
    x: 3520,
    y: 5268,
    sizeX: 64,
    sizeY: 24,
    plane: 0,
    cell: [5, 0],
    // (turned) The entry's nook: the cut's 60,12
    arrive: [12, 3],
    turns: 1,
};
const SCABARAS_GATE = { x: 59, y: [10, 11, 12, 13] };
// The slates by the way in, on the walls either side, that say what each of Addition's symbols
// is worth (OSRS has them on the north and south walls by the entrance): stand by one to read it
const SCABARAS_SLATES = [
    [56, 15],
    [56, 8],
];
// Its boards (OSRS spawns its plates as the room starts, so they're not in the map), every other
// tile so a plate's stepped on by itself: Sequence in the east room of the north hall, Lights out
// in the east room of the south, Addition in the middle room of the north, and Matching's two
// boards either side of the west room's chasm, the last
const SCABARAS_SEQUENCE = [48, 50, 52, 54].flatMap((x) => [16, 18, 20].map((y) => [x, y]));
// Round the ring, from its south-west corner
const SCABARAS_LIGHTS = [
    [49, 4],
    [51, 4],
    [53, 4],
    [53, 6],
    [53, 8],
    [51, 8],
    [49, 8],
    [49, 6],
];
// On its room's patterned floor (x 36 to 42), every other tile
const SCABARAS_ADDITION = [36, 38, 40, 42].flatMap((x) => [16, 18, 20].map((y) => [x, y]));
const SCABARAS_MATCHING = {
    north: [5, 7, 9].flatMap((x) => [16, 18, 20].map((y) => [x, y])),
    south: [5, 7, 9].flatMap((x) => [4, 6, 8].map((y) => [x, y])),
};
// The barriers into Matching's room, across the doorways at x 12 (the cut's own tiles)
const SCABARAS_MATCHING_BARRIER = { x: 12, ids: [45135, 45375, 45376, 45377, 45378, 45379] };
// Every board's tiles, whose floor decoration (the room's patterned tiles) the plates replace
const SCABARAS_BOARD = new Set(
    [
        ...SCABARAS_SEQUENCE,
        ...SCABARAS_LIGHTS,
        ...SCABARAS_ADDITION,
        ...SCABARAS_MATCHING.north,
        ...SCABARAS_MATCHING.south,
    ].map(([x, y]) => x + "," + y),
);
// Where its scarabs come in: by the passages in the walls (45343, at 28,29 and 28,35) and the
// halls' far rooms
const SCABARAS_ENTRANCES = [
    [28, 8],
    [28, 16],
    [13, 18],
    [13, 6],
    [41, 6],
    [21, 18],
];

// Kephri's arena, in square 55,84: a floor 16 by 17 (local 24 to 39, 24 to 40), her end the west,
// the way in the east behind its barrier (45335, local 40), and past a chasm on the west the
// teleport crystal's room, which the cut leaves out. Turned a quarter clockwise, so you walk in
// from the south and she's at the north: a tile (x, y) of the cut lies at (y, 22 - x).
const KEPHRI_ARENA: RoomCut = {
    x: 3540,
    y: 5398,
    sizeX: 23,
    sizeY: 21,
    plane: 0,
    cell: [0, 1],
    arrive: [10, 4],
    turns: 1,
};
// (turned) Where she sits (in the middle, on the dais: its pieces 45164 to 45181 round local 31,32
// of square 55,84), the line past which (north) she rises, and her swarms' way in round the
// floor's edge, clockwise from the north-west
const KEPHRI_AT = [10.5, 11.5];
const KEPHRI_LINE = 6;
const KEPHRI_SWARMS = [
    [2, 14],
    [18, 14],
    [18, 6],
    [15, 3],
    [5, 3],
    [2, 6],
];

// The Crondis room, square 61,82 from local x 10 to 55: the palm's room in the middle, a corridor
// north and south from each side of it to a waterfall (45398) at its end, and the way in on the
// west (45397, local 12,31) behind a barrier (45135, x 18). Turned half round, as Het's room, so it's
// entered from the east: a tile (x, y) of the cut lies at (45 - x, 63 - y). The waterfalls come
// out of the map to be drawn by the client, running or dry.
const CRONDIS: RoomCut = {
    x: 3914,
    y: 5248,
    sizeX: 46,
    sizeY: 64,
    plane: 0,
    cell: [1, 1],
    arrive: [40, 32],
    turns: 2,
};
const CRONDIS_GATE = { x: 8, y: [31, 32, 33] };
const CRONDIS_WATERFALL = 45398;
// (turned) The palm's middle, each waterfall's middle and rotation and where you fill up before
// it, and each corridor (its floor, its statues' columns, its waterfall, which end that's at)
const CRONDIS_PALM = [23, 31];
const CRONDIS_FALLS = [
    { at: [30.5, 3.5], rotation: 0, fill: [30, 7] },
    { at: [16.5, 3.5], rotation: 0, fill: [16, 7] },
    { at: [30.5, 59.5], rotation: 2, fill: [30, 56] },
    { at: [16.5, 59.5], rotation: 2, fill: [16, 56] },
];
const CRONDIS_LANES = [
    { x0: 28, x1: 33, y0: 9, y1: 18, low: 27, high: 34, fall: 0, fromLow: true },
    { x0: 14, x1: 19, y0: 9, y1: 18, low: 13, high: 20, fall: 1, fromLow: true },
    { x0: 28, x1: 33, y0: 44, y1: 53, low: 27, high: 34, fall: 2, fromLow: false },
    { x0: 14, x1: 19, y0: 44, y1: 53, low: 13, high: 20, fall: 3, fromLow: false },
];
// Where its crocodiles come in: the palm room's corners
const CRONDIS_ENTRANCES = [
    [32, 39],
    [33, 23],
    [14, 39],
    [13, 23],
];

// Zebak's arena, in square 61,84: a sandstone island (a deck on the plane above, local x 19 to
// 40, y 22 to 42) in the water he lies in on the west, Rock steps (45509) up to it from the water
// north and south, and the teleport crystal's room on the east. Turned a quarter clockwise, as
// Kephri's, so he's at the north and you come up from the south: a tile (x, y) of the cut lies at
// (y, 59 - x).
const ZEBAK_ARENA: RoomCut = {
    x: 3904,
    y: 5384,
    sizeX: 60,
    sizeY: 49,
    plane: 0,
    cell: [2, 1],
    arrive: [24, 13],
    turns: 1,
};
// (turned) Where he lies (in the water at the island's north edge, near enough that a bronze
// scimitar reaches him from it), the line past which (north) he rises, the island's floor, and the
// two Rock steps' tops, where his blood clouds come in
const ZEBAK_AT = [24, 43];
const ZEBAK_LINE = 15;
const ZEBAK_ISLAND = { x0: 14, y0: 19, x1: 34, y1: 40 };
// (unturned) The island's east edge, towards the way in: its two blocked columns, and the
// invisible walls (38848, 2639) along it
const ZEBAK_EDGE = { x0: 39, y0: 15, x1: 40, y1: 33 };
const ZEBAK_EDGE_WALLS = [38848, 2639];
const ZEBAK_STEPS = [
    [13, 30],
    [35, 30],
];

// The Wardens' room, square 59,80 on plane 1 (brought down): a floor 23 by 25 (world 3797 to
// 3819, 5142 to 5166) with the obelisk on its plinth in the middle (3807 to 3809, 5153 to 5155) and
// a Warden in a sealed alcove either side, Elidinis' on the west (3792 to 3796, 5152 to 5156) and
// Tumeken's on the east (3820 to 3824), each on its charging circle (45605). Turned half round, so
// you come in from the south (OSRS's party comes in from the north): a tile (x, y) of the cut lies
// at (41 - x, 27 - y), and Elidinis' Warden is on the east.
const WARDENS: RoomCut = {
    x: 3788,
    y: 5140,
    sizeX: 42,
    sizeY: 28,
    plane: 1,
    cell: [3, 1],
    arrive: [21, 3],
    turns: 2,
};
// (turned) The obelisk's middle; each Warden's middle; each side's orb spawn tile (next to the
// obelisk) and gap tile (the first a soaked orb can be taken on), and the column the troughs
// end at, by the Warden; the three troughs' rows (the middle, and two tiles either side); the floor
const WARDENS_OBELISK = [21.5, 13.5];
const WARDENS_ELIDINIS = [35.5, 13.5];
const WARDENS_TUMEKEN = [7.5, 13.5];
const WARDENS_SIDES = {
    elidinis: { spawn: [24, 13], gap: [23, 13], end: 32 },
    tumeken: { spawn: [18, 13], gap: [19, 13], end: 10 },
};
const WARDENS_TROUGHS = [11, 13, 15];
const WARDENS_FLOOR = { x0: 10, y0: 1, x1: 32, y1: 25 };
// The charging circles under the Wardens (45605, filled through 45606 to 45626), which the game
// draws as they fill: out of the map
const WARDENS_CHARGING = 45605;
// Its floor, as OSRS draws it: the room's own tiles are mostly the hidden overlay, drawing nothing,
// and what shows is the plane under it, its floor and the pieces on it (the slabs, the troughs,
// the ring round the obelisk, the yellow edging). That plane's level with the room's floor; the
// border round it stands 13 height units higher, the pieces under that rising to it. So the room
// keeps its own heights, and the plane under it comes up: its floor where the room's draws
// nothing, its pieces where nothing covers them (the floor) and its tall ones under the border,
// sunk by the border's height (LocOverrides). They're walked over: the room's tiles say what's
// walkable.
// The room's hidden overlays (map file ids), and the plane under it's that show
const WARDENS_HIDDEN_OVERLAYS = [65, 73, 124, 138];
const WARDENS_SHOWN_UNDER = [11, 194];
// The plane under it's pieces that stand up to the border, under it
export const WARDENS_TALL_PIECES = [45590, 45591, 45592, 45599, 45601, 45603];

// The Wardens' last phase: OSRS's own room for it, square 61,80, where the screen goes black
// after the second phase and the party's brought. Its plates (level 0, 45650 to 45710) are a floor
// 29 by 31 round a crater, the Warden on its platform in the middle (where the obelisk is in the
// first room: the viewer's spawn list has it at 3934,5152) and the crater torn open behind it.
// Level 1 is the dark round it, drawn only where the floor is: brought down, unturned (the crater's
// north, as the camera looks), with the game drawing the floor's tiles as slabs that rise and fall
// (MapDef.floor, as maps/wardensFloor.ts has it), a bridge over a pit. The plates' rim and the
// pillars at the south come too, and the platform, on the bridge.
const WARDENS_LAST: RoomCut = {
    x: 3914,
    y: 5128,
    sizeX: 45,
    sizeY: 49,
    plane: 1,
    cell: [4, 1],
    // In front of the Warden, eleven rows south of it
    arrive: [22, 15],
};
// (its own tiles) The floor the game moves (the plates' rectangle), and where the Warden stands
const WARDENS_LAST_FLOOR = { x0: 8, y0: 11, x1: 36, y1: 41 };
const WARDENS_LAST_AT = [
    WARDENS_LAST_FLOOR.x0 + WARDENS_CRATER_WARDEN.x,
    WARDENS_LAST_FLOOR.y0 + WARDENS_CRATER_WARDEN.y,
];
// Level 0's pieces: the plates and the rubble on the rows in front of the Warden (45643 to 45710:
// the game draws the floor) stay out; the rest come along: the rim, the south's broken edge, the
// Warden's platform (45718 to 45720, which stands on the bridge)
const WARDENS_LAST_PLATES = [45643, 45710];
const WARDENS_LAST_PLATFORM = [45718, 45719, 45720];
// The floor's height in its cell, a bridge over a pit nine tiles down
const WARDENS_LAST_HEIGHT = 200;
const WARDENS_LAST_PIT = 56;

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
const ROOMS = [
    NEXUS,
    APMEKEN,
    BA_BA_ARENA,
    HET,
    AKKHA_ARENA,
    SCABARAS,
    KEPHRI_ARENA,
    CRONDIS,
    ZEBAK_ARENA,
    WARDENS,
    WARDENS_LAST,
].map((cut) => {
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
const HET_ROOM = ROOMS[3];
const AKKHA_ROOM = ROOMS[4];
const SCABARAS_ROOM = ROOMS[5];
const KEPHRI_ROOM = ROOMS[6];
const CRONDIS_ROOM = ROOMS[7];
const ZEBAK_ROOM = ROOMS[8];
const WARDENS_ROOM = ROOMS[9];
const WARDENS_LAST_ROOM = ROOMS[10];

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
                // Its middle, turned half round with the room
                {
                    x: MAP_X * MAP_SQUARE_SIZE + NEXUS_AT.x + NEXUS.sizeX - (x + sizeX / 2),
                    y: MAP_Y * MAP_SQUARE_SIZE + NEXUS_AT.y + NEXUS.sizeY - (y + sizeY / 2),
                },
            ]),
        ) as Record<ToaPathId, { x: number; y: number }>,
    },
    // Ba-Ba's arena: where the party comes in, where she rises, and the line past which she does
    het: {
        arrive: worldTile(HET_ROOM.arrive.x, HET_ROOM.arrive.y),
        // Across the way in, turned: a line at the barrier tiles' north edge
        gate: {
            y: worldTile(HET_ROOM.at.x, HET_ROOM.at.y + HET_GATE.x).y + 0.5,
            locId: APMEKEN_BARRIER_LOC,
            tiles: HET_GATE.y.map((y) =>
                worldTile(HET_ROOM.at.x + 27 - y, HET_ROOM.at.y + HET_GATE.x),
            ),
        },
        entrances: HET_ENTRANCES.map(([x, y]) => worldTile(HET_ROOM.at.x + x, HET_ROOM.at.y + y)),
        puzzle: {
            // The beam leaves the caster's west side, heading west to the Shielded statue
            beam: worldTile(HET_ROOM.at.x + HET_CASTER[0] - 1, HET_ROOM.at.y + HET_CASTER[1] + 1),
            target: {
                x0: MAP_X * MAP_SQUARE_SIZE + HET_ROOM.at.x + HET_TARGET[0],
                y0: MAP_Y * MAP_SQUARE_SIZE + HET_ROOM.at.y + HET_TARGET[1],
                x1: MAP_X * MAP_SQUARE_SIZE + HET_ROOM.at.x + HET_TARGET[0] + 3,
                y1: MAP_Y * MAP_SQUARE_SIZE + HET_ROOM.at.y + HET_TARGET[1] + 3,
            },
            seal: {
                x: MAP_X * MAP_SQUARE_SIZE + HET_ROOM.at.x + HET_SEAL[0],
                y: MAP_Y * MAP_SQUARE_SIZE + HET_ROOM.at.y + HET_SEAL[1],
            },
            floor: {
                x0: MAP_X * MAP_SQUARE_SIZE + HET_ROOM.at.x + HET_FLOOR.x0,
                y0: MAP_Y * MAP_SQUARE_SIZE + HET_ROOM.at.y + HET_FLOOR.y0,
                x1: MAP_X * MAP_SQUARE_SIZE + HET_ROOM.at.x + HET_FLOOR.x1,
                y1: MAP_Y * MAP_SQUARE_SIZE + HET_ROOM.at.y + HET_FLOOR.y1,
            },
        },
    },
    // The Wardens: their room (the first two phases), and the same room again for the last, with
    // its floor
    wardens: {
        arrive: worldTile(WARDENS_ROOM.arrive.x, WARDENS_ROOM.arrive.y),
        obelisk: wardensPoint(WARDENS_OBELISK[0], WARDENS_OBELISK[1]),
        elidinis: wardensPoint(WARDENS_ELIDINIS[0], WARDENS_ELIDINIS[1]),
        tumeken: wardensPoint(WARDENS_TUMEKEN[0], WARDENS_TUMEKEN[1]),
        sides: {
            elidinis: wardensSide(WARDENS_SIDES.elidinis),
            tumeken: wardensSide(WARDENS_SIDES.tumeken),
        },
        troughs: WARDENS_TROUGHS.map((y) => MAP_Y * MAP_SQUARE_SIZE + WARDENS_ROOM.at.y + y + 0.5),
        floor: worldRect(WARDENS_ROOM.at, WARDENS_FLOOR),
        last: {
            arrive: worldTile(WARDENS_LAST_ROOM.arrive.x, WARDENS_LAST_ROOM.arrive.y),
            at: {
                x: MAP_X * MAP_SQUARE_SIZE + WARDENS_LAST_ROOM.at.x + WARDENS_LAST_AT[0],
                y: MAP_Y * MAP_SQUARE_SIZE + WARDENS_LAST_ROOM.at.y + WARDENS_LAST_AT[1],
            },
            floor: worldRect(WARDENS_LAST_ROOM.at, WARDENS_LAST_FLOOR),
        },
    },
    zebak: {
        arrive: worldTile(ZEBAK_ROOM.arrive.x, ZEBAK_ROOM.arrive.y),
        at: {
            x: MAP_X * MAP_SQUARE_SIZE + ZEBAK_ROOM.at.x + ZEBAK_AT[0],
            y: MAP_Y * MAP_SQUARE_SIZE + ZEBAK_ROOM.at.y + ZEBAK_AT[1],
        },
        line: { y: MAP_Y * MAP_SQUARE_SIZE + ZEBAK_ROOM.at.y + ZEBAK_LINE },
        island: {
            x0: MAP_X * MAP_SQUARE_SIZE + ZEBAK_ROOM.at.x + ZEBAK_ISLAND.x0,
            y0: MAP_Y * MAP_SQUARE_SIZE + ZEBAK_ROOM.at.y + ZEBAK_ISLAND.y0,
            x1: MAP_X * MAP_SQUARE_SIZE + ZEBAK_ROOM.at.x + ZEBAK_ISLAND.x1,
            y1: MAP_Y * MAP_SQUARE_SIZE + ZEBAK_ROOM.at.y + ZEBAK_ISLAND.y1,
        },
        steps: ZEBAK_STEPS.map(([x, y]) => worldTile(ZEBAK_ROOM.at.x + x, ZEBAK_ROOM.at.y + y)),
    },
    crondis: {
        arrive: worldTile(CRONDIS_ROOM.arrive.x, CRONDIS_ROOM.arrive.y),
        gate: {
            x: MAP_X * MAP_SQUARE_SIZE + CRONDIS_ROOM.at.x + (45 - CRONDIS_GATE.x),
            locId: APMEKEN_BARRIER_LOC,
            tiles: CRONDIS_GATE.y.map((y) =>
                worldTile(CRONDIS_ROOM.at.x + 45 - CRONDIS_GATE.x, CRONDIS_ROOM.at.y + 63 - y),
            ),
        },
        entrances: CRONDIS_ENTRANCES.map(([x, y]) =>
            worldTile(CRONDIS_ROOM.at.x + x, CRONDIS_ROOM.at.y + y),
        ),
        puzzle: {
            palm: crondisPoint(CRONDIS_PALM[0], CRONDIS_PALM[1]),
            falls: CRONDIS_FALLS.map(({ at, rotation, fill }) => ({
                at: crondisPoint(at[0], at[1]),
                rotation,
                fill: worldTile(CRONDIS_ROOM.at.x + fill[0], CRONDIS_ROOM.at.y + fill[1]),
            })),
            lanes: CRONDIS_LANES.map((lane) => ({
                ...lane,
                x0: MAP_X * MAP_SQUARE_SIZE + CRONDIS_ROOM.at.x + lane.x0,
                x1: MAP_X * MAP_SQUARE_SIZE + CRONDIS_ROOM.at.x + lane.x1,
                y0: MAP_Y * MAP_SQUARE_SIZE + CRONDIS_ROOM.at.y + lane.y0,
                y1: MAP_Y * MAP_SQUARE_SIZE + CRONDIS_ROOM.at.y + lane.y1,
                low: MAP_X * MAP_SQUARE_SIZE + CRONDIS_ROOM.at.x + lane.low,
                high: MAP_X * MAP_SQUARE_SIZE + CRONDIS_ROOM.at.x + lane.high,
            })),
        },
    },
    kephri: {
        arrive: worldTile(KEPHRI_ROOM.arrive.x, KEPHRI_ROOM.arrive.y),
        at: {
            x: MAP_X * MAP_SQUARE_SIZE + KEPHRI_ROOM.at.x + KEPHRI_AT[0],
            y: MAP_Y * MAP_SQUARE_SIZE + KEPHRI_ROOM.at.y + KEPHRI_AT[1],
        },
        line: { y: MAP_Y * MAP_SQUARE_SIZE + KEPHRI_ROOM.at.y + KEPHRI_LINE },
        swarms: KEPHRI_SWARMS.map(([x, y]) =>
            worldTile(KEPHRI_ROOM.at.x + x, KEPHRI_ROOM.at.y + y),
        ),
    },
    scabaras: {
        arrive: worldTile(SCABARAS_ROOM.arrive.x, SCABARAS_ROOM.arrive.y),
        // Across the way in, turned: a line at the barrier tiles' north edge
        gate: {
            y: scabarasTile(SCABARAS_GATE.x, SCABARAS_GATE.y[0]).y + 0.5,
            locId: APMEKEN_BARRIER_LOC,
            tiles: SCABARAS_GATE.y.map((y) => scabarasTile(SCABARAS_GATE.x, y)),
        },
        entrances: SCABARAS_ENTRANCES.map(([x, y]) => scabarasTile(x, y)),
        puzzle: {
            sequence: SCABARAS_SEQUENCE.map(([x, y]) => scabarasTile(x, y)),
            lights: SCABARAS_LIGHTS.map(([x, y]) => scabarasTile(x, y)),
            addition: SCABARAS_ADDITION.map(([x, y]) => scabarasTile(x, y)),
            matching: {
                north: SCABARAS_MATCHING.north.map(([x, y]) => scabarasTile(x, y)),
                south: SCABARAS_MATCHING.south.map(([x, y]) => scabarasTile(x, y)),
            },
            slates: SCABARAS_SLATES.map(([x, y]) => scabarasTile(x, y)),
        },
    },
    // Akkha's arena: where the party comes in, where he rises (its middle), the line past which
    // he does, and the floor his four quadrants split
    akkha: {
        arrive: worldTile(AKKHA_ROOM.arrive.x, AKKHA_ROOM.arrive.y),
        at: {
            x: MAP_X * MAP_SQUARE_SIZE + AKKHA_ROOM.at.x + AKKHA_MIDDLE[0],
            y: MAP_Y * MAP_SQUARE_SIZE + AKKHA_ROOM.at.y + AKKHA_MIDDLE[1],
        },
        line: { y: MAP_Y * MAP_SQUARE_SIZE + AKKHA_ROOM.at.y + AKKHA_LINE },
        quadrants: {
            middle: {
                x: MAP_X * MAP_SQUARE_SIZE + AKKHA_ROOM.at.x + AKKHA_MIDDLE[0],
                y: MAP_Y * MAP_SQUARE_SIZE + AKKHA_ROOM.at.y + AKKHA_MIDDLE[1],
            },
            half: AKKHA_HALF,
        },
    },
    baba: {
        arrive: worldTile(BA_BA_ROOM.arrive.x, BA_BA_ROOM.arrive.y),
        at: worldTile(BA_BA_ROOM.at.x + BA_BA_AT[0], BA_BA_ROOM.at.y + BA_BA_AT[1]),
        line: { y: MAP_Y * MAP_SQUARE_SIZE + BA_BA_ROOM.at.y + FIGHT_LINE + 1 },
        boulders: {
            sarcophagi: BA_BA_SARCOPHAGI.map(({ x, y, rotation }) => ({
                ...worldTile(BA_BA_ROOM.at.x + x, BA_BA_ROOM.at.y + y),
                rotation,
            })),
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

type Point = { x: number; y: number };

// A point in the Wardens' room, turned, in world tiles
function wardensPoint(x: number, y: number): Point {
    return {
        x: MAP_X * MAP_SQUARE_SIZE + WARDENS_ROOM.at.x + x,
        y: MAP_Y * MAP_SQUARE_SIZE + WARDENS_ROOM.at.y + y,
    };
}

// A side of the Wardens' obelisk: its orb spawn tile's and gap tile's middles, and the x its
// troughs end at, in world tiles
function wardensSide(side: { spawn: number[]; gap: number[]; end: number }) {
    return {
        spawn: worldTile(WARDENS_ROOM.at.x + side.spawn[0], WARDENS_ROOM.at.y + side.spawn[1]),
        gap: worldTile(WARDENS_ROOM.at.x + side.gap[0], WARDENS_ROOM.at.y + side.gap[1]),
        end: MAP_X * MAP_SQUARE_SIZE + WARDENS_ROOM.at.x + side.end + 0.5,
    };
}

// A rectangle of a room's tiles, both ends in, in world tiles
function worldRect(at: Point, rect: { x0: number; y0: number; x1: number; y1: number }) {
    return {
        x0: MAP_X * MAP_SQUARE_SIZE + at.x + rect.x0,
        y0: MAP_Y * MAP_SQUARE_SIZE + at.y + rect.y0,
        x1: MAP_X * MAP_SQUARE_SIZE + at.x + rect.x1,
        y1: MAP_Y * MAP_SQUARE_SIZE + at.y + rect.y1,
    };
}

// A point in the Crondis room, turned, in world tiles
function crondisPoint(x: number, y: number): { x: number; y: number } {
    return {
        x: MAP_X * MAP_SQUARE_SIZE + CRONDIS_ROOM.at.x + x,
        y: MAP_Y * MAP_SQUARE_SIZE + CRONDIS_ROOM.at.y + y,
    };
}

// A tile's middle in the Scabaras room, in world tiles
// A tile of the Scabaras room, in the cut's own tiles, as it's turned (a quarter clockwise: x
// across 64 becomes y up, y becomes x), in world tiles
function scabarasTile(x: number, y: number): { x: number; y: number } {
    return worldTile(SCABARAS_ROOM.at.x + y, SCABARAS_ROOM.at.y + (SCABARAS.sizeX - 1 - x));
}

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
    // The Wardens' last room stands high, its floor a bridge over a pit
    const last = WARDENS_LAST_ROOM;
    const lastFloor = {
        x0: last.at.x + WARDENS_LAST_FLOOR.x0,
        y0: last.at.y + WARDENS_LAST_FLOOR.y0,
        x1: last.at.x + WARDENS_LAST_FLOOR.x1,
        y1: last.at.y + WARDENS_LAST_FLOOR.y1,
    };
    const inLastFloor = (x: number, y: number) =>
        x >= lastFloor.x0 && x <= lastFloor.x1 && y >= lastFloor.y0 && y <= lastFloor.y1;
    for (let y = last.rect.y0; y <= last.rect.y1 + 1; y++) {
        for (let x = last.rect.x0; x <= last.rect.x1 + 1; x++) {
            ground.setHeight(x, y, WARDENS_LAST_HEIGHT);
        }
    }
    for (const room of ROOMS) {
        const { cut } = room;
        // The Apmeken room's east barrier is the sim's (APMEKEN, above)
        const gateX = 59 * MAP_SQUARE_SIZE - APMEKEN.x + APMEKEN_GATE.x;
        const cutOut = cutPrefab(context.maps, cut.x, cut.y, cut.sizeX, cut.sizeY);
        // The Wardens' room shows the plane under it through its hidden floor
        if (cut === WARDENS) {
            const [under, room] = cutOut.levels;
            for (let i = 0; i < room.overlays.length; i++) {
                if (
                    WARDENS_HIDDEN_OVERLAYS.includes(room.overlays[i]) &&
                    WARDENS_SHOWN_UNDER.includes(under.overlays[i])
                ) {
                    room.overlays[i] = under.overlays[i];
                    room.shapes[i] = under.shapes[i];
                    room.rotations[i] = under.rotations[i];
                }
            }
        }
        const prefab = bringDown(cutOut, cut.plane);
        // The Wardens' room has its ceiling on the level over it, which drew over the floor once
        // it came down: only the room's own level stays
        if (cut === WARDENS || cut === WARDENS_LAST) {
            for (const level of prefab.levels.slice(1)) {
                level.underlays.fill(0);
                level.overlays.fill(0);
                level.flags.fill(0);
            }
            prefab.locs = prefab.locs.filter((loc) => loc.level === 0);
        }
        // Akkha's floor is stone pieces on the plane below, up to it: brought along, sunk to the
        // ground (LocOverrides)
        if (cut === AKKHA_ARENA) {
            prefab.locs.push(
                ...cutOut.locs.filter(
                    (loc) =>
                        loc.level === 0 && loc.id >= AKKHA_FLOOR[0] && loc.id <= AKKHA_FLOOR[1],
                ),
            );
        }
        // Left out, in the cut's own tiles, before it's turned
        prefab.locs = prefab.locs.filter(
            (loc) =>
                !(cut === SCABARAS && loc.type === 22 && SCABARAS_BOARD.has(loc.x + "," + loc.y)) &&
                // The barriers into Matching's room (45135, 45375 to 45379), which OSRS opens once
                // the other three are solved: here its tiles won't turn till then (the sim's), and
                // left in, they shut the room off for good
                !(
                    cut === SCABARAS &&
                    loc.x === SCABARAS_MATCHING_BARRIER.x &&
                    SCABARAS_MATCHING_BARRIER.ids.includes(loc.id)
                ),
        );
        prefab.locs = prefab.locs.filter(
            (loc) =>
                !(cut === APMEKEN && loc.id === APMEKEN_BARRIER && loc.x === gateX) &&
                !(cut === HET && loc.id === APMEKEN_BARRIER && loc.x === HET_GATE.x) &&
                !(cut === CRONDIS && loc.id === APMEKEN_BARRIER && loc.x === CRONDIS_GATE.x) &&
                !(cut === CRONDIS && loc.id === CRONDIS_WATERFALL) &&
                !(cut === WARDENS && loc.id === WARDENS_CHARGING) &&
                !(
                    cut === AKKHA_ARENA &&
                    (loc.id === AKKHA_BARRIER ||
                        (loc.id === 85 && loc.x >= 6 && loc.x <= 9 && loc.y >= 10 && loc.y <= 15))
                ) &&
                !(
                    cut === BA_BA_ARENA &&
                    (loc.id === BA_BA_BARRIER ||
                        BA_BA_BARRIER_EDGE.includes(loc.id) ||
                        // The invisible wall (85) sealing the arena's west side, across the
                        // passage only
                        (loc.id === 85 && loc.x === 12 && loc.y >= 11 && loc.y <= 13))
                ),
        );
        // The last room's pieces on level 0, but its plates and rubble (the game draws the floor)
        // and the platform (put on the bridge, below)
        if (cut === WARDENS_LAST) {
            prefab.locs.push(
                ...cutOut.locs.filter(
                    (loc) =>
                        loc.level === 0 &&
                        loc.type !== LOC_FLOOR_DECORATION &&
                        !(loc.id >= WARDENS_LAST_PLATES[0] && loc.id <= WARDENS_LAST_PLATES[1]) &&
                        !WARDENS_LAST_PLATFORM.includes(loc.id),
                ),
            );
        }
        // The Wardens' room's floor, from the plane under it: what's on the floor, and the tall
        // pieces under the raised border
        if (cut === WARDENS) {
            const room = cutOut.levels[1];
            const corners = cut.sizeX + 1;
            const raised = (x: number, y: number) =>
                Math.max(
                    room.heights[x + y * corners],
                    room.heights[x + 1 + y * corners],
                    room.heights[x + (y + 1) * corners],
                    room.heights[x + 1 + (y + 1) * corners],
                ) > 0;
            prefab.locs.push(
                ...cutOut.locs.filter(
                    (loc) =>
                        loc.level === 0 &&
                        (WARDENS_TALL_PIECES.includes(loc.id) || !raised(loc.x, loc.y)),
                ),
            );
        }
        // The island's edge on the way in: OSRS's deck stands a level up behind invisible walls,
        // and left so it's a piece of its own nobody can walk onto. Its walls on that side go and
        // its edge is floor
        if (cut === ZEBAK_ARENA) {
            prefab.locs = prefab.locs.filter(
                (loc) =>
                    !(
                        ZEBAK_EDGE_WALLS.includes(loc.id) &&
                        loc.x >= ZEBAK_EDGE.x0 - 3 &&
                        loc.x <= ZEBAK_EDGE.x1 &&
                        loc.y >= ZEBAK_EDGE.y0 - 2 &&
                        loc.y <= ZEBAK_EDGE.y1 + 2
                    ),
            );
            for (const level of prefab.levels) {
                for (let y = ZEBAK_EDGE.y0; y <= ZEBAK_EDGE.y1; y++) {
                    for (let x = ZEBAK_EDGE.x0; x <= ZEBAK_EDGE.x1; x++) {
                        level.flags[x + y * cut.sizeX] &= ~TILE_BLOCKED;
                    }
                }
            }
        }
        // The gap into Akkha's arena, which OSRS takes you over: floor, as his own
        if (cut === AKKHA_ARENA) {
            const floor = prefab.levels[0];
            const like = 23 - 13 + (31 - 19) * cut.sizeX;
            for (const [x, y] of AKKHA_GAP) {
                const i = x + y * cut.sizeX;
                floor.flags[i] &= ~TILE_BLOCKED;
                floor.underlays[i] = floor.underlays[like];
                floor.overlays[i] = floor.overlays[like];
                floor.shapes[i] = floor.shapes[like];
                floor.rotations[i] = floor.rotations[like];
            }
        }
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
                // The Wardens' room keeps its border's step up from the floor
                flatten: cut !== WARDENS,
                anchor: cut === WARDENS ? 0 : undefined,
                height: cut === WARDENS_LAST ? WARDENS_LAST_HEIGHT : FLOOR_HEIGHT,
            },
        );
        if (cut === WARDENS_LAST) {
            digFloorPit(
                ground,
                { x: lastFloor.x0, y: lastFloor.y0 },
                { x: lastFloor.x1, y: lastFloor.y1 },
                WARDENS_LAST_HEIGHT,
                WARDENS_LAST_PIT,
                inLastFloor,
            );
            // The Warden's platform, on the bridge (level 1 there) as the floor is
            for (const loc of cutOut.locs) {
                if (loc.level === 0 && WARDENS_LAST_PLATFORM.includes(loc.id)) {
                    ground.grid.locs.push({
                        ...loc,
                        level: 1,
                        x: room.at.x + loc.x,
                        y: room.at.y + loc.y,
                    });
                }
            }
        }
        // The Crondis room's waterfalls, out of the map to be drawn: still solid
        if (cut === CRONDIS) {
            for (const { at } of CRONDIS_FALLS) {
                for (let dy = -2; dy <= 2; dy++) {
                    for (let dx = -3; dx <= 3; dx++) {
                        const x = room.at.x + Math.floor(at[0]) + dx;
                        const y = room.at.y + Math.floor(at[1]) + dy;
                        blockTile(ground.grid, ground.tile(x, y));
                    }
                }
            }
        }
        // The Het room's statues, which OSRS places as the room starts
        if (cut === HET) {
            for (const [id, [x, y], rotation] of [
                [HET_SOURCE_LOC, HET_CASTER, HET_STATUE_ROTATION.caster],
                [HET_TARGET_LOC, HET_TARGET, HET_STATUE_ROTATION.target],
            ] as const) {
                ground.place(
                    { id, type: 10, rotation, level: 0, x: room.at.x + x, y: room.at.y + y },
                    3,
                    3,
                );
            }
        }
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
        // As a first map's: the raid level's scale (getRaidLevelScale) makes it what it is, from
        // Entry for a run that's bought nothing up past Expert
        difficulty: { hp: 1, damage: 1 },
        waves: [],
        events: [],
        finalBossWarning: "",
        victoryText: "",
        // A raid, not a fun map: not endless
        fun: undefined,
        // The Wardens' last room's floor, which moves as the fight says (Sim.stepWardens): no
        // script of its own
        floor: {
            ...createWardensFloor(TOA_PLACES.wardens.last.floor),
            holes: wardensCrater(
                TOA_PLACES.wardens.last.floor.x0,
                TOA_PLACES.wardens.last.floor.y0,
            ),
            script: [],
            loopSeconds: 1e7,
        },
        tombs: {
            nexus: TOA_PLACES.nexus.arrive,
            // The Nexus's north end, as OSRS's way to the Wardens is
            wardensDoor: worldTile(NEXUS_ARRIVE.x, NEXUS_ARRIVE.y + 22),
            // The Helpful Spirit, on the open floor west of the way up from the entrance
            spirit: worldTile(NEXUS_ARRIVE.x - 4, NEXUS_ARRIVE.y + 9),
            wardens: {
                arrive: TOA_PLACES.wardens.arrive,
                obelisk: TOA_PLACES.wardens.obelisk,
                elidinis: TOA_PLACES.wardens.elidinis,
                tumeken: TOA_PLACES.wardens.tumeken,
                sides: TOA_PLACES.wardens.sides,
                troughs: TOA_PLACES.wardens.troughs,
                floor: TOA_PLACES.wardens.floor,
                last: TOA_PLACES.wardens.last,
            },
            paths: (Object.keys(PATH_NAMES) as ToaPathId[]).map((id) => ({
                id,
                name: PATH_NAMES[id],
                door: TOA_PLACES.nexus.doors[id],
                ...(id === "het" && {
                    room: {
                        arrive: TOA_PLACES.het.arrive,
                        puzzle: "het" as const,
                        gate: TOA_PLACES.het.gate,
                        entrances: TOA_PLACES.het.entrances,
                        het: TOA_PLACES.het.puzzle,
                        boss: {
                            enemyId: "akkha",
                            arrive: TOA_PLACES.akkha.arrive,
                            at: TOA_PLACES.akkha.at,
                            line: TOA_PLACES.akkha.line,
                            quadrants: TOA_PLACES.akkha.quadrants,
                        },
                    },
                }),
                ...(id === "crondis" && {
                    room: {
                        arrive: TOA_PLACES.crondis.arrive,
                        puzzle: "crondis" as const,
                        gate: TOA_PLACES.crondis.gate,
                        entrances: TOA_PLACES.crondis.entrances,
                        crondis: TOA_PLACES.crondis.puzzle,
                        boss: {
                            enemyId: "zebak",
                            arrive: TOA_PLACES.zebak.arrive,
                            at: TOA_PLACES.zebak.at,
                            line: TOA_PLACES.zebak.line,
                            island: TOA_PLACES.zebak.island,
                            steps: TOA_PLACES.zebak.steps,
                        },
                    },
                }),
                ...(id === "scabaras" && {
                    room: {
                        arrive: TOA_PLACES.scabaras.arrive,
                        puzzle: "scabaras" as const,
                        gate: TOA_PLACES.scabaras.gate,
                        entrances: TOA_PLACES.scabaras.entrances,
                        scabaras: TOA_PLACES.scabaras.puzzle,
                        boss: {
                            enemyId: "kephri",
                            arrive: TOA_PLACES.kephri.arrive,
                            at: TOA_PLACES.kephri.at,
                            line: TOA_PLACES.kephri.line,
                            swarms: TOA_PLACES.kephri.swarms,
                        },
                    },
                }),
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
