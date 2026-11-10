// Locs a ScapeRune map needs that the cache doesn't quite have. A map places a loc by id and
// nothing more, so the only way to get a bigger pumpkin onto one is to change the type. Every
// thread reads this, which is why it's a constant and not sent to them. Only use ids that are
// placed nowhere in the real world (world-index.ts), or that scenery changes too.
export type LocOverride = {
    models?: number[];
    // 128 is as the model was made
    size?: number;
    // Blocks walking, not projectiles, whatever the loc did (false: blocks nothing)
    solid?: boolean;
    // Keeps the model's own size, rather than 128 (or size) on every axis
    ownSize?: boolean;
    // Lifts the model this far off the ground, in scene units (128 to a tile), for what floats
    // (below 0, sinks it)
    height?: number;
};

// The Wardens' room's floor (the Tombs of Amascut): the plane under the room's, which is what
// OSRS shows through its hidden floor, brought up to it (maps/tombsOfAmascut.ts). The room's own
// tiles say what's walkable, so they block nothing; the tall ones stand under the room's raised
// border, so they're sunk by its height (13 height units, 104 scene units), as they were under it.
// The cache places them only there.
const WARDENS_FLOOR: [number, LocOverride][] = [
    ...[45585, 45586, 45589, 45593, 45594, 45595, 45596, 45597, 45627, 45643, 45644, 45645].map(
        (id): [number, LocOverride] => [id, { solid: false }],
    ),
    ...[45590, 45591, 45592, 45599, 45601, 45603].map((id): [number, LocOverride] => [
        id,
        { solid: false, height: -104 },
    ]),
];

// Akkha's arena's floor (the Tombs of Amascut): in the cache its stone pieces stand on the plane
// under the arena's, up to its floor. With that plane brought down to the ground they're sunk to
// it, their tops just over it, and block nothing (the floor's own tiles say what's walkable): the
// platform's pieces (6 tiles tall) and its outer ring's (6.9)
const AKKHA_FLOOR: [number, LocOverride][] = [
    ...Array.from({ length: 24 }, (_, i): [number, LocOverride] => [
        45872 + i,
        { height: -760, ownSize: true, solid: false },
    ]),
    ...Array.from({ length: 142 }, (_, i): [number, LocOverride] => [
        45896 + i,
        { height: -876, ownSize: true, solid: false },
    ]),
];

// Models drawn with fewer triangles (ModelData.simplify), by model id: the share of faces kept,
// and whether the model's a piece that meets others at its tile's edges. The Scar's brain
// (maps/scar.ts) is thousands of one-tile pieces of 340 to 520 triangles each, lumps painted in
// face colours: a view of its rift's island was 180k triangles, for a phone's 69k all in. A
// quarter of them, its smallest edges gone, reads the same in the dark. The walls (types 0, 1 and
// 9 of 49223, and 49224's) and the rims' tops (49225 to 49227, 49232 to 49235); its black filler
// (49236), unlit, to a fifth whatever its edges do. Its kit, at two fifths: nerves (49357 to 49368), brain matter (49351
// to 49356), broken pillars (49239, 49240) and the Closed Passage (49206)
export const MODEL_SIMPLIFY: Map<number, { keep: number; seams: boolean }> = new Map([
    ...[48881, 48885, 48876, 48884, 48889, 48877].map(
        (id): [number, { keep: number; seams: boolean }] => [id, { keep: 0.2, seams: true }],
    ),
    ...[48891, 48878, 48882, 48880].map((id): [number, { keep: number; seams: boolean }] => [
        id,
        { keep: 0.12, seams: true },
    ]),
    [48875, { keep: 0.2, seams: false }],
    ...[
        49177, 49176, 49170, 49180, 49181, 49173, 49171, 48469, 48466, 49172, 49182, 49178, 48879,
        49179,
    ].map((id): [number, { keep: number; seams: boolean }] => [id, { keep: 0.4, seams: false }]),
]);

export const LOC_OVERRIDES: Map<number, LocOverride> = new Map([
    ...AKKHA_FLOOR,
    ...WARDENS_FLOOR,
    // The item's pumpkin, the only plain one in the cache: 0.33 of a tile, so from 0.8 to 1.5
    // here, for a field that didn't all ripen at once
    [46263, { models: [2591], size: 320, solid: true }],
    [46264, { models: [2591], size: 384, solid: true }],
    [46272, { models: [2591], size: 448, solid: true }],
    [46266, { models: [2591], size: 576, solid: true }],
    // A carved one, 1.2 tiles
    [46267, { models: [46664], size: 384, solid: true }],
    // The Nightmare's dream's sleepers, which hang in the dark round her arena: in the cache
    // they stand on an upper level over the void, so here they're lifted a tile or two
    [37732, { height: 200 }],
    [37733, { height: 150 }],
    [37734, { height: 240 }],
    [37735, { height: 170 }],
    [37736, { height: 220 }],
    [37737, { height: 190 }],
    // The Hallowed Sepulchre's tall wall (Floor 3's), which the cache stands on a level under each
    // walkway, rising 4 tiles to its edge. A map draws one level, so here it hangs the 4 tiles
    // down from the walkway's edge instead (maps/owlsCourt.ts). The cache places it only there.
    // 4 units further: its top is a flat cap over the tile, which at the floor's height and
    // priority z-fought the plain floor tiles as the camera moved; the edge's lip hides the step.
    [38924, { height: -516 }],
    // A Sepulchre wizard statue (the Owl's Court's bridge): the plate in front of it is flat on the
    // floor, so it z-fought the floor tile under it; 2 units up it doesn't
    [38417, { height: 2 }],
    // The Sepulchre's great owl (the Owl's Court's rims and dais): its plinth's steps are every 2
    // units up from the floor, one in a plane with the raised edge of the stone tile under it
    // (38198, 6 units up), so they z-fought (check-coplanar.ts). An odd lift keeps every step off it.
    [38542, { height: 1 }],
]);
