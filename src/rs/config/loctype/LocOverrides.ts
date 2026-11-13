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
    // Blocks walking, not projectiles, whatever the loc did (false: blocks nothing)
    solid?: boolean;
    // Blocks nothing, whatever the loc did (a loc of our own: rubble to walk over)
    walkable?: boolean;
    // Keeps the model's own size, rather than 128 (or size) on every axis
    ownSize?: boolean;
    // Lifts the model this far off the ground, in scene units (128 to a tile), for what floats
    // (below 0, sinks it)
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
// WALKABLE_LOCS + id is that cache loc blocking nothing (getWalkableLoc), and
// WALKABLE_CHARRED_LOCS + id the same burnt: the Battle for Varrock's fires and dead, walked
// through (scaperune/maps/battleForVarrock.ts)
export const WALKABLE_LOCS = CHARRED_LOCS + (1 << 19);
export const WALKABLE_CHARRED_LOCS = WALKABLE_LOCS + (1 << 18);
const LAST_LOC = (1 << 21) - 1;
// Every cache loc id is under this, so each range of ours has room for all of them
const CACHE_LOCS = 1 << 18;
// A ruined city wall's breach (scaperune/ruins.ts), from Falador's: its west wall's broken gap
// (the Crumbling wall shortcut, 24222, at 2935, 3355), whose jagged ends and fallen bricks are its
// pale stone burnt to the dark of a burnt grey wall (Varrock's, 23795, comes out at about 15 of
// 127). The bricks block nothing, so a breach is still a way through. Each comes in a mirrored
// pair, as Falador places them: the jagged end 24220 is whole at its north end at rotation 0, and
// 24221 (its model mirrored) at its south, each with the bricks Falador lays in front of it (24219
// and 24218).
export const BROKEN_CITY_WALL: [number, number] = [DERIVED_LOCS, DERIVED_LOCS + 2];
export const BREACH_BRICKS: [number, number] = [DERIVED_LOCS + 1, DERIVED_LOCS + 3];
const FALADOR_STONE_BURNT = 0.18;

export function getCharredLoc(id: number): number {
    return CHARRED_LOCS + id;
}

// A cache loc, or a charred one (getCharredLoc), that blocks nothing
export function getWalkableLoc(id: number): number {
    if (id >= CHARRED_LOCS && id < DERIVED_LOCS) {
        return WALKABLE_CHARRED_LOCS + (id - CHARRED_LOCS);
    }
    if (id < 0 || id >= CACHE_LOCS) {
        throw new Error(
            `Loc ${id} isn't the cache's: give one of our own walkable in LOC_OVERRIDES`,
        );
    }
    return WALKABLE_LOCS + id;
}

// What a loc id's data is read from: its own, or for a loc of ours, the cache loc it's made from
export function getLocBase(id: number): number {
    if (id >= WALKABLE_CHARRED_LOCS && id <= LAST_LOC) {
        return id - WALKABLE_CHARRED_LOCS;
    }
    if (id >= WALKABLE_LOCS && id <= LAST_LOC) {
        return id - WALKABLE_LOCS;
    }
    if (id >= CHARRED_LOCS && id < DERIVED_LOCS) {
        return id - CHARRED_LOCS;
    }
    return LOC_OVERRIDES.get(id)?.base ?? id;
}

export function getLocOverride(id: number): LocOverride | undefined {
    if (id >= WALKABLE_CHARRED_LOCS && id <= LAST_LOC) {
        return { base: getLocBase(id), charred: true, walkable: true };
    }
    if (id >= WALKABLE_LOCS && id <= LAST_LOC) {
        return { base: getLocBase(id), walkable: true };
    }
    if (id >= CHARRED_LOCS && id < DERIVED_LOCS) {
        return { base: getLocBase(id), charred: true };
    }
    return LOC_OVERRIDES.get(id);
}
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
    ...BROKEN_CITY_WALL.map((id, i): [number, LocOverride] => [
        id,
        { base: [24220, 24221][i], charred: true, charLight: FALADOR_STONE_BURNT },
    ]),
    ...BREACH_BRICKS.map((id, i): [number, LocOverride] => [
        id,
        { base: [24219, 24218][i], charred: true, charLight: FALADOR_STONE_BURNT, walkable: true },
    ]),
]);
