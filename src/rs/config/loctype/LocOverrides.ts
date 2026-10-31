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
]);
