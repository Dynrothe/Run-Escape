// Locs a ScapeRune map needs that the cache doesn't quite have. A map places a loc by id and
// nothing more, so the only way to get a bigger pumpkin onto one is to change the type. Every
// thread reads this, which is why it's a constant and not sent to them. Only use ids that are
// placed nowhere in the real world (world-index.ts), or that scenery changes too.
export type LocOverride = {
    // A loc of our own (an id from DERIVED_LOCS on): the cache's loc base, with the changes below.
    // Only what's set changes, unlike an override of a cache id, whose size goes to 128 unset.
    base?: number;
    models?: number[];
    // 128 is as the model was made
    size?: number;
    // Blocks walking, not projectiles, whatever the loc did
    solid?: boolean;
    // Blocks nothing, whatever the loc did (a loc of our own: rubble to walk over)
    walkable?: boolean;
    // Lifts the model this far off the ground, in scene units (128 to a tile), for what floats
    height?: number;
    // Its tiles across and deep, and the animation it plays where it stands (a loc of our own)
    sizeX?: number;
    sizeY?: number;
    seq?: number;
    // Burnt: every colour of its models darkened and greyed (see CHARRED_LOCS), to charLight of
    // its lightness if set (a pale stone burnt as dark as a darker one)
    charred?: boolean;
    charLight?: number;
};

// Locs of our own, past every id the cache has. They're placed by ScapeRune maps only, so nothing
// in the real world changes. Ids stay under 2^21: the model caches key a loc by its id << 10.
// CHARRED_LOCS + id is that cache loc burnt (getCharredLoc): the same in every way but its
// colours, for a map in ruins (scaperune/ruins.ts).
export const CHARRED_LOCS = 1 << 20;
// Others made from a cache loc go from here, listed in LOC_OVERRIDES with a base
export const DERIVED_LOCS = CHARRED_LOCS + (1 << 18);
// A ruined city wall's breach (scaperune/ruins.ts), from Falador's: its west wall's broken gap
// (the Crumbling wall shortcut, 24222, at 2935, 3355), whose jagged ends (24220) and fallen
// bricks (24218) are its pale stone burnt to the dark of a burnt grey wall (Varrock's, 23795,
// comes out at about 15 of 127). The bricks block nothing, so a breach is still a way through.
export const BROKEN_CITY_WALL = DERIVED_LOCS;
export const BREACH_BRICKS = DERIVED_LOCS + 1;
// A fire on its logs (4266) that blocks nothing: burnt Varrock's palace floor, where Yama's
// fight is, has fires on it that a hero has to be able to run through
export const WALKABLE_FIRE = DERIVED_LOCS + 2;
const FALADOR_STONE_BURNT = 0.18;

export function getCharredLoc(id: number): number {
    return CHARRED_LOCS + id;
}

// What a loc id's data is read from: its own, or for a loc of ours, the cache loc it's made from
export function getLocBase(id: number): number {
    if (id >= CHARRED_LOCS && id < DERIVED_LOCS) {
        return id - CHARRED_LOCS;
    }
    return LOC_OVERRIDES.get(id)?.base ?? id;
}

export function getLocOverride(id: number): LocOverride | undefined {
    if (id >= CHARRED_LOCS && id < DERIVED_LOCS) {
        return { base: getLocBase(id), charred: true };
    }
    return LOC_OVERRIDES.get(id);
}

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
    [BROKEN_CITY_WALL, { base: 24220, charred: true, charLight: FALADOR_STONE_BURNT }],
    [BREACH_BRICKS, { base: 24218, charred: true, charLight: FALADOR_STONE_BURNT, walkable: true }],
    [WALKABLE_FIRE, { base: 4266, walkable: true }],
]);
