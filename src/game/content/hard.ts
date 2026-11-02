import { MapDef } from "./types";

// Hard mode: a beaten map again with everything on it tougher. Enemies have
// more hitpoints and hit harder (by how much is the map's own), more of them
// come at once, there are two elites where there'd be one, and bosses enrage
// sooner and attack faster. It pays more coins, and it can be endless too.

// What a map's enemies are multiplied by when it doesn't set its own (MapDef's
// hard)
const HARD_SCALE = { hp: 1.6, damage: 1.35 };

// Multiplies the waves' spawn rate and how many are about at once
export const HARD_CROWD = 1.25;

// Multiplies the experience in enemies' bones: a bigger crowd drops more of
// them, so a run wouldn't fall behind on levels otherwise
export const HARD_XP = 0.9;

// Multiplies the coins a run finds. Modest, as the extra elites' caskets are
// worth a lot on top of it: at 1.5, a full run paid about 2.7 times a normal one.
export const HARD_COINS = 1.25;

// How many elites come at each of the map's elite events
export const HARD_ELITES = 2;

// Bosses enrage below this fraction of their hitpoints (half on a normal run)
export const HARD_ENRAGE_AT = 0.65;

// Multiplies the time between a boss's attacks
export const HARD_BOSS_INTERVAL = 0.85;

// What hard mode multiplies a map's enemies' hitpoints and damage by
export function getHardScale(map: MapDef): { hp: number; damage: number } {
    return map.hard ?? HARD_SCALE;
}
