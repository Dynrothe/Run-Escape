import type { FloorBeatDef, FloorDef, FloorPatternDef } from "./types";

// A prototype of the Wardens' floor in the Tombs of Amascut's third phase, on a dev map
// (scaperune/maps/wardensFloor.ts), to get a feel for the floor before a fight and a theme are
// designed round it. There's no boss: the floor's the whole thing. Its front is north, where the
// Warden stands in the real fight.
//
// As there: slabs rise in waves away from the front, down one half (the east, then the west),
// then both but the middle three columns; and once it's angry the back rows are torn away, until
// only the rows in front of it are left. Added here to try: a full sweep with a wandering gap,
// ripples out from the player or the middle, and single tiles falling, all faster as it goes on.
// Every slab and every fall is warned by the tiles themselves: they shake before they rise, and
// shake and sag before they fall.

// The slab rising: 1 by 1 tile, up about half a tile and back in 0.36 s (seq 9697, 0.6 s with
// its rest). 2221 to 2223 are the same slab tipping other ways; FloorView turns this one instead.
export const RISING_SLAB = 2220;
// The slab tumbling (seq 9722, 1 s), for a tile that falls away
const FALLING_SLAB = 2228;
// toa_pos_p3_rocks_hit and toa_amp_rocks_fall_02 (the OSRS Wiki's sound ids)
const SLAB_SOUND = 6555;
const FALL_SOUND = 6572;
// Dust thrown up (the Sepulchre's, as Zachariah's slams have, and the Tombs' own blown dust), and
// a chip of the Wardens' rock (seq 9703, a tumble)
const SLAB_DUST = 2699;
const FALL_DUST = 2184;
const ROCK_CHIP = 2210;
// Under the floor, all the Tombs' own: the room's gold-banded pillar (2 by 2, 4.4 tiles tall), the
// wall of its upper level as beams, and the engraved wall the room's walled with, round the edge
const UNDER_PILLAR = 45582;
const UNDER_BEAM = 45085;
const UNDER_WALL = 45120;
// The Tombs' gold, as the light under the floor
const GLOW = 0xffb040;

// The crater in OSRS's last room (square 61,80, the plates 45650 to 45710 round it, the Warden's
// platform 45718 to 45720 in it): the Warden's
// platform in the floor's middle, where the obelisk stands in the first room, and the V torn open
// behind it. Row spans from the floor's south-west corner (the floor's 29 by 31); the Warden
// stands on the platform's middle, WARDENS_CRATER_WARDEN. The three rows of rubble in front of it
// are floor.
export const WARDENS_CRATER: { y: number; x0: number; x1: number }[] = [
    ...[13, 14, 15, 16, 17].map((y) => ({ y, x0: 11, x1: 17 })),
    { y: 18, x0: 10, x1: 18 },
    { y: 19, x0: 9, x1: 19 },
    { y: 20, x0: 8, x1: 20 },
    { y: 21, x0: 7, x1: 21 },
    { y: 22, x0: 6, x1: 22 },
    { y: 23, x0: 5, x1: 23 },
    ...[24, 25, 26].map((y) => ({ y, x0: 4, x1: 24 })),
];
export const WARDENS_CRATER_WARDEN = { x: 14.5, y: 15.5 };

// The crater's spans in world tiles, for a floor whose south-west corner is at (x0, y0)
export function wardensCrater(x0: number, y0: number): FloorDef["holes"] {
    return WARDENS_CRATER.map((row) => ({ y: y0 + row.y, x0: x0 + row.x0, x1: x0 + row.x1 }));
}

export const side = (side: "east" | "west" | "both", rowSeconds: number): FloorPatternDef => ({
    kind: "side",
    side,
    rowSeconds,
});
export const sweep = (rowSeconds: number, gap = 2): FloorPatternDef => ({
    kind: "sweep",
    rowSeconds,
    gap,
});
export const ripple = (
    at: "player" | "middle",
    spokes: "cross" | "diagonal",
    ringSeconds: number,
    radius: number,
): FloorPatternDef => ({ kind: "ripple", at, spokes, ringSeconds, radius });
// The both-halves slam is the signature one, shown bold from its start (FloorCue): the rest are
// subtle, the floor's own
export const bold = (pattern: FloorPatternDef): FloorPatternDef => ({ ...pattern, cue: "bold" });
export const dropRows = (rows: number): FloorPatternDef => ({
    kind: "dropRows",
    rows,
    rowSeconds: 0.4,
});
export const holes = (count: number): FloorPatternDef => ({ kind: "holes", count });

export const beat = (at: number, pattern: FloorPatternDef, message?: string): FloorBeatDef => ({
    at,
    pattern,
    message,
});

// About two and a half minutes, faster each part, then the floor's put back and it starts over.
// A slam takes its rows times rowSeconds to cross the floor (25 rows), plus the warning.
const SCRIPT: FloorBeatDef[] = [
    // One side at a time, slowly, as the Warden's first slams are: east, west, then both
    beat(3, side("east", 0.15), "The floor shudders..."),
    beat(9, side("west", 0.15)),
    beat(15, side("east", 0.15)),
    beat(21, side("west", 0.15)),
    beat(27, bold(side("both", 0.15))),
    beat(34, sweep(0.15, 3)),
    beat(41, dropRows(3), "The floor crumbles away behind you!"),
    // A little faster, and ripples
    beat(45, ripple("player", "cross", 0.16, 8)),
    beat(51, side("east", 0.12)),
    beat(55, side("west", 0.12)),
    beat(59, ripple("middle", "diagonal", 0.14, 12)),
    beat(65, bold(side("both", 0.12))),
    beat(70, sweep(0.12)),
    beat(75, dropRows(3)),
    beat(76, holes(3)),
    // Faster again, and things overlap
    beat(80, side("west", 0.1), "The floor quickens!"),
    beat(83.5, side("east", 0.1)),
    beat(87, ripple("player", "diagonal", 0.13, 8)),
    beat(91, bold(side("both", 0.1))),
    beat(94.5, sweep(0.1)),
    beat(99, holes(4)),
    beat(100, ripple("player", "cross", 0.12, 10)),
    beat(104, dropRows(4)),
    // As fast as it gets
    beat(108, side("east", 0.08), "The floor is breaking apart!"),
    beat(110.5, side("west", 0.08)),
    beat(113, bold(side("both", 0.08))),
    beat(116, ripple("player", "cross", 0.1, 10)),
    beat(119, sweep(0.08)),
    beat(122, holes(4)),
    beat(123, side("west", 0.08)),
    beat(125.5, side("east", 0.08)),
    beat(128, ripple("player", "diagonal", 0.1, 10)),
    beat(131, bold(side("both", 0.08))),
    beat(134, sweep(0.08)),
    beat(139, { kind: "restore", rowSeconds: 0.08 }, "The floor knits itself back together."),
];

// rect: the floor, in world tiles
export function createWardensFloor(rect: FloorDef["rect"]): FloorDef {
    return {
        rect,
        slam: {
            warn: 1,
            // The slab's over a quarter of a tile up from its second tick to its fifteenth
            hurt: [0.04, 0.28],
            damage: 0.2,
            grace: 0.6,
            spotAnim: RISING_SLAB,
            sound: SLAB_SOUND,
        },
        drop: {
            warn: 2.4,
            damage: 0.15,
            shove: 0.25,
            spotAnim: FALLING_SLAB,
            fall: 1,
            keepRows: 5,
            sound: FALL_SOUND,
        },
        effects: {
            dust: SLAB_DUST,
            fallDust: FALL_DUST,
            rock: ROCK_CHIP,
        },
        under: { pillar: UNDER_PILLAR, beam: UNDER_BEAM, wall: UNDER_WALL },
        glow: GLOW,
        cue: "subtle",
        shake: { slam: 0.1, drop: 0.25 },
        script: SCRIPT,
        loopSeconds: 144,
    };
}
