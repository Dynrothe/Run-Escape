// Locs a ScapeRune map needs that the cache doesn't quite have. A map places a loc by id and
// nothing more, so the only way to get a bigger pumpkin onto one is to change the type. Every
// thread reads this, which is why it's a constant and not sent to them. Only use ids that are
// placed nowhere in the real world (world-index.ts), or that scenery changes too.
export type LocOverride = {
    models?: number[];
    // 128 is as the model was made
    size?: number;
    // Blocks walking, not projectiles, whatever the loc did
    solid?: boolean;
    // Lifts the model this far off the ground, in scene units (128 to a tile), for what floats
    height?: number;
};

export const LOC_OVERRIDES: Map<number, LocOverride> = new Map([
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
