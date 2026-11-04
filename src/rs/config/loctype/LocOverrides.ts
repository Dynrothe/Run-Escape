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
]);
