import type { FloorDef, FloorShapeDef, FloorSkinDef } from "./types";
import {
    RISING_SLAB,
    beat,
    bold,
    createWardensFloor,
    dropRows,
    holes,
    ripple,
    side,
    sweep,
} from "./wardensFloor";

// Floors to show off what a floor can be (FloorDef: shape, ascii, skins, tiles), each on the
// Wardens' room's shell on a dev map of its own (scaperune/maps/wardensFloor.ts). They play as the
// Wardens' floor does, with their own shapes, looks and scripts. The box is 23 by 25 tiles, its
// middle tile 11, 12; north is the front.

type Rect = FloorDef["rect"];

// The Wardens' slab, recoloured the Hallowed Sepulchre's cold blue-grey
const SEPULCHRE_SLAB: FloorSkinDef = {
    spotAnim: RISING_SLAB,
    // Its top (the cache's dark red-brown) to a blue-grey, a shade lighter
    recolor: [
        [280, 37278],
        [274, 37272],
        [267, 37265],
    ],
};
// Glyphs: an inactive rune (a decal, 1 by 1), lying on a slab, lit as the Sepulchre's are
const RUNE_GLYPH = 56393;
// The Tombs' pressure plates, gold glyphs on stone, and a plain stone tile and floor tile (all
// opaque: many of the cache's 1 by 1 floor models are see-through overlays, or invisible)
const PRESSURE_PLATE = 45345;
const PRESSURE_PLATE_RUNED = 45349;
const STONE_TILE = 38822;
const GREY_FLOOR_TILE = 34874;

const at = (x: number, y: number): FloorShapeDef => ({ kind: "rect", x0: x, y0: y, x1: x, y1: y });

// A circle of the Sepulchre's blue slabs, with glyphs round it and in its middle that never rise:
// the safe spots, if you can get to one
export function createSepulchreCircle(rect: Rect): FloorDef {
    const glyphs: FloorShapeDef = {
        kind: "union",
        of: [
            at(11, 12),
            at(5, 12),
            at(17, 12),
            at(11, 6),
            at(11, 18),
            at(7, 8),
            at(15, 8),
            at(7, 16),
            at(15, 16),
        ],
    };
    return {
        ...createWardensFloor(rect),
        shape: { kind: "ellipse", rx: 11, ry: 11.5 },
        skins: [SEPULCHRE_SLAB, { loc: RUNE_GLYPH, light: 0x9fdcff, under: 0 }],
        tiles: [{ where: glyphs, skin: 1, type: "safe" }],
        glow: 0x7fc8ff,
        script: [
            beat(3, ripple("middle", "diagonal", 0.14, 12), "The glyphs hum..."),
            beat(9, side("east", 0.12)),
            beat(13, side("west", 0.12)),
            beat(18, ripple("middle", "cross", 0.12, 12)),
            beat(23, bold(side("both", 0.12))),
            beat(28, sweep(0.12, 3)),
            beat(33, holes(4)),
            beat(36, ripple("player", "diagonal", 0.1, 8)),
            beat(41, sweep(0.1, 2)),
            beat(46, { kind: "restore", rowSeconds: 0.08 }),
        ],
        loopSeconds: 50,
    };
}

// Islands of 2 by 2 slabs: a ring round a middle island, joined by narrow bridges of stone tiles
// that never fall
export function createSlabIslands(rect: Rect): FloorDef {
    const ring: FloorShapeDef = { kind: "ring", inner: 7.5, outer: 11.5 };
    const middle: FloorShapeDef = { kind: "ellipse", rx: 3.5, ry: 3.5 };
    // The middle's row and column, from the middle island to the ring
    const bridges: FloorShapeDef = {
        kind: "minus",
        from: { kind: "cross", width: 1 },
        cut: { kind: "ring", inner: 7.6, outer: 99 },
    };
    return {
        ...createWardensFloor(rect),
        shape: { kind: "union", of: [ring, middle, bridges] },
        skins: [{ spotAnim: RISING_SLAB }, { loc: GREY_FLOOR_TILE }],
        tiles: [
            { where: bridges, skin: 1, type: "reinforced" },
            {
                where: { kind: "minus", from: { kind: "union", of: [ring, middle] }, cut: bridges },
                slab: [2, 2],
            },
        ],
        drop: { ...createWardensFloor(rect).drop, keepRows: 8 },
        script: [
            beat(3, ripple("middle", "cross", 0.16, 12), "The slabs grind..."),
            beat(9, side("east", 0.14)),
            beat(14, side("west", 0.14)),
            beat(19, bold(ripple("player", "diagonal", 0.14, 10))),
            beat(25, sweep(0.12, 2)),
            beat(31, holes(3)),
            beat(33, dropRows(2)),
            beat(37, side("both", 0.12)),
            beat(43, { kind: "restore", rowSeconds: 0.08 }),
        ],
        loopSeconds: 48,
    };
}

// A mosaic: the Tombs' floor tiles and pressure plates in a checker, each turned as it lies, in
// a border of the Wardens' dark slabs that never fall
export function createMosaicFloor(rect: Rect): FloorDef {
    return {
        ...createWardensFloor(rect),
        seed: 5,
        skins: [
            { loc: STONE_TILE },
            { loc: PRESSURE_PLATE },
            { loc: PRESSURE_PLATE_RUNED },
            { spotAnim: RISING_SLAB, tint: 0x9a9a9a },
        ],
        tiles: [
            { skin: 0, turn: "random" },
            {
                where: { kind: "checker" },
                skin: [
                    { skin: 1, weight: 3 },
                    { skin: 2, weight: 1 },
                ],
                turn: "random",
            },
            { where: { kind: "border" }, skin: 3, type: "reinforced" },
        ],
        script: [
            beat(3, side("east", 0.14), "The mosaic shifts..."),
            beat(9, side("west", 0.14)),
            beat(15, bold(side("both", 0.12))),
            beat(21, ripple("player", "cross", 0.14, 9)),
            beat(27, sweep(0.12, 3)),
            beat(33, dropRows(3)),
            beat(35, holes(4)),
            beat(39, ripple("middle", "diagonal", 0.12, 12)),
            beat(45, { kind: "restore", rowSeconds: 0.08 }),
        ],
        loopSeconds: 49,
    };
}

// A hand-drawn floor (FloorDef.ascii): islands on narrow paths, cracked tiles (f) that fall
// faster and give way after two slams, pillars of solid stone (S) and glyphs (*) to stand on.
// The north row first, as it's seen.
const ASCII_MAP = [
    "....#####.....#####....",
    "...##*####...####*##...",
    "...#ffff##...##ffff#...",
    "...##S###.....###S##...",
    "....####.......####....",
    "......#.........#......",
    "......#.........#......",
    "......ff.......ff......",
    ".......#########.......",
    "......###########......",
    ".....####fffff####.....",
    ".....###f#####f###.....",
    ".....###f##*##f###.....",
    ".....###f#####f###.....",
    ".....####fffff####.....",
    "......###########......",
    ".......####S####.......",
    "...........#...........",
    "...........#...........",
    "........#######........",
    ".......##ff#ff##.......",
    ".......#S#####S#.......",
    ".......####*####.......",
    "........#######........",
    ".........#####.........",
];

export function createAsciiFloor(rect: Rect): FloorDef {
    const base = createWardensFloor(rect);
    return {
        ...base,
        ascii: ASCII_MAP,
        skins: [
            { spotAnim: RISING_SLAB },
            { spotAnim: RISING_SLAB, tint: 0xc8b8a8, rise: "code" },
            { spotAnim: RISING_SLAB, tint: 0x707070 },
            { loc: PRESSURE_PLATE_RUNED, light: 0xffd890 },
        ],
        tiles: [
            { where: { kind: "chars", chars: "f" }, skin: 1, type: "fragile" },
            { where: { kind: "chars", chars: "S" }, skin: 2, type: "solid" },
            { where: { kind: "chars", chars: "*" }, skin: 3, type: "safe" },
        ],
        drop: { ...base.drop, keepRows: 6 },
        script: [
            beat(3, side("east", 0.14), "The paths creak..."),
            beat(8, side("west", 0.14)),
            beat(13, ripple("middle", "cross", 0.14, 12)),
            beat(18, bold(sweep(0.12, 2))),
            beat(23, ripple("player", "diagonal", 0.12, 8)),
            beat(28, holes(4)),
            beat(31, side("both", 0.12)),
            beat(36, dropRows(3)),
            beat(42, { kind: "restore", rowSeconds: 0.08 }),
        ],
        loopSeconds: 46,
    };
}
