import { FLOOR_SKINS } from "./floorSkins";
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

// The Wardens' slab, recoloured the Hallowed Sepulchre's cold blue-grey, with a deep blue light
// in it that's quieter than the gold, and a stiller tremor, so the blue floor stays calm
const SEPULCHRE_SLAB: FloorSkinDef = {
    ...FLOOR_SKINS.sepulchreSlab,
    cue: { color: 0x2a68d0, strength: 0.75, tremor: 0.35 },
};
// On the mosaic's bright tiles, a hotter light, stronger and wider, so a cue reads on them
const MOSAIC_CUE = { color: 0xff4a10, strength: 2.2, width: 2.2 };
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
        skins: [SEPULCHRE_SLAB, { ...FLOOR_SKINS.rune, light: 0x9fdcff, under: 0 }],
        tiles: [{ where: glyphs, skin: 1, type: "safe" }],
        glow: 0x3f86e0,
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

// Islands of 2 by 2 slabs: a ring round a middle island, joined by narrow bridges of grey slabs
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
        skins: [FLOOR_SKINS.wardensSlab, FLOOR_SKINS.greySlab],
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
            { ...FLOOR_SKINS.stoneTile, cue: MOSAIC_CUE },
            { ...FLOOR_SKINS.pressurePlate, cue: MOSAIC_CUE },
            { ...FLOOR_SKINS.glyphPlate, cue: MOSAIC_CUE },
            { ...FLOOR_SKINS.wardensSlab, tint: 0x9a9a9a },
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
            FLOOR_SKINS.wardensSlab,
            { ...FLOOR_SKINS.sandstoneSlab, rise: "code" },
            FLOOR_SKINS.greySlab,
            { ...FLOOR_SKINS.glyphPlate, light: 0xffd890 },
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

// A hall of stone: grey slabs with bands of red brick paving across it, a dark tiled border that
// never falls, and pillars standing in it that nobody can walk through: four stone columns, and
// the Tombs' great pillar in the middle. (The paving's twice a slab's triangles, so it's the
// bands, not the floor.)
export function createStoneHall(rect: Rect): FloorDef {
    const columns: FloorShapeDef = {
        kind: "union",
        of: [at(5, 6), at(17, 6), at(5, 18), at(17, 18)],
    };
    return {
        ...createWardensFloor(rect),
        skins: [
            FLOOR_SKINS.greySlab,
            FLOOR_SKINS.brickPaving,
            FLOOR_SKINS.darkTile,
            // Standing on the slabs
            { ...FLOOR_SKINS.stonePillar, under: 0 },
            { ...FLOOR_SKINS.tombsPillar, under: 0 },
        ],
        tiles: [
            { where: { kind: "stripes", axis: "y", every: 6, width: 1, offset: 3 }, skin: 1 },
            { where: { kind: "border" }, skin: 2, type: "reinforced" },
            { where: columns, skin: 3, type: "pillar" },
            {
                where: { kind: "rect", x0: 10, y0: 11, x1: 11, y1: 12 },
                skin: 4,
                type: "pillar",
                slab: [2, 2],
            },
        ],
        script: [
            beat(3, side("east", 0.14), "The hall rumbles..."),
            beat(9, side("west", 0.14)),
            beat(15, ripple("middle", "cross", 0.14, 12)),
            beat(21, bold(side("both", 0.12))),
            beat(27, sweep(0.12, 3)),
            beat(33, holes(4)),
            beat(35, dropRows(2)),
            beat(39, ripple("player", "diagonal", 0.12, 9)),
            beat(45, { kind: "restore", rowSeconds: 0.08 }),
        ],
        loopSeconds: 49,
    };
}
