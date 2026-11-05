import type { FloorSkinDef } from "./types";

// Ready-made tile skins for floors (FloorDef.skins), by name: put them in a floor's skins and
// pick them by index in its tiles rules. All are opaque and a tile across, checked in the game;
// many of the cache's 1 by 1 floor models are see-through overlays or invisible hitboxes, so a
// new one wants looking at before it's added here.

// The Wardens' slab (spotanim 2220, model 45299): its top is the cache's colours 280, 274 and 267
// (a dark red-brown); these recolour them, a shade lighter to darker
const slabTop = (light: number, mid: number, dark: number): [number, number][] => [
    [280, light],
    [274, mid],
    [267, dark],
];

// The cache's "Floor" 20624 (model 21370): grooved paving, its colours 16656, 16425 and 10398 (a
// green-grey) recoloured
const paving = (stone: number, joints: number, dark: number): [number, number][] => [
    [16656, stone],
    [16425, joints],
    [10398, dark],
];

export const FLOOR_SKINS = {
    // The Wardens' own slab, rising with its own animation
    wardensSlab: { spotAnim: 2220 },
    // The same slab in other stone: the Sepulchre's cold blue-grey, plain grey, sandstone and a
    // red clay (a slab's shape, not bricks: for bricks see brickPaving)
    sepulchreSlab: { spotAnim: 2220, recolor: slabTop(37278, 37272, 37265) },
    greySlab: { spotAnim: 2220, recolor: slabTop(40, 34, 27) },
    sandstoneSlab: { spotAnim: 2220, recolor: slabTop(7464, 7458, 7451) },
    claySlab: { spotAnim: 2220, recolor: slabTop(1566, 1560, 1553) },
    // Paving: grey flagstones and red bricks (the same grooved paving, recoloured), and
    // octagonal paving as the cache has it
    flagstones: { loc: 20624, recolor: paving(36, 48, 28) },
    brickPaving: { loc: 20624, recolor: paving(1566, 44, 1554) },
    octagonPaving: { loc: 20633 },
    // Stone tiles: plain white marble, a cream stone, a dark ornate tile, a gold star on blue, a
    // stone with a diamond set in it, and a round grey one
    marble: { loc: 13686 },
    creamStone: { loc: 38825 },
    darkTile: { loc: 53349 },
    starTile: { loc: 38447 },
    stoneTile: { loc: 38822 },
    roundTile: { loc: 34874 },
    // The Tombs' pressure plates: gold glyphs on stone
    pressurePlate: { loc: 45345 },
    glyphPlate: { loc: 45349 },
    // An inactive rune, a decal to lie on another skin (FloorSkinDef.under)
    rune: { loc: 56393 },
    // Pillars, for a floor's pillar tiles (FloorTileType "pillar"): a round stone column on 1
    // tile, and the Tombs' gold-banded pillar on a 2 by 2 slab
    stonePillar: { loc: 7016 },
    tombsPillar: { loc: 45582, size: 2 },
} satisfies Record<string, FloorSkinDef>;
