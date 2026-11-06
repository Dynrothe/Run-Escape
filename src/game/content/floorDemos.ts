import { FLOOR_MATERIALS, FLOOR_SKINS } from "./floorSkins";
import type { FloorBeatDef, FloorDef, FloorShapeDef, FloorSkinDef } from "./types";
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

// Fire and ice: tiles that do something to whoever's on them (FloorSkinDef.effect). Ice down the
// west side, where you slide; strips of lava in the east, which burn; patches of mud in the
// south and sand in the north, slow going; a lane of speed plates up the middle; and three green glyphs that heal and
// never rise. What falls rebuilds itself (FloorDef.rebuild), and each material has its own dust
// and sounds (FloorSkinDef.material).
export function createFireAndIce(rect: Rect): FloorDef {
    const base = createWardensFloor(rect);
    const glyphs: FloorShapeDef = { kind: "union", of: [at(3, 21), at(19, 3), at(11, 23)] };
    return {
        ...base,
        skins: [
            { ...FLOOR_SKINS.greySlab, material: FLOOR_MATERIALS.stone },
            FLOOR_SKINS.lava,
            FLOOR_SKINS.ice,
            FLOOR_SKINS.mud,
            FLOOR_SKINS.speedPlate,
            { ...FLOOR_SKINS.healGlyph, under: 0 },
            FLOOR_SKINS.sand,
        ],
        tiles: [
            { skin: 0 },
            { where: { kind: "rect", x0: 16, y0: 2, x1: 22, y1: 22 }, skin: 1 },
            // with ways across it
            { where: { kind: "stripes", axis: "y", every: 5, width: 3 }, skin: 0 },
            { where: { kind: "rect", x0: 0, y0: 0, x1: 5, y1: 24 }, skin: 2 },
            { where: { kind: "ellipse", rx: 3, ry: 2, cx: 11, cy: 4 }, skin: 3 },
            { where: { kind: "ellipse", rx: 2, ry: 1.5, cx: 8, cy: 20 }, skin: 6 },
            {
                where: {
                    kind: "minus",
                    from: { kind: "rect", x0: 11, y0: 8, x1: 11, y1: 20 },
                    cut: at(11, 12),
                },
                skin: 4,
            },
            { where: glyphs, skin: 5, type: "safe" },
        ],
        rebuild: { after: 6 },
        script: [
            beat(3, side("west", 0.14), "Fire and ice..."),
            beat(8, ripple("middle", "cross", 0.14, 12)),
            beat(13, holes(5)),
            beat(16, side("east", 0.14)),
            beat(21, sweep(0.12, 3)),
            beat(26, dropRows(2)),
            beat(29, bold(side("both", 0.12))),
            beat(34, ripple("player", "diagonal", 0.12, 8)),
        ],
        loopSeconds: 40,
    };
}

// Plates and phases: pressure plates that set things off (FloorDef.triggers), and a floor that
// changes as it goes (FloorDef.phases). The gold plate in the south springs a trap: the three rows
// past it rise. The one in the north-west drops a corner (it rebuilds). The blue glyph in the
// north-east arms the plate in the south-east, which brings a ripple down a second later. Every
// 30 s the border melts to lava for a while (a phase, its skins swapped), then cools. A ring of
// cracked bricks gives way after three slams, darker and more askew each time.
export function createPlatesAndPhases(rect: Rect): FloorDef {
    const base = createWardensFloor(rect);
    const border: FloorShapeDef = {
        kind: "minus",
        from: { kind: "rect", x0: 0, y0: 0, x1: 22, y1: 24 },
        cut: { kind: "rect", x0: 2, y0: 2, x1: 20, y1: 22 },
    };
    const calm: FloorBeatDef[] = [
        beat(3, side("east", 0.14), "The plates click..."),
        beat(8, side("west", 0.14)),
        beat(13, ripple("middle", "diagonal", 0.14, 12)),
        beat(18, sweep(0.12, 3)),
        beat(24, holes(3)),
        { at: 30, action: { kind: "phase", phase: "molten" } },
    ];
    return {
        ...base,
        skins: [
            { ...FLOOR_SKINS.sandstoneSlab, material: FLOOR_MATERIALS.stone },
            { ...FLOOR_SKINS.brickPaving, material: FLOOR_MATERIALS.brick },
            FLOOR_SKINS.pressurePlate,
            { ...FLOOR_SKINS.glyphPlate, light: 0x7fd4ff },
            FLOOR_SKINS.lava,
            // The border: the same sandstone, so a phase can swap it alone
            { ...FLOOR_SKINS.sandstoneSlab, material: FLOOR_MATERIALS.stone, tint: 0xe8e0d8 },
        ],
        tiles: [
            { skin: 0 },
            { where: border, skin: 5 },
            {
                where: { kind: "ring", inner: 5, outer: 6.5, square: true, cy: 14 },
                skin: 1,
                type: "fragile",
            },
            { where: at(11, 5), skin: 2, trigger: "trap", type: "solid" },
            { where: { kind: "rect", x0: 8, y0: 7, x1: 14, y1: 9 }, group: "jaws" },
            { where: at(4, 18), skin: 2, trigger: "corner", type: "solid" },
            { where: { kind: "rect", x0: 2, y0: 20, x1: 5, y1: 22 }, group: "corner", rebuild: 6 },
            { where: at(18, 18), skin: 3, trigger: "key", type: "solid" },
            { where: at(18, 5), skin: 2, trigger: "storm", type: "solid" },
        ],
        drop: { ...base.drop, fragile: { hits: 3 } },
        patterns: { storm: ripple("middle", "cross", 0.1, 12) },
        triggers: {
            trap: { actions: [{ kind: "slam", group: "jaws" }], cooldown: 4, message: "Click!" },
            corner: {
                actions: [{ kind: "drop", group: "corner" }],
                cooldown: 10,
                message: "The corner gives way!",
            },
            key: {
                actions: [{ kind: "arm", trigger: "storm" }],
                once: true,
                message: "Something unlocks in the south-east.",
            },
            storm: {
                actions: [{ kind: "pattern", pattern: "storm", delay: 1 }],
                armed: false,
                cooldown: 12,
                message: "The floor answers!",
            },
        },
        phases: {
            molten: {
                skins: [[5, 4]],
                message: "The edges melt!",
                script: [
                    beat(2, ripple("player", "cross", 0.12, 8)),
                    beat(7, bold(side("both", 0.12))),
                    { at: 13, action: { kind: "phase", phase: "calm" } },
                ],
                loopSeconds: 14,
            },
            calm: { skins: [[4, 5]], message: "The edges cool.", script: calm, loopSeconds: 34 },
        },
        script: calm,
        loopSeconds: 34,
    };
}

// Terraces: a raised platform with a dais on it, ramps up to them, a sunken corner with a ramp
// down, and pillars that stop shots and hide whoever's behind them (FloorTileRuleDef.height,
// ramp; the pillar type). There are chickens and goblins here, to shoot past the pillars.
export function createTerraces(rect: Rect): FloorDef {
    const base = createWardensFloor(rect);
    const columns: FloorShapeDef = {
        kind: "union",
        of: [at(3, 12), at(19, 12), at(19, 21), at(3, 21)],
    };
    return {
        ...base,
        skins: [
            { ...FLOOR_SKINS.greySlab, material: FLOOR_MATERIALS.stone },
            { ...FLOOR_SKINS.claySlab, material: FLOOR_MATERIALS.stone },
            { ...FLOOR_SKINS.sandstoneSlab, material: FLOOR_MATERIALS.stone },
            { ...FLOOR_SKINS.stonePillar, under: 0 },
            { ...FLOOR_SKINS.tombsPillar, under: 0 },
            // The sunken corner: a stone with a diamond set in it (the dark tile's three times the
            // triangles)
            FLOOR_SKINS.stoneTile,
        ],
        tiles: [
            { skin: 0 },
            { where: { kind: "rect", x0: 7, y0: 13, x1: 15, y1: 20 }, skin: 1, height: 0.5 },
            { where: { kind: "rect", x0: 10, y0: 16, x1: 12, y1: 18 }, skin: 2, height: 1 },
            { where: at(11, 12), skin: 1, ramp: "north" },
            { where: at(6, 16), skin: 1, ramp: "east" },
            { where: at(11, 15), skin: 2, ramp: "north" },
            {
                where: { kind: "rect", x0: 2, y0: 2, x1: 6, y1: 6 },
                skin: 5,
                height: -0.4,
                type: "reinforced",
            },
            { where: at(4, 7), skin: 5, ramp: "north", type: "reinforced" },
            { where: columns, skin: 3, type: "pillar" },
            {
                where: { kind: "rect", x0: 16, y0: 5, x1: 17, y1: 6 },
                skin: 4,
                type: "pillar",
                slab: [2, 2],
            },
        ],
        script: [
            beat(3, side("east", 0.14), "The terraces rumble..."),
            beat(9, side("west", 0.14)),
            beat(15, ripple("middle", "cross", 0.14, 12)),
            beat(21, sweep(0.12, 3)),
            beat(27, holes(3)),
            beat(31, ripple("player", "diagonal", 0.12, 9)),
            beat(37, { kind: "restore", rowSeconds: 0.08 }),
        ],
        loopSeconds: 41,
    };
}
