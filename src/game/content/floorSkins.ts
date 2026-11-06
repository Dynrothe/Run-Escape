import type { FloorMaterialDef, FloorSkinDef } from "./types";

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

// What a skin throws up and sounds like as it rises, falls and cracks (FloorSkinDef.material).
// Spot animations and sounds from the cache; the sounds' names are the OSRS Wiki's, and which
// suits which material is a choice, not the game's own (none of these is a floor's in OSRS but
// stone's, the Wardens').
export const FLOOR_MATERIALS = {
    // The Wardens' own: the Sepulchre's dust (2699) up as it rises, the Tombs' blown dust (2184)
    // as it goes, a chip of their rock (2210) as it cracks; toa_pos_p3_rocks_hit and
    // toa_amp_rocks_fall_02
    stone: {
        rise: { spotAnim: 2699, sound: 6555, scale: 1.6 },
        fall: { spotAnim: 2184, sound: 6572 },
        crack: { spotAnim: 2210, sound: 6555, scale: 0.8 },
    },
    // Bricks: the rockfall's tumble (451, Jad's and the Kalphite Queen's falling rocks) as it goes,
    // with the sound of collapsing pillars (1659) and the Tombs' dust as it cracks
    brick: {
        rise: { spotAnim: 2699, sound: 6555, scale: 1.2 },
        fall: { spotAnim: 451, sound: 1659, scale: 0.5 },
        crack: { spotAnim: 2184, sound: 1659, scale: 0.7 },
    },
    // Ice: Ice Burst's impact (363, ice_burst_impact 170) as it rises and cracks, and Ice
    // Barrage's (369, ice_barrage_impact 168) as it shatters and goes
    ice: {
        rise: { spotAnim: 363, sound: 170, scale: 0.6 },
        fall: { spotAnim: 369, sound: 168, scale: 0.6 },
        crack: { spotAnim: 363, sound: 170, scale: 0.8 },
    },
    // Lava: embers (2246) drifting up as it rises and goes, with the Wardens' stone sounds
    lava: {
        rise: { spotAnim: 2246, sound: 6555 },
        fall: { spotAnim: 2246, sound: 6572 },
        crack: { spotAnim: 2246, sound: 6555 },
    },
} satisfies Record<string, FloorMaterialDef>;

// The cache's flat tile of lava rock (loc 747: 18 triangles, texture 15, its top 0.13 tiles up)
// with another texture, sunk to be flush with the floor
const texturedTile = (texture: number) => ({
    loc: 747,
    retexture: [[15, texture]] as [number, number][],
    height: -0.13,
});

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
    // Tiles that do something (FloorEffect), all the cache's own flat textured tile (loc 747, a
    // tile of lava rock, 18 triangles) with its texture swapped, sunk so its top's at the floor's.
    // Lava: a black crust with molten cracks that creep (texture 59, which scrolls), glowing and
    // pulsing slowly, bright in its seams, embers drifting up off some of it; it burns.
    lava: {
        ...texturedTile(59),
        tint: 0xd8885a,
        glow: 0.02,
        pulse: 0.14,
        light: 0xff7a1a,
        effect: "burn",
        material: FLOOR_MATERIALS.lava,
        idle: { spotAnim: 2246, every: 2.4, share: 4, scale: 0.8 },
    },
    // Ice: pale blue, glassy streaks (texture 53), and you slide on it
    ice: { ...texturedTile(53), effect: "ice", material: FLOOR_MATERIALS.ice },
    // Mud: dark brown earth (texture 32), slow going
    mud: { ...texturedTile(32), tint: 0xb0a090, effect: "slow" },
    // Sand: dunes (texture 38), slow going
    sand: { ...texturedTile(38), effect: "slow" },
    // A glyph that heals whoever's on it: the rune decal, lit green (give it a skin under it)
    healGlyph: { loc: 56393, light: 0x6dff8e, effect: "heal" },
    // A speed plate: the Tombs' glyph plate, lit a cold blue
    speedPlate: { loc: 45349, light: 0x7fd4ff, effect: "haste" },
} satisfies Record<string, FloorSkinDef>;
